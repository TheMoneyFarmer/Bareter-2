import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import session from "express-session";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  loginSchema,
  registerSchema,
  adminKybStatusSchema,
  consentRequestSchema,
  COOKIE_POLICY_VERSION,
  insertListingSchema,
  insertDealSchema,
  insertMessageSchema,
  insertRatingSchema,
  insertPostSchema,
  insertReportSchema,
  listings,
  reports,
  quickInquiries,
  users,
  deals,
  messages,
  ratings,
  followers,
  referrals,
  wishlists,
  posts,
  postLikes,
  postComments,
  postBookmarks,
  endorsements,
  savedSearches,
  dealMilestones,
  portfolioItems,
  listingLikes,
  listingComments,
  moderationLogs,
  agentInteractions,
  consentLogs,
  notifications,
  imageScans,
  salesLeads,
  salesReengagementEvents,
  bannedEmails,
  disputes,
  adminAuditLogs,
  failedLoginAttempts,
  searchQueryHistory,
  engagementEvents,
  reviews as reviewsTable,
  collabApplications,
  broadcastJobs,
  emailLogs,
  supportTickets,
  userBlocks,
  type Dispute,
  type DisputeEvidence,
  insertDisputeSchema,
  DISPUTE_OUTCOMES,
  featureWaitlists,
} from "@shared/schema";
import { allCategorySlugs, allSubcategorySlugs } from "@shared/category-slugs";
import {
  isValidPrivateDocPath,
  canAccessPrivateDoc,
} from "./security";
import {
  makeRegisterValidator,
  makeAdminKybValidator,
  makePrivateDocAuthGate,
} from "./handlers/securitySensitive";
import {
  hashPassword,
  hashResetToken,
  detectAllowedFileType,
  makeLoginRateLimiter,
  makeRegisterRateLimiter,
  makeForgotPasswordRateLimiter,
  makeConsentRateLimiter,
  makeClientErrorRateLimiter,
  makeResetPasswordRateLimiter,
  makeSupportTicketRateLimiter,
} from "./handlers/authHardening";
import {
  makeAiPerMinuteLimiter,
  makeAiPerDayLimiter,
} from "./handlers/aiRateLimit";
import { db, pool } from "./db";
import crypto from "crypto";
import connectPgSimple from "connect-pg-simple";
import { isEmailConfigured, sendWaitlistLaunchEmail } from "./emailService";
import { registerWaitlistRoutes, bustWaitlistEnabledCache } from "./waitlistRoutes";
import { getVapidPublicKey, saveSubscription, removeSubscription, sendPushToUser } from "./pushService";
import { eq, and, desc, asc, gte, count, lt, sql as sqlOperator, or, ilike, inArray, not } from "drizzle-orm";

// AI rate limiters. Factories live in `handlers/aiRateLimit.ts` so the
// security tests can construct fresh, low-threshold copies, and so the
// IP key normalises through `ipKeyGenerator` (IPv6-safe).
const aiPerMinuteLimiter = makeAiPerMinuteLimiter();
const aiPerDayLimiter = makeAiPerDayLimiter();

// Per-IP limiters for the auth surface. Login + register are bursty during
// credential stuffing / mass-signup abuse, so we cap them; the password
// reset endpoint is the most attractive enumeration target so it gets the
// strictest cap. Factories live in `handlers/authHardening.ts` so the
// security tests can construct fresh, low-threshold copies.
const loginLimiter = makeLoginRateLimiter();
const registerLimiter = makeRegisterRateLimiter();
const forgotPasswordLimiter = makeForgotPasswordRateLimiter();
const resetPasswordLimiter = makeResetPasswordRateLimiter();
const supportTicketLimiter = makeSupportTicketRateLimiter();

// Configure multer for file uploads.
// We keep uploads in-memory so we can magic-byte verify the buffer before
// committing it anywhere. Public assets (avatars/portfolio) are written to
// the local /uploads dir with crypto-random names; private documents
// (KYC/KYB) go to the private object-storage bucket and are gated behind
// an owner/admin auth check.
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Magic-byte allow-list and detector live in `handlers/authHardening.ts`
// alongside the other audit hardening primitives so the security suite
// can exercise them without booting the full route table.

// Private upload types are routed to object storage; everything else goes to
// the public /uploads dir.
const PRIVATE_UPLOAD_TYPES = new Set(["verification", "business_license"]);

const PgSession = connectPgSimple(session);

// Destroy every persisted session for a user except (optionally) the
// caller's current one. Safe to call from auth flows after a password
// change/reset. Touches the connect-pg-simple `session` table directly.
async function destroyUserSessions(userId: string, exceptSid?: string): Promise<void> {
  const params: (string | undefined)[] = [userId];
  let sql = `DELETE FROM "session" WHERE sess->>'userId' = $1`;
  if (exceptSid) {
    sql += ` AND sid <> $2`;
    params.push(exceptSid);
  }
  try {
    await pool.query(sql, params.filter((p): p is string => p !== undefined));
  } catch (err) {
    console.error("[session] failed to invalidate sessions for user", userId, err);
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    guestTicketIds: string[];
  }
}

function param(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] || "";
  return val || "";
}

function uaFingerprint(req: Request): string {
  const ua = req.headers["user-agent"] || "";
  return crypto.createHash("sha256").update(ua).digest("hex").slice(0, 16);
}

// Module-level throttle: only update users.last_active_at at most once per
// minute per user. Keeps requireAuth essentially free on hot paths while
// still keeping the activeUsers7d KPI accurate. Entries older than the
// throttle window are pruned periodically so the Map can never grow
// unbounded over the lifetime of the process.
const lastActiveTouchedAt = new Map<string, number>();
const LAST_ACTIVE_THROTTLE_MS = 60 * 1000;
const LAST_ACTIVE_SWEEP_MS = 5 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - LAST_ACTIVE_THROTTLE_MS;
  for (const [uid, ts] of lastActiveTouchedAt) {
    if (ts < cutoff) lastActiveTouchedAt.delete(uid);
  }
}, LAST_ACTIVE_SWEEP_MS).unref?.();

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const uid = req.session.userId;
  if (!uid) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  // Session fingerprint check — if the stored fingerprint doesn't match the
  // current user-agent, the session cookie may have been replayed from a
  // different device or browser. We invalidate and force re-login.
  const storedFp = (req.session as any).uaFingerprint as string | undefined;
  if (storedFp) {
    const currentFp = uaFingerprint(req);
    if (storedFp !== currentFp) {
      console.warn(`[requireAuth] UA fingerprint mismatch for user ${uid} — forcing re-auth`);
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }
  }
  const now = Date.now();
  const lastTouch = lastActiveTouchedAt.get(uid) ?? 0;
  if (now - lastTouch > LAST_ACTIVE_THROTTLE_MS) {
    lastActiveTouchedAt.set(uid, now);
    storage
      .updateUser(uid, { lastActiveAt: new Date() })
      .catch((err) => console.error("[requireAuth] lastActiveAt update failed:", err));
  }
  next();
};

// Defense-in-depth: even if a stray row has `isAdmin = true`, the request
// is rejected unless the user's email is in the admin allowlist.
// The allowlist is stored in `app_settings` (key: `admin_email_allowlist`)
// so it can be updated at runtime without a redeploy. Falls back to the
// `ADMIN_EMAIL_ALLOWLIST` environment variable when no DB row exists.
async function getAdminEmailAllowlist(): Promise<Set<string> | null> {
  let raw: string | null = null;
  try {
    raw = await storage.getAppSetting("admin_email_allowlist");
  } catch {
    // DB unavailable — fall back to env var
  }
  if (!raw || !raw.trim()) {
    raw = process.env.ADMIN_EMAIL_ALLOWLIST ?? null;
  }
  if (!raw || !raw.trim()) return null;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

// Mutate the DB-stored allowlist. Called by promote/demote endpoints.
async function updateAdminAllowlist(email: string, action: "add" | "remove", updatedBy?: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const current = await getAdminEmailAllowlist();
  const set: Set<string> = current ? new Set(current) : new Set<string>();
  if (action === "add") {
    set.add(normalizedEmail);
  } else {
    set.delete(normalizedEmail);
  }
  await storage.setAppSetting("admin_email_allowlist", [...set].join(","), updatedBy);
}

// Strip `isAdmin` from any client-facing user payload whose email is not
// on the allowlist. This way a stale row in the DB cannot expose the admin
// nav on the client even if `requireAdmin` already blocks the API calls.
async function sanitizeAdminFlag<T extends { email?: string | null; isAdmin?: boolean | null }>(
  payload: T,
): Promise<T> {
  const allow = await getAdminEmailAllowlist();
  if (allow && payload.isAdmin && !allow.has((payload.email ?? "").trim().toLowerCase())) {
    return { ...payload, isAdmin: false };
  }
  return payload;
}

const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await storage.getUser(req.session.userId);
  const hasAdminRole = user?.isAdmin || user?.role === "super_admin" || user?.role === "admin";
  if (!hasAdminRole) {
    return res.status(403).json({ message: "Forbidden" });
  }
  const allow = await getAdminEmailAllowlist();
  if (allow && !allow.has((user.email ?? "").trim().toLowerCase())) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session middleware - trust proxy for Replit's HTTPS
  app.set("trust proxy", 1);
  
  app.use(
    session({
      secret: (() => {
        const s = process.env.SESSION_SECRET;
        if (!s) {
          throw new Error(
            "SESSION_SECRET is required. Refusing to boot. Set SESSION_SECRET in your environment (development and production).",
          );
        }
        return s;
      })(),
      resave: false,
      saveUninitialized: false,
      store: new PgSession({
        pool: pool as any,
        tableName: "session",
        createTableIfMissing: true,
      }),
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  );

  // ── Google OAuth ────────────────────────────────────────────────────────────
  // Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.
  // Set authorized redirect URI in Google Cloud Console to:
  //   https://your-domain.com/auth/google/callback
  //   http://localhost:5000/auth/google/callback  (dev)
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    const { Strategy: GoogleStrategy } = await import("passport-google-oauth20");
    const passport = (await import("passport")).default;
    app.use(passport.initialize());

    const baseUrl = process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 5000}`;

    passport.use(new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: `${baseUrl}/auth/google/callback`,
        scope: ["profile", "email"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase().trim();
          if (!email) return done(new Error("No email returned from Google"), undefined);

          // 1. Existing user matched by googleId
          let user = await storage.getUserByGoogleId(profile.id);
          if (user) return done(null, user);

          // 2. Existing user with same email → link Google account
          user = await storage.getUserByEmail(email);
          if (user) {
            await storage.updateUser(user.id, { googleId: profile.id });
            return done(null, user);
          }

          // 3. Brand new user — create account from Google profile
          const fullName = profile.displayName || profile.name?.givenName || email.split("@")[0];
          const avatarUrl = profile.photos?.[0]?.value || null;
          // Use a random unhashable password — Google users authenticate via OAuth only
          const randomPw = crypto.randomBytes(32).toString("hex");
          user = await storage.createUser({
            email,
            password: randomPw,
            fullName,
            avatarUrl: avatarUrl ?? undefined,
            googleId: profile.id,
            country: "AE",
            signupType: "personal",
          } as any);

          return done(null, user);
        } catch (err) {
          return done(err as Error, undefined);
        }
      }
    ));

    // Kick off the OAuth flow
    app.get("/auth/google", (req, res, next) => {
      const redirect = (req.query.redirect as string) || "/browse";
      // stash redirect destination in session before we leave the app
      (req.session as any).oauthRedirect = redirect.startsWith("/") ? redirect : "/browse";
      // session must NOT be false here — passport needs to store the OAuth state
      // parameter in the session. Without it, Google rejects the request as
      // non-compliant with its OAuth 2.0 security policy.
      passport.authenticate("google")(req, res, next);
    });

    // Google redirects here after user authorises
    app.get(
      "/auth/google/callback",
      passport.authenticate("google", { session: false, failureRedirect: "/login?google_error=1" }),
      async (req: any, res) => {
        try {
          const user = req.user;
          if (!user) return res.redirect("/login?google_error=1");

          // Create our own session (consistent with email/password login)
          req.session.userId = user.id;
          (req.session as any).uaFingerprint = uaFingerprint(req);
          await new Promise<void>((resolve, reject) =>
            req.session.save((err: any) => (err ? reject(err) : resolve()))
          );

          const dest = (req.session as any).oauthRedirect || "/browse";
          delete (req.session as any).oauthRedirect;
          res.redirect(dest);
        } catch {
          res.redirect("/login?google_error=1");
        }
      }
    );
  } else {
    // Placeholder routes so the frontend doesn't get a raw 404
    app.get("/auth/google", (_req, res) => {
      res.redirect("/login?google_error=not_configured");
    });
    app.get("/auth/google/callback", (_req, res) => {
      res.redirect("/login?google_error=not_configured");
    });
  }

  // Expose whether Google OAuth is available to the frontend
  app.get("/api/auth/google/status", (_req, res) => {
    res.json({ enabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) });
  });

  // ── Apple Sign In ────────────────────────────────────────────────────────────
  // Requires 4 env vars — see setup checklist below.
  // APPLE_CLIENT_ID     = your Services ID (e.g. com.bareter.webapp)
  // APPLE_TEAM_ID       = your 10-char Apple Developer Team ID
  // APPLE_KEY_ID        = the key ID from the .p8 private key you downloaded
  // APPLE_PRIVATE_KEY   = full contents of the .p8 file (newlines as \n)
  const APPLE_CLIENT_ID  = process.env.APPLE_CLIENT_ID;
  const APPLE_TEAM_ID    = process.env.APPLE_TEAM_ID;
  const APPLE_KEY_ID     = process.env.APPLE_KEY_ID;
  const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY;
  const appleConfigured  = !!(APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY);

  app.get("/api/auth/apple/status", (_req, res) => {
    res.json({ enabled: appleConfigured });
  });

  if (appleConfigured) {
    const appleSignin = await import("apple-signin-auth");
    const jwt         = await import("jsonwebtoken");
    const baseUrl     = process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 5000}`;

    // Build a short-lived client_secret JWT signed with the Apple private key
    function makeAppleClientSecret(): string {
      const privateKey = (APPLE_PRIVATE_KEY as string).replace(/\\n/g, "\n");
      const now = Math.floor(Date.now() / 1000);
      return (jwt as any).default.sign(
        { iss: APPLE_TEAM_ID, iat: now, exp: now + 180, aud: "https://appleid.apple.com", sub: APPLE_CLIENT_ID },
        privateKey,
        { algorithm: "ES256", keyid: APPLE_KEY_ID }
      );
    }

    // Step 1 — redirect user to Apple's auth page
    app.get("/auth/apple", (req, res) => {
      const redirect = (req.query.redirect as string) || "/browse";
      (req.session as any).oauthRedirect = redirect.startsWith("/") ? redirect : "/browse";
      const params = new URLSearchParams({
        client_id:     APPLE_CLIENT_ID as string,
        redirect_uri:  `${baseUrl}/auth/apple/callback`,
        response_type: "code id_token",
        response_mode: "form_post",
        scope:         "name email",
        state:         crypto.randomBytes(8).toString("hex"),
      });
      res.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
    });

    // Step 2 — Apple POSTs back with code + id_token
    app.post("/auth/apple/callback", async (req: any, res) => {
      try {
        const { code, id_token: idToken, user: userJson } = req.body as Record<string, string>;
        if (!code || !idToken) return res.redirect("/login?apple_error=1");

        // Verify the identity token with Apple's public keys
        const applePayload = await appleSignin.default.verifyIdToken(idToken, {
          audience: APPLE_CLIENT_ID,
          ignoreExpiration: false,
        });

        const appleId = applePayload.sub;
        const email   = (applePayload.email as string | undefined)?.toLowerCase().trim();

        // Apple only sends name on the very first sign-in
        let fullName = "Bareter Member";
        if (userJson) {
          try {
            const parsed = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
            const first  = parsed.name?.firstName || "";
            const last   = parsed.name?.lastName  || "";
            if (first || last) fullName = `${first} ${last}`.trim();
          } catch { /* ignore */ }
        }

        // 1. Existing user matched by appleId
        let user = await storage.getUserByAppleId?.(appleId);
        if (!user && email) {
          // 2. Existing user with same email → link Apple ID
          user = await storage.getUserByEmail(email);
          if (user) await storage.updateUser(user.id, { appleId } as any);
        }
        if (!user) {
          // 3. Brand new user
          const randomPw = crypto.randomBytes(32).toString("hex");
          user = await storage.createUser({
            email: email || `apple_${appleId}@privaterelay.appleid.com`,
            password: randomPw,
            fullName,
            appleId,
            country: "AE",
            signupType: "personal",
          } as any);
        }

        req.session.userId = user.id;
        (req.session as any).uaFingerprint = uaFingerprint(req);
        await new Promise<void>((resolve, reject) =>
          req.session.save((err: any) => (err ? reject(err) : resolve()))
        );

        const dest = (req.session as any).oauthRedirect || "/browse";
        delete (req.session as any).oauthRedirect;
        res.redirect(dest);
      } catch (err) {
        console.error("[Apple OAuth] callback error:", err);
        res.redirect("/login?apple_error=1");
      }
    });
  } else {
    app.get("/auth/apple", (_req, res) => res.redirect("/login?apple_error=not_configured"));
    app.post("/auth/apple/callback", (_req, res) => res.redirect("/login?apple_error=not_configured"));
  }

  // ── Maintenance mode middleware ──────────────────────────────────────
  let maintenanceCache: { value: boolean; at: number } = { value: false, at: 0 };
  const MAINTENANCE_TTL = 5_000;
  async function isMaintenanceMode(): Promise<boolean> {
    const now = Date.now();
    if (now - maintenanceCache.at < MAINTENANCE_TTL) return maintenanceCache.value;
    const val = await storage.getAppSetting("maintenance_mode");
    maintenanceCache = { value: val === "true", at: now };
    return maintenanceCache.value;
  }
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (
      !req.path.startsWith("/api/") ||
      req.path.startsWith("/api/admin/") ||
      req.path === "/api/auth/me" ||
      req.path === "/api/auth/login" ||
      req.path === "/api/config" ||
      req.path === "/api/public/settings" ||
      req.path === "/api/waitlist/mode"
    ) return next();
    try {
      if (await isMaintenanceMode()) {
        if (req.session?.userId) {
          const sessionUser = await storage.getUser(req.session.userId).catch(() => null);
          if (sessionUser?.isAdmin || sessionUser?.role === "admin" || sessionUser?.role === "super_admin") {
            return next();
          }
        }
        return res.status(503).json({ message: "Bareter is currently under maintenance. Please try again later.", maintenance: true });
      }
    } catch { /* proceed on error */ }
    next();
  });

  // ── Public settings (CMS content, contact info, banner) ────────────
  app.get("/api/public/settings", async (_req, res) => {
    try {
      const all = await storage.getAllAppSettings();
      const publicKeys = [
        "hero_headline", "hero_tagline", "hero_cta", "hero_cta_url", "how_it_works_steps", "faq_entries",
        "contact_email", "support_email", "support_phone",
        "announcement_banner_enabled", "announcement_banner_text", "announcement_banner_link",
        "active_emirates", "maintenance_mode", "maintenance_message", "registration_enabled", "invite_only_mode",
        "high_value_threshold",
        "waitlist_enabled", "disputes_enabled", "ai_matching_enabled",
        // Task #248 — public so the unsubscribe page can reflect current
        // admin gating without a separate fetch.
        "reminders_enabled",
      ];
      const result: Record<string, string | null> = {};
      for (const key of publicKeys) {
        const v = all[key];
        result[key] = (v != null && v !== "") ? v : null;
      }

      // Try to overlay CMS content from Sanity (graceful fallback to app_settings)
      try {
        const { getSanityHero, getSanityHowItWorksSteps, getSanityFaqEntries } = await import("./lib/sanity");
        const [sanityHero, sanitySteps, sanityFaq] = await Promise.all([
          getSanityHero(),
          getSanityHowItWorksSteps(),
          getSanityFaqEntries(),
        ]);

        if (sanityHero?.headline) result["hero_headline"] = sanityHero.headline;
        if (sanityHero?.tagline) result["hero_tagline"] = sanityHero.tagline;
        if (sanityHero?.ctaText) result["hero_cta"] = sanityHero.ctaText;
        if (sanityHero?.ctaUrl) result["hero_cta_url"] = sanityHero.ctaUrl;

        if (sanitySteps && sanitySteps.length > 0) {
          result["how_it_works_steps"] = JSON.stringify(sanitySteps);
        }
        if (sanityFaq && sanityFaq.length > 0) {
          result["faq_entries"] = JSON.stringify(sanityFaq);
        }
      } catch {
        // Sanity unavailable — app_settings values already set above
      }

      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json(result);
    } catch {
      res.status(500).json({ message: "Failed to load settings" });
    }
  });

  // ── Blog posts (Sanity CMS) ──────────────────────────────────────────
  app.get("/api/blog", async (_req, res) => {
    try {
      const { getSanityBlogPosts } = await import("./lib/sanity");
      const posts = await getSanityBlogPosts();
      return res.json(posts ?? []);
    } catch (err) {
      console.error("[blog] Failed to fetch blog posts:", err);
      return res.json([]);
    }
  });

  app.get("/api/blog/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      if (!slug || typeof slug !== "string") {
        return res.status(400).json({ message: "Invalid slug" });
      }
      const { getSanityBlogPost } = await import("./lib/sanity");
      const post = await getSanityBlogPost(slug);
      if (!post) return res.status(404).json({ message: "Not found" });
      return res.json(post);
    } catch (err) {
      console.error("[blog] Failed to fetch blog post:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── Public help articles (Sanity CMS with empty-array fallback) ─────
  app.get("/api/public/help-articles", async (_req, res) => {
    try {
      let articles: { slug: string; title: string; body: string }[] = [];

      // Sanity is the primary source
      try {
        const { getSanityHelpArticles } = await import("./lib/sanity");
        const sanityArticles = await getSanityHelpArticles();
        if (sanityArticles && sanityArticles.length > 0) {
          articles = sanityArticles;
        }
      } catch {
        // Sanity unavailable — fall through to app_settings fallback
      }

      // app_settings fallback: JSON array stored under key "help_articles"
      if (articles.length === 0) {
        try {
          const raw = await storage.getAppSetting("help_articles");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              articles = parsed;
            }
          }
        } catch {
          // app_settings fallback unavailable — client falls back to hardcoded content
        }
      }

      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json(articles);
    } catch {
      res.status(500).json({ message: "Failed to load help articles" });
    }
  });

  // Auth routes. The strict-schema validation is mounted as a separate
  // middleware so the security test suite can exercise the 400 response
  // for unknown fields without needing a database.
  app.post("/api/auth/register", registerLimiter, makeRegisterValidator(), async (req, res) => {
    try {
      const data = res.locals.registerData as ReturnType<typeof registerSchema.parse>;

      const regEnabled = await storage.getAppSetting("registration_enabled");
      if (regEnabled === "false") {
        return res.status(403).json({ message: "Registration is currently disabled. Please check back later." });
      }

      const inviteOnly = await storage.getAppSetting("invite_only_mode");
      if (inviteOnly === "true") {
        const inviteCode = data.inviteCode;
        let invited = false;
        const waitlistEntry = await storage.getWaitlistEntryByEmail(data.email).catch(() => null);
        if (waitlistEntry) {
          invited = true;
        } else if (inviteCode) {
          // Check beta invite code first (fastest path for testers)
          const betaCode = await storage.getAppSetting("beta_invite_code").catch(() => null);
          if (betaCode && inviteCode === betaCode) {
            invited = true;
          } else {
            const codeEntry = await storage.getWaitlistEntryByReferralCode(inviteCode).catch(() => null);
            if (codeEntry) invited = true;
          }
        }
        if (!invited) {
          return res.status(403).json({ message: "Registration is by invitation only. Please join the waitlist or use a valid invite code." });
        }
      }

      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Block duplicate phone numbers — same phone can't be used for multiple accounts
      const regPhone: string | undefined = typeof req.body.phone === "string" ? req.body.phone.trim() : undefined;
      if (regPhone) {
        // E.164 validation: +<country code><number>, 8-15 digits total
        if (!/^\+[1-9]\d{7,14}$/.test(regPhone)) {
          return res.status(400).json({ message: "Invalid phone number format. Use international format e.g. +971501234567" });
        }
        const phoneUser = await storage.getUserByPhone(regPhone);
        if (phoneUser) {
          return res.status(400).json({ message: "An account with this phone number already exists" });
        }
      }
      const allowedSignupTypes = ["personal", "business"] as const;
      const rawSignupType = req.body.signupType;
      if (rawSignupType && !allowedSignupTypes.includes(rawSignupType)) {
        return res.status(400).json({ message: "Invalid account type" });
      }

      const isBanned = await storage.isBannedEmail(data.email);
      if (isBanned) {
        return res.status(403).json({ message: "This email address has been suspended from the platform" });
      }

      const hashedPassword = await hashPassword(data.password);

      // Auto-grant Founder Badge if email matches a waitlist entry
      const waitlistEntry = await storage.getWaitlistEntryByEmail(data.email).catch(() => undefined);
      const founderBadge = !!waitlistEntry;

      const user = await storage.createUser({
        email: data.email,
        password: hashedPassword,
        fullName: data.fullName,
        country: data.country || "AE",
        city: data.city || null,
        location: data.city || null,
        phone: regPhone || null,
        signupType: (allowedSignupTypes.includes(rawSignupType) ? rawSignupType : "personal") as "personal" | "business",
        socialProfiles: req.body.socialProfiles || [],
        founderBadge,
        founderBadgeAt: founderBadge ? new Date() : null,
      });

      if (waitlistEntry) {
        storage.convertWaitlistEntryToUser(data.email, user.id).catch((err) =>
          console.error("[waitlist] convert failed:", err),
        );
      }

      // Send email verification link (fire-and-forget — never blocks registration)
      ;(async () => {
        try {
          const verifyToken = crypto.randomBytes(32).toString("hex");
          const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
          await db.update(users).set({
            emailVerificationToken: verifyToken,
            emailVerificationExpires: expires,
          }).where(eq(users.id, user.id));
          const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
          const host = req.headers["x-forwarded-host"] || req.headers.host;
          const baseUrl = `${protocol}://${host}`;
          const { sendEmailVerificationEmail } = await import("./emailService");
          await sendEmailVerificationEmail(data.email, {
            fullName: data.fullName,
            verifyUrl: `${baseUrl}/api/auth/verify-email?token=${verifyToken}`,
          });
        } catch (err) {
          console.error("[register] email verification send failed:", err);
        }
      })();

      req.session.userId = user.id;
      (req.session as any).uaFingerprint = uaFingerprint(req);
      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Session error" });
        }
        const { password, ...userWithoutPassword } = user;
        sanitizeAdminFlag(userWithoutPassword)
          .then((safe) => res.json(safe))
          .catch(() => res.json(userWithoutPassword));
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Email verification ───────────────────────────────────────────────────
  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token.trim() : null;
      if (!token) return res.status(400).send("Invalid verification link.");

      const [user] = await db.select().from(users).where(eq(users.emailVerificationToken, token)).limit(1);
      if (!user) return res.status(400).send("Verification link is invalid or has already been used.");
      if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
        return res.status(400).send("Verification link has expired. Please request a new one from your profile settings.");
      }

      await db.update(users).set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      }).where(eq(users.id, user.id));

      // Redirect to the app with a success flag the frontend can show
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      return res.redirect(`${protocol}://${host}/?email_verified=1`);
    } catch (err) {
      console.error("[verify-email]", err);
      return res.status(500).send("Something went wrong. Please try again.");
    }
  });

  // Resend verification email (for users who missed the first one)
  app.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.emailVerified) return res.status(400).json({ message: "Email already verified" });

      const verifyToken = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.update(users).set({
        emailVerificationToken: verifyToken,
        emailVerificationExpires: expires,
      }).where(eq(users.id, userId));

      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;
      const { sendEmailVerificationEmail } = await import("./emailService");
      await sendEmailVerificationEmail(user.email, {
        fullName: user.fullName,
        verifyUrl: `${baseUrl}/api/auth/verify-email?token=${verifyToken}`,
      });
      res.json({ message: "Verification email sent" });
    } catch (err) {
      console.error("[resend-verification]", err);
      res.status(500).json({ message: "Failed to send verification email" });
    }
  });

  // ── Phone OTP (WhatsApp) ─────────────────────────────────────────────────
  app.post("/api/auth/phone/send-otp", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const phone: string | undefined = typeof req.body.phone === "string" ? req.body.phone.trim() : undefined;
      if (!phone) return res.status(400).json({ message: "Phone number required" });
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        return res.status(400).json({ message: "Use international format, e.g. +971501234567" });
      }

      // Prevent one phone number being linked to multiple accounts
      const existing = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.phone, phone), not(eq(users.id, userId)))).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ message: "This phone number is already linked to another account" });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await db.update(users).set({
        phone,
        phoneVerificationCode: code,
        phoneVerificationExpires: expires,
        phoneVerified: false,
      }).where(eq(users.id, userId));

      const { sendWhatsApp } = await import("./companyOs/twilio");
      const body = `Your Bareter verification code is: ${code}\nValid for 10 minutes.\nDo not share this code.`;
      const sent = await sendWhatsApp(phone, body);

      if (!sent) {
        // Log the code in dev so the flow can be tested without Twilio
        if (process.env.NODE_ENV !== "production") {
          console.log(`[phone-otp] DEV: code for ${phone} is ${code}`);
        }
        // Don't fail — return ok so UI can prompt for the code even in dev
      }

      res.json({ message: "Code sent via WhatsApp", dev: process.env.NODE_ENV !== "production" ? code : undefined });
    } catch (err) {
      console.error("[phone/send-otp]", err);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  app.post("/api/auth/phone/verify-otp", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const code: string | undefined = typeof req.body.code === "string" ? req.body.code.trim() : undefined;
      if (!code) return res.status(400).json({ message: "Verification code required" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.phoneVerified) return res.json({ message: "Phone already verified", phoneVerified: true });

      if (!user.phoneVerificationCode || user.phoneVerificationCode !== code) {
        return res.status(400).json({ message: "Invalid verification code" });
      }
      if (!user.phoneVerificationExpires || user.phoneVerificationExpires < new Date()) {
        return res.status(400).json({ message: "Code has expired — please request a new one" });
      }

      await db.update(users).set({
        phoneVerified: true,
        phoneVerificationCode: null,
        phoneVerificationExpires: null,
      }).where(eq(users.id, userId));

      res.json({ message: "Phone verified", phoneVerified: true });
    } catch (err) {
      console.error("[phone/verify-otp]", err);
      res.status(500).json({ message: "Failed to verify code" });
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(data.email.trim().toLowerCase());
      if (!user) {
        storage.createFailedLoginAttempt({
          email: data.email.trim().toLowerCase(),
          ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null,
          userAgent: req.headers["user-agent"] || null,
          reason: "user_not_found",
        }).catch(() => {});
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(data.password, user.password);
      if (!validPassword) {
        storage.createFailedLoginAttempt({
          email: data.email.trim().toLowerCase(),
          ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null,
          userAgent: req.headers["user-agent"] || null,
          reason: "invalid_password",
        }).catch(() => {});
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;
      (req.session as any).uaFingerprint = uaFingerprint(req);
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Session error" });
        }
        const { password, ...userWithoutPassword } = user;
        sanitizeAdminFlag(userWithoutPassword)
          .then((safe) => res.json(safe))
          .catch(() => res.json(userWithoutPassword));
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email.toLowerCase().trim());

      if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000);

        // Store only the SHA-256 hash. Raw token lives only in the email link.
        await storage.updateUser(user.id, {
          passwordResetToken: hashResetToken(token),
          passwordResetExpires: expires,
        });

        // In development use APP_BASE_URL (localhost) so the reset link opens
        // in the same environment the user is testing. In production use the
        // public URL so the link works from any device/email client.
        const baseUrl = (process.env.NODE_ENV !== "production"
          ? process.env.APP_BASE_URL?.trim().replace(/\/+$/, "")
          : process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, ""))
          || (() => {
            const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
            const host = req.headers["x-forwarded-host"] || req.headers.host;
            return `${protocol}://${host}`;
          })();

        const { sendPasswordResetEmail } = await import("./emailService");
        await sendPasswordResetEmail(user.email, token, baseUrl);
      }

      res.json({ message: "If an account exists for that email, a reset link has been sent." });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  app.get("/api/auth/reset-password/validate", async (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ valid: false, message: "Token is required" });
    }
    const user = await storage.getUserByPasswordResetToken(hashResetToken(token));
    if (!user || !user.passwordResetExpires || new Date() > new Date(user.passwordResetExpires)) {
      return res.status(400).json({ valid: false, message: "Reset link is invalid or has expired" });
    }
    res.json({ valid: true });
  });

  // Dev-only: auth diagnostics — shows account state without exposing passwords.
  app.get("/api/auth/dev-diag", async (req, res) => {
    if (process.env.NODE_ENV === "production") return res.status(404).end();
    try {
      const email = (req.query.email as string || "").toLowerCase().trim();
      if (!email) return res.json({ error: "pass ?email=... in the query string" });
      const user = await storage.getUserByEmail(email);
      if (!user) return res.json({ found: false, email });
      const testPass = req.query.password as string | undefined;
      const match = testPass ? await bcrypt.compare(testPass, user.password) : null;
      res.json({
        found: true,
        email: user.email,
        id: user.id,
        isAdmin: user.isAdmin,
        passwordHashPrefix: user.password?.slice(0, 7) ?? "null",
        passwordTestMatch: match,
        sessionUserId: (req.session as any)?.userId ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  // Dev-only: directly set a user's password without email verification.
  // Disabled in production — returns 404 so it's not discoverable.
  app.post("/api/auth/dev-set-password", async (req, res) => {
    if (process.env.NODE_ENV === "production") return res.status(404).end();
    try {
      const { email, password } = req.body;
      if (!email || !password || password.length < 8) {
        return res.status(400).json({ message: "email and password (min 8 chars) required" });
      }
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      if (!user) return res.status(404).json({ message: "User not found" });
      const hash = await bcrypt.hash(password, 10);
      await storage.updateUser(user.id, { password: hash });
      res.json({ message: "Password updated. You can now log in." });
    } catch (err: any) {
      res.status(500).json({ message: err?.message ?? "Failed" });
    }
  });

  app.post("/api/auth/reset-password", resetPasswordLimiter, async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const user = await storage.getUserByPasswordResetToken(hashResetToken(token));
      if (!user || !user.passwordResetExpires || new Date() > new Date(user.passwordResetExpires)) {
        return res.status(400).json({ message: "Reset link is invalid or has expired" });
      }

      const hashedPassword = await hashPassword(password);

      await storage.updateUser(user.id, {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      });

      // Reset is performed by an unauthenticated caller — destroy ALL of
      // the user's existing sessions so any attacker who was already in is
      // booted out.
      await destroyUserSessions(user.id);

      res.json({ message: "Password updated successfully" });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Geo lookup endpoint - returns detected country/city for the requesting client
  app.get("/api/geo/lookup", async (req, res) => {
    try {
      // Per-session cache so we don't hit external geo providers on every load.
      const sess = req.session as any;
      const cached = sess?.geoLookup;
      const TTL_MS = 60 * 60 * 1000; // 1 hour
      if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
        return res.json({ ...cached.value, cached: true });
      }
      const { lookupGeo } = await import("./geoClient");
      const result = await lookupGeo(req);
      if (sess) {
        sess.geoLookup = { value: result, expiresAt: Date.now() + TTL_MS };
      }
      res.json(result);
    } catch (error) {
      console.error("Geo lookup error:", error);
      res.json({ country: "AE", countryName: "United Arab Emirates", city: "Dubai", source: "fallback" });
    }
  });

  // Mark the location-prompt as shown so the user does not see the popup again
  app.post("/api/users/me/location-prompted", requireAuth, async (req, res) => {
    try {
      await storage.updateUser(req.session.userId!, { locationPrompted: true });
      res.json({ ok: true });
    } catch (error) {
      console.error("Mark location prompted error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Public client config — what features are wired up in this environment.
  app.get("/api/config", async (_req, res) => {
    const [passwordResetEnabled, maintenanceMode] = await Promise.all([
      isEmailConfigured(),
      storage.getAppSetting("maintenance_mode"),
    ]);
    res.json({
      passwordResetEnabled,
      cookiePolicyVersion: COOKIE_POLICY_VERSION,
      maintenanceMode: maintenanceMode === "true",
      appUrl: process.env.PUBLIC_APP_URL || null,
    });
  });

  // Cookie consent — append-only audit log so we can prove (UAE PDPL /
  // GDPR) that a given subject made a given choice against a given policy
  // version at a given time. The frontend cookie banner POSTs here on
  // accept-all / reject-non-essential / save-preferences.
  const consentLimiter = makeConsentRateLimiter();
  app.post("/api/consent", consentLimiter, async (req, res) => {
    try {
      const parsed = consentRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid consent payload",
          errors: parsed.error.flatten(),
        });
      }
      const data = parsed.data;
      const userId = req.session.userId ?? null;
      const anonymousId = userId ? null : data.anonymousId ?? null;
      if (!userId && !anonymousId) {
        return res.status(400).json({
          message: "anonymousId is required for unauthenticated consent",
        });
      }

      // Strict-mode: a stored consent for an older policy version is
      // recorded as the current decision but stamped with the *current*
      // policy version, so the frontend will re-prompt automatically the
      // next time the user lands on the site.
      // `req.ip` honours the Express `trust proxy` setting configured in
      // server/index.ts and only trusts X-Forwarded-For from the single
      // Replit proxy hop — clients can't spoof their IP into the audit
      // log via a forged header.
      const dcSetting = await storage.getAppSetting("data_collection_disabled");
      if (dcSetting === "true") {
        return res.status(503).json({
          message: "Data collection is temporarily disabled by the platform administrator",
        });
      }

      const ipAddress = req.ip ?? null;
      const userAgent = (req.headers["user-agent"] ?? "").slice(0, 500) || null;

      const row = await storage.createConsentLog({
        userId,
        anonymousId,
        policyVersion: COOKIE_POLICY_VERSION,
        decision: data.decision,
        essential: true,
        analytics: data.analytics,
        marketing: data.marketing,
        ipAddress,
        userAgent,
      });

      res.json({ id: row.id, policyVersion: row.policyVersion });
    } catch (err) {
      console.error("[consent] failed to record consent:", err);
      res.status(500).json({ message: "Failed to record consent" });
    }
  });

  // Client-side error reports from the React ErrorBoundary. Best-effort,
  // non-PII (we only see message/stack/url/UA + a client-minted reference
  // id we echo to the user). Logged so a founder can grep production logs
  // by reference id when a user complains.
  const clientErrorLimiter = makeClientErrorRateLimiter();
  const clientErrorSchema = z.object({
    referenceId: z.string().max(128).optional(),
    message: z.string().max(2000).optional(),
    stack: z.string().max(8000).optional(),
    componentStack: z.string().max(8000).optional(),
    url: z.string().max(2000).optional(),
    userAgent: z.string().max(500).optional(),
  });
  app.post("/api/client-errors", clientErrorLimiter, async (req, res) => {
    const parsed = clientErrorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid error payload" });
    }
    const data = parsed.data;
    console.error("[client-error]", {
      referenceId: data.referenceId ?? null,
      userId: req.session.userId ?? null,
      ip: req.ip ?? null,
      url: data.url ?? null,
      userAgent: data.userAgent ?? null,
      message: data.message ?? null,
      stack: data.stack ?? null,
      componentStack: data.componentStack ?? null,
    });
    res.json({ received: true, referenceId: data.referenceId ?? null });
  });

  // Admin: stream consent log as CSV. Used during regulator inquiries.
  app.get("/api/admin/consent/export.csv", requireAdmin, async (req, res) => {
    try {
      const sinceRaw = typeof req.query.since === "string" ? req.query.since : null;
      const since = sinceRaw ? new Date(sinceRaw) : undefined;
      const rows = await storage.listConsentLogs({
        limit: 50000,
        since: since && !isNaN(since.getTime()) ? since : undefined,
      });

      // CSV-injection-safe escape: prefix any field that starts with a
      // formula trigger (= + - @, plus tab/CR which Excel treats the
      // same) with a single quote so spreadsheet apps render the value
      // literally instead of evaluating it as a formula. Then apply the
      // standard RFC-4180 quote/escape.
      const csvEscape = (v: string | number | boolean | null | undefined) => {
        if (v === null || v === undefined) return "";
        let s = String(v);
        if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
          s = `'${s}`;
        }
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = [
        "id",
        "created_at",
        "policy_version",
        "decision",
        "user_id",
        "anonymous_id",
        "essential",
        "analytics",
        "marketing",
        "ip_address",
        "user_agent",
      ].join(",");
      const body = rows
        .map((r) =>
          [
            r.id,
            r.createdAt?.toISOString() ?? "",
            r.policyVersion,
            r.decision,
            r.userId ?? "",
            r.anonymousId ?? "",
            r.essential,
            r.analytics,
            r.marketing,
            r.ipAddress ?? "",
            r.userAgent ?? "",
          ]
            .map(csvEscape)
            .join(","),
        )
        .join("\n");

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="bareter-consent-log-${stamp}.csv"`,
      );
      res.send(`${header}\n${body}\n`);
    } catch (err) {
      console.error("[consent] export failed:", err);
      res.status(500).json({ message: "Failed to export consent log" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const { password, ...userWithoutPassword } = user;
    res.json(await sanitizeAdminFlag(userWithoutPassword));
  });

  // Serve uploaded files
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=31536000");
    next();
  });
  app.use("/uploads", express.static(uploadDir));

  // File upload endpoint.
  // - Magic-byte verifies the buffer (extension/MIME from the client are
  //   ignored) against ALLOWED_UPLOAD_MIMES.
  // - Private types (verification / business_license) are uploaded to the
  //   private object-storage bucket and surfaced via `/api/private-docs/*`,
  //   which is gated by owner-or-admin auth.
  // - Public types (avatar / portfolio) are written to /uploads with a
  //   crypto-random unguessable filename.
  app.post("/api/upload", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const detected = await detectAllowedFileType(req.file.buffer);
      if (!detected) {
        return res.status(400).json({
          message: "Invalid file type. Only JPG, PNG, GIF, WEBP and PDF are allowed.",
        });
      }

      const uploadType = req.body.type;
      const userId = req.session.userId!;

      let fileUrl: string;

      const isOnReplit = !!process.env.REPL_ID;
      if (PRIVATE_UPLOAD_TYPES.has(uploadType) && isOnReplit) {
        // Push to the private object-storage bucket. The object path is
        // `<PRIVATE_OBJECT_DIR>/private-docs/<userId>/<random>.<ext>`.
        const { objectStorageClient, ObjectStorageService } = await import(
          "./replit_integrations/object_storage/objectStorage"
        );
        const svc = new ObjectStorageService();
        const privateDir = svc.getPrivateObjectDir().replace(/\/+$/, "");
        const random = crypto.randomBytes(24).toString("hex");
        const objectPath = `${privateDir}/private-docs/${userId}/${random}.${detected.ext}`;
        // parseObjectPath equivalent: first segment is bucket, rest is key
        const parts = objectPath.replace(/^\/+/, "").split("/");
        const bucketName = parts[0];
        const objectName = parts.slice(1).join("/");
        await objectStorageClient
          .bucket(bucketName)
          .file(objectName)
          .save(req.file.buffer, {
            contentType: detected.mime,
            metadata: {
              metadata: {
                "custom:aclPolicy": JSON.stringify({
                  owner: userId,
                  visibility: "private",
                }),
              },
            },
          });
        // Public URL exposed by our app — actual download is gated.
        fileUrl = `/api/private-docs/${userId}/${random}.${detected.ext}`;
      } else {
        const random = crypto.randomBytes(24).toString("hex");
        const filename = `${random}.${detected.ext}`;
        const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/+$/, "");
        // Only use Replit object storage when actually running on Replit (REPL_ID is set).
        // Locally, always write to disk even if PRIVATE_OBJECT_DIR is set in .env.local.
        const isOnReplit = !!process.env.REPL_ID;
        if (privateDir && isOnReplit) {
          // Persistent object storage — survives redeploys.
          const { objectStorageClient } = await import(
            "./replit_integrations/object_storage/objectStorage"
          );
          const dirParts = privateDir.replace(/^\/+/, "").split("/");
          const bucketName = dirParts[0];
          const bucketSubDir = dirParts.slice(1).join("/");
          const objectName = bucketSubDir
            ? `${bucketSubDir}/public-uploads/${filename}`
            : `public-uploads/${filename}`;
          await objectStorageClient
            .bucket(bucketName)
            .file(objectName)
            .save(req.file.buffer, {
              contentType: detected.mime,
              metadata: {
                metadata: {
                  "custom:aclPolicy": JSON.stringify({ owner: userId, visibility: "public" }),
                },
              },
            });
          fileUrl = `/objects/public-uploads/${filename}`;
        } else {
          // Local dev (or Replit without object storage) — write to disk.
          fs.writeFileSync(`${uploadDir}/${filename}`, req.file.buffer);
          fileUrl = `/uploads/${filename}`;
        }
      }

      // Update user profile based on upload type
      if (uploadType === "avatar") {
        await storage.updateUser(userId, { avatarUrl: fileUrl });
      } else if (uploadType === "verification") {
        await storage.updateUser(userId, {
          verificationDocUrl: fileUrl,
          verificationStatus: "submitted",
        });
      } else if (uploadType === "portfolio") {
        const user = await storage.getUser(userId);
        if (user) {
          const portfolioImages = [...(user.portfolioImages || []), fileUrl];
          await storage.updateUser(userId, { portfolioImages });
        }
      } else if (uploadType === "business_license") {
        await storage.updateUser(userId, {
          businessLicenseUrl: fileUrl,
          kybStatus: "PENDING_REVIEW",
        });
      }

      res.json({ url: fileUrl, type: uploadType });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Upload error:", msg, error);
      res.status(500).json({ message: `Upload failed: ${msg}` });
    }
  });

  // Auth-gated download for private documents (KYC/KYB).
  // Only the owner of the document or an admin may fetch it.
  app.get(
    "/api/private-docs/:userId/:filename",
    requireAuth,
    makePrivateDocAuthGate({ getUser: (id) => storage.getUser(id) }),
    async (req, res) => {
    try {
      const ownerId = req.params.userId as string;
      const filename = req.params.filename as string;

      const { objectStorageClient, ObjectStorageService } = await import(
        "./replit_integrations/object_storage/objectStorage"
      );
      const svc = new ObjectStorageService();
      const privateDir = svc.getPrivateObjectDir().replace(/\/+$/, "");
      const objectPath = `${privateDir}/private-docs/${ownerId}/${filename}`;
      const parts = objectPath.replace(/^\/+/, "").split("/");
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ message: "Not found" });
      }
      await svc.downloadObject(file, res, 0);
    } catch (error) {
      console.error("Private doc download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to fetch document" });
      }
    }
  });

  // User routes - with strict allowlist to prevent privilege escalation
  const offerNeedItemSchema = z.object({
    name: z.string(),
    value: z.number(),
    description: z.string().optional(),
  });

  const updateProfileSchema = z
    .object({
      fullName: z.string().min(2).max(100).optional(),
      bio: z.string().max(600).optional(),
      location: z.string().max(100).optional(),
      country: z.string().length(2).optional(),
      city: z.string().max(100).optional(),
      locationPrompted: z.boolean().optional(),
      businessName: z.string().max(150).optional(),
      avatarUrl: z.string().url().optional(),
      whatIOffer: z.array(offerNeedItemSchema).optional(),
      whatINeed: z.array(offerNeedItemSchema).optional(),
      portfolioImages: z
        .array(
          z.string().refine(
            (url) => url.startsWith("/uploads/") || /^https?:\/\//.test(url),
            "Portfolio image must be an uploaded file or a valid URL"
          )
        )
        .max(20)
        .optional(),
      language: z.enum(["en", "ar"]).optional(),
    })
    .strict();

  app.patch("/api/users/profile", requireAuth, async (req, res) => {
    try {
      const data = updateProfileSchema.parse(req.body);
      
      // Check if profile is being completed
      const user = await storage.getUser(req.session.userId!);
      let profileCompleted = user?.profileCompleted;
      
      if (!profileCompleted) {
        const newBio = data.bio ?? user?.bio;
        const newLocation = data.location ?? user?.location;
        const newBusinessName = data.businessName ?? user?.businessName;
        if (newBio && newLocation && newBusinessName) {
          profileCompleted = true;
        }
      }

      // Keep legacy `location` field in sync with city when caller updates city
      // but doesn't explicitly provide a `location` value.
      const syncedLocation =
        data.location === undefined && data.city !== undefined
          ? data.city || null
          : data.location;

      const updatedUser = await storage.updateUser(req.session.userId!, {
        ...data,
        ...(syncedLocation !== undefined ? { location: syncedLocation } : {}),
        profileCompleted,
      });
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(await sanitizeAdminFlag(userWithoutPassword));

      // Send profile updated confirmation email
      if (updatedUser.email) {
        import("./emailService").then(({ sendProfileUpdatedEmail }) => {
          sendProfileUpdatedEmail(updatedUser.email!, { recipientName: updatedUser.fullName ?? undefined }).catch(() => {});
        }).catch(() => {});
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Settings update route
  app.patch("/api/users/settings", requireAuth, async (req, res) => {
    try {
      const allowedFields = [
        "fullName", "email", "phone", "website", "businessName", "location",
        "country", "city", "locationPrompted",
        "timezone", "currency", "language",
        "emailNotifications", "dealNotifications", "messageNotifications", "marketingEmails",
        "profileVisibility", "showEmail", "showPhone", "allowDirectMessages",
        "preferredCategories", "tradingRadius", "minTradeValue", "maxTradeValue", "autoMatchEnabled",
        "socialLinks",
      ];
      
      const data: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          data[key] = req.body[key];
        }
      }

      // The UI only supports two languages today (English and Arabic). Reject
      // any other value to keep `users.language` consistent and prevent stray
      // values from sneaking in via direct API calls.
      if (data.language !== undefined && data.language !== "en" && data.language !== "ar") {
        return res.status(400).json({ message: "Invalid language. Must be 'en' or 'ar'." });
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Decimal fields reject empty strings — coerce to null
      if (data.minTradeValue === "") data.minTradeValue = null;
      if (data.maxTradeValue === "") data.maxTradeValue = null;

      const updatedUser = await storage.updateUser(req.session.userId!, data);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userWithoutPassword } = updatedUser;
      res.json(await sanitizeAdminFlag(userWithoutPassword));
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Step 1: request a password change OTP — verifies current password, emails 6-digit code
  app.post("/api/users/change-password/request", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new passwords are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await storage.updateUser(user.id, {
        passwordChangeOtp: otp,
        passwordChangeOtpExpires: expires,
      });

      const { sendPasswordChangeOtpEmail } = await import("./emailService");
      const sent = await sendPasswordChangeOtpEmail(user.email, otp, user.fullName);

      if (!sent) {
        // Email not configured — log it and return the OTP in dev so it's not silent
        if (process.env.NODE_ENV !== "production") {
          return res.json({ message: "Code sent (dev: check server logs)", devOtp: otp });
        }
      }

      return res.json({ message: "Verification code sent to your email" });
    } catch (error) {
      console.error("Change password request error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Step 2: confirm the change using the OTP
  app.post("/api/users/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword, otp } = req.body;

      if (!currentPassword || !newPassword || !otp) {
        return res.status(400).json({ message: "Current password, new password, and verification code are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Re-verify current password as a safety net
      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Verify OTP
      if (!user.passwordChangeOtp || !user.passwordChangeOtpExpires) {
        return res.status(400).json({ message: "No pending verification code. Please request a new one." });
      }
      if (user.passwordChangeOtp !== otp.trim()) {
        return res.status(400).json({ message: "Invalid verification code" });
      }
      if (new Date() > new Date(user.passwordChangeOtpExpires)) {
        return res.status(400).json({ message: "Verification code has expired. Please request a new one." });
      }

      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(req.session.userId!, {
        password: hashedPassword,
        passwordChangeOtp: null,
        passwordChangeOtpExpires: null,
      });

      // Destroy every other active session for this user so a stolen
      // session is invalidated as soon as the legitimate user changes
      // their password. Keep the caller's current session alive.
      await destroyUserSessions(req.session.userId!, req.sessionID);

      // Send confirmation email (non-blocking)
      import("./emailService").then(({ sendPasswordChangedNotificationEmail }) => {
        sendPasswordChangedNotificationEmail(user.email, user.fullName).catch((err) =>
          console.error("[EMAIL] Password changed notification failed:", err),
        );
      });

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Web Push ─────────────────────────────────────────────────────────────────
  app.get("/api/push/vapid-key", (_req, res) => {
    res.json({ publicKey: getVapidPublicKey() });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ message: "Invalid subscription" });
      await saveSubscription(req.session.userId!, { endpoint, keys });
      res.status(201).json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
    try {
      const { endpoint } = req.body;
      if (endpoint) await removeSubscription(endpoint);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });

  // Listings routes with search/filter
  app.get("/api/listings", async (req, res) => {
    try {
      const { search, type, category, location, verified, minValue, maxValue } = req.query;
      const worldwide = req.query.worldwide === "true";
      const seedParam = req.query.seed ? parseInt(req.query.seed as string, 10) : 0;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const sessionUser = req.session?.userId ? await storage.getUser(req.session.userId) : null;
      const queryCountry = req.query.country as string | undefined;
      const queryCity = req.query.city as string | undefined;
      const country = worldwide ? undefined : queryCountry || sessionUser?.country || undefined;
      const city = worldwide ? undefined : queryCity || (queryCountry ? undefined : sessionUser?.city || undefined);

      const listings = await storage.getListingsFiltered({
        search: typeof search === "string" ? search : undefined,
        type: typeof type === "string" ? type : undefined,
        category: typeof category === "string" ? category : undefined,
        location: typeof location === "string" ? location : undefined,
        country: country && country !== "all" ? country : undefined,
        city: city && city !== "all" ? city : undefined,
        verified: verified === "true",
        minValue: typeof minValue === "string" && !isNaN(parseFloat(minValue)) ? parseFloat(minValue) : undefined,
        maxValue: typeof maxValue === "string" && !isNaN(parseFloat(maxValue)) ? parseFloat(maxValue) : undefined,
        limit: seedParam ? limit * 3 : limit, // overfetch for shuffle
        offset,
        excludeUserId: req.session?.userId || undefined,
      });

      const userId = req.session?.userId;
      const listingIds = listings.map((l) => l.id);
      const [likedIds, commentCounts] = await Promise.all([
        userId ? storage.getUserLikedListingIds(userId) : Promise.resolve(new Set<string>()),
        storage.getListingCommentCounts(listingIds),
      ]);

      const enriched = listings.map((l) => ({
        ...l,
        isLiked: likedIds.has(l.id),
        commentCount: commentCounts.get(l.id) || 0,
      }));

      // Seeded shuffle for feed variety (only when no specific filters active)
      if (seedParam && !search && !type && !category) {
        const featured = enriched.filter((l) => l.isFeatured);
        const rest = enriched.filter((l) => !l.isFeatured);
        let t = (seedParam | 0) + 0x6D2B79F5;
        const rand = () => {
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
        };
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        return res.json([...featured, ...rest].slice(0, limit));
      }

      res.json(enriched);
    } catch (error) {
      console.error("Get listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/listings/user/:userId", requireAuth, async (req, res) => {
    try {
      const listings = await storage.getListingsByUser(param(req.params.userId));
      res.json(listings);
    } catch (error) {
      console.error("Get user listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/listings/featured", async (req, res) => {
    try {
      const featured = await storage.getFeaturedListings();
      const userId = req.session?.userId;
      const likedIds = userId ? await storage.getUserLikedListingIds(userId) : new Set<string>();
      const commentCounts = await storage.getListingCommentCounts();
      const enriched = featured.map(l => ({
        ...l,
        isLiked: likedIds.has(l.id),
        commentCount: commentCounts.get(l.id) || 0,
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Get featured listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/listings/collabs — brand-collab listings using direct pool query
  app.get("/api/listings/collabs", async (req, res) => {
    const client = await pool.connect();
    try {
      // Ensure the column exists (idempotent — IF NOT EXISTS)
      await client.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_collab boolean DEFAULT false`);
      await client.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS collab_details jsonb`);

      // Force all known collab listing titles to have is_collab=true
      const COLLAB_TITLES = [
        'Luxury Hotel Stay — Dubai Marina (2 nights)',
        '12-Month TechFlow Pro SaaS License (AED 2,400 value)',
        'Luxury Abaya + Styling Session — Maison Fatima',
        'Corporate Event Photography Package — AED 3,500 value',
        'Premium Fitness Membership — 3 Months (Dubai)',
        'Fine Dining Experience for Two — AED 800 F&B Credit',
        'Smart Home Tech Bundle — AED 1,500 worth of devices',
      ];
      await client.query(
        `UPDATE listings SET is_collab = true, is_active = true, moderation_status = 'APPROVED' WHERE title = ANY($1)`,
        [COLLAB_TITLES]
      );

      // Query all collab listings
      const result = await client.query(`
        SELECT l.*, u.id AS u_id, u.full_name AS u_full_name, u.avatar_url AS u_avatar_url,
          u.is_verified AS u_is_verified, u.business_name AS u_business_name,
          u.kyc_status AS u_kyc_status, u.kyb_status AS u_kyb_status,
          u.account_type AS u_account_type, u.credibility_score AS u_credibility_score,
          u.total_completed_deals AS u_total_completed_deals, u.founder_badge AS u_founder_badge
        FROM listings l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.is_collab = true AND l.is_active = true
        ORDER BY l.created_at DESC
        LIMIT 40
      `);

      const rows = result.rows;

      const userId = req.session?.userId;
      const likedIds = userId ? await storage.getUserLikedListingIds(userId) : new Set<string>();

      res.json(rows.map((r: any) => ({
        id: r.id, title: r.title, description: r.description,
        retailValue: r.retail_value, location: r.location, city: r.city, country: r.country,
        images: r.images || [], categories: r.categories || [], tags: r.tags || [],
        isCollab: r.is_collab, collabDetails: r.collab_details,
        isActive: r.is_active, likeCount: r.like_count || 0, viewCount: r.view_count || 0,
        createdAt: r.created_at, userId: r.user_id,
        isLiked: likedIds.has(r.id), commentCount: 0,
        user: r.u_id ? { id: r.u_id, fullName: r.u_full_name, avatarUrl: r.u_avatar_url,
          isVerified: r.u_is_verified, businessName: r.u_business_name,
          kycStatus: r.u_kyc_status, kybStatus: r.u_kyb_status, accountType: r.u_account_type,
          credibilityScore: r.u_credibility_score, totalCompletedDeals: r.u_total_completed_deals,
          founderBadge: r.u_founder_badge } : null,
      })));
    } catch (error: any) {
      console.error("[collabs] error:", error?.message || error);
      res.status(500).json({ message: "Internal server error", detail: error?.message });
    } finally {
      client.release();
    }
  });

  app.get("/api/listings/:id", async (req, res) => {
    try {
      const listing = await storage.getListingWithUser(param(req.params.id));
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      await storage.incrementListingViews(param(req.params.id));

      const userId = req.session?.userId;
      const isLiked = userId ? await storage.isListingLiked(listing.id, userId) : false;
      const commentCount = await storage.getListingCommentCount(listing.id);

      res.json({ ...listing, isLiked, commentCount });
    } catch (error) {
      console.error("Get listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/listings", requireAuth, async (req, res) => {
    try {
      const listingUser = await storage.getUser(req.session.userId!);
      if (!listingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Pause gate
      if (listingUser.isPaused) {
        return res.status(403).json({ message: "Your account has been paused. Please contact support.", isPaused: true });
      }

      const maxListingsStr = await storage.getAppSetting("max_listings_per_user");
      const maxListings = maxListingsStr ? parseInt(maxListingsStr, 10) : 0;
      if (maxListings > 0) {
        const activeCount = await storage.countUserActiveListings(req.session.userId!);
        if (activeCount >= maxListings) {
          return res.status(403).json({
            message: `You have reached the maximum of ${maxListings} active listings. Please remove or complete existing listings first.`,
          });
        }
      }

      const activeEmiratesStr = await storage.getAppSetting("active_emirates");
      if (activeEmiratesStr) {
        try {
          const activeEmirates = JSON.parse(activeEmiratesStr) as string[];
          if (Array.isArray(activeEmirates)) {
            if (activeEmirates.length === 0) {
              return res.status(403).json({
                message: "Listing creation is currently disabled — no active emirates configured.",
              });
            }
            const listingCity = (req.body.location || listingUser.city || "").trim();
            if (listingCity && !activeEmirates.some(e => e.toLowerCase() === listingCity.toLowerCase())) {
              return res.status(403).json({
                message: `Listings are currently only allowed in: ${activeEmirates.join(", ")}. Your location "${listingCity}" is not active.`,
              });
            }
          }
        } catch {}
      }

      // Phone verification gate — must verify WhatsApp number before listing
      if (!listingUser.phoneVerified) {
        return res.status(403).json({ message: "Phone verification required to create a listing.", phoneVerificationRequired: true });
      }

      // Business license gate
      if (listingUser.accountType === "business" && listingUser.kybStatus !== "APPROVED") {
        return res.status(403).json({
          message: "Business accounts must have a verified trade license before creating listings.",
          requiresTradeLicense: true
        });
      }

      // DIDIT CODE ARCHIVED
      // See _archived/didit/routes-verification-gates.ts
      // Re-integrate when ENABLE_DIDIT needed

      const { isValueFlagged } = await import("./marketValues");
      const rawCategories = req.body.categories || [];
      const retailVal = parseFloat(req.body.retailValue) || 0;
      const hvtSetting = await storage.getAppSetting("high_value_threshold");
      const highValueThreshold = hvtSetting ? parseFloat(hvtSetting) : 50000;
      const valueFlagged = isValueFlagged(retailVal, rawCategories) || (retailVal >= highValueThreshold);

      // Map the optional AI valuation payload from the client into the
      // listing columns. Server clamps the range to sane bounds so a
      // bad AI response can't poison the marketplace with AED-50M
      // toothbrushes. Currency defaults to AED. Timestamp is server-set.
      type ClientValuation = {
        minAed?: number; maxAed?: number; fairAed?: number;
        confidence?: number; reasoning?: string; marketNote?: string;
      };
      const v: ClientValuation | undefined = req.body.valuation;
      const valuationFields: Record<string, unknown> = {};
      if (v && Number.isFinite(v.minAed) && Number.isFinite(v.maxAed)) {
        const MAX_AED = 100_000_000; // 100M AED ceiling; anything above is hallucination
        const clamp = (n: number) => Math.max(0, Math.min(MAX_AED, Math.round(n)));
        const minA = clamp(v.minAed!);
        const maxA = Math.max(minA, clamp(v.maxAed!));
        const fairA = Number.isFinite(v.fairAed)
          ? Math.max(minA, Math.min(maxA, clamp(v.fairAed!)))
          : Math.round((minA + maxA) / 2);
        const conf = Number.isFinite(v.confidence)
          ? Math.max(0, Math.min(1, v.confidence!))
          : null;
        valuationFields.valuationMinAed = minA;
        valuationFields.valuationMaxAed = maxA;
        valuationFields.valuationFairAed = fairA;
        valuationFields.valuationConfidence = conf !== null ? conf.toFixed(2) : null;
        valuationFields.valuationReasoning = typeof v.reasoning === "string" ? v.reasoning.slice(0, 1000) : null;
        valuationFields.valuationMarketNote = typeof v.marketNote === "string" ? v.marketNote.slice(0, 500) : null;
        valuationFields.valuationCurrency = "AED";
        valuationFields.valuationAt = new Date();
      }

      // The client-side `valuation` key is consumed above; strip it so
      // insertListingSchema (built from the table schema) doesn't error.
      const { valuation: _v, ...listingBody } = req.body;

      const data = insertListingSchema.parse({
        ...listingBody,
        ...valuationFields,
        userId: req.session.userId,
        valueFlagged,
      });
      const listing = await storage.createListing(data);
      res.json(listing);

      // Send listing created congratulations email
      storage.getUser(req.session.userId!).then((listingOwner) => {
        if (listingOwner?.email) {
          import("./emailService").then(({ sendListingPublishedEmail }) => {
            sendListingPublishedEmail(listingOwner.email!, {
              recipientName: listingOwner.fullName ?? undefined,
              listingTitle: listing.title,
              listingId: listing.id,
              baseUrl: process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || "https://bareter.com",
            }).catch(() => {});
          }).catch(() => {});
        }
      }).catch(() => {});

      import("./agents/moderationAgent").then(({ moderateAndLog }) => {
        moderateAndLog("listing", listing.id, {
          title: listing.title,
          description: listing.description,
          value: parseFloat(listing.retailValue as string),
          categories: listing.categories as string[],
        }, req.session.userId).catch(() => {});
      }).catch(() => {});

      const imageUrls: string[] = data.images || [];
      if (imageUrls.length > 0) {
        import("./visionClient").then(({ scanListingImages }) => {
          scanListingImages(imageUrls, listing.id).then((flagged) => {
            if (flagged) {
              storage.updateListing(listing.id, { imageFlagged: true }).catch(() => {});
            }
          }).catch(() => {});
        }).catch(() => {});
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/listings/:id", requireAuth, async (req, res) => {
    try {
      const listing = await storage.getListing(param(req.params.id));
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      if (listing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      // Allowlist: only permit fields a listing owner is allowed to edit.
      // Prevents mass-assignment of privileged flags (isAdmin, isFeatured,
      // isActive, userId, imageFlagged, etc.) via a crafted PATCH body.
      const LISTING_OWNER_FIELDS = new Set([
        "title", "description", "category", "subcategory", "condition",
        "retailValue", "lookingFor", "location", "images", "tags",
        "isNegotiable", "tradeRadius", "shippingAvailable",
      ]);
      const sanitized = Object.fromEntries(
        Object.entries(req.body).filter(([k]) => LISTING_OWNER_FIELDS.has(k)),
      );
      const updated = await storage.updateListing(param(req.params.id), sanitized);
      res.json(updated);
    } catch (error) {
      console.error("Update listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Toggle listing active status (pause / activate) — owner only
  app.patch("/api/listings/:id/status", requireAuth, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const listing = await storage.getListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") return res.status(400).json({ message: "isActive must be a boolean" });
      const updated = await storage.updateListing(listingId, { isActive });
      res.json(updated);
    } catch (error) {
      console.error("Toggle listing status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete own listing with full cascade cleanup
  app.delete("/api/listings/:id", requireAuth, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const listing = await storage.getListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });

      // Soft-delete: stamp deletedAt + set isActive = false.
      // deletedAt = timestamp → excluded from all feed/browse queries AND dashboard.
      // isActive = false → excluded from recommendation/feed queries that don't check deletedAt.
      // Paused listings (isActive=false, deletedAt=null) still show in dashboard for reactivation.
      await db.update(listings).set({ isActive: false, deletedAt: new Date() }).where(eq(listings.id, listingId));
      res.json({ message: "Listing deleted" });
    } catch (error) {
      console.error("Delete listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Listing Likes
  app.post("/api/listings/:id/like", requireAuth, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const userId = req.session.userId!;
      const listing = await storage.getListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });

      const alreadyLiked = await storage.isListingLiked(listingId, userId);
      if (alreadyLiked) {
        await storage.unlikeListingItem(listingId, userId);
        const count = await storage.getListingLikeCount(listingId);
        return res.json({ liked: false, likeCount: count });
      }
      await storage.likeListingItem(listingId, userId);
      const count = await storage.getListingLikeCount(listingId);
      storage.recordEngagementEvent({
        userId,
        eventType: "saved",
        listingId,
      }).catch((err) => console.warn("[engagement] saved track failed:", err));
      res.json({ liked: true, likeCount: count });
    } catch (error) {
      console.error("Listing like error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // All incoming proposals on the current user's listings (all statuses)
  app.get("/api/listings/my-pending-proposals", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const userListings = await storage.getListingsByUser(userId);
      if (!userListings.length) return res.json([]);

      const allProposals = await Promise.all(
        userListings.map(async (listing) => {
          const comments = await storage.getListingComments(listing.id);
          return comments.map((c) => ({ ...c, listing }));
        })
      );
      const flat = allProposals.flat();

      // Attach proposer user info
      const withProposers = await Promise.all(
        flat.map(async (p) => {
          const proposer = await storage.getUser(p.userId);
          return { ...p, proposer };
        })
      );

      // Sort: pending first, then by date desc
      withProposers.sort((a, b) => {
        const order = (s: string | null) => (!s || s === "pending" ? 0 : s === "accepted" ? 1 : 2);
        if (order(a.status) !== order(b.status)) return order(a.status) - order(b.status);
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      res.json(withProposers);
    } catch (error) {
      console.error("Get incoming proposals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // All outgoing proposals the current user has submitted on other listings
  app.get("/api/listings/my-outgoing-proposals", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rows = await db
        .select()
        .from(listingComments)
        .leftJoin(listings, eq(listingComments.listingId, listings.id))
        .leftJoin(users, eq(listings.userId, users.id))
        .where(eq(listingComments.userId, userId))
        .orderBy(desc(listingComments.createdAt));

      const result = rows.map((r) => ({
        ...r.listing_comments,
        listing: r.listings ? { ...r.listings, user: r.users } : null,
      }));

      res.json(result);
    } catch (error) {
      console.error("Get outgoing proposals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Listing Comments (proposals)
  app.get("/api/listings/:id/comments", async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const sessionUserId = req.session?.userId as string | undefined;

      // Determine who owns this listing so we can gate visibility
      const listing = await storage.getListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });

      const isOwner = !!sessionUserId && listing.userId === sessionUserId;

      let comments = await storage.getListingComments(listingId);

      // Privacy gate: owners see all proposals; proposers see only their own;
      // third-party users (neither owner nor proposer) see nothing.
      if (!isOwner) {
        if (sessionUserId) {
          comments = comments.filter((c) => c.userId === sessionUserId);
        } else {
          comments = [];
        }
      }

      // Attach dealId to accepted proposals so the UI can link directly to the deal
      const enriched = await Promise.all(
        comments.map(async (c) => {
          if (c.status !== "accepted") return c;
          const [dealRow] = await db
            .select({ id: deals.id })
            .from(deals)
            .where(
              and(
                eq(deals.seekerId, c.userId),
                eq(deals.providerListingId, listingId)
              )
            )
            .limit(1);
          return { ...c, dealId: dealRow?.id ?? null };
        })
      );

      res.json(enriched);
    } catch (error) {
      console.error("Get listing comments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/listings/:id/comments", requireAuth, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const userId = req.session.userId!;
      const listing = await storage.getListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });

      const schema = z.object({
        offerItemName: z.string().min(1, "Offer item name is required"),
        offerItemValue: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Value must be a positive number"),
        offerDescription: z.string().nullable().optional(),
        images: z.array(z.string().min(1)).min(2, "At least 2 images of your offer are required"),
        content: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);
      const comment = await storage.createListingComment(listingId, userId, parsed.content || null, parsed.offerItemName, parsed.offerItemValue, parsed.offerDescription || null, parsed.images);
      res.json(comment);

      // In-app notification + email to listing owner — best-effort
      Promise.all([
        storage.getUser(userId),
        storage.getUser(listing.userId),
      ]).then(async ([proposer, owner]) => {
        const proposerName = proposer?.fullName || "Someone";
        // In-app bell notification for the listing owner
        await storage.createNotification({
          userId: listing.userId,
          type: "new_proposal",
          title: `New barter proposal from ${proposerName}`,
          message: `${proposerName} offered "${parsed.offerItemName}" (AED ${Number(parsed.offerItemValue).toLocaleString()}) for your listing "${listing.title}". Tap to review and respond.`,
          relatedListingId: listingId,
        } as any);
        // Email
        if (!owner?.email) return;
        const baseUrl = process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3001}`;
        const { sendNewProposalEmail } = await import("./emailService");
        sendNewProposalEmail(owner.email, {
          ownerName: owner.fullName,
          proposerName,
          listingTitle: listing.title,
          offerItemName: parsed.offerItemName,
          offerItemValue: parsed.offerItemValue,
          listingUrl: `${baseUrl}/listings/${listingId}`,
        }).catch(() => {});
        // Push notification
        sendPushToUser(listing.userId, {
          title: "New barter proposal!",
          body: `${proposerName} wants to barter on "${listing.title}"`,
          url: `/listings/${listingId}`,
        }).catch(() => {});
      }).catch(() => {});

      // Async AI valuation on proposal images — best-effort, does not block response
      if (parsed.images && parsed.images.length > 0) {
        const proposalTitle = parsed.offerItemName;
        const proposalDesc = parsed.offerDescription || "";
        const absImages = parsed.images.map((u: string) =>
          u.startsWith("http") ? u : `${process.env.PUBLIC_APP_URL || "http://localhost:5000"}${u}`
        );
        import("./agents/valuationAgent").then(async ({ getValuation }) => {
          try {
            const val = await getValuation(proposalTitle, proposalDesc, undefined, undefined, userId, undefined, absImages);
            if (val.fairValue > 0) {
              await storage.updateListingCommentValuation(comment.id, {
                min: val.estimatedRange.min,
                max: val.estimatedRange.max,
                fair: val.fairValue,
                confidence: val.confidence,
              });
            }
          } catch { /* valuation is best-effort */ }
        }).catch(() => {});
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create listing comment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Accept or reject a barter proposal on a listing (owner only)
  app.patch("/api/listings/:id/proposals/:proposalId", requireAuth, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const proposalId = param(req.params.proposalId);
      const userId = req.session.userId!;

      const listing = await storage.getListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.userId !== userId) return res.status(403).json({ message: "Only the listing owner can respond to proposals" });

      const schema = z.object({ status: z.enum(["accepted", "rejected"]) });
      const { status } = schema.parse(req.body);

      const updated = await storage.updateListingCommentStatus(proposalId, status);

      // Notify proposer on rejection
      if (status === "rejected") {
        await storage.createNotification({
          userId: updated.userId,
          type: "proposal_rejected",
          title: "Proposal declined",
          message: `Your barter proposal on "${listing.title}" was declined. Consider turning your offer into a listing!`,
          relatedListingId: listingId,
        });
      }

      // When accepted: create a deal (or reactivate an existing one) + send emails to both parties
      if (status === "accepted") {
        const [owner, proposer] = await Promise.all([
          storage.getUser(userId),
          storage.getUser(updated.userId),
        ]);

        // Check for an existing deal for this proposal to avoid duplicates on re-accept
        const existingDeals = await storage.getDealsByUser(userId);
        const existingDeal = existingDeals.find(
          (d) => d.seekerId === updated.userId && d.providerListingId === listingId
        );

        let deal: Awaited<ReturnType<typeof storage.createDeal>>;
        if (existingDeal) {
          deal = await storage.updateDeal(existingDeal.id, { state: "accepted", acceptedAt: new Date() }) as any;
          deal = { ...existingDeal, ...deal };
        } else {
          deal = await storage.createDeal({
            seekerId: updated.userId,              // the proposer
            providerId: userId,                    // the listing owner
            providerListingId: listingId,
            seekerOffer: updated.offerItemName,
            seekerValue: updated.offerItemValue,
            providerOffer: listing.title,
            providerValue: String(listing.retailValue || "0"),
            state: "accepted",
          });
          // Set timestamps on the created deal
          await storage.updateDeal(deal.id, { acceptedAt: new Date(), proposedAt: new Date() });
        }

        const baseUrl = process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3001}`;
        const { sendDealStatusEmail } = await import("./emailService");

        // Email the proposer: their offer was accepted → take them to the deal inbox
        if (proposer?.email) {
          sendDealStatusEmail(proposer.email, {
            recipientName: proposer.fullName,
            counterpartyName: owner?.fullName || "the listing owner",
            status: "accepted",
            dealId: deal.id,
            baseUrl,
          }).catch(() => {});
        }

        // Email the owner: deal is live, go chat in the deal inbox
        if (owner?.email) {
          sendDealStatusEmail(owner.email, {
            recipientName: owner.fullName,
            counterpartyName: proposer?.fullName || "the proposer",
            status: "accepted",
            dealId: deal.id,
            baseUrl,
          }).catch(() => {});
        }

        // In-app notification for proposer
        await storage.createNotification({
          userId: updated.userId,
          type: "proposal_accepted",
          title: "Proposal accepted!",
          message: `Your barter proposal on "${listing.title}" was accepted. Deal is now active!`,
          relatedListingId: listingId,
          relatedDealId: deal.id,
        });

        return res.json({ ...updated, dealId: deal.id });
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Update proposal status error:", msg);
      res.status(500).json({ message: msg });
    }
  });

  // ── Counter-offer: listing owner proposes modified terms ──────────────────
  app.post("/api/listings/:id/proposals/:proposalId/counter", requireAuth, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const proposalId = param(req.params.proposalId);
      const userId = req.session.userId!;
      const listing = await storage.getListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.userId !== userId) return res.status(403).json({ message: "Only the listing owner can counter-offer" });
      const schema = z.object({
        name: z.string().min(1, "Offer name required"),
        value: z.string().min(1, "Offer value required"),
        description: z.string().optional(),
        images: z.array(z.string().min(1)).default([]),
      });
      const body = schema.parse(req.body);
      const updated = await storage.submitCounterOffer(proposalId, body);
      const proposal = await storage.getListingComment(proposalId);
      if (proposal) {
        const proposer = await storage.getUser(proposal.userId);
        // In-app notification
        await storage.createNotification({
          userId: proposal.userId,
          type: "counter_offer",
          title: "Counter-offer received",
          message: `${listing.title} owner sent a counter-offer: ${body.name} (AED ${body.value})`,
          relatedListingId: listingId,
        });
        // Email notification — non-blocking, doesn't hold up the response
        if (proposer?.email && proposer.emailNotifications) {
          void (async () => {
            try {
              const { sendCounterOfferEmail } = await import("./emailService");
              const baseUrl = process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3001}`;
              const owner = await storage.getUser(userId);
              sendCounterOfferEmail(proposer.email, {
                recipientName: proposer.fullName,
                counterpartyName: owner?.fullName || "Listing owner",
                listingTitle: listing.title,
                counterName: body.name,
                counterValue: body.value,
                listingUrl: `${baseUrl}/listings/${listingId}`,
                direction: "received",
              }).catch(() => {});
              sendPushToUser(proposal.userId, {
                title: "Counter-offer received",
                body: `${owner?.fullName || "Listing owner"} sent a counter-offer on "${listing.title}"`,
                url: `/listings/${listingId}`,
              }).catch(() => {});
            } catch {}
          })();
        }
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      res.status(500).json({ message: "Failed to submit counter-offer" });
    }
  });

  // ── Counter-offer response: proposer accepts or rejects the counter ────────
  app.post("/api/listings/:id/proposals/:proposalId/counter-respond", requireAuth, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const proposalId = param(req.params.proposalId);
      const userId = req.session.userId!;
      const proposal = await storage.getListingComment(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.userId !== userId) return res.status(403).json({ message: "Only the proposer can respond to a counter-offer" });
      const schema = z.object({ response: z.enum(["accepted", "rejected"]) });
      const { response } = schema.parse(req.body);
      const updated = await storage.respondToCounterOffer(proposalId, response);
      const listing = await storage.getListing(listingId);
      // Notify the listing owner of the response
      if (listing) {
        const proposer = await storage.getUser(userId);
        const owner = await storage.getUser(listing.userId);
        await storage.createNotification({
          userId: listing.userId,
          type: "counter_offer_response",
          title: response === "accepted" ? "Counter-offer accepted!" : "Counter-offer declined",
          message: response === "accepted"
            ? `${proposer?.fullName || "Proposer"} accepted your counter-offer on "${listing.title}"`
            : `${proposer?.fullName || "Proposer"} declined your counter-offer on "${listing.title}"`,
          relatedListingId: listingId,
        });
        // Email the owner about the response — non-blocking
        if (owner?.email && owner.emailNotifications) {
          void (async () => {
            try {
              const { sendCounterOfferEmail } = await import("./emailService");
              const baseUrl = process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3001}`;
              sendCounterOfferEmail(owner.email, {
                recipientName: owner.fullName,
                counterpartyName: proposer?.fullName || "Proposer",
                listingTitle: listing.title,
                counterName: proposal.counterOfferName || "",
                counterValue: proposal.counterOfferValue || "0",
                listingUrl: `${baseUrl}/listings/${listingId}`,
                direction: "responded",
                response,
              }).catch(() => {});
              sendPushToUser(listing.userId, {
                title: response === "accepted" ? "Counter-offer accepted!" : "Counter-offer declined",
                body: `${proposer?.fullName || "Proposer"} ${response === "accepted" ? "accepted" : "declined"} your counter-offer on "${listing.title}"`,
                url: `/listings/${listingId}`,
              }).catch(() => {});
            } catch {}
          })();
        }
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      res.status(500).json({ message: "Failed to respond to counter-offer" });
    }
  });

  // ── Reviews ───────────────────────────────────────────────────────────────
  app.post("/api/proposals/:proposalId/review", requireAuth, async (req, res) => {
    try {
      const proposalId = param(req.params.proposalId);
      const reviewerId = req.session.userId!;
      const proposal = await storage.getListingComment(proposalId);
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.status !== "accepted") return res.status(400).json({ message: "Can only review accepted proposals" });
      // Reviewer must be proposer OR listing owner
      const listing = await storage.getListing(proposal.listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      const isProposer = proposal.userId === reviewerId;
      const isOwner = listing.userId === reviewerId;
      if (!isProposer && !isOwner) return res.status(403).json({ message: "Not a party to this deal" });
      const revieweeId = isProposer ? listing.userId : proposal.userId;
      // Prevent duplicate reviews
      if (await storage.hasReviewedProposal(reviewerId, proposalId)) {
        return res.status(409).json({ message: "You have already reviewed this deal" });
      }
      const schema = z.object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(1000).optional(),
        tags: z.array(z.string()).default([]),
      });
      const body = schema.parse(req.body);
      const review = await storage.createReview({
        reviewerId,
        revieweeId,
        listingCommentId: proposalId,
        listingId: proposal.listingId,
        ...body,
      });
      // Notify reviewee
      const reviewer = await storage.getUser(reviewerId);
      await storage.createNotification({
        userId: revieweeId,
        type: "new_review",
        title: "You received a review",
        message: `${reviewer?.fullName || "Someone"} left you a ${body.rating}-star review`,
        relatedListingId: proposal.listingId,
      });
      res.status(201).json(review);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      res.status(500).json({ message: "Failed to submit review" });
    }
  });

  app.post("/api/deals/:dealId/review", requireAuth, async (req, res) => {
    try {
      const dealId = param(req.params.dealId);
      const reviewerId = req.session.userId!;
      const deal = await storage.getDeal(dealId);
      if (!deal) return res.status(404).json({ message: "Deal not found" });
      if (deal.state !== "completed") return res.status(400).json({ message: "Can only review completed deals" });
      if (deal.seekerId !== reviewerId && deal.providerId !== reviewerId) {
        return res.status(403).json({ message: "Not a party to this deal" });
      }
      if (await storage.hasReviewedDeal(reviewerId, dealId)) {
        return res.status(409).json({ message: "You have already reviewed this deal" });
      }
      const revieweeId = deal.seekerId === reviewerId ? deal.providerId : deal.seekerId;
      const schema = z.object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(1000).optional(),
        tags: z.array(z.string()).default([]),
      });
      const body = schema.parse(req.body);
      const review = await storage.createReview({ reviewerId, revieweeId, dealId, ...body });
      const reviewer = await storage.getUser(reviewerId);
      await storage.createNotification({
        userId: revieweeId,
        type: "new_review",
        title: "You received a review",
        message: `${reviewer?.fullName || "Someone"} left you a ${body.rating}-star review`,
      });
      res.status(201).json(review);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      res.status(500).json({ message: "Failed to submit review" });
    }
  });

  app.get("/api/users/:userId/reviews", async (req, res) => {
    try {
      const userId = param(req.params.userId);
      const [reviews, stats] = await Promise.all([
        storage.getReviewsForUser(userId),
        storage.getUserAverageRating(userId),
      ]);
      res.json({ reviews, avgRating: stats.avg, reviewCount: stats.count });
    } catch {
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // ── Similar listings ──────────────────────────────────────────────────────
  app.get("/api/listings/:id/similar", async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const limit = Math.min(Number(req.query.limit) || 6, 12);
      const similar = await storage.getSimilarListings(listingId, limit);
      res.json(similar);
    } catch {
      res.status(500).json({ message: "Failed to fetch similar listings" });
    }
  });

  // ── Trending listings (by proposal activity last 7d) ─────────────────────
  app.get("/api/listings/trending", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 10, 20);
      const trending = await storage.getTrendingListings(limit);
      res.json(trending);
    } catch {
      res.status(500).json({ message: "Failed to fetch trending listings" });
    }
  });

  // Dashboard routes
  app.get("/api/dashboard/analytics", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const timeRange = parseInt(req.query.timeRange as string) || 30;
      
      // Get user's listings
      const userListings = await storage.getListingsByUser(userId);
      const activeListings = userListings.filter(l => l.isActive);
      const totalViews = userListings.reduce((sum, l) => sum + (l.viewCount || 0), 0);
      
      // Get user's deals
      const userDeals = await storage.getDealsByUser(userId);
      const completedDeals = userDeals.filter(d => d.state === "completed");
      const totalValue = completedDeals.reduce((sum, d) => {
        const isSeeker = d.seekerId === userId;
        return sum + Number(isSeeker ? d.seekerValue : d.providerValue);
      }, 0);
      
      // Get follower counts
      const followerCount = await storage.getFollowerCount(userId);
      const followingCount = await storage.getFollowingCount(userId);
      
      // Generate sample views over time data
      const viewsOverTime = [];
      for (let i = timeRange; i >= 0; i -= Math.ceil(timeRange / 10)) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        viewsOverTime.push({
          date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          views: Math.floor(Math.random() * 50) + 10,
        });
      }
      
      // Listings by category
      const categoryMap = new Map<string, number>();
      userListings.forEach(l => {
        (l.categories || []).forEach(cat => {
          categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        });
      });
      const listingsByCategory = Array.from(categoryMap.entries()).map(([category, count]) => ({
        category,
        count,
      }));
      
      res.json({
        totalListings: userListings.length,
        activeListings: activeListings.length,
        totalViews,
        totalDeals: userDeals.length,
        completedDeals: completedDeals.length,
        totalValue,
        followerCount,
        followingCount,
        viewsOverTime,
        dealsOverTime: [],
        listingsByCategory,
      });
    } catch (error) {
      console.error("Get analytics error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/deals", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const filter = req.query.filter as string || "completed";
      
      let deals = await storage.getDealsByUser(userId);
      
      if (filter === "completed") {
        deals = deals.filter(d => d.state === "completed");
      } else if (filter === "in_progress") {
        deals = deals.filter(d => d.state === "in_progress");
      }
      
      res.json(deals);
    } catch (error) {
      console.error("Get dashboard deals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Followers routes
  app.get("/api/users/:id/followers", requireAuth, async (req, res) => {
    try {
      const followers = await storage.getFollowers(param(req.params.id));
      res.json(followers);
    } catch (error) {
      console.error("Get followers error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/users/:id/following", requireAuth, async (req, res) => {
    try {
      const following = await storage.getFollowing(param(req.params.id));
      res.json(following);
    } catch (error) {
      console.error("Get following error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/users/:id/follow", requireAuth, async (req, res) => {
    try {
      const followingId = param(req.params.id);
      const followerId = req.session.userId!;
      
      if (followerId === followingId) {
        return res.status(400).json({ message: "Cannot follow yourself" });
      }
      
      const isAlreadyFollowing = await storage.isFollowing(followerId, followingId);
      if (isAlreadyFollowing) {
        return res.status(400).json({ message: "Already following this user" });
      }
      
      const follower = await storage.followUser(followerId, followingId);
      res.json(follower);
    } catch (error) {
      console.error("Follow user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/users/:id/follow", requireAuth, async (req, res) => {
    try {
      const followingId = param(req.params.id);
      const followerId = req.session.userId!;
      
      await storage.unfollowUser(followerId, followingId);
      res.json({ message: "Unfollowed successfully" });
    } catch (error) {
      console.error("Unfollow user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/users/:id/unfollow", requireAuth, async (req, res) => {
    try {
      // This removes a follower (someone following you)
      const followerId = param(req.params.id);
      const followingId = req.session.userId!;

      await storage.unfollowUser(followerId, followingId);
      res.json({ message: "Follower removed successfully" });
    } catch (error) {
      console.error("Remove follower error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/users/:id/is-following", requireAuth, async (req, res) => {
    try {
      const followingId = param(req.params.id);
      const followerId = req.session.userId!;
      const isFollowing = await storage.isFollowing(followerId, followingId);
      res.json({ isFollowing });
    } catch (error) {
      console.error("Is-following check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/users/:id/block", requireAuth, async (req, res) => {
    try {
      const blockedId = param(req.params.id);
      const blockerId = req.session.userId!;
      if (blockerId === blockedId) {
        return res.status(400).json({ message: "Cannot block yourself" });
      }
      await storage.blockUser(blockerId, blockedId);
      // Also unfollow in both directions
      await storage.unfollowUser(blockerId, blockedId).catch(() => {});
      await storage.unfollowUser(blockedId, blockerId).catch(() => {});
      res.json({ message: "User blocked" });
    } catch (error) {
      console.error("Block user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/users/:id/block", requireAuth, async (req, res) => {
    try {
      const blockedId = param(req.params.id);
      const blockerId = req.session.userId!;
      await storage.unblockUser(blockerId, blockedId);
      res.json({ message: "User unblocked" });
    } catch (error) {
      console.error("Unblock user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/users/:id/is-blocked", requireAuth, async (req, res) => {
    try {
      const blockedId = param(req.params.id);
      const blockerId = req.session.userId!;
      const isBlocked = await storage.isBlocked(blockerId, blockedId);
      res.json({ isBlocked });
    } catch (error) {
      console.error("Is-blocked check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Public list of recently completed deals for the landing-page success
  // stories marquee. Returns a small, sanitised shape (no IDs, no emails)
  // so it can be served unauthenticated. Always returns 200 with [] on
  // any error so the landing page never breaks.
  app.get("/api/deals/recent-completed", async (_req, res) => {
    try {
      const recent = await storage.getRecentCompletedDeals(10);

      // Initials only — never expose a real first or last name in full.
      // e.g. "Sarah Ahmed" -> "S. A."  /  "Mohammed" -> "M."
      const initialsOnly = (full: string) => {
        const parts = full
          .trim()
          .split(/\s+/)
          .filter((p) => p.length > 0)
          .slice(0, 2);
        if (parts.length === 0) return "Member";
        return parts.map((p) => `${p.charAt(0).toUpperCase()}.`).join(" ");
      };

      // Allowlist of cities we will surface. Anything else collapses to a
      // coarse "Worldwide" label so freeform location text (which can contain
      // street addresses or PII) is never rendered.
      const CITY_ALLOWLIST = new Set([
        "dubai", "abu dhabi", "sharjah", "ajman", "ras al khaimah",
        "fujairah", "umm al quwain", "al ain",
        "riyadh", "jeddah", "doha", "manama", "kuwait city", "muscat",
        "london", "new york", "san francisco", "los angeles", "paris",
        "berlin", "madrid", "amsterdam", "singapore", "hong kong", "tokyo",
        "mumbai", "delhi", "bangalore", "istanbul", "cairo", "casablanca",
        "toronto", "sydney", "melbourne",
      ]);
      const cleanCity = (u: { city?: string | null; location?: string | null }) => {
        const raw = (u.city || u.location || "").trim();
        if (!raw) return "Worldwide";
        // Take only the first comma-segment, strip non-letters at the edges.
        const first = raw.split(",")[0].trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
        if (!first) return "Worldwide";
        return CITY_ALLOWLIST.has(first.toLowerCase()) ? first : "Worldwide";
      };

      // Trim user-generated offer text and strip emails/phones defensively.
      const safeOffer = (raw: string | null | undefined) => {
        if (!raw) return "";
        const stripped = raw
          .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi, "")
          .replace(/\b\+?\d[\d\s().-]{6,}\b/g, "")
          .replace(/\s+/g, " ")
          .trim();
        return stripped.length > 70 ? `${stripped.slice(0, 67)}...` : stripped;
      };

      const stories = recent
        .filter((d) => d.provider && d.seeker && d.providerOffer && d.seekerOffer)
        .map((d) => ({
          name: initialsOnly(d.provider.fullName || "Member"),
          city: cleanCity(d.provider),
          swap: safeOffer(d.providerOffer),
          forItem: safeOffer(d.seekerOffer),
          value: Math.round(Number(d.providerValue) || 0),
        }))
        .filter((s) => s.swap && s.forItem && s.value > 0);

      res.json(stories);
    } catch (error) {
      console.error("Get recent completed deals error:", error);
      res.json([]);
    }
  });

  // Deals routes
  app.get("/api/deals", requireAuth, async (req, res) => {
    try {
      const deals = await storage.getDealsByUser(req.session.userId!);
      res.json(deals);
    } catch (error) {
      console.error("Get deals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/deals/:id", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDealWithUsers(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      res.json(deal);
    } catch (error) {
      console.error("Get deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Contract: get stored data ────────────────────────────────────────────────
  app.get("/api/deals/:id/contract", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDealWithUsers(param(req.params.id));
      if (!deal) return res.status(404).json({ message: "Deal not found" });
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const isSeeker = deal.seekerId === req.session.userId;
      res.json({
        contractContent: deal.contractContent || null,
        contractGeneratedAt: deal.contractGeneratedAt || null,
        seekerSigned: deal.seekerSignedAt ? { signedAt: deal.seekerSignedAt, initials: deal.seekerSignedInitials } : null,
        providerSigned: deal.providerSignedAt ? { signedAt: deal.providerSignedAt, initials: deal.providerSignedInitials } : null,
        currentUserRole: isSeeker ? "seeker" : "provider",
        dealRef: deal.dealNumber,
        seekerName: deal.seeker?.fullName || deal.seeker?.businessName || "Party A",
        providerName: deal.provider?.fullName || deal.provider?.businessName || "Party B",
        seekerEmail: deal.seeker?.email,
        providerEmail: deal.provider?.email,
        seekerCity: deal.seeker?.city,
        providerCity: deal.provider?.city,
        seekerOffer: deal.seekerOffer,
        providerOffer: deal.providerOffer,
        seekerValue: deal.seekerValue,
        providerValue: deal.providerValue,
      });
    } catch (error) {
      console.error("Get contract error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Contract: generate / regenerate (AI-powered, chat-aware) ─────────────────
  app.post("/api/deals/:id/contract/generate", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDealWithUsers(param(req.params.id));
      if (!deal) return res.status(404).json({ message: "Deal not found" });
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (deal.seekerSignedAt && deal.providerSignedAt) {
        return res.status(409).json({ message: "Contract is fully executed — both parties signed." });
      }

      const chatMessages = await storage.getMessagesByDeal(deal.id);
      // Sanitize content before inserting into the AI prompt to prevent prompt injection.
      // Strip any lines that look like system instructions, truncate at 200 messages.
      const sanitizeForPrompt = (text: string) =>
        text
          .replace(/\[INST\]|\[\/INST\]|<s>|<\/s>|###\s*(system|instruction|prompt)/gi, "")
          .replace(/ignore (all )?previous instructions?/gi, "[redacted]")
          .slice(0, 2000);
      const chatTranscript = chatMessages
        .slice(-200)
        .map((m) => `${m.sender?.fullName ?? "Unknown"}: ${sanitizeForPrompt(m.content)}`)
        .join("\n");

      const seekerName = deal.seeker?.fullName || deal.seeker?.businessName || "Party A";
      const providerName = deal.provider?.fullName || deal.provider?.businessName || "Party B";
      const deliverablesText = Array.isArray(deal.deliverables) && deal.deliverables.length
        ? deal.deliverables.map((d: any) => `- ${d.label}`).join("\n") : "Not specified";

      interface ContractTerms {
        summary: string;
        partyADeliverables: string[];
        partyBDeliverables: string[];
        agreedTimeline: string;
        specialConditions: string[];
        terms: string[];
      }

      let contractTerms: ContractTerms = {
        summary: `${seekerName} and ${providerName} agree to exchange their respective goods/services as described below.`,
        partyADeliverables: [deal.seekerOffer],
        partyBDeliverables: [deal.providerOffer],
        agreedTimeline: deal.timeline || "To be mutually agreed",
        specialConditions: [],
        terms: [
          "1. Both parties agree to exchange the goods/services described in this agreement in good faith.",
          "2. Each party warrants they have full right and authority to exchange the items offered.",
          "3. The exchange values stated are agreed estimates and do not constitute a cash payment.",
          "4. Delivery of exchanged items or services shall occur within the agreed timeline.",
          "5. Either party may raise a dispute via the Bareter platform within 7 days of the agreed delivery date.",
          "6. VAT (5%) may apply to certain barter transactions — each party is responsible for their own tax obligations.",
          "7. This agreement is governed by the laws of the United Arab Emirates.",
          "8. Any unresolved disputes shall be referred to arbitration in Dubai, UAE under UAE arbitration law.",
        ],
      };

      if (chatTranscript.trim().length > 50) {
        try {
          const { jsonCompletion } = await import("./agents/llm");
          const result = await jsonCompletion<ContractTerms>(
            [
              {
                role: "system",
                content: `You are a UAE commercial lawyer drafting a barter agreement. Analyse the deal and chat to extract what was ACTUALLY agreed. Return JSON with: summary (one legal paragraph), partyADeliverables (array of specifics for ${seekerName}), partyBDeliverables (array of specifics for ${providerName}), agreedTimeline (specific date/period or "As mutually agreed"), specialConditions (array of specific conditions from chat, or empty), terms (array of 8 numbered strings "1." through "8." — personalised to this exchange type). Be specific, extract real details. Valid JSON only.`,
              },
              {
                role: "user",
                content: `DEAL: ${deal.dealNumber}\nDATE: ${new Date().toLocaleDateString("en-AE")}\n\nPARTY A (${seekerName}): ${deal.seekerOffer} — AED ${Number(deal.seekerValue).toLocaleString()}\nPARTY B (${providerName}): ${deal.providerOffer} — AED ${Number(deal.providerValue).toLocaleString()}\nDELIVERABLES: ${deliverablesText}\nTIMELINE: ${deal.timeline || "Not specified"}\n\nCHAT:\n${chatTranscript || "(No messages)"}`,
              },
            ],
            { agentName: "legal", command: "generate_contract", model: "gemini-2.0-flash", maxTokens: 1800, temperature: 0.2, agentBudgetJsonFallback: contractTerms }
          );
          if (result.data) contractTerms = result.data;
        } catch { /* fall back to template */ }
      }

      await storage.updateDeal(deal.id, {
        contractContent: JSON.stringify(contractTerms),
        contractGeneratedAt: new Date(),
        seekerSignedAt: null as any,
        seekerSignedInitials: null as any,
        providerSignedAt: null as any,
        providerSignedInitials: null as any,
      });

      res.json({ success: true, contractContent: JSON.stringify(contractTerms), generatedAt: new Date() });
    } catch (error) {
      console.error("Generate contract error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Contract: sign with initials ──────────────────────────────────────────────
  app.post("/api/deals/:id/contract/sign", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDealWithUsers(param(req.params.id));
      if (!deal) return res.status(404).json({ message: "Deal not found" });
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      if (!deal.contractContent) {
        return res.status(400).json({ message: "Contract must be generated first." });
      }
      const { initials } = req.body as { initials: string };
      if (!initials || initials.trim().length < 1) {
        return res.status(400).json({ message: "Initials are required." });
      }
      const isSeeker = deal.seekerId === req.session.userId;
      if (isSeeker ? !!deal.seekerSignedAt : !!deal.providerSignedAt) {
        return res.status(409).json({ message: "You have already signed this contract." });
      }

      await storage.updateDeal(deal.id, isSeeker
        ? { seekerSignedAt: new Date(), seekerSignedInitials: initials.trim().toUpperCase().slice(0, 6) }
        : { providerSignedAt: new Date(), providerSignedInitials: initials.trim().toUpperCase().slice(0, 6) }
      );

      const updated = await storage.getDealWithUsers(deal.id);
      const bothSigned = !!(updated?.seekerSignedAt && updated?.providerSignedAt);

      if (bothSigned) {
        await Promise.all([
          storage.createNotification({ userId: deal.seekerId, type: "deal_update", title: "Contract fully executed", message: `Both parties signed the barter agreement for deal ${deal.dealNumber}.`, relatedDealId: deal.id }),
          storage.createNotification({ userId: deal.providerId, type: "deal_update", title: "Contract fully executed", message: `Both parties signed the barter agreement for deal ${deal.dealNumber}.`, relatedDealId: deal.id }),
        ]);
      } else {
        const otherUserId = isSeeker ? deal.providerId : deal.seekerId;
        const signerName = isSeeker ? (deal.seeker?.fullName || "Party A") : (deal.provider?.fullName || "Party B");
        await storage.createNotification({ userId: otherUserId, type: "deal_update", title: "Contract ready for your signature", message: `${signerName} signed deal ${deal.dealNumber}. It's your turn to sign.`, relatedDealId: deal.id });
      }

      res.json({ success: true, bothSigned });
    } catch (error) {
      console.error("Sign contract error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/deals", requireAuth, async (req, res) => {
    try {
      const { providerListingId, seekerOffer, seekerValue } = req.body;

      const seeker = await storage.getUser(req.session.userId!);
      if (!seeker) {
        return res.status(404).json({ message: "User not found" });
      }

      // DIDIT CODE ARCHIVED
      // See _archived/didit/routes-verification-gates.ts
      // Re-integrate when ENABLE_DIDIT needed

      const listing = await storage.getListing(providerListingId);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }

      if (listing.userId === req.session.userId) {
        return res.status(400).json({ message: "Cannot trade with yourself" });
      }

      const deal = await storage.createDeal({
        seekerId: req.session.userId!,
        providerId: listing.userId,
        providerListingId,
        seekerOffer,
        seekerValue,
        providerOffer: listing.title,
        providerValue: listing.retailValue,
        state: "proposed",
        deliverables: req.body.deliverables || null,
      });

      // Create notification for provider
      await storage.createNotification({
        userId: listing.userId,
        type: "deal_update",
        title: "New Trade Proposal",
        message: `You have received a new trade proposal for "${listing.title}"`,
        relatedDealId: deal.id,
      });

      res.json(deal);
    } catch (error) {
      console.error("Create deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Deal state transitions and allowed fields
  const allowedStateTransitions: Record<string, string[]> = {
    proposed: ["accepted", "cancelled"],
    accepted: ["in_progress", "cancelled"],
    in_progress: ["delivery_proof", "cancelled"],
    delivery_proof: ["completed", "cancelled"],
  };

  const updateDealSchema = z.object({
    state: z.enum(["proposed", "accepted", "in_progress", "delivery_proof", "completed", "cancelled"]).optional(),
    seekerCompleted: z.boolean().optional(),
    providerCompleted: z.boolean().optional(),
    seekerProofUrl: z.string().optional(),
    providerProofUrl: z.string().optional(),
    timeline: z.string().optional(),
    deliverables: z.array(z.object({ label: z.string(), checked: z.boolean() })).optional(),
  });

  app.patch("/api/deals/:id", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const data = updateDealSchema.parse(req.body);
      const isSeeker = deal.seekerId === req.session.userId;
      const isProvider = deal.providerId === req.session.userId;

      // Pause gate for accepting deals
      if (data.state === "accepted") {
        const acceptingUser = await storage.getUser(req.session.userId!);
        if (acceptingUser?.isPaused) {
          return res.status(403).json({ message: "Your account has been paused. Please contact support.", isPaused: true });
        }
        if (acceptingUser?.accountType === "business" && acceptingUser.kybStatus !== "APPROVED") {
          return res.status(403).json({ 
            message: "Business accounts must have a verified trade license before accepting deals.",
            requiresTradeLicense: true
          });
        }
      }

      // Validate state transitions
      if (data.state && data.state !== deal.state) {
        const allowed = allowedStateTransitions[deal.state];
        if (!allowed || !allowed.includes(data.state)) {
          return res.status(400).json({ message: `Cannot transition from ${deal.state} to ${data.state}` });
        }
        // Only provider can accept
        if (data.state === "accepted" && !isProvider) {
          return res.status(403).json({ message: "Only the provider can accept a deal" });
        }
      }

      // Only allow users to mark their own completion
      if (data.seekerCompleted !== undefined && !isSeeker) {
        return res.status(403).json({ message: "Only the seeker can mark seeker completion" });
      }
      if (data.providerCompleted !== undefined && !isProvider) {
        return res.status(403).json({ message: "Only the provider can mark provider completion" });
      }

      // Only allow uploading own proof
      if (data.seekerProofUrl !== undefined && !isSeeker) {
        return res.status(403).json({ message: "Only the seeker can upload seeker proof" });
      }
      if (data.providerProofUrl !== undefined && !isProvider) {
        return res.status(403).json({ message: "Only the provider can upload provider proof" });
      }

      const stateTimestamps: Record<string, unknown> = {};
      if (data.state === "proposed") stateTimestamps.proposedAt = new Date();
      if (data.state === "accepted") stateTimestamps.acceptedAt = new Date();
      if (data.state === "completed") stateTimestamps.completedAt = new Date();
      if (data.state === "cancelled") stateTimestamps.cancelledAt = new Date();

      let updated = await storage.updateDeal(param(req.params.id), { ...data, ...stateTimestamps });

      // Email on key deal state transitions
      if (data.state && data.state !== deal.state) {
        const appBaseUrl = process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || "https://bareter.com";
        try {
          const [seekerUser, providerUser] = await Promise.all([
            storage.getUser(deal.seekerId),
            storage.getUser(deal.providerId),
          ]);
          const { sendDealStatusEmail } = await import("./emailService");

          if (data.state === "accepted" && seekerUser?.email) {
            sendDealStatusEmail(seekerUser.email, {
              recipientName: seekerUser.fullName ?? undefined,
              counterpartyName: providerUser?.fullName || "the provider",
              status: "accepted",
              dealId: deal.id,
              baseUrl: appBaseUrl,
            }).catch(() => {});
          }

          if (data.state === "proposed" && providerUser?.email) {
            sendDealStatusEmail(providerUser.email, {
              recipientName: providerUser.fullName ?? undefined,
              counterpartyName: seekerUser?.fullName || "a member",
              status: "proposed",
              dealId: deal.id,
              baseUrl: appBaseUrl,
            }).catch(() => {});
          }

          if (data.state === "cancelled") {
            const cancellerName = isSeeker ? seekerUser?.fullName : providerUser?.fullName;
            const otherUser = isSeeker ? providerUser : seekerUser;
            if (otherUser?.email) {
              sendDealStatusEmail(otherUser.email, {
                recipientName: otherUser.fullName ?? undefined,
                counterpartyName: cancellerName || "the other party",
                status: "cancelled",
                dealId: deal.id,
                baseUrl: appBaseUrl,
              }).catch(() => {});
            }
          }
        } catch {}
      }

      // Check if both parties completed - auto-complete the deal
      if (updated && updated.seekerCompleted && updated.providerCompleted && updated.state === "delivery_proof") {
        updated = await storage.updateDeal(param(req.params.id), { state: "completed", completedAt: new Date() });

        // Notify both parties so they remember to leave a rating.
        try {
          const [seekerUser, providerUser] = await Promise.all([
            storage.getUser(deal.seekerId),
            storage.getUser(deal.providerId),
          ]);
          const seekerName = seekerUser?.fullName || "your trade partner";
          const providerName = providerUser?.fullName || "your trade partner";

          await Promise.all([
            storage.createNotification({
              userId: deal.seekerId,
              type: "deal_update",
              title: "Trade complete",
              message: `Your trade with ${providerName} is complete — leave a rating`,
              relatedDealId: deal.id,
            }),
            storage.createNotification({
              userId: deal.providerId,
              type: "deal_update",
              title: "Trade complete",
              message: `Your trade with ${seekerName} is complete — leave a rating`,
              relatedDealId: deal.id,
            }),
          ]);

          const { sendDealCompletedEmail } = await import("./emailService");
          const baseUrl =
            process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
            (process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
              ? `https://${process.env.REPLIT_DOMAINS!.split(",")[0]!.trim()}`
              : process.env.REPLIT_DEV_DOMAIN?.trim()
                ? `https://${process.env.REPLIT_DEV_DOMAIN!.trim()}`
                : "http://localhost:5000");

          const emailJobs: Promise<unknown>[] = [];
          if (seekerUser?.email) {
            emailJobs.push(
              sendDealCompletedEmail(seekerUser.email, {
                recipientName: seekerUser.fullName,
                counterpartyName: providerName,
                dealId: deal.id,
                baseUrl,
              }).catch((err) => console.error("[EMAIL] Deal completed email (seeker) failed:", err)),
            );
          }
          if (providerUser?.email) {
            emailJobs.push(
              sendDealCompletedEmail(providerUser.email, {
                recipientName: providerUser.fullName,
                counterpartyName: seekerName,
                dealId: deal.id,
                baseUrl,
              }).catch((err) => console.error("[EMAIL] Deal completed email (provider) failed:", err)),
            );
          }
          await Promise.all(emailJobs);
        } catch (notifyError) {
          console.error("Deal completion notification error:", notifyError);
        }
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Deal Dispute (user-facing) ────────────────────────────────────────────
  app.post("/api/deals/:id/dispute", requireAuth, async (req, res) => {
    try {
      const dealId = param(req.params.id);
      const userId = req.session.userId!;
      const deal = await storage.getDeal(dealId);
      if (!deal) return res.status(404).json({ message: "Deal not found" });
      if (deal.seekerId !== userId && deal.providerId !== userId) {
        return res.status(403).json({ message: "Not a party to this deal" });
      }
      if (deal.state === "completed" || deal.state === "cancelled") {
        return res.status(400).json({ message: "Cannot dispute a completed or cancelled deal" });
      }
      const schema = z.object({
        subject: z.string().min(5).max(200),
        description: z.string().min(10).max(2000),
      });
      const body = schema.parse(req.body);
      const partyBId = deal.seekerId === userId ? deal.providerId : deal.seekerId;
      const dispute = await storage.createDispute({
        dealId,
        partyAId: userId,
        partyBId,
        subject: body.subject,
        description: body.description,
        status: "open",
      });
      // Notify the other party
      const filer = await storage.getUser(userId);
      await storage.createNotification({
        userId: partyBId,
        type: "dispute_filed" as any,
        title: "A dispute has been raised",
        message: `${filer?.fullName || "Your barter partner"} raised a dispute on your deal. An admin will review shortly.`,
      });
      // Notify admin via email
      import("./emailService").then(({ sendAdminEmail }) => {
        const baseUrl = process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3001}`;
        sendAdminEmail(`Dispute filed on Deal #${deal.dealNumber}`,
          `<p><strong>${filer?.fullName}</strong> filed a dispute on deal <strong>#${deal.dealNumber}</strong>.</p>
           <p><strong>Subject:</strong> ${body.subject}</p>
           <p><strong>Description:</strong> ${body.description}</p>
           <p><a href="${baseUrl}/admin">Review in Admin Panel</a></p>`
        ).catch(() => {});
      }).catch(() => {});
      res.status(201).json(dispute);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      res.status(500).json({ message: "Failed to file dispute" });
    }
  });

  // Messages routes
  app.get("/api/deals/:id/messages", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const messages = await storage.getMessagesByDeal(param(req.params.id));
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const createMessageSchema = z.object({
    content: z.string().min(1, "Message cannot be empty").max(2000, "Message too long"),
  });

  app.post("/api/deals/:id/messages", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const data = createMessageSchema.parse(req.body);

      // Detect off-platform communication attempts (expanded keyword set)
      const OFF_PLATFORM_RE = /whatsapp|telegram|signal|wechat|viber|\+\d{5,}|text me\b|dm me\b|contact me (outside|off|directly)|my number is|outside the app|off.?platform|move (this|the convo|the conversation) (to|off)/i;
      const isOffPlatform = OFF_PLATFORM_RE.test(data.content);
      const warning = isOffPlatform ? "off_platform" : null;

      const message = await storage.createMessage({
        dealId: param(req.params.id),
        senderId: req.session.userId!,
        content: data.content,
        isOffPlatform,
        warning,
      });

      // Log off-platform warnings to moderation_logs for admin review
      if (warning) {
        try {
          const { moderationLogs: modLogsTable } = await import("@shared/schema");
          await db.insert(modLogsTable).values({
            targetType: "message",
            targetId: message.id,
            action: "flagged",
            reason: `Chat message flagged for off-platform contact attempt`,
            confidence: "0.95",
            rawResponse: { action: "flagged", reason: "off-platform contact attempt detected by regex", confidence: 0.95, categories: [warning] },
          });
        } catch (err) {
          console.error("Failed to log message moderation:", err);
        }
      }

      // Notify the other party
      const recipientId = deal.seekerId === req.session.userId ? deal.providerId : deal.seekerId;
      await storage.createNotification({
        userId: recipientId,
        type: "message",
        title: "New Message",
        message: "You have a new message in your trade deal",
        relatedDealId: deal.id,
      });

      res.json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create message error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Ratings routes
  app.get("/api/ratings/user/:userId", async (req, res) => {
    try {
      const ratings = await storage.getRatingsByUser(param(req.params.userId));
      res.json(ratings);
    } catch (error) {
      console.error("Get ratings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const createRatingSchema = z.object({
    dealId: z.string().min(1),
    toUserId: z.string().min(1),
    score: z.number().min(1).max(5),
    review: z.string().optional(),
  });

  app.post("/api/ratings", requireAuth, async (req, res) => {
    try {
      const data = createRatingSchema.parse(req.body);

      // Verify the deal exists and is completed
      const deal = await storage.getDeal(data.dealId);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.state !== "completed") {
        return res.status(400).json({ message: "Can only rate completed deals" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized to rate this deal" });
      }

      // Verify rating the other party
      const otherPartyId = deal.seekerId === req.session.userId ? deal.providerId : deal.seekerId;
      if (data.toUserId !== otherPartyId) {
        return res.status(400).json({ message: "Can only rate the other party in the deal" });
      }

      const rating = await storage.createRating({
        ...data,
        fromUserId: req.session.userId!,
      });
      res.json(rating);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create rating error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Notifications routes
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getNotificationsByUser(req.session.userId!);
      res.json(notifications);
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markNotificationAsRead(param(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead(req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/notifications/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await db
        .delete(notifications)
        .where(and(eq(notifications.id, param(req.params.id)), eq(notifications.userId, userId)));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete notification error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await db.delete(notifications).where(eq(notifications.userId, userId));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete all notifications error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // DIDIT CODE ARCHIVED
  // See _archived/didit/routes-verification-endpoints.ts
  // Re-integrate when ENABLE_DIDIT needed
  // (POST /api/verification/session, GET /api/verification/status,
  //  POST /api/webhooks/didit, POST /api/verification/refresh)

  // Sanity CMS webhook — flushes the in-memory content cache immediately on publish.
  // Sanity signs each request with HMAC-SHA256; the header format is:
  //   sanity-webhook-signature: t=<unix_ms>,v1=<hex_digest>
  // The signed payload is the string "<timestamp>.<raw_body>".
  // Set SANITY_WEBHOOK_SECRET to the secret configured in Sanity Studio → API → Webhooks.
  app.post("/api/webhooks/sanity", async (req, res) => {
    try {
      const secret = process.env.SANITY_WEBHOOK_SECRET;
      if (!secret) {
        console.warn("[sanity-webhook] SANITY_WEBHOOK_SECRET not set — rejecting request");
        return res.status(503).json({ message: "Webhook not configured" });
      }

      const signatureHeader = (req.headers["sanity-webhook-signature"] as string) ?? "";
      const rawBody = (req as { rawBody?: Buffer }).rawBody;

      if (!rawBody) {
        return res.status(400).json({ message: "Missing webhook payload" });
      }

      // Parse t=<timestamp>,v1=<digest>
      const parts = Object.fromEntries(
        signatureHeader.split(",").map((p) => p.split("=") as [string, string]),
      );
      const timestamp = parts["t"];
      const receivedDigest = parts["v1"];

      if (!timestamp || !receivedDigest) {
        return res.status(401).json({ message: "Invalid signature header" });
      }

      // Reject requests older than 5 minutes to prevent replay attacks.
      const tsMs = Number(timestamp);
      if (Number.isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
        console.warn("[sanity-webhook] Timestamp out of acceptable range — rejecting");
        return res.status(401).json({ message: "Request timestamp out of range" });
      }

      const { createHmac, timingSafeEqual } = await import("crypto");
      const message = `${timestamp}.${rawBody.toString()}`;
      const expectedDigest = createHmac("sha256", secret).update(message).digest("hex");

      let signaturesMatch = false;
      try {
        signaturesMatch = timingSafeEqual(
          Buffer.from(receivedDigest, "hex"),
          Buffer.from(expectedDigest, "hex"),
        );
      } catch {
        signaturesMatch = false;
      }

      if (!signaturesMatch) {
        console.warn("[sanity-webhook] Signature mismatch — rejecting");
        return res.status(401).json({ message: "Invalid signature" });
      }

      // Valid publish event — clear all Sanity cache keys so the next request
      // fetches fresh content from the Sanity API.
      const { clearSanityCache } = await import("./lib/sanity");
      clearSanityCache();
      console.log("[sanity-webhook] Cache cleared after publish event");

      return res.json({ received: true });
    } catch (err) {
      console.error("[sanity-webhook] Error:", err);
      return res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // Company OS — WhatsApp control plane.
  // Mount the router *after* the session middleware so requireAdmin can
  // read req.session, and use a dynamic import so the file boots cleanly
  // even when the optional Twilio/Stripe secrets are missing.
  const { createCompanyOsRouter } = await import("./companyOs/router");
  app.use("/api/company-os", createCompanyOsRouter({ requireAdmin }));

  // GET /api/sales/track/:token — re-engagement-email click tracker.
  // Public, unauthenticated, idempotent. The handler logic lives in
  // `salesAgent.handleSalesTrackingRequest` so it can be unit-tested in
  // isolation; this thin wrapper exists only so the route registration
  // stays alongside the rest of the app's routes.
  const { handleSalesTrackingRequest } = await import("./companyOs/salesAgent");
  app.get("/api/sales/track/:token", handleSalesTrackingRequest);

  // GET/POST /contract/sign/:token — public per-party e-signature page.
  // Mounted outside `/api/` on purpose: the page is meant to be opened
  // from a WhatsApp/email link by an external counterparty, and our
  // origin-CSRF guard only applies to /api/* routes. Capability is the
  // 24-byte URL-safe token itself; we never expose any contract data
  // without a valid token, and the response leaks no information about
  // tokens that don't exist (404 in both branches).
  const { handleContractSignPage, handleContractSignSubmit } = await import(
    "./companyOs/contractSignRoute"
  );
  app.get("/contract/sign/:token", handleContractSignPage);
  app.post("/contract/sign/:token", handleContractSignSubmit);

  app.patch("/api/users/account-type", requireAuth, async (req, res) => {
    try {
      const { accountType } = req.body;
      if (!["individual", "business"].includes(accountType)) {
        return res.status(400).json({ message: "Invalid account type" });
      }

      const user = await storage.updateUser(req.session.userId!, { accountType });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userWithoutPassword } = user;
      res.json(await sanitizeAdminFlag(userWithoutPassword));
    } catch (error) {
      console.error("Update account type error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Referral routes
  app.get("/api/referral/code", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      
      if (!user.referralCode) {
        const code = "BG-" + user.id.substring(0, 4).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
        const updated = await storage.updateUser(user.id, { referralCode: code });
        return res.json({ referralCode: updated?.referralCode });
      }
      
      res.json({ referralCode: user.referralCode });
    } catch (error) {
      console.error("Get referral code error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/referral/stats", requireAuth, async (req, res) => {
    try {
      const referralsList = await storage.getReferralsByUser(req.session.userId!);
      const sent = referralsList.filter(r => r.referrerId === req.session.userId);
      const feeWaiversEarned = sent.filter(r => r.referrerFeeWaived).length;
      const feeWaiversPending = sent.filter(r => !r.referrerFeeWaived).length;
      
      res.json({
        totalReferrals: sent.length,
        feeWaiversEarned,
        feeWaiversPending,
        referrals: referralsList,
      });
    } catch (error) {
      console.error("Get referral stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/referral/apply", requireAuth, async (req, res) => {
    try {
      const { referralCode } = req.body;
      if (!referralCode) return res.status(400).json({ message: "Referral code required" });
      
      const referrer = await storage.getUserByReferralCode(referralCode);
      if (!referrer) return res.status(404).json({ message: "Invalid referral code" });
      if (referrer.id === req.session.userId) return res.status(400).json({ message: "Cannot use your own referral code" });
      
      const user = await storage.getUser(req.session.userId!);
      if (user?.referredBy) return res.status(400).json({ message: "You have already used a referral code" });
      
      const existing = await storage.getReferralByUsers(referrer.id, req.session.userId!);
      if (existing) return res.status(400).json({ message: "Referral already exists" });
      
      await storage.updateUser(req.session.userId!, { referredBy: referrer.id });
      const referral = await storage.createReferral({ referrerId: referrer.id, referredId: req.session.userId! });
      
      await storage.createNotification({
        userId: referrer.id,
        type: "referral",
        title: "New Referral",
        message: `${user?.fullName} joined Bareter using your referral code. Welcome them to the community!`,
      });
      
      res.json({ message: "Referral applied! Thanks for helping grow the Bareter community.", referral });
    } catch (error) {
      console.error("Apply referral error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/referral/check-waiver", requireAuth, async (req, res) => {
    try {
      const referralsList = await storage.getReferralsByUser(req.session.userId!);
      const hasWaiver = referralsList.some(r => {
        if (r.referrerId === req.session.userId && !r.referrerFeeWaived) return true;
        if (r.referredId === req.session.userId && !r.referredFeeWaived) return true;
        return false;
      });
      res.json({ hasWaiver, waiverCount: referralsList.filter(r => {
        if (r.referrerId === req.session.userId && !r.referrerFeeWaived) return true;
        if (r.referredId === req.session.userId && !r.referredFeeWaived) return true;
        return false;
      }).length });
    } catch (error) {
      console.error("Check waiver error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Wishlist routes
  app.get("/api/wishlist", requireAuth, async (req, res) => {
    try {
      const items = await storage.getWishlistByUser(req.session.userId!);
      res.json(items);
    } catch (error) {
      console.error("Get wishlist error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/wishlist/check/:listingId", requireAuth, async (req, res) => {
    try {
      const isWishlisted = await storage.isWishlisted(req.session.userId!, param(req.params.listingId));
      res.json({ isWishlisted });
    } catch (error) {
      console.error("Check wishlist error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/wishlist/:listingId", requireAuth, async (req, res) => {
    try {
      const already = await storage.isWishlisted(req.session.userId!, param(req.params.listingId));
      if (already) return res.status(400).json({ message: "Already in wishlist" });
      
      const wishlist = await storage.addToWishlist(req.session.userId!, param(req.params.listingId));
      res.json(wishlist);
    } catch (error) {
      console.error("Add to wishlist error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/wishlist/:listingId", requireAuth, async (req, res) => {
    try {
      await storage.removeFromWishlist(req.session.userId!, param(req.params.listingId));
      res.json({ message: "Removed from wishlist" });
    } catch (error) {
      console.error("Remove from wishlist error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin routes
  app.post("/api/admin/users/create", requireAdmin, async (req, res) => {
    try {
      const { fullName, password, phone, role, accountType, isVerified } = req.body;
      const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
      if (!fullName || !email || !password) {
        return res.status(400).json({ message: "fullName, email, and password are required" });
      }
      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(400).json({ message: "Email already registered" });
      if (phone) {
        const phoneUser = await storage.getUserByPhone(phone);
        if (phoneUser) return res.status(400).json({ message: "Phone number already in use" });
      }
      const hashedPassword = await hashPassword(password);
      let user = await storage.createUser({
        fullName,
        email,
        password: hashedPassword,
        phone: phone || null,
        role: role || "user",
        accountType: accountType || "individual",
        verificationStatus: isVerified ? "verified" : "unverified",
        kycStatus: isVerified ? "APPROVED" : null,
        country: "AE",
      });
      if (isVerified) {
        user = (await storage.updateUser(user.id, { isVerified: true })) ?? user;
      }
      const { password: _pw, ...safe } = user;
      res.status(201).json(safe);
    } catch (error) {
      console.error("Admin create user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(({ password, ...u }) => u));
    } catch (error) {
      console.error("Admin get users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/listings", requireAdmin, async (req, res) => {
    try {
      const listings = await storage.getAllListingsAdmin();
      const commentCounts = await storage.getListingCommentCounts();
      // Fetch latest moderation reason for flagged/rejected listings
      const flaggedIds = listings
        .filter(l => l.moderationStatus === "flagged" || l.moderationStatus === "rejected")
        .map(l => l.id);
      const reasonMap = new Map<string, string>();
      if (flaggedIds.length > 0) {
        const { db } = await import("./db");
        const { moderationLogs } = await import("@shared/schema");
        const { inArray, desc } = await import("drizzle-orm");
        const logs = await db
          .select()
          .from(moderationLogs)
          .where(inArray(moderationLogs.targetId, flaggedIds))
          .orderBy(desc(moderationLogs.createdAt));
        for (const log of logs) {
          if (!reasonMap.has(log.targetId) && log.reason) {
            reasonMap.set(log.targetId, log.reason);
          }
        }
      }
      const enriched = listings.map(l => ({
        ...l,
        commentCount: commentCounts.get(l.id) || 0,
        moderationReason: reasonMap.get(l.id) || null,
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Admin get listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/deals", requireAdmin, async (req, res) => {
    try {
      const deals = await storage.getAllDeals();
      res.json(deals);
    } catch (error) {
      console.error("Admin get deals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/verify", requireAdmin, async (req, res) => {
    try {
      const { verified } = req.body;
      const updateData: Record<string, unknown> = { isVerified: verified };
      if (verified) {
        updateData.verificationStatus = "verified";
        updateData.kycStatus = "APPROVED";
      }
      const user = await storage.updateUser(param(req.params.id), updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await logAdminAction(req, verified ? "user_verified" : "user_unverified", "user", user.id, { email: user.email });
      // Send verification outcome email
      if (user.email) {
        const { sendVerificationApprovedEmail, sendVerificationDeclinedEmail } = await import("./emailService");
        if (verified) {
          sendVerificationApprovedEmail(user.email, { fullName: user.fullName ?? undefined, accountType: user.accountType ?? undefined }).catch(() => {});
        } else {
          sendVerificationDeclinedEmail(user.email, { fullName: user.fullName ?? undefined, accountType: user.accountType ?? undefined, reason: "Your verification status was updated by the Bareter team." }).catch(() => {});
        }
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin verify user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/listings/:id/flag", requireAdmin, async (req, res) => {
    try {
      const { flagged } = req.body;
      const listing = await storage.updateListing(param(req.params.id), { isActive: !flagged });
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      await logAdminAction(req, flagged ? "listing_flagged" : "listing_unflagged", "listing", listing.id, { title: listing.title });
      res.json(listing);
    } catch (error) {
      console.error("Admin flag listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/run-cleanup — one-shot purge callable from browser while logged in as admin.
  // Idempotent: returns {deleted:0} when already clean.
  app.get("/api/admin/run-cleanup", requireAdmin, async (req, res) => {
    try {
      const { purgeSeedUsers } = await import("./seed");
      const result = await purgeSeedUsers();
      res.json({ ok: true, ...result, message: `Cleanup complete — ${result.deleted} seed account(s) removed, ${result.kept} real user(s) kept.` });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err?.message || "Cleanup failed" });
    }
  });

  // POST /api/admin/deactivate-user-listings — soft-delete ALL listings for a given user email.
  // Use this to clear stuck listings that the UI delete failed to remove.
  app.post("/api/admin/deactivate-user-listings", requireAdmin, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") return res.status(400).json({ message: "email required" });
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      if (!user) return res.status(404).json({ message: "User not found" });
      const result = await db
        .update(listings)
        .set({ isActive: false })
        .where(eq(listings.userId, user.id))
        .returning({ id: listings.id });
      res.json({ ok: true, deactivated: result.length, userId: user.id, email: user.email });
    } catch (err: any) {
      console.error("deactivate-user-listings error:", err);
      res.status(500).json({ ok: false, message: err?.message || "Failed" });
    }
  });

  app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
    try {
      const allDeals = await storage.getAllDeals();
      const allUsers = await storage.getAllUsers();
      const allListings = await storage.getListings();
      
      const completedDeals = allDeals.filter(d => d.state === "completed");
      const activeDeals = allDeals.filter(d => ["proposed", "accepted", "in_progress", "delivery_proof"].includes(d.state));
      const totalGMV = completedDeals.reduce((sum, d) => 
        sum + parseFloat(d.seekerValue as string) + parseFloat(d.providerValue as string), 0);

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthlyDeals = completedDeals.filter(d => d.createdAt && new Date(d.createdAt) >= thisMonth);
      const monthlyGMV = monthlyDeals.reduce((sum, d) => 
        sum + parseFloat(d.seekerValue as string) + parseFloat(d.providerValue as string), 0);
      
      const pendingVerifications = allUsers.filter(u => 
        (u.kycStatus === "IN_PROGRESS" || u.kycStatus === "IN_REVIEW" || 
         u.kybStatus === "IN_PROGRESS" || u.kybStatus === "IN_REVIEW")
      ).length;
      
      const categoryStats: Record<string, number> = {};
      allListings.forEach(l => {
        const cats = l.categories as string[] || [];
        cats.forEach(cat => {
          categoryStats[cat] = (categoryStats[cat] || 0) + 1;
        });
      });
      
      const dealsPerWeek: { week: string; count: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const count = allDeals.filter(d => {
          if (!d.createdAt) return false;
          const created = new Date(d.createdAt);
          return created >= weekStart && created < weekEnd;
        }).length;
        dealsPerWeek.push({
          week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          count
        });
      }
      
      const newListingsToday = await storage.getNewListingsToday();

      let incompleteVerifications = 0;
      let openDrafts = 0;
      let abandonedEngagement = 0;
      try {
        incompleteVerifications = await storage.countIncompleteVerifications();
      } catch (e) { console.error("[analytics] incompleteVerifications:", e); }
      try {
        openDrafts = await storage.countOpenDrafts();
      } catch (e) { console.error("[analytics] openDrafts:", e); }
      try {
        abandonedEngagement = await storage.countAbandonedEngagement();
      } catch (e) { console.error("[analytics] abandonedEngagement:", e); }

      res.json({
        totalUsers: allUsers.length,
        totalDeals: allDeals.length,
        activeDeals: activeDeals.length,
        completedDeals: completedDeals.length,
        totalListings: allListings.length,
        activeListings: allListings.filter(l => l.isActive).length,
        newListingsToday,
        totalGMV,
        monthlyGMV,
        pendingVerifications,
        incompleteVerifications,
        openDrafts,
        abandonedEngagement,
        categoryStats,
        dealsPerWeek,
      });
    } catch (error) {
      console.error("Admin analytics error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/user-growth", requireAdmin, async (_req, res) => {
    try {
      const data = await storage.getUserSignupsByDay(30);
      res.json(data);
    } catch (error) {
      console.error("User growth error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/funnel", requireAdmin, async (_req, res) => {
    try {
      const funnel = await storage.getConversionFunnel();
      res.json(funnel);
    } catch (error) {
      console.error("Funnel analytics error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/top-listings", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      const data = await storage.getTopListings(limit);
      res.json(data);
    } catch (error) {
      console.error("Top listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/email/broadcast/test", requireAdmin, async (req, res) => {
    try {
      const { subject, body, to } = req.body;
      if (!subject || !body) {
        return res.status(400).json({ message: "Subject and body are required" });
      }
      const adminUserId = req.session.userId;
      const admin = await storage.getUser(adminUserId);
      if (!admin) {
        return res.status(404).json({ message: "Admin user not found" });
      }
      const { sendAdminEmail } = await import("./emailService");

      // Build the list of recipients: always include the logged-in admin,
      // plus any custom addresses supplied in `to` (comma-sep string or array).
      const extraEmails: string[] = Array.isArray(to)
        ? to
        : typeof to === "string"
          ? to.split(",").map((e: string) => e.trim()).filter(Boolean)
          : [];
      const recipients = [...new Set([admin.email, ...extraEmails])];

      const sampleVars: Record<string, string> = {
        name: admin.fullName || "Admin",
        email: admin.email,
        city: admin.city || "Dubai",
        businessName: admin.businessName || "Acme Trading LLC",
        accountType: admin.accountType || "individual",
        appName: "Bareter",
      };

      const results = await Promise.all(
        recipients.map((email) =>
          sendAdminEmail(email, {
            recipientName: email === admin.email ? (admin.fullName ?? undefined) : undefined,
            subject: `[TEST] ${subject}`,
            body,
            vars: sampleVars,
          })
        )
      );
      const sentCount = results.filter(Boolean).length;
      if (sentCount > 0) {
        await logAdminAction(req, "email_broadcast_test", "system", adminUserId, { subject, recipients });
        res.json({ message: `Test email sent to ${recipients.join(", ")}` });
      } else {
        res.status(500).json({ message: "Failed to send test email — check email configuration" });
      }
    } catch (error) {
      console.error("Broadcast test email error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/email/ai-draft", requireAdmin, async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ message: "prompt is required" });
      }
      const { draftBroadcastEmail } = await import("./companyOs/marketingAgent");
      const draft = await draftBroadcastEmail(prompt.trim());
      await logAdminAction(req, "email_ai_draft", "system", req.session.userId, { prompt: prompt.slice(0, 200) });
      res.json(draft);
    } catch (error) {
      console.error("AI email draft error:", error);
      res.status(500).json({ message: "AI draft failed — check Gemini API key and quota" });
    }
  });

  app.post("/api/admin/email/broadcast", requireAdmin, async (req, res) => {
    try {
      const { subject, body, filter } = req.body;
      if (!subject || !body) {
        return res.status(400).json({ message: "Subject and body are required" });
      }
      const allUsers = await storage.getAllUsers();
      let recipients = allUsers.filter(u => !u.isBanned);
      if (filter?.city) {
        recipients = recipients.filter(u => u.city?.toLowerCase() === filter.city.toLowerCase());
      }
      if (filter?.accountType && filter.accountType !== "all") {
        recipients = recipients.filter(u => u.accountType === filter.accountType);
      }
      if (filter?.verificationStatus && filter.verificationStatus !== "all") {
        if (filter.verificationStatus === "verified") {
          recipients = recipients.filter(u => u.kycStatus === "APPROVED" || u.kybStatus === "APPROVED");
        } else if (filter.verificationStatus === "unverified") {
          recipients = recipients.filter(u => u.kycStatus !== "APPROVED" && u.kybStatus !== "APPROVED");
        }
      }
      const broadcastId = crypto.randomUUID();
      const adminUserId = req.session.userId;

      await storage.createBroadcastJob({
        id: broadcastId,
        subject,
        body,
        filter: filter ?? null,
        recipientCount: recipients.length,
        sentBy: adminUserId,
      });

      // Return 202 immediately — processing happens in the background
      res.status(202).json({ broadcastId, recipientCount: recipients.length, status: "queued" });

      // Background worker — runs after response is sent
      setImmediate(async () => {
        try {
          const { sendAdminEmail } = await import("./emailService");
          await storage.updateBroadcastJob(broadcastId, { status: "processing", startedAt: new Date() });
          let sent = 0, failed = 0;
          const BATCH_SIZE = 10;
          for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
            const batch = recipients.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (recipient) => {
              try {
                const ok = await sendAdminEmail(recipient.email, {
                  recipientName: recipient.fullName,
                  subject,
                  body,
                  vars: {
                    name: recipient.fullName || "",
                    email: recipient.email,
                    city: recipient.city || "",
                    businessName: recipient.businessName || "",
                    accountType: recipient.accountType || "individual",
                    appName: "Bareter",
                  },
                });
                await storage.createEmailLog({
                  recipientEmail: recipient.email,
                  subject,
                  status: ok ? "sent" : "failed",
                  source: "broadcast",
                  broadcastId,
                  sentBy: adminUserId,
                });
                if (ok) sent++; else failed++;
              } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await storage.createEmailLog({
                  recipientEmail: recipient.email,
                  subject,
                  status: "failed",
                  source: "broadcast",
                  broadcastId,
                  errorMessage: errMsg.slice(0, 200),
                  sentBy: adminUserId,
                });
                failed++;
              }
            }));
          }
          await storage.updateBroadcastJob(broadcastId, { status: "completed", sent, failed, completedAt: new Date() });
          await logAdminAction(req, "email_broadcast", "system", broadcastId, { subject, recipientCount: recipients.length, sent, failed });
        } catch (workerErr) {
          console.error("Broadcast worker error:", workerErr);
          await storage.updateBroadcastJob(broadcastId, { status: "failed", completedAt: new Date() });
        }
      });
    } catch (error) {
      console.error("Broadcast email error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/email/broadcast/:id", requireAdmin, async (req, res) => {
    try {
      const job = await storage.getBroadcastJob(req.params.id);
      if (!job) return res.status(404).json({ message: "Broadcast job not found" });
      res.json(job);
    } catch (error) {
      console.error("Broadcast status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/email/stats", requireAdmin, async (_req, res) => {
    try {
      const stats = await storage.getEmailStats();
      res.json(stats);
    } catch (error) {
      console.error("Email stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/email/preview", requireAdmin, async (req, res) => {
    try {
      const { body, recipientName, vars, mode } = req.body;
      if (typeof body !== "string") {
        return res.status(400).json({ message: "body (string) is required" });
      }
      const { renderBroadcastEmailHtml, applyTemplateVars } = await import("./emailService");
      let html: string;
      if (mode === "template") {
        // System templates are full HTML — just substitute vars, no wrapping or escaping
        html = vars ? applyTemplateVars(body, vars) : body;
      } else {
        // Broadcast mode: plain text body wrapped in the branded shell
        html = renderBroadcastEmailHtml({ recipientName: recipientName || null, body, vars: vars || {} });
      }
      res.json({ html });
    } catch (error) {
      console.error("Email preview error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/email/templates", requireAdmin, async (_req, res) => {
    try {
      const templates: Record<string, string> = {};
      const keys = ["email_template_welcome", "email_template_password_reset", "email_template_deal_completed", "email_template_listing_rejected"];
      for (const key of keys) {
        const val = await storage.getAppSetting(key);
        templates[key] = val || "";
      }
      res.json(templates);
    } catch (error) {
      console.error("Email templates error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/email/templates", requireAdmin, async (req, res) => {
    try {
      const { templates } = req.body;
      if (!templates || typeof templates !== "object") {
        return res.status(400).json({ message: "Templates object is required" });
      }
      const validKeys = ["email_template_welcome", "email_template_password_reset", "email_template_deal_completed", "email_template_listing_rejected"];
      for (const [key, value] of Object.entries(templates)) {
        if (validKeys.includes(key) && typeof value === "string") {
          await storage.setAppSetting(key, value, req.session.userId);
        }
      }
      await logAdminAction(req, "email_templates_updated", "system", "templates", { keys: Object.keys(templates) });
      res.json({ message: "Templates updated" });
    } catch (error) {
      console.error("Update email templates error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Agent Health Dashboard — for each canonical agent, surface
  // last-call timestamp, recent activity counts, status (healthy /
  // never_called / errored), enabled flag, and budget row presence.
  // Single endpoint so the founder has one place to verify the entire
  // agent fleet is alive.
  app.get("/api/admin/agents/health", requireAdmin, async (_req, res) => {
    try {
      const KNOWN_AGENTS = [
        "manager", "finance", "marketing", "sales", "legal", "dashboard",
        "intelligence", "admin", "matching", "moderation", "support",
        "valuation", "engagement", "board", "memory",
      ];
      const { companyOsLogs, agentInteractions, agentBudgets } = await import("@shared/schema");
      const { db } = await import("./db");
      const { sql: drizzleSql } = await import("drizzle-orm");
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [osStats, intStats, budgetRows, toggles] = await Promise.all([
        db.execute(drizzleSql`
          SELECT agent_name AS name,
                 COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE created_at >= ${since24h})::int AS calls_24h,
                 COUNT(*) FILTER (WHERE created_at >= ${since7d})::int AS calls_7d,
                 COUNT(*) FILTER (WHERE status NOT IN ('ok','success') AND status IS NOT NULL)::int AS errors,
                 MAX(created_at)::text AS last_at
          FROM company_os_logs
          GROUP BY agent_name
        `),
        db.execute(drizzleSql`
          SELECT agent_type AS name,
                 COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE created_at >= ${since24h})::int AS calls_24h,
                 COUNT(*) FILTER (WHERE created_at >= ${since7d})::int AS calls_7d,
                 MAX(created_at)::text AS last_at
          FROM agent_interactions
          GROUP BY agent_type
        `),
        db.select().from(agentBudgets),
        storage.getAllAgentToggles(),
      ]);

      const unwrap = <R,>(r: unknown): R[] =>
        Array.isArray(r) ? (r as R[]) : ((r as { rows?: R[] })?.rows ?? []);
      type StatRow = { name: string; total: number; calls_24h: number; calls_7d: number; errors?: number; last_at: string | null };
      const osMap = new Map<string, StatRow>();
      for (const r of unwrap<StatRow>(osStats)) osMap.set(String(r.name), r);
      const intMap = new Map<string, StatRow>();
      for (const r of unwrap<StatRow>(intStats)) intMap.set(String(r.name), r);
      const budgetMap = new Map(budgetRows.map((b) => [b.agentName, b]));
      const toggleMap = new Map(toggles.map((t) => [t.agentName, t.enabled]));

      const agents = KNOWN_AGENTS.map((name) => {
        // company_os_logs uses both short ("intelligence") and suffixed
        // ("intelligenceAgent") forms — try both.
        const os = osMap.get(name) ?? osMap.get(`${name}Agent`);
        const inApp = intMap.get(name) ?? intMap.get(`${name}Agent`);
        const total = (os?.total ?? 0) + (inApp?.total ?? 0);
        const calls24h = (os?.calls_24h ?? 0) + (inApp?.calls_24h ?? 0);
        const calls7d = (os?.calls_7d ?? 0) + (inApp?.calls_7d ?? 0);
        const errors = os?.errors ?? 0;
        const lastAt = [os?.last_at, inApp?.last_at]
          .filter(Boolean)
          .sort()
          .pop() ?? null;
        const budget = budgetMap.get(name) ?? budgetMap.get(`${name}Agent`);
        const enabled = toggleMap.has(name) ? toggleMap.get(name)! : true;

        let status: "healthy" | "idle" | "never_called" | "errored" | "disabled";
        if (!enabled) status = "disabled";
        else if (errors > 0 && calls24h > 0) status = "errored";
        else if (total === 0) status = "never_called";
        else if (calls7d === 0) status = "idle";
        else status = "healthy";

        return {
          agentName: name,
          enabled,
          status,
          totalCalls: total,
          calls24h,
          calls7d,
          errors,
          lastInvocationAt: lastAt,
          monthlyCapAed: budget ? Number(budget.monthlyCapAed) : null,
          hasBudgetRow: Boolean(budget),
        };
      });

      res.json({
        generatedAt: new Date().toISOString(),
        agents,
      });
    } catch (error) {
      console.error("Agent health error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/agents/toggles", requireAdmin, async (_req, res) => {
    try {
      const KNOWN_AGENTS = [
        "manager", "finance", "marketing", "sales", "legal", "dashboard",
        "intelligence", "admin", "matching", "moderation", "support",
        "valuation", "engagement", "board", "memory",
      ];
      const dbToggles = await storage.getAllAgentToggles();
      const toggleMap = new Map(dbToggles.map(t => [t.agentName, t.enabled]));
      const result = KNOWN_AGENTS.map(name => ({
        agentName: name,
        enabled: toggleMap.has(name) ? toggleMap.get(name)! : true,
      }));
      res.json(result);
    } catch (error) {
      console.error("Agent toggles error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/agents/:name/toggle", requireAdmin, async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled (boolean) is required" });
      }
      const KNOWN_AGENTS_SET = new Set([
        "manager", "finance", "marketing", "sales", "legal", "dashboard",
        "intelligence", "admin", "matching", "moderation", "support",
        "valuation", "engagement", "board", "memory",
      ]);
      const agentName = req.params.name;
      if (!KNOWN_AGENTS_SET.has(agentName)) {
        return res.status(400).json({ message: `Unknown agent: ${agentName}` });
      }
      await storage.setAgentEnabled(agentName, enabled);
      await logAdminAction(req, enabled ? "agent_enabled" : "agent_disabled", "system", agentName, { agentName });
      res.json({ agentName, enabled });
    } catch (error) {
      console.error("Agent toggle error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/deals/export.csv", requireAdmin, async (req, res) => {
    try {
      const allDeals = await storage.getAllDeals();
      let filtered = allDeals;
      const stateFilter = (req.query.state as string) || "completed";
      filtered = filtered.filter(d => d.state === stateFilter);
      if (req.query.from) {
        const from = new Date(req.query.from as string);
        filtered = filtered.filter(d => d.createdAt && new Date(d.createdAt) >= from);
      }
      if (req.query.to) {
        const to = new Date(req.query.to as string);
        to.setHours(23, 59, 59, 999);
        filtered = filtered.filter(d => d.createdAt && new Date(d.createdAt) <= to);
      }
      const escCsv = (v: string | null | undefined) => {
        if (v == null) return "";
        let s = String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const headers = ["Deal Number","State","Seeker","Seeker Email","Provider","Provider Email","Seeker Offer","Seeker Value (AED)","Provider Offer","Provider Value (AED)","Created At","Completed At"];
      const rows = filtered.map(d => [
        escCsv(d.dealNumber), d.state,
        escCsv(d.seeker?.fullName), escCsv(d.seeker?.email),
        escCsv(d.provider?.fullName), escCsv(d.provider?.email),
        escCsv(d.seekerOffer), d.seekerValue, escCsv(d.providerOffer), d.providerValue,
        d.createdAt ? new Date(d.createdAt).toISOString() : "",
        d.completedAt ? new Date(d.completedAt).toISOString() : "",
      ].join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="bareter-deals-${new Date().toISOString().split("T")[0]}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Deals CSV export error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/reports/export.csv", requireAdmin, async (req, res) => {
    try {
      const fromDate = req.query.from ? new Date(req.query.from as string) : undefined;
      const toDate = req.query.to ? new Date(req.query.to as string) : undefined;
      if (toDate) toDate.setHours(23, 59, 59, 999);
      const allReports = await db.select().from(reports).orderBy(desc(reports.createdAt));
      let filtered = allReports;
      if (fromDate) filtered = filtered.filter(r => r.createdAt && new Date(r.createdAt) >= fromDate);
      if (toDate) filtered = filtered.filter(r => r.createdAt && new Date(r.createdAt) <= toDate);
      const allDisputes = await db.select().from(disputes).orderBy(desc(disputes.createdAt));
      let filteredDisputes = allDisputes;
      if (fromDate) filteredDisputes = filteredDisputes.filter(d => d.createdAt && new Date(d.createdAt) >= fromDate);
      if (toDate) filteredDisputes = filteredDisputes.filter(d => d.createdAt && new Date(d.createdAt) <= toDate);
      const escCsv = (v: string | null | undefined) => {
        if (v == null) return "";
        let s = String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const lines: string[] = [];
      lines.push("Type,ID,Reporter/Party A,Target/Party B,Reason/Subject,Status,Notes/Description,Created At");
      for (const r of filtered) {
        lines.push([
          "Report", r.id, r.reporterId, r.targetId,
          escCsv(r.reason), r.status, escCsv(r.notes),
          r.createdAt ? new Date(r.createdAt).toISOString() : "",
        ].join(","));
      }
      for (const d of filteredDisputes) {
        lines.push([
          "Dispute", d.id, d.partyAId, d.partyBId,
          escCsv(d.subject), d.status, escCsv(d.description),
          d.createdAt ? new Date(d.createdAt).toISOString() : "",
        ].join(","));
      }
      const csv = lines.join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="bareter-reports-disputes-${new Date().toISOString().split("T")[0]}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Reports/disputes CSV export error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!["user", "admin", "super_admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const isAdmin = role === "admin" || role === "super_admin";
      const user = await storage.updateUser(param(req.params.id), { role, isAdmin });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Keep the DB-stored allowlist in sync so requireAdmin stays consistent
      if (user.email) {
        await updateAdminAllowlist(user.email, isAdmin ? "add" : "remove", req.session.userId);
      }
      await logAdminAction(req, "user_role_changed", "user", user.id, { role, email: user.email });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin change role error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/promote", requireAdmin, async (req, res) => {
    try {
      const targetId = param(req.params.id);
      if (targetId === req.session.userId) {
        return res.status(400).json({ message: "You are already an admin" });
      }
      const user = await storage.updateUser(targetId, { isAdmin: true, role: "admin" });
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.email) {
        await updateAdminAllowlist(user.email, "add", req.session.userId);
      }
      await logAdminAction(req, "admin_promote", "user", user.id, { email: user.email });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin promote error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/demote", requireAdmin, async (req, res) => {
    try {
      const targetId = param(req.params.id);
      if (targetId === req.session.userId) {
        return res.status(400).json({ message: "You cannot demote yourself" });
      }
      const user = await storage.updateUser(targetId, { isAdmin: false, role: "user" });
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.email) {
        await updateAdminAllowlist(user.email, "remove", req.session.userId);
      }
      await logAdminAction(req, "admin_demote", "user", user.id, { email: user.email });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin demote error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/ban", requireAdmin, async (req, res) => {
    try {
      const { banned, reason } = req.body;
      const banUpdates: Record<string, boolean | string | Date | null> = { 
        isBanned: banned,
        bannedReason: banned ? reason : null,
        bannedAt: banned ? new Date() : null
      };
      const user = await storage.updateUser(param(req.params.id), banUpdates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (banned && user.email) {
        await storage.addBannedEmail(user.email, req.session.userId!, reason || undefined);
      } else if (!banned && user.email) {
        await storage.removeBannedEmail(user.email);
      }
      await logAdminAction(req, banned ? "user_banned" : "user_unbanned", "user", user.id, { email: user.email, reason });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin ban user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users/export.csv", requireAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const headers = ["ID","Full Name","Email","Business Name","Role","Verified","Banned","KYC Status","KYB Status","Country","City","Location","Account Type","Onboarding Completed","Created At"];
      const escCsv = (v: string | null | undefined) => {
        if (v == null) return "";
        let s = String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const rows = allUsers.map(u => [
        u.id, escCsv(u.fullName), escCsv(u.email), escCsv(u.businessName),
        u.role, u.isVerified ? "Yes" : "No", u.isBanned ? "Yes" : "No",
        u.kycStatus, u.kybStatus, u.country, u.city, escCsv(u.location),
        u.accountType, u.onboardingCompleted ? "Yes" : "No",
        u.createdAt ? new Date(u.createdAt).toISOString() : "",
      ].join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="bareter-users-${new Date().toISOString().split("T")[0]}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Admin export users CSV error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(param(req.params.id));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await storage.updateUser(user.id, {
        passwordResetToken: hashResetToken(token),
        passwordResetExpires: expires,
      });
      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;
      const { sendPasswordResetEmail } = await import("./emailService");
      await sendPasswordResetEmail(user.email, token, baseUrl);
      await logAdminAction(req, "password_reset_sent", "user", user.id, { email: user.email });
      res.json({ message: "Password reset email sent" });
    } catch (error) {
      console.error("Admin reset password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const userId = param(req.params.id);
      if (userId === req.session.userId) {
        return res.status(400).json({ message: "Cannot delete your own account while logged in as admin" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.role === "super_admin") {
        return res.status(403).json({ message: "Cannot delete super admin accounts" });
      }
      await destroyUserSessions(userId);

      const userEmail = user.email;

      const crypto = await import("crypto");
      const emailHash = crypto.createHash("sha256").update(userEmail.trim().toLowerCase()).digest("hex");

      await db.transaction(async (tx) => {
        await tx.update(bannedEmails).set({ bannedBy: null }).where(eq(bannedEmails.bannedBy, userId));

        await tx.insert(bannedEmails).values({ email: emailHash, bannedBy: null, reason: "PDPL erasure" }).onConflictDoNothing();

        const userDealRows = await tx.select({ id: deals.id }).from(deals).where(or(eq(deals.seekerId, userId), eq(deals.providerId, userId)));
        for (const d of userDealRows) {
          await tx.delete(messages).where(eq(messages.dealId, d.id));
          await tx.delete(dealMilestones).where(eq(dealMilestones.dealId, d.id));
        }
        await tx.delete(deals).where(or(eq(deals.seekerId, userId), eq(deals.providerId, userId)));

        await tx.delete(ratings).where(or(eq(ratings.fromUserId, userId), eq(ratings.toUserId, userId)));

        await tx.delete(listingLikes).where(eq(listingLikes.userId, userId));
        await tx.delete(listingComments).where(eq(listingComments.userId, userId));

        const userListingRows = await tx.select({ id: listings.id }).from(listings).where(eq(listings.userId, userId));
        const listingIds = userListingRows.map(l => l.id);
        if (listingIds.length > 0) {
          for (const lid of listingIds) {
            await tx.delete(imageScans).where(eq(imageScans.listingId, lid));
            await tx.delete(listingLikes).where(eq(listingLikes.listingId, lid));
            await tx.delete(listingComments).where(eq(listingComments.listingId, lid));
            await tx.delete(moderationLogs).where(and(eq(moderationLogs.targetType, "listing"), eq(moderationLogs.targetId, lid)));
          }
          await tx.delete(listings).where(eq(listings.userId, userId));
        }

        await tx.delete(wishlists).where(eq(wishlists.userId, userId));
        await tx.delete(followers).where(or(eq(followers.followerId, userId), eq(followers.followingId, userId)));
        await tx.delete(referrals).where(or(eq(referrals.referrerId, userId), eq(referrals.referredId, userId)));

        await tx.delete(postLikes).where(eq(postLikes.userId, userId));
        await tx.delete(postBookmarks).where(eq(postBookmarks.userId, userId));
        const userPosts = await tx.select({ id: posts.id }).from(posts).where(eq(posts.userId, userId));
        for (const p of userPosts) {
          await tx.delete(postLikes).where(eq(postLikes.postId, p.id));
          await tx.delete(postComments).where(eq(postComments.postId, p.id));
        }
        await tx.delete(postComments).where(eq(postComments.userId, userId));
        await tx.delete(posts).where(eq(posts.userId, userId));

        await tx.delete(endorsements).where(or(eq(endorsements.fromUserId, userId), eq(endorsements.toUserId, userId)));
        await tx.delete(savedSearches).where(eq(savedSearches.userId, userId));
        await tx.delete(portfolioItems).where(eq(portfolioItems.userId, userId));
        await tx.delete(quickInquiries).where(or(eq(quickInquiries.fromUserId, userId), eq(quickInquiries.toUserId, userId)));
        await tx.delete(reports).where(eq(reports.reporterId, userId));
        await tx.delete(agentInteractions).where(eq(agentInteractions.userId, userId));
        await tx.delete(moderationLogs).where(eq(moderationLogs.adminUserId, userId));
        await tx.delete(consentLogs).where(eq(consentLogs.userId, userId));
        await tx.delete(notifications).where(eq(notifications.userId, userId));

        const userSalesLeads = await tx.select({ id: salesLeads.id }).from(salesLeads).where(eq(salesLeads.userId, userId));
        for (const sl of userSalesLeads) {
          await tx.delete(salesReengagementEvents).where(eq(salesReengagementEvents.leadId, sl.id));
        }
        await tx.delete(salesReengagementEvents).where(eq(salesReengagementEvents.userId, userId));
        await tx.delete(salesLeads).where(eq(salesLeads.userId, userId));

        await tx.delete(users).where(eq(users.id, userId));
      });

      await logAdminAction(req, "user_deleted_pdpl", "user", userId, { email: userEmail });
      res.json({ message: "User data permanently deleted (PDPL right to erasure)" });
    } catch (error) {
      console.error("Admin delete user (PDPL) error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/verification-tier", requireAdmin, async (req, res) => {
    try {
      const { tier } = req.body;
      if (!["basic", "verified", "business"].includes(tier)) {
        return res.status(400).json({ message: "Invalid tier. Must be basic, verified, or business" });
      }
      const tierUpdates: Record<string, boolean | string> = {};
      if (tier === "basic") {
        tierUpdates.isVerified = false;
        tierUpdates.kycStatus = "NOT_STARTED";
        tierUpdates.kybStatus = "NOT_STARTED";
        tierUpdates.accountType = "individual";
      } else if (tier === "verified") {
        tierUpdates.isVerified = true;
        tierUpdates.kycStatus = "APPROVED";
        tierUpdates.kybStatus = "NOT_STARTED";
        tierUpdates.accountType = "individual";
      } else if (tier === "business") {
        tierUpdates.isVerified = true;
        tierUpdates.kycStatus = "APPROVED";
        tierUpdates.kybStatus = "APPROVED";
        tierUpdates.accountType = "business";
      }
      const user = await storage.updateUser(param(req.params.id), tierUpdates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await logAdminAction(req, "verification_tier_changed", "user", user.id, { tier, email: user.email });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin verification tier error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/email", requireAdmin, async (req, res) => {
    try {
      const { subject, body } = req.body;
      if (!subject || !body) {
        return res.status(400).json({ message: "Subject and body are required" });
      }
      const user = await storage.getUser(param(req.params.id));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { sendAdminEmail } = await import("./emailService");
      const sent = await sendAdminEmail(user.email, {
        recipientName: user.fullName,
        subject,
        body,
      });
      if (!sent) {
        return res.status(500).json({ message: "Failed to send email. Email service may not be configured." });
      }
      await logAdminAction(req, "email_sent", "user", user.id, { subject });
      res.json({ message: "Email sent successfully" });
    } catch (error) {
      console.error("Admin send email error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users/:id/detail", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(param(req.params.id));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const userListings = await storage.getListingsByUser(user.id);
      const userDeals = await storage.getDealsByUser(user.id);
      const { password, ...userWithoutPassword } = user;
      res.json({
        ...userWithoutPassword,
        listings: userListings,
        deals: userDeals,
      });
    } catch (error) {
      console.error("Admin user detail error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/listings/:id", requireAdmin, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const listing = await storage.getListing(listingId);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      await db.update(listings).set({
        deletedAt: new Date(),
        deletedByUserId: req.session.userId,
        isActive: false,
      }).where(eq(listings.id, listingId));
      await logAdminAction(req, "listing_removed", "listing", listingId, { title: listing.title });
      res.json({ message: "Listing removed successfully" });
    } catch (error) {
      console.error("Admin delete listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Bulk actions ────────────────────────────────────────────────────────────

  app.post("/api/admin/bulk/users", requireAdmin, async (req, res) => {
    try {
      const { ids, action } = req.body as { ids: string[]; action: "ban" | "unban" | "delete" };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
      if (!["ban", "unban", "delete"].includes(action)) return res.status(400).json({ message: "invalid action" });

      let affected = 0;
      for (const userId of ids) {
        if (userId === req.session.userId) continue; // never self-modify
        const user = await storage.getUser(userId);
        if (!user || user.role === "super_admin") continue;

        if (action === "ban") {
          await db.update(users).set({ isBanned: true }).where(eq(users.id, userId));
          await destroyUserSessions(userId);
        } else if (action === "unban") {
          await db.update(users).set({ isBanned: false }).where(eq(users.id, userId));
        } else if (action === "delete") {
          await destroyUserSessions(userId);

          // Collect parent content IDs owned by this user
          const userListingRows = await db.select({ id: listings.id }).from(listings).where(eq(listings.userId, userId));
          const listingIds = userListingRows.map(l => l.id);
          const userDealRows = await db.select({ id: deals.id }).from(deals).where(or(eq(deals.seekerId, userId), eq(deals.providerId, userId)));
          const dealIds = userDealRows.map(d => d.id);
          const userPostRows = await db.select({ id: posts.id }).from(posts).where(eq(posts.userId, userId));
          const postIds = userPostRows.map(p => p.id);

          // Phase 1: Deal children
          if (dealIds.length > 0) {
            await db.delete(messages).where(inArray(messages.dealId, dealIds));
            await db.delete(dealMilestones).where(inArray(dealMilestones.dealId, dealIds));
            await db.delete(ratings).where(inArray(ratings.dealId, dealIds));
            await db.delete(notifications).where(inArray(notifications.relatedDealId, dealIds));
          }

          // Phase 2: Listing children — reviews before listingComments (FK listingCommentId)
          if (listingIds.length > 0) {
            await db.update(deals).set({ seekerListingId: null }).where(inArray(deals.seekerListingId, listingIds));
            await db.update(deals).set({ providerListingId: null }).where(inArray(deals.providerListingId, listingIds));
            await db.delete(reviewsTable).where(inArray(reviewsTable.listingId, listingIds));
            await db.delete(listingComments).where(inArray(listingComments.listingId, listingIds));
            await db.delete(engagementEvents).where(inArray(engagementEvents.listingId, listingIds));
            await db.delete(listingLikes).where(inArray(listingLikes.listingId, listingIds));
            await db.delete(wishlists).where(inArray(wishlists.listingId, listingIds));
            await db.delete(quickInquiries).where(inArray(quickInquiries.listingId, listingIds));
            await db.delete(collabApplications).where(inArray(collabApplications.listingId, listingIds));
            await db.delete(imageScans).where(inArray(imageScans.listingId, listingIds));
            await db.delete(notifications).where(inArray(notifications.relatedListingId, listingIds));
          }

          // Phase 3: Post children
          if (postIds.length > 0) {
            await db.delete(postLikes).where(inArray(postLikes.postId, postIds));
            await db.delete(postComments).where(inArray(postComments.postId, postIds));
            await db.delete(postBookmarks).where(inArray(postBookmarks.postId, postIds));
            await db.delete(quickInquiries).where(inArray(quickInquiries.postId, postIds));
            await db.delete(notifications).where(inArray(notifications.relatedPostId, postIds));
          }

          // Phase 4: Delete parent content tables
          if (listingIds.length > 0) await db.delete(listings).where(eq(listings.userId, userId));
          if (postIds.length > 0) await db.delete(posts).where(eq(posts.userId, userId));
          if (dealIds.length > 0) await db.delete(deals).where(or(eq(deals.seekerId, userId), eq(deals.providerId, userId)));

          // Phase 5: Remaining user-level FK references across all tables
          await db.delete(messages).where(eq(messages.senderId, userId));
          await db.delete(notifications).where(eq(notifications.userId, userId));
          await db.delete(ratings).where(or(eq(ratings.fromUserId, userId), eq(ratings.toUserId, userId)));
          await db.delete(listingLikes).where(eq(listingLikes.userId, userId));
          await db.delete(listingComments).where(eq(listingComments.userId, userId));
          await db.delete(postLikes).where(eq(postLikes.userId, userId));
          await db.delete(postComments).where(eq(postComments.userId, userId));
          await db.delete(postBookmarks).where(eq(postBookmarks.userId, userId));
          await db.delete(wishlists).where(eq(wishlists.userId, userId));
          await db.delete(followers).where(or(eq(followers.followerId, userId), eq(followers.followingId, userId)));
          await db.delete(savedSearches).where(eq(savedSearches.userId, userId));
          await db.delete(portfolioItems).where(eq(portfolioItems.userId, userId));
          await db.delete(reviewsTable).where(or(eq(reviewsTable.reviewerId, userId), eq(reviewsTable.revieweeId, userId)));
          await db.delete(engagementEvents).where(eq(engagementEvents.userId, userId));
          await db.delete(collabApplications).where(or(eq(collabApplications.creatorId, userId), eq(collabApplications.brandId, userId)));
          await db.delete(quickInquiries).where(or(eq(quickInquiries.fromUserId, userId), eq(quickInquiries.toUserId, userId)));
          await db.delete(referrals).where(or(eq(referrals.referrerId, userId), eq(referrals.referredId, userId)));
          await db.delete(endorsements).where(or(eq(endorsements.fromUserId, userId), eq(endorsements.toUserId, userId)));
          // Reports filed BY this user (reporterId NOT NULL — must delete, not null-out)
          await db.delete(reports).where(eq(reports.reporterId, userId));
          // Disputes this user was a party to (partyAId/partyBId NOT NULL — must delete)
          await db.delete(disputes).where(or(eq(disputes.partyAId, userId), eq(disputes.partyBId, userId)));
          // Admin audit log rows authored by this user (adminId NOT NULL — must delete)
          await db.delete(adminAuditLogs).where(eq(adminAuditLogs.adminId, userId));
          // userBlocks has onDelete:cascade but null-out explicitly for safety
          await db.delete(userBlocks).where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
          // Nullable FKs — null-out rather than delete to preserve audit history
          await db.update(listings).set({ deletedByUserId: null }).where(eq(listings.deletedByUserId, userId));
          await db.update(supportTickets).set({ userId: null }).where(eq(supportTickets.userId, userId));
          await db.update(supportTickets).set({ assignedTo: null }).where(eq(supportTickets.assignedTo, userId));
          await db.update(broadcastJobs).set({ sentBy: null }).where(eq(broadcastJobs.sentBy, userId));
          await db.update(emailLogs).set({ sentBy: null }).where(eq(emailLogs.sentBy, userId));
          await db.update(bannedEmails).set({ bannedBy: null }).where(eq(bannedEmails.bannedBy, userId));

          // Phase 6: Delete the user row
          await db.delete(users).where(eq(users.id, userId));
        }
        await logAdminAction(req, `bulk_user_${action}` as any, "user", userId, {});
        affected++;
      }
      res.json({ ok: true, affected });
    } catch (error) {
      console.error("Bulk user action error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/bulk/listings", requireAdmin, async (req, res) => {
    try {
      const { ids, action } = req.body as { ids: string[]; action: "approve" | "reject" | "delete" };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
      if (!["approve", "reject", "delete"].includes(action)) return res.status(400).json({ message: "invalid action" });

      let affected = 0;
      for (const listingId of ids) {
        const listing = await storage.getListing(listingId);
        if (!listing) continue;

        if (action === "approve") {
          await storage.updateListing(listingId, { isActive: true, moderationStatus: "approved" });
          await db.insert(moderationLogs).values({ targetType: "listing", targetId: listingId, action: "approved", reason: "Bulk approved by admin", reviewedByAdmin: true, adminUserId: req.session.userId || null });
        } else if (action === "reject") {
          await storage.updateListing(listingId, { isActive: false, moderationStatus: "rejected" });
          await db.insert(moderationLogs).values({ targetType: "listing", targetId: listingId, action: "rejected", reason: "Bulk rejected by admin", reviewedByAdmin: true, adminUserId: req.session.userId || null });
        } else if (action === "delete") {
          await db.update(listings).set({ deletedAt: new Date(), deletedByUserId: req.session.userId, isActive: false }).where(eq(listings.id, listingId));
        }
        await logAdminAction(req, `bulk_listing_${action}` as any, "listing", listingId, { title: listing.title });
        affected++;
      }
      res.json({ ok: true, affected });
    } catch (error) {
      console.error("Bulk listing action error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/bulk/deals", requireAdmin, async (req, res) => {
    try {
      const { ids, action } = req.body as { ids: string[]; action: "delete" };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
      let affected = 0;
      for (const dealId of ids) {
        await db.delete(messages).where(eq(messages.dealId, dealId));
        await db.delete(dealMilestones).where(eq(dealMilestones.dealId, dealId));
        await db.delete(deals).where(eq(deals.id, dealId));
        await logAdminAction(req, "bulk_deal_delete" as any, "deal", dealId, {});
        affected++;
      }
      res.json({ ok: true, affected });
    } catch (error) {
      console.error("Bulk deal delete error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/bulk/disputes", requireAdmin, async (req, res) => {
    try {
      const { ids, action } = req.body as { ids: string[]; action: "delete" | "resolve" };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids required" });
      if (!["delete", "resolve"].includes(action)) return res.status(400).json({ message: "invalid action" });
      let affected = 0;
      for (const id of ids) {
        if (action === "delete") {
          await db.delete(disputes).where(eq(disputes.id, id));
        } else if (action === "resolve") {
          await db.update(disputes).set({ status: "resolved" }).where(eq(disputes.id, id));
        }
        await logAdminAction(req, `bulk_dispute_${action}` as any, "dispute", id, {});
        affected++;
      }
      res.json({ ok: true, affected });
    } catch (error) {
      console.error("Bulk dispute action error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── End bulk actions ─────────────────────────────────────────────────────────

  app.patch("/api/admin/listings/:id/approve", requireAdmin, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const listing = await storage.updateListing(listingId, {
        isActive: true,
        moderationStatus: "approved",
      });
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      await db.insert(moderationLogs).values({
        targetType: "listing",
        targetId: listingId,
        action: "approved",
        reason: "Approved by admin",
        reviewedByAdmin: true,
        adminUserId: req.session.userId || null,
      });
      await logAdminAction(req, "listing_approved", "listing", listingId, { title: listing.title });
      res.json(listing);
    } catch (error) {
      console.error("Admin approve listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/listings/:id/reject", requireAdmin, async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }
      const listingId = param(req.params.id);
      const listing = await storage.updateListing(listingId, {
        isActive: false,
        moderationStatus: "rejected",
      });
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      await db.insert(moderationLogs).values({
        targetType: "listing",
        targetId: listingId,
        action: "rejected",
        reason,
        reviewedByAdmin: true,
        adminUserId: req.session.userId || null,
      });
      const owner = await storage.getUser(listing.userId);
      if (owner) {
        const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;
        const { sendListingRejectionEmail } = await import("./emailService");
        sendListingRejectionEmail(owner.email, {
          recipientName: owner.fullName,
          listingTitle: listing.title,
          reason,
          baseUrl,
        }).catch(err => console.error("Failed to send rejection email:", err));
      }
      await logAdminAction(req, "listing_rejected", "listing", listingId, { title: listing.title, reason });
      res.json(listing);
    } catch (error) {
      console.error("Admin reject listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/listings/:id/edit", requireAdmin, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const { categories, retailValue, title, description } = req.body;
      const updates: Record<string, string | string[]> = {};
      if (categories !== undefined) updates.categories = categories;
      if (retailValue !== undefined) updates.retailValue = retailValue;
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      const listing = await storage.updateListing(listingId, updates);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      const changedFields = Object.keys(updates).join(", ");
      await db.insert(moderationLogs).values({
        targetType: "listing",
        targetId: listingId,
        action: "edited",
        reason: `Admin edited fields: ${changedFields}`,
        reviewedByAdmin: true,
        adminUserId: req.session.userId || null,
      });
      await logAdminAction(req, "listing_edited", "listing", listingId, { changedFields, title: listing.title });
      res.json(listing);
    } catch (error) {
      console.error("Admin edit listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/listings/:id/feature", requireAdmin, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const { featured, durationDays } = req.body;
      const isFeatured = !!featured;
      const featuredUntil = featured
        ? new Date(Date.now() + (durationDays || 7) * 24 * 60 * 60 * 1000)
        : null;
      const listing = await storage.updateListing(listingId, { isFeatured, featuredUntil });
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      await db.insert(moderationLogs).values({
        targetType: "listing",
        targetId: listingId,
        action: isFeatured ? "featured" : "unfeatured",
        reason: isFeatured ? `Featured for ${durationDays || 7} days` : "Removed from featured",
        reviewedByAdmin: true,
        adminUserId: req.session.userId || null,
      });
      await logAdminAction(req, isFeatured ? "listing_featured" : "listing_unfeatured", "listing", listingId, { title: listing.title });
      res.json(listing);
    } catch (error) {
      console.error("Admin feature listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/listings/:id/moderation-history", requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getModerationLogsByTarget(param(req.params.id), "listing");
      res.json(logs);
    } catch (error) {
      console.error("Admin moderation history error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/deals/:id/messages", requireAdmin, async (req, res) => {
    try {
      const messages = await storage.getMessagesByDeal(param(req.params.id));
      res.json(messages);
    } catch (error) {
      console.error("Admin get deal messages error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  async function logAdminAction(req: Request, action: string, targetType: string, targetId: string | null, details?: Record<string, unknown>) {
    try {
      const admin = await storage.getUser(req.session.userId!);
      await storage.createAuditLog({
        adminId: req.session.userId!,
        adminEmail: admin?.email || null,
        action,
        targetType,
        targetId,
        details: details || null,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null,
      });
    } catch (err) {
      console.error("[audit] failed to log admin action:", err);
    }
  }

  const dealStateSchema = z.object({
    state: z.enum(["completed", "cancelled"]),
    reason: z.string().max(2000).optional(),
  });

  app.patch("/api/admin/deals/:id/state", requireAdmin, async (req, res) => {
    try {
      const parsed = dealStateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "State must be completed or cancelled" });
      }
      const { state, reason } = parsed.data;
      const dealId = param(req.params.id);
      const deal = await storage.getDeal(dealId);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.state === "completed" || deal.state === "cancelled") {
        return res.status(400).json({ message: `Deal is already ${deal.state}` });
      }
      const updated = await storage.updateDeal(dealId, {
        state,
        ...(state === "completed" ? { completedAt: new Date() } : { cancelledAt: new Date() }),
      });
      await logAdminAction(req, `deal_${state}`, "deal", dealId, { previousState: deal.state, reason });
      res.json(updated);
    } catch (error) {
      console.error("Admin deal state error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/disputes", requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const result = await storage.getDisputes(status ? { status } : undefined);
      res.json(result);
    } catch (error) {
      console.error("Admin get disputes error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/disputes/:id", requireAdmin, async (req, res) => {
    try {
      const dispute = await storage.getDispute(param(req.params.id));
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }
      res.json(dispute);
    } catch (error) {
      console.error("Admin get dispute error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const createDisputeSchema = z.object({
    partyAId: z.string().min(1),
    partyBId: z.string().min(1),
    subject: z.string().min(1).max(500),
    description: z.string().max(5000).optional().nullable(),
    dealId: z.string().optional().nullable(),
    reportId: z.string().optional().nullable(),
  });

  app.post("/api/admin/disputes", requireAdmin, async (req, res) => {
    try {
      const disputesEnabled = await storage.getAppSetting("disputes_enabled");
      if (disputesEnabled === "false") {
        return res.status(403).json({ message: "Dispute management is currently disabled." });
      }
      const parsed = createDisputeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { partyAId, partyBId, dealId, reportId, subject, description } = parsed.data;
      const dispute = await storage.createDispute({
        partyAId,
        partyBId,
        dealId: dealId || null,
        reportId: reportId || null,
        subject,
        description: description || null,
        status: "open",
        evidence: [],
      });
      await logAdminAction(req, "dispute_created", "dispute", dispute.id, { partyAId, partyBId, dealId, subject });
      res.json(dispute);
    } catch (error) {
      console.error("Admin create dispute error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const disputeStatusSchema = z.object({
    status: z.enum(["open", "in_mediation", "resolved"]),
  });

  app.patch("/api/admin/disputes/:id/status", requireAdmin, async (req, res) => {
    try {
      const parsed = disputeStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid status. Must be open, in_mediation, or resolved" });
      }
      const { status } = parsed.data;
      const disputeId = param(req.params.id);
      const existing = await storage.getDispute(disputeId);
      if (!existing) {
        return res.status(404).json({ message: "Dispute not found" });
      }
      const updates: Partial<Dispute> = { status };
      if (status === "resolved") {
        updates.resolvedAt = new Date();
      }
      const updated = await storage.updateDispute(disputeId, updates);
      await logAdminAction(req, "dispute_status_changed", "dispute", disputeId, { from: existing.status, to: status });
      res.json(updated);
    } catch (error) {
      console.error("Admin dispute status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const disputeDecisionSchema = z.object({
    decision: z.string().min(1).max(5000),
    decisionReasoning: z.string().max(5000).optional().nullable(),
    outcome: z.enum(DISPUTE_OUTCOMES),
  });

  app.patch("/api/admin/disputes/:id/decision", requireAdmin, async (req, res) => {
    try {
      const parsed = disputeDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const { decision, decisionReasoning, outcome } = parsed.data;
      const disputeId = param(req.params.id);
      const existing = await storage.getDispute(disputeId);
      if (!existing) {
        return res.status(404).json({ message: "Dispute not found" });
      }
      const updated = await storage.updateDispute(disputeId, {
        decision,
        decisionReasoning: decisionReasoning || null,
        outcome,
        decisionBy: req.session.userId!,
        decisionAt: new Date(),
        status: "resolved",
        resolvedAt: new Date(),
      });
      await logAdminAction(req, "dispute_decided", "dispute", disputeId, { outcome, decision });

      const { sendAdminEmail } = await import("./emailService");
      const partyA = await storage.getUser(existing.partyAId);
      const partyB = await storage.getUser(existing.partyBId);
      const outcomeLabel = outcome.replace(/_/g, " ");
      for (const party of [partyA, partyB].filter(Boolean)) {
        sendAdminEmail(party!.email, {
          recipientName: party!.fullName,
          subject: `Dispute Resolution: ${existing.subject}`,
          body: `Your dispute "${existing.subject}" has been resolved.\n\nOutcome: ${outcomeLabel}\nDecision: ${decision}${decisionReasoning ? `\nReasoning: ${decisionReasoning}` : ""}`,
        }).catch(err => console.error("Failed to send dispute resolution email:", err));
      }

      res.json(updated);
    } catch (error) {
      console.error("Admin dispute decision error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/disputes/:id/escalate", requireAdmin, async (req, res) => {
    try {
      const disputeId = param(req.params.id);
      const existing = await storage.getDispute(disputeId);
      if (!existing) {
        return res.status(404).json({ message: "Dispute not found" });
      }
      const updated = await storage.updateDispute(disputeId, {
        escalatedAt: new Date(),
        escalatedBy: req.session.userId!,
        status: "in_mediation",
      });
      await logAdminAction(req, "dispute_escalated", "dispute", disputeId, { subject: existing.subject });

      const { notifyFounder } = await import("./companyOs/twilio");
      const admin = await storage.getUser(req.session.userId!);
      notifyFounder(
        `🚨 *Dispute Escalated*\n\n` +
        `Subject: ${existing.subject}\n` +
        `Party A: ${existing.partyA?.fullName || existing.partyAId}\n` +
        `Party B: ${existing.partyB?.fullName || existing.partyBId}\n` +
        `Escalated by: ${admin?.fullName || "Admin"}\n` +
        `Status: In Mediation\n\n` +
        `Review at /admin → Disputes`
      ).catch(err => console.error("[dispute] WhatsApp escalation notify failed:", err));

      res.json(updated);
    } catch (error) {
      console.error("Admin dispute escalate error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const evidenceSchema = z.object({
    description: z.string().min(1).max(5000),
    fileUrls: z.array(z.string().url()).optional(),
    submittedByName: z.string().max(200).optional(),
  });

  app.post("/api/admin/disputes/:id/evidence", requireAdmin, async (req, res) => {
    try {
      const parsed = evidenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const disputeId = param(req.params.id);
      const existing = await storage.getDispute(disputeId);
      if (!existing) {
        return res.status(404).json({ message: "Dispute not found" });
      }
      if (existing.status === "resolved") {
        return res.status(400).json({ message: "Cannot add evidence to a resolved dispute" });
      }
      const admin = await storage.getUser(req.session.userId!);
      const newEvidence: DisputeEvidence = {
        submittedBy: req.session.userId!,
        submittedByName: parsed.data.submittedByName || admin?.fullName || "Admin",
        description: parsed.data.description,
        fileUrls: parsed.data.fileUrls || [],
        submittedAt: new Date().toISOString(),
      };
      const currentEvidence: DisputeEvidence[] = Array.isArray(existing.evidence) ? existing.evidence : [];
      const updated = await storage.updateDispute(disputeId, {
        evidence: [...currentEvidence, newEvidence],
      });
      await logAdminAction(req, "dispute_evidence_added", "dispute", disputeId, { description: parsed.data.description.slice(0, 100) });
      res.json(updated);
    } catch (error) {
      console.error("Admin dispute evidence error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/disputes/:id", requireAdmin, async (req, res) => {
    try {
      const disputeId = param(req.params.id);
      const existing = await storage.getDispute(disputeId);
      if (!existing) {
        return res.status(404).json({ message: "Dispute not found" });
      }
      if (existing.status === "in_mediation") {
        return res.status(400).json({ message: "Cannot delete a dispute that is in mediation" });
      }
      await db.delete(disputes).where(eq(disputes.id, disputeId));
      await logAdminAction(req, "dispute_deleted", "dispute", disputeId, { subject: existing.subject });
      res.json({ message: "Dispute deleted" });
    } catch (error) {
      console.error("Admin dispute delete error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/audit-logs", requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const action = req.query.action as string | undefined;
      const adminId = req.query.adminId as string | undefined;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const logs = await storage.getAuditLogs({ limit, offset, action, adminId, from, to });
      res.json(logs);
    } catch (error) {
      console.error("Admin audit logs error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/failed-logins", requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const email = req.query.email as string | undefined;
      const attempts = await storage.getFailedLoginAttempts({ limit, email });
      res.json(attempts);
    } catch (error) {
      console.error("Admin failed logins error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users/:id/revoke-sessions", requireAdmin, async (req, res) => {
    try {
      const userId = param(req.params.id);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await destroyUserSessions(userId);
      await logAdminAction(req, "sessions_revoked", "user", userId, { email: user.email });
      res.json({ message: `All sessions revoked for ${user.fullName}` });
    } catch (error) {
      console.error("Admin revoke sessions error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users/:id/export", requireAdmin, async (req, res) => {
    try {
      const userId = param(req.params.id);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const userListings = await storage.getListingsByUser(userId);
      const userDeals = await storage.getDealsByUser(userId);
      const userRatings = await storage.getRatingsByUser(userId);
      const userNotifications = await storage.getNotificationsByUser(userId);
      const userFollowers = await storage.getFollowers(userId);
      const userFollowing = await storage.getFollowing(userId);
      const userEndorsements = await storage.getEndorsementsByUser(userId);
      const userSavedSearches = await storage.getSavedSearchesByUser(userId);

      const userDealIds = userDeals.map(d => d.id);
      const [userPosts, userConsentLogs, userSentMessages, userReports] = await Promise.all([
        db.select().from(posts).where(eq(posts.userId, userId)),
        db.select().from(consentLogs).where(eq(consentLogs.userId, userId)),
        db.select().from(messages).where(eq(messages.senderId, userId)),
        db.select().from(reports).where(eq(reports.reporterId, userId)),
      ]);
      let userReceivedMessages: typeof userSentMessages = [];
      if (userDealIds.length > 0) {
        userReceivedMessages = await db.select().from(messages).where(
          and(
            sqlOperator`${messages.dealId} IN (${sqlOperator.join(userDealIds.map(id => sqlOperator`${id}`), sqlOperator`, `)})`,
            sqlOperator`${messages.senderId} != ${userId}`
          )
        );
      }
      const userMessages = [...userSentMessages, ...userReceivedMessages].sort((a, b) =>
        new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
      );

      const { password, passwordResetToken, passwordResetExpires, ...safeUser } = user;
      const exportData = {
        exportedAt: new Date().toISOString(),
        requestType: "DSAR_EXPORT",
        user: safeUser,
        listings: userListings,
        deals: userDeals.map(d => {
          const { seeker, provider, ...dealData } = d;
          return { ...dealData, seekerName: seeker.fullName, providerName: provider.fullName };
        }),
        ratings: userRatings,
        notifications: userNotifications,
        followers: userFollowers.map(f => ({ id: f.follower.id, name: f.follower.fullName })),
        following: userFollowing.map(f => ({ id: f.following.id, name: f.following.fullName })),
        endorsements: userEndorsements,
        savedSearches: userSavedSearches,
        posts: userPosts,
        consentLogs: userConsentLogs,
        messages: userMessages,
        reports: userReports,
      };
      await logAdminAction(req, "dsar_export", "user", userId, { email: user.email });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="dsar-export-${userId}-${new Date().toISOString().split("T")[0]}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error("Admin DSAR export error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const dataCollectionSchema = z.object({ disabled: z.boolean() });

  app.patch("/api/admin/settings/data-collection", requireAdmin, async (req, res) => {
    try {
      const parsed = dataCollectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "disabled must be a boolean" });
      }
      const { disabled } = parsed.data;
      await storage.setAppSetting("data_collection_disabled", disabled ? "true" : "false", req.session.userId);
      await logAdminAction(req, disabled ? "data_collection_disabled" : "data_collection_enabled", "settings", "data_collection_disabled");
      res.json({ dataCollectionDisabled: !!disabled });
    } catch (error) {
      console.error("Admin data collection toggle error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/settings/data-collection", requireAdmin, async (req, res) => {
    try {
      const val = await storage.getAppSetting("data_collection_disabled");
      res.json({ dataCollectionDisabled: val === "true" });
    } catch (error) {
      console.error("Admin get data collection setting error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin platform settings (bulk GET / PUT) ─────────────────────
  const ADMIN_SETTINGS_KEYS = [
    "maintenance_mode", "maintenance_message", "registration_enabled", "invite_only_mode",
    "announcement_banner_enabled", "announcement_banner_text", "announcement_banner_link",
    "active_emirates", "high_value_threshold", "max_listings_per_user",
    "contact_email", "support_email", "support_phone",
    "hero_headline", "hero_tagline", "hero_cta", "how_it_works_steps", "faq_entries",
    "waitlist_enabled", "disputes_enabled", "ai_matching_enabled",
    // Task #248 — completion reminder gates (master + per-channel).
    "reminders_enabled", "reminders_verification_enabled",
    "reminders_drafts_enabled", "reminders_engagement_enabled",
  ];

  app.get("/api/admin/settings/platform", requireAdmin, async (_req, res) => {
    try {
      const all = await storage.getAllAppSettings();
      const result: Record<string, string | null> = {};
      for (const key of ADMIN_SETTINGS_KEYS) {
        result[key] = all[key] ?? null;
      }
      result["data_collection_disabled"] = all["data_collection_disabled"] ?? null;
      result["waitlist_launch_email_sent_at"] = all["waitlist_launch_email_sent_at"] ?? null;
      res.json(result);
    } catch (error) {
      console.error("Admin get platform settings error:", error);
      res.status(500).json({ message: "Failed to load settings" });
    }
  });

  app.put("/api/admin/settings/platform", requireAdmin, async (req, res) => {
    try {
      const updates = req.body as Record<string, string | null>;
      if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      const BOOLEAN_KEYS = ["maintenance_mode", "registration_enabled", "invite_only_mode", "announcement_banner_enabled", "waitlist_enabled", "disputes_enabled", "ai_matching_enabled",
        "reminders_enabled", "reminders_verification_enabled", "reminders_drafts_enabled", "reminders_engagement_enabled"];
      const NUMERIC_KEYS = ["high_value_threshold", "max_listings_per_user"];
      const JSON_KEYS = ["how_it_works_steps", "faq_entries", "active_emirates"];
      const STRING_KEYS = ["announcement_banner_text", "announcement_banner_link", "contact_email", "support_email", "support_phone", "hero_headline", "hero_tagline", "hero_cta", "maintenance_message"];

      const changedKeys: string[] = [];
      for (const [key, value] of Object.entries(updates)) {
        if (!ADMIN_SETTINGS_KEYS.includes(key)) continue;

        if (value === null || value === "") {
          await storage.setAppSetting(key, "", req.session.userId ?? null);
          changedKeys.push(key);
          continue;
        }

        const strVal = String(value);

        if (BOOLEAN_KEYS.includes(key)) {
          if (strVal !== "true" && strVal !== "false") {
            return res.status(400).json({ message: `${key} must be "true" or "false"` });
          }
        } else if (NUMERIC_KEYS.includes(key)) {
          const num = Number(strVal);
          if (isNaN(num) || num < 0) {
            return res.status(400).json({ message: `${key} must be a non-negative number` });
          }
        } else if (JSON_KEYS.includes(key)) {
          try { JSON.parse(strVal); } catch {
            return res.status(400).json({ message: `${key} must be valid JSON` });
          }
        } else if (STRING_KEYS.includes(key)) {
          if (strVal.length > 2000) {
            return res.status(400).json({ message: `${key} exceeds maximum length` });
          }
        }

        await storage.setAppSetting(key, strVal, req.session.userId ?? null);
        changedKeys.push(key);
      }
      if (changedKeys.includes("maintenance_mode")) {
        maintenanceCache = { value: false, at: 0 };
      }
      // Bust the waitlist-enabled in-process cache immediately so the next
      // request reads the new DB value instead of waiting up to 5 s.
      if (changedKeys.includes("waitlist_enabled")) {
        bustWaitlistEnabledCache();
      }
      await logAdminAction(req, "platform_settings_updated", "settings", "bulk", { keys: changedKeys });
      const all = await storage.getAllAppSettings();
      const result: Record<string, string | null> = {};
      for (const key of ADMIN_SETTINGS_KEYS) {
        const v = all[key];
        result[key] = (v != null && v !== "") ? v : null;
      }
      res.json(result);
    } catch (error) {
      console.error("Admin update platform settings error:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // ── Waitlist launch email ─────────────────────────────────────────
  app.post("/api/admin/waitlist/launch-email", requireAdmin, async (req, res) => {
    try {
      const entries = await storage.listWaitlistEntries({ limit: 10000 });
      const eligible = entries.filter(e => e.confirmedAt && !e.convertedUserId);
      let sent = 0;
      let failed = 0;
      const configuredUrl = process.env.PUBLIC_APP_URL?.trim();
      const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
      const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
      const baseUrl = configuredUrl
        ? configuredUrl.replace(/\/+$/, "")
        : replitDomain
          ? `https://${replitDomain}`
          : devDomain
            ? `https://${devDomain}`
            : "http://localhost:5000";
      for (const entry of eligible) {
        try {
          const ok = await sendWaitlistLaunchEmail(entry.email, { name: entry.name, baseUrl });
          if (ok) sent++; else failed++;
        } catch {
          failed++;
        }
      }
      await storage.setAppSetting("waitlist_launch_email_sent_at", new Date().toISOString(), req.session.userId ?? null);
      await logAdminAction(req, "waitlist_launch_email_sent", "waitlist", "bulk", { sent, failed, total: eligible.length });
      res.json({ sent, failed, total: eligible.length });
    } catch (error) {
      console.error("Admin waitlist launch email error:", error);
      res.status(500).json({ message: "Failed to send launch emails" });
    }
  });

  const marketingConsentSchema = z.object({ marketingEmails: z.boolean() });

  app.patch("/api/admin/users/:id/marketing-consent", requireAdmin, async (req, res) => {
    try {
      const parsed = marketingConsentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "marketingEmails must be a boolean" });
      }
      const { marketingEmails } = parsed.data;
      const user = await storage.updateUser(param(req.params.id), { marketingEmails: !!marketingEmails });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await logAdminAction(req, "marketing_consent_updated", "user", user.id, { marketingEmails: !!marketingEmails });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin marketing consent error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Onboarding routes
  const onboardingSchema = z
    .object({
      step: z.number().min(1).max(4),
      fullName: z.string().optional(),
      businessName: z.string().optional(),
      location: z.string().optional(),
      country: z.string().length(2).optional(),
      city: z.string().optional(),
      locationPrompted: z.boolean().optional(),
      bio: z.string().optional(),
      whatIOffer: z.array(z.object({
        name: z.string(),
        value: z.number(),
        description: z.string().optional(),
      })).optional(),
      whatINeed: z.array(z.object({
        name: z.string(),
        value: z.number(),
        description: z.string().optional(),
      })).optional(),
      avatarUrl: z.string().optional(),
      portfolioImages: z.array(z.string()).optional(),
    })
    .strict();

  app.patch("/api/onboarding", requireAuth, async (req, res) => {
    try {
      const data = onboardingSchema.parse(req.body);
      const { step, ...profileData } = data;
      
      const updateData: any = {
        ...profileData,
        onboardingStep: step,
      };
      
      if (step === 4) {
        updateData.onboardingCompleted = true;
        updateData.profileCompleted = true;
      }
      
      const user = await storage.updateUser(req.session.userId!, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Onboarding error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // AI Matching suggestions
  app.get("/api/suggestions", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const userNeeds = currentUser.whatINeed || [];
      const allListings = await storage.getListings();
      
      const suggestions = allListings
        .filter(listing => {
          if (listing.userId === req.session.userId) return false;
          
          const needKeywords = userNeeds.map(n => n.name.toLowerCase());
          const listingText = `${listing.title} ${listing.description}`.toLowerCase();
          
          return needKeywords.some(keyword => listingText.includes(keyword));
        })
        .slice(0, 10);
      
      res.json(suggestions);
    } catch (error) {
      console.error("Suggestions error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Posts API ==========

  // Get feed posts with optional category filter
  app.get("/api/posts", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const worldwide = req.query.worldwide === "true";
      const sessionUserPosts = req.session?.userId
        ? await storage.getUser(req.session.userId)
        : null;
      const queryCountryPosts = (req.query.country as string | undefined)?.toUpperCase();
      const queryCityPosts = req.query.city as string | undefined;
      const country = worldwide
        ? undefined
        : queryCountryPosts || sessionUserPosts?.country?.toUpperCase() || undefined;
      const city = worldwide
        ? undefined
        : queryCityPosts || (queryCountryPosts ? undefined : sessionUserPosts?.city || undefined);
      const allPosts = await storage.getPosts({ category, limit: limit * 4, offset });
      const currentUserId = req.session?.userId;
      // Legacy-tolerant filter: posts without country/city are kept (legacy/seed
      // data may have only `location` set). Strict country/city match is applied
      // when those fields exist. Authenticated users never see their own posts in the feed.
      const filtered = allPosts.filter((p) => {
        if (currentUserId && p.userId === currentUserId) return false;
        if (country && p.country) {
          if (p.country.toUpperCase() !== country) return false;
        }
        if (city && p.city) {
          if (p.city !== city) return false;
        }
        return true;
      });
      const postsData = filtered.slice(0, limit);

      // Enrich posts with comment counts and user-specific state (3 batch queries total)
      const postIds = postsData.map((p) => p.id);
      const [commentCountMap, likedSet, bookmarkedSet] = await Promise.all([
        storage.getCommentCounts(postIds),
        req.session.userId ? storage.getLikedPostIds(postIds, req.session.userId) : Promise.resolve(new Set<string>()),
        req.session.userId ? storage.getBookmarkedPostIds(postIds, req.session.userId) : Promise.resolve(new Set<string>()),
      ]);
      const enrichedPosts = postsData.map((post) => ({
        ...post,
        commentCount: commentCountMap.get(post.id) ?? 0,
        liked: likedSet.has(post.id),
        bookmarked: bookmarkedSet.has(post.id),
      }));
      res.json(enrichedPosts);
    } catch (error) {
      console.error("Get posts error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get stories
  app.get("/api/stories", async (req, res) => {
    try {
      const stories = await storage.getStories();
      res.json(stories);
    } catch (error) {
      console.error("Get stories error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/posts/trending", async (req, res) => {
    try {
      const trending = await storage.getTrendingPosts();
      res.json(trending);
    } catch (error) {
      console.error("Get trending posts error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single post
  app.get("/api/posts/:id", async (req, res) => {
    try {
      const post = await storage.getPost(param(req.params.id));
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      if (req.session.userId) {
        const liked = await storage.isPostLiked(post.id, req.session.userId);
        return res.json({ ...post, liked });
      }
      res.json(post);
    } catch (error) {
      console.error("Get post error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create post
  app.post("/api/posts", requireAuth, async (req, res) => {
    try {
      const validated = insertPostSchema.parse({
        ...req.body,
        userId: req.session.userId!,
      });
      const post = await storage.createPost(validated);
      res.status(201).json(post);

      import("./agents/moderationAgent").then(({ moderateAndLog }) => {
        moderateAndLog("post", post.id, {
          title: post.title ?? undefined,
          description: post.caption || undefined,
          categories: [post.feedCategory, post.subCategory].filter(Boolean) as string[],
        }, req.session.userId).catch(() => {});
      }).catch(() => {});

      // Auto-run valuation agent if the post has a declared value
      if (post.declaredValue && parseFloat(post.declaredValue as string) > 0) {
        const sessionUser = req.session.userId ? await storage.getUser(req.session.userId) : null;
        import("./agents/valuationAgent").then(async ({ getValuation }) => {
          try {
            const advice = await getValuation(
              post.title || post.caption.slice(0, 80),
              post.caption,
              post.feedCategory || undefined,
              post.condition || undefined,
              req.session.userId,
              { country: sessionUser?.country, city: sessionUser?.city },
            );
            if (advice.estimatedRange.min > 0) {
              const valJson = JSON.stringify({
                minAed: Math.round(advice.estimatedRange.min),
                maxAed: Math.round(advice.estimatedRange.max),
                fairAed: Math.round(advice.fairValue),
                confidence: advice.confidence,
                reasoning: advice.reasoning,
              });
              await db.update(posts).set({ marketValuation: valJson }).where(eq(posts.id, post.id));
            }
          } catch { /* valuation is best-effort */ }
        }).catch(() => {});
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid post data", errors: error.errors });
      }
      console.error("Create post error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Like/unlike post
  app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
    try {
      const postId = param(req.params.id);
      const userId = req.session.userId!;
      const isLiked = await storage.isPostLiked(postId, userId);
      if (isLiked) {
        await storage.unlikePost(postId, userId);
        res.json({ liked: false });
      } else {
        await storage.likePost(postId, userId);
        res.json({ liked: true });
      }
    } catch (error) {
      console.error("Like post error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get comments for a post
  app.get("/api/posts/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByPost(param(req.params.id));
      res.json(comments);
    } catch (error) {
      console.error("Get comments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Add comment to a post
  app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
    try {
      const { content, offerItemName, offerItemValue, offerDescription, images } = req.body;
      if (!offerItemName || typeof offerItemName !== "string" || offerItemName.trim().length === 0) {
        return res.status(400).json({ message: "Please specify what you want to offer" });
      }
      if (!offerItemValue || isNaN(Number(offerItemValue)) || Number(offerItemValue) <= 0) {
        return res.status(400).json({ message: "Please provide a valid value for your offer" });
      }
      if (!Array.isArray(images) || images.length < 2) {
        return res.status(400).json({ message: "At least 2 images of your offer are required" });
      }
      const comment = await storage.createComment(
        param(req.params.id),
        req.session.userId!,
        content?.trim() || null,
        offerItemName.trim(),
        String(Number(offerItemValue).toFixed(2)),
        offerDescription?.trim() || null,
        images
      );
      const user = await storage.getUser(req.session.userId!);
      const { password, ...safeUser } = user!;
      res.status(201).json({ ...comment, user: safeUser });
    } catch (error) {
      console.error("Create comment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete comment
  app.delete("/api/posts/:postId/comments/:commentId", requireAuth, async (req, res) => {
    try {
      await storage.deleteComment(param(req.params.commentId), req.session.userId!);
      res.json({ message: "Comment deleted" });
    } catch (error) {
      console.error("Delete comment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bookmark/save a post
  app.post("/api/posts/:id/bookmark", requireAuth, async (req, res) => {
    try {
      const postId = param(req.params.id);
      const userId = req.session.userId!;
      const isBookmarked = await storage.isPostBookmarked(postId, userId);
      if (isBookmarked) {
        await storage.unbookmarkPost(postId, userId);
        res.json({ bookmarked: false });
      } else {
        await storage.bookmarkPost(postId, userId);
        res.json({ bookmarked: true });
      }
    } catch (error) {
      console.error("Bookmark post error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get bookmarked posts
  app.get("/api/bookmarks", requireAuth, async (req, res) => {
    try {
      const posts = await storage.getBookmarkedPosts(req.session.userId!);
      res.json(posts);
    } catch (error) {
      console.error("Get bookmarks error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== End Posts API ==========

  // User search (public — used for live suggestions)
  app.get("/api/users/search", async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      const limit = Math.min(parseInt(String(req.query.limit ?? "5")), 20);
      if (q.length < 2) return res.json([]);

      const results = await db
        .select({
          id: users.id,
          fullName: users.fullName,
          businessName: users.businessName,
          profileImageUrl: users.profileImageUrl,
          location: users.location,
          role: users.role,
        })
        .from(users)
        .where(
          and(
            or(
              ilike(users.fullName, `%${q}%`),
              ilike(users.businessName, `%${q}%`),
            ),
            eq(users.isBanned, false),
          ),
        )
        .limit(limit);

      res.json(results);
    } catch (err) {
      res.status(500).json({ message: "Search failed" });
    }
  });

  // User profile by ID (public)
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(param(req.params.id));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const ratings = await storage.getRatingsByUser(param(req.params.id));
      const avgRating = ratings.length > 0 
        ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length 
        : 0;

      const userListings = await storage.getListingsByUser(param(req.params.id));
      const activeListings = userListings.filter(l => l.isActive);
      
      const { password, emailVerificationToken, passwordResetToken, ...publicUser } = user;
      res.json({ ...publicUser, avgRating, totalRatings: ratings.length, ratings, listings: activeListings });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Endorsements routes
  app.get("/api/endorsements/check/:toUserId/:skill", requireAuth, async (req, res) => {
    try {
      const hasEndorsed = await storage.hasEndorsed(
        req.session.userId!,
        param(req.params.toUserId),
        param(req.params.skill)
      );
      res.json({ hasEndorsed });
    } catch (error) {
      console.error("Check endorsement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/endorsements/:userId", async (req, res) => {
    try {
      const endorsements = await storage.getEndorsementsByUser(param(req.params.userId));
      res.json(endorsements);
    } catch (error) {
      console.error("Get endorsements error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/endorsements", requireAuth, async (req, res) => {
    try {
      const { toUserId, skill } = req.body;
      if (!toUserId || !skill) {
        return res.status(400).json({ message: "toUserId and skill are required" });
      }
      if (toUserId === req.session.userId) {
        return res.status(400).json({ message: "Cannot endorse yourself" });
      }
      const already = await storage.hasEndorsed(req.session.userId!, toUserId, skill);
      if (already) {
        return res.status(400).json({ message: "Already endorsed this skill" });
      }
      const endorsement = await storage.createEndorsement(req.session.userId!, toUserId, skill);
      res.json(endorsement);
    } catch (error) {
      console.error("Create endorsement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/endorsements", requireAuth, async (req, res) => {
    try {
      const { toUserId, skill } = req.body;
      if (!toUserId || !skill) {
        return res.status(400).json({ message: "toUserId and skill are required" });
      }
      await storage.deleteEndorsement(req.session.userId!, toUserId, skill);
      res.json({ message: "Endorsement removed" });
    } catch (error) {
      console.error("Delete endorsement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Saved Searches routes
  app.get("/api/saved-searches", requireAuth, async (req, res) => {
    try {
      const searches = await storage.getSavedSearchesByUser(req.session.userId!);
      res.json(searches);
    } catch (error) {
      console.error("Get saved searches error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/saved-searches", requireAuth, async (req, res) => {
    try {
      const { name, filters, notifyEnabled } = req.body;
      if (!name || !filters) {
        return res.status(400).json({ message: "name and filters are required" });
      }
      const savedSearch = await storage.createSavedSearch({
        userId: req.session.userId!,
        name,
        filters,
        notifyEnabled: notifyEnabled ?? true,
      });
      res.json(savedSearch);
    } catch (error) {
      console.error("Create saved search error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/saved-searches/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSavedSearch(param(req.params.id), req.session.userId!);
      res.json({ message: "Saved search deleted" });
    } catch (error) {
      console.error("Delete saved search error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Search Query History ──────────────────────────────────────────
  // Save a search query (called when user performs a search)
  app.post("/api/search-history", requireAuth, async (req, res) => {
    try {
      const { query, category, resultCount } = req.body;
      if (!query || typeof query !== "string" || query.trim().length < 2) {
        return res.status(400).json({ message: "query required (min 2 chars)" });
      }
      const userId = req.session.userId!;
      // Avoid duplicates in last 10 minutes for same query
      const recent = await db
        .select()
        .from(searchQueryHistory)
        .where(
          and(
            eq(searchQueryHistory.userId, userId),
            eq(searchQueryHistory.query, query.trim()),
            gte(searchQueryHistory.createdAt, new Date(Date.now() - 10 * 60 * 1000)),
          ),
        )
        .limit(1);
      if (recent.length === 0) {
        await db.insert(searchQueryHistory).values({
          userId,
          query: query.trim(),
          category: category || null,
          resultCount: resultCount || 0,
        });
      }
      res.json({ saved: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to save search" });
    }
  });

  // Get search history + recommendations
  app.get("/api/search-history", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const history = await db
        .select()
        .from(searchQueryHistory)
        .where(eq(searchQueryHistory.userId, userId))
        .orderBy(desc(searchQueryHistory.createdAt))
        .limit(20);

      // Build recommendations from the most recent unique queries
      const recentQueries = Array.from(new Set(history.map((h) => h.query))).slice(0, 5);
      let recommendations: typeof listings.$inferSelect[] = [];
      if (recentQueries.length > 0) {
        const conditions = recentQueries.map((q) =>
          or(ilike(listings.title, `%${q}%`), ilike(listings.description, `%${q}%`))
        );
        const rows = await db
          .select()
          .from(listings)
          .where(and(eq(listings.isActive, true), or(...conditions)))
          .orderBy(desc(listings.createdAt))
          .limit(20);
        recommendations = rows;
      }

      res.json({ history, recommendations });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch search history" });
    }
  });

  // Delete a search history entry
  app.delete("/api/search-history/:id", requireAuth, async (req, res) => {
    try {
      await db
        .delete(searchQueryHistory)
        .where(
          and(
            eq(searchQueryHistory.id, param(req.params.id)),
            eq(searchQueryHistory.userId, req.session.userId!),
          ),
        );
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete" });
    }
  });

  // ── Liked Listings (Favorites) ────────────────────────────────────
  app.get("/api/listings/liked", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rows = await db
        .select({
          id: listings.id,
          title: listings.title,
          description: listings.description,
          categories: listings.categories,
          type: listings.type,
          images: listings.images,
          retailValue: listings.retailValue,
          location: listings.location,
          condition: listings.condition,
          isActive: listings.isActive,
          likeCount: listings.likeCount,
          createdAt: listings.createdAt,
          userId: listings.userId,
          likedAt: listingLikes.createdAt,
        })
        .from(listingLikes)
        .innerJoin(listings, eq(listingLikes.listingId, listings.id))
        .where(and(eq(listingLikes.userId, userId), eq(listings.isActive, true)))
        .orderBy(desc(listingLikes.createdAt));

      res.json(rows.map((r) => ({ ...r, isLiked: true })));
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch liked listings" });
    }
  });

  // Deal Milestones routes
  app.get("/api/deals/:dealId/milestones", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.dealId));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const milestones = await storage.getMilestonesByDeal(param(req.params.dealId));
      res.json(milestones);
    } catch (error) {
      console.error("Get milestones error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/deals/:dealId/milestones", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.dealId));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const { title, description, sortOrder } = req.body;
      if (!title) {
        return res.status(400).json({ message: "title is required" });
      }
      const milestone = await storage.createMilestone({
        dealId: param(req.params.dealId),
        title,
        description: description || null,
        sortOrder: sortOrder ?? 0,
      });
      res.json(milestone);
    } catch (error) {
      console.error("Create milestone error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/deals/:dealId/milestones/:milestoneId/complete", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.dealId));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const milestone = await storage.completeMilestone(param(req.params.milestoneId), req.session.userId!);
      if (!milestone) {
        return res.status(404).json({ message: "Milestone not found" });
      }
      res.json(milestone);
    } catch (error) {
      console.error("Complete milestone error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/deals/:dealId/milestones/:milestoneId", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.dealId));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.deleteMilestone(param(req.params.milestoneId));
      res.json({ message: "Milestone deleted" });
    } catch (error) {
      console.error("Delete milestone error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Portfolio Items routes
  app.get("/api/portfolio/:userId", async (req, res) => {
    try {
      const items = await storage.getPortfolioByUser(param(req.params.userId));
      res.json(items);
    } catch (error) {
      console.error("Get portfolio error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/portfolio", requireAuth, async (req, res) => {
    try {
      const { title, description, images, dealId, category, barterValue } = req.body;
      if (!title) {
        return res.status(400).json({ message: "title is required" });
      }
      const item = await storage.createPortfolioItem({
        userId: req.session.userId!,
        title,
        description: description || null,
        images: images || [],
        dealId: dealId || null,
        category: category || null,
        barterValue: barterValue || null,
      });
      res.json(item);
    } catch (error) {
      console.error("Create portfolio item error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/portfolio/:id", requireAuth, async (req, res) => {
    try {
      await storage.deletePortfolioItem(param(req.params.id), req.session.userId!);
      res.json({ message: "Portfolio item deleted" });
    } catch (error) {
      console.error("Delete portfolio item error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Quick Inquiries routes
  app.get("/api/inquiries/sent", requireAuth, async (req, res) => {
    try {
      const inquiries = await storage.getInquiriesByUser(req.session.userId!);
      res.json(inquiries);
    } catch (error) {
      console.error("Get sent inquiries error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inquiries/received", requireAuth, async (req, res) => {
    try {
      const inquiries = await storage.getInquiriesForUser(req.session.userId!);
      res.json(inquiries);
    } catch (error) {
      console.error("Get received inquiries error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/inquiries", requireAuth, async (req, res) => {
    try {
      const { toUserId, listingId, postId, message } = req.body;
      if (!toUserId) {
        return res.status(400).json({ message: "toUserId is required" });
      }
      if (toUserId === req.session.userId) {
        return res.status(400).json({ message: "Cannot send inquiry to yourself" });
      }
      const inquiry = await storage.createInquiry({
        fromUserId: req.session.userId!,
        toUserId,
        listingId: listingId || null,
        postId: postId || null,
        message: message || "Is this still available?",
      });
      res.json(inquiry);
    } catch (error) {
      console.error("Create inquiry error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/inquiries/:id/reply", requireAuth, async (req, res) => {
    try {
      const { reply } = req.body;
      if (!reply) {
        return res.status(400).json({ message: "reply is required" });
      }
      const inquiry = await storage.replyToInquiry(param(req.params.id), reply);
      if (!inquiry) {
        return res.status(404).json({ message: "Inquiry not found" });
      }
      if (inquiry.toUserId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized to reply to this inquiry" });
      }
      res.json(inquiry);
    } catch (error) {
      console.error("Reply to inquiry error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/inquiries/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markInquiryRead(param(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Mark inquiry read error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Recommendations & Discovery routes
  app.get("/api/recommendations/users", requireAuth, async (req, res) => {
    try {
      const recommended = await storage.getRecommendedUsers(req.session.userId!);
      res.json(recommended.map(({ password, ...u }) => u));
    } catch (error) {
      console.error("Get recommendations error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/recommendations/listings", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 6, 12);
      const recommended = await storage.getRecommendedListings(req.session.userId!, limit);
      const wishlistedIds = await storage.getUserLikedListingIds(req.session.userId!);
      res.json(recommended.map(l => ({ ...l, isWishlisted: wishlistedIds.has(l.id) })));
    } catch (error) {
      console.error("Get recommended listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // "For You" — personalised feed combining liked categories, search history, followed users and wishlist signals
  app.get("/api/listings/for-you", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const limit = Math.min(Number(req.query.limit) || 24, 48);

      // Gather signals in parallel
      const [likedRows, searchRows, followingRows, wishlistRows] = await Promise.all([
        db.select({ listingId: listingLikes.listingId }).from(listingLikes).where(eq(listingLikes.userId, userId)).limit(50),
        db.select({ query: searchQueryHistory.query, category: searchQueryHistory.category })
          .from(searchQueryHistory).where(eq(searchQueryHistory.userId, userId)).orderBy(desc(searchQueryHistory.createdAt)).limit(20),
        db.select({ followingId: followers.followingId }).from(followers).where(eq(followers.followerId, userId)),
        db.select({ listingId: wishlists.listingId }).from(wishlists).where(eq(wishlists.userId, userId)).limit(50),
      ]);

      // Collect liked listing categories as signal
      const likedListingIds = likedRows.map(r => r.listingId).concat(wishlistRows.map(r => r.listingId));
      let preferredCategories: string[] = [];
      if (likedListingIds.length > 0) {
        const catRows = await db
          .select({ categories: listings.categories })
          .from(listings)
          .where(inArray(listings.id, likedListingIds.slice(0, 30)));
        preferredCategories = catRows.flatMap(r => (r.categories as string[]) || []);
      }

      // Add search query categories
      searchRows.forEach(r => { if (r.category) preferredCategories.push(r.category); });
      const catFreq = new Map<string, number>();
      preferredCategories.forEach(c => catFreq.set(c, (catFreq.get(c) || 0) + 1));
      const topCats = [...catFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);

      const followedUserIds = followingRows.map(r => r.followingId);
      const excludeIds = new Set([userId]);

      // Build OR conditions: followed users' listings + matching categories + recent searches
      const orConds: any[] = [];
      if (followedUserIds.length > 0) orConds.push(inArray(listings.userId, followedUserIds));
      if (topCats.length > 0) {
        // Match any of the top categories (Postgres array overlap)
        topCats.forEach(cat => orConds.push(sqlOperator`${listings.categories}::text ilike ${'%' + cat + '%'}`));
      }
      // Also bring in listings matching top search queries
      const topQueries = Array.from(new Set(searchRows.map(r => r.query))).slice(0, 3);
      topQueries.forEach(q => {
        orConds.push(ilike(listings.title, `%${q}%`));
        orConds.push(ilike(listings.description, `%${q}%`));
      });

      let forYouListings: any[] = [];
      if (orConds.length > 0) {
        forYouListings = await db
          .select()
          .from(listings)
          .where(and(eq(listings.isActive, true), not(inArray(listings.userId, [...excludeIds])), or(...orConds)))
          .orderBy(desc(listings.createdAt))
          .limit(limit);
      }

      // Fill up to limit with recent active listings if not enough personalised results
      if (forYouListings.length < limit) {
        const existingIds = new Set(forYouListings.map((l: any) => l.id));
        const filler = await db
          .select()
          .from(listings)
          .where(and(eq(listings.isActive, true), not(eq(listings.userId, userId))))
          .orderBy(desc(listings.createdAt))
          .limit(limit - forYouListings.length + 10);
        filler.forEach(l => { if (!existingIds.has(l.id)) forYouListings.push(l); });
        forYouListings = forYouListings.slice(0, limit);
      }

      // Attach wishlist flag
      const wishlistedSet = new Set(wishlistRows.map(r => r.listingId).concat(likedRows.map(r => r.listingId)));
      res.json(forYouListings.map(l => ({ ...l, isWishlisted: wishlistedSet.has(l.id) })));
    } catch (error) {
      console.error("For-you listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/listings/nearby", async (req, res) => {
    try {
      const city = req.query.city as string;
      if (!city) return res.json([]);
      const limit = Math.min(Number(req.query.limit) || 6, 12);
      const excludeUserId = req.session.userId;
      const nearby = await storage.getListingsByCity(city, excludeUserId, limit);
      const wishlistedIds = excludeUserId ? await storage.getUserLikedListingIds(excludeUserId) : new Set<string>();
      res.json(nearby.map(l => ({ ...l, isWishlisted: wishlistedIds.has(l.id) })));
    } catch (error) {
      console.error("Get nearby listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/explore/stats", async (req, res) => {
    try {
      const result = await db
        .select()
        .from(listings)
        .where(eq(listings.isActive, true));

      const categoryMap = new Map<string, number>();
      result.forEach((listing) => {
        const cats = (listing.categories as string[]) || [];
        cats.forEach((cat) => {
          categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        });
      });

      const stats = Array.from(categoryMap.entries()).map(([category, count]) => ({
        category,
        count,
      }));

      res.json(stats);
    } catch (error) {
      console.error("Get explore stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Business License Routes ==========
  // adminKybStatusSchema is defined in shared/schema.ts so the security
  // test suite can assert the whitelist independently of route plumbing.
  app.patch(
    "/api/admin/users/:id/kyb",
    requireAuth,
    requireAdmin,
    makeAdminKybValidator(),
    async (req, res) => {
      try {
        const status = res.locals.kybStatus as string;
        const updated = await storage.updateUser(param(req.params.id), {
          kybStatus: status,
        });
        res.json(updated);
      } catch (error) {
        console.error("KYB update error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // ========== Pause / Unpause Account ==========
  app.patch("/api/admin/users/:id/pause", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { isPaused } = req.body;
      const updated = await storage.updateUser(param(req.params.id), { isPaused: !!isPaused });
      await logAdminAction(req, isPaused ? "user_paused" : "user_unpaused", "user", param(req.params.id));
      res.json(updated);
    } catch (error) {
      console.error("Pause account error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Reports API ==========
  app.post("/api/reports", requireAuth, async (req, res) => {
    try {
      const data = insertReportSchema.parse({
        ...req.body,
        reporterId: req.session.userId,
      });
      const [report] = await db.insert(reports).values(data).returning();
      res.json(report);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create report error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/reports", requireAuth, requireAdmin, async (req, res) => {
    try {
      const allReports = await db.select().from(reports).orderBy(desc(reports.createdAt));
      if (allReports.length === 0) return res.json([]);

      // Batch-enrich: reporter users + target content titles in parallel
      const reporterIds = [...new Set(allReports.map((r) => r.reporterId))];
      const listingIds = allReports.filter((r) => r.targetType === "listing").map((r) => r.targetId);
      const postIds = allReports.filter((r) => r.targetType === "post").map((r) => r.targetId);
      const userIds = allReports.filter((r) => r.targetType === "user").map((r) => r.targetId);

      const [reporterRows, listingRows, postRows, targetUserRows] = await Promise.all([
        reporterIds.length ? db.select({ id: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl }).from(users).where(inArray(users.id, reporterIds)) : [],
        listingIds.length ? db.select({ id: listings.id, title: listings.title }).from(listings).where(inArray(listings.id, listingIds)) : [],
        postIds.length ? db.select({ id: posts.id, caption: posts.caption }).from(posts).where(inArray(posts.id, postIds)) : [],
        userIds.length ? db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds)) : [],
      ]);

      const reporterMap = new Map(reporterRows.map((u) => [u.id, u]));
      const listingMap = new Map(listingRows.map((l) => [l.id, l.title]));
      const postMap = new Map(postRows.map((p) => [p.id, p.caption?.slice(0, 80)]));
      const targetUserMap = new Map(targetUserRows.map((u) => [u.id, u.fullName]));

      const enriched = allReports.map((r) => {
        let targetTitle: string | null = null;
        if (r.targetType === "listing") targetTitle = listingMap.get(r.targetId) ?? null;
        else if (r.targetType === "post") targetTitle = postMap.get(r.targetId) ?? null;
        else if (r.targetType === "user") targetTitle = targetUserMap.get(r.targetId) ?? null;
        return { ...r, reporter: reporterMap.get(r.reporterId) ?? null, targetTitle };
      });

      res.json(enriched);
    } catch (error) {
      console.error("Get reports error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/reports/:id/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      if (!["pending", "dismissed", "actioned"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const reportId = param(req.params.id);
      const [updated] = await db.update(reports)
        .set({ status })
        .where(eq(reports.id, reportId))
        .returning();
      await logAdminAction(req, "report_status_changed", "report", reportId, { status });
      res.json(updated);
    } catch (error) {
      console.error("Update report status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Behavioral Flags ==========
  app.get("/api/admin/behavioral-flags", requireAuth, requireAdmin, async (req, res) => {
    try {
      const dcDisabled = await storage.getAppSetting("data_collection_disabled");
      if (dcDisabled === "true") {
        return res.json({ rapidPosters: [], reportedUsers: [], newAccountsWithDeals: [], dataCollectionDisabled: true });
      }
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Users with >5 listings in last 24h
      const rapidPosters = await db
        .select({ userId: listings.userId, count: count() })
        .from(listings)
        .where(gte(listings.createdAt, twentyFourHoursAgo))
        .groupBy(listings.userId)
        .having(sqlOperator`count(*) > 5`);

      // Users with reports against them (>3 reports)
      const reportedUsers = await db
        .select({ userId: reports.targetId, count: count() })
        .from(reports)
        .where(eq(reports.targetType, "user"))
        .groupBy(reports.targetId)
        .having(sqlOperator`count(*) >= 3`);

      // New accounts (<7 days old) that already have accepted deals
      const newAccountsWithDeals = await db
        .select({ id: users.id, email: users.email, fullName: users.fullName, createdAt: users.createdAt })
        .from(users)
        .where(gte(users.createdAt, sevenDaysAgo));

      res.json({
        rapidPosters: rapidPosters.map(r => ({ userId: r.userId, listingsIn24h: Number(r.count) })),
        reportedUsers: reportedUsers.map(r => ({ userId: r.userId, reportCount: Number(r.count) })),
        newAccountsWithDeals: newAccountsWithDeals.map(u => ({ 
          userId: u.id, email: u.email, fullName: u.fullName, createdAt: u.createdAt 
        })),
      });
    } catch (error) {
      console.error("Behavioral flags error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Inbox (Direct Messaging) ==========
  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const [result] = await db.select({ count: count() }).from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
      res.json({ count: Number(result?.count || 0) });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbox-unread-count", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const [result] = await db.select({ count: count() }).from(quickInquiries)
        .where(and(eq(quickInquiries.toUserId, userId), eq(quickInquiries.isRead, false)));
      res.json({ count: Number(result?.count || 0) });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbox", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const allInquiries = await db.select().from(quickInquiries)
        .where(sqlOperator`(${quickInquiries.fromUserId} = ${userId} OR ${quickInquiries.toUserId} = ${userId})`)
        .orderBy(desc(quickInquiries.createdAt));

      type ConvShape = {
        id: string; otherUserId: string; message: string;
        createdAt: string; unreadCount: number; isRead: boolean;
        fromUserId: string; toUserId: string;
        dealId?: string | null; dealNumber?: string | null;
      };
      const conversations: Record<string, ConvShape> = {};

      for (const inq of allInquiries) {
        const otherUserId = inq.fromUserId === userId ? inq.toUserId : inq.fromUserId;
        if (!conversations[otherUserId]) {
          const unreadCount = allInquiries.filter(
            i => i.fromUserId === otherUserId && i.toUserId === userId && !i.isRead
          ).length;
          conversations[otherUserId] = {
            id: inq.id, otherUserId, message: inq.message,
            createdAt: inq.createdAt instanceof Date ? inq.createdAt.toISOString() : String(inq.createdAt),
            unreadCount, isRead: inq.isRead ?? false,
            fromUserId: inq.fromUserId, toUserId: inq.toUserId,
          };
        }
      }

      // Merge in deal conversations so all communications appear together
      const userDeals = await db.select().from(deals)
        .where(or(eq(deals.seekerId, userId), eq(deals.providerId, userId)))
        .orderBy(desc(deals.updatedAt));

      for (const deal of userDeals) {
        const otherUserId = deal.seekerId === userId ? deal.providerId : deal.seekerId;
        const [latestMsg] = await db.select().from(messages)
          .where(eq(messages.dealId, deal.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);
        if (!latestMsg) continue;

        const [unreadRow] = await db.select({ n: count() }).from(messages)
          .where(and(eq(messages.dealId, deal.id), eq(messages.isRead, false)));
        const dealUnread = Number(unreadRow?.n || 0);
        const msgTime = new Date(latestMsg.createdAt as Date).getTime();
        const existingTime = conversations[otherUserId]
          ? new Date(conversations[otherUserId].createdAt).getTime() : 0;

        if (!conversations[otherUserId] || msgTime > existingTime) {
          conversations[otherUserId] = {
            id: latestMsg.id, otherUserId,
            message: latestMsg.content,
            createdAt: latestMsg.createdAt instanceof Date ? latestMsg.createdAt.toISOString() : String(latestMsg.createdAt),
            unreadCount: (conversations[otherUserId]?.unreadCount || 0) + dealUnread,
            isRead: latestMsg.isRead ?? false,
            fromUserId: latestMsg.senderId, toUserId: otherUserId,
            dealId: deal.id, dealNumber: deal.dealNumber,
          };
        } else {
          conversations[otherUserId].unreadCount += dealUnread;
        }
      }

      // Enrich with user info and sort newest-first
      const enriched = await Promise.all(
        Object.values(conversations).map(async (conv) => {
          const otherUser = await storage.getUser(conv.otherUserId);
          return { ...conv, otherUser: otherUser ? { id: otherUser.id, fullName: otherUser.fullName, avatarUrl: otherUser.avatarUrl, isVerified: otherUser.isVerified, kycStatus: otherUser.kycStatus, kybStatus: otherUser.kybStatus, accountType: otherUser.accountType } : null };
        })
      );
      enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(enriched);
    } catch (error) {
      console.error("Get inbox error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbox/:userId", requireAuth, async (req, res) => {
    try {
      const myId = req.session.userId!;
      const otherId = param(req.params.userId);

      // Fetch DM messages
      const dmThread = await db.select().from(quickInquiries)
        .where(sqlOperator`(
          (${quickInquiries.fromUserId} = ${myId} AND ${quickInquiries.toUserId} = ${otherId}) OR
          (${quickInquiries.fromUserId} = ${otherId} AND ${quickInquiries.toUserId} = ${myId})
        )`)
        .orderBy(quickInquiries.createdAt);

      await db.update(quickInquiries)
        .set({ isRead: true })
        .where(and(eq(quickInquiries.fromUserId, otherId), eq(quickInquiries.toUserId, myId)));

      // Fetch deal messages between these two users
      const sharedDeals = await db.select().from(deals)
        .where(or(
          and(eq(deals.seekerId, myId), eq(deals.providerId, otherId)),
          and(eq(deals.seekerId, otherId), eq(deals.providerId, myId))
        ))
        .orderBy(asc(deals.createdAt));

      type NormalizedMsg = {
        id: string; fromUserId: string; toUserId: string;
        message: string; isRead: boolean; createdAt: string;
        source: "dm" | "deal"; dealId?: string | null; dealNumber?: string | null;
      };

      const dealMsgs: NormalizedMsg[] = [];
      const dealSummaries: { id: string; dealNumber: string; state: string; seekerOffer: string }[] = [];

      for (const deal of sharedDeals) {
        dealSummaries.push({ id: deal.id, dealNumber: deal.dealNumber, state: deal.state, seekerOffer: deal.seekerOffer });
        const msgs = await db.select().from(messages)
          .where(eq(messages.dealId, deal.id))
          .orderBy(asc(messages.createdAt));
        // Mark as read
        await db.update(messages).set({ isRead: true })
          .where(and(eq(messages.dealId, deal.id), eq(messages.isRead, false)));
        for (const m of msgs) {
          dealMsgs.push({
            id: m.id,
            fromUserId: m.senderId,
            toUserId: m.senderId === deal.seekerId ? deal.providerId : deal.seekerId,
            message: m.content,
            isRead: m.isRead ?? false,
            createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
            source: "deal", dealId: deal.id, dealNumber: deal.dealNumber,
          });
        }
      }

      const dmNormalized: NormalizedMsg[] = dmThread.map(m => ({
        id: m.id, fromUserId: m.fromUserId, toUserId: m.toUserId,
        message: m.message, isRead: m.isRead ?? false,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
        source: "dm",
      }));

      const allMessages = [...dmNormalized, ...dealMsgs]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const otherUser = await storage.getUser(otherId);
      res.json({
        messages: allMessages,
        otherUser: otherUser ? { id: otherUser.id, fullName: otherUser.fullName, avatarUrl: otherUser.avatarUrl, isVerified: otherUser.isVerified, kycStatus: otherUser.kycStatus, kybStatus: otherUser.kybStatus, accountType: otherUser.accountType } : null,
        deals: dealSummaries,
      });
    } catch (error) {
      console.error("Get thread error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const inboxMessageSchema = z.object({
    message: z.string().min(1).max(2000),
    listingId: z.string().optional(),
  });

  app.post("/api/inbox/:userId", requireAuth, async (req, res) => {
    try {
      const fromUserId = req.session.userId!;
      const toUserId = param(req.params.userId);

      if (fromUserId === toUserId) {
        return res.status(400).json({ message: "Cannot message yourself" });
      }

      const data = inboxMessageSchema.parse(req.body);
      const [inq] = await db.insert(quickInquiries).values({
        fromUserId,
        toUserId,
        message: data.message,
        listingId: data.listingId || null,
        isRead: false,
      }).returning();

      res.json(inq);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Send inbox message error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Market Average API ==========
  app.get("/api/market-average", async (req, res) => {
    try {
      const { getMarketAverage } = await import("./marketValues");
      const categories = (req.query.categories as string || "").split(",").filter(Boolean);
      const avg = getMarketAverage(categories);
      res.json({ average: avg });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Credibility Score route
  app.get("/api/users/:userId/credibility", async (req, res) => {
    try {
      const userId = param(req.params.userId);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const endorsementCount = await storage.getEndorsementCount(userId);
      const ratings = await storage.getRatingsByUser(userId);
      const ratingAvg = ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length
        : 0;

      const completedDeals = user.totalCompletedDeals || 0;
      const credibilityScore = Math.min(
        100,
        (completedDeals * 10) +
        (user.isVerified ? 20 : 0) +
        (ratingAvg * 8) +
        (endorsementCount * 3)
      );

      res.json({
        credibilityScore: Math.round(credibilityScore),
        completionRate: user.completionRate || "0",
        avgResponseTime: user.avgResponseTime || 0,
        totalCompletedDeals: completedDeals,
        endorsementCount,
        ratingAvg: Math.round(ratingAvg * 100) / 100,
      });
    } catch (error) {
      console.error("Get credibility error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== AI Agent Routes ==========

  // Inline translation endpoint — no auth required (public listings may be viewed by guests)
  app.post("/api/translate", aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const schema = z.object({
        text: z.string().min(1).max(5000),
        targetLang: z.enum(["ar", "en"]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      const { text, targetLang } = parsed.data;
      const langName = targetLang === "ar" ? "Arabic" : "English";
      const { chatCompletion } = await import("./agents/llm");
      const result = await chatCompletion(
        [
          {
            role: "system",
            content: `You are a professional translator. Translate the user text to ${langName}. Rules:\n1. Keep the labels TITLE: and DESCRIPTION: exactly as written in English (do NOT translate them).\n2. Translate only the content that follows each label.\n3. Preserve line breaks and formatting.\n4. Return only the translated text without any preamble or explanation.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
        {
          agentName: "translate",
          maxTokens: 1024,
          temperature: 0.2,
          skipBudgetCheck: true,
          skipAgentBudgetCheck: true,
        }
      );
      const raw = result?.content || "";
      const titleMatch = raw.match(/TITLE:\s*([\s\S]+?)(?:\nDESCRIPTION:|$)/);
      const descMatch = raw.match(/DESCRIPTION:\s*([\s\S]+)/);
      res.json({
        title: titleMatch?.[1]?.trim() ?? null,
        description: descMatch?.[1]?.trim() ?? null,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Translation error:", msg);
      res.status(500).json({ message: `Translation failed: ${msg}` });
    }
  });

  // Support chat
  app.post("/api/ai/support", requireAuth, aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Message is required" });
      }
      const { getSupportResponse } = await import("./agents/supportAgent");
      const conversationHistory = (history || []).map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      }));
      const result = await getSupportResponse(message, conversationHistory, req.session.userId);
      res.json({ response: result.response });
    } catch (error) {
      console.error("AI support error:", error);
      res.status(500).json({ message: "AI support unavailable" });
    }
  });

  // Public quick-ask: lightweight one-shot AI answer for the support widget Home tab.
  // Open to guests + auth users (rate-limited). Does not create a ticket — the widget
  // offers a follow-up "Wasn't helpful? Open a ticket" CTA after the response.
  app.post("/api/support/quick-ask", aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const { message } = req.body ?? {};
      if (!message || typeof message !== "string" || message.trim().length < 3) {
        return res.status(400).json({ message: "Message is required (min 3 chars)" });
      }
      if (message.length > 1000) {
        return res.status(400).json({ message: "Message too long (max 1000 chars)" });
      }
      const { getSupportResponse } = await import("./agents/supportAgent");
      const result = await getSupportResponse(
        message.trim(),
        [],
        req.session?.userId,
      );
      res.json({ response: result.response });
    } catch (error) {
      console.error("Quick-ask error:", error);
      res.status(500).json({ message: "Quick-ask unavailable" });
    }
  });

  // Valuation advice
  app.post("/api/ai/valuation", requireAuth, aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const { title, description, category, condition, imageUrls } = req.body;
      if (!title || !description) {
        return res.status(400).json({ message: "Title and description are required" });
      }
      // Resolve image URLs — accept both absolute https:// URLs (production/GCS)
      // and relative /uploads/... paths (local dev). Convert relative paths to
      // absolute using the server's own base URL so the valuation agent can
      // fetch them via HTTP and convert to base64 for OpenAI Vision.
      const port = process.env.PORT || "5000";
      const selfBase = process.env.APP_BASE_URL || `http://localhost:${port}`;
      const sanitizedImageUrls = Array.isArray(imageUrls)
        ? imageUrls
            .filter((u: unknown) => typeof u === "string" && (u as string).length > 0)
            .map((u: string) => u.startsWith("/") ? `${selfBase}${u}` : u)
            .filter((u: string) => u.startsWith("http"))
            .slice(0, 4)
        : undefined;
      const { getValuation } = await import("./agents/valuationAgent");
      const sessionUser = req.session.userId ? await storage.getUser(req.session.userId) : null;
      const advice = await getValuation(
        title, description, category, condition,
        req.session.userId,
        { country: sessionUser?.country, city: sessionUser?.city },
        sanitizedImageUrls,
      );
      res.json(advice);
    } catch (error) {
      console.error("Bareter Value error:", error);
      res.status(500).json({ message: "Bareter Value service unavailable" });
    }
  });

  // ── Match compatibility score ─────────────────────────────────────────
  // Given two listing IDs, compare their persisted AI valuations and
  // return a 0–100 fairness score with a human label and a "balance
  // this with N AED" suggestion. Cheap, deterministic, no LLM call —
  // safe to expose on any authenticated surface.
  //
  // GET /api/listings/match-score?a=<listingId>&b=<listingId>
  app.get("/api/listings/match-score", requireAuth, async (req, res) => {
    try {
      const aId = typeof req.query.a === "string" ? req.query.a : "";
      const bId = typeof req.query.b === "string" ? req.query.b : "";
      if (!aId || !bId) {
        return res.status(400).json({ message: "Both ?a and ?b listing IDs are required" });
      }
      if (aId === bId) {
        return res.status(400).json({ message: "Cannot compare a listing with itself" });
      }
      const [a, b] = await Promise.all([
        storage.getListing(aId),
        storage.getListing(bId),
      ]);
      if (!a || !b) {
        return res.status(404).json({ message: "One or both listings not found" });
      }
      const aMin = a.valuationMinAed;
      const aMax = a.valuationMaxAed;
      const bMin = b.valuationMinAed;
      const bMax = b.valuationMaxAed;
      if (aMin == null || aMax == null || bMin == null || bMax == null) {
        return res.status(409).json({
          message: "One or both listings have no AI valuation yet",
          missing: {
            a: aMin == null || aMax == null,
            b: bMin == null || bMax == null,
          },
        });
      }
      const avgA = (aMin + aMax) / 2;
      const avgB = (bMin + bMax) / 2;
      const higher = Math.max(avgA, avgB);
      const lower = Math.min(avgA, avgB);
      const pctDiff = higher > 0 ? ((higher - lower) / higher) * 100 : 0;
      const score = Math.max(0, Math.min(100, Math.round(100 - pctDiff)));
      const aedDifference = Math.round(higher - lower);

      let label: "excellent" | "good" | "fair" | "poor";
      let message: string;
      let suggestion: string | null = null;
      if (score >= 85) {
        label = "excellent";
        message = "These items are very closely matched in value. A fair exchange for both parties.";
      } else if (score >= 70) {
        label = "good";
        message = "These items are well matched. A reasonable exchange.";
      } else if (score >= 50) {
        label = "fair";
        message = "There is a noticeable value difference between these items.";
        suggestion = `Consider adding an item worth approximately AED ${aedDifference.toLocaleString()} to balance this exchange.`;
      } else {
        label = "poor";
        message = "These items have a significant value difference.";
        suggestion = `The value gap is approximately AED ${aedDifference.toLocaleString()}. A direct exchange may not be fair for both parties.`;
      }

      return res.json({
        score,
        label,
        message,
        suggestion,
        aedDifference,
        currency: "AED",
        a: { id: a.id, title: a.title, min: aMin, max: aMax, avg: Math.round(avgA) },
        b: { id: b.id, title: b.title, min: bMin, max: bMax, avg: Math.round(avgB) },
      });
    } catch (error) {
      console.error("Match score error:", error);
      res.status(500).json({ message: "Match score unavailable" });
    }
  });

  // Smart matching
  app.get("/api/ai/matches", requireAuth, aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const aiMatchingEnabled = await storage.getAppSetting("ai_matching_enabled");
      if (aiMatchingEnabled === "false") {
        return res.status(403).json({ message: "AI matching is currently disabled." });
      }
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      const allListings = await storage.getListings();
      const worldwide = req.query.worldwide === "true";
      const overrideCountry = (req.query.country as string | undefined)?.toUpperCase();
      const overrideCity = req.query.city as string | undefined;
      const userCountry = worldwide
        ? ""
        : (overrideCountry || user.country || "").toUpperCase();
      const userCity = worldwide ? "" : (overrideCity || user.city || "");
      const otherListings = allListings
        .filter((l) => l.userId !== user.id && l.isActive)
        .filter((l) => !userCountry || (l.country || "").toUpperCase() === userCountry)
        .filter((l) => !userCity || (l.city || "") === userCity)
        .map((l) => ({
          id: l.id,
          title: l.title,
          description: l.description,
          categories: l.categories,
          retailValue: l.retailValue,
          location: l.location,
          country: l.country,
          city: l.city,
          type: l.type,
          wantedCategories: l.wantedCategories,
        }));
      const { findMatches } = await import("./agents/matchingAgent");
      const matches = await findMatches(user, otherListings);
      const enriched = await Promise.all(
        matches.map(async (m) => {
          const listing = allListings.find((l) => l.id === m.listingId);
          return { ...m, listing: listing || null };
        })
      );
      res.json(enriched);
    } catch (error) {
      console.error("AI matching error:", error);
      res.status(500).json({ message: "Matching service unavailable" });
    }
  });

  // Engagement suggestions
  app.get("/api/ai/engagement", requireAuth, aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      const userPosts = await storage.getPosts({ userId: user.id, limit: 10 });
      const userDeals = await storage.getDealsByUser(user.id);
      const { getEngagementSuggestions } = await import("./agents/engagementAgent");
      const suggestions = await getEngagementSuggestions(user, {
        postsCount: userPosts.length,
        dealsCount: userDeals.length,
        lastActive: user.lastActiveAt || undefined,
      });
      res.json(suggestions);
    } catch (error) {
      console.error("AI engagement error:", error);
      res.status(500).json({ message: "Engagement service unavailable" });
    }
  });

  // Admin insights
  app.get("/api/ai/admin/insights", requireAdmin, aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allListings = await storage.getListings();
      const allDeals = await storage.getAllDeals();
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { getAdminInsights } = await import("./agents/adminAgent");
      const insights = await getAdminInsights({
        totalUsers: allUsers.length,
        activeUsers: allUsers.filter((u) => u.lastActiveAt && new Date(u.lastActiveAt) > oneWeekAgo).length,
        totalListings: allListings.length,
        totalDeals: allDeals.length,
        completedDeals: allDeals.filter((d) => d.state === "completed").length,
        pendingReports: 0,
        flaggedListings: allListings.filter((l) => l.valueFlagged || l.imageFlagged).length,
        recentSignups: allUsers.filter((u) => u.createdAt && new Date(u.createdAt) > oneWeekAgo).length,
      }, req.session.userId);
      res.json(insights);
    } catch (error) {
      console.error("AI admin insights error:", error);
      res.status(500).json({ message: "Admin intelligence unavailable" });
    }
  });

  // Admin ask agent
  app.post("/api/ai/admin/ask", requireAdmin, aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const { question } = req.body;
      if (!question) return res.status(400).json({ message: "Question is required" });
      const allUsers = await storage.getAllUsers();
      const allDeals = await storage.getAllDeals();
      const context = `Platform: ${allUsers.length} users, ${allDeals.length} deals, ${allDeals.filter(d => d.state === "completed").length} completed`;
      const { askAdminAgent } = await import("./agents/adminAgent");
      const result = await askAdminAgent(question, context, req.session.userId);
      res.json({ response: result.response });
    } catch (error) {
      console.error("AI admin ask error:", error);
      res.status(500).json({ message: "Admin agent unavailable" });
    }
  });

  // AI dispute resolution suggestion
  app.post("/api/ai/admin/dispute-suggest", requireAdmin, aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const { disputeId } = req.body;
      if (!disputeId) return res.status(400).json({ message: "disputeId is required" });
      const dispute = await storage.getDispute(disputeId);
      if (!dispute) return res.status(404).json({ message: "Dispute not found" });
      const { getDisputeResolution } = await import("./agents/adminAgent");
      const suggestion = await getDisputeResolution(
        {
          subject: dispute.subject,
          description: dispute.description,
          partyAName: dispute.partyA?.fullName || "Party A",
          partyBName: dispute.partyB?.fullName || "Party B",
          evidence: dispute.evidence || [],
          status: dispute.status,
        },
        req.session.userId,
      );
      res.json(suggestion);
    } catch (error) {
      console.error("AI dispute suggest error:", error);
      res.status(500).json({ message: "AI suggestion unavailable" });
    }
  });

  // AI Logs for admin
  app.get("/api/ai/logs", requireAdmin, aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const { moderationLogs, agentInteractions } = await import("@shared/schema");
      const modLogs = await db
        .select()
        .from(moderationLogs)
        .orderBy(desc(moderationLogs.createdAt))
        .limit(50);
      const interactions = await db
        .select()
        .from(agentInteractions)
        .orderBy(desc(agentInteractions.createdAt))
        .limit(50);
      res.json({ moderationLogs: modLogs, agentInteractions: interactions });
    } catch (error) {
      console.error("AI logs error:", error);
      res.status(500).json({ message: "Failed to fetch AI logs" });
    }
  });

  registerWaitlistRoutes(app, requireAdmin);

  // ── Feature interest waitlists (Creators Hub / Brand Collabs) ─────────
  app.post("/api/feature-waitlist", async (req, res) => {
    try {
      const { email, feature } = req.body as { email?: string; feature?: string };
      if (!email || !["creators", "brand-collabs"].includes(feature ?? "")) {
        return res.status(400).json({ message: "Invalid request" });
      }
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      await db.insert(featureWaitlists).values({ email: email.trim().toLowerCase(), feature: feature! }).onConflictDoNothing();
      import("./emailService").then(({ sendFeatureWaitlistEmail }) =>
        sendFeatureWaitlistEmail(email.trim(), feature as "creators" | "brand-collabs", baseUrl).catch(console.error)
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error("[feature-waitlist] error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/feature-waitlist", requireAdmin, async (req, res) => {
    try {
      const rows = await db.select().from(featureWaitlists).orderBy(featureWaitlists.createdAt);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── Legal pages: public read + admin CRUD ──────────────────────────────
  const LEGAL_BLOCK_SCHEMA = z.discriminatedUnion("type", [
    z.object({ type: z.literal("h2"), text: z.string() }),
    z.object({ type: z.literal("h3"), text: z.string() }),
    z.object({ type: z.literal("p"), text: z.string() }),
    z.object({ type: z.literal("ul"), items: z.array(z.string()) }),
  ]);
  const LEGAL_UPSERT_SCHEMA = z.object({
    title: z.string().min(1),
    subtitle: z.string().default(""),
    effectiveDate: z.string().min(1),
    blocks: z.array(LEGAL_BLOCK_SCHEMA).min(1),
  });
  const LEGAL_ENTITY_LINE = "Bareter FZ-LLC | www.bareter.com";

  function pickLanguage(req: Request): "en" | "ar" {
    const raw = String((req.query.lang ?? req.query.language ?? "en")).toLowerCase();
    return raw === "ar" ? "ar" : "en";
  }

  // Public list — used by the LegalDocPage cross-link section and any
  // future "browse our legal pack" surface.
  app.get("/api/legal", async (req, res) => {
    try {
      const language = pickLanguage(req);
      const all = await storage.getLegalPages(language);
      const fallback =
        all.length === 0 && language !== "en"
          ? await storage.getLegalPages("en")
          : [];
      const rows = all.length > 0 ? all : fallback;
      res.json({
        language,
        entityLine: LEGAL_ENTITY_LINE,
        index: rows.map((p) => ({
          slug: p.slug,
          title: p.title,
          subtitle: p.subtitle,
          effectiveDate: p.effectiveDate,
          version: p.version,
        })),
      });
    } catch (error) {
      console.error("Legal list error:", error);
      res.status(500).json({ message: "Failed to load legal pages" });
    }
  });

  // Public single doc — falls back to English when the requested
  // language doesn't have a published version yet.
  app.get("/api/legal/:slug", async (req, res) => {
    try {
      const language = pickLanguage(req);
      const slug = req.params.slug;
      let doc = await storage.getLegalPage(slug, language);
      let usedFallback = false;
      if (!doc && language !== "en") {
        doc = await storage.getLegalPage(slug, "en");
        usedFallback = true;
      }
      if (!doc) return res.status(404).json({ message: "Document not found" });
      res.json({
        slug: doc.slug,
        language: doc.language,
        title: doc.title,
        subtitle: doc.subtitle,
        blocks: doc.blocks,
        effectiveDate: doc.effectiveDate,
        entityLine: LEGAL_ENTITY_LINE,
        version: doc.version,
        updatedAt: doc.updatedAt,
        usedFallback,
      });
    } catch (error) {
      console.error("Legal get error:", error);
      res.status(500).json({ message: "Failed to load legal page" });
    }
  });

  // Admin: list every (slug, language) combo with metadata for the editor.
  app.get("/api/admin/legal", requireAdmin, async (_req, res) => {
    try {
      const all = await storage.getLegalPages();
      res.json(
        all
          .map((p) => ({
            slug: p.slug,
            language: p.language,
            title: p.title,
            subtitle: p.subtitle,
            effectiveDate: p.effectiveDate,
            version: p.version,
            updatedAt: p.updatedAt,
            updatedBy: p.updatedBy,
          }))
          .sort((a, b) =>
            a.slug.localeCompare(b.slug) || a.language.localeCompare(b.language),
          ),
      );
    } catch (error) {
      console.error("Admin legal list error:", error);
      res.status(500).json({ message: "Failed to load legal pages" });
    }
  });

  // Admin: get a single (slug, language) row for editing.
  app.get("/api/admin/legal/:slug/:language", requireAdmin, async (req, res) => {
    const lang = req.params.language === "ar" ? "ar" : "en";
    const doc = await storage.getLegalPage(req.params.slug, lang);
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  });

  // Admin: publish a new version of a (slug, language) row. The previous
  // live row is snapshotted into `legal_page_versions` for audit.
  app.put("/api/admin/legal/:slug/:language", requireAdmin, async (req, res) => {
    try {
      const lang = req.params.language === "ar" ? "ar" : "en";
      const parsed = LEGAL_UPSERT_SCHEMA.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "Invalid payload", errors: parsed.error.flatten() });
      }
      const row = await storage.upsertLegalPage(
        {
          slug: req.params.slug,
          language: lang,
          title: parsed.data.title,
          subtitle: parsed.data.subtitle,
          blocks: parsed.data.blocks,
          effectiveDate: parsed.data.effectiveDate,
          version: 1,
          updatedBy: req.session.userId ?? null,
        },
        req.session.userId ?? null,
      );
      await logAdminAction(req, "legal_page_updated", "legal_page", row.id, { slug: req.params.slug, language: lang, title: parsed.data.title });
      res.json(row);
    } catch (error) {
      console.error("Admin legal upsert error:", error);
      res.status(500).json({ message: "Failed to publish legal page" });
    }
  });

  // Admin: list audit history for a (slug, language) row.
  app.get(
    "/api/admin/legal/:slug/:language/versions",
    requireAdmin,
    async (req, res) => {
      const lang = req.params.language === "ar" ? "ar" : "en";
      const versions = await storage.getLegalPageVersions(req.params.slug, lang);
      res.json(versions);
    },
  );

  // ========== Support Ticket Routes ==========

  // Create a new ticket (user)
  // Helper: check if current session can access a support ticket.
  // Auth users must own the ticket; guests must have the ticket ID tracked in their session
  // (placed there either at creation time or after a verified resume via /resume endpoint).
  function canAccessTicket(ticket: { id: string; userId: string | null }, req: Request): boolean {
    if (req.session.userId && ticket.userId === req.session.userId) return true;
    if (Array.isArray(req.session.guestTicketIds) && req.session.guestTicketIds.includes(ticket.id)) return true;
    return false;
  }

  app.post("/api/support/tickets", supportTicketLimiter, async (req, res) => {
    try {
      const { subject, category, message, requesterName, requesterEmail } = req.body;
      if (!subject || !message) {
        return res.status(400).json({ message: "Subject and message are required" });
      }

      const userId = req.session.userId ?? null;
      let user = userId ? await storage.getUser(userId) : null;

      // Guests must supply name + email
      if (!userId) {
        if (!requesterName || !requesterEmail) {
          return res.status(400).json({ message: "Name and email are required for guest tickets" });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(requesterEmail)) {
          return res.status(400).json({ message: "Valid email is required" });
        }
      }

      const contactEmail = user?.email ?? requesterEmail;
      const contactName = user?.fullName ?? requesterName;

      const ticket = await storage.createSupportTicket({
        userId,
        requesterName: !userId ? String(requesterName).trim().slice(0, 100) : null,
        requesterEmail: !userId ? String(requesterEmail).trim().toLowerCase() : null,
        subject: String(subject).trim().slice(0, 200),
        category: category || "other",
        priority: "normal",
        status: "open",
      });

      // Track guest ticket in session (by ID and email for cross-session lookup)
      if (!userId) {
        if (!Array.isArray(req.session.guestTicketIds)) req.session.guestTicketIds = [];
        req.session.guestTicketIds.push(ticket.id);
        req.session.guestEmail = String(requesterEmail).trim().toLowerCase();
      }

      // First message from user
      await storage.createSupportMessage({
        ticketId: ticket.id,
        senderId: userId,
        senderType: "user",
        content: String(message).trim(),
        isInternal: false,
      });

      // AI auto-response — build context (FAQ + help always; user deals/listings when authenticated)
      try {
        const { getSupportResponse } = await import("./agents/supportAgent");
        let aiContext: import("./agents/supportAgent").SupportUserContext | undefined;
        try {
          const [faqSetting, helpSetting] = await Promise.all([
            storage.getAppSetting("cms_faq"),
            storage.getAppSetting("cms_help"),
          ]);
          aiContext = { faqContent: faqSetting ?? undefined, helpContent: helpSetting ?? undefined };
          // Pull Notion KB articles if configured
          try {
            const { fetchNotionKBArticles } = await import("./integrations/notion");
            const kbArticles = await fetchNotionKBArticles(5);
            if (kbArticles.length) {
              aiContext.notionKbContent = kbArticles.map(a => `**${a.title}**\n${a.content}`).join("\n\n").slice(0, 3000);
            }
          } catch { /* Notion context is non-fatal */ }
          if (userId) {
            const [deals, listings] = await Promise.all([
              storage.getDealsByUser(userId),
              storage.getListingsByUser(userId),
            ]);
            aiContext.recentDeals = deals.slice(0, 5).map(d => ({ id: d.id, status: d.status, createdAt: String(d.createdAt) }));
            aiContext.activeListings = listings.slice(0, 5).map(l => ({ id: l.id, title: l.title, category: l.category }));
          }
        } catch { /* context errors are non-fatal */ }

        const aiResult = await getSupportResponse(
          `New support ticket: ${subject}\n\n${message}`,
          [],
          userId ?? undefined,
          aiContext,
        );
        await storage.createSupportMessage({
          ticketId: ticket.id,
          senderId: null,
          senderType: "ai",
          content: aiResult.response,
          isInternal: false,
        });
        await storage.updateSupportTicket(ticket.id, { aiHandled: true });
      } catch (aiErr) {
        console.error("AI support auto-reply failed:", aiErr);
      }

      // Send confirmation email
      if (contactEmail) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        try {
          const { sendSupportTicketConfirmationEmail } = await import("./emailService");
          await sendSupportTicketConfirmationEmail(contactEmail, {
            recipientName: contactName,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            baseUrl,
          });
        } catch (emailErr) {
          console.error("Support ticket confirmation email failed:", emailErr);
        }
      }

      res.status(201).json(ticket);
    } catch (error) {
      console.error("Create support ticket error:", error);
      res.status(500).json({ message: "Failed to create support ticket" });
    }
  });

  // Get user's own tickets (auth) or guest's session-tracked tickets
  app.get("/api/support/tickets", async (req, res) => {
    try {
      if (req.session.userId) {
        const tickets = await storage.getSupportTicketsByUser(req.session.userId);
        return res.json(tickets);
      }
      // Guests: only return tickets tracked in this session (placed there at creation or after verified resume)
      const guestIds = Array.isArray(req.session.guestTicketIds) ? req.session.guestTicketIds : [];
      if (!guestIds.length) return res.json([]);
      const tickets = await storage.getSupportTicketsByIds(guestIds);
      return res.json(tickets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  // Secure cross-session guest ticket resume: requires BOTH email AND ticketNumber.
  // Since ticketNumber is cryptographically random and sent only to the inbox, providing
  // both proves email ownership. On success, ALL tickets for that email are loaded into
  // the session so guests see their full history.
  app.post("/api/support/tickets/resume", async (req, res) => {
    try {
      const { email, ticketNumber } = req.body;
      if (!email || !ticketNumber) {
        return res.status(400).json({ message: "Email and ticket number are required" });
      }
      const normalEmail = String(email).trim().toLowerCase();
      const normalNumber = String(ticketNumber).trim().toUpperCase();
      const ticket = await storage.getSupportTicketByNumber(normalNumber);
      if (!ticket || ticket.requesterEmail !== normalEmail) {
        // Constant-time 404 — prevents email/ticket enumeration
        return res.status(404).json({ message: "Ticket not found or email does not match" });
      }
      // Verified: load ALL guest tickets for this email into session
      const allTickets = await storage.getSupportTicketsByEmail(normalEmail);
      if (!Array.isArray(req.session.guestTicketIds)) req.session.guestTicketIds = [];
      for (const t of allTickets) {
        if (!req.session.guestTicketIds.includes(t.id)) {
          req.session.guestTicketIds.push(t.id);
        }
      }
      res.json({ ticketCount: allTickets.length, ticketNumber: ticket.ticketNumber });
    } catch (error) {
      console.error("Ticket resume error:", error);
      res.status(500).json({ message: "Failed to resume ticket" });
    }
  });

  // Get a specific ticket
  app.get("/api/support/tickets/:id", async (req, res) => {
    try {
      const ticket = await storage.getSupportTicket(param(req.params.id));
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!canAccessTicket(ticket, req)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(ticket);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ticket" });
    }
  });

  // Get messages for a ticket
  app.get("/api/support/tickets/:id/messages", async (req, res) => {
    try {
      const ticket = await storage.getSupportTicket(param(req.params.id));
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!canAccessTicket(ticket, req)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const messages = await storage.getSupportMessages(ticket.id, false);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Reply to a ticket (auth user or guest with session)
  app.post("/api/support/tickets/:id/messages", async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ message: "Content is required" });

      const ticket = await storage.getSupportTicket(param(req.params.id));
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!canAccessTicket(ticket, req)) return res.status(403).json({ message: "Forbidden" });
      if (ticket.status === "closed") {
        return res.status(400).json({ message: "Ticket is closed" });
      }

      const senderId = req.session.userId ?? null;
      const trimmedContent = String(content).trim();
      const msg = await storage.createSupportMessage({
        ticketId: ticket.id,
        senderId,
        senderType: "user",
        content: trimmedContent,
        isInternal: false,
      });

      // Re-open if waiting
      if (ticket.status === "waiting_user") {
        await storage.updateSupportTicket(ticket.id, { status: "in_progress" });
      }

      // Phrase-based escalation: detect intent to speak with a human
      const ESCALATION_PHRASES = [
        /speak\s+to\s+(a\s+)?(human|person|agent|someone|staff|rep)/i,
        /talk\s+to\s+(a\s+)?(human|person|agent|someone|real)/i,
        /connect\s+me\s+(with|to)\s+(a\s+)?(human|person|agent)/i,
        /real\s+(human|person|agent|support)/i,
        /human\s+(support|agent|help)/i,
        /escalate/i,
        /not\s+helpful|not\s+helping|doesn'?t\s+help/i,
      ];
      const wantsHuman = ESCALATION_PHRASES.some(re => re.test(trimmedContent));
      if (wantsHuman && ticket.aiHandled && ticket.status !== "closed") {
        await storage.updateSupportTicket(ticket.id, {
          status: "open",
          priority: "high",
          aiHandled: false,
          escalatedAt: new Date(),
        });
        await storage.createSupportMessage({
          ticketId: ticket.id,
          senderId: null,
          senderType: "ai",
          content: "I've escalated your request to our human support team. Someone will review your ticket and get back to you as soon as possible.",
          isInternal: false,
        });
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const founderEmail = process.env.FOUNDER_EMAIL;
        if (founderEmail) {
          try {
            const userName = ticket.user?.fullName ?? ticket.requesterName ?? "Unknown";
            const userEmail = ticket.user?.email ?? ticket.requesterEmail ?? "Unknown";
            const transcriptMsgs = await storage.getSupportMessages(ticket.id, false);
            const transcript = transcriptMsgs.slice(-10).map(m => ({ senderType: m.senderType, content: m.content }));
            const { sendSupportEscalationEmail } = await import("./emailService");
            await sendSupportEscalationEmail(founderEmail, { ticketNumber: ticket.ticketNumber, subject: ticket.subject, userName, userEmail, baseUrl, transcript });
          } catch (emailErr) {
            console.error("Phrase-escalation email failed:", emailErr);
          }
        }
        return res.status(201).json(msg);
      }

      // AI continues if ticket is still AI-handled
      if (ticket.aiHandled && ticket.status !== "in_progress") {
        try {
          const prevMessages = await storage.getSupportMessages(ticket.id, false);
          const history = prevMessages.slice(-8).map((m) => ({
            role: (m.senderType === "user" ? "user" : "assistant") as "user" | "assistant",
            content: m.content,
          }));
          const { getSupportResponse } = await import("./agents/supportAgent");
          // Always include FAQ + help content for grounding; add user deals/listings when authenticated
          let userContext: Parameters<typeof getSupportResponse>[3] | undefined;
          try {
            const [faqSetting, helpSetting] = await Promise.all([
              storage.getAppSetting("cms_faq"),
              storage.getAppSetting("cms_help"),
            ]);
            userContext = { faqContent: faqSetting ?? undefined, helpContent: helpSetting ?? undefined };
            // Pull Notion KB articles if configured
            try {
              const { fetchNotionKBArticles } = await import("./integrations/notion");
              const kbArticles = await fetchNotionKBArticles(5);
              if (kbArticles.length) {
                userContext.notionKbContent = kbArticles.map(a => `**${a.title}**\n${a.content}`).join("\n\n").slice(0, 3000);
              }
            } catch { /* non-fatal */ }
            if (senderId) {
              const [deals, listings] = await Promise.all([
                storage.getDealsByUser(senderId),
                storage.getListingsByUser(senderId),
              ]);
              userContext.recentDeals = deals.slice(0, 5).map(d => ({ id: d.id, status: d.status, createdAt: String(d.createdAt) }));
              userContext.activeListings = listings.slice(0, 5).map(l => ({ id: l.id, title: l.title, category: l.category }));
            }
          } catch { /* ignore context errors */ }
          const aiResult = await getSupportResponse(trimmedContent, history, senderId ?? undefined, userContext);
          await storage.createSupportMessage({
            ticketId: ticket.id,
            senderId: null,
            senderType: "ai",
            content: aiResult.response,
            isInternal: false,
          });
        } catch (aiErr) {
          console.error("AI follow-up failed:", aiErr);
        }
      }

      res.status(201).json(msg);
    } catch (error) {
      console.error("Reply to ticket error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ========== Admin Integration Credential Routes ==========
  const INTEGRATION_SERVICES: Record<string, string[]> = {
    notion: ["notion_token", "notion_database_id"],
    slack: ["slack_webhook_url"],
    google: ["google_client_id", "google_client_secret", "google_access_token", "google_refresh_token", "google_drive_folder_id"],
  };

  app.get("/api/admin/integrations", requireAdmin, async (req, res) => {
    try {
      const { getIntegrationCredential } = await import("./integrations/credentials");
      const statuses = await Promise.all(
        Object.entries(INTEGRATION_SERVICES).map(async ([service, fields]) => {
          const results = await Promise.all(fields.map(f => getIntegrationCredential(f)));
          const configured = results.some(v => !!v);
          const configuredAtRow = await storage.getAppSetting(`integration_cred_${fields[0]}`);
          return {
            service,
            configured,
            configuredAt: configuredAtRow ? new Date().toISOString() : null,
            fields: fields.map(f => ({ key: f, label: f, placeholder: "", sensitive: f.includes("token") || f.includes("secret") || f.includes("webhook") || f.includes("access") })),
          };
        })
      );
      res.json(statuses);
    } catch (error) {
      console.error("Get integrations error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/integrations/:service", requireAdmin, async (req, res) => {
    try {
      const service = req.params.service as string;
      if (!INTEGRATION_SERVICES[service]) return res.status(400).json({ message: "Unknown service" });
      const fields = req.body.fields as Record<string, string>;
      if (!fields || typeof fields !== "object") return res.status(400).json({ message: "fields required" });
      const { setIntegrationCredential } = await import("./integrations/credentials");
      for (const [key, value] of Object.entries(fields)) {
        if (value && typeof value === "string" && value.trim()) {
          if (!INTEGRATION_SERVICES[service].includes(key)) continue;
          await setIntegrationCredential(key, value.trim(), req.session.userId);
        }
      }
      await logAdminAction(req, "integration_configured", "platform", service, { service });
      res.json({ success: true });
    } catch (error) {
      console.error("Set integration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/integrations/:service", requireAdmin, async (req, res) => {
    try {
      const service = req.params.service as string;
      if (!INTEGRATION_SERVICES[service]) return res.status(400).json({ message: "Unknown service" });
      const fields = INTEGRATION_SERVICES[service];
      for (const field of fields) {
        await storage.setAppSetting(`integration_cred_${field}`, "", req.session.userId);
      }
      await logAdminAction(req, "integration_disconnected", "platform", service, { service });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete integration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/sanity-members", requireAdmin, async (_req, res) => {
    try {
      const projectId = process.env.SANITY_PROJECT_ID ?? "ho605hmx";
      const token = process.env.SANITY_API_TOKEN;
      if (!token) {
        return res.status(503).json({ message: "SANITY_API_TOKEN is not configured" });
      }
      const response = await fetch(
        `https://api.sanity.io/v2021-06-07/projects/${projectId}/members`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        const text = await response.text();
        console.error("[sanity-members] API error:", response.status, text);
        return res.status(502).json({ message: `Sanity API returned ${response.status}` });
      }
      const members = await response.json();
      res.json({ projectId, members });
    } catch (error) {
      console.error("[sanity-members] Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Escalate a ticket (auth user or guest)
  app.post("/api/support/tickets/:id/escalate", async (req, res) => {
    try {
      const ticket = await storage.getSupportTicket(param(req.params.id));
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!canAccessTicket(ticket, req)) return res.status(403).json({ message: "Forbidden" });

      await storage.updateSupportTicket(ticket.id, {
        status: "open",
        priority: "high",
        aiHandled: false,
        escalatedAt: new Date(),
      });

      await storage.createSupportMessage({
        ticketId: ticket.id,
        senderId: null,
        senderType: "ai",
        content: "Your request has been escalated to our human support team. A member of our team will review your ticket and respond as soon as possible.",
        isInternal: false,
      });

      // Email admin with conversation transcript
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const founderEmail = process.env.FOUNDER_EMAIL;
      if (founderEmail) {
        try {
          const userName = ticket.user?.fullName ?? ticket.requesterName ?? "Unknown";
          const userEmail = ticket.user?.email ?? ticket.requesterEmail ?? "Unknown";
          const transcriptMsgs = await storage.getSupportMessages(ticket.id, false);
          const transcript = transcriptMsgs.slice(-10).map(m => ({
            senderType: m.senderType,
            content: m.content,
          }));
          const { sendSupportEscalationEmail } = await import("./emailService");
          await sendSupportEscalationEmail(founderEmail, {
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            userName,
            userEmail,
            baseUrl,
            transcript,
          });
        } catch (emailErr) {
          console.error("Escalation email failed:", emailErr);
        }
      }

      // Post to Slack if configured
      try {
        const userName = ticket.user?.fullName ?? ticket.requesterName ?? "Unknown";
        const userEmail = ticket.user?.email ?? ticket.requesterEmail ?? "Unknown";
        const { postSlackSupportEscalation } = await import("./integrations/slack");
        await postSlackSupportEscalation({ ticketNumber: ticket.ticketNumber, subject: ticket.subject, userName, userEmail });
      } catch { /* non-fatal */ }

      res.json({ success: true });
    } catch (error) {
      console.error("Escalate ticket error:", error);
      res.status(500).json({ message: "Failed to escalate ticket" });
    }
  });

  // Close a ticket (auth user or guest) — sends transcript summary email to requester
  app.post("/api/support/tickets/:id/close", async (req, res) => {
    try {
      const ticket = await storage.getSupportTicket(param(req.params.id));
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!canAccessTicket(ticket, req)) return res.status(403).json({ message: "Forbidden" });
      await storage.updateSupportTicket(ticket.id, { status: "closed", closedAt: new Date() });

      // Send closure email with transcript
      const toEmail = ticket.user?.email ?? ticket.requesterEmail;
      const recipientName = ticket.user?.fullName ?? ticket.requesterName;
      if (toEmail) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        try {
          const transcriptMsgs = await storage.getSupportMessages(ticket.id, false);
          const transcript = transcriptMsgs.map(m => ({
            senderType: m.senderType,
            senderName: m.senderType === "user"
              ? (ticket.user?.fullName ?? ticket.requesterName ?? "You")
              : m.senderType === "ai" ? "BarterBot" : (m.sender?.fullName ?? "Support Agent"),
            content: m.content,
          }));
          const { sendTicketClosedEmail } = await import("./emailService");
          await sendTicketClosedEmail(toEmail, {
            recipientName,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            baseUrl,
            transcript,
          });
        } catch (emailErr) {
          console.error("User close email failed:", emailErr);
        }
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to close ticket" });
    }
  });

  // ========== Admin Support Ticket Routes ==========

  // Get all tickets (admin)
  // ── Admin: Reviews ────────────────────────────────────────────────────────
  app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { reviews, users } = await import("@shared/schema");
      const { desc, eq } = await import("drizzle-orm");
      const rows = await db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          comment: reviews.comment,
          tags: reviews.tags,
          createdAt: reviews.createdAt,
          listingId: reviews.listingId,
          reviewerId: reviews.reviewerId,
          revieweeId: reviews.revieweeId,
        })
        .from(reviews)
        .orderBy(desc(reviews.createdAt))
        .limit(200);

      // Attach reviewer + reviewee names
      const userIds = [...new Set([...rows.map(r => r.reviewerId), ...rows.map(r => r.revieweeId)])];
      const userMap = new Map<string, { id: string; fullName: string; avatarUrl: string | null }>();
      if (userIds.length > 0) {
        const { inArray } = await import("drizzle-orm");
        const us = await db.select({ id: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl }).from(users).where(inArray(users.id, userIds));
        us.forEach(u => userMap.set(u.id, u));
      }

      const enriched = rows.map(r => ({
        ...r,
        reviewer: userMap.get(r.reviewerId) ?? { id: r.reviewerId, fullName: "Unknown", avatarUrl: null },
        reviewee: userMap.get(r.revieweeId) ?? { id: r.revieweeId, fullName: "Unknown", avatarUrl: null },
      }));

      const total = rows.length;
      const avgRating = total > 0 ? rows.reduce((s, r) => s + r.rating, 0) / total : 0;
      const byRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      rows.forEach(r => { byRating[r.rating] = (byRating[r.rating] ?? 0) + 1; });

      res.json({ reviews: enriched, stats: { total, avgRating, byRating } });
    } catch (err) {
      console.error("[admin/reviews]", err);
      res.status(500).json({ message: "Failed to load reviews" });
    }
  });

  app.get("/api/admin/support/tickets", requireAdmin, async (req, res) => {
    try {
      const { status, priority } = req.query;
      const tickets = await storage.getAllSupportTickets({
        status: status as string | undefined,
        priority: priority as string | undefined,
      });
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch support tickets" });
    }
  });

  // Get support stats (admin)
  app.get("/api/admin/support/stats", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getSupportStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch support stats" });
    }
  });

  // Get a specific ticket (admin)
  app.get("/api/admin/support/tickets/:id", requireAdmin, async (req, res) => {
    try {
      const ticket = await storage.getSupportTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      res.json(ticket);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ticket" });
    }
  });

  // Get messages for a ticket (admin — includes internal)
  app.get("/api/admin/support/tickets/:id/messages", requireAdmin, async (req, res) => {
    try {
      const messages = await storage.getSupportMessages(req.params.id, true);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Update ticket (admin — status, priority, assignedTo, internalNote)
  app.patch("/api/admin/support/tickets/:id", requireAdmin, async (req, res) => {
    try {
      const { status, priority, assignedTo, internalNote } = req.body;

      const validStatuses = ["open", "in_progress", "waiting_user", "resolved", "closed"];
      const validPriorities = ["low", "normal", "high", "urgent"];
      type TicketUpdateFields = {
        status?: string; priority?: string; assignedTo?: string | null;
        internalNote?: string; resolvedAt?: Date; closedAt?: Date;
      };
      const typedUpdate: TicketUpdateFields = {};
      if (status && validStatuses.includes(status)) typedUpdate.status = status;
      if (priority && validPriorities.includes(priority)) typedUpdate.priority = priority;
      if (assignedTo !== undefined) typedUpdate.assignedTo = assignedTo || null;
      if (internalNote !== undefined) typedUpdate.internalNote = internalNote;
      if (status === "resolved") typedUpdate.resolvedAt = new Date();
      if (status === "closed") { typedUpdate.resolvedAt = new Date(); typedUpdate.closedAt = new Date(); }

      const ticket = await storage.updateSupportTicket(param(req.params.id), typedUpdate as Partial<import("@shared/schema").SupportTicket>);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      // Email user when closed/resolved
      if (status === "resolved" || status === "closed") {
        const full = await storage.getSupportTicket(ticket.id);
        if (full) {
          const toEmail = full.user?.email ?? full.requesterEmail;
          const recipientName = full.user?.fullName ?? full.requesterName;
          if (toEmail) {
            const baseUrl = `${req.protocol}://${req.get("host")}`;
            try {
              const transcriptMsgs = await storage.getSupportMessages(full.id, false);
              const transcript = transcriptMsgs.map(m => ({
                senderType: m.senderType,
                senderName: m.senderType === "user"
                  ? (full.user?.fullName ?? full.requesterName ?? "You")
                  : m.senderType === "ai" ? "BarterBot" : (m.sender?.fullName ?? "Support Agent"),
                content: m.content,
              }));
              const { sendTicketClosedEmail } = await import("./emailService");
              await sendTicketClosedEmail(toEmail, {
                recipientName,
                ticketNumber: full.ticketNumber,
                subject: full.subject,
                baseUrl,
                transcript,
              });
            } catch (emailErr) {
              console.error("Ticket closed email failed:", emailErr);
            }
          }
        }
      }

      res.json(ticket);
    } catch (error) {
      console.error("Update ticket error:", error);
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  // Admin reply to ticket
  app.post("/api/admin/support/tickets/:id/messages", requireAdmin, async (req, res) => {
    try {
      const { content, isInternal } = req.body;
      if (!content) return res.status(400).json({ message: "Content is required" });

      const ticket = await storage.getSupportTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });

      const adminId = req.session.userId!;
      const msg = await storage.createSupportMessage({
        ticketId: ticket.id,
        senderId: adminId,
        senderType: "admin",
        content: content.trim(),
        isInternal: isInternal === true,
      });

      // Update status to waiting_user if public reply
      if (!isInternal) {
        await storage.updateSupportTicket(ticket.id, { status: "waiting_user", aiHandled: false });

        // Email user
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const replyToEmail = ticket.user?.email ?? ticket.requesterEmail;
        const replyToName = ticket.user?.fullName ?? ticket.requesterName;
        if (replyToEmail) try {
          const { sendSupportReplyEmail } = await import("./emailService");
          await sendSupportReplyEmail(replyToEmail, {
            recipientName: replyToName,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            replyContent: content.trim(),
            baseUrl,
          });
        } catch (emailErr) {
          console.error("Reply email failed:", emailErr);
        }
      }

      res.status(201).json(msg);
    } catch (error) {
      console.error("Admin reply error:", error);
      res.status(500).json({ message: "Failed to send reply" });
    }
  });

  // Required API contract alias: /reply mirrors /messages for admin
  app.post("/api/admin/support/tickets/:id/reply", requireAdmin, async (req, res) => {
    req.url = req.url.replace("/reply", "/messages");
    app._router.handle(req, res, () => {
      res.status(404).json({ message: "Not found" });
    });
  });

  // Canonical base URL: use APP_BASE_URL env var in production,
  // fall back to the request origin so dev previews produce correct URLs.
  const getBaseUrl = (req: Request) =>
    (process.env.APP_BASE_URL ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

  // ── Google Search Console HTML verification file ────────────────────────────
  // Set GOOGLE_SITE_VERIFICATION env var to the code from GSC's HTML file method
  // (the part of the filename between "google" and ".html", e.g. "abc123def456")
  app.get("/google:code.html", (req, res) => {
    const envCode = process.env.GOOGLE_SITE_VERIFICATION;
    if (!envCode || req.params.code !== envCode) {
      return void res.status(404).send("Not found");
    }
    res
      .type("text/html")
      .send(`google-site-verification: google${envCode}.html`);
  });

  // ── robots.txt ──────────────────────────────────────────────────────────────
  app.get("/robots.txt", (req, res) => {
    const base = getBaseUrl(req);
    res.type("text/plain").send(
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`
    );
  });

  // ── sitemap helpers ──────────────────────────────────────────────────────────
  const SITEMAP_TTL_MS = 10 * 60 * 1000;
  // When total URL count exceeds this threshold, serve a sitemapindex instead
  // of a single flat <urlset>. Configurable via SITEMAP_SPLIT_THRESHOLD env var.
  const SITEMAP_SPLIT_THRESHOLD = parseInt(process.env.SITEMAP_SPLIT_THRESHOLD ?? "5000", 10);
  // Hard per-file limit (Google max is 50,000). Paginate child sitemaps beyond this.
  const SITEMAP_PAGE_LIMIT = 50_000;

  const escapeXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const urlTag = (loc: string, opts: { lastmod?: string; changefreq?: string; priority?: string }) =>
    `  <url>\n    <loc>${escapeXml(loc)}</loc>${opts.lastmod ? `\n    <lastmod>${opts.lastmod}</lastmod>` : ""}${opts.changefreq ? `\n    <changefreq>${opts.changefreq}</changefreq>` : ""}${opts.priority ? `\n    <priority>${opts.priority}</priority>` : ""}\n  </url>`;

  const wrapUrlset = (tags: string[]) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${tags.join("\n")}\n</urlset>`;

  const wrapSitemapIndex = (entries: Array<{ loc: string; lastmod?: string }>) => {
    const items = entries.map(({ loc, lastmod }) =>
      `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n  </sitemap>`
    ).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`;
  };

  const staticPaths = [
    { loc: "/", priority: "1.0", changefreq: "daily" },
    { loc: "/browse", priority: "0.9", changefreq: "hourly" },
    { loc: "/browse-public", priority: "0.8", changefreq: "hourly" },
    { loc: "/feed", priority: "0.8", changefreq: "hourly" },
    { loc: "/map", priority: "0.8", changefreq: "daily" },
    { loc: "/how-it-works", priority: "0.8", changefreq: "monthly" },
    { loc: "/pricing", priority: "0.8", changefreq: "monthly" },
    { loc: "/create-listing", priority: "0.7", changefreq: "monthly" },
    { loc: "/register", priority: "0.8", changefreq: "monthly" },
    { loc: "/login", priority: "0.7", changefreq: "monthly" },
    { loc: "/faq", priority: "0.6", changefreq: "monthly" },
    { loc: "/help", priority: "0.6", changefreq: "monthly" },
    { loc: "/terms", priority: "0.4", changefreq: "monthly" },
    { loc: "/privacy", priority: "0.4", changefreq: "monthly" },
    { loc: "/legal/barter-rules", priority: "0.4", changefreq: "monthly" },
    { loc: "/legal/dispute-resolution", priority: "0.4", changefreq: "monthly" },
    { loc: "/legal/vat", priority: "0.4", changefreq: "monthly" },
    { loc: "/legal/cookies", priority: "0.4", changefreq: "monthly" },
    { loc: "/legal/acceptable-use", priority: "0.4", changefreq: "monthly" },
    { loc: "/legal/community-standards", priority: "0.4", changefreq: "monthly" },
    { loc: "/legal/customer-agreement", priority: "0.4", changefreq: "monthly" },
  ];

  // Per-child cache map keyed by sitemap name (e.g. "pages", "categories", "listings-1")
  const sitemapChildCaches = new Map<string, { xml: string; builtAt: number }>();
  let sitemapIndexCache: { xml: string; builtAt: number } | null = null;

  const getCachedChild = (key: string) => {
    const entry = sitemapChildCaches.get(key);
    if (entry && Date.now() - entry.builtAt < SITEMAP_TTL_MS) return entry.xml;
    return null;
  };
  const setCachedChild = (key: string, xml: string) =>
    sitemapChildCaches.set(key, { xml, builtAt: Date.now() });

  const sendXml = (res: Response, xml: string) =>
    res.type("application/xml").set("Cache-Control", "public, max-age=600").send(xml);

  // ── /sitemap.xml ─────────────────────────────────────────────────────────────
  // Returns a single <urlset> when small, a <sitemapindex> when large.
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const base = getBaseUrl(req);
      const now = Date.now();

      // Serve from cache immediately — no DB work on cache hits
      if (sitemapIndexCache && now - sitemapIndexCache.builtAt < SITEMAP_TTL_MS) {
        return void sendXml(res, sitemapIndexCache.xml);
      }

      // Cache miss — rebuild from DB
      const [listingRows, userRows] = await Promise.all([
        db.select({ id: listings.id, updatedAt: listings.updatedAt })
          .from(listings)
          .where(and(eq(listings.moderationStatus, "approved"), eq(listings.isActive, true)))
          .orderBy(asc(listings.id)),
        db.select({ id: users.id, updatedAt: users.updatedAt })
          .from(users)
          .where(and(eq(users.isBanned, false), eq(users.isVerified, true)))
          .orderBy(asc(users.id)),
      ]);

      const catTags = [
        ...allCategorySlugs().map(({ slug }) =>
          urlTag(`${base}/c/${slug}`, { changefreq: "daily", priority: "0.8" })
        ),
        ...allSubcategorySlugs().map(({ categorySlug, subcategorySlug }) =>
          urlTag(`${base}/c/${categorySlug}/${subcategorySlug}`, { changefreq: "daily", priority: "0.7" })
        ),
      ];
      const pageTags = staticPaths.map(({ loc, priority, changefreq }) =>
        urlTag(base + loc, { changefreq, priority })
      );
      const listingTags = listingRows.map((row) => {
        const lastmod = row.updatedAt
          ? new Date(row.updatedAt).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        return urlTag(`${base}/listings/${row.id}`, { lastmod, changefreq: "weekly", priority: "0.7" });
      });
      const userTags = userRows.map((row) => {
        const lastmod = row.updatedAt
          ? new Date(row.updatedAt).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        return urlTag(`${base}/users/${row.id}`, { lastmod, changefreq: "weekly", priority: "0.6" });
      });

      const totalUrls = pageTags.length + catTags.length + listingTags.length + userTags.length;

      if (totalUrls <= SITEMAP_SPLIT_THRESHOLD) {
        // ── Single flat sitemap (small site) ──
        const xml = wrapUrlset([...pageTags, ...catTags, ...listingTags, ...userTags]);
        sitemapIndexCache = { xml, builtAt: now };
        return void sendXml(res, xml);
      }

      // ── Sitemapindex mode (large site) ──

      // Pre-build and cache each child sitemap now so child routes are warm
      setCachedChild("pages", wrapUrlset(pageTags));
      setCachedChild("categories", wrapUrlset(catTags));

      const buildPagedChildCaches = (key: string, tags: string[]) => {
        const pageCount = Math.max(1, Math.ceil(tags.length / SITEMAP_PAGE_LIMIT));
        for (let p = 1; p <= pageCount; p++) {
          const slice = tags.slice((p - 1) * SITEMAP_PAGE_LIMIT, p * SITEMAP_PAGE_LIMIT);
          setCachedChild(p === 1 ? key : `${key}-${p}`, wrapUrlset(slice));
        }
        return Math.max(1, Math.ceil(tags.length / SITEMAP_PAGE_LIMIT));
      };

      const listingPages = buildPagedChildCaches("listings", listingTags);
      const userPages = buildPagedChildCaches("users", userTags);

      const today = new Date().toISOString().split("T")[0];
      const indexEntries: Array<{ loc: string; lastmod: string }> = [
        { loc: `${base}/sitemap-pages.xml`, lastmod: today },
        { loc: `${base}/sitemap-categories.xml`, lastmod: today },
        ...Array.from({ length: listingPages }, (_, i) => ({
          loc: i === 0 ? `${base}/sitemap-listings.xml` : `${base}/sitemap-listings-${i + 1}.xml`,
          lastmod: today,
        })),
        ...Array.from({ length: userPages }, (_, i) => ({
          loc: i === 0 ? `${base}/sitemap-users.xml` : `${base}/sitemap-users-${i + 1}.xml`,
          lastmod: today,
        })),
      ];

      const xml = wrapSitemapIndex(indexEntries);
      sitemapIndexCache = { xml, builtAt: now };
      return void sendXml(res, xml);
    } catch (err) {
      console.error("sitemap error:", err);
      res.status(500).send("<?xml version='1.0'?><urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'/>");
    }
  });

  // ── Child sitemap routes ──────────────────────────────────────────────────────
  // These are only meaningful in sitemapindex mode but are always routable so
  // crawlers can fetch them directly even before the index is first requested.

  const serveChildOrRebuild = async (
    req: Request,
    res: Response,
    cacheKey: string,
    build: () => Promise<string>,
  ) => {
    try {
      const cached = getCachedChild(cacheKey);
      if (cached) return void sendXml(res, cached);
      const xml = await build();
      setCachedChild(cacheKey, xml);
      sendXml(res, xml);
    } catch (err) {
      console.error(`sitemap child error (${cacheKey}):`, err);
      res.status(500).send("<?xml version='1.0'?><urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'/>");
    }
  };

  app.get("/sitemap-pages.xml", (req, res) => {
    const base = getBaseUrl(req);
    serveChildOrRebuild(req, res, "pages", async () =>
      wrapUrlset(staticPaths.map(({ loc, priority, changefreq }) =>
        urlTag(base + loc, { changefreq, priority })
      ))
    );
  });

  app.get("/sitemap-categories.xml", (req, res) => {
    const base = getBaseUrl(req);
    serveChildOrRebuild(req, res, "categories", async () =>
      wrapUrlset([
        ...allCategorySlugs().map(({ slug }) =>
          urlTag(`${base}/c/${slug}`, { changefreq: "daily", priority: "0.8" })
        ),
        ...allSubcategorySlugs().map(({ categorySlug, subcategorySlug }) =>
          urlTag(`${base}/c/${categorySlug}/${subcategorySlug}`, { changefreq: "daily", priority: "0.7" })
        ),
      ])
    );
  });

  // Listings child sitemaps — page 1 uses /sitemap-listings.xml, extra pages use /sitemap-listings-N.xml
  const buildListingsSitemapPage = async (base: string, page: number): Promise<string> => {
    const offset = (page - 1) * SITEMAP_PAGE_LIMIT;
    const rows = await db
      .select({ id: listings.id, updatedAt: listings.updatedAt })
      .from(listings)
      .where(and(eq(listings.moderationStatus, "approved"), eq(listings.isActive, true)))
      .orderBy(asc(listings.id))
      .limit(SITEMAP_PAGE_LIMIT)
      .offset(offset);
    const tags = rows.map((row) => {
      const lastmod = row.updatedAt
        ? new Date(row.updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      return urlTag(`${base}/listings/${row.id}`, { lastmod, changefreq: "weekly", priority: "0.7" });
    });
    return wrapUrlset(tags);
  };

  app.get("/sitemap-listings.xml", (req, res) => {
    const base = getBaseUrl(req);
    serveChildOrRebuild(req, res, "listings", () => buildListingsSitemapPage(base, 1));
  });

  app.get("/sitemap-listings-:page.xml", (req, res) => {
    const page = parseInt(req.params.page, 10);
    if (isNaN(page) || page < 2) return void res.status(404).send("Not found");
    const base = getBaseUrl(req);
    const key = `listings-${page}`;
    serveChildOrRebuild(req, res, key, () => buildListingsSitemapPage(base, page));
  });

  // Users child sitemaps — verified, non-banned users with public profile pages
  const buildUsersSitemapPage = async (base: string, page: number): Promise<string> => {
    const offset = (page - 1) * SITEMAP_PAGE_LIMIT;
    const rows = await db
      .select({ id: users.id, updatedAt: users.updatedAt })
      .from(users)
      .where(and(eq(users.isBanned, false), eq(users.isVerified, true)))
      .orderBy(asc(users.id))
      .limit(SITEMAP_PAGE_LIMIT)
      .offset(offset);
    const tags = rows.map((row) => {
      const lastmod = row.updatedAt
        ? new Date(row.updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      return urlTag(`${base}/users/${row.id}`, { lastmod, changefreq: "weekly", priority: "0.6" });
    });
    return wrapUrlset(tags);
  };

  app.get("/sitemap-users.xml", (req, res) => {
    const base = getBaseUrl(req);
    serveChildOrRebuild(req, res, "users", () => buildUsersSitemapPage(base, 1));
  });

  app.get("/sitemap-users-:page.xml", (req, res) => {
    const page = parseInt(req.params.page, 10);
    if (isNaN(page) || page < 2) return void res.status(404).send("Not found");
    const base = getBaseUrl(req);
    const key = `users-${page}`;
    serveChildOrRebuild(req, res, key, () => buildUsersSitemapPage(base, page));
  });

  // ════════════════════════════════════════════════════════════════════
  // Task #248 — Save user progress + completion reminders
  // ════════════════════════════════════════════════════════════════════

  // Listing drafts — autosave / hydrate / delete. Drafts are scoped to
  // the owning user; the auth check guards both reads and writes.
  app.get("/api/listing-drafts", requireAuth, async (req, res) => {
    try {
      const rows = await storage.getListingDraftsByUser(req.session.userId!);
      res.json(rows);
    } catch (err) {
      console.error("[drafts] list failed:", err);
      res.status(500).json({ message: "Failed to load drafts" });
    }
  });

  app.post("/api/listing-drafts", requireAuth, async (req, res) => {
    try {
      const body = req.body as { id?: string; data?: Record<string, unknown>; title?: string };
      if (!body || typeof body !== "object" || typeof body.data !== "object" || body.data === null) {
        return res.status(400).json({ message: "data is required" });
      }
      // Cap payload size — drafts are intentionally lightweight; the
      // create-listing form is small JSON.
      const payloadSize = JSON.stringify(body.data).length;
      if (payloadSize > 200_000) {
        return res.status(413).json({ message: "Draft too large" });
      }
      const draft = await storage.upsertListingDraft(req.session.userId!, body.data, {
        id: body.id,
        title: body.title ?? null,
      });
      res.json(draft);
    } catch (err) {
      console.error("[drafts] save failed:", err);
      res.status(500).json({ message: "Failed to save draft" });
    }
  });

  app.delete("/api/listing-drafts/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteListingDraft(String(req.params.id), req.session.userId!);
      if (!ok) return res.status(404).json({ message: "Draft not found" });
      res.json({ deleted: true });
    } catch (err) {
      console.error("[drafts] delete failed:", err);
      res.status(500).json({ message: "Failed to delete draft" });
    }
  });

  // Engagement tracking — fire-and-forget event log. Validates against
  // the shared ENGAGEMENT_EVENT_TYPES enum so unknown event names can't
  // pollute analytics.
  app.post("/api/engagement/track", requireAuth, async (req, res) => {
    try {
      const { ENGAGEMENT_EVENT_TYPES } = await import("@shared/schema");
      const { eventType, listingId } = req.body as { eventType?: string; listingId?: string };
      if (!eventType || !(ENGAGEMENT_EVENT_TYPES as readonly string[]).includes(eventType)) {
        return res.status(400).json({ message: "Invalid eventType" });
      }
      await storage.recordEngagementEvent({
        userId: req.session.userId!,
        listingId: listingId ?? null,
        eventType,
      });
      res.json({ tracked: true });
    } catch (err) {
      console.error("[engagement] track failed:", err);
      res.status(500).json({ message: "Failed to track event" });
    }
  });

  // "Continue where you left off" — surfaces all three resumable items:
  app.get("/api/continue", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const me = await storage.getUser(userId);
      const [drafts, recent] = await Promise.all([
        storage.getListingDraftsByUser(userId),
        storage.getRecentEngagementForUser(userId, 20),
      ]);
      const latestDraft = drafts[0] ?? null;
      // Continue strip surfaces unfinished deal actions only — NOT passive views.
      // Only show when user started a message/proposal or saved the listing.
      const eligibleTypes = new Set(["saved", "message_started"]);
      let engagement: { listing: { id: string; title: string }; eventType: string; at: Date | null } | null = null;
      for (const evt of recent) {
        if (!evt.listingId || !eligibleTypes.has(evt.eventType)) continue;
        const finished = await storage.hasUserDealForListing(userId, evt.listingId);
        if (finished) continue;
        const l = await storage.getListing(evt.listingId).catch(() => null);
        if (!l || !l.isActive) continue;
        engagement = { listing: { id: l.id, title: l.title }, eventType: evt.eventType, at: evt.createdAt };
        break;
      }
      const inProgress = me && (me.kycStatus === "IN_PROGRESS" || me.kybStatus === "IN_PROGRESS");
      const verification = me && inProgress && me.verificationSessionStartedAt
        ? { startedAt: me.verificationSessionStartedAt, accountType: me.accountType ?? null }
        : null;
      res.json({
        verification,
        draft: latestDraft ? { id: latestDraft.id, title: latestDraft.title, updatedAt: latestDraft.updatedAt } : null,
        engagement,
      });
    } catch (err) {
      console.error("[continue] failed:", err);
      res.status(500).json({ message: "Failed to load continue data" });
    }
  });

  // One-click unsubscribe. Renders a tiny inline HTML page so the link
  // is meaningful when clicked from any mail client (no auth required —
  // the token itself is the proof of identity).
  app.get("/api/reminders/unsubscribe", async (req, res) => {
    try {
      const token = String(req.query.token || "");
      const rawKind = String(req.query.kind || "all");
      if (!token) return res.status(400).send("Missing token");
      const user = await storage.getUserByUnsubscribeToken(token);
      if (!user) return res.status(404).send("Invalid unsubscribe link");
      // Strict allowlist on `kind` — anything outside this set is treated
      // as "all". This both prevents reflected-XSS via the HTML response
      // and blocks the caller from poisoning reminderPreferences with an
      // arbitrary key.
      const allowed = new Set(["all", "verification", "drafts", "engagement"]);
      const kind = allowed.has(rawKind) ? rawKind : "all";
      const prefs: { verification?: boolean; drafts?: boolean; engagement?: boolean } = {
        ...(user.reminderPreferences ?? {}),
      };
      if (kind === "all") {
        prefs.verification = false; prefs.drafts = false; prefs.engagement = false;
      } else if (kind === "verification" || kind === "drafts" || kind === "engagement") {
        prefs[kind] = false;
      }
      await storage.updateUser(user.id, { reminderPreferences: prefs });
      // Defensive HTML escape on the label even though `kind` is now a
      // closed enum — belt-and-braces against future drift.
      const label = kind.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:Arial,sans-serif;max-width:520px;margin:80px auto;padding:32px;text-align:center;color:#1a1a2e">
<h1 style="color:#136c68">You're unsubscribed</h1>
<p style="color:#4b5563">We won't send you any more &quot;${label}&quot; reminders. You'll still receive transactional emails (account, deals, security).</p>
<p style="color:#9ca3af;font-size:12px">Bareter</p>
</body></html>`);
    } catch (err) {
      console.error("[reminders] unsubscribe failed:", err);
      res.status(500).send("Something went wrong");
    }
  });

  // ── Beta invite code management ────────────────────────────────────────────
  app.get("/api/admin/beta-invite-code", requireAdmin, async (req, res) => {
    try {
      const code = await storage.getAppSetting("beta_invite_code");
      const baseUrl = process.env.PUBLIC_APP_URL?.trim() || `${req.protocol}://${req.get("host")}`;
      res.json({ code: code || null, inviteUrl: code ? `${baseUrl}/register?invite=${code}` : null });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/beta-invite-code/regenerate", requireAdmin, async (req, res) => {
    try {
      const newCode = Math.random().toString(36).substring(2, 8).toUpperCase() +
                      Math.random().toString(36).substring(2, 8).toUpperCase();
      await storage.setAppSetting("beta_invite_code", newCode, req.session.userId);
      const baseUrl = process.env.PUBLIC_APP_URL?.trim() || `${req.protocol}://${req.get("host")}`;
      res.json({ code: newCode, inviteUrl: `${baseUrl}/register?invite=${newCode}` });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // BRAND COLLAB & CREATOR DISCOVERY ROUTES
  // ══════════════════════════════════════════════════════════════════════

  // GET /api/creators — public creator discovery with filters
  app.get("/api/creators", async (req, res) => {
    try {
      const { niche, platform, minFollowers, maxFollowers, limit, offset } = req.query;
      const creators = await storage.searchCreators({
        niche: niche as string | undefined,
        platform: platform as string | undefined,
        minFollowers: minFollowers ? Number(minFollowers) : undefined,
        maxFollowers: maxFollowers ? Number(maxFollowers) : undefined,
        openToCollabs: true,
        limit: limit ? Math.min(Number(limit), 60) : 40,
        offset: offset ? Number(offset) : 0,
      });
      res.json(creators.map(u => ({
        id: u.id,
        fullName: u.fullName,
        avatarUrl: u.avatarUrl,
        location: u.location,
        city: u.city,
        country: u.country,
        isVerified: u.isVerified,
        verificationStatus: u.verificationStatus,
        founderBadge: u.founderBadge,
        creatorProfile: u.creatorProfile,
        signupType: u.signupType,
        credibilityScore: u.credibilityScore,
        totalCompletedDeals: u.totalCompletedDeals,
      })));
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/listings/:id/collab/applications — brand sees all applications for their collab listing
  app.get("/api/listings/:id/collab/applications", requireAuth, async (req, res) => {
    try {
      const listing = await storage.getListing(req.params.id);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      const apps = await storage.getCollabApplicationsByListing(req.params.id);
      res.json(apps);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/listings/:id/collab/apply — creator applies to a brand collab listing
  app.post("/api/listings/:id/collab/apply", requireAuth, async (req, res) => {
    try {
      const listing = await storage.getListing(req.params.id);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (!listing.isCollab) return res.status(400).json({ message: "Not a collab listing" });
      if (listing.userId === req.session.userId) return res.status(400).json({ message: "Cannot apply to your own listing" });

      const { pitch, socialHandle, followerCount, engagementRate, portfolioLink } = req.body;
      if (!pitch || pitch.trim().length < 20) return res.status(400).json({ message: "Pitch must be at least 20 characters" });

      const app = await storage.applyToCollab({
        listingId: req.params.id,
        creatorId: req.session.userId!,
        brandId: listing.userId,
        pitch: pitch.trim(),
        socialHandle,
        followerCount: followerCount ? Number(followerCount) : undefined,
        engagementRate: engagementRate ? Number(engagementRate) : undefined,
        portfolioLink,
      });

      // Notify the brand
      await storage.createNotification({
        userId: listing.userId,
        type: "collab_application",
        title: "New collab application",
        message: `Someone applied to your collab listing: ${listing.title}`,
        linkUrl: `/listings/${listing.id}?tab=applications`,
        relatedId: app.id,
      }).catch(() => {});

      res.status(201).json(app);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ message: "You already applied to this listing" });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/listings/:id/collab/applications/:appId — brand accepts or rejects application
  app.patch("/api/listings/:id/collab/applications/:appId", requireAuth, async (req, res) => {
    try {
      const listing = await storage.getListing(req.params.id);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });

      const { status, brandNote } = req.body;
      if (!["accepted", "rejected"].includes(status)) return res.status(400).json({ message: "Invalid status" });

      const existingApp = await storage.getCollabApplication(req.params.appId);
      if (!existingApp) return res.status(404).json({ message: "Application not found" });

      let dealId: string | undefined;
      if (status === "accepted") {
        // Auto-create a deal so the two parties can manage milestones
        const deal = await storage.createDeal({
          seekerId: existingApp.creatorId,
          providerId: listing.userId,
          seekerListingId: null,
          providerListingId: listing.id,
          terms: `Brand Collab: ${listing.title}`,
          status: "accepted",
        } as any);
        dealId = deal.id;

        // Create default collab milestones
        const details = listing.collabDetails as any;
        const milestones = [
          { title: "Content Brief Received", milestoneType: "delivery" },
          { title: "Draft Submitted", milestoneType: "content_draft" },
          { title: "Final Content Live", milestoneType: "content_live" },
          { title: "Brand Confirms Delivery", milestoneType: "approval" },
        ];
        for (let i = 0; i < milestones.length; i++) {
          await storage.createDealMilestone({
            dealId: deal.id,
            title: milestones[i].title,
            milestoneType: milestones[i].milestoneType,
            sortOrder: i,
          } as any).catch(() => {});
        }

        // Notify creator
        await storage.createNotification({
          userId: existingApp.creatorId,
          type: "collab_accepted",
          title: "Collab application accepted! 🎉",
          message: `${listing.title} — your application was accepted. Check your deals to get started.`,
          linkUrl: `/deals/${deal.id}`,
          relatedId: deal.id,
        }).catch(() => {});
      } else {
        await storage.createNotification({
          userId: existingApp.creatorId,
          type: "collab_rejected",
          title: "Collab application update",
          message: `Your application to "${listing.title}" was not selected this time.`,
          linkUrl: `/creators`,
          relatedId: existingApp.id,
        }).catch(() => {});
      }

      const updated = await storage.updateCollabApplication(req.params.appId, { status, brandNote, dealId });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // DELETE /api/listings/:id/collab/applications/:appId — creator withdraws application
  app.delete("/api/listings/:id/collab/applications/:appId", requireAuth, async (req, res) => {
    try {
      await storage.withdrawCollabApplication(req.params.appId, req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/me/collab/applications — creator sees their own applications
  app.get("/api/me/collab/applications", requireAuth, async (req, res) => {
    try {
      const apps = await storage.getCollabApplicationsByCreator(req.session.userId!);
      res.json(apps);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/me/creator-profile — creator updates their profile stats
  app.patch("/api/me/creator-profile", requireAuth, async (req, res) => {
    try {
      const { primaryPlatform, followerCount, avgEngagementRate, contentNiches, openToCollabs, portfolioLinks, instagramHandle, tiktokHandle, youtubeHandle } = req.body;
      const count = Number(followerCount) || 0;
      if (count < 2000) {
        return res.status(400).json({ message: "A minimum of 2,000 followers is required to set up a creator profile." });
      }
      const updatedUser = await storage.updateUser(req.session.userId!, {
        creatorProfile: {
          primaryPlatform,
          followerCount: count,
          avgEngagementRate: Number(avgEngagementRate) || 0,
          contentNiches: contentNiches || [],
          openToCollabs: Boolean(openToCollabs),
          portfolioLinks: portfolioLinks || [],
          instagramHandle,
          tiktokHandle,
          youtubeHandle,
        },
      } as any);
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // ADMIN — CREATORS & COLLAB APPLICATIONS
  // ══════════════════════════════════════════════════════════════════════

  // GET /api/admin/creators — all creator-type users with their profiles
  app.get("/api/admin/creators", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { limit = "50", offset = "0", platform, niche } = req.query;
      const creators = await storage.searchCreators({
        platform: platform as string | undefined,
        niche: niche as string | undefined,
        limit: Math.min(Number(limit), 100),
        offset: Number(offset),
      });
      res.json(creators);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/collab-applications — all collab applications across the platform
  app.get("/api/admin/collab-applications", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status, limit = "50", offset = "0" } = req.query;
      const apps = await storage.getAllCollabApplications({
        status: status as string | undefined,
        limit: Math.min(Number(limit), 100),
        offset: Number(offset),
      });
      res.json(apps);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/admin/collab-applications/:id — admin can update status or add note
  app.patch("/api/admin/collab-applications/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status, brandNote } = req.body;
      const updated = await storage.updateCollabApplication(req.params.id, { status, brandNote });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
