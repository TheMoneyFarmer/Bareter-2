#!/usr/bin/env npx tsx
/**
 * One-time data migration — copies all rows from SOURCE database into TARGET.
 *
 * SOURCE is never modified or deleted from. Safe to re-run.
 * Uses INSERT … ON CONFLICT DO NOTHING so existing target rows are preserved.
 *
 * Usage:
 *   SOURCE_URL="postgres://..." TARGET_URL="postgres://..." npx tsx scripts/migrate-db.ts
 *
 * TARGET_URL defaults to DATABASE_URL if not set (reads from .env.local when
 * invoked via: node --env-file-if-exists=.env.local --import tsx scripts/migrate-db.ts)
 */

import { Pool } from "pg";

const SOURCE_URL = process.env.SOURCE_URL;
const TARGET_URL = process.env.TARGET_URL || process.env.DATABASE_URL;

if (!SOURCE_URL || !TARGET_URL) {
  console.error("Set SOURCE_URL and TARGET_URL (or DATABASE_URL) before running.");
  process.exit(1);
}

function log(msg: string) {
  console.log(`[migrate] ${new Date().toISOString()} — ${msg}`);
}

// Parent tables first — children that reference them come after.
const TABLE_PRIORITY = [
  "users",
  "app_settings",
  "blog_posts",
  "waitlist_entries",
  "creator_profiles",
  "business_profiles",
  "listings",
  "deals",
  "deal_proposals",
  "notifications",
  "messages",
  "reviews",
  "barter_credits",
  "push_subscriptions",
  "session",
];

async function getTableNames(pool: Pool): Promise<string[]> {
  const r = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  return r.rows.map((row: any) => row.table_name as string);
}

async function getColumns(pool: Pool, table: string): Promise<string[]> {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 AND table_schema = 'public'
     ORDER BY ordinal_position`,
    [table]
  );
  return r.rows.map((row: any) => row.column_name as string);
}

async function getPrimaryKeys(pool: Pool, table: string): Promise<string[]> {
  const r = await pool.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema   = kcu.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_name      = $1
       AND tc.table_schema    = 'public'`,
    [table]
  );
  return r.rows.map((row: any) => row.column_name as string);
}

function serializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function migrateTable(
  source: Pool,
  target: Pool,
  table: string
): Promise<{ inserted: number; skipped: number }> {
  const sourceCols = await getColumns(source, table);
  const targetCols = new Set(await getColumns(target, table));

  // Only use columns that exist in BOTH databases (handles schema drift)
  const cols = sourceCols.filter((c) => targetCols.has(c));
  if (!cols.length) return { inserted: 0, skipped: 0 };

  const pkCols = await getPrimaryKeys(target, table);
  const conflictClause =
    pkCols.length > 0
      ? `ON CONFLICT (${pkCols.map((c) => `"${c}"`).join(", ")}) DO NOTHING`
      : "ON CONFLICT DO NOTHING";

  const rows = (await source.query(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM "${table}"`)).rows;
  if (!rows.length) return { inserted: 0, skipped: 0 };

  const colList = cols.map((c) => `"${c}"`).join(", ");
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const values = cols.map((c) => serializeValue(row[c]));
    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");

    try {
      const result = await target.query(
        `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ${conflictClause}`,
        values
      );
      if ((result.rowCount ?? 0) > 0) inserted++;
      else skipped++;
    } catch (err: any) {
      if (err.code === "23505") {
        skipped++; // duplicate key — already in target
      } else if (err.code === "23503") {
        skipped++; // foreign key violation — parent not migrated yet
        log(`  WARN FK violation on ${table}: ${err.detail ?? err.message}`);
      } else {
        log(`  WARN ${table}: ${err.message}`);
        skipped++;
      }
    }
  }

  return { inserted, skipped };
}

async function run() {
  log("Connecting to SOURCE …");
  const source = new Pool({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false }, max: 3 });

  log("Connecting to TARGET …");
  const target = new Pool({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false }, max: 3 });

  await source.query("SELECT 1");
  log("SOURCE connected ✓");
  await target.query("SELECT 1");
  log("TARGET connected ✓");

  const sourceTables = await getTableNames(source);
  const targetTables = new Set(await getTableNames(target));

  // Count rows in source for the summary
  log(`\nSOURCE tables: ${sourceTables.length}`);
  for (const t of sourceTables) {
    const { rows } = await source.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    log(`  ${t}: ${rows[0].n} rows`);
  }

  // Determine migration order
  const toMigrate = [
    ...TABLE_PRIORITY.filter((t) => sourceTables.includes(t) && targetTables.has(t)),
    ...sourceTables.filter((t) => !TABLE_PRIORITY.includes(t) && targetTables.has(t)),
  ];

  const skippedTables = sourceTables.filter((t) => !targetTables.has(t));
  if (skippedTables.length) {
    log(`\nTables in SOURCE but not TARGET (schema drift — skipping): ${skippedTables.join(", ")}`);
  }

  log(`\nMigrating ${toMigrate.length} tables …\n`);

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const table of toMigrate) {
    const { inserted, skipped } = await migrateTable(source, target, table);
    const tag = inserted > 0 ? "✓" : "·";
    log(`${tag} ${table}: ${inserted} inserted, ${skipped} skipped`);
    totalInserted += inserted;
    totalSkipped += skipped;
  }

  await source.end();
  await target.end();

  log(`\n${"═".repeat(50)}`);
  log(`DONE.  ${totalInserted} rows inserted  |  ${totalSkipped} rows skipped`);
  log(`SOURCE database is completely untouched.`);
  log(`${"═".repeat(50)}`);
}

run().catch((err) => {
  console.error("[migrate] FATAL:", err.message);
  process.exit(1);
});
