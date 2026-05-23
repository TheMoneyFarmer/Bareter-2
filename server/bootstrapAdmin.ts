import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";

/**
 * Provision admin accounts on every server start.
 *
 * 1. Find or create the BOOTSTRAP_ADMIN_EMAIL user and force it to
 *    super_admin + isAdmin=true. Password is refreshed from the env secret.
 * 2. Grant admin to every email in ADMIN_EMAIL_ALLOWLIST.
 *
 * The old "demote everyone else" logic has been removed — it was too
 * aggressive and kept wiping legitimate admin accounts on restart.
 * Security is enforced at request time by requireAdmin checking the
 * allowlist, so the DB-level demote step was redundant and harmful.
 */
export async function bootstrapAdmin(): Promise<void> {
  const emailRaw = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!emailRaw || !password) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[bootstrapAdmin] BOOTSTRAP_ADMIN_EMAIL and/or BOOTSTRAP_ADMIN_PASSWORD not set.",
      );
    }
    return;
  }

  const email = emailRaw.trim().toLowerCase();
  if (password.length < 8) {
    console.error("[bootstrapAdmin] BOOTSTRAP_ADMIN_PASSWORD too short — skipping.");
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

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
      console.log(`[bootstrapAdmin] Refreshed founder admin: ${email}`);
    } else {
      await db.insert(users).values({
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
      });
      console.log(`[bootstrapAdmin] Created founder admin: ${email}`);
    }

    // Grant admin to all secondary emails in ADMIN_EMAIL_ALLOWLIST.
    const allowlistRaw = process.env.ADMIN_EMAIL_ALLOWLIST ?? "";
    const secondaryAdmins = allowlistRaw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && e !== email);

    for (const adminEmail of secondaryAdmins) {
      await db
        .update(users)
        .set({ isAdmin: true, role: "super_admin", updatedAt: new Date() })
        .where(eq(users.email, adminEmail));
    }

    if (secondaryAdmins.length > 0) {
      console.log(`[bootstrapAdmin] Ensured admin for: ${secondaryAdmins.join(", ")}`);
    }
  } catch (err) {
    console.error("[bootstrapAdmin] Failed:", err);
  }
}
