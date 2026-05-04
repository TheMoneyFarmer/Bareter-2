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
  type Dispute,
  type DisputeEvidence,
  insertDisputeSchema,
  DISPUTE_OUTCOMES,
} from "@shared/schema";
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
} from "./handlers/authHardening";
import {
  makeAiPerMinuteLimiter,
  makeAiPerDayLimiter,
} from "./handlers/aiRateLimit";
import { db, pool } from "./db";
import crypto from "crypto";
import connectPgSimple from "connect-pg-simple";
import { isEmailConfigured, sendWaitlistLaunchEmail } from "./emailService";
import { registerWaitlistRoutes } from "./waitlistRoutes";
import { eq, and, desc, gte, count, lt, sql as sqlOperator, or } from "drizzle-orm";

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
  }
}

function param(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] || "";
  return val || "";
}

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

// Defense-in-depth: even if a stray row has `isAdmin = true`, the request
// is rejected unless the user's email is in `ADMIN_EMAIL_ALLOWLIST`
// (comma-separated, case-insensitive). When the allowlist is unset the
// middleware falls back to the legacy isAdmin-only behavior so dev
// environments without the env var keep working.
const adminEmailAllowlist = (): Set<string> | null => {
  const raw = process.env.ADMIN_EMAIL_ALLOWLIST;
  if (!raw || !raw.trim()) return null;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
};

// Strip `isAdmin` from any client-facing user payload whose email is not
// in `ADMIN_EMAIL_ALLOWLIST`. This way a stale row in the DB cannot
// expose the admin nav on the client even if `requireAdmin` already
// blocks the underlying API calls.
function sanitizeAdminFlag<T extends { email?: string | null; isAdmin?: boolean | null }>(
  payload: T,
): T {
  const allow = adminEmailAllowlist();
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
  if (!user?.isAdmin) {
    return res.status(403).json({ message: "Forbidden" });
  }
  const allow = adminEmailAllowlist();
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
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      cookie: {
        secure: true, // Always secure since Replit serves over HTTPS
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

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
        "hero_headline", "hero_tagline", "hero_cta", "how_it_works_steps", "faq_entries",
        "contact_email", "support_email", "support_phone",
        "announcement_banner_enabled", "announcement_banner_text", "announcement_banner_link",
        "active_emirates", "maintenance_mode", "maintenance_message", "registration_enabled", "invite_only_mode",
        "high_value_threshold",
        "waitlist_enabled", "disputes_enabled", "ai_matching_enabled",
      ];
      const result: Record<string, string | null> = {};
      for (const key of publicKeys) {
        const v = all[key];
        result[key] = (v != null && v !== "") ? v : null;
      }
      res.json(result);
    } catch {
      res.status(500).json({ message: "Failed to load settings" });
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
          const codeEntry = await storage.getWaitlistEntryByReferralCode(inviteCode).catch(() => null);
          if (codeEntry) invited = true;
        }
        if (!invited) {
          return res.status(403).json({ message: "Registration is by invitation only. Please join the waitlist or use a valid invite code." });
        }
      }

      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
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
        signupType: req.body.signupType || "creator",
        socialProfiles: req.body.socialProfiles || [],
        founderBadge,
        founderBadgeAt: founderBadge ? new Date() : null,
      });

      if (waitlistEntry) {
        storage.convertWaitlistEntryToUser(data.email, user.id).catch((err) =>
          console.error("[waitlist] convert failed:", err),
        );
      }

      req.session.userId = user.id;
      
      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Session error" });
        }
        const { password, ...userWithoutPassword } = user;
        res.json(sanitizeAdminFlag(userWithoutPassword));
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
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
      
      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Session error" });
        }
        const { password, ...userWithoutPassword } = user;
        res.json(sanitizeAdminFlag(userWithoutPassword));
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

        const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;

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

  app.post("/api/auth/reset-password", async (req, res) => {
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
    res.json(sanitizeAdminFlag(userWithoutPassword));
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

      if (PRIVATE_UPLOAD_TYPES.has(uploadType)) {
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
        // Public uploads — crypto-random unguessable name on local disk.
        const random = crypto.randomBytes(24).toString("hex");
        const filename = `${random}.${detected.ext}`;
        fs.writeFileSync(`${uploadDir}/${filename}`, req.file.buffer);
        fileUrl = `/uploads/${filename}`;
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
      console.error("Upload error:", error);
      res.status(500).json({ message: "Upload failed" });
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
      fullName: z.string().min(2).optional(),
      bio: z.string().optional(),
      location: z.string().optional(),
      country: z.string().length(2).optional(),
      city: z.string().optional(),
      locationPrompted: z.boolean().optional(),
      businessName: z.string().optional(),
      avatarUrl: z.string().optional(),
      whatIOffer: z.array(offerNeedItemSchema).optional(),
      whatINeed: z.array(offerNeedItemSchema).optional(),
      portfolioImages: z.array(z.string()).optional(),
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
      res.json(sanitizeAdminFlag(userWithoutPassword));
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

      const updatedUser = await storage.updateUser(req.session.userId!, data);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userWithoutPassword } = updatedUser;
      res.json(sanitizeAdminFlag(userWithoutPassword));
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Password change route
  app.post("/api/users/change-password", requireAuth, async (req, res) => {
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

      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(req.session.userId!, { password: hashedPassword });

      // Destroy every other active session for this user so a stolen
      // session is invalidated as soon as the legitimate user changes
      // their password. Keep the caller's current session alive.
      await destroyUserSessions(req.session.userId!, req.sessionID);

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Listings routes with search/filter
  app.get("/api/listings", async (req, res) => {
    try {
      const { search, type, category, location, verified, minValue, maxValue } = req.query;
      
      let listings = await storage.getListings();

      // Apply filters server-side
      if (search && typeof search === "string") {
        const searchLower = search.toLowerCase();
        listings = listings.filter(
          (l) =>
            l.title.toLowerCase().includes(searchLower) ||
            l.description.toLowerCase().includes(searchLower)
        );
      }

      if (type && type !== "all" && typeof type === "string") {
        listings = listings.filter((l) => l.type === type);
      }

      if (category && typeof category === "string") {
        listings = listings.filter((l) => (l.categories || []).includes(category));
      }

      if (location && location !== "all" && typeof location === "string") {
        listings = listings.filter((l) => l.location === location);
      }

      const worldwide = req.query.worldwide === "true";
      const sessionUser = req.session?.userId
        ? await storage.getUser(req.session.userId)
        : null;
      const queryCountry = req.query.country as string | undefined;
      const queryCity = req.query.city as string | undefined;
      const country = worldwide
        ? undefined
        : queryCountry || sessionUser?.country || undefined;
      const city = worldwide
        ? undefined
        : queryCity || (queryCountry ? undefined : sessionUser?.city || undefined);
      if (country && country !== "all") {
        const code = country.toUpperCase();
        listings = listings.filter((l) => {
          const lc = (l.country || l.user?.country || "").toUpperCase();
          return lc === code;
        });
      }
      if (city && city !== "all") {
        listings = listings.filter((l) => {
          const lc = l.city || l.location || "";
          return lc === city;
        });
      }

      if (verified === "true") {
        listings = listings.filter((l) =>
          l.user?.isVerified ||
          l.user?.kycStatus === "APPROVED" ||
          l.user?.kybStatus === "APPROVED"
        );
      }

      if (minValue && typeof minValue === "string") {
        const min = parseFloat(minValue);
        if (!isNaN(min)) {
          listings = listings.filter((l) => parseFloat(l.retailValue as string) >= min);
        }
      }

      if (maxValue && typeof maxValue === "string") {
        const max = parseFloat(maxValue);
        if (!isNaN(max)) {
          listings = listings.filter((l) => parseFloat(l.retailValue as string) <= max);
        }
      }

      const userId = req.session?.userId;
      const likedIds = userId ? await storage.getUserLikedListingIds(userId) : new Set<string>();
      const commentCounts = await storage.getListingCommentCounts();

      const enriched = listings.map(l => ({
        ...l,
        isLiked: likedIds.has(l.id),
        commentCount: commentCounts.get(l.id) || 0,
      }));

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

      // Business license gate
      if (listingUser.accountType === "business" && listingUser.kybStatus !== "APPROVED") {
        return res.status(403).json({ 
          message: "Business accounts must have a verified trade license before creating listings.",
          requiresTradeLicense: true
        });
      }

      const { isUserVerified } = await import("./diditClient");
      const userVerified = isUserVerified(
        listingUser.accountType || "individual",
        listingUser.kycStatus || "NOT_STARTED",
        listingUser.kybStatus || "NOT_STARTED",
        listingUser.isVerified,
      );

      if (!userVerified) {
        return res.status(403).json({ 
          message: "You must be verified to create listings. Please complete identity verification first.",
          requiresVerification: true
        });
      }

      const { isValueFlagged } = await import("./marketValues");
      const rawCategories = req.body.categories || [];
      const retailVal = parseFloat(req.body.retailValue) || 0;
      const hvtSetting = await storage.getAppSetting("high_value_threshold");
      const highValueThreshold = hvtSetting ? parseFloat(hvtSetting) : 50000;
      const valueFlagged = isValueFlagged(retailVal, rawCategories) || (retailVal >= highValueThreshold);

      const data = insertListingSchema.parse({
        ...req.body,
        userId: req.session.userId,
        valueFlagged,
      });
      const listing = await storage.createListing(data);
      res.json(listing);

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
      const updated = await storage.updateListing(param(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      console.error("Update listing error:", error);
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
      res.json({ liked: true, likeCount: count });
    } catch (error) {
      console.error("Listing like error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Listing Comments
  app.get("/api/listings/:id/comments", async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const comments = await storage.getListingComments(listingId);
      res.json(comments);
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
        content: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);
      const comment = await storage.createListingComment(listingId, userId, parsed.content || null, parsed.offerItemName, parsed.offerItemValue);
      res.json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create listing comment error:", error);
      res.status(500).json({ message: "Internal server error" });
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

  // Deal contract PDF download
  app.get("/api/deals/:id/contract", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDealWithUsers(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      // If contract already exists, redirect to it
      if (deal.contractPdfUrl) {
        return res.redirect(deal.contractPdfUrl);
      }
      
      // Generate contract PDF using jsPDF
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(20);
      doc.text("BARTER AGREEMENT CONTRACT", 105, 20, { align: "center" });
      
      // Contract number and date
      doc.setFontSize(10);
      doc.text(`Contract Reference: ${deal.dealNumber}`, 20, 35);
      doc.text(`Date: ${new Date(deal.createdAt!).toLocaleDateString()}`, 20, 42);
      
      // Parties
      doc.setFontSize(12);
      doc.text("PARTIES TO THIS AGREEMENT", 20, 55);
      doc.setFontSize(10);
      doc.text(`Party A (Seeker): ${deal.seeker?.fullName || deal.seeker?.businessName || "N/A"}`, 25, 65);
      doc.text(`Party B (Provider): ${deal.provider?.fullName || deal.provider?.businessName || "N/A"}`, 25, 72);
      
      // Exchange Details
      doc.setFontSize(12);
      doc.text("EXCHANGE DETAILS", 20, 90);
      doc.setFontSize(10);
      doc.text(`Party A Offers: ${deal.seekerOffer}`, 25, 100);
      doc.text(`Estimated Value: AED ${Number(deal.seekerValue).toLocaleString()}`, 25, 107);
      doc.text(`Party B Offers: ${deal.providerOffer}`, 25, 117);
      doc.text(`Estimated Value: AED ${Number(deal.providerValue).toLocaleString()}`, 25, 124);
      
      // Terms
      doc.setFontSize(12);
      doc.text("TERMS AND CONDITIONS", 20, 142);
      doc.setFontSize(10);
      const terms = [
        "1. Both parties agree to exchange the goods/services described above.",
        "2. Each party warrants they have the right to exchange the items offered.",
        "3. The exchange values are agreed estimates and do not constitute cash payment.",
        "4. This agreement is governed by UAE law.",
        "5. Any disputes shall be resolved through arbitration in Dubai.",
      ];
      let yPos = 152;
      terms.forEach((term) => {
        const lines = doc.splitTextToSize(term, 170);
        doc.text(lines, 25, yPos);
        yPos += lines.length * 6;
      });
      
      // UAE VAT Notice
      doc.setFontSize(10);
      doc.text("VAT Notice: Standard UAE VAT (5%) may apply to certain barter transactions.", 20, 220);
      doc.text("Consult a tax advisor for specific guidance.", 20, 227);
      
      // Signatures
      doc.setFontSize(12);
      doc.text("SIGNATURES", 20, 245);
      doc.line(25, 265, 90, 265);
      doc.line(120, 265, 185, 265);
      doc.setFontSize(10);
      doc.text("Party A Signature", 25, 272);
      doc.text("Party B Signature", 120, 272);
      
      // Footer
      doc.setFontSize(8);
      doc.text("Generated by Bareter Marketplace | www.bareter.com", 105, 285, { align: "center" });
      
      // Send PDF
      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Contract_${deal.dealNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Generate contract error:", error);
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

      const { isUserVerified } = await import("./diditClient");
      const seekerVerified = isUserVerified(
        seeker.accountType || "individual",
        seeker.kycStatus || "NOT_STARTED",
        seeker.kybStatus || "NOT_STARTED",
        seeker.isVerified,
      );

      if (!seekerVerified) {
        return res.status(403).json({ 
          message: "You must be verified to start a trade. Please complete identity verification first.",
          requiresVerification: true
        });
      }

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

      // Detect off-platform communication attempts
      const offPlatformKeywords = /whatsapp|telegram|phone|transfer|outside|signal|wechat|direct\s*pay/i;
      const isOffPlatform = offPlatformKeywords.test(data.content);

      const message = await storage.createMessage({
        dealId: param(req.params.id),
        senderId: req.session.userId!,
        content: data.content,
        isOffPlatform,
      });

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

  // Verification routes (Didit KYC/KYB)
  app.post("/api/verification/session", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { accountType } = req.body;
      const userAccountType = accountType || user.accountType || "individual";
      
      const workflowId = userAccountType === "business" 
        ? process.env.DIDIT_KYB_WORKFLOW_ID 
        : process.env.DIDIT_KYC_WORKFLOW_ID;

      if (!workflowId) {
        return res.status(500).json({ message: "Verification workflow not configured" });
      }

      const { createVerificationSession } = await import("./diditClient");
      
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
          : "http://localhost:5000";
      
      const callbackUrl = `${baseUrl}/profile`;
      
      const session = await createVerificationSession(
        workflowId,
        user.id,
        callbackUrl
      );

      if (!session) {
        return res.status(500).json({ message: "Failed to create verification session" });
      }

      await storage.updateUser(user.id, {
        accountType: userAccountType,
        diditSessionId: session.session_id,
        ...(userAccountType === "business" 
          ? { kybStatus: "IN_PROGRESS" }
          : { kycStatus: "IN_PROGRESS" }
        ),
      });

      res.json({
        sessionId: session.session_id,
        verificationUrl: session.url,
      });
    } catch (error) {
      console.error("Create verification session error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/verification/status", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { getVerificationStatus, isUserVerified } = await import("./diditClient");
      
      const accountType = user.accountType || "individual";
      const kycStatus = user.kycStatus || "NOT_STARTED";
      const kybStatus = user.kybStatus || "NOT_STARTED";

      const statusInfo = getVerificationStatus(accountType, kycStatus, kybStatus);
      const verified = isUserVerified(accountType, kycStatus, kybStatus, user.isVerified);

      res.json({
        accountType,
        kycStatus,
        kybStatus,
        isVerified: verified,
        ...statusInfo,
      });
    } catch (error) {
      console.error("Get verification status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const { verifyWebhookSignature: verifyDiditSignature } = await import(
    "./diditClient"
  );
  const { makeDiditWebhookHandler } = await import("./handlers/diditWebhook");
  const diditWebhookHandler = makeDiditWebhookHandler({
    storage,
    verifyWebhookSignature: verifyDiditSignature,
  });
  app.post("/api/webhooks/didit", diditWebhookHandler);

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
      res.json(sanitizeAdminFlag(userWithoutPassword));
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
      const enriched = listings.map(l => ({
        ...l,
        commentCount: commentCounts.get(l.id) || 0,
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
      const user = await storage.updateUser(param(req.params.id), { isVerified: verified });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await logAdminAction(req, verified ? "user_verified" : "user_unverified", "user", user.id, { email: user.email });
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
      const { sendAdminEmail } = await import("./emailService");
      let sent = 0, failed = 0;
      for (const recipient of recipients) {
        try {
          const ok = await sendAdminEmail(recipient.email, {
            recipientName: recipient.fullName,
            subject,
            body,
          });
          await storage.createEmailLog({
            recipientEmail: recipient.email,
            subject,
            status: ok ? "sent" : "failed",
            source: "broadcast",
            broadcastId,
            sentBy: req.session.userId,
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
            sentBy: req.session.userId,
          });
          failed++;
        }
      }
      await logAdminAction(req, "email_broadcast", "system", broadcastId, { subject, recipientCount: recipients.length, sent, failed });
      res.json({ broadcastId, recipientCount: recipients.length, sent, failed });
    } catch (error) {
      console.error("Broadcast email error:", error);
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

  app.get("/api/admin/agents/toggles", requireAdmin, async (_req, res) => {
    try {
      const toggles = await storage.getAllAgentToggles();
      res.json(toggles);
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
      const agentName = req.params.name;
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
      await logAdminAction(req, "user_role_changed", "user", user.id, { role, email: user.email });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin change role error:", error);
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
      const listing = await storage.updateListing(listingId, { isActive: false });
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      await logAdminAction(req, "listing_removed", "listing", listingId, { title: listing.title });
      res.json({ message: "Listing removed successfully" });
    } catch (error) {
      console.error("Admin delete listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

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
      const BOOLEAN_KEYS = ["maintenance_mode", "registration_enabled", "invite_only_mode", "announcement_banner_enabled", "waitlist_enabled", "disputes_enabled", "ai_matching_enabled"];
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
      // Legacy-tolerant filter: posts without country/city are kept (legacy/seed
      // data may have only `location` set). Strict country/city match is applied
      // when those fields exist.
      const filtered = allPosts.filter((p) => {
        if (country && p.country) {
          if (p.country.toUpperCase() !== country) return false;
        }
        if (city && p.city) {
          if (p.city !== city) return false;
        }
        return true;
      });
      const postsData = filtered.slice(0, limit);

      // Enrich posts with comment counts and user-specific state
      const enrichedPosts = await Promise.all(
        postsData.map(async (post) => {
          const commentCount = await storage.getCommentCount(post.id);
          if (req.session.userId) {
            const liked = await storage.isPostLiked(post.id, req.session.userId!);
            const bookmarked = await storage.isPostBookmarked(post.id, req.session.userId!);
            return { ...post, liked, bookmarked, commentCount };
          }
          return { ...post, commentCount };
        })
      );
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
      const { content, offerItemName, offerItemValue } = req.body;
      if (!offerItemName || typeof offerItemName !== "string" || offerItemName.trim().length === 0) {
        return res.status(400).json({ message: "Please specify what you want to offer" });
      }
      if (!offerItemValue || isNaN(Number(offerItemValue)) || Number(offerItemValue) <= 0) {
        return res.status(400).json({ message: "Please provide a valid value for your offer" });
      }
      const comment = await storage.createComment(
        param(req.params.id),
        req.session.userId!,
        content?.trim() || null,
        offerItemName.trim(),
        String(Number(offerItemValue).toFixed(2))
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

  // Create sample barter scenario deals for the current user — admin-only,
  // and disabled in production to prevent accidental data pollution.
  app.post("/api/demo/sample-deals", requireAdmin, async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Sample data seeding is disabled in production." });
    }
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const hashedPassword = await hashPassword("demo123");

      const sampleBusinesses = [
        {
          email: `suit_manufacturer_${Date.now()}@demo.bareter.com`,
          password: hashedPassword,
          fullName: "Marco Bellini",
          bio: "Master tailor and bespoke suit manufacturer with over 20 years of experience in luxury menswear. Born in Milan, now based in Dubai, I bring Italian craftsmanship to the UAE market. Specializing in custom tailoring for executives, wedding suits, and formal wear collections. Every piece is hand-finished using the finest European fabrics.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "Bellini Bespoke Tailoring",
          whatIOffer: [{ name: "Bespoke Suits", value: 5000, description: "Custom tailored suits" }, { name: "Formal Wear", value: 3000 }, { name: "Wedding Suits", value: 7000 }],
          whatINeed: [{ name: "Model Services", value: 2000 }, { name: "Photography", value: 1500 }, { name: "Lookbook Design", value: 3000 }],
          phone: "+971 50 123 4567",
          website: "https://bellinibespoke.ae",
          socialLinks: { instagram: "https://instagram.com/bellinibespoke", linkedin: "https://linkedin.com/company/bellinibespoke" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `luxury_hotel_${Date.now()}@demo.bareter.com`,
          password: hashedPassword,
          fullName: "Layla Al-Farsi",
          bio: "General Manager of The Azure Resort & Spa, a boutique 5-star hotel on Dubai Marina. With 15 years in hospitality management, I oversee premium guest experiences including our award-winning spa, rooftop dining, and exclusive event spaces. Passionate about connecting with content creators who can showcase our unique property to the world.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "The Azure Resort & Spa",
          whatIOffer: [{ name: "Hotel Stays", value: 3000, description: "Luxury suite accommodations" }, { name: "Spa Treatments", value: 500 }, { name: "Event Space Rental", value: 8000 }],
          whatINeed: [{ name: "Social Media Content", value: 2000 }, { name: "Reels & Stories", value: 1000 }, { name: "Professional Photography", value: 3000 }],
          phone: "+971 4 567 8901",
          website: "https://azureresort.ae",
          socialLinks: { instagram: "https://instagram.com/azureresortdubai", linkedin: "https://linkedin.com/company/azure-resort", twitter: "https://x.com/azureresort" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `influencer_${Date.now()}@demo.bareter.com`,
          password: hashedPassword,
          fullName: "Sofia Reyes",
          bio: "Travel and lifestyle content creator with 500K+ followers across Instagram and TikTok. I specialize in creating authentic, engaging content for luxury hotels, restaurants, and lifestyle brands in the UAE and beyond. My audience is 70% women aged 25-40 with high purchasing power. Let's create something beautiful together.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: null,
          whatIOffer: [{ name: "Instagram Reels", value: 1500 }, { name: "Stories Coverage", value: 500 }, { name: "TikTok Content", value: 1000 }, { name: "Blog Feature", value: 2000 }],
          whatINeed: [{ name: "Hotel Stays", value: 3000 }, { name: "Dining Experiences", value: 1000 }, { name: "Spa Days", value: 800 }],
          website: "https://sofiareyes.com",
          socialLinks: { instagram: "https://instagram.com/sofiareyes", twitter: "https://x.com/sofiareyestravel" },
          accountType: "individual",
          profileCompleted: true,
        },
        {
          email: `restaurant_${Date.now()}@demo.bareter.com`,
          password: hashedPassword,
          fullName: "Chef Khalid Al-Rashid",
          bio: "Award-winning executive chef and owner of Saffron & Sage, a modern Arabic fusion restaurant in DIFC. Trained at Le Cordon Bleu Paris, I bring international techniques to traditional Gulf flavors. Our restaurant has been featured in Time Out Dubai and Michelin Guide. Looking to exchange premium dining experiences for creative services that can elevate our brand.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "Saffron & Sage Restaurant",
          whatIOffer: [{ name: "Fine Dining Experiences", value: 1500 }, { name: "Catering Services", value: 5000 }, { name: "Private Chef Evening", value: 3000 }],
          whatINeed: [{ name: "Food Photography", value: 2000 }, { name: "Menu Design", value: 1000 }, { name: "Interior Photography", value: 1500 }],
          phone: "+971 4 345 6789",
          website: "https://saffronandsage.ae",
          socialLinks: { instagram: "https://instagram.com/saffronandsagedubai" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `food_photographer_${Date.now()}@demo.bareter.com`,
          password: hashedPassword,
          fullName: "Nina Chen",
          bio: "Professional food and lifestyle photographer based in Dubai with 8 years of experience. Clients include Zuma, La Petite Maison, and Four Seasons Hotels. I specialize in editorial food photography, restaurant interiors, and menu design shoots. My work has been published in Conde Nast Traveller and Food & Travel Magazine.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "NinaChen Studios",
          whatIOffer: [{ name: "Food Photography Session", value: 2500 }, { name: "Menu Shoot Package", value: 4000 }, { name: "Restaurant Interior Shoot", value: 3000 }],
          whatINeed: [{ name: "Dining Credits", value: 1500 }, { name: "Event Catering", value: 3000 }, { name: "Hotel Stays", value: 2000 }],
          website: "https://ninachenstudios.com",
          socialLinks: { instagram: "https://instagram.com/ninachenfood", linkedin: "https://linkedin.com/in/ninachen" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `saas_company_${Date.now()}@demo.bareter.com`,
          password: hashedPassword,
          fullName: "James Mitchell",
          bio: "Founder and CEO of CloudFlow Technologies, a fast-growing SaaS startup providing enterprise project management and CRM solutions. We serve 200+ businesses across the GCC with our all-in-one platform. Previously led product at two Y Combinator startups. Looking to exchange our premium software licenses for creative and design services to support our rebrand.",
          location: "Abu Dhabi",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "CloudFlow Technologies",
          whatIOffer: [{ name: "12-Month SaaS License", value: 15000 }, { name: "Custom Integrations", value: 5000 }, { name: "API Access Package", value: 3000 }],
          whatINeed: [{ name: "Full Rebrand", value: 12000 }, { name: "UI/UX Design", value: 8000 }, { name: "Marketing Website", value: 5000 }],
          phone: "+971 2 678 9012",
          website: "https://cloudflow.tech",
          socialLinks: { linkedin: "https://linkedin.com/company/cloudflow-tech", twitter: "https://x.com/cloudflowtech" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `graphic_designer_${Date.now()}@demo.bareter.com`,
          password: hashedPassword,
          fullName: "Zara Ahmed",
          bio: "Senior brand designer and creative director with 12+ years of experience working with luxury and tech brands. My studio specializes in complete brand identity systems, packaging design, and digital experiences. Past clients include Emirates NBD, Careem, and Chalhoub Group. I believe great design is the foundation of every successful brand.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "Zara Design Studio",
          whatIOffer: [{ name: "Full Rebrand Package", value: 15000 }, { name: "Logo Design", value: 3000 }, { name: "Brand Guidelines", value: 5000 }],
          whatINeed: [{ name: "SaaS Tools", value: 10000 }, { name: "Project Management Software", value: 5000 }, { name: "Cloud Hosting", value: 2000 }],
          website: "https://zaradesign.studio",
          socialLinks: { instagram: "https://instagram.com/zaradesignstudio", linkedin: "https://linkedin.com/in/zaraahmed" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `dentist_${Date.now()}@demo.bareter.com`,
          password: hashedPassword,
          fullName: "Dr. Amira Hassan",
          bio: "Board-certified cosmetic dentist and founder of Pearl Smile Dental Clinic in JBR. Graduated from NYU College of Dentistry with specialization in aesthetic dentistry. We offer premium teeth whitening, veneers, and smile makeover services. Looking to trade our dental services for digital marketing expertise to grow our clinic's online presence.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "Pearl Smile Dental Clinic",
          whatIOffer: [{ name: "Teeth Whitening", value: 2500 }, { name: "Dental Cleaning", value: 500 }, { name: "Smile Consultation", value: 1000 }],
          whatINeed: [{ name: "Digital Ad Campaign", value: 5000 }, { name: "Social Media Marketing", value: 3000 }, { name: "Google Ads Management", value: 4000 }],
          phone: "+971 4 234 5678",
          website: "https://pearlsmile.ae",
          socialLinks: { instagram: "https://instagram.com/pearlsmiledubai", linkedin: "https://linkedin.com/company/pearl-smile-dental" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `marketing_agency_${Date.now()}@demo.bareter.com`,
          password: hashedPassword,
          fullName: "Ryan Thompson",
          bio: "Founder of Spark Digital Marketing, a performance-driven digital agency specializing in healthcare, wellness, and lifestyle brands. We manage AED 2M+ in annual ad spend across Google, Meta, and TikTok. Our data-driven approach has helped 50+ businesses achieve 3x+ ROAS. Open to bartering our services for health, wellness, and lifestyle experiences.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "Spark Digital Marketing",
          whatIOffer: [{ name: "Ad Campaign Management", value: 8000 }, { name: "Social Media Strategy", value: 4000 }, { name: "SEO Package", value: 6000 }],
          whatINeed: [{ name: "Health Services", value: 3000 }, { name: "Wellness Treatments", value: 2000 }, { name: "Fitness Programs", value: 1500 }],
          phone: "+971 50 987 6543",
          website: "https://sparkdigital.ae",
          socialLinks: { linkedin: "https://linkedin.com/company/spark-digital-ae", twitter: "https://x.com/sparkdigitalae", instagram: "https://instagram.com/sparkdigital" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `model_${Date.now()}@demo.bareter.com`,
          password: hashedPassword,
          fullName: "Alessandro Romano",
          bio: "Professional male model represented by Elite Model Management Dubai. Experienced in fashion, commercial, and editorial modeling with work published in GQ Middle East, Harper's Bazaar Arabia, and Vogue Man. Available for runway shows, lookbook shoots, and brand campaigns. Seeking premium tailoring and fashion partnerships.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: null,
          whatIOffer: [{ name: "Fashion Modeling", value: 3000 }, { name: "Commercial Shoots", value: 2000 }, { name: "Runway Shows", value: 4000 }],
          whatINeed: [{ name: "Custom Suits", value: 5000 }, { name: "Formal Attire", value: 3000 }, { name: "Grooming Services", value: 1000 }],
          socialLinks: { instagram: "https://instagram.com/alessandroromano", linkedin: "https://linkedin.com/in/alessandroromano" },
          accountType: "individual",
          profileCompleted: true,
        },
      ];

      const createdUsers = [];
      for (const userData of sampleBusinesses) {
        const user = await storage.createUser(userData);
        createdUsers.push(user);
      }

      const [suitMaker, hotel, influencer, restaurant, foodPhotographer, saasCompany, graphicDesigner, dentist, marketingAgency, model] = createdUsers;

      const generateDealNumber = () => `RCP-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

      const barterScenarios = [
        {
          dealNumber: generateDealNumber(),
          seekerId: model.id,
          providerId: suitMaker.id,
          seekerListingId: null,
          providerListingId: null,
          seekerOffer: "Fashion modeling for lookbook and promotional materials (3 sessions)",
          seekerValue: "4500.00",
          providerOffer: "2 Custom Bespoke Suits with fittings",
          providerValue: "5000.00",
          state: "completed",
          timeline: "6 weeks for suit completion, modeling sessions over 2 weeks",
          deliverables: [
            { label: "3 full-day photo shoots", checked: true },
            { label: "Lookbook and promotional materials", checked: true },
            { label: "2 custom bespoke suits with fittings", checked: true },
            { label: "3 fitting sessions per suit", checked: true },
            { label: "Usage rights for all produced content", checked: true },
          ],
          seekerCompleted: true,
          providerCompleted: true,
        },
        {
          dealNumber: generateDealNumber(),
          seekerId: influencer.id,
          providerId: hotel.id,
          seekerListingId: null,
          providerListingId: null,
          seekerOffer: "15 Instagram Reels + 30 Stories + 5 TikTok videos featuring the resort",
          seekerValue: "4000.00",
          providerOffer: "5-Night Stay in Ocean View Suite with all meals",
          providerValue: "4500.00",
          state: "in_progress",
          timeline: "Content delivery within 2 weeks of stay",
          deliverables: [
            { label: "3 Reels + 5 Stories + 2 Posts", checked: true },
            { label: "Brand tagging in all content", checked: true },
            { label: "Usage rights for all produced content", checked: true },
            { label: "5 TikTok videos featuring the resort", checked: true },
            { label: "5-Night Stay in Ocean View Suite", checked: true },
            { label: "All meals included", checked: true },
            { label: "Re-sharing on personal channels", checked: true },
          ],
          seekerCompleted: false,
          providerCompleted: true,
        },
        {
          dealNumber: generateDealNumber(),
          seekerId: foodPhotographer.id,
          providerId: restaurant.id,
          seekerListingId: null,
          providerListingId: null,
          seekerOffer: "Complete menu photography session (50+ dishes) with editing",
          seekerValue: "4000.00",
          providerOffer: "AED 3,500 dining credit + 2 private chef experiences",
          providerValue: "4500.00",
          state: "completed",
          timeline: "Photography over 2 days, 1-week editing, dining credits valid 6 months",
          deliverables: [
            { label: "Professional photoshoot session (50+ dishes)", checked: true },
            { label: "Edited high-resolution images (minimum 20)", checked: true },
            { label: "Usage rights for commercial use", checked: true },
            { label: "AED 3,500 dining credit", checked: true },
            { label: "2 private chef experiences", checked: true },
            { label: "Retouching and post-production", checked: true },
          ],
          seekerCompleted: true,
          providerCompleted: true,
        },
        {
          dealNumber: generateDealNumber(),
          seekerId: graphicDesigner.id,
          providerId: saasCompany.id,
          seekerListingId: null,
          providerListingId: null,
          seekerOffer: "Complete brand identity redesign including logo, guidelines, and templates",
          seekerValue: "15000.00",
          providerOffer: "12-month enterprise license for entire team (up to 25 users)",
          providerValue: "15000.00",
          state: "in_progress",
          timeline: "Rebrand delivery in 8 weeks, license activated immediately",
          deliverables: [
            { label: "Brand identity package (logo, colors, typography)", checked: true },
            { label: "Design files in editable formats", checked: true },
            { label: "Brand guidelines document", checked: true },
            { label: "12-month enterprise software license", checked: true },
            { label: "Priority support access", checked: true },
            { label: "Onboarding and setup assistance", checked: true },
          ],
          seekerCompleted: false,
          providerCompleted: false,
        },
        {
          dealNumber: generateDealNumber(),
          seekerId: marketingAgency.id,
          providerId: dentist.id,
          seekerListingId: null,
          providerListingId: null,
          seekerOffer: "3-month digital advertising campaign (Google & Meta Ads)",
          seekerValue: "6000.00",
          providerOffer: "Teeth whitening for 4 team members + dental cleaning package",
          providerValue: "5500.00",
          state: "completed",
          timeline: "Campaign runs 3 months, dental services scheduled over 2 months",
          deliverables: [
            { label: "3-month digital advertising campaign", checked: true },
            { label: "Google and Meta Ads management", checked: true },
            { label: "Campaign strategy document", checked: true },
            { label: "Performance metrics report", checked: true },
            { label: "Teeth whitening for 4 team members", checked: true },
            { label: "Dental cleaning package", checked: true },
          ],
          seekerCompleted: true,
          providerCompleted: true,
        },
      ];

      const createdDeals = [];
      for (const dealData of barterScenarios) {
        const deal = await storage.createDeal(dealData);
        createdDeals.push(deal);
      }

      for (const deal of createdDeals.filter(d => d.state === "completed")) {
        await storage.createRating({
          dealId: deal.id,
          fromUserId: deal.seekerId,
          toUserId: deal.providerId,
          score: 5,
          review: "Excellent trade partner! Professional and delivered exactly as promised.",
        });
        await storage.createRating({
          dealId: deal.id,
          fromUserId: deal.providerId,
          toUserId: deal.seekerId,
          score: 5,
          review: "Great experience working together. Would definitely trade again!",
        });
      }

      res.json({
        message: "Sample barter scenarios created successfully!",
        users: createdUsers.length,
        deals: createdDeals.length,
        scenarios: [
          "Suit manufacturer ↔ Models (pay models in bespoke suits)",
          "Hotel ↔ Influencer (free stays ↔ reels + stories)",
          "Restaurant ↔ Food photographer (free meals ↔ professional photos)",
          "SaaS company ↔ Graphic designer (12-month license ↔ full rebrand)",
          "Dentist ↔ Marketing agency (free teeth whitening ↔ ad campaign)",
        ],
      });
    } catch (error) {
      console.error("Create sample deals error:", error);
      res.status(500).json({ message: "Failed to create sample deals" });
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
      res.json(allReports);
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

      // Group by conversation partner
      const conversations: Record<string, typeof allInquiries[0] & { otherUserId: string; unreadCount: number }> = {};
      for (const inq of allInquiries) {
        const otherUserId = inq.fromUserId === userId ? inq.toUserId : inq.fromUserId;
        if (!conversations[otherUserId]) {
          const unreadCount = allInquiries.filter(
            i => i.fromUserId === otherUserId && i.toUserId === userId && !i.isRead
          ).length;
          conversations[otherUserId] = { ...inq, otherUserId, unreadCount };
        }
      }

      // Enrich with user info
      const enriched = await Promise.all(
        Object.values(conversations).map(async (conv) => {
          const otherUser = await storage.getUser(conv.otherUserId);
          return { ...conv, otherUser: otherUser ? { id: otherUser.id, fullName: otherUser.fullName, avatarUrl: otherUser.avatarUrl, isVerified: otherUser.isVerified, kycStatus: otherUser.kycStatus, kybStatus: otherUser.kybStatus, accountType: otherUser.accountType } : null };
        })
      );

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

      const thread = await db.select().from(quickInquiries)
        .where(sqlOperator`(
          (${quickInquiries.fromUserId} = ${myId} AND ${quickInquiries.toUserId} = ${otherId}) OR
          (${quickInquiries.fromUserId} = ${otherId} AND ${quickInquiries.toUserId} = ${myId})
        )`)
        .orderBy(quickInquiries.createdAt);

      // Mark messages as read
      await db.update(quickInquiries)
        .set({ isRead: true })
        .where(and(eq(quickInquiries.fromUserId, otherId), eq(quickInquiries.toUserId, myId)));

      const otherUser = await storage.getUser(otherId);
      res.json({ 
        messages: thread, 
        otherUser: otherUser ? { id: otherUser.id, fullName: otherUser.fullName, avatarUrl: otherUser.avatarUrl, isVerified: otherUser.isVerified, kycStatus: otherUser.kycStatus, kybStatus: otherUser.kybStatus, accountType: otherUser.accountType } : null
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

  // Valuation advice
  app.post("/api/ai/valuation", requireAuth, aiPerMinuteLimiter, aiPerDayLimiter, async (req, res) => {
    try {
      const { title, description, category, condition } = req.body;
      if (!title || !description || !category) {
        return res.status(400).json({ message: "Title, description, and category are required" });
      }
      const { getValuation } = await import("./agents/valuationAgent");
      const sessionUser = req.session.userId ? await storage.getUser(req.session.userId) : null;
      const advice = await getValuation(title, description, category, condition, req.session.userId, {
        country: sessionUser?.country,
        city: sessionUser?.city,
      });
      res.json(advice);
    } catch (error) {
      console.error("AI valuation error:", error);
      res.status(500).json({ message: "Valuation service unavailable" });
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

  return httpServer;
}
