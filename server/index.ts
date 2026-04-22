import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase, backfillLocationFields } from "./seed";
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
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Origin-check CSRF guard for state-changing requests on /api/*.
// We trust the same-origin model: an unsafe-method request must declare an
// `Origin` (or `Referer`) whose host matches one of our allowed app hosts.
// External integration webhooks (Stripe, Didit) sign their payloads and are
// explicitly exempted because they intentionally come from a different host.
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_PATHS = new Set([
  "/api/webhooks/stripe",
  "/api/webhooks/didit",
]);

function getAllowedOriginHosts(req: Request): Set<string> {
  const allowed = new Set<string>();
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of fromEnv) {
    try {
      allowed.add(new URL(o).host);
    } catch {
      allowed.add(o);
    }
  }
  // Always trust the host the request itself is hitting (Replit edge,
  // custom domain, localhost during dev) since same-origin XHR will send
  // an Origin matching it.
  const selfHost = (req.headers["x-forwarded-host"] as string) || req.headers.host;
  if (selfHost) allowed.add(selfHost);
  return allowed;
}

function originHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith("/api/")) return next();
  if (!UNSAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();

  const allowed = getAllowedOriginHosts(req);
  const originHeader = req.headers.origin as string | undefined;
  const refererHeader = req.headers.referer as string | undefined;
  const candidate = originHost(originHeader) || originHost(refererHeader);

  if (!candidate || !allowed.has(candidate)) {
    return res
      .status(403)
      .json({ message: "Cross-origin request blocked (origin check failed)" });
  }
  next();
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

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
    } catch (error) {
      console.error("Failed to seed database:", error);
    }
  }

  if (!process.env.DIDIT_WEBHOOK_SECRET) {
    console.warn(
      "[startup] DIDIT_WEBHOOK_SECRET is not set — KYC/KYB webhook signature verification will reject all callbacks. Set this secret before going live.",
    );
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
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
