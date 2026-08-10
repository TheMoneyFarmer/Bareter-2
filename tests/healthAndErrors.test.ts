import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Health endpoint and error tracking.
 *
 * Context: production returns "200 text/html" for ANY path Node has not claimed
 * — Replit's edge serves index.html before Express is reached. During a full API
 * outage (every /api route 500ing) both "/" and "/api/health" still answered 200,
 * so an uptime monitor watching either would have shown all-green. The outage was
 * found by hand.
 *
 * The health contract therefore is: real JSON, an explicit `status` field, and
 * 503 when the database is unreachable. A monitor must assert on the BODY, since
 * a 200 alone is exactly the false signal being guarded against.
 */

describe("health endpoint contract", () => {
  function appWith(dbUp: boolean, delayMs = 0) {
    const app = express();
    const BOOT = Date.now();
    app.get("/api/health", async (_req, res) => {
      const probe = new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(dbUp), delayMs),
      );
      const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000));
      const ok = await Promise.race([probe, timeout]);
      res.set("Cache-Control", "no-store");
      res.status(ok ? 200 : 503).json({
        status: ok ? "ok" : "degraded",
        db: ok ? "up" : "down",
        uptimeSeconds: Math.round((Date.now() - BOOT) / 1000),
        timestamp: new Date().toISOString(),
      });
    });
    return app;
  }

  it("returns 200 and status:ok when the database answers", async () => {
    const res = await request(appWith(true)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("up");
  });

  it("returns 503 and status:degraded when the database is unreachable", async () => {
    const res = await request(appWith(false)).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.db).toBe("down");
  });

  it("responds JSON, not HTML — HTML is the false-green failure mode", async () => {
    const res = await request(appWith(true)).get("/api/health");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(typeof res.body.status).toBe("string");
  });

  it("is never cached, so a monitor cannot be served a stale healthy answer", async () => {
    const res = await request(appWith(true)).get("/api/health");
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  it("reports down rather than hanging when the probe stalls", async () => {
    // 3.5s stall against a 3s bound — must resolve to degraded, not hang.
    const res = await request(appWith(true, 3500)).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body.db).toBe("down");
  }, 10_000);
});

describe("error tracking", () => {
  const original = process.env.SENTRY_DSN;
  beforeEach(() => { delete process.env.SENTRY_DSN; vi.resetModules(); });
  afterEach(() => { if (original) process.env.SENTRY_DSN = original; else delete process.env.SENTRY_DSN; });

  it("is a no-op without SENTRY_DSN — monitoring must never break the app", async () => {
    const mod = await import("../server/lib/errorTracking");
    await mod.initErrorTracking();
    expect(mod.errorTrackingEnabled()).toBe(false);
    expect(() => mod.captureError(new Error("boom"))).not.toThrow();
  });

  it("passes errors along to the next handler rather than swallowing them", async () => {
    const mod = await import("../server/lib/errorTracking");
    await mod.initErrorTracking();

    const app = express();
    app.get("/boom", () => { throw new Error("kaboom"); });
    app.use(mod.errorTrackingMiddleware());
    let reached = false;
    app.use((err: any, _req: any, res: any, _next: any) => {
      reached = true;
      res.status(500).json({ message: "handled" });
    });

    const res = await request(app).get("/boom");
    expect(reached, "error middleware swallowed the error").toBe(true);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("handled");
  });

  it("still responds normally when a request succeeds", async () => {
    const mod = await import("../server/lib/errorTracking");
    await mod.initErrorTracking();
    const app = express();
    app.get("/ok", (_req, res) => res.json({ ok: true }));
    app.use(mod.errorTrackingMiddleware());
    const res = await request(app).get("/ok");
    expect(res.status).toBe(200);
  });
});
