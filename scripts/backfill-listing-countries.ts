/**
 * One-time backfill: set country/city on listings where country IS NULL
 * by inheriting from the listing owner's user profile.
 *
 * Run once after deploying the listing-creation fix:
 *   npx tsx scripts/backfill-listing-countries.ts
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";

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

  const rows = result.rows as Array<{ id: string; title: string; country: string }>;
  console.log(`Backfilled ${rows.length} listing(s):`);
  rows.forEach((r) => console.log(`  ${r.id} — "${r.title}" → ${r.country}`));
  console.log("Done.");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
