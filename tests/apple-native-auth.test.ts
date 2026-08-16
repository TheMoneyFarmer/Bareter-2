import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { randomUUID } from "node:crypto";

// POST /api/auth/apple/native — the native Sign in with Apple endpoint added
// for the Capacitor iOS app. Google Sign-In already has a native path
// (/api/auth/google/native); this is its Apple equivalent, required for App
// Store Guideline 4.8 (any app offering a third-party login must offer an
// equivalent Sign in with Apple). Mirrors the already-proven web Apple
// callback's find/link/create logic exactly, just fed from a native
// identityToken instead of a browser redirect.
//
// Apple env vars must be set BEFORE routes.ts is imported — `appleConfigured`
// is computed once at route-registration time, and the real branch (which
// registers this endpoint) only exists when it's true.
process.env.SESSION_SECRET = "test-apple-native-secret";
process.env.NODE_ENV = "test";
process.env.APPLE_CLIENT_ID = "com.bareter.test";
process.env.APPLE_TEAM_ID = "TESTTEAM01";
process.env.APPLE_KEY_ID = "TESTKEY01";
process.env.APPLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----";
delete process.env.REPL_ID;

vi.mock("../server/db", () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  },
  // issueMobileToken() calls db.insert(mobileTokens).values(...) directly —
  // this is the one thing the shared e2e harness's `db: {}` stub doesn't
  // cover, because no existing test exercises a native OAuth route. A bare
  // `{}` here would throw "db.insert is not a function".
  db: {
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
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
    req.session = {
      userId: undefined,
      regenerate: (cb?: (err?: Error) => void) => cb && cb(),
      save: (cb?: (err?: Error) => void) => cb && cb(),
      destroy: (cb?: (err?: Error) => void) => cb && cb(),
    };
    next();
  };
  return { default: factory };
});

// The one piece that would otherwise require a real signed token verified
// against Apple's live JWKS endpoint. `decodedPayload` is set per-test to
// control what a "verified" token looks like.
let decodedPayload: Record<string, unknown> | null = null;
let verifyShouldThrow = false;
const verifyIdTokenCalls: any[] = [];
vi.mock("apple-signin-auth", () => ({
  default: {
    verifyIdToken: vi.fn(async (_token: string, opts: any) => {
      verifyIdTokenCalls.push(opts);
      if (verifyShouldThrow) throw new Error("invalid_token");
      return decodedPayload;
    }),
  },
}));

type AnyRecord = Record<string, any>;
const usersByEmail = new Map<string, AnyRecord>();
const usersByAppleId = new Map<string, AnyRecord>();
const usersById = new Map<string, AnyRecord>();

function saveUser(u: AnyRecord) {
  usersById.set(u.id, u);
  usersByEmail.set(u.email.toLowerCase(), u);
  if (u.appleId) usersByAppleId.set(u.appleId, u);
}

vi.mock("../server/storage", () => ({
  storage: new Proxy(
    {
      async getUserByAppleId(appleId: string) {
        return usersByAppleId.get(appleId);
      },
      async getUserByEmail(email: string) {
        return usersByEmail.get(email.toLowerCase());
      },
      async getUser(id: string) {
        return usersById.get(id);
      },
      async createUser(data: AnyRecord) {
        const user = { id: randomUUID(), isBanned: false, ...data };
        saveUser(user);
        return user;
      },
      async updateUser(id: string, data: AnyRecord) {
        const u = usersById.get(id);
        if (!u) return undefined;
        const next = { ...u, ...data };
        saveUser(next);
        return next;
      },
    } as AnyRecord,
    { get: (t, p: string) => (p in t ? t[p] : async () => undefined) },
  ),
}));

let app: express.Express;

beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
});

describe("POST /api/auth/apple/native", () => {
  it("requires an identityToken", async () => {
    const res = await request(app).post("/api/auth/apple/native").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/identityToken required/i);
  });

  it("rejects a token that fails Apple verification", async () => {
    verifyShouldThrow = true;
    const res = await request(app).post("/api/auth/apple/native").send({ identityToken: "garbage" });
    expect(res.status).toBe(401);
    verifyShouldThrow = false;
  });

  it("creates a brand new user on first sign-in and returns a mobileToken", async () => {
    const appleId = `apple-sub-${randomUUID()}`;
    decodedPayload = { sub: appleId, email: "new.user@example.com" };

    const res = await request(app)
      .post("/api/auth/apple/native")
      .send({ identityToken: "valid-first-time", fullName: "Ada Lovelace" });

    expect(res.status).toBe(200);
    expect(res.body.mobileToken).toBeTruthy();
    expect(res.body.email).toBe("new.user@example.com");
    expect(res.body.fullName).toBe("Ada Lovelace");
    expect(res.body.appleId).toBe(appleId);
    // Never leak the (synthetic) password back to the client.
    expect(res.body.password).toBeUndefined();
  });

  it("logs the same user back in on a later call by appleId, without a name", async () => {
    const appleId = `apple-sub-${randomUUID()}`;
    decodedPayload = { sub: appleId, email: "returning@example.com" };
    const first = await request(app)
      .post("/api/auth/apple/native")
      .send({ identityToken: "first-call", fullName: "Returning User" });
    expect(first.status).toBe(200);
    const userId = first.body.id;

    // Apple never sends the name again — client won't send `fullName` either.
    const second = await request(app)
      .post("/api/auth/apple/native")
      .send({ identityToken: "second-call" });

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(userId);
    expect(second.body.fullName).toBe("Returning User"); // untouched, not reset
    expect(second.body.mobileToken).toBeTruthy();
    expect(second.body.mobileToken).not.toBe(first.body.mobileToken); // fresh token each call
  });

  it("links Apple to an existing email/password account instead of duplicating it", async () => {
    const existing = { id: randomUUID(), email: "already-here@example.com", fullName: "Existing User", isBanned: false };
    saveUser(existing);

    const appleId = `apple-sub-${randomUUID()}`;
    decodedPayload = { sub: appleId, email: "already-here@example.com" };

    const res = await request(app)
      .post("/api/auth/apple/native")
      .send({ identityToken: "link-me" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(existing.id); // same account, not a new one
    expect(usersByAppleId.get(appleId)?.id).toBe(existing.id);
  });

  it("checks the token audience against BOTH the web Services ID and the app bundle ID", async () => {
    // A native ASAuthorizationController token carries aud=bundleId, not the
    // web Services ID. Checking only the Services ID here would silently
    // reject every real device sign-in — a bug only a physical iPhone with a
    // real Apple ID would ever surface, so it's pinned here instead.
    verifyIdTokenCalls.length = 0;
    decodedPayload = { sub: `apple-sub-${randomUUID()}`, email: "audience-check@example.com" };
    const res = await request(app).post("/api/auth/apple/native").send({ identityToken: "check-audience" });

    expect(res.status).toBe(200);
    const lastCall = verifyIdTokenCalls.at(-1);
    expect(lastCall.audience).toEqual(
      expect.arrayContaining(["com.bareter.test", "com.bareter.app"]),
    );
  });

  it("blocks a banned account", async () => {
    const appleId = `apple-sub-${randomUUID()}`;
    saveUser({ id: randomUUID(), email: "banned@example.com", appleId, isBanned: true });
    decodedPayload = { sub: appleId, email: "banned@example.com" };

    const res = await request(app).post("/api/auth/apple/native").send({ identityToken: "banned-user" });
    expect(res.status).toBe(403);
  });

  it("falls back to Apple's private-relay address when no email is shared", async () => {
    const appleId = `apple-sub-${randomUUID()}`;
    decodedPayload = { sub: appleId }; // no email at all — a real Apple case
    const res = await request(app).post("/api/auth/apple/native").send({ identityToken: "no-email" });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(`apple_${appleId}@privaterelay.appleid.com`);
    // Never actually verified by anyone — must not be marked verified.
    expect(res.body.emailVerified).toBe(false);
  });
});
