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

export const ALLOWED_UPLOAD_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

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
    limit: 10,
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
