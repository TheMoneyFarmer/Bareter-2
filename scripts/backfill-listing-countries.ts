/**
 * One-time backfill: set country/city on listings that have country = NULL
 * by inheriting from the listing owner's user profile.
 *
 * Run once after deploying the listing-creation fix:
 *   npx tsx scripts/backfill-listing-countries.ts
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import "dotenv/config";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error("DATABASE_URL not set"); process.exit(1); }

const client = neon(dbUrl);
const db = drizzle(client);

async function run() {
  const result = await db.execute(sql`
    UPDATE listings l
    SET
      country = u.country,
      city    = COALESCE(l.city, u.city)
    FROM users u
    WHERE l.user_id = u.id
      AND l.country IS NULL
      AND u.country IS NOT NULL
      AND l.deleted_at IS NULL
    RETURNING l.id, l.title, u.country
  `);

  console.log(`Backfilled ${result.rows.length} listing(s):`);
  result.rows.forEach((r: any) => console.log(`  ${r.id} — "${r.title}" → ${r.country}`));
  console.log("Done.");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
