/**
 * Direct DB admin account reset — run with:
 *   node --env-file-if-exists=.env.local --import tsx scripts/reset-admin.ts
 *
 * Creates or resets the admin account using BOOTSTRAP_ADMIN_EMAIL +
 * BOOTSTRAP_ADMIN_PASSWORD from .env.local. No server needed.
 */
import bcrypt from "bcryptjs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import ws from "ws";
import { users } from "../shared/schema";

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
const password = (process.env.BOOTSTRAP_ADMIN_PASSWORD || "").trim();

if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }
if (!email)        { console.error("BOOTSTRAP_ADMIN_EMAIL not set"); process.exit(1); }
if (!password)     { console.error("BOOTSTRAP_ADMIN_PASSWORD not set"); process.exit(1); }

console.log(`\nResetting admin: ${email}`);

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle({ client: pool });

try {
  const hash = await bcrypt.hash(password, 10);
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    await db.update(users)
      .set({ password: hash, isAdmin: true, role: "super_admin", isBanned: false, isPaused: false })
      .where(eq(users.id, existing.id));
    console.log(`✓ Updated password for existing account: ${email}`);
  } else {
    await db.insert(users).values({
      email,
      password: hash,
      fullName: "Bareter Founder",
      businessName: "Bareter",
      isAdmin: true,
      role: "super_admin",
      founderBadge: true,
      founderBadgeAt: new Date(),
      profileCompleted: true,
    });
    console.log(`✓ Created new admin account: ${email}`);
  }

  // Verify the hash works
  const ok = await bcrypt.compare(password, hash);
  console.log(`✓ Password verification: ${ok ? "PASS" : "FAIL"}`);
  console.log(`\nYou can now log in with:`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}\n`);
} catch (err) {
  console.error("Error:", err);
} finally {
  await pool.end();
}
