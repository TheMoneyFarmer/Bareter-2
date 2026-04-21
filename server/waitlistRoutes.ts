import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { insertWaitlistEntrySchema } from "@shared/schema";
import { sendWaitlistWelcomeEmail } from "./emailService";
import { z } from "zod";

export function isWaitlistMode(): boolean {
  return String(process.env.WAITLIST_MODE || "").toLowerCase() === "true";
}

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
  const fwd = (req.headers["x-forwarded-for"] as string) || "";
  return fwd.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

function baseUrlOf(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
  return `${proto}://${host}`;
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
  app.get("/api/waitlist/mode", async (_req, res) => {
    try {
      const enabled = isWaitlistMode();
      const count = enabled ? await storage.getWaitlistCount() : 0;
      res.json({ enabled, count });
    } catch {
      res.json({ enabled: isWaitlistMode(), count: 0 });
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
      position: entry.position,
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
          position: existing.position,
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
        position: entry.position,
        baseUrl: baseUrlOf(req),
      })
        .then(() => storage.markWaitlistConfirmed(entry.email).catch(() => {}))
        .catch((err) => console.error("[waitlist] email failed:", err));

      const totalCount = await storage.getWaitlistCount();
      res.json({
        ok: true,
        alreadyOnList: false,
        position: entry.position,
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
