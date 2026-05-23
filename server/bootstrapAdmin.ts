import bcrypt from "bcryptjs";
import { eq, and, ne, notInArray, sql } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";

/**
 * Provision the configured "founder" admin account on every server start.
 *
 * Reads `BOOTSTRAP_ADMIN_EMAIL` (env var, shared) and
 * `BOOTSTRAP_ADMIN_PASSWORD` (secret). When both are set:
 *
 *   1. Find or create that user. If the user exists, the password hash is
 *      refreshed to match the current secret so rotating the secret in the
 *      env actually rotates the live password on the next deploy.
 *   2. Force `isAdmin = true`, `role = "super_admin"`,
 *      `founderBadge = true`. The waitlist gate already exempts admins on
 *      the client side, so this lets the founder log in even while the site
 *      is in waitlist mode. Verification (`isVerified`) is NOT forced — the
 *      founder goes through the same KYC/manual-verify flow as any user, so
 *      the production verification path can be exercised end-to-end.
 *   3. Demote every other user that currently has `isAdmin = true` or any
 *      admin-flavored `role`. This enforces the "only the founder is admin"
 *      requirement defensively at the data layer — the
 *      `requireAdmin` middleware also re-checks against
 *      `ADMIN_EMAIL_ALLOWLIST` at request time as defense in depth.
 *
 * The function is idempotent and safe to run on every boot.
 *
 * Logs but never throws — failure here must not crash the server.
 */
export async function bootstrapAdmin(): Promise<void> {
  const emailRaw = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!emailRaw || !password) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[bootstrapAdmin] BOOTSTRAP_ADMIN_EMAIL and/or BOOTSTRAP_ADMIN_PASSWORD not set — no founder admin will be provisioned. Set both before exposing the admin panel.",
      );
    }
    return;
  }

  const email = emailRaw.trim().toLowerCase();
  if (password.length < 8) {
    console.error(
      "[bootstrapAdmin] BOOTSTRAP_ADMIN_PASSWORD is shorter than 8 characters — refusing to provision admin. Update the secret and restart.",
    );
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      await db
        .update(users)
        .set({
          password: passwordHash,
          isAdmin: true,
          role: "super_admin",
          founderBadge: true,
          founderBadgeAt: existing.founderBadgeAt ?? new Date(),
          isPaused: false,
          isBanned: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
      console.log(
        `[bootstrapAdmin] Refreshed founder admin account for ${email} (id=${existing.id}).`,
      );
    } else {
      const [created] = await db
        .insert(users)
        .values({
          email,
          password: passwordHash,
          fullName: "Bareter Founder",
          businessName: "Bareter",
          bio: "Platform founder.",
          location: "Dubai",
          isAdmin: true,
          role: "super_admin",
          founderBadge: true,
          founderBadgeAt: new Date(),
          profileCompleted: true,
        })
        .returning();
      console.log(
        `[bootstrapAdmin] Created founder admin account for ${email} (id=${created.id}).`,
      );
    }

    // Defensively demote any admin user whose email is NOT in the allowlist.
    // Merge the env-var list WITH the DB-stored list so that admins created
    // through the admin panel are never accidentally demoted on restart.
    const allowlistRaw = process.env.ADMIN_EMAIL_ALLOWLIST ?? "";
    const envEmails = allowlistRaw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

    // Also read the DB-stored allowlist so panel-created admins are protected.
    let dbEmails: string[] = [];
    try {
      const { storage } = await import("./storage");
      const dbRaw = await storage.getAppSetting("admin_email_allowlist");
      if (dbRaw) dbEmails = dbRaw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    } catch { /* non-fatal */ }

    const allowedEmails = [email, ...envEmails, ...dbEmails];
    // Deduplicate
    const protectedEmails = [...new Set(allowedEmails)];

    const demoted = await db
      .update(users)
      .set({
        isAdmin: false,
        role: "user",
        updatedAt: new Date(),
      })
      .where(
        and(
          notInArray(users.email, protectedEmails),
          // Match anyone currently flagged as admin in either dimension.
          sql`(${users.isAdmin} = true OR ${users.role} IN ('admin', 'super_admin'))`,
        ),
      )
      .returning({ id: users.id, email: users.email });

    if (demoted.length > 0) {
      const list = demoted.map((u) => u.email).join(", ");
      console.log(
        `[bootstrapAdmin] Demoted ${demoted.length} previously-admin user(s) not in allowlist: ${list}`,
      );
    }

    // Ensure every email in the allowlist (other than the bootstrap account
    // which was already handled above) has isAdmin=true and at least "admin" role.
    const secondaryAdmins = protectedEmails.filter((e) => e !== email);
    if (secondaryAdmins.length > 0) {
      for (const adminEmail of secondaryAdmins) {
        await db
          .update(users)
          .set({ isAdmin: true, role: "super_admin", updatedAt: new Date() })
          .where(eq(users.email, adminEmail));
      }
      console.log(
        `[bootstrapAdmin] Ensured admin privileges for allowlist members: ${secondaryAdmins.join(", ")}`,
      );
    }
  } catch (err) {
    console.error("[bootstrapAdmin] Failed to provision founder admin:", err);
  }
}
