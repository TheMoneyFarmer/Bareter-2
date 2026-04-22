import type { Request, Response, NextFunction, RequestHandler } from "express";
import helmet from "helmet";

export const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const CSRF_EXEMPT_PATHS = new Set<string>([
  "/api/webhooks/stripe",
  "/api/webhooks/didit",
]);

export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
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
