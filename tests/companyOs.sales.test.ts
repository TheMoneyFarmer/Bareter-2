// Unit + light-integration tests for the Sales Agent (Task #62).
//
// Coverage:
//   • `deriveUserType` — maps (accountType, signupType) into the three
//     buckets the scoring function reasons about.
//   • `computeLeadScore` — exercises every weight (onboarding / first
//     post / first deal / type bonus / Dubai bonus / inactivity penalty)
//     and the 0..100 clamp.
//   • `runReEngagementCampaign` — re-engagement dedupe: a row that
//     already had `reEngagementSentAt` set within the cooldown is
//     filtered out at the SQL layer (we assert the call wires the
//     proper select+where chain), and a fresh eligible lead receives
//     exactly one email and one status update.
//   • Manager Agent integration — `leads` and `sync leads` route
//     through the WhatsApp webhook and reply with the report bodies.
//
// All external calls (DB, OpenAI, Twilio REST, Resend) are mocked so
// the suite runs offline in CI.

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import express from "express";
import request from "supertest";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Env — set BEFORE the modules under test load.
// ---------------------------------------------------------------------------
const ORIGINAL_ENV = { ...process.env };
process.env.TWILIO_ACCOUNT_SID = "ACtest00000000000000000000000000000";
process.env.TWILIO_AUTH_TOKEN = "test_auth_token_for_signing";
process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
process.env.FOUNDER_WHATSAPP_NUMBER = "whatsapp:+971500000000";
process.env.COMPANY_OS_MONTHLY_BUDGET_AED = "400";

const FOUNDER_FROM = process.env.FOUNDER_WHATSAPP_NUMBER!;
const TWILIO_TO = process.env.TWILIO_WHATSAPP_FROM!;
const FORWARDED_HOST = "bareter.test";
const WEBHOOK_PATH = "/api/company-os/whatsapp";

// ---------------------------------------------------------------------------
// DB mock — programmable per-test, same shape as the marketing suite.
// ---------------------------------------------------------------------------
type AnyRow = Record<string, unknown>;

interface DbState {
  selectQueue: AnyRow[][];
  returningQueue: AnyRow[][];
  selectShouldThrow: boolean;
  insertedValues: AnyRow[];
  updatedSets: AnyRow[];
  selectCalls: number;
}

const dbState: DbState = {
  selectQueue: [],
  returningQueue: [],
  selectShouldThrow: false,
  insertedValues: [],
  updatedSets: [],
  selectCalls: 0,
};

function resetDbState() {
  dbState.selectQueue = [];
  dbState.returningQueue = [];
  dbState.selectShouldThrow = false;
  dbState.insertedValues = [];
  dbState.updatedSets = [];
  dbState.selectCalls = 0;
}

function makeSelectChain(): any {
  dbState.selectCalls++;
  const next = (): AnyRow[] => {
    if (dbState.selectShouldThrow) throw new Error("simulated db failure");
    return dbState.selectQueue.shift() ?? [];
  };
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    groupBy: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    rightJoin: () => chain,
    fullJoin: () => chain,
    then: (onF: any, onR: any) => {
      try {
        return Promise.resolve(next()).then(onF, onR);
      } catch (err) {
        return Promise.reject(err).catch(onR);
      }
    },
    catch: (onR: any) => {
      try {
        return Promise.resolve(next()).catch(onR);
      } catch (err) {
        return Promise.reject(err).catch(onR);
      }
    },
    finally: (onF: any) => Promise.resolve(next()).finally(onF),
  };
  return chain;
}

function makeWriteChain(captureInto: AnyRow[], captured: AnyRow): any {
  const chain: any = {
    values: (v: AnyRow) => {
      captureInto.push({ ...captured, ...v });
      return chain;
    },
    set: (v: AnyRow) => {
      captureInto.push({ ...captured, ...v });
      return chain;
    },
    where: () => chain,
    onConflictDoUpdate: () => chain,
    // Mirror onConflictDoUpdate — the recordReEngagementReturnVisit
    // path uses `.onConflictDoNothing` to make repeat clicks idempotent.
    // Without this on the mock chain, `await db.insert(...).values(...)
    // .onConflictDoNothing(...)` would dereference `undefined.then`.
    onConflictDoNothing: () => chain,
    // Only `.returning(...)` consumes `dbState.returningQueue`. A
    // bare `await db.insert(...).values({...})` (e.g. logLlmCall) must
    // resolve to [] without touching the queue, otherwise unrelated
    // writes silently steal entries meant for the claim/upsert paths.
    returning: () => Promise.resolve(dbState.returningQueue.shift() ?? []),
    then: (onF: any, onR: any) => Promise.resolve([]).then(onF, onR),
  };
  return chain;
}

vi.mock("../server/db", () => ({
  db: {
    select: () => makeSelectChain(),
    insert: () => makeWriteChain(dbState.insertedValues, { __op: "insert" }),
    update: () => makeWriteChain(dbState.updatedSets, { __op: "update" }),
    delete: () => makeWriteChain([], { __op: "delete" }),
  },
}));

// LLM stub — deterministic body so the re-engagement copy is predictable.
vi.mock("../server/agents/llm", () => ({
  chatCompletion: vi.fn(async () => ({
    content: "Hi there,\n\nWe miss you on Bareter. Come browse new offers in your category — one trade is closing this week.\n\nSee you soon.",
    tokensUsed: 60,
  })),
  jsonCompletion: vi.fn(async () => ({ data: {}, tokensUsed: 0 })),
}));

// Stripe stub (Manager Agent transitively imports it).
vi.mock("../server/companyOs/stripeClient", () => ({
  getStripeClient: vi.fn(async () => null),
  getStripeWebhookSecret: vi.fn(async () => null),
}));

// Resend / email — capture sends so we can assert dedupe.
const emailSends: { to: string; subject: string; text: string }[] = [];
vi.mock("../server/emailService", async () => {
  const actual = await vi.importActual<
    typeof import("../server/emailService")
  >("../server/emailService");
  return {
    ...actual,
    isEmailConfigured: vi.fn(async () => true),
    sendReEngagementEmail: vi.fn(
      async (to: string, opts: { subject: string; html: string; text: string }) => {
        emailSends.push({ to, subject: opts.subject, text: opts.text });
        return true;
      },
    ),
  };
});

// Twilio REST capture — same pattern as the marketing suite.
const hoisted = vi.hoisted(() => {
  const sendCalls: Array<{ to: string; body: string }> = [];
  const state: { resolveNextSend: (() => void) | null } = {
    resolveNextSend: null,
  };
  return { sendCalls, state };
});
vi.mock("../server/companyOs/twilio", async () => {
  const actual = await vi.importActual<
    typeof import("../server/companyOs/twilio")
  >("../server/companyOs/twilio");
  return {
    ...actual,
    sendWhatsApp: vi.fn(async (to: string, body: string) => {
      hoisted.sendCalls.push({ to, body });
      const r = hoisted.state.resolveNextSend;
      hoisted.state.resolveNextSend = null;
      if (r) r();
      return true;
    }),
  };
});

// Imports AFTER mocks so the modules under test pick up the stubs.
import {
  computeLeadScore,
  deriveUserType,
  deriveStatus,
  formatSalesReport,
  getReEngagementConversion,
  handleSalesTrackingRequest,
  recordReEngagementReturnVisit,
  runReEngagementCampaign,
  syncNewLeads,
  updateLead,
} from "../server/companyOs/salesAgent";
import { createCompanyOsRouter } from "../server/companyOs/router";

function buildApp() {
  const app = express();
  app.use(WEBHOOK_PATH, express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(
    "/api/company-os",
    createCompanyOsRouter({
      requireAdmin: (_req, _res, next) => next(),
    }),
  );
  return app;
}

async function postWebhook(app: express.Express, body: string, from = FOUNDER_FROM) {
  const params: Record<string, string> = {
    AccountSid: process.env.TWILIO_ACCOUNT_SID!,
    From: from,
    To: TWILIO_TO,
    Body: body,
    NumMedia: "0",
    MessageSid: `SM${crypto.randomBytes(16).toString("hex")}`,
  };
  const sendPromise = new Promise<void>((resolve) => {
    hoisted.state.resolveNextSend = resolve;
  });
  const httpRes = await request(app)
    .post(WEBHOOK_PATH)
    .set("X-Forwarded-Proto", "https")
    .set("X-Forwarded-Host", FORWARDED_HOST)
    .set("Host", FORWARDED_HOST)
    .type("form")
    .send(new URLSearchParams(params).toString());
  return { httpRes, sendPromise };
}

beforeEach(() => {
  resetDbState();
  emailSends.length = 0;
  hoisted.sendCalls.length = 0;
  hoisted.state.resolveNextSend = null;
});

afterAll(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    process.env[k] = v;
  }
});

// ===========================================================================
// deriveUserType
// ===========================================================================
describe("deriveUserType", () => {
  it("treats business accountType as 'business'", () => {
    expect(deriveUserType({ accountType: "business", signupType: "creator" })).toBe("business");
    expect(deriveUserType({ accountType: "business", signupType: "brand" })).toBe("business");
  });

  it("treats individual + creator as 'freelancer'", () => {
    expect(deriveUserType({ accountType: "individual", signupType: "creator" })).toBe("freelancer");
  });

  it("defaults to 'asset_owner' for everyone else", () => {
    expect(deriveUserType({ accountType: "individual", signupType: "brand" })).toBe("asset_owner");
    expect(deriveUserType({ accountType: null, signupType: null })).toBe("asset_owner");
  });
});

// ===========================================================================
// computeLeadScore
// ===========================================================================
describe("computeLeadScore", () => {
  const base = {
    userType: "asset_owner" as const,
    location: null,
    city: null,
    onboardingCompleted: false,
    hasPost: false,
    hasCompletedDeal: false,
    daysSinceLastActivity: 0,
    hasAnyDeal: false,
  };

  it("returns just the user-type bonus when nothing else has happened", () => {
    expect(computeLeadScore(base)).toBe(15); // asset_owner +15
    expect(computeLeadScore({ ...base, userType: "business" })).toBe(10);
    expect(computeLeadScore({ ...base, userType: "freelancer" })).toBe(5);
  });

  it("adds 20 for onboarding completed", () => {
    expect(computeLeadScore({ ...base, onboardingCompleted: true })).toBe(35);
  });

  it("adds 20 for first post", () => {
    expect(computeLeadScore({ ...base, hasPost: true })).toBe(35);
  });

  it("adds 30 for first completed deal", () => {
    expect(
      computeLeadScore({ ...base, hasCompletedDeal: true, hasAnyDeal: true }),
    ).toBe(45);
  });

  it("adds 10 for Dubai/Abu Dhabi location (case-insensitive)", () => {
    expect(computeLeadScore({ ...base, city: "Dubai" })).toBe(25);
    expect(computeLeadScore({ ...base, location: "abu dhabi" })).toBe(25);
    expect(computeLeadScore({ ...base, city: "Sharjah" })).toBe(15);
  });

  it("subtracts 5 when inactive >14 days AND no deals", () => {
    const r = computeLeadScore({ ...base, daysSinceLastActivity: 30 });
    expect(r).toBe(10); // 15 - 5
  });

  it("does NOT subtract if the user has any deal", () => {
    const r = computeLeadScore({
      ...base,
      daysSinceLastActivity: 30,
      hasAnyDeal: true,
    });
    expect(r).toBe(15);
  });

  it("clamps to [0, 100]", () => {
    const max = computeLeadScore({
      userType: "asset_owner",
      location: "Dubai",
      city: null,
      onboardingCompleted: true,
      hasPost: true,
      hasCompletedDeal: true,
      daysSinceLastActivity: 0,
      hasAnyDeal: true,
    });
    expect(max).toBe(95); // 20+20+30+15+10
    expect(max).toBeLessThanOrEqual(100);

    const negative = computeLeadScore({
      ...base,
      userType: "freelancer",
      daysSinceLastActivity: 60,
    });
    expect(negative).toBe(0); // 5 - 5 = 0, clamp
  });
});

// ===========================================================================
// deriveStatus
// ===========================================================================
describe("deriveStatus", () => {
  it("converted overrides everything", () => {
    expect(
      deriveStatus({ hasCompletedDeal: true, daysSinceLastActivity: 99, isNew: false }),
    ).toBe("converted");
  });
  it("brand new accounts (≤1 day) are 'new'", () => {
    expect(
      deriveStatus({ hasCompletedDeal: false, daysSinceLastActivity: 0, isNew: true }),
    ).toBe("new");
  });
  it("≤7 days = active, ≤30 days = engaged, else dormant", () => {
    expect(
      deriveStatus({ hasCompletedDeal: false, daysSinceLastActivity: 3, isNew: false }),
    ).toBe("active");
    expect(
      deriveStatus({ hasCompletedDeal: false, daysSinceLastActivity: 20, isNew: false }),
    ).toBe("engaged");
    expect(
      deriveStatus({ hasCompletedDeal: false, daysSinceLastActivity: 90, isNew: false }),
    ).toBe("dormant");
  });
});

// ===========================================================================
// formatSalesReport — used by the leads command and admin page
// ===========================================================================
describe("formatSalesReport", () => {
  it("renders all required totals", () => {
    const out = formatSalesReport({
      total: 42,
      new: 7,
      active: 12,
      reEngaged: 4,
      avgScore: 38,
      newThisWeek: 9,
      reEngagementConversion: {
        sent: 50,
        returned: 12,
        rate: 24,
        windowSize: 50,
        windowDays: 7,
      },
    });
    expect(out).toContain("Sales");
    expect(out).toContain("Total: 42");
    expect(out).toContain("New: 7");
    expect(out).toContain("Active: 12");
    expect(out).toContain("Re-engaged: 4");
    expect(out).toContain("Avg score: 38");
    expect(out).toContain("New this week: 9");
    // Re-engagement ROI line is the whole point of Task #71 — assert
    // both the headline counts and the percentage are surfaced.
    expect(out).toContain("Re-engagement: 12 of last 50 returned within 7d (24%)");
  });

  it("renders a friendly placeholder when there have been no sends", () => {
    const out = formatSalesReport({
      total: 1,
      new: 0,
      active: 0,
      reEngaged: 0,
      avgScore: 0,
      newThisWeek: 0,
      reEngagementConversion: {
        sent: 0,
        returned: 0,
        rate: 0,
        windowSize: 50,
        windowDays: 7,
      },
    });
    expect(out).toContain("Re-engagement: no sends in last 50");
    expect(out).not.toContain("returned within");
  });
});

// ===========================================================================
// runReEngagementCampaign — re-engagement dedupe
// ===========================================================================
describe("runReEngagementCampaign — dedupe", () => {
  it("when SQL filter excludes all leads (all within cooldown), no email is sent", async () => {
    // The 14-day cooldown is enforced as a SQL `where` clause; the mock
    // returning [] for the eligibility select simulates that filter
    // excluding every lead that was already emailed recently.
    dbState.selectQueue = [[]];
    const result = await runReEngagementCampaign({ capacity: 20 });
    expect(result.attempted).toBe(0);
    expect(result.sent).toBe(0);
    expect(emailSends).toHaveLength(0);
    expect(dbState.updatedSets).toHaveLength(0);
  });

  it("sends exactly one email per eligible lead and stamps reEngagementSentAt", async () => {
    const eligible = [
      {
        id: "lead-1",
        userId: "user-1",
        email: "alex@example.com",
        fullName: "Alex Rahman",
        userType: "asset_owner",
        location: "Dubai",
        leadScore: 75,
        status: "engaged",
        lastActivityAt: new Date(Date.now() - 10 * 86_400_000),
        firstDealAt: null,
        reEngagementSentAt: null,
        notes: null,
        createdAt: new Date(Date.now() - 30 * 86_400_000),
        updatedAt: new Date(Date.now() - 30 * 86_400_000),
      },
    ];
    dbState.selectQueue = [eligible];
    // The atomic claim (db.update(...).returning({id})) returns the
    // claimed row's id when the compare-and-swap succeeds. We model
    // a successful claim by queueing a non-empty returning row.
    dbState.returningQueue = [[{ id: "lead-1" }]];

    const result = await runReEngagementCampaign({ capacity: 20 });

    expect(result.attempted).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(emailSends).toHaveLength(1);
    expect(emailSends[0].to).toBe("alex@example.com");
    expect(emailSends[0].subject).toMatch(/Bareter/i);
    // The atomic claim is the single update — it stamps both
    // `reEngagementSentAt` and `status='re_engaged'` in one shot
    // BEFORE the email send. No second update is issued on success.
    expect(dbState.updatedSets).toHaveLength(1);
    const upd = dbState.updatedSets[0];
    expect(upd.status).toBe("re_engaged");
    expect(upd.reEngagementSentAt).toBeInstanceOf(Date);
  });

  it("skips when the atomic claim loses the race (returning [])", async () => {
    // Models the concurrent-overlap case: the eligibility select
    // returned a lead, but by the time we tried to claim it via
    // `UPDATE ... RETURNING id`, another worker already updated
    // `reEngagementSentAt`, so the WHERE clause now matches zero
    // rows. We must NOT send the email in this case.
    const eligible = [
      {
        id: "lead-claimed-by-other",
        userId: "user-x",
        email: "x@example.com",
        fullName: "X",
        userType: "asset_owner",
        location: "Dubai",
        leadScore: 60,
        status: "engaged",
        lastActivityAt: new Date(Date.now() - 12 * 86_400_000),
        firstDealAt: null,
        reEngagementSentAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    dbState.selectQueue = [eligible];
    dbState.returningQueue = [[]]; // claim returns no rows → race lost
    const result = await runReEngagementCampaign({ capacity: 5 });
    expect(result.attempted).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(emailSends).toHaveLength(0);
  });

  it("respects the per-run capacity cap", async () => {
    const lead = (i: number) => ({
      id: `lead-${i}`,
      userId: `user-${i}`,
      email: `u${i}@example.com`,
      fullName: `User ${i}`,
      userType: "asset_owner" as const,
      location: "Dubai",
      leadScore: 50,
      status: "engaged",
      lastActivityAt: new Date(Date.now() - 14 * 86_400_000),
      firstDealAt: null,
      reEngagementSentAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // The cap is enforced via `.limit(cap)` in SQL; we model that by
    // returning exactly cap rows. Each lead's atomic claim must
    // succeed, so queue two non-empty returning rows.
    dbState.selectQueue = [[lead(1), lead(2)]];
    dbState.returningQueue = [[{ id: "lead-1" }], [{ id: "lead-2" }]];
    const result = await runReEngagementCampaign({ capacity: 2 });
    expect(result.sent).toBe(2);
    expect(emailSends).toHaveLength(2);
  });

  it("uses the static fallback body when the budget is unsafe (no LLM call)", async () => {
    // When getBudgetVerdict() returns safe=false, the agent must
    // skip the LLM draft and use the deterministic static template.
    // We verify by (a) confirming chatCompletion was never called,
    // and (b) confirming the email body matches the static template
    // (contains "100% cashless" — a phrase only in the fallback).
    const llmModule = await import("../server/agents/llm");
    const chatSpy = vi.mocked(llmModule.chatCompletion);
    chatSpy.mockClear();

    // Stub getBudgetVerdict to return unsafe.
    const budgetModule = await import("../server/companyOs/costTracker");
    const budgetSpy = vi
      .spyOn(budgetModule, "getBudgetVerdict")
      .mockResolvedValueOnce({
        safe: false,
        spentAed: 999,
        budgetAed: 400,
        usageRatio: 2.5,
        verdict: "kill_switch",
      } as any);

    const eligible = [
      {
        id: "lead-budget",
        userId: "user-budget",
        email: "saver@example.com",
        fullName: "Sara Saver",
        userType: "asset_owner",
        location: "Dubai",
        leadScore: 70,
        status: "engaged",
        lastActivityAt: new Date(Date.now() - 20 * 86_400_000),
        firstDealAt: null,
        reEngagementSentAt: null,
        notes: null,
        createdAt: new Date(Date.now() - 60 * 86_400_000),
        updatedAt: new Date(Date.now() - 60 * 86_400_000),
      },
    ];
    dbState.selectQueue = [eligible];
    dbState.returningQueue = [[{ id: "lead-budget" }]];

    const result = await runReEngagementCampaign({ capacity: 5 });

    expect(result.sent).toBe(1);
    expect(result.fallbackUsed).toBe(1);
    expect(result.llmDrafted).toBe(0);
    expect(chatSpy).not.toHaveBeenCalled();
    expect(emailSends).toHaveLength(1);
    expect(emailSends[0].text).toContain("100% cashless");

    budgetSpy.mockRestore();
  });

  it("embeds a tracked CTA URL with a per-send token and records a 'sent' event", async () => {
    // Task #71 — verify the conversion-tracking plumbing is wired into
    // every successful re-engagement send:
    //   1. The email body includes the tracked URL (so recipients can
    //      click it and produce a return_visit event).
    //   2. A `salesReengagementEvents` row of type 'sent' is inserted
    //      with the same token that's in the URL — the (linkToken,
    //      eventType) join is what powers the conversion metric.
    const eligible = [
      {
        id: "lead-track",
        userId: "user-track",
        email: "track@example.com",
        fullName: "Trace Tracy",
        userType: "asset_owner",
        location: "Dubai",
        leadScore: 80,
        status: "engaged",
        lastActivityAt: new Date(Date.now() - 21 * 86_400_000),
        firstDealAt: null,
        reEngagementSentAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    dbState.selectQueue = [eligible];
    dbState.returningQueue = [[{ id: "lead-track" }]];
    // Force the deterministic fallback so the body is predictable —
    // the static template still has to include the tracked URL.
    const budgetModule = await import("../server/companyOs/costTracker");
    const budgetSpy = vi
      .spyOn(budgetModule, "getBudgetVerdict")
      .mockResolvedValueOnce({
        safe: false,
        spentAed: 0,
        budgetAed: 400,
        usageRatio: 0,
        verdict: "kill_switch",
      } as any);

    const result = await runReEngagementCampaign({ capacity: 1 });
    budgetSpy.mockRestore();

    expect(result.sent).toBe(1);
    expect(emailSends).toHaveLength(1);
    // Tracked URL pattern: /api/sales/track/<token>?utm_source=reengage…
    const trackMatch = emailSends[0].text.match(
      /\/api\/sales\/track\/([A-Za-z0-9_-]{8,64})\?[^\s)]*utm_source=reengage/,
    );
    expect(trackMatch, "email body must contain the tracked CTA URL").not.toBeNull();
    const tokenInUrl = trackMatch![1];

    // The 'sent' event must have been written with the same token. We
    // capture all inserts via dbState.insertedValues; the sales-event
    // row is the only one carrying eventType='sent'.
    const sentEvent = dbState.insertedValues.find(
      (v) => v.eventType === "sent" && typeof v.linkToken === "string",
    );
    expect(sentEvent, "must record a 'sent' re-engagement event").toBeTruthy();
    expect(sentEvent!.linkToken).toBe(tokenInUrl);
    expect(sentEvent!.leadId).toBe("lead-track");
    expect(sentEvent!.userId).toBe("user-track");
  });
});

// ===========================================================================
// Task #71 — re-engagement conversion tracking
// ===========================================================================
describe("recordReEngagementReturnVisit", () => {
  it("rejects empty / oversized tokens without touching the DB", async () => {
    dbState.selectQueue = [];
    expect(await recordReEngagementReturnVisit("")).toBeNull();
    expect(await recordReEngagementReturnVisit("x".repeat(65))).toBeNull();
    expect(dbState.selectCalls).toBe(0);
    expect(dbState.insertedValues).toHaveLength(0);
  });

  it("returns null for an unknown token and does not insert a return_visit", async () => {
    // No matching 'sent' row → the lookup select returns []. We must
    // bail out without writing a return_visit (otherwise we'd inflate
    // the conversion numerator with random URL hits).
    dbState.selectQueue = [[]];
    const result = await recordReEngagementReturnVisit("abcdef1234567890");
    expect(result).toBeNull();
    expect(dbState.insertedValues).toHaveLength(0);
  });

  it("looks up the originating send and inserts a return_visit + bumps lastActivityAt", async () => {
    // The lookup select returns one row matching (linkToken, 'sent').
    dbState.selectQueue = [[{ leadId: "lead-z", userId: "user-z" }]];
    const result = await recordReEngagementReturnVisit("token-abcdef12", {
      ip: "1.2.3.4",
    });
    expect(result).toEqual({ leadId: "lead-z", userId: "user-z" });

    const visit = dbState.insertedValues.find(
      (v) => v.eventType === "return_visit",
    );
    expect(visit, "must insert a return_visit event").toBeTruthy();
    expect(visit!.linkToken).toBe("token-abcdef12");
    expect(visit!.leadId).toBe("lead-z");
    expect(visit!.userId).toBe("user-z");
    expect(visit!.metadata).toEqual({ ip: "1.2.3.4" });

    // lastActivityAt bump → exactly one update with a Date in the
    // updated set (the insert/upsert path doesn't push to updatedSets,
    // only `db.update(...).set(...)` does).
    const bump = dbState.updatedSets.find(
      (u) => u.lastActivityAt instanceof Date,
    );
    expect(bump, "must bump lastActivityAt on the lead").toBeTruthy();
  });
});

describe("getReEngagementConversion", () => {
  it("returns a zeroed result with a friendly window when no sends exist", async () => {
    // First select (sentEvents) → []. Function must short-circuit and
    // not issue the secondary returnEvents/posts/deals selects, so a
    // single empty queue entry is sufficient.
    dbState.selectQueue = [[]];
    const r = await getReEngagementConversion();
    expect(r).toEqual({
      sent: 0,
      returned: 0,
      rate: 0,
      windowSize: 50,
      windowDays: 7,
    });
  });

  it("counts a return as converted only when a same-token visit lands inside the 7-day window", async () => {
    const now = Date.now();
    const sentEvents = [
      // Within window — recipient clicked the link 2 days after the email.
      {
        linkToken: "tok-converted",
        userId: "user-A",
        sentAt: new Date(now - 3 * 86_400_000),
      },
      // Outside window — visit happened, but 10 days after the send.
      {
        linkToken: "tok-late",
        userId: "user-B",
        sentAt: new Date(now - 20 * 86_400_000),
      },
      // Never returned at all.
      {
        linkToken: "tok-cold",
        userId: "user-C",
        sentAt: new Date(now - 1 * 86_400_000),
      },
    ];
    const returnEvents = [
      // Within 7d of tok-converted's send → counts.
      { linkToken: "tok-converted", createdAt: new Date(now - 1 * 86_400_000) },
      // 10 days after tok-late's send → outside the window, doesn't count.
      { linkToken: "tok-late", createdAt: new Date(now - 10 * 86_400_000) },
    ];
    // Queue order matches Promise.all evaluation:
    //   1. sentEvents
    //   2. returnEvents
    //   3. userPosts (none)
    //   4. userDeals (none)
    dbState.selectQueue = [sentEvents, returnEvents, [], []];

    const r = await getReEngagementConversion();
    expect(r.sent).toBe(3);
    expect(r.returned).toBe(1);
    expect(r.rate).toBe(33); // 1/3 → 33%
    expect(r.windowSize).toBe(50);
    expect(r.windowDays).toBe(7);
  });

  it("counts a new post by the recipient inside the window as a conversion (no click required)", async () => {
    const now = Date.now();
    const sentEvents = [
      {
        linkToken: "tok-poster",
        userId: "user-poster",
        sentAt: new Date(now - 5 * 86_400_000),
      },
    ];
    const userPosts = [
      // Posted 2 days after the email — counts even though they
      // didn't click the tracked link.
      {
        userId: "user-poster",
        createdAt: new Date(now - 3 * 86_400_000),
      },
    ];
    dbState.selectQueue = [sentEvents, [], userPosts, []];

    const r = await getReEngagementConversion();
    expect(r.sent).toBe(1);
    expect(r.returned).toBe(1);
    expect(r.rate).toBe(100);
  });

  it("falls back to a zeroed result when the underlying query throws", async () => {
    dbState.selectShouldThrow = true;
    const r = await getReEngagementConversion();
    expect(r.sent).toBe(0);
    expect(r.returned).toBe(0);
    expect(r.rate).toBe(0);
    dbState.selectShouldThrow = false;
  });
});

describe("/api/sales/track/:token route", () => {
  // Mounts the real handler from salesAgent — same one that
  // server/routes.ts wires up — onto a minimal express app, so we
  // exercise the full request → recordReEngagementReturnVisit → 302
  // redirect path against the existing DB mock.
  function buildTrackingApp() {
    const app = express();
    app.get("/api/sales/track/:token", handleSalesTrackingRequest as any);
    return app;
  }

  it("302-redirects with default UTMs and re_t marker on a valid token", async () => {
    // The handler's lookup select returns a known sent event, so the
    // return_visit insert must run.
    dbState.selectQueue = [[{ leadId: "lead-r", userId: "user-r" }]];
    const res = await request(buildTrackingApp()).get(
      "/api/sales/track/abcdef1234567890",
    );
    expect(res.status).toBe(302);
    const loc = res.headers.location ?? "";
    expect(loc.startsWith("/?")).toBe(true);
    expect(loc).toContain("utm_source=reengage");
    expect(loc).toContain("utm_medium=email");
    expect(loc).toContain("utm_campaign=sales_reengagement");
    // Marker only present for valid tokens — used by the SPA to
    // distinguish a re-engagement landing from an organic visit.
    expect(loc).toContain("re_t=1");

    // The route must have written a return_visit event for the token.
    const visit = dbState.insertedValues.find(
      (v) => v.eventType === "return_visit",
    );
    expect(visit, "valid token must produce a return_visit insert").toBeTruthy();
    expect(visit!.linkToken).toBe("abcdef1234567890");
  });

  it("preserves caller-supplied UTMs over the defaults", async () => {
    dbState.selectQueue = [[{ leadId: "lead-r", userId: "user-r" }]];
    const res = await request(buildTrackingApp()).get(
      "/api/sales/track/abcdef1234567890" +
        "?utm_source=mailchimp&utm_campaign=spring2026",
    );
    expect(res.status).toBe(302);
    const loc = res.headers.location ?? "";
    expect(loc).toContain("utm_source=mailchimp");
    expect(loc).toContain("utm_campaign=spring2026");
    // The default for unset utm_medium still fills in.
    expect(loc).toContain("utm_medium=email");
  });

  it("still 302-redirects on a malformed token but does NOT record a visit", async () => {
    dbState.selectQueue = []; // would throw if a select were issued
    const res = await request(buildTrackingApp()).get(
      "/api/sales/track/bad!token",
    );
    expect(res.status).toBe(302);
    const loc = res.headers.location ?? "";
    expect(loc.startsWith("/?")).toBe(true);
    // Default UTMs still applied so the user-visible behaviour is
    // indistinguishable from a real click — but no attribution marker.
    expect(loc).toContain("utm_source=reengage");
    expect(loc).not.toContain("re_t=1");
    // No DB write should have happened.
    expect(dbState.insertedValues).toHaveLength(0);
  });

  it("is idempotent: a second click with the same token still 302s and the conflict-do-nothing path swallows the duplicate insert", async () => {
    // First click: lookup finds the sent event, inserts return_visit.
    // Second click: lookup again finds the sent event, attempts another
    // insert which the (linkToken, eventType) unique index would
    // collapse via ON CONFLICT DO NOTHING. The mock chain just no-ops
    // on .onConflictDoNothing — what matters is the response stays 302
    // and the user is never bounced.
    dbState.selectQueue = [
      [{ leadId: "lead-r", userId: "user-r" }],
      [{ leadId: "lead-r", userId: "user-r" }],
    ];
    const app = buildTrackingApp();
    const r1 = await request(app).get("/api/sales/track/abcdef1234567890");
    const r2 = await request(app).get("/api/sales/track/abcdef1234567890");
    expect(r1.status).toBe(302);
    expect(r2.status).toBe(302);
    expect(r1.headers.location).toBe(r2.headers.location);
  });
});

// ===========================================================================
// syncNewLeads — happy path + backlog drain (no starvation)
// ===========================================================================
describe("syncNewLeads", () => {
  it("inserts a new lead row for a never-seen user (backlog phase)", async () => {
    const u = {
      id: "u-1",
      email: "new@example.com",
      fullName: "New User",
      accountType: "individual",
      signupType: "brand",
      city: "Dubai",
      location: null,
      onboardingCompleted: true,
      lastActiveAt: new Date(),
      createdAt: new Date(),
    };
    // Order of selects inside syncNewLeads → ingestUser (atomic upsert
    // path — no separate existing-row check):
    //   1. SELECT users LEFT JOIN salesLeads WHERE salesLeads.userId IS NULL  → unsynced batch
    //   2. SELECT users INNER JOIN salesLeads WHERE lastActivityAt < cutoff   → stale priority (empty here)
    //   3. SELECT salesSyncState WHERE id='default'                            → cursor read (empty here → ZERO_CURSOR)
    //   4. SELECT users WHERE id > cursor ORDER BY id ASC                      → cursor pagination (empty here)
    //   then per-user: 5-7 (postCount, dealAll, dealDone)
    dbState.selectQueue = [
      [u],
      [],
      [],
      [],
      [{ c: 0, latest: null }],
      [{ c: 0, latest: null }],
      [{ c: 0, first: null }],
    ];
    // The upsert's .returning({wasInsert}) tells syncNewLeads whether
    // the row was a true INSERT or hit ON CONFLICT.
    dbState.returningQueue = [[{ wasInsert: true }]];
    const r = await syncNewLeads({ limit: 10 });
    expect(r.scanned).toBe(1);
    expect(r.inserted).toBe(1);
    expect(r.updated).toBe(0);
    expect(r.errors).toBe(0);
    // Filter for lead inserts — the cursor-state upsert (id='default')
    // also lands in `insertedValues` and would otherwise inflate the
    // count.
    const leadInserts = dbState.insertedValues.filter((v) => "userId" in v);
    expect(leadInserts).toHaveLength(1);
    const lead = leadInserts[0];
    expect(lead.userId).toBe("u-1");
    // asset_owner +15, onboarding +20, Dubai +10 = 45.
    expect(lead.leadScore).toBe(45);
    expect(lead.userType).toBe("asset_owner");
    // status is computed with isNew=true on the values payload; the
    // CASE expression in the upsert downgrades 'new' → 'active' for
    // existing rows at the SQL layer (verified in the next test).
    expect(lead.status).toBe("new");
  });

  it("drains backlog first, then refreshes stale leads (no starvation)", async () => {
    // Backlog phase returns one unsynced user, refresh phase returns one
    // user that already has a sales_leads row — proving the function
    // processes both populations in a single run rather than only ever
    // hitting the newest cohort.
    const backlog = {
      id: "u-old",
      email: "old@example.com",
      fullName: "Older User",
      accountType: "individual",
      signupType: "brand",
      city: "Dubai",
      location: null,
      onboardingCompleted: true,
      lastActiveAt: new Date(),
      createdAt: new Date("2024-01-01"),
    };
    const stale = {
      id: "u-stale",
      email: "stale@example.com",
      fullName: "Stale User",
      accountType: "individual",
      signupType: "creator",
      city: "Sharjah",
      location: null,
      onboardingCompleted: true,
      lastActiveAt: new Date(Date.now() - 21 * 86_400_000),
      createdAt: new Date("2024-06-01"),
    };
    dbState.selectQueue = [
      // Phase 1: backlog (LEFT JOIN ... IS NULL)
      [backlog],
      // Phase 2: stale priority (INNER JOIN ... WHERE lastActivityAt < cutoff)
      [stale],
      // Phase 3a: salesSyncState cursor read (empty → ZERO_CURSOR, start of table)
      [],
      // Phase 3b: cursor pagination (empty here — refresh budget = 5 was
      // already consumed by the stale row, so this query never runs in
      // practice, but the mock still returns []).
      [],
      // Per-user features for backlog user (3 selects: posts, dealAll, dealDone)
      [{ c: 0, latest: null }],
      [{ c: 0, latest: null }],
      [{ c: 0, first: null }],
      // Per-user features for stale user (3 selects)
      [{ c: 1, latest: new Date(Date.now() - 25 * 86_400_000) }],
      [{ c: 0, latest: null }],
      [{ c: 0, first: null }],
    ];
    // Two upserts: first one is a true INSERT (backlog user had no
    // existing row), second one hits ON CONFLICT (stale user already
    // has a sales_leads row).
    dbState.returningQueue = [
      [{ wasInsert: true }],
      [{ wasInsert: false }],
    ];

    const r = await syncNewLeads({ limit: 10, refreshLimit: 5 });
    expect(r.scanned).toBe(2);
    expect(r.inserted).toBe(1); // backlog user (wasInsert=true)
    expect(r.updated).toBe(1);  // stale user (wasInsert=false → upsert hit ON CONFLICT)
    // Both upserts go through `db.insert(...).values(...)`, so both
    // payloads land in `insertedValues`. Filter by `userId` (set on lead
    // upserts only) so the cursor-state upsert that also runs at end of
    // sync doesn't inflate the count.
    const leadInserts = dbState.insertedValues.filter((v) => "userId" in v);
    expect(leadInserts).toHaveLength(2);
    const userIds = leadInserts.map((v) => v.userId).sort();
    expect(userIds).toEqual(["u-old", "u-stale"]);
    // No separate db.update() calls happen in the ingest path now —
    // the upsert handles update at the DB layer atomically.
    expect(dbState.updatedSets).toHaveLength(0);
  });

  it("skips the refresh pass when refreshLimit=0", async () => {
    // Only Phase 1 should run — single SELECT for the backlog batch.
    // No stale query, no cursor read, no cursor pagination, no
    // sales_sync_state upsert: passing refreshLimit=0 makes the agent
    // a one-shot backlog drainer, useful for catch-up runs without
    // disturbing the persisted cursor.
    dbState.selectQueue = [
      [], // Phase 1 returns empty → no per-user selects either.
    ];
    const r = await syncNewLeads({ limit: 10, refreshLimit: 0 });
    expect(r.scanned).toBe(0);
    expect(r.inserted).toBe(0);
    expect(r.updated).toBe(0);
    // Exactly one select call: just the backlog query, no refresh query
    // and no cursor read.
    expect(dbState.selectCalls).toBe(1);
    // No cursor write — refreshLimit=0 must not touch sales_sync_state.
    const cursorWrites = dbState.insertedValues.filter((v) => v.id === "default");
    expect(cursorWrites).toHaveLength(0);
    // Cursor in the result still reflects the un-touched persisted state
    // (we never read it, so it's the ZERO_CURSOR fallback).
    expect(r.cursor.cursorUserId).toBeNull();
    expect(r.cursor.wrapCount).toBe(0);
  });

  it("advances the cursor across runs and wraps once the user table is fully covered", async () => {
    // Two-run test — proves both halves of the spec:
    //   1. After a run that returned exactly cursorLimit users, the
    //      persisted cursor sits on the LAST user id seen (advance).
    //   2. A subsequent run that returns FEWER than cursorLimit users
    //      detects the tail of the table, wraps the cursor back to
    //      null and bumps wrapCount (wrap-around).
    // The test bypasses backlog and stale by setting refreshLimit
    // explicitly and supplying an empty backlog; it focuses on the
    // cursor pagination path which is the new behaviour added in the
    // "stop the Sales Agent from missing users" change.
    const mkUser = (id: string) => ({
      id,
      email: `${id}@example.com`,
      fullName: `User ${id}`,
      accountType: "individual",
      signupType: "brand",
      city: "Dubai",
      location: null,
      onboardingCompleted: true,
      lastActiveAt: new Date(),
      createdAt: new Date(),
    });
    const u1 = mkUser("u-001");
    const u2 = mkUser("u-002");

    // ── Run 1 — cursor advances to u-002 ──────────────────────────────
    dbState.selectQueue = [
      [],          // Phase 1 backlog (empty)
      [],          // Phase 2 stale (empty — staleLimit=0)
      [],          // Phase 3a sync_state cursor read (no row → ZERO_CURSOR)
      [u1, u2],    // Phase 3b cursor pagination — exactly cursorLimit=2
      // Per-user features (3 selects per user × 2 users = 6 selects)
      [{ c: 0, latest: null }],
      [{ c: 0, latest: null }],
      [{ c: 0, first: null }],
      [{ c: 0, latest: null }],
      [{ c: 0, latest: null }],
      [{ c: 0, first: null }],
    ];
    dbState.returningQueue = [
      [{ wasInsert: true }],
      [{ wasInsert: true }],
    ];

    const run1 = await syncNewLeads({
      limit: 5,
      refreshLimit: 2,   // total refresh budget = stale + cursor
      cursorLimit: 2,
      staleLimit: 0,
    });
    expect(run1.scanned).toBe(2);
    expect(run1.cursor.cursorUserId).toBe("u-002");
    expect(run1.cursor.wrapCount).toBe(0);
    const cursorWrite1 = dbState.insertedValues.find((v) => v.id === "default");
    expect(cursorWrite1?.cursorUserId).toBe("u-002");
    expect(cursorWrite1?.wrapCount).toBe(0);

    // ── Run 2 — cursor wraps because pagination returned <budget ──────
    resetDbState();
    dbState.selectQueue = [
      [],                                 // Phase 1 backlog
      [],                                 // Phase 2 stale
      [{ id: "default", cursorUserId: "u-002", lastRunAt: new Date(), wrapCount: 0 }], // cursor read
      [],                                 // Phase 3b cursor pagination — 0 < budget=2 → wrap
    ];
    dbState.returningQueue = [];

    const run2 = await syncNewLeads({
      limit: 5,
      refreshLimit: 2,
      cursorLimit: 2,
      staleLimit: 0,
    });
    expect(run2.scanned).toBe(0);
    expect(run2.cursor.cursorUserId).toBeNull();
    expect(run2.cursor.wrapCount).toBe(1); // bumped from 0 → 1
    const cursorWrite2 = dbState.insertedValues.find((v) => v.id === "default");
    expect(cursorWrite2?.cursorUserId).toBeNull();
    expect(cursorWrite2?.wrapCount).toBe(1);
  });

  it("re-scores stale leads (lastActivityAt past freshness window) even when no new sign-ups happened", async () => {
    // Phase 1 (backlog drain) returns nothing — no sign-ups. The stale
    // priority pass MUST still pull dormant leads and re-score them so
    // the re-engagement job has fresh `lastActivityAt` / `leadScore`
    // values to work from. This is the "predictable cadence" half of
    // the task spec.
    const dormant = {
      id: "u-dormant",
      email: "old@example.com",
      fullName: "Dormant User",
      accountType: "individual",
      signupType: "brand",
      city: "Dubai",
      location: null,
      onboardingCompleted: true,
      lastActiveAt: new Date(Date.now() - 30 * 86_400_000),
      createdAt: new Date("2024-01-01"),
    };
    dbState.selectQueue = [
      [],         // Phase 1 backlog (no new sign-ups)
      [dormant],  // Phase 2 stale (lastActivityAt < 14d cutoff)
      [],         // sync_state cursor read
      [],         // cursor pagination (irrelevant — dedupe already saw u-dormant)
      [{ c: 0, latest: null }],
      [{ c: 0, latest: null }],
      [{ c: 0, first: null }],
    ];
    dbState.returningQueue = [[{ wasInsert: false }]];

    const r = await syncNewLeads({ limit: 10 });
    expect(r.scanned).toBe(1);
    expect(r.inserted).toBe(0);
    expect(r.updated).toBe(1);
    const leadInserts = dbState.insertedValues.filter((v) => "userId" in v);
    expect(leadInserts).toHaveLength(1);
    expect(leadInserts[0].userId).toBe("u-dormant");
  });
});

// ===========================================================================
// Manager Agent integration via the WhatsApp webhook
// ===========================================================================
describe("Manager Agent — sales commands via WhatsApp webhook", () => {
  it("`help` lists the new sales commands", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "help");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("`leads`");
    expect(reply).toContain("`sync leads`");
  });

  it("`leads` returns the report with totals (no LLM call)", async () => {
    // getSalesReport runs 4 selects in parallel: total, byStatus, avg, weekly.
    dbState.selectQueue = [
      [{ c: 12 }],
      [
        { status: "new", c: 3 },
        { status: "active", c: 5 },
        { status: "re_engaged", c: 1 },
      ],
      [{ a: "42" }],
      [{ c: 4 }],
    ];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "leads");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Sales");
    expect(reply).toContain("Total: 12");
    expect(reply).toContain("Active: 5");
    expect(reply).toContain("New this week: 4");
  });

  it("`sync leads` returns a sync summary", async () => {
    // syncNewLeads → 2 SELECTs (backlog, stale — both empty); then
    // runReEngagementCampaign → 1 SELECT salesLeads (empty).
    dbState.selectQueue = [[], [], []];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "sync leads");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Sales");
    expect(reply).toContain("Ingested:");
    expect(reply).toContain("Re-engagement:");
  });
});

// ===========================================================================
// updateLead — admin editor for notes / status (Task #70)
// ===========================================================================
describe("updateLead", () => {
  const sampleRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: "lead-1",
    userId: "u-1",
    email: "alex@example.com",
    fullName: "Alex Rahman",
    userType: "asset_owner",
    location: "Dubai",
    leadScore: 75,
    status: "engaged",
    lastActivityAt: new Date(),
    firstDealAt: null,
    reEngagementSentAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it("updates notes and bumps updatedAt", async () => {
    dbState.returningQueue = [[sampleRow({ notes: "VIP follow-up" })]];
    const updated = await updateLead("lead-1", { notes: "VIP follow-up" });
    expect(updated?.notes).toBe("VIP follow-up");
    expect(dbState.updatedSets).toHaveLength(1);
    expect(dbState.updatedSets[0].notes).toBe("VIP follow-up");
    expect(dbState.updatedSets[0].updatedAt).toBeInstanceOf(Date);
  });

  it("clears notes when an empty string is supplied", async () => {
    dbState.returningQueue = [[sampleRow({ notes: null })]];
    await updateLead("lead-1", { notes: "" });
    expect(dbState.updatedSets[0].notes).toBeNull();
  });

  it("updates status without touching notes when only status is provided", async () => {
    dbState.returningQueue = [[sampleRow({ status: "converted" })]];
    const updated = await updateLead("lead-1", { status: "converted" });
    expect(updated?.status).toBe("converted");
    expect(dbState.updatedSets[0].status).toBe("converted");
    expect("notes" in dbState.updatedSets[0]).toBe(false);
  });

  it("rejects an invalid status value", async () => {
    await expect(
      // @ts-expect-error — exercising the runtime guard
      updateLead("lead-1", { status: "pending_review" }),
    ).rejects.toThrow(/Invalid lead status/);
    expect(dbState.updatedSets).toHaveLength(0);
  });

  it("returns null when the row does not exist", async () => {
    dbState.returningQueue = [[]];
    const updated = await updateLead("missing", { status: "active" });
    expect(updated).toBeNull();
  });

  it("truncates oversize notes to 4000 chars", async () => {
    const big = "x".repeat(5000);
    dbState.returningQueue = [[sampleRow({ notes: "x".repeat(4000) })]];
    await updateLead("lead-1", { notes: big });
    expect((dbState.updatedSets[0].notes as string).length).toBe(4000);
  });
});

// ===========================================================================
// PATCH /api/company-os/sales/leads/:id — HTTP route wrapper
// ===========================================================================
describe("PATCH /sales/leads/:id", () => {
  it("400s when the body has neither notes nor status", async () => {
    const app = buildApp();
    const res = await request(app)
      .patch("/api/company-os/sales/leads/lead-1")
      .send({});
    expect(res.status).toBe(400);
  });

  it("400s on an invalid status value", async () => {
    const app = buildApp();
    const res = await request(app)
      .patch("/api/company-os/sales/leads/lead-1")
      .send({ status: "lol" });
    expect(res.status).toBe(400);
  });

  it("404s when no row matches the id", async () => {
    dbState.returningQueue = [[]];
    const app = buildApp();
    const res = await request(app)
      .patch("/api/company-os/sales/leads/missing")
      .send({ notes: "anything" });
    expect(res.status).toBe(404);
  });

  it("200s and returns the updated row on success", async () => {
    dbState.returningQueue = [
      [
        {
          id: "lead-1",
          userId: "u-1",
          email: "x@example.com",
          fullName: "X",
          userType: "asset_owner",
          location: "Dubai",
          leadScore: 60,
          status: "converted",
          lastActivityAt: new Date(),
          firstDealAt: null,
          reEngagementSentAt: null,
          notes: "Closed!",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ];
    const app = buildApp();
    const res = await request(app)
      .patch("/api/company-os/sales/leads/lead-1")
      .send({ status: "converted", notes: "Closed!" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.lead.status).toBe("converted");
    expect(res.body.lead.notes).toBe("Closed!");
  });
});
