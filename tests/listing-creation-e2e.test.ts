import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// End-to-end HTTP exercise of the exact flow a beta user was blocked on:
// an individual account with email + WhatsApp verified but no Didit KYC,
// posting a Dubai listing with a 30MB .MOV clip.
//
// This drives the REAL route table over REAL HTTP — real multer, real
// magic-byte sniffing, real gate code. Only the database and outbound
// integrations are stubbed.

process.env.SESSION_SECRET = "test-listing-e2e-secret";
process.env.NODE_ENV = "test";
delete process.env.REPL_ID; // force the local-disk upload branch, not R2/Replit

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

// Moderation is a fire-and-forget dynamic import in the listing path; stub it
// so no model call is attempted. Email is likewise fire-and-forget and is
// inert without API keys, so it needs no stub.
vi.mock("../server/agents/moderationAgent", () => ({ moderateAndLog: async () => undefined }));

type AnyRecord = Record<string, any>;

const users = new Map<string, AnyRecord>();
const createdListings: AnyRecord[] = [];
const appSettings = new Map<string, string>();

const inMemoryStorage = new Proxy(
  {
    async getUser(id: string) {
      return users.get(id);
    },
    async updateUser(id: string, data: AnyRecord) {
      const u = users.get(id);
      if (!u) return undefined;
      const next = { ...u, ...data };
      users.set(id, next);
      return next;
    },
    async getAppSetting(key: string) {
      return appSettings.get(key);
    },
    async countUserActiveListings() {
      return 0;
    },
    async createListing(data: AnyRecord) {
      const listing = { id: randomUUID(), createdAt: new Date(), ...data };
      createdListings.push(listing);
      return listing;
    },
    async getCreatorProfile() {
      return undefined;
    },
  } as AnyRecord,
  {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      // Anything else the route table touches is a no-op returning undefined,
      // so an unrelated call can't fail the assertions we care about.
      return async () => undefined;
    },
  },
);

vi.mock("../server/storage", () => ({ storage: inMemoryStorage }));

let app: express.Express;
const writtenFiles: string[] = [];

beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  // Only the seven emirates are live, exactly as configured in production.
  appSettings.set(
    "active_emirates",
    JSON.stringify(["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"]),
  );
});

afterAll(() => {
  for (const f of writtenFiles) {
    try { fs.unlinkSync(f); } catch { /* already gone */ }
  }
});

/** The beta user: Personal account, email + WhatsApp verified, no KYC. */
function betaUser(overrides: AnyRecord = {}): string {
  const id = randomUUID();
  users.set(id, {
    id,
    email: `beta-${id.slice(0, 8)}@example.com`,
    fullName: "Beta Tester",
    accountType: "individual",
    emailVerified: true,
    phoneVerified: true,
    kycStatus: "NOT_STARTED",
    kybStatus: "NOT_STARTED",
    isVerified: false,
    isPaused: false,
    country: "AE",
    city: null,
    location: null,
    ...overrides,
  });
  return id;
}

/**
 * A syntactically real QuickTime .MOV of the requested size: valid ftyp/moov
 * boxes so `file-type` sniffs it as video/quicktime, padded with an mdat box.
 */
function makeMov(totalBytes: number): Buffer {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x14]),
    Buffer.from("ftypqt  ", "ascii"),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from("qt  ", "ascii"),
  ]);
  const padLen = Math.max(0, totalBytes - ftyp.length - 8);
  const mdatHeader = Buffer.alloc(8);
  mdatHeader.writeUInt32BE(padLen + 8, 0);
  mdatHeader.write("mdat", 4, "ascii");
  return Buffer.concat([ftyp, mdatHeader, Buffer.alloc(padLen, 0x42)]);
}

function makeJpeg(totalBytes: number): Buffer {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, totalBytes - header.length), 0x00)]);
}

describe("E2E — the beta user posts their first listing", () => {
  it("uploads the 30MB .MOV that used to fail with 'File too large'", async () => {
    const uid = betaUser();
    const mov = makeMov(30 * 1024 * 1024);
    expect(mov.length).toBe(30 * 1024 * 1024);

    const res = await request(app)
      .post("/api/upload")
      .set("x-test-user-id", uid)
      .field("type", "listing")
      .attach("file", mov, { filename: "IMG_7595.MOV", contentType: "video/quicktime" });

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/\.mov$/);
    if (res.body.url?.startsWith("/uploads/")) {
      writtenFiles.push(path.join("./uploads", path.basename(res.body.url)));
    }
  }, 30000);

  it("creates the listing with a free-text Dubai neighbourhood", async () => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/listings")
      .set("x-test-user-id", uid)
      .send({
        type: "offer",
        title: "Bob Marley Legend Vinyl LP",
        description: "Classic compilation on vinyl, gently used, sleeve in good condition.",
        categories: ["collectibles"],
        retailValue: "95",
        location: "World Trade Center", // the exact value that was rejected
        images: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
        videoUrl: "/uploads/clip.mov",
      });

    expect(res.status).toBe(200);
    const listing = createdListings.at(-1)!;
    expect(listing.location).toBe("World Trade Center");
    // The emirate was derived from the neighbourhood so filtering still works.
    expect(listing.city).toBe("Dubai");
    expect(listing.videoUrl).toBe("/uploads/clip.mov");
  });

  it.each([
    "Downtown Dubai",
    "JBR",
    "Al Quoz Industrial 3",
    "DIFC",
    "Business Bay",
    "Mirdif",
    "Al Reem Island",
    "Khalifa City",
    "Al Majaz",
  ])("accepts the neighbourhood %s", async (area) => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/listings")
      .set("x-test-user-id", uid)
      .send({
        type: "offer",
        title: `Test listing in ${area}`,
        description: "A description long enough to pass the minimum length requirement.",
        categories: ["collectibles"],
        retailValue: "100",
        location: area,
        images: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
      });
    expect(res.status).toBe(200);
    expect(createdListings.at(-1)!.location).toBe(area);
  });

  it("starts a trade without ever asking for identity KYC", async () => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/deals")
      .set("x-test-user-id", uid)
      .send({ providerListingId: randomUUID(), seekerOffer: "My vinyl", seekerValue: 95 });

    // Must get PAST verification. A 404 (listing not found) proves the gate
    // let us through; a 403 would mean it did not.
    expect(res.status).not.toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/identity verification/i);
  });
});

describe("E2E — existing users, not just freshly-registered ones", () => {
  const listingBody = (overrides: AnyRecord = {}) => ({
    type: "offer",
    title: "Legacy account listing",
    description: "A description comfortably past the minimum length requirement.",
    categories: ["collectibles"],
    retailValue: "120",
    images: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
    ...overrides,
  });

  it("a Google user with email_verified=false can list", async () => {
    const uid = betaUser({ emailVerified: false, googleId: "google-sub-1" });
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send(listingBody({ location: "Dubai Marina" }));
    expect(res.status).toBe(200);
  });

  it("an Apple user with email_verified=false can list", async () => {
    const uid = betaUser({ emailVerified: false, appleId: "apple-sub-1" });
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send(listingBody({ location: "JBR" }));
    expect(res.status).toBe(200);
  });

  it("a Google user can start a trade", async () => {
    const uid = betaUser({ emailVerified: false, googleId: "google-sub-2" });
    const res = await request(app)
      .post("/api/deals").set("x-test-user-id", uid)
      .send({ providerListingId: randomUUID(), seekerOffer: "x", seekerValue: 10 });
    expect(res.status).not.toBe(403);
  });

  it("a legacy profile whose city holds a NEIGHBOURHOOD is not blocked", async () => {
    // The old `UPDATE users SET city = location` backfill produced exactly this.
    const uid = betaUser({ city: "Downtown Dubai", location: "Downtown Dubai" });
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send(listingBody({ location: "Downtown Dubai" }));
    expect(res.status).toBe(200);
    // …and the stored emirate is repaired on the way in.
    expect(createdListings.at(-1)!.city).toBe("Dubai");
  });

  it("a legacy neighbourhood sent in the city FIELD is resolved, not rejected", async () => {
    const uid = betaUser({ city: "World Trade Center" });
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send(listingBody({ location: "World Trade Center", city: "World Trade Center" }));
    expect(res.status).toBe(200);
    expect(createdListings.at(-1)!.city).toBe("Dubai");
  });

  it("a proper emirate in the city field is preserved untouched", async () => {
    const uid = betaUser({ city: "Sharjah" });
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send(listingBody({ location: "Al Majaz 2", city: "Sharjah" }));
    expect(res.status).toBe(200);
    expect(createdListings.at(-1)!.city).toBe("Sharjah");
  });

  it("a user with no location data at all is not blocked", async () => {
    const uid = betaUser({ city: null, location: null });
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send(listingBody({ location: "Somewhere unlisted" }));
    expect(res.status).toBe(200);
  });

  it("an unknown area is accepted rather than rejected", async () => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send(listingBody({ location: "Behind the big roundabout" }));
    expect(res.status).toBe(200);
    expect(createdListings.at(-1)!.location).toBe("Behind the big roundabout");
  });

  it("a genuinely inactive emirate is still refused", async () => {
    const uid = betaUser({ city: "Doha" });
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send(listingBody({ location: "West Bay", city: "Doha" }));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only allowed in/i);
  });
});

describe("E2E — value-flagging must not fire on physical goods", () => {
  // UAE_MARKET_AVERAGES is a SERVICE pricing table (SaaS, Legal, Real Estate).
  // Roxanne's AED 95 vinyl record, tagged "Entertainment" for lack of a
  // Collectibles category, was compared against a AED 6,000 average for
  // entertainment BOOKINGS and flagged as suspiciously cheap. The AI
  // valuation panel had just told her AED 95 was the fair price for the same
  // item — the platform contradicted its own estimate.
  it("does not flag a cheap goods listing whose category overlaps a service category name", async () => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send({
        type: "offer",
        title: "Bob Marley Legend Vinyl LP",
        description: "Classic compilation on vinyl, gently used, sleeve in good condition.",
        categories: ["Entertainment"], // the only close-enough tag for a record
        retailValue: "95",
        location: "Dubai Marina",
        images: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
        // no listingType/categoryDetails sent → defaults to individual_item (goods)
      });
    expect(res.status).toBe(200);
    expect(createdListings.at(-1)!.valueFlagged).toBe(false);
  });

  it("still flags a genuinely underpriced SERVICE listing", async () => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send({
        type: "offer",
        title: "Full day photography package",
        description: "Professional event photography, edited gallery delivered within a week.",
        categories: ["Photography"], // avg 4500 in UAE_MARKET_AVERAGES
        retailValue: "50", // well under 70% of 4500
        location: "Dubai Marina",
        images: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
        listingType: "individual_item",
        categoryDetails: { isService: true },
      });
    expect(res.status).toBe(200);
    expect(createdListings.at(-1)!.valueFlagged).toBe(true);
  });

  it("still flags any listing — goods or service — above the high-value threshold", async () => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send({
        type: "offer",
        title: "Luxury watch",
        description: "Authentic, box and papers included, purchased new this year.",
        categories: ["Jewelry & Watches"],
        retailValue: "60000", // >= the 50000 default high_value_threshold
        location: "Dubai Marina",
        images: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
      });
    expect(res.status).toBe(200);
    expect(createdListings.at(-1)!.valueFlagged).toBe(true);
  });

  it("does not flag a business_product listing under a service-named category", async () => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/listings").set("x-test-user-id", uid)
      .send({
        type: "offer",
        title: "Wholesale event decor lot",
        description: "Bulk lot of reusable event decoration items, gently used.",
        categories: ["Events"], // avg 10000 in UAE_MARKET_AVERAGES
        retailValue: "200",
        location: "Dubai Marina",
        images: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
        listingType: "business_product",
      });
    expect(res.status).toBe(200);
    expect(createdListings.at(-1)!.valueFlagged).toBe(false);
  });
});

describe("E2E — gates that must still hold", () => {
  it("blocks an unverified email with actionable copy, not a dead end", async () => {
    const uid = betaUser({ emailVerified: false });
    const res = await request(app)
      .post("/api/listings")
      .set("x-test-user-id", uid)
      .send({
        type: "offer", title: "Something", description: "A long enough description for validation.",
        categories: ["collectibles"], retailValue: "50", location: "Dubai Marina",
        images: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(res.body.message).toMatch(/verify your email/i);
    expect(res.body.actionUrl).toBeTruthy();
    // It must NOT tell an individual to complete identity verification.
    expect(res.body.message).not.toMatch(/identity verification/i);
  });

  it("blocks a business with no approved trade licence", async () => {
    const uid = betaUser({ accountType: "business", kybStatus: "NOT_STARTED" });
    const res = await request(app)
      .post("/api/listings")
      .set("x-test-user-id", uid)
      .send({
        type: "offer", title: "Bulk stock", description: "A long enough description for validation.",
        categories: ["collectibles"], retailValue: "5000", location: "Al Quoz",
        images: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TRADE_LICENSE_REQUIRED");
    expect(res.body.requiresTradeLicense).toBe(true);
  });

  it("blocks a paused account", async () => {
    const uid = betaUser({ isPaused: true });
    const res = await request(app)
      .post("/api/listings")
      .set("x-test-user-id", uid)
      .send({
        type: "offer", title: "Something", description: "A long enough description for validation.",
        categories: ["collectibles"], retailValue: "50", location: "Dubai Marina",
        images: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
      });
    expect(res.status).toBe(403);
    expect(res.body.isPaused).toBe(true);
  });

  it("rejects an oversized image at the 10MB image limit", async () => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/upload")
      .set("x-test-user-id", uid)
      .field("type", "listing")
      .attach("file", makeJpeg(11 * 1024 * 1024), { filename: "huge.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/images is 10MB/i);
  }, 30000);

  it("rejects a video over the 100MB ceiling", async () => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/upload")
      .set("x-test-user-id", uid)
      .field("type", "listing")
      .attach("file", makeMov(101 * 1024 * 1024), { filename: "huge.mov", contentType: "video/quicktime" });

    // Multer's own ceiling trips first — the point is it is REJECTED, and not
    // at a limit far below what the UI advertises.
    expect([413, 500]).toContain(res.status);
  }, 60000);

  it("still rejects a disguised HTML file whatever its extension claims", async () => {
    const uid = betaUser();
    const res = await request(app)
      .post("/api/upload")
      .set("x-test-user-id", uid)
      .field("type", "listing")
      .attach("file", Buffer.from("<html><script>alert(1)</script></html>"), {
        filename: "evil.mp4",
        contentType: "video/mp4",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid file type/i);
  });
});
