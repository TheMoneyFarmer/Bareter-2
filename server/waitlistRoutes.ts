import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { insertWaitlistEntrySchema } from "@shared/schema";
import { sendWaitlistWelcomeEmail } from "./emailService";
import { z } from "zod";

export function isWaitlistMode(): boolean {
  return String(process.env.WAITLIST_MODE || "").toLowerCase() === "true";
}

// Public-facing position offset. The DB stores raw signup order (1, 2, 3…),
// but the public UI/email shows positions starting at #311 to reflect early
// pre-signups, founders, and partners not represented as DB rows.
// Admin views, CSV exports, and analytics keep using the raw position.
const WAITLIST_POSITION_OFFSET = 310;
const publicPosition = (raw: number): number => raw + WAITLIST_POSITION_OFFSET;

const ipBuckets = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 5;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (ipBuckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    ipBuckets.set(ip, arr);
    return false;
  }
  arr.push(now);
  ipBuckets.set(ip, arr);
  return true;
}

function clientIp(req: Request): string {
  // req.ip respects the Express `trust proxy` setting configured in
  // server/index.ts (one hop). It returns the left-most untrusted address
  // from X-Forwarded-For, so an attacker can't spoof the rate-limit key by
  // injecting their own X-Forwarded-For header from a direct client.
  return req.ip || req.socket.remoteAddress || "unknown";
}

function baseUrlOf(_req: Request): string {
  // Always build outbound links (e.g. waitlist welcome emails) from a
  // server-trusted base URL, never from request headers like Host or
  // X-Forwarded-Host. This prevents host-header poisoning where an attacker
  // forges a Host header and the email links point at an attacker domain.
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (devDomain) return `https://${devDomain}`;
  return "http://localhost:5000";
}

const submitSchema = insertWaitlistEntrySchema.extend({
  // Honeypot — bots fill this; real users leave it untouched.
  // We accept any value so the request still parses, then short-circuit below.
  company_website: z.string().optional(),
});

export function registerWaitlistRoutes(
  app: Express,
  requireAdmin: (req: Request, res: Response, next: NextFunction) => any,
) {
  // Public — frontend reads this to decide whether to gate UI
  app.get("/api/waitlist/mode", async (req, res) => {
    try {
      const enabled = isWaitlistMode();
      const count = enabled ? await storage.getWaitlistCount() : 0;
      res.json({ enabled, count, appUrl: baseUrlOf(req) });
    } catch {
      res.json({ enabled: isWaitlistMode(), count: 0, appUrl: baseUrlOf(req) });
    }
  });

  app.get("/api/waitlist/count", async (_req, res) => {
    const count = await storage.getWaitlistCount();
    res.json({ count });
  });

  // Lookup an entry by referral code (for ?ref= landing copy)
  app.get("/api/waitlist/by-code/:code", async (req, res) => {
    const code = String(req.params.code || "").toUpperCase().slice(0, 16);
    if (!code) return res.status(400).json({ message: "Invalid code" });
    const entry = await storage.getWaitlistEntryByReferralCode(code);
    if (!entry) return res.status(404).json({ message: "Not found" });
    res.json({
      referralCode: entry.referralCode,
      name: entry.name,
      country: entry.country,
      position: publicPosition(entry.position),
      referralCount: entry.referralCount ?? 0,
    });
  });

  // Submit a waitlist signup
  app.post("/api/waitlist", async (req, res) => {
    const ip = clientIp(req);
    if (!rateLimit(ip)) {
      return res.status(429).json({ message: "Too many submissions. Please try again later." });
    }
    try {
      const body = submitSchema.parse(req.body);
      if (body.company_website && body.company_website.length > 0) {
        // Honeypot tripped — pretend success
        return res.json({ ok: true, position: 0, referralCode: "", alreadyOnList: false });
      }

      const existing = await storage.getWaitlistEntryByEmail(body.email);
      if (existing) {
        const totalCount = await storage.getWaitlistCount();
        return res.json({
          ok: true,
          alreadyOnList: true,
          position: publicPosition(existing.position),
          referralCode: existing.referralCode,
          referralCount: existing.referralCount ?? 0,
          totalCount,
        });
      }

      const entry = await storage.createWaitlistEntry({
        email: body.email,
        name: body.name ?? null,
        country: body.country ?? null,
        city: body.city ?? null,
        accountType: body.accountType ?? null,
        businessName: body.businessName ?? null,
        categoriesOfInterest: body.categoriesOfInterest ?? [],
        source: body.source ?? null,
        referredByCode: body.referredByCode ? body.referredByCode.toUpperCase() : null,
        ipAddress: ip,
        userAgent: (req.headers["user-agent"] as string) || null,
      });

      // Fire-and-forget email
      sendWaitlistWelcomeEmail(entry.email, {
        name: entry.name,
        referralCode: entry.referralCode,
        position: publicPosition(entry.position),
        baseUrl: baseUrlOf(req),
      })
        .then(() => storage.markWaitlistConfirmed(entry.email).catch(() => {}))
        .catch((err) => console.error("[waitlist] email failed:", err));

      const totalCount = await storage.getWaitlistCount();
      res.json({
        ok: true,
        alreadyOnList: false,
        position: publicPosition(entry.position),
        referralCode: entry.referralCode,
        referralCount: 0,
        totalCount,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      }
      console.error("[waitlist] submit error:", err);
      res.status(500).json({ message: "Something went wrong" });
    }
  });

  // Admin endpoints
  app.get("/api/admin/waitlist", requireAdmin, async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit || "100")) || 100, 1000);
    const offset = parseInt(String(req.query.offset || "0")) || 0;
    const country = req.query.country ? String(req.query.country) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const [entries, total, byCountry, byDay] = await Promise.all([
      storage.listWaitlistEntries({ limit, offset, country, search }),
      storage.getWaitlistCount(),
      storage.getWaitlistStatsByCountry(),
      storage.getWaitlistSignupsByDay(30),
    ]);
    res.json({ entries, total, stats: { byCountry, byDay } });
  });

  app.get("/api/admin/waitlist/export.csv", requireAdmin, async (_req, res) => {
    const rows = await storage.listWaitlistEntries({ limit: 10000 });
    const header = [
      "id", "email", "name", "country", "city", "accountType", "businessName",
      "referralCode", "referredByCode", "referralCount", "position", "source",
      "confirmedAt", "convertedUserId", "createdAt",
    ];
    const csvEscape = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.id, r.email, r.name, r.country, r.city, r.accountType, r.businessName,
        r.referralCode, r.referredByCode, r.referralCount, r.position, r.source,
        r.confirmedAt ? new Date(r.confirmedAt).toISOString() : "",
        r.convertedUserId,
        r.createdAt ? new Date(r.createdAt).toISOString() : "",
      ].map(csvEscape).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="bareter-waitlist-${Date.now()}.csv"`);
    res.send(lines.join("\n"));
  });
}
