import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { pool, db } from "../db";
import { mobileTokens } from "@shared/schema";

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function hashMobileToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function issueMobileToken(userId: string, deviceInfo?: string | null): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashMobileToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(mobileTokens).values({ userId, tokenHash, expiresAt, deviceInfo: deviceInfo ?? null });
  return raw;
}

export interface MobileAuthResult {
  userId: string;
  tokenId: string;
}

// Runs after session middleware. Verifies bearer token, sets req.session.userId
// and (req as any).__mobileAuth so all downstream handlers work unchanged.
// On invalid token sets __mobileAuth = false so requireAuth can reject with 401.
export const bearerPreAuthMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }
  const raw = authHeader.slice(7).trim();
  if (!raw) return next();

  const hash = hashMobileToken(raw);
  try {
    const result = await pool.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM mobile_tokens WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1`,
      [hash],
    );
    if (result.rows.length > 0) {
      const { id: tokenId, user_id: userId } = result.rows[0];
      (req as any).__mobileAuth = { userId, tokenId } as MobileAuthResult;
      req.session.userId = userId;
      pool
        .query(`UPDATE mobile_tokens SET last_used_at = NOW() WHERE id = $1`, [tokenId])
        .catch(() => {});
    } else {
      (req as any).__mobileAuth = false;
    }
  } catch (err) {
    console.error("[bearerPreAuth] DB lookup failed:", err);
  }
  next();
};
