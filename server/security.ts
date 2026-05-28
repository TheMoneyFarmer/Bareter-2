import type { Request, Response, NextFunction, RequestHandler } from "express";
import helmet from "helmet";

export const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const CSRF_EXEMPT_PATHS = new Set<string>([
  "/api/webhooks/didit",
  // Sanity CMS publish webhook. Verified via HMAC-SHA256 inside the handler.
  "/api/webhooks/sanity",
  // Company OS webhook. Verifies the sender via Twilio HMAC inside the
  // handler, so a blanket origin-CSRF guard would only cause a 403
  // retry loop.
  "/api/company-os/whatsapp",
]);

export function securityHeaders(): RequestHandler {
  const isProd = process.env.NODE_ENV === "production";
  return helmet({
    // In dev, Vite injects inline scripts/HMR that a strict CSP blocks.
    // In production, enforce a restrictive policy.
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // inline needed for Vite bundle hashes; tighten with nonces later
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "https:"],
            fontSrc: ["'self'", "data:", "https:"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"], // blocks clickjacking
            upgradeInsecureRequests: [],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Strict HSTS in production — 1 year, include subdomains
    hsts: isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
  });
}

export function getAllowedOriginHosts(req: Request): Set<string> {
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
  const selfHost =
    (req.headers["x-forwarded-host"] as string) || req.headers.host;
  if (selfHost) allowed.add(selfHost);
  return allowed;
}

export function originHostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function originCsrfGuard(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/")) return next();
    if (!UNSAFE_METHODS.has(req.method)) return next();
    if (CSRF_EXEMPT_PATHS.has(req.path)) return next();

    const allowed = getAllowedOriginHosts(req);
    const originHeader = req.headers.origin as string | undefined;
    const refererHeader = req.headers.referer as string | undefined;
    const candidate =
      originHostOf(originHeader) || originHostOf(refererHeader);

    if (!candidate || !allowed.has(candidate)) {
      return res
        .status(403)
        .json({ message: "Cross-origin request blocked (origin check failed)" });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Private-doc download authorization helpers
// ---------------------------------------------------------------------------

const USER_ID_RE = /^[a-zA-Z0-9-]+$/;
const PRIVATE_DOC_FILENAME_RE = /^[a-f0-9]{48}\.[a-z0-9]+$/i;

export function isValidPrivateDocPath(
  userId: unknown,
  filename: unknown,
): boolean {
  if (typeof userId !== "string" || typeof filename !== "string") return false;
  return USER_ID_RE.test(userId) && PRIVATE_DOC_FILENAME_RE.test(filename);
}

export function canAccessPrivateDoc(opts: {
  callerId: string | null | undefined;
  ownerId: string;
  isAdmin: boolean | null | undefined;
}): boolean {
  if (!opts.callerId) return false;
  if (opts.callerId === opts.ownerId) return true;
  return !!opts.isAdmin;
}
