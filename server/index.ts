import compression from "compression";
import express, { type Request, Response, NextFunction } from "express";
import { securityHeaders, originCsrfGuard } from "./security";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { pool } from "./db";
import { backfillLocationFields, purgeSeedUsers, wipePlatformContent } from "./seed";
import { bootstrapAdmin } from "./bootstrapAdmin";
import { seedLegalPages } from "./seedLegalPages";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerImageRoutes } from "./replit_integrations/image";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerAudioRoutes } from "./replit_integrations/audio";

const app = express();
const httpServer = createServer(app);

// ── Global crash guards ──────────────────────────────────────────────────
// This VM deployment runs background subsystems (the WhatsApp/Baileys socket,
// cron schedulers, AI agents) in-process alongside the web server. Without
// these handlers, a single unhandled promise rejection or uncaught exception
// thrown ASYNCHRONOUSLY inside any of those subsystems (i.e. not caught by the
// .catch() on their startup promise) terminates the entire Node process —
// taking bareter.com down and forcing a cold restart. We log with full context
// and keep serving: the website must never go down because a background task
// threw. (Root cause of repeated short production outages.)
process.on("unhandledRejection", (reason) => {
  console.error("[fatal-guard] Unhandled promise rejection — process kept alive:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal-guard] Uncaught exception — process kept alive:", err);
});

// On Replit, auto-derive PRIVATE_OBJECT_DIR from REPL_ID if not explicitly set.
// Replit provisions an object storage bucket named replit-objstore-<REPL_ID>
// which persists across redeploys. Without this, uploads fall back to the
// ephemeral local filesystem and disappear whenever the Repl is redeployed.
if (process.env.REPL_ID && !process.env.PRIVATE_OBJECT_DIR) {
  process.env.PRIVATE_OBJECT_DIR = `replit-objstore-${process.env.REPL_ID}`;
}

// Trust exactly one proxy hop (Replit's edge / production load balancer).
// This must be set before any middleware that reads req.ip or req.protocol
// so that rate-limiting and similar anti-abuse checks cannot be bypassed by
// a forged X-Forwarded-For header from a direct client.
app.set("trust proxy", 1);

// Gzip/deflate all responses — biggest single win for JSON-heavy API payloads
app.use(compression());

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
    limit: "10mb",
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
  // DIDIT CODE ARCHIVED
  // See _archived/didit/misc-small-snippets.ts
  // Re-integrate when ENABLE_DIDIT needed
  // if (!process.env.DIDIT_WEBHOOK_SECRET) { console.warn(...) }

  // NOTE: data-mutating startup tasks (wipePlatformContent, purgeSeedUsers,
  // backfillLocationFields, bootstrapAdmin, seedLegalPages) are intentionally
  // NOT invoked here. They live in the post-listen callback below so they
  // run AFTER the server starts accepting requests and never block boot.
  // Calling them in both places caused every cold start to do the same
  // (idempotent but wasteful) DB work twice.

  // Register main routes — MUST happen before listen so session middleware
  // and all API handlers are in place before the first request arrives.
  await registerRoutes(httpServer, app);

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

  // Redirect: www.bareter.com → bareter.com (production only, permanent).
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== "production") return next();
    if (req.hostname === `www.${ADMIN_DOMAIN.replace(/^admin\./, "")}`) {
      return res.redirect(301, `https://${req.hostname.replace(/^www\./, "")}${req.url}`);
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

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: process.platform === "linux",
    },
    () => {
      log(`serving on port ${port}`);

      // 0. Verify DB is reachable — if this fails every request returns 500
      //    because the session store can't connect.
      pool.query("SELECT 1").then(() => {
        log("database connection OK", "db");
      }).catch((err: Error) => {
        console.error("[startup] DATABASE CONNECTION FAILED — check DATABASE_URL in Replit Secrets:", err.message);
      });

      // ── Background startup tasks ─────────────────────────────────────────
      // These run AFTER the server is already accepting requests so they
      // never delay the first user's page load. All are idempotent — safe
      // to re-run on every cold start, and failures are non-fatal.

      // 1a. Wipe all platform content on first boot (one-time pre-launch cleanup).
      wipePlatformContent().catch((err) => console.error("[startup] wipePlatformContent failed:", err));

      // 1b. Purge any remaining seed/demo accounts and their data.
      purgeSeedUsers().catch((err) => console.error("[startup] purgeSeedUsers failed:", err));

      // 2. Provision the founder admin account (no-op if already exists).
      bootstrapAdmin().catch((err) => console.error("[startup] bootstrapAdmin failed:", err));

      // 3. Seed legal pages into DB on first boot.
      seedLegalPages().catch((err) => console.error("[startup] seedLegalPages failed:", err));

      // 4. Backfill country/city/location for legacy user rows.
      backfillLocationFields().catch((err) => console.error("[startup] backfillLocationFields failed:", err));

      // 5. Company OS cron scheduler.
      import("./companyOs/scheduler")
        .then(({ startScheduler }) => startScheduler())
        .catch((err) => console.error("[startup] scheduler failed:", err));

      // 6b. Baileys WhatsApp service (OTP delivery).
      // Start ONLY in the production deployment. WhatsApp allows a single live
      // session per number, and the dev workspace + production both restore the
      // same session from Object Storage. If both run it, they fight over that
      // session and each kicks the other off (disconnect code 440), producing
      // an endless ~10s reconnect loop and constant churn that can crash the
      // process. REPLIT_DEPLOYMENT is set only in the published deployment,
      // never in the dev workspace — so production owns the session alone.
      if (process.env.REPLIT_DEPLOYMENT) {
        import("./whatsappService")
          .then(({ whatsappService }) => whatsappService.start())
          .catch((err) => console.error("[startup] whatsappService failed:", err));
      } else {
        console.log("[whatsapp] Skipped — only runs in the production deployment (avoids session conflict with prod)");
      }

      // 6. Warm per-agent budget cache (degrades gracefully on miss).
      import("./companyOs/costTracker")
        .then(async ({ ensureAgentBudgetOverridesLoaded, seedAgentBudgetDefaults }) => {
          await seedAgentBudgetDefaults();
          await ensureAgentBudgetOverridesLoaded();
        })
        .catch((err) => console.error("[startup] budget cache failed:", err));
    },
  );
})();
