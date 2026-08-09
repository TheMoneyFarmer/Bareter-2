import type { Request, Response, NextFunction } from "express";
import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";

/**
 * Baseline rate limit for /api/*.
 *
 * Targeted limiters already cover the expensive and abusable endpoints (auth,
 * OTP, AI, support, password reset). Everything else — roughly 370 routes — had
 * no ceiling at all, which leaves listing/user enumeration and general scraping
 * free, and lets a single client drive database cost without limit.
 *
 * This is deliberately a BACKSTOP, not a policy. It is set far above what real
 * usage looks like, because the failure mode of a too-tight global limit is
 * throttling paying users at launch, which is worse than the scraping it
 * prevents. The targeted limiters remain the real defence; this only stops the
 * pathological case.
 *
 * Sizing: a busy human browsing hard makes maybe 30–60 API calls a minute. The
 * limit below is several times that, per user (or per IP when logged out), so a
 * normal session should never come close.
 */

/** Requests per window, per identity. Generous on purpose. */
const GLOBAL_LIMIT = 300;
const WINDOW_MS = 60 * 1000;

/**
 * Paths that must never be rate limited.
 *
 * - Webhooks are called by external services whose retry behaviour we do not
 *   control; a 429 there silently drops a verification result or a CMS update.
 * - The SSE stream is one long-lived connection per client, and reconnect
 *   storms after a deploy would otherwise trip the limiter exactly when users
 *   are trying to get back online.
 * - Health/readiness probes must answer even while a client is being throttled.
 */
const EXEMPT_PREFIXES = [
  "/api/webhooks/",
  "/api/inbox/stream",
  "/api/health",
  "/api/healthz",
];

/**
 * Match against the FULL path, not `req.path`.
 *
 * This middleware is mounted as `app.use("/api", ...)`, and Express strips the
 * mount prefix from `req.path` — inside the handler it reads "/webhooks/didit",
 * not "/api/webhooks/didit". Matching on `req.path` therefore never fired, and
 * every exemption silently did nothing: webhooks and the SSE stream were being
 * rate limited despite being listed here. Comparing `baseUrl + path` restores
 * the full path under any mount point, and the accompanying tests mount the
 * middleware the same way the app does so this cannot regress.
 */
function fullPath(req: Request): string {
  const base = req.baseUrl || "";
  const p = req.path || "";
  return `${base}${p}` || "/";
}

function isExempt(pathOrReq: string | Request): boolean {
  const path = typeof pathOrReq === "string" ? pathOrReq : fullPath(pathOrReq);
  return EXEMPT_PREFIXES.some((p) => path.startsWith(p));
}

/** Key by session user when logged in, else by IP (IPv6-safe). */
export const globalRateKey = (req: Request): string =>
  req.session?.userId
    ? `u:${req.session.userId}`
    : `ip:${ipKeyGenerator(req.ip ?? "")}`;

export function makeGlobalApiLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: GLOBAL_LIMIT,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: globalRateKey,
    // `skip` runs per request, so exemptions stay in one place and are testable.
    skip: (req: Request) => isExempt(req),
    message: { message: "Too many requests. Please slow down and try again shortly." },
    ...overrides,
  });
}

/**
 * Wrap the limiter so an internal error inside it can never take the API down.
 *
 * express-rate-limit uses an in-memory store here, which does not throw in
 * normal operation — but this middleware sits in front of every /api route, so
 * the blast radius of an unexpected throw is the entire product. Failing OPEN is
 * the right trade for a backstop whose job is stopping abuse, not enforcing
 * correctness: a brief window of unlimited requests beats a total outage.
 */
export function safeGlobalApiLimiter(overrides: Partial<Options> = {}) {
  const limiter = makeGlobalApiLimiter(overrides);
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      limiter(req, res, (err?: unknown) => {
        if (err) {
          console.error("[rate-limit] limiter error — allowing request:", err);
          return next();
        }
        next();
      });
    } catch (err) {
      console.error("[rate-limit] limiter threw — allowing request:", err);
      next();
    }
  };
}

export const __testing = { EXEMPT_PREFIXES, isExempt, GLOBAL_LIMIT, WINDOW_MS };
