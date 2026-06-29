import type { Request, Response, NextFunction, RequestHandler } from "express";
import helmet from "helmet";
import type { User, PublicUser } from "@shared/schema";

/**
 * Strip every sensitive field from a User before it leaves the server in a
 * public API response. Applies showEmail / showPhone privacy settings.
 * Use this wherever a User object is embedded in a listing, post, or profile
 * response visible to non-admin callers.
 */
export function sanitizePublicUser(user: User): PublicUser {
  const {
    password: _password,
    passwordResetToken: _prt,
    passwordResetExpires: _pre,
    emailVerificationToken: _evt,
    emailVerificationExpires: _eve,
    passwordChangeOtp: _pco,
    passwordChangeOtpExpires: _pcoe,
    phoneVerificationCode: _pvc,
    phoneVerificationExpires: _pve,
    diditSessionId: _dsi,
    diditVerificationData: _dvd,
    diditVerifiedAt: _dva,
    unsubscribeToken: _ut,
    googleId: _gid,
    appleId: _aid,
    businessLicenseUrl: _blu,
    verificationDocUrl: _vdu,
    isBanned: _ib,
    bannedAt: _ba,
    bannedReason: _br,
    isAdmin: _ia,
    reminderPreferences: _rp,
    emailNotifications: _en,
    dealNotifications: _dn,
    messageNotifications: _mn,
    marketingEmails: _me,
    ...rest
  } = user;

  return {
    ...rest,
    // Respect privacy settings — null out unless the user opted in to share
    email: user.showEmail ? user.email : null as unknown as string,
    phone: user.showPhone ? (user.phone ?? null) : null,
  };
}

export const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const CSRF_EXEMPT_PATHS = new Set<string>([
  // DIDIT CODE ARCHIVED — See _archived/didit/misc-small-snippets.ts — Re-integrate when ENABLE_DIDIT needed
  // "/api/webhooks/didit",
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
  // SECURITY: do NOT trust x-forwarded-host here. It is attacker-controllable
  // (the upstream proxy does not always strip it), and adding it to the allowed
  // set would let any origin pass the CSRF check by forging the header. Trust
  // only the real Host header and the explicit ALLOWED_ORIGINS env list.
  const selfHost = req.headers.host;
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

// Matches the set in server/index.ts corsMiddleware — kept in sync manually.
const CAPACITOR_ORIGINS = new Set(["capacitor://localhost", "http://localhost"]);

export function originCsrfGuard(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/")) return next();
    if (!UNSAFE_METHODS.has(req.method)) return next();
    if (CSRF_EXEMPT_PATHS.has(req.path)) return next();

    // Native mobile apps send a bearer token instead of an Origin header.
    // The token itself is validated later in requireAuth; here we only need
    // to know a bearer was presented so CORS-safe browsers couldn't have
    // injected this header from a third-party page.
    const authHeader = req.headers.authorization as string | undefined;
    if (authHeader?.startsWith("Bearer ") && authHeader.length > 8) return next();

    // Capacitor WebViews use capacitor://localhost (iOS) or http://localhost
    // (Android) as their Origin. These can't be forged by a browser from a
    // third-party page, so they're safe to trust here just as in the CORS middleware.
    const originHeader = req.headers.origin as string | undefined;
    if (originHeader && CAPACITOR_ORIGINS.has(originHeader)) return next();

    const allowed = getAllowedOriginHosts(req);
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
