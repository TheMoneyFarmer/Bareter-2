/**
 * Migrates admin and super_admin accounts from the old database to the new one.
 *
 * Usage:
 *   NEW_DATABASE_URL="postgresql://..." node scripts/migrate-admins.mjs
 */

import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = resolve(__dirname, "../.env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^DATABASE_URL=(.+)$/);
    if (match) return match[1].trim();
  }
  throw new Error("DATABASE_URL not found in .env.local");
}

const JSONB_COLS = new Set([
  "what_i_offer", "what_i_need", "portfolio_images", "social_links",
  "social_profiles", "creator_profile", "preferred_categories",
  "didit_verification_data",
]);

// Sanitize a row: replace any invalid/null JSONB with safe defaults
function sanitizeRow(row) {
  const clean = { ...row };
  for (const col of JSONB_COLS) {
    if (col in clean) {
      const val = clean[col];
      if (val === null || val === undefined) {
        // Use empty array for array-typed cols, null for object-typed cols
        const arrayDefaults = new Set(["what_i_offer", "what_i_need", "portfolio_images", "social_profiles", "preferred_categories"]);
        clean[col] = arrayDefaults.has(col) ? [] : null;
        continue;
      }
      // Validate it's actually serialisable
      try {
        JSON.stringify(val);
      } catch {
        const arrayDefaults = new Set(["what_i_offer", "what_i_need", "portfolio_images", "social_profiles", "preferred_categories"]);
        clean[col] = arrayDefaults.has(col) ? [] : null;
      }
    }
  }
  return clean;
}

const OLD_DB_URL = loadEnvLocal();
const NEW_DB_URL = process.env.NEW_DATABASE_URL;

if (!NEW_DB_URL) {
  console.error("ERROR: Set NEW_DATABASE_URL environment variable before running.");
  process.exit(1);
}

const { Client } = pg;

async function insertAdmin(newClient, admin, columns) {
  const colList = columns.map(c => `"${c}"`).join(", ");
  // Explicitly stringify JSONB columns so pg doesn't re-interpret them
  const values = columns.map(c => {
    const val = admin[c];
    if (JSONB_COLS.has(c) && val !== null && val !== undefined) {
      return JSON.stringify(val);
    }
    return val;
  });
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

  await newClient.query(
    `INSERT INTO users (${colList}) VALUES (${placeholders})
     ON CONFLICT (email) DO UPDATE SET
       role = EXCLUDED.role,
       is_admin = EXCLUDED.is_admin,
       full_name = EXCLUDED.full_name,
       password = EXCLUDED.password`,
    values
  );
}

async function main() {
  const oldClient = new Client({ connectionString: OLD_DB_URL });
  const newClient = new Client({ connectionString: NEW_DB_URL });

  await oldClient.connect();
  console.log("Connected to OLD database.");
  await newClient.connect();
  console.log("Connected to NEW database.");

  const { rows: admins } = await oldClient.query(`
    SELECT * FROM users
    WHERE role IN ('admin', 'super_admin') OR is_admin = true
    ORDER BY created_at ASC
  `);

  console.log(`\nFound ${admins.length} admin account(s):`);
  admins.forEach(u => console.log(`  - ${u.email} (role: ${u.role})`));
  console.log();

  if (admins.length === 0) {
    console.log("Nothing to migrate.");
    await oldClient.end();
    await newClient.end();
    return;
  }

  const columns = Object.keys(admins[0]);
  let migrated = 0;
  let failed = 0;

  for (const admin of admins) {
    // First attempt: raw row
    try {
      await insertAdmin(newClient, admin, columns);
      console.log(`  Migrated: ${admin.email}`);
      migrated++;
      continue;
    } catch (err) {
      if (!err.message.includes("json")) {
        console.error(`  FAILED (unrecoverable) ${admin.email}: ${err.message}`);
        failed++;
        continue;
      }
    }

    // Second attempt: sanitize JSONB columns and retry
    try {
      const clean = sanitizeRow(admin);
      await insertAdmin(newClient, clean, columns);
      console.log(`  Migrated (sanitized): ${admin.email}`);
      migrated++;
    } catch (err) {
      console.error(`  FAILED after sanitize ${admin.email}: ${err.message}`);
      failed++;
    }
  }

  await oldClient.end();
  await newClient.end();

  console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error("Migration crashed:", err.message);
  process.exit(1);
});
