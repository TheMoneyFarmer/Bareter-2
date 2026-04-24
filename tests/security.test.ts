import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// SSRF guard on the Vision client
// ---------------------------------------------------------------------------

vi.mock("node:dns/promises", async () => {
  const actual = await vi.importActual<typeof import("node:dns/promises")>(
    "node:dns/promises",
  );
  return {
    ...actual,
    default: {
      ...actual,
      lookup: vi.fn(),
    },
    lookup: vi.fn(),
  };
});

import dns from "node:dns/promises";
import { assertSafeImageUrl } from "../server/visionClient";

describe("SSRF guard (assertSafeImageUrl)", () => {
  beforeEach(() => {
    (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("rejects http:// URLs", async () => {
    await expect(
      assertSafeImageUrl("http://images.example.com/cat.jpg"),
    ).rejects.toThrow(/non_https_url/);
  });

  it("rejects raw IPv4 literals even over https", async () => {
    await expect(
      assertSafeImageUrl("https://192.0.2.10/cat.jpg"),
    ).rejects.toThrow(/ip_literal_blocked/);
  });

  it("rejects raw IPv6 literals", async () => {
    await expect(
      assertSafeImageUrl("https://[::1]/cat.jpg"),
    ).rejects.toThrow(/ip_literal_blocked/);
  });

  it("rejects hostnames that resolve to loopback/private addresses", async () => {
    (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(
      assertSafeImageUrl("https://attacker.example/cat.jpg"),
    ).rejects.toThrow(/private_resolved_ip/);

    (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: "10.0.0.5", family: 4 },
    ]);
    await expect(
      assertSafeImageUrl("https://attacker.example/cat.jpg"),
    ).rejects.toThrow(/private_resolved_ip/);

    (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: "169.254.169.254", family: 4 },
    ]);
    await expect(
      assertSafeImageUrl("https://metadata.example/cat.jpg"),
    ).rejects.toThrow(/private_resolved_ip/);
  });

  it("allows hostnames that resolve to public addresses", async () => {
    (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
    ]);
    const url = await assertSafeImageUrl("https://cdn.example.com/cat.jpg");
    expect(url.hostname).toBe("cdn.example.com");
  });

  it("rejects malformed URLs", async () => {
    await expect(assertSafeImageUrl("not a url")).rejects.toThrow(
      /invalid_url/,
    );
  });
});

// ---------------------------------------------------------------------------
// Moderation agent fail-closed behavior
// ---------------------------------------------------------------------------

vi.mock("../server/agents/llm", () => ({
  jsonCompletion: vi.fn(),
  chatCompletion: vi.fn(),
}));

import { jsonCompletion, chatCompletion } from "../server/agents/llm";
import { moderateContent } from "../server/agents/moderationAgent";

describe("Moderation agent fail-closed", () => {
  beforeEach(() => {
    (jsonCompletion as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("flags content when the model throws", async () => {
    (jsonCompletion as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom"),
    );
    const result = await moderateContent("listing", { title: "x" });
    expect(result.action).toBe("flagged");
    expect(result.confidence).toBe(0);
  });

  it("flags content when the model returns invalid JSON shape", async () => {
    (jsonCompletion as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { hello: "world" },
      tokensUsed: 0,
    });
    const result = await moderateContent("listing", { title: "x" });
    expect(result.action).toBe("flagged");
  });

  it("flags content when action is outside the allowed enum", async () => {
    (jsonCompletion as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        action: "definitely-allow-this",
        reason: "ok",
        confidence: 1,
        categories: [],
      },
      tokensUsed: 0,
    });
    const result = await moderateContent("listing", { title: "x" });
    expect(result.action).toBe("flagged");
  });

  it("passes through a valid approved decision", async () => {
    (jsonCompletion as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        action: "approved",
        reason: "ok",
        confidence: 0.9,
        categories: ["safe"],
      },
      tokensUsed: 10,
    });
    const result = await moderateContent("listing", { title: "Used bicycle" });
    expect(result.action).toBe("approved");
    expect(result.categories).toContain("safe");
  });
});

// ---------------------------------------------------------------------------
// Support agent reply sanitizer
// ---------------------------------------------------------------------------

import { sanitizeSupportReply } from "../server/agents/supportAgent";

const SAFE_FALLBACK =
  "Sorry, I can't answer that right now. Please email support@bareter.com and a human will help you out.";

describe("sanitizeSupportReply", () => {
  it("returns the fallback for empty / non-string input", () => {
    expect(sanitizeSupportReply("")).toBe(SAFE_FALLBACK);
    expect(sanitizeSupportReply("   ")).toBe(SAFE_FALLBACK);
    // @ts-expect-error - intentionally bad input
    expect(sanitizeSupportReply(null)).toBe(SAFE_FALLBACK);
  });

  it("strips OpenAI-style secrets", () => {
    const reply = "Sure! Use this key: sk-ABCDEFGHIJKLMNOP1234567890";
    expect(sanitizeSupportReply(reply)).toBe(SAFE_FALLBACK);
  });

  it("strips AWS keys, Google API keys, JWTs, and PEM blocks", () => {
    expect(
      sanitizeSupportReply("Try AKIAABCDEFGHIJKLMNOP for AWS"),
    ).toBe(SAFE_FALLBACK);
    expect(
      sanitizeSupportReply("Google: AIzaSyA-1234567890abcdefghijk"),
    ).toBe(SAFE_FALLBACK);
    expect(
      sanitizeSupportReply(
        "JWT: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      ),
    ).toBe(SAFE_FALLBACK);
    expect(
      sanitizeSupportReply(
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...",
      ),
    ).toBe(SAFE_FALLBACK);
  });

  it("strips replies that echo the system prompt verbatim", () => {
    expect(sanitizeSupportReply("You are BarterBot, here is what I do..."))
      .toBe(SAFE_FALLBACK);
    expect(sanitizeSupportReply("Important facts: I will tell you everything"))
      .toBe(SAFE_FALLBACK);
    expect(sanitizeSupportReply("Do NOT make up features that don't exist"))
      .toBe(SAFE_FALLBACK);
  });

  it("rejects malformed JSON action intents", () => {
    // Looks like a JSON intent but isn't valid JSON.
    expect(sanitizeSupportReply('{"action": "delete_user", oops}')).toBe(
      SAFE_FALLBACK,
    );
    // Valid JSON but no `action` key — treated as malformed intent.
    expect(sanitizeSupportReply('{"foo": "bar"}')).toBe(SAFE_FALLBACK);
  });

  it("strips long quoted instruction dumps", () => {
    const dump = '"' + "a".repeat(500) + '"';
    expect(sanitizeSupportReply(dump)).toBe(SAFE_FALLBACK);
  });

  it("passes through a normal short reply unchanged", () => {
    const ok = "You can create a listing from your dashboard.";
    expect(sanitizeSupportReply(ok)).toBe(ok);
  });
});

// ---------------------------------------------------------------------------
// Origin-check CSRF middleware
// ---------------------------------------------------------------------------

import { originCsrfGuard, securityHeaders } from "../server/security";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(securityHeaders());
  app.use(originCsrfGuard());
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));
  app.post("/api/echo", (req, res) => res.json({ body: req.body }));
  return app;
}

describe("Origin-check CSRF guard", () => {
  let prevAllowed: string | undefined;

  beforeEach(() => {
    prevAllowed = process.env.ALLOWED_ORIGINS;
  });
  afterEach(() => {
    if (prevAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = prevAllowed;
  });

  it("allows safe-method requests without an Origin", async () => {
    const app = buildApp();
    const r = await request(app).get("/api/ping");
    expect(r.status).toBe(200);
  });

  it("blocks cross-origin POST", async () => {
    process.env.ALLOWED_ORIGINS = "https://app.example.com";
    const app = buildApp();
    const r = await request(app)
      .post("/api/echo")
      .set("Origin", "https://evil.example.com")
      .send({ a: 1 });
    expect(r.status).toBe(403);
  });

  it("blocks POST with no Origin and no Referer", async () => {
    process.env.ALLOWED_ORIGINS = "https://app.example.com";
    const app = buildApp();
    const r = await request(app).post("/api/echo").send({ a: 1 });
    expect(r.status).toBe(403);
  });

  it("allows same-origin POST (Origin matches request Host)", async () => {
    delete process.env.ALLOWED_ORIGINS;
    const app = buildApp();
    const r = await request(app)
      .post("/api/echo")
      .set("Host", "myapp.local")
      .set("Origin", "https://myapp.local")
      .send({ a: 1 });
    expect(r.status).toBe(200);
  });

  it("allows POST whose Origin matches the configured allowlist", async () => {
    process.env.ALLOWED_ORIGINS = "https://app.example.com";
    const app = buildApp();
    const r = await request(app)
      .post("/api/echo")
      .set("Origin", "https://app.example.com")
      .send({ hi: 1 });
    expect(r.status).toBe(200);
  });

  it("sets standard helmet security headers", async () => {
    const app = buildApp();
    const r = await request(app).get("/api/ping");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBeDefined();
    expect(r.headers["referrer-policy"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Strict input schemas: register + admin KYB
// ---------------------------------------------------------------------------

import { registerSchema, adminKybStatusSchema } from "@shared/schema";

describe("registerSchema (strict)", () => {
  const base = {
    email: "alice@example.com",
    password: "supersecret",
    fullName: "Alice Example",
    country: "AE",
    city: "Dubai",
  };

  it("accepts a valid payload", () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it("rejects unknown fields like isAdmin", () => {
    const r = registerSchema.safeParse({ ...base, isAdmin: true });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields like role / kybStatus / id", () => {
    expect(registerSchema.safeParse({ ...base, role: "admin" }).success).toBe(
      false,
    );
    expect(
      registerSchema.safeParse({ ...base, kybStatus: "APPROVED" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...base, id: "00000000-..." }).success,
    ).toBe(false);
  });

  it("rejects invalid email / short password", () => {
    expect(
      registerSchema.safeParse({ ...base, email: "not-an-email" }).success,
    ).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "abc" }).success).toBe(
      false,
    );
  });
});

describe("adminKybStatusSchema (whitelist)", () => {
  const allowed = [
    "NOT_STARTED",
    "IN_PROGRESS",
    "PENDING_REVIEW",
    "APPROVED",
    "DECLINED",
  ];

  it.each(allowed)("accepts %s", (status) => {
    expect(adminKybStatusSchema.safeParse({ status }).success).toBe(true);
  });

  it("rejects arbitrary strings", () => {
    expect(
      adminKybStatusSchema.safeParse({ status: "SUPER_APPROVED" }).success,
    ).toBe(false);
    expect(adminKybStatusSchema.safeParse({ status: "approved" }).success).toBe(
      false,
    );
  });

  it("rejects non-string status (arrays, SQL fragments, objects)", () => {
    expect(
      adminKybStatusSchema.safeParse({ status: ["APPROVED"] }).success,
    ).toBe(false);
    expect(
      adminKybStatusSchema.safeParse({ status: { raw: "APPROVED" } }).success,
    ).toBe(false);
    expect(
      adminKybStatusSchema.safeParse({ status: "APPROVED; DROP TABLE users" })
        .success,
    ).toBe(false);
  });

  it("rejects unknown fields alongside status", () => {
    expect(
      adminKybStatusSchema.safeParse({ status: "APPROVED", extra: 1 }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Private-doc download authorization
// ---------------------------------------------------------------------------

import {
  isValidPrivateDocPath,
  canAccessPrivateDoc,
} from "../server/security";

describe("Private-doc download auth", () => {
  const validUserId = "abc123-DEF";
  const validFilename = "a".repeat(48) + ".pdf";

  it("accepts a well-formed user id and 48-hex filename", () => {
    expect(isValidPrivateDocPath(validUserId, validFilename)).toBe(true);
  });

  it("rejects path-traversal in user id", () => {
    expect(isValidPrivateDocPath("../etc", validFilename)).toBe(false);
    expect(isValidPrivateDocPath("a/b", validFilename)).toBe(false);
  });

  it("rejects filenames that aren't 48-hex.<ext>", () => {
    expect(isValidPrivateDocPath(validUserId, "../escape.pdf")).toBe(false);
    expect(isValidPrivateDocPath(validUserId, "short.pdf")).toBe(false);
    expect(isValidPrivateDocPath(validUserId, validFilename + "/x")).toBe(
      false,
    );
  });

  it("allows the owner to download their own doc", () => {
    expect(
      canAccessPrivateDoc({
        callerId: "u1",
        ownerId: "u1",
        isAdmin: false,
      }),
    ).toBe(true);
  });

  it("allows admins to download any doc", () => {
    expect(
      canAccessPrivateDoc({
        callerId: "admin",
        ownerId: "u1",
        isAdmin: true,
      }),
    ).toBe(true);
  });

  it("forbids non-owner non-admin", () => {
    expect(
      canAccessPrivateDoc({
        callerId: "u2",
        ownerId: "u1",
        isAdmin: false,
      }),
    ).toBe(false);
  });

  it("forbids unauthenticated callers", () => {
    expect(
      canAccessPrivateDoc({
        callerId: null,
        ownerId: "u1",
        isAdmin: true,
      }),
    ).toBe(false);
  });
});

// chatCompletion is mocked above so its import isn't tree-shaken away.
void chatCompletion;

// ---------------------------------------------------------------------------
// Route-level tests for the production handlers
// ---------------------------------------------------------------------------

import {
  makeRegisterValidator,
  makeAdminKybValidator,
  makePrivateDocAuthGate,
} from "../server/handlers/securitySensitive";

describe("POST /api/auth/register (route)", () => {
  function buildApp() {
    const app = express();
    app.use(express.json());
    app.post("/api/auth/register", makeRegisterValidator(), (_req, res) => {
      // Stand-in for the production DB write — proves validation passed.
      res.status(200).json({ ok: true, data: res.locals.registerData });
    });
    return app;
  }

  const validBody = {
    email: "alice@example.com",
    password: "supersecret",
    fullName: "Alice Example",
    country: "AE",
    city: "Dubai",
  };

  it("accepts a valid payload (200)", async () => {
    const r = await request(buildApp()).post("/api/auth/register").send(validBody);
    expect(r.status).toBe(200);
    expect(r.body.data.email).toBe("alice@example.com");
  });

  it("rejects unknown isAdmin field with 400", async () => {
    const r = await request(buildApp())
      .post("/api/auth/register")
      .send({ ...validBody, isAdmin: true });
    expect(r.status).toBe(400);
  });

  it("rejects unknown role / kybStatus fields with 400", async () => {
    for (const extra of [{ role: "admin" }, { kybStatus: "APPROVED" }, { id: "x" }]) {
      const r = await request(buildApp())
        .post("/api/auth/register")
        .send({ ...validBody, ...extra });
      expect(r.status).toBe(400);
    }
  });
});

describe("PATCH /api/admin/users/:id/kyb (route)", () => {
  function buildApp() {
    const app = express();
    app.use(express.json());
    // No requireAuth/requireAdmin in the test app — we're proving the
    // input-validation gate fails closed regardless of who's calling.
    app.patch(
      "/api/admin/users/:id/kyb",
      makeAdminKybValidator(),
      (_req, res) => {
        res.status(200).json({ ok: true, status: res.locals.kybStatus });
      },
    );
    return app;
  }

  it("accepts whitelisted statuses (200)", async () => {
    for (const status of [
      "NOT_STARTED",
      "IN_PROGRESS",
      "PENDING_REVIEW",
      "APPROVED",
      "DECLINED",
    ]) {
      const r = await request(buildApp())
        .patch("/api/admin/users/abc/kyb")
        .send({ status });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe(status);
    }
  });

  it("rejects non-whitelisted status with 400", async () => {
    const r = await request(buildApp())
      .patch("/api/admin/users/abc/kyb")
      .send({ status: "SUPER_APPROVED" });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/NOT_STARTED.*APPROVED/);
  });

  it("rejects array / object / SQL-fragment status with 400", async () => {
    for (const status of [
      ["APPROVED"],
      { raw: "APPROVED" },
      "APPROVED; DROP TABLE users",
    ]) {
      const r = await request(buildApp())
        .patch("/api/admin/users/abc/kyb")
        .send({ status });
      expect(r.status).toBe(400);
    }
  });

  it("rejects extra unknown fields alongside status", async () => {
    const r = await request(buildApp())
      .patch("/api/admin/users/abc/kyb")
      .send({ status: "APPROVED", extra: 1 });
    expect(r.status).toBe(400);
  });
});

describe("GET /api/private-docs/:userId/:filename (route)", () => {
  // A storage stub that lets us pretend to be admin or non-admin.
  function buildApp(opts: {
    sessionUserId?: string | null;
    isAdmin?: boolean;
  }) {
    const app = express();
    // Inject a minimal session.
    app.use((req: any, _res, next) => {
      req.session = opts.sessionUserId
        ? { userId: opts.sessionUserId }
        : {};
      next();
    });
    const stub = {
      getUser: async (id: string) =>
        id === opts.sessionUserId
          ? { isAdmin: !!opts.isAdmin }
          : { isAdmin: false },
    };
    app.get(
      "/api/private-docs/:userId/:filename",
      makePrivateDocAuthGate({ getUser: stub.getUser }),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    return app;
  }

  const validFilename = "a".repeat(48) + ".pdf";

  it("allows the owner (200)", async () => {
    const r = await request(buildApp({ sessionUserId: "user-1" })).get(
      `/api/private-docs/user-1/${validFilename}`,
    );
    expect(r.status).toBe(200);
  });

  it("allows admins downloading other users' docs (200)", async () => {
    const r = await request(
      buildApp({ sessionUserId: "admin-1", isAdmin: true }),
    ).get(`/api/private-docs/user-2/${validFilename}`);
    expect(r.status).toBe(200);
  });

  it("forbids non-owner non-admin (403)", async () => {
    const r = await request(buildApp({ sessionUserId: "user-2" })).get(
      `/api/private-docs/user-1/${validFilename}`,
    );
    expect(r.status).toBe(403);
  });

  it("rejects unauthenticated callers (401)", async () => {
    const r = await request(buildApp({})).get(
      `/api/private-docs/user-1/${validFilename}`,
    );
    expect(r.status).toBe(401);
  });

  it("rejects path-traversal in filename with 400", async () => {
    const r = await request(buildApp({ sessionUserId: "user-1" })).get(
      "/api/private-docs/user-1/..%2Fescape.pdf",
    );
    expect(r.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Audit hardening: rate limits, hashed reset tokens, magic-byte sniffing,
// unified bcrypt cost
// ---------------------------------------------------------------------------

import bcrypt from "bcryptjs";
import {
  BCRYPT_ROUNDS,
  hashPassword,
  hashResetToken,
  detectAllowedFileType,
  ALLOWED_UPLOAD_MIMES,
  makeLoginRateLimiter,
  makeRegisterRateLimiter,
  makeForgotPasswordRateLimiter,
} from "../server/handlers/authHardening";

describe("Auth rate limiters", () => {
  function appWithLimiter(limiter: ReturnType<typeof makeLoginRateLimiter>, path: string) {
    const app = express();
    app.use(express.json());
    app.post(path, limiter, (_req, res) => res.json({ ok: true }));
    return app;
  }

  // Force every test request to share a key so the bucket fills quickly.
  const fixedKey = { keyGenerator: () => "test-bucket" };

  it("returns 429 on /api/auth/login after the configured threshold", async () => {
    const limiter = makeLoginRateLimiter({ ...fixedKey, limit: 2, windowMs: 60_000 });
    const app = appWithLimiter(limiter, "/api/auth/login");
    const r1 = await request(app).post("/api/auth/login").send({});
    const r2 = await request(app).post("/api/auth/login").send({});
    const r3 = await request(app).post("/api/auth/login").send({});
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.body.message).toMatch(/login/i);
  });

  it("returns 429 on /api/auth/register after the configured threshold", async () => {
    const limiter = makeRegisterRateLimiter({ ...fixedKey, limit: 2, windowMs: 60_000 });
    const app = appWithLimiter(limiter, "/api/auth/register");
    const r1 = await request(app).post("/api/auth/register").send({});
    const r2 = await request(app).post("/api/auth/register").send({});
    const r3 = await request(app).post("/api/auth/register").send({});
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.body.message).toMatch(/registration/i);
  });

  it("returns 429 on /api/auth/forgot-password after the configured threshold", async () => {
    const limiter = makeForgotPasswordRateLimiter({ ...fixedKey, limit: 3, windowMs: 60_000 });
    const app = appWithLimiter(limiter, "/api/auth/forgot-password");
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post("/api/auth/forgot-password").send({});
      codes.push(r.status);
    }
    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes[3]).toBe(429);
  });

  it("uses the audit-required production thresholds by default", () => {
    // The factories construct middleware whose .options carry the limit/windowMs
    // we configured. We re-read them by hitting the limiter and inspecting the
    // standard rate-limit response header on the very first request.
    const cases = [
      { limiter: makeLoginRateLimiter(fixedKey), path: "/x", expectLimit: 10 },
      { limiter: makeRegisterRateLimiter(fixedKey), path: "/x", expectLimit: 5 },
      { limiter: makeForgotPasswordRateLimiter(fixedKey), path: "/x", expectLimit: 3 },
    ];
    return Promise.all(
      cases.map(async ({ limiter, expectLimit }) => {
        const app = appWithLimiter(limiter, "/x");
        const r = await request(app).post("/x").send({});
        // express-rate-limit draft-7 emits `RateLimit` with `limit=N`.
        const header = r.headers["ratelimit"] || r.headers["ratelimit-policy"] || "";
        expect(String(header)).toContain(String(expectLimit));
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// AI rate limiters (IPv6-safe)
// ---------------------------------------------------------------------------

import {
  makeAiPerMinuteLimiter,
  makeAiPerDayLimiter,
  aiUserKey,
} from "../server/handlers/aiRateLimit";

describe("AI rate limiters", () => {
  function appWithLimiter(
    limiter: ReturnType<typeof makeAiPerMinuteLimiter>,
    path: string,
  ) {
    const app = express();
    app.use(express.json());
    app.post(path, limiter, (_req, res) => res.json({ ok: true }));
    return app;
  }

  const fixedKey = { keyGenerator: () => "test-bucket" };

  it("returns 429 on the per-minute limiter after the configured threshold", async () => {
    const limiter = makeAiPerMinuteLimiter({
      ...fixedKey,
      limit: 2,
      windowMs: 60_000,
    });
    const app = appWithLimiter(limiter, "/api/ai/x");
    const r1 = await request(app).post("/api/ai/x").send({});
    const r2 = await request(app).post("/api/ai/x").send({});
    const r3 = await request(app).post("/api/ai/x").send({});
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.body.message).toMatch(/AI/i);
  });

  it("returns 429 on the per-day limiter after the configured threshold", async () => {
    const limiter = makeAiPerDayLimiter({
      ...fixedKey,
      limit: 2,
      windowMs: 24 * 60 * 60 * 1000,
    });
    const app = appWithLimiter(limiter, "/api/ai/y");
    const r1 = await request(app).post("/api/ai/y").send({});
    const r2 = await request(app).post("/api/ai/y").send({});
    const r3 = await request(app).post("/api/ai/y").send({});
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.body.message).toMatch(/daily/i);
  });

  it("uses the audit-required production thresholds by default", async () => {
    for (const { limiter, expectLimit } of [
      { limiter: makeAiPerMinuteLimiter(fixedKey), expectLimit: 10 },
      { limiter: makeAiPerDayLimiter(fixedKey), expectLimit: 200 },
    ]) {
      const app = appWithLimiter(limiter, "/x");
      const r = await request(app).post("/x").send({});
      const header =
        r.headers["ratelimit"] || r.headers["ratelimit-policy"] || "";
      expect(String(header)).toContain(String(expectLimit));
    }
  });

  it("prefers the session user id over the IP", () => {
    const req = { session: { userId: "abc" }, ip: "1.2.3.4" } as any;
    expect(aiUserKey(req)).toBe("u:abc");
  });

  it("normalises an IPv6 client through ipKeyGenerator so low-order bits can't bypass the limit", async () => {
    // Two requests from different /128 addresses inside the same /64 should
    // collapse to the same bucket. We construct the limiter with the real
    // user-key generator and a tiny limit so the second hit overflows.
    const limiter = makeAiPerMinuteLimiter({ limit: 1, windowMs: 60_000 });
    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());
    app.post("/api/ai/z", limiter, (_req, res) => res.json({ ok: true }));

    const ipA = "2001:db8::1";
    const ipB = "2001:db8::2"; // same /64 as ipA
    const r1 = await request(app)
      .post("/api/ai/z")
      .set("X-Forwarded-For", ipA)
      .send({});
    const r2 = await request(app)
      .post("/api/ai/z")
      .set("X-Forwarded-For", ipB)
      .send({});
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(429);
  });
});

describe("Hashed password-reset tokens", () => {
  it("hashes raw tokens with SHA-256 (64-hex chars, never the raw value)", () => {
    const raw = "abcdef0123456789";
    const hashed = hashResetToken(raw);
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
    expect(hashed).not.toBe(raw);
  });

  it("is deterministic so lookups by hash succeed", () => {
    expect(hashResetToken("same")).toBe(hashResetToken("same"));
    expect(hashResetToken("a")).not.toBe(hashResetToken("b"));
  });

  it("simulated forgot-password flow stores only the hash, not the raw token", async () => {
    // Mirror the production handler: the route generates a random token,
    // emails the RAW value, and writes hashResetToken(raw) into the DB.
    const updates: Array<{ id: string; data: any }> = [];
    const stubStorage = {
      getUserByEmail: async (_email: string) => ({ id: "u1" }),
      updateUser: async (id: string, data: any) => {
        updates.push({ id, data });
        return { id, ...data };
      },
    };
    const emailedTokens: string[] = [];
    const sendResetEmail = async (_to: string, token: string) => {
      emailedTokens.push(token);
    };

    // Reproduce the small slice of the production handler under test.
    const raw = "deadbeefdeadbeefdeadbeefdeadbeef";
    const user = await stubStorage.getUserByEmail("alice@example.com");
    if (user) {
      await stubStorage.updateUser(user.id, {
        passwordResetToken: hashResetToken(raw),
        passwordResetExpires: new Date(Date.now() + 3_600_000),
      });
      await sendResetEmail("alice@example.com", raw);
    }

    expect(updates).toHaveLength(1);
    const stored = updates[0].data.passwordResetToken;
    expect(stored).toBe(hashResetToken(raw));
    expect(stored).not.toBe(raw);
    // The raw token is what users actually click — it must be the only
    // place the unhashed value ever appears.
    expect(emailedTokens).toEqual([raw]);
  });
});

describe("Magic-byte upload sniffing (detectAllowedFileType)", () => {
  it("rejects an HTML file masquerading as .jpg", async () => {
    const html = Buffer.from(
      "<!doctype html><html><body><script>alert(1)</script></body></html>",
      "utf8",
    );
    const detected = await detectAllowedFileType(html);
    expect(detected).toBeNull();
  });

  it("rejects an arbitrary text payload", async () => {
    const txt = Buffer.from("just plain text, definitely not an image", "utf8");
    expect(await detectAllowedFileType(txt)).toBeNull();
  });

  it("rejects an empty buffer", async () => {
    expect(await detectAllowedFileType(Buffer.alloc(0))).toBeNull();
  });

  it("rejects an SVG (XML, not in allow-list) even with image-y bytes", async () => {
    const svg = Buffer.from(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>',
      "utf8",
    );
    expect(await detectAllowedFileType(svg)).toBeNull();
  });

  it("accepts a real JPEG buffer (magic bytes FF D8 FF)", async () => {
    // Minimal valid JPEG-of-EXIF header that file-type recognises as image/jpeg.
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);
    const detected = await detectAllowedFileType(jpeg);
    expect(detected).not.toBeNull();
    expect(detected?.mime).toBe("image/jpeg");
    expect(ALLOWED_UPLOAD_MIMES.has(detected!.mime)).toBe(true);
  });

  it("accepts a real PNG buffer (magic bytes 89 50 4E 47)", async () => {
    // 1x1 transparent PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    const detected = await detectAllowedFileType(png);
    expect(detected?.mime).toBe("image/png");
  });
});

// ---------------------------------------------------------------------------
// Didit webhook: indexed lookup must not regress to a full table scan
// ---------------------------------------------------------------------------

import {
  makeDiditWebhookHandler,
  type DiditUserProjection,
  type DiditUserUpdate,
  type DiditWebhookStorage,
} from "../server/handlers/diditWebhook";
import { users as usersTable } from "@shared/schema";
import type { InsertNotification } from "@shared/schema";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { Request, Response, NextFunction } from "express";

interface ScanGuardedStorage extends DiditWebhookStorage {
  getAllUsers(): Promise<never>;
}

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

interface DiditTestCalls {
  getUserByDiditSessionId: string[];
  updateUser: Array<{ id: string; data: DiditUserUpdate }>;
  createNotification: InsertNotification[];
}

describe("Didit webhook indexed lookup", () => {
  function buildApp(opts: {
    storage: DiditWebhookStorage;
    verifyWebhookSignature?: (payload: string, sig: string) => boolean;
  }) {
    const app = express();
    // Mimic the production rawBody capture used by the webhook handler.
    app.use(
      express.json({
        verify: (req: Request, _res: Response, buf: Buffer) => {
          (req as RawBodyRequest).rawBody = buf;
        },
      }),
    );
    app.post(
      "/api/webhooks/didit",
      (req: Request, res: Response, next: NextFunction) =>
        makeDiditWebhookHandler({
          storage: opts.storage,
          verifyWebhookSignature:
            opts.verifyWebhookSignature ?? (() => true),
        })(req, res).catch(next),
    );
    return app;
  }

  function makeStorageStub(user: DiditUserProjection | undefined) {
    const calls: DiditTestCalls = {
      getUserByDiditSessionId: [],
      updateUser: [],
      createNotification: [],
    };
    const stub: ScanGuardedStorage = {
      getUserByDiditSessionId: async (sessionId: string) => {
        calls.getUserByDiditSessionId.push(sessionId);
        return user;
      },
      updateUser: async (id: string, data: DiditUserUpdate) => {
        calls.updateUser.push({ id, data });
        return { id, accountType: user?.accountType ?? "individual" };
      },
      createNotification: async (n: InsertNotification) => {
        calls.createNotification.push(n);
        return n;
      },
      // Forbidden method — if the handler ever falls back to a scan, this
      // throws and the test fails loudly.
      getAllUsers: async () => {
        throw new Error(
          "regression: Didit webhook fell back to a full users scan",
        );
      },
    };
    return { stub, calls };
  }

  it("looks the user up by indexed session id and never scans all users", async () => {
    const { stub, calls } = makeStorageStub({
      id: "u1",
      accountType: "individual",
    });
    const app = buildApp({ storage: stub });

    const r = await request(app)
      .post("/api/webhooks/didit")
      .send({ session_id: "sess-123", status: "APPROVED" });

    expect(r.status).toBe(200);
    expect(calls.getUserByDiditSessionId).toEqual(["sess-123"]);
    expect(calls.updateUser).toHaveLength(1);
    expect(calls.updateUser[0].id).toBe("u1");
    expect(calls.updateUser[0].data.kycStatus).toBe("APPROVED");
    expect(calls.updateUser[0].data.isVerified).toBe(true);
  });

  it("uses kybStatus for business accounts", async () => {
    const { stub, calls } = makeStorageStub({
      id: "biz1",
      accountType: "business",
    });
    const app = buildApp({ storage: stub });

    const r = await request(app)
      .post("/api/webhooks/didit")
      .send({ session_id: "sess-biz", status: "APPROVED" });

    expect(r.status).toBe(200);
    expect(calls.getUserByDiditSessionId).toEqual(["sess-biz"]);
    expect(calls.updateUser[0].data.kybStatus).toBe("APPROVED");
    expect(calls.updateUser[0].data.kycStatus).toBeUndefined();
  });

  it("returns 200 and does NOT scan when the session id is unknown", async () => {
    const { stub, calls } = makeStorageStub(undefined);
    const app = buildApp({ storage: stub });

    const r = await request(app)
      .post("/api/webhooks/didit")
      .send({ session_id: "missing", status: "APPROVED" });

    expect(r.status).toBe(200);
    expect(calls.getUserByDiditSessionId).toEqual(["missing"]);
    expect(calls.updateUser).toHaveLength(0);
  });

  it("rejects payloads with an invalid signature without touching storage", async () => {
    const { stub, calls } = makeStorageStub({
      id: "u1",
      accountType: "individual",
    });
    const app = buildApp({
      storage: stub,
      verifyWebhookSignature: () => false,
    });

    const r = await request(app)
      .post("/api/webhooks/didit")
      .send({ session_id: "sess-123", status: "APPROVED" });

    expect(r.status).toBe(401);
    expect(calls.getUserByDiditSessionId).toHaveLength(0);
  });

  it("rejects payloads missing session_id", async () => {
    const { stub, calls } = makeStorageStub(undefined);
    const app = buildApp({ storage: stub });

    const r = await request(app)
      .post("/api/webhooks/didit")
      .send({ status: "APPROVED" });

    expect(r.status).toBe(400);
    expect(calls.getUserByDiditSessionId).toHaveLength(0);
  });
});

describe("Didit indexed-column schema invariants", () => {
  const config = getTableConfig(usersTable);

  it("users table still exposes a didit_session_id column", () => {
    const col = config.columns.find((c) => c.name === "didit_session_id");
    expect(col).toBeDefined();
  });

  it("declares the users_didit_session_id_idx index on didit_session_id", () => {
    const idx = config.indexes.find(
      (i) => i.config.name === "users_didit_session_id_idx",
    );
    expect(idx).toBeDefined();
    const indexedColumnNames = idx!.config.columns
      .map((c) => ("name" in c ? c.name : undefined))
      .filter((n): n is string => typeof n === "string");
    expect(indexedColumnNames).toContain("didit_session_id");
  });
});

// ---------------------------------------------------------------------------
// Stripe webhook removal: the success-fee / Stripe checkout path was retired
// because Bareter is free for everyone. The webhook handler module, the
// /api/webhooks/stripe route, the success_fee / stripe_payment_id columns,
// and the deal-checkout endpoint were all deleted as a unit. The block of
// regression tests that used to exercise the indexed lookup against a
// scan-guarded storage stub were removed at the same time so they would not
// silently re-import a deleted module.
// ---------------------------------------------------------------------------

describe("Unified bcrypt cost (BCRYPT_ROUNDS)", () => {
  it("constant equals the audit-required value (12)", () => {
    expect(BCRYPT_ROUNDS).toBe(12);
  });

  it("hashPassword (used by register, change-password, and reset) uses BCRYPT_ROUNDS", async () => {
    const hash = await hashPassword("supersecret");
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_ROUNDS);
    // Round-trip sanity check so a future regression to plaintext fails loudly.
    expect(await bcrypt.compare("supersecret", hash)).toBe(true);
  });

  it("two independent hashes both come out at the configured cost", async () => {
    const [a, b] = await Promise.all([
      hashPassword("one"),
      hashPassword("two"),
    ]);
    expect(bcrypt.getRounds(a)).toBe(12);
    expect(bcrypt.getRounds(b)).toBe(12);
    expect(a).not.toBe(b);
  });
});
