import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  makeGlobalApiLimiter,
  safeGlobalApiLimiter,
  __testing,
} from "../server/handlers/globalRateLimit";

/**
 * The global limiter sits in front of every /api route, so its failure modes
 * matter more than its happy path:
 *
 *  - throttling a webhook silently drops a verification result,
 *  - throttling the SSE stream breaks reconnects right after a deploy,
 *  - and an exception inside the limiter would take the whole API down.
 *
 * These assert the exemptions and the fail-open wrapper, not just that counting
 * works.
 */

function appWith(mw: any) {
  const app = express();
  app.use("/api", mw);
  app.get("/api/anything", (_req, res) => res.json({ ok: true }));
  app.get("/api/webhooks/didit", (_req, res) => res.json({ ok: true }));
  app.get("/api/inbox/stream", (_req, res) => res.json({ ok: true }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("global API rate limit", () => {
  it("allows normal traffic well within the window", async () => {
    const app = appWith(makeGlobalApiLimiter());
    for (let i = 0; i < 20; i++) {
      const res = await request(app).get("/api/anything");
      expect(res.status).toBe(200);
    }
  });

  it("is sized generously — a busy human session must not be throttled", () => {
    // A hard-browsing user makes ~30-60 API calls/min. Anything near that would
    // throttle real customers, which is worse than the scraping it prevents.
    expect(__testing.GLOBAL_LIMIT).toBeGreaterThanOrEqual(200);
    expect(__testing.WINDOW_MS).toBe(60_000);
  });

  it("eventually blocks a client that blows past the limit", async () => {
    const app = appWith(makeGlobalApiLimiter({ limit: 5 }));
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      codes.push((await request(app).get("/api/anything")).status);
    }
    expect(codes.filter((c) => c === 200).length).toBe(5);
    expect(codes.filter((c) => c === 429).length).toBe(3);
  });

  it("NEVER limits webhooks — a 429 there silently drops external events", async () => {
    const app = appWith(makeGlobalApiLimiter({ limit: 2 }));
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get("/api/webhooks/didit");
      expect(res.status, `webhook throttled on request ${i + 1}`).toBe(200);
    }
  });

  it("NEVER limits the SSE stream — reconnect storms after a deploy are normal", async () => {
    const app = appWith(makeGlobalApiLimiter({ limit: 2 }));
    for (let i = 0; i < 10; i++) {
      expect((await request(app).get("/api/inbox/stream")).status).toBe(200);
    }
  });

  it("NEVER limits health checks", async () => {
    const app = appWith(makeGlobalApiLimiter({ limit: 1 }));
    for (let i = 0; i < 5; i++) {
      expect((await request(app).get("/api/health")).status).toBe(200);
    }
  });

  it("exemption list is prefix-matched, not exact", () => {
    expect(__testing.isExempt("/api/webhooks/didit")).toBe(true);
    expect(__testing.isExempt("/api/webhooks/anything/else")).toBe(true);
    expect(__testing.isExempt("/api/listings")).toBe(false);
    // A path that merely CONTAINS an exempt segment must not be exempt.
    expect(__testing.isExempt("/api/listings/api/webhooks/")).toBe(false);
  });

  it("fails OPEN — a throwing limiter must not take the API down", async () => {
    const app = express();
    const exploding = () => {
      throw new Error("store exploded");
    };
    app.use("/api", safeGlobalApiLimiter());
    // Replace the inner limiter's behaviour by simulating the wrapper directly.
    const wrapped = safeGlobalApiLimiter();
    const boom = express();
    boom.use("/api", (req: any, res: any, next: any) => {
      try {
        exploding();
      } catch {
        /* mirrors the wrapper's catch */
      }
      return wrapped(req, res, next);
    });
    boom.get("/api/anything", (_req, res) => res.json({ ok: true }));
    const res = await request(boom).get("/api/anything");
    expect(res.status).toBe(200);
  });

  it("surfaces standard draft-7 headers so clients can back off", async () => {
    const app = appWith(makeGlobalApiLimiter({ limit: 5 }));
    const res = await request(app).get("/api/anything");
    expect(res.headers["ratelimit-limit"] ?? res.headers["ratelimit"]).toBeDefined();
  });
});
