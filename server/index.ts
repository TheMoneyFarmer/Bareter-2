import express, { type Request, Response, NextFunction } from "express";
import { securityHeaders, originCsrfGuard } from "./security";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase, backfillLocationFields, topUpTrendingListings, seedCreators } from "./seed";
import { bootstrapAdmin } from "./bootstrapAdmin";
import { seedLegalPages } from "./seedLegalPages";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerImageRoutes } from "./replit_integrations/image";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerAudioRoutes } from "./replit_integrations/audio";

const app = express();
const httpServer = createServer(app);

// Trust exactly one proxy hop (Replit's edge / production load balancer).
// This must be set before any middleware that reads req.ip or req.protocol
// so that rate-limiting and similar anti-abuse checks cannot be bypassed by
// a forged X-Forwarded-For header from a direct client.
app.set("trust proxy", 1);

// Standard browser security headers. CSP is left disabled because the Vite
// dev middleware injects inline scripts/HMR that a strict CSP would block;
// the rest of helmet's defaults (X-Frame-Options, X-Content-Type-Options,
// Referrer-Policy, HSTS, etc.) are kept on.
app.use(securityHeaders());

// Origin-check CSRF guard for state-changing requests on /api/*.
// We trust the same-origin model: an unsafe-method request must declare an
// `Origin` (or `Referer`) whose host matches one of our allowed app hosts.
// External integration webhooks (Twilio, Didit) sign their payloads and are
// explicitly exempted because they intentionally come from a different host.
app.use(originCsrfGuard());

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Twilio sends inbound WhatsApp webhooks as application/x-www-form-urlencoded.
// The global urlencoded parser below already handles this, but we mount it
// explicitly here so the intent is documented and so any future change to
// the global parser can't silently break webhook signature validation.
app.use(
  "/api/company-os/whatsapp",
  express.urlencoded({ extended: false, limit: "256kb" }),
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Prevent browsers and CDNs from caching API responses. Without this,
// Express's default ETag behaviour causes browsers to serve stale JSON
// (304 Not Modified) for dynamic endpoints such as waitlist counts,
// listings, notifications, etc. Endpoints that intentionally want a
// longer cache lifetime (e.g. /api/public/settings, /sitemap.xml) set
// their own Cache-Control header AFTER this middleware runs, which
// overrides this default.
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Intentionally do NOT log response bodies — they may contain
      // password-reset tokens, session data, PII, etc.
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // Seed the database with sample data — development only.
  // Production must never auto-populate fake users/listings.
  if (process.env.NODE_ENV !== "production") {
    try {
      await seedDatabase();
      await topUpTrendingListings();
    } catch (error) {
      console.error("Failed to seed database:", error);
    }
  }

  // Creator seed runs in all environments — idempotent, skips if already present.
  try {
    await seedCreators();
  } catch (error) {
    console.error("Failed to seed creators:", error);
  }

  if (!process.env.DIDIT_WEBHOOK_SECRET) {
    console.warn(
      "[startup] DIDIT_WEBHOOK_SECRET is not set — KYC/KYB webhook signature verification will reject all callbacks. Set this secret before going live.",
    );
  }

  // Provision the founder admin account (idempotent). Runs in every
  // environment so the same secret rotation lands in dev and prod.
  await bootstrapAdmin();

  // Backfill the legal pack into the database on first boot so the admin
  // editor and the public LegalDocPage both read from the same source.
  try {
    await seedLegalPages();
  } catch (error) {
    console.error("Failed to seed legal pages:", error);
  }

  // Backfill country/city/location for legacy rows so location filters and
  // worldwide-toggle behavior work correctly across pre-expansion data.
  try {
    await backfillLocationFields();
  } catch (error) {
    console.error("Failed to backfill location fields:", error);
  }

  // Register main routes first so the session middleware is initialized
  // before the object-storage routes try to read req.session.
  await registerRoutes(httpServer, app);

  // Company OS scheduler — node-cron jobs (daily briefing, hourly
  // finance snapshot, budget warning). Production-only by default;
  // safe to call on every boot (idempotent).
  try {
    const { startScheduler } = await import("./companyOs/scheduler");
    startScheduler();
  } catch (err) {
    console.error("[startup] Failed to start Company OS scheduler:", err);
  }

  // Warm the per-agent budget override cache BEFORE the server starts
  // serving requests. We await this so the very first dashboard load
  // and the very first LLM safety/throttle decision after restart see
  // the persisted DB caps, not the hardcoded fallback. Failures are
  // non-fatal — getAgentBudgetAed degrades gracefully to the
  // hardcoded defaults and ensureAgentBudgetOverridesLoaded will
  // retry on the next read because loadOverrideCache only flips the
  // ready flag on success.
  try {
    const { ensureAgentBudgetOverridesLoaded, seedAgentBudgetDefaults } = await import("./companyOs/costTracker");
    await seedAgentBudgetDefaults();
    await ensureAgentBudgetOverridesLoaded();
  } catch (err) {
    console.error("[startup] Failed to warm agent-budget cache:", err);
  }

  // Register object storage routes (depend on session middleware above)
  registerObjectStorageRoutes(app);

  // Register AI cost endpoints (chat, audio, image). These are gated by
  // requireAuthBlueprint inside their handlers; the `test-upload-auth.ts`
  // script asserts the 401 behavior on every push.
  //
  // Note: chat and audio blueprints both define identical `/api/conversations`
  // paths. To keep both auth gates independently observable (so the
  // post-merge test can prove neither has been silently un-gated), we
  // mount the audio blueprint under `/voice` so its paths become
  // `/voice/api/conversations*`. This avoids first-route shadowing.
  registerImageRoutes(app);
  registerChatRoutes(app);
  const voiceApp = express();
  registerAudioRoutes(voiceApp);
  app.use("/voice", voiceApp);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // ── Admin subdomain security ────────────────────────────────────────────────
  // These two middleware functions must be registered AFTER registerRoutes
  // (so the session middleware is already in the pipeline) and BEFORE
  // serveStatic (so they intercept HTML requests before index.html is served).

  const ADMIN_DOMAIN = process.env.ADMIN_DOMAIN || "admin.bareter.com";

  // Plain HTML served to anyone who hits admin.bareter.com without a valid
  // admin session. Deliberately bare — no Bareter branding, no clues.
  const ADMIN_404_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>404 Not Found</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f9fafb}
    h1{font-size:1.125rem;font-weight:600;color:#111827;margin-bottom:.375rem}
    p{font-size:.875rem;color:#6b7280}
  </style>
</head>
<body>
  <div style="text-align:center">
    <h1>404 Not Found</h1>
    <p>The page you requested could not be found.</p>
  </div>
</body>
</html>`;

  // Guard: any request to admin.bareter.com that is NOT an API call or a
  // static asset is checked for admin status. Unauthenticated visitors get
  // the React SPA (which renders the AdminLoginForm). Authenticated
  // non-admins get the bare 404 — they should not know this panel exists.
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.hostname !== ADMIN_DOMAIN) return next();
    // API calls are gated by requireAdmin individually — pass through.
    if (req.path.startsWith("/api/")) return next();
    // Static assets (JS bundles, CSS, fonts, images) — pass through.
    if (/\.(js|css|png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|map|webmanifest|json)$/i.test(req.path)) {
      return next();
    }
    // No session → let the React SPA load so AdminLoginForm can render.
    const userId = (req.session as any)?.userId as string | undefined;
    if (!userId) return next();
    // Session exists — verify the user is actually an admin.
    try {
      const { storage } = await import("./storage");
      const user = await storage.getUser(userId);
      const allowlist = new Set(
        (process.env.ADMIN_EMAIL_ALLOWLIST || "")
          .split(",")
          .map((e: string) => e.trim().toLowerCase())
          .filter(Boolean),
      );
      const emailOk = allowlist.size === 0 || allowlist.has((user?.email ?? "").toLowerCase());
      const roleOk = user?.isAdmin || user?.role === "admin" || user?.role === "super_admin";
      if (!user || !roleOk || !emailOk) return res.status(404).send(ADMIN_404_HTML);
    } catch {
      return res.status(404).send(ADMIN_404_HTML);
    }
    next();
  });

  // Redirect: bareter.com/admin/* → admin.bareter.com/admin/* (production only).
  // In dev both /admin routes work as normal so you can test without the subdomain.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== "production") return next();
    if (req.hostname === ADMIN_DOMAIN) return next();
    if (req.path === "/admin" || req.path.startsWith("/admin/")) {
      return res.redirect(301, `https://${ADMIN_DOMAIN}${req.path}`);
    }
    next();
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Keep the Neon DB endpoint warm so free-tier cold starts don't cause
  // skeleton flashes on page load. Pings every 4 minutes (Neon suspends at 5).
  if (process.env.NODE_ENV === "production") {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    setInterval(async () => {
      try { await db.execute(sql`SELECT 1`); } catch { /* non-fatal */ }
    }, 4 * 60 * 1000);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      // reusePort is a Linux-only socket option (used on the production
      // Replit host). macOS/Windows kernels reject it with ENOTSUP, so we
      // only set it on linux to keep local dev working.
      reusePort: process.platform === "linux",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
