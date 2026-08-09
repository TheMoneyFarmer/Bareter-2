// Revoke platform admin from an account.
//
// Admin revocation is one of the few operations that can lock you out of your
// own product, so this script is built around not doing that:
//
//   1. Dry run by default — nothing is written without --apply.
//   2. Prints the database host, and --apply refuses unless you name it
//      (--host-confirm=...). This project has more than one database reachable
//      from different places; an earlier migration hit the wrong one.
//   3. PROTECTED_EMAILS can never be revoked, whatever is passed on the CLI.
//   4. Anti-lockout: the change is rejected unless at least one OTHER account
//      remains a super_admin AND is present in the admin email allowlist —
//      i.e. someone can still actually sign in to the admin panel afterwards.
//      Being super_admin in the DB is not enough on its own, because
//      requireAdmin() also enforces the allowlist.
//
// Usage:
//   node --env-file-if-exists=.env.local --import tsx scripts/revokeAdmin.ts bill@cravd.io
//   node --env-file-if-exists=.env.local --import tsx scripts/revokeAdmin.ts bill@cravd.io --apply --host-confirm=ep-xxx

import { eq, or } from "drizzle-orm";
import { db, pool } from "../server/db";
import { users } from "@shared/schema";
import { storage } from "../server/storage";

/** Founder accounts. Never revocable by this script, by any argument. */
const PROTECTED_EMAILS = new Set([
  "thandolwenkosimceeyah@gmail.com",
  "thando@bareter.com",
]);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const target = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();

async function allowlist(): Promise<Set<string> | null> {
  let raw: string | null = null;
  try { raw = await storage.getAppSetting("admin_email_allowlist"); } catch { /* fall through */ }
  if (!raw || !raw.trim()) raw = process.env.ADMIN_EMAIL_ALLOWLIST ?? null;
  if (!raw || !raw.trim()) return null;
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

async function main() {
  if (!target) {
    console.error("Usage: revokeAdmin.ts <email> [--apply --host-confirm=<host-substring>]");
    process.exit(1);
  }

  let host = "unknown";
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname; }
  catch { console.error("DATABASE_URL missing or unparseable — refusing to run."); process.exit(1); }

  console.log("──────────────────────────────────────────────");
  console.log(`  host   : ${host}`);
  console.log(`  target : ${target}`);
  console.log(`  mode   : ${APPLY ? "APPLY (writes)" : "DRY RUN"}`);
  console.log("──────────────────────────────────────────────\n");

  if (PROTECTED_EMAILS.has(target)) {
    console.error(`REFUSING: ${target} is a protected founder account.`);
    process.exit(1);
  }

  const admins = await db
    .select({ id: users.id, email: users.email, isAdmin: users.isAdmin, role: users.role })
    .from(users)
    .where(or(eq(users.isAdmin, true), eq(users.role, "admin"), eq(users.role, "super_admin")));

  console.log("Current admin accounts:");
  admins.forEach((a) => console.log(`  ${String(!!a.isAdmin).padEnd(5)} ${String(a.role).padEnd(12)} ${a.email}`));

  const victim = admins.find((a) => (a.email ?? "").toLowerCase() === target);
  if (!victim) {
    console.log(`\n${target} holds no admin signal — nothing to do.`);
    await pool.end();
    return;
  }

  // ── Anti-lockout ─────────────────────────────────────────────────────────
  // Someone else must still be able to actually reach the admin panel, which
  // means super_admin in the DB *and* allowed by the email allowlist.
  const allow = await allowlist();
  const survivors = admins.filter((a) => {
    if (a.id === victim.id) return false;
    const isSuper = a.role === "super_admin";
    const allowed = allow === null || allow.has((a.email ?? "").toLowerCase());
    return isSuper && allowed;
  });

  console.log(`\nAllowlist: ${allow === null ? "not configured (not enforced)" : `${allow.size} entries`}`);
  console.log(`Admins who could still sign in after this change: ${survivors.length}`);
  survivors.forEach((s) => console.log(`  - ${s.email}`));

  if (survivors.length === 0) {
    console.error("\nREFUSING: revoking this account would leave nobody able to access the admin panel.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — would set isAdmin=false, role="user" for ${target}.`);
    console.log("Re-run with --apply --host-confirm=<part of the host above> to commit.");
    await pool.end();
    return;
  }

  const claimed = args.find((a) => a.startsWith("--host-confirm="))?.split("=")[1] ?? "";
  if (!claimed || !host.includes(claimed)) {
    console.error(`\nREFUSING --apply: pass --host-confirm=${host.split(".")[0]} to confirm the database.`);
    process.exit(1);
  }

  await storage.updateUserPrivileged(victim.id, { isAdmin: false, role: "user" }, "admin-action");
  console.log(`\nRevoked admin from ${target}.`);

  const after = await db
    .select({ email: users.email, isAdmin: users.isAdmin, role: users.role })
    .from(users)
    .where(or(eq(users.isAdmin, true), eq(users.role, "admin"), eq(users.role, "super_admin")));
  console.log("\nAdmin accounts now:");
  after.forEach((a) => console.log(`  ${String(!!a.isAdmin).padEnd(5)} ${String(a.role).padEnd(12)} ${a.email}`));

  const stillProtected = PROTECTED_EMAILS.size;
  const founderOk = [...PROTECTED_EMAILS].every((e) =>
    after.some((a) => (a.email ?? "").toLowerCase() === e && a.role === "super_admin"),
  );
  console.log(`\nFounder accounts intact: ${founderOk ? "YES" : "NO — INVESTIGATE"} (${stillProtected} checked)`);

  await pool.end();
}

main().catch((err) => { console.error("revokeAdmin failed:", err); process.exit(1); });
