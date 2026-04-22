import type { Request } from "express";
import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";

// Keyed by session user id when present, falling back to the client IP.
// We route the IP through `ipKeyGenerator` so an IPv6 client can't bypass
// the limit by varying the low-order bits of its address — this is the
// same pattern the auth limiters in `authHardening.ts` use.
export const aiUserKey = (req: Request): string =>
  req.session?.userId
    ? `u:${req.session.userId}`
    : `ip:${ipKeyGenerator(req.ip ?? "")}`;

export function makeAiPerMinuteLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: aiUserKey,
    message: {
      message:
        "Too many AI requests. Please slow down and try again in a minute.",
    },
    ...overrides,
  });
}

export function makeAiPerDayLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: aiUserKey,
    message: {
      message: "Daily AI usage limit reached. Please try again tomorrow.",
    },
    ...overrides,
  });
}
