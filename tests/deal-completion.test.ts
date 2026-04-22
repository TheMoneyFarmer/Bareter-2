import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Bareter is now free for everyone — the success-fee / Stripe checkout path
// has been retired from the deal lifecycle. This suite walks two users
// through proposal → acceptance → in-progress → delivery proof → mutual
// completion and asserts that:
//   • the deal ends up in the "completed" state, and
//   • no payment surface (success fee field, Stripe checkout, fee UI) ever
//     appears in the request/response cycle or in the deal-detail page.
//
// If any future change re-introduces fee gating into the completion path,
// one of these assertions should fail.

process.env.SESSION_SECRET = "test-deal-completion-secret";
process.env.NODE_ENV = "test";

// ---------------------------------------------------------------------------
// Mock heavy server dependencies so we can register the real route table
// against an in-memory storage layer.
// ---------------------------------------------------------------------------

vi.mock("../server/db", () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  },
  db: {},
}));

vi.mock("connect-pg-simple", () => ({
  default: () =>
    class FakePgSession {
      constructor(_opts: unknown) {}
      on() {}
    },
}));

// Replace express-session with a tiny header-driven middleware so the test
// can switch between users by setting `x-test-user-id` on each request.
vi.mock("express-session", () => {
  const factory = () => (req: any, _res: any, next: any) => {
    const userId = req.headers["x-test-user-id"];
    req.session = {
      userId: userId ? String(userId) : undefined,
      save: (cb?: (err?: Error) => void) => cb && cb(),
      destroy: (cb?: (err?: Error) => void) => cb && cb(),
      regenerate: (cb?: (err?: Error) => void) => cb && cb(),
    };
    next();
  };
  return { default: factory };
});

// Identity verification is gated by Didit in production; assume both sides
// are verified so we can exercise the deal lifecycle.
vi.mock("../server/diditClient", () => ({
  isUserVerified: () => true,
  verifyWebhookSignature: () => true,
  createKycSession: async () => ({ url: "https://example.test/kyc", sessionId: "" }),
  createKybSession: async () => ({ url: "https://example.test/kyb", sessionId: "" }),
}));

// In-memory storage that implements just the methods the deal lifecycle
// touches. Every other method throws so accidental coupling is loud.
type AnyRecord = Record<string, any>;

const users = new Map<string, AnyRecord>();
const listings = new Map<string, AnyRecord>();
const deals = new Map<string, AnyRecord>();
const notifications: AnyRecord[] = [];
const messages: AnyRecord[] = [];

function notImplemented(name: string) {
  return () => {
    throw new Error(`storage.${name} should not be called in this test`);
  };
}

const inMemoryStorage = new Proxy(
  {
    async getUser(id: string) {
      return users.get(id);
    },
    async getListing(id: string) {
      return listings.get(id);
    },
    async createDeal(data: AnyRecord) {
      const id = randomUUID();
      const deal = {
        id,
        dealNumber: `BTR-${id.slice(0, 8).toUpperCase()}`,
        seekerListingId: null,
        providerListingId: null,
        timeline: null,
        deliverables: null,
        penalties: null,
        seekerProofUrl: null,
        providerProofUrl: null,
        seekerCompleted: false,
        providerCompleted: false,
        successFee: null,
        stripePaymentId: null,
        contractPdfUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      deals.set(id, deal);
      return deal;
    },
    async updateDeal(id: string, data: AnyRecord) {
      const deal = deals.get(id);
      if (!deal) return undefined;
      const updated = { ...deal, ...data, updatedAt: new Date() };
      deals.set(id, updated);
      return updated;
    },
    async getDeal(id: string) {
      return deals.get(id);
    },
    async getDealWithUsers(id: string) {
      const deal = deals.get(id);
      if (!deal) return undefined;
      return {
        ...deal,
        seeker: users.get(deal.seekerId),
        provider: users.get(deal.providerId),
      };
    },
    async createNotification(data: AnyRecord) {
      const notif = { id: randomUUID(), isRead: false, createdAt: new Date(), ...data };
      notifications.push(notif);
      return notif;
    },
    async createMessage(data: AnyRecord) {
      const msg = { id: randomUUID(), isRead: false, createdAt: new Date(), ...data };
      messages.push(msg);
      return msg;
    },
    async getMessagesByDeal(dealId: string) {
      return messages
        .filter((m) => m.dealId === dealId)
        .map((m) => ({ ...m, sender: users.get(m.senderId) }));
    },
    async markMessagesAsRead() {
      // no-op
    },
  },
  {
    get(target, prop: string) {
      if (prop in target) return (target as any)[prop];
      return notImplemented(prop);
    },
  },
);

vi.mock("../server/storage", () => ({
  storage: inMemoryStorage,
}));

// Register routes against a fresh app. Done once for the whole suite.
let app: express.Express;

beforeAll(async () => {
  // Defer the import until after the mocks above are installed so the route
  // module picks up the in-memory storage and the fake session middleware.
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
});

function createUsers() {
  const seekerId = randomUUID();
  const providerId = randomUUID();
  users.set(seekerId, {
    id: seekerId,
    email: "seeker@example.com",
    fullName: "Seeker User",
    accountType: "individual",
    kycStatus: "APPROVED",
    kybStatus: "NOT_STARTED",
    isPaused: false,
    isAdmin: false,
  });
  users.set(providerId, {
    id: providerId,
    email: "provider@example.com",
    fullName: "Provider User",
    accountType: "individual",
    kycStatus: "APPROVED",
    kybStatus: "NOT_STARTED",
    isPaused: false,
    isAdmin: false,
  });
  return { seekerId, providerId };
}

function createListing(ownerId: string) {
  const id = randomUUID();
  listings.set(id, {
    id,
    userId: ownerId,
    title: "Web design package",
    description: "Landing page + 3 inner pages",
    retailValue: "5000.00",
    status: "active",
  });
  return id;
}

function asUser(req: request.Test, userId: string) {
  return req.set("x-test-user-id", userId);
}

function assertNoPaymentSurface(payload: AnyRecord | AnyRecord[]) {
  const items = Array.isArray(payload) ? payload : [payload];
  for (const item of items) {
    if (item == null) continue;
    // The deal row may carry these columns from the schema, but they must
    // remain unset for a free-platform completion. Surfacing a Stripe
    // payment id or a non-null successFee would imply the fee path was hit.
    if ("successFee" in item) {
      expect(item.successFee, "successFee must remain null").toBeNull();
    }
    if ("stripePaymentId" in item) {
      expect(item.stripePaymentId, "stripePaymentId must remain null").toBeNull();
    }
    // Defensive: no field should look like a Stripe checkout URL or a
    // pay/fee CTA descriptor leaked from the API.
    const stringy = JSON.stringify(item).toLowerCase();
    expect(stringy).not.toMatch(/checkout\.stripe\.com/);
    expect(stringy).not.toMatch(/pay success fee/);
  }
}

describe("Deal completion runs end-to-end with no payment step", () => {
  it("walks two users from proposal to completed without surfacing a fee", async () => {
    const { seekerId, providerId } = createUsers();
    const listingId = createListing(providerId);

    // 1. Seeker proposes a trade against the provider's listing.
    const propose = await asUser(
      request(app).post("/api/deals"),
      seekerId,
    ).send({
      providerListingId: listingId,
      seekerOffer: "Logo + brand kit",
      seekerValue: "5000.00",
    });
    expect(propose.status).toBe(200);
    expect(propose.body.state).toBe("proposed");
    expect(propose.body.seekerId).toBe(seekerId);
    expect(propose.body.providerId).toBe(providerId);
    assertNoPaymentSurface(propose.body);
    const dealId: string = propose.body.id;

    // 2a. Seeker should NOT be able to accept their own proposal.
    const wrongAccept = await asUser(
      request(app).patch(`/api/deals/${dealId}`),
      seekerId,
    ).send({ state: "accepted" });
    expect(wrongAccept.status).toBe(403);

    // 2b. Provider accepts the proposal.
    const accept = await asUser(
      request(app).patch(`/api/deals/${dealId}`),
      providerId,
    ).send({ state: "accepted" });
    expect(accept.status).toBe(200);
    expect(accept.body.state).toBe("accepted");
    assertNoPaymentSurface(accept.body);

    // 3. Either side moves the deal into in-progress.
    const start = await asUser(
      request(app).patch(`/api/deals/${dealId}`),
      seekerId,
    ).send({ state: "in_progress" });
    expect(start.status).toBe(200);
    expect(start.body.state).toBe("in_progress");
    assertNoPaymentSurface(start.body);

    // 4. Each side uploads delivery proof — only their own side.
    const seekerProof = await asUser(
      request(app).patch(`/api/deals/${dealId}`),
      seekerId,
    ).send({ seekerProofUrl: "https://uploads.example.com/seeker.png" });
    expect(seekerProof.status).toBe(200);
    expect(seekerProof.body.seekerProofUrl).toBe(
      "https://uploads.example.com/seeker.png",
    );

    // Provider cannot overwrite the seeker's proof URL.
    const crossProof = await asUser(
      request(app).patch(`/api/deals/${dealId}`),
      providerId,
    ).send({ seekerProofUrl: "https://attacker.example.com/hijack.png" });
    expect(crossProof.status).toBe(403);

    const providerProof = await asUser(
      request(app).patch(`/api/deals/${dealId}`),
      providerId,
    ).send({ providerProofUrl: "https://uploads.example.com/provider.png" });
    expect(providerProof.status).toBe(200);
    expect(providerProof.body.providerProofUrl).toBe(
      "https://uploads.example.com/provider.png",
    );

    // 5. Move into delivery_proof so both can confirm completion.
    const moveToProof = await asUser(
      request(app).patch(`/api/deals/${dealId}`),
      providerId,
    ).send({ state: "delivery_proof" });
    expect(moveToProof.status).toBe(200);
    expect(moveToProof.body.state).toBe("delivery_proof");

    // 6a. Seeker confirms — deal stays in delivery_proof until both confirm.
    const seekerConfirm = await asUser(
      request(app).patch(`/api/deals/${dealId}`),
      seekerId,
    ).send({ seekerCompleted: true });
    expect(seekerConfirm.status).toBe(200);
    expect(seekerConfirm.body.seekerCompleted).toBe(true);
    expect(seekerConfirm.body.providerCompleted).toBe(false);
    expect(seekerConfirm.body.state).toBe("delivery_proof");
    assertNoPaymentSurface(seekerConfirm.body);

    // Seeker cannot mark provider's side complete.
    const crossComplete = await asUser(
      request(app).patch(`/api/deals/${dealId}`),
      seekerId,
    ).send({ providerCompleted: true });
    expect(crossComplete.status).toBe(403);

    // 6b. Provider confirms — auto-completion should kick in.
    const completionNotificationsBefore = notifications.filter(
      (n) => n.relatedDealId === dealId && n.title === "Trade complete",
    ).length;
    const providerConfirm = await asUser(
      request(app).patch(`/api/deals/${dealId}`),
      providerId,
    ).send({ providerCompleted: true });
    expect(providerConfirm.status).toBe(200);
    expect(providerConfirm.body.providerCompleted).toBe(true);
    expect(providerConfirm.body.seekerCompleted).toBe(true);
    expect(providerConfirm.body.state).toBe("completed");
    assertNoPaymentSurface(providerConfirm.body);

    // Both parties should be notified the deal closed so they remember to
    // come back and rate each other.
    const completionNotifications = notifications.filter(
      (n) => n.relatedDealId === dealId && n.title === "Trade complete",
    );
    expect(completionNotifications.length - completionNotificationsBefore).toBe(2);
    const notifiedUserIds = completionNotifications.map((n) => n.userId).sort();
    expect(notifiedUserIds).toEqual([seekerId, providerId].sort());
    for (const notif of completionNotifications) {
      expect(notif.message.toLowerCase()).toContain("rating");
    }

    // Final read-back from both sides confirms the persisted state.
    const finalSeekerView = await asUser(
      request(app).get(`/api/deals/${dealId}`),
      seekerId,
    );
    expect(finalSeekerView.status).toBe(200);
    expect(finalSeekerView.body.state).toBe("completed");
    assertNoPaymentSurface(finalSeekerView.body);

    const finalProviderView = await asUser(
      request(app).get(`/api/deals/${dealId}`),
      providerId,
    );
    expect(finalProviderView.status).toBe(200);
    expect(finalProviderView.body.state).toBe("completed");
    assertNoPaymentSurface(finalProviderView.body);
  });

  it("legacy fee checkout endpoint is not available", async () => {
    const { seekerId, providerId } = createUsers();
    const listingId = createListing(providerId);
    const propose = await asUser(
      request(app).post("/api/deals"),
      seekerId,
    ).send({
      providerListingId: listingId,
      seekerOffer: "Consulting hours",
      seekerValue: "1000.00",
    });
    expect(propose.status).toBe(200);
    const dealId: string = propose.body.id;

    // Both seeker and provider should see the checkout endpoint as gone.
    for (const userId of [seekerId, providerId]) {
      const checkout = await asUser(
        request(app).post(`/api/deals/${dealId}/checkout`),
        userId,
      ).send({});
      expect(checkout.status).toBe(404);
    }
  });

  it("deal-detail page does not render any payment / fee UI", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "client",
      "src",
      "pages",
      "deal-detail.tsx",
    );
    const source = fs.readFileSync(filePath, "utf8");
    const lower = source.toLowerCase();

    // None of the legacy fee surfaces should still be rendered. These
    // strings cover the previous CTA, the Stripe checkout integration, and
    // the success-fee informational card.
    expect(lower).not.toContain("pay success fee");
    expect(lower).not.toContain("success fee");
    expect(lower).not.toContain("stripe");
    expect(lower).not.toContain("checkout");
    // No generic payment prompts should slip back in either.
    expect(lower).not.toMatch(/\bpay\s+now\b/);
    expect(lower).not.toMatch(/\bpay\s+fee\b/);
  });
});
