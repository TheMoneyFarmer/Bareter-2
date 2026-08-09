import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { or, eq } from "drizzle-orm";

/**
 * Admin role consistency.
 *
 * Platform admin is expressed by TWO columns — `users.isAdmin` (boolean) and
 * `users.role` ("user" | "admin" | "super_admin") — and `requireAdmin` accepts
 * either:
 *
 *   const hasAdminRole = user?.isAdmin || user?.role === "super_admin" || user?.role === "admin";
 *
 * Two sources of truth for one fact will eventually disagree, and when they do
 * the OR means the MORE permissive one wins. A row left with isAdmin=true after
 * a role downgrade would keep full admin access while every UI and report shows
 * it as a normal user.
 *
 * Consolidating the columns would mean editing live auth code, which is the
 * riskiest change available before a launch, for a problem that has not
 * happened. These tests take the other trade: leave the mechanism alone and
 * fail loudly the moment the two columns drift, or the allowlist and the
 * database disagree about who can actually get in.
 *
 * They read production-shaped data, so they run only with RUN_DB_TESTS=1.
 * They are strictly READ-ONLY — no fixtures, no writes.
 */

const OPT_IN = process.env.RUN_DB_TESTS === "1";
const hasDb = (() => { try { return !!new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return false; } })();
const maybe = OPT_IN && hasDb ? describe : describe.skip;

maybe("admin role consistency (read-only)", () => {
  let db: any, pool: any, users: any, storage: any;
  let admins: Array<{ id: string; email: string | null; isAdmin: boolean | null; role: string | null }> = [];
  let allow: Set<string> | null = null;

  beforeAll(async () => {
    ({ db, pool } = await import("../server/db"));
    ({ users } = await import("@shared/schema"));
    ({ storage } = await import("../server/storage"));

    admins = await db
      .select({ id: users.id, email: users.email, isAdmin: users.isAdmin, role: users.role })
      .from(users)
      .where(or(eq(users.isAdmin, true), eq(users.role, "admin"), eq(users.role, "super_admin")));

    let raw: string | null = null;
    try { raw = await storage.getAppSetting("admin_email_allowlist"); } catch { /* env fallback */ }
    if (!raw || !raw.trim()) raw = process.env.ADMIN_EMAIL_ALLOWLIST ?? null;
    allow = raw && raw.trim()
      ? new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))
      : null;
  });

  afterAll(async () => { await pool?.end?.().catch(() => {}); });

  it("isAdmin and role never disagree", () => {
    const drifted = admins.filter((a) => {
      const roleAdmin = a.role === "admin" || a.role === "super_admin";
      return !!a.isAdmin !== roleAdmin;
    });
    const detail = drifted.map((a) => `  ${a.email}: isAdmin=${a.isAdmin} role=${a.role}`).join("\n");
    expect(
      drifted,
      `Admin columns drifted — requireAdmin ORs them, so the MORE permissive value wins:\n${detail}`,
    ).toHaveLength(0);
  });

  it("at least one account can actually reach the admin panel", () => {
    // super_admin in the DB is not sufficient: requireAdmin also enforces the
    // allowlist. This is the anti-lockout invariant.
    const reachable = admins.filter(
      (a) => a.role === "super_admin" && (allow === null || allow.has((a.email ?? "").toLowerCase())),
    );
    expect(
      reachable.length,
      "No account satisfies BOTH super_admin and the email allowlist — admin panel is unreachable.",
    ).toBeGreaterThan(0);
  });

  it("flags admin rows that the allowlist silently blocks", () => {
    if (allow === null) return; // allowlist not configured, so not enforced
    const blocked = admins.filter((a) => !allow!.has((a.email ?? "").toLowerCase()));
    const detail = blocked.map((a) => `  ${a.email} (role=${a.role})`).join("\n");
    expect(
      blocked,
      `These accounts are admin in the database but excluded by the allowlist, so they get 403 ` +
        `while every UI shows them as admin. Revoke them properly (scripts/revokeAdmin.ts) ` +
        `or add them to the allowlist:\n${detail}`,
    ).toHaveLength(0);
  });

  it("no admin holds a role value outside the known set", () => {
    const KNOWN = new Set(["user", "admin", "super_admin"]);
    const odd = admins.filter((a) => a.role != null && !KNOWN.has(a.role));
    expect(odd.map((a) => `${a.email}=${a.role}`), "Unrecognised role value").toEqual([]);
  });
});
