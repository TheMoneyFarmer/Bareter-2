import crypto from "crypto";
import type { Request } from "express";
import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";

export const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function hashResetToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// One-time codes (phone verification, password-change OTP) are stored hashed,
// never in plaintext, so a DB read alone cannot reveal an in-flight code.
// Compare by hashing the submitted code and matching against the stored hash.
export function hashOtp(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export const ALLOWED_UPLOAD_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  // Short listing clips / creator demo reels. Magic-byte detected like
  // everything else — `video/*` is never trusted from the client header.
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

// Extended set for creator portfolio — short reels allowed (mp4, mov, webm)
export const ALLOWED_PORTFOLIO_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export async function detectPortfolioFileType(
  buffer: Buffer,
): Promise<{ mime: string; ext: string; isVideo: boolean } | null> {
  const { fileTypeFromBuffer } = await import("file-type");
  const ft = await fileTypeFromBuffer(buffer);
  if (!ft || !ALLOWED_PORTFOLIO_MIMES.has(ft.mime)) return null;
  return { mime: ft.mime, ext: ft.ext, isVideo: ft.mime.startsWith("video/") };
}

// Per-category ceilings, enforced after magic-byte detection. Multer itself
// runs a single generous limit (MAX_UPLOAD_BYTES) so that a video does not
// trip an image-sized limit before we know what the file actually is —
// that mismatch is what made 30MB videos fail against a "50MB" promise.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES; // multer's single ceiling

/** Category ceiling for a detected MIME, in bytes. */
export function maxBytesForMime(mime: string): number {
  if (mime.startsWith("video/")) return MAX_VIDEO_BYTES;
  if (mime === "application/pdf") return MAX_DOCUMENT_BYTES;
  return MAX_IMAGE_BYTES;
}

export async function detectAllowedFileType(
  buffer: Buffer,
): Promise<{ mime: string; ext: string } | null> {
  const { fileTypeFromBuffer } = await import("file-type");
  const ft = await fileTypeFromBuffer(buffer);
  if (!ft || !ALLOWED_UPLOAD_MIMES.has(ft.mime)) return null;
  return { mime: ft.mime, ext: ft.ext };
}

// Use the library's IPv6-aware helper so users on IPv6 can't bypass the
// limit by varying the low-order bits of their address.
const ipKey = (req: Request): string => `ip:${ipKeyGenerator(req.ip ?? "")}`;

export function makeLoginRateLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    // Higher limit in dev so repeated test logins don't get blocked
    limit: process.env.NODE_ENV === "production" ? 10 : 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: {
      message: "Too many login attempts. Please try again in 15 minutes.",
    },
    ...overrides,
  });
}

export function makeRegisterRateLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: {
      message:
        "Too many registration attempts from this IP. Please try again later.",
    },
    ...overrides,
  });
}

export function makeForgotPasswordRateLimiter(
  overrides: Partial<Options> = {},
) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 3,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      message:
        "Too many password reset requests. Please try again in 15 minutes.",
    },
    ...overrides,
  });
}

// Cookie-consent banner POSTs once per real decision; legitimate use is
// at most a handful per visit. We allow some headroom for opening the
// preferences dialog repeatedly but cap clearly-abusive volume from a
// single IP so a script can't bloat the append-only audit log.
export function makeConsentRateLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: {
      message:
        "Too many consent updates from this IP. Please slow down.",
    },
    ...overrides,
  });
}

// Browser ErrorBoundary POSTs once per uncaught render error. Legitimate
// volume from a single tab is tiny; cap clearly-abusive volume from a
// single IP so a script can't flood the server log.
export function makeClientErrorRateLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: { message: "Too many client error reports from this IP." },
    ...overrides,
  });
}

// Password reset submit (POST /api/auth/reset-password). Tokens are
// single-use and expire, but an unthrottled attacker could farm the same
// token window across many IPs. Cap tightly — a legit user submits once.
export function makeResetPasswordRateLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: { message: "Too many password reset attempts. Please try again in 15 minutes." },
    ...overrides,
  });
}

// Support ticket creation is open to guests, so cap it per-IP to prevent
// spam flooding the support inbox and DB.
export function makeSupportTicketRateLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: { message: "Too many support tickets from this IP. Please try again later." },
    ...overrides,
  });
}

// Public listing browse — prevents automated scraping/enumeration of all listings.
// 200 req/min for normal browsing; 30/min in production to slow scrapers.
export function makePublicListingsRateLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: process.env.NODE_ENV === "production" ? 60 : 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ipKey,
    skip: (req) => !!req.session?.userId, // authenticated users bypass listing scrape limit
    message: { message: "Too many requests. Please slow down." },
    ...overrides,
  });
}

// User profile enumeration — prevents walking /api/users/:id to harvest accounts.
export function makeUserProfileRateLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: process.env.NODE_ENV === "production" ? 30 : 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: { message: "Too many profile requests. Please slow down." },
    ...overrides,
  });
}

// Phone OTP send — prevent cost attacks via SMS/WhatsApp spam.
// 3 sends per 15 minutes per IP is more than enough for any real user.
export function makePhoneOtpSendLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === "production" ? 3 : 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: { message: "Too many verification code requests. Please wait 15 minutes before trying again." },
    ...overrides,
  });
}

// Phone OTP verify — prevent brute-force of the 6-digit code (900,000 space).
// 5 attempts per 10-minute window per IP; code expires after 10 min anyway.
export function makePhoneOtpVerifyLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: process.env.NODE_ENV === "production" ? 5 : 50,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: { message: "Too many verification attempts. Please request a new code." },
    ...overrides,
  });
}
