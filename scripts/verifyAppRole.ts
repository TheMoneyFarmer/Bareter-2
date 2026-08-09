// Verify the least-privilege application role before switching DATABASE_URL to it.
//
// Switching the app to a new database role is a change that can take the whole
// product down — if one grant is missing, every request 500s. This proves both
// halves BEFORE the cutover:
//
//   1. Everything the app legitimately does still works (read, insert, update,
//      delete, sequence access, and access to every table).
//   2. Everything destructive is refused (DROP, TRUNCATE, ALTER, CREATE).
//
// Read/write checks run inside a transaction that is ALWAYS rolled back, so this
// leaves no rows behind even when pointed at a live database.
//
// Usage:
//   APP_ROLE_URL='postgresql://bareter_app:...@host/neondb?sslmode=require' \
//     node --import tsx scripts/verifyAppRole.ts

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const URL_ = process.env.APP_ROLE_URL;
if (!URL_) {
  console.error("Set APP_ROLE_URL to the bareter_app connection string.");
  process.exit(1);
}

const pool = new Pool({ connectionString: URL_.replace(/([?&])channel_binding=[^&]*/, "$1") });

let pass = 0;
let fail = 0;

function ok(label: string, detail = "") {
  pass++;
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}
function bad(label: string, detail = "") {
  fail++;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

/** A statement that MUST succeed. */
async function mustWork(label: string, sql: string) {
  try {
    await pool.query(sql);
    ok(label);
  } catch (e: any) {
    bad(label, e?.message?.split("\n")[0]);
  }
}

/** A statement that MUST be refused. Succeeding here is a security failure. */
async function mustBeDenied(label: string, sql: string) {
  try {
    await pool.query(sql);
    bad(`${label} — WAS ALLOWED (expected permission denied)`);
  } catch (e: any) {
    const msg = e?.message ?? "";
    if (/permission denied|must be owner|denied for/i.test(msg)) ok(label, "denied as expected");
    else bad(label, `failed for the wrong reason: ${msg.split("\n")[0]}`);
  }
}

async function main() {
  const who = await pool.query("select current_user, current_database()");
  console.log(`\nconnected as ${who.rows[0].current_user} on ${who.rows[0].current_database}\n`);

  if (who.rows[0].current_user !== "bareter_app") {
    console.error(`Expected to connect as bareter_app. Refusing to continue.`);
    process.exit(1);
  }

  console.log("── the app must still work ──");
  await mustWork("SELECT from users", "select id from users limit 1");
  await mustWork("SELECT from listings", "select id from listings limit 1");
  await mustWork("SELECT from session (login depends on it)", 'select sid from "session" limit 1');

  // Write path, always rolled back.
  try {
    await pool.query("BEGIN");
    await pool.query(
      `insert into users (email, password, full_name) values ($1,$2,$3)`,
      [`approle-check-${Date.now()}@example.invalid`, "x".repeat(60), "App Role Check"],
    );
    await pool.query(`update users set bio='x' where email like 'approle-check-%'`);
    await pool.query(`delete from users where email like 'approle-check-%'`);
    await pool.query("ROLLBACK");
    ok("INSERT / UPDATE / DELETE on users (rolled back)");
  } catch (e: any) {
    await pool.query("ROLLBACK").catch(() => {});
    bad("INSERT / UPDATE / DELETE on users", e?.message?.split("\n")[0]);
  }

  // Every table must be readable, or some endpoint will 500 after cutover.
  const tables = await pool.query(
    `select tablename from pg_tables where schemaname='public' order by tablename`,
  );
  const unreadable: string[] = [];
  for (const t of tables.rows) {
    try {
      await pool.query(`select 1 from "${t.tablename}" limit 1`);
    } catch {
      unreadable.push(t.tablename);
    }
  }
  if (unreadable.length === 0) ok(`SELECT on all ${tables.rows.length} tables`);
  else bad(`SELECT on all tables`, `unreadable: ${unreadable.join(", ")}`);

  console.log("\n── destructive statements must be refused ──");
  const sample = tables.rows[0]?.tablename ?? "users";
  await mustBeDenied(`TRUNCATE ${sample}`, `truncate table "${sample}"`);
  await mustBeDenied(`DROP TABLE ${sample}`, `drop table "${sample}"`);
  await mustBeDenied(`ALTER TABLE ${sample}`, `alter table "${sample}" add column zz_probe int`);
  await mustBeDenied("CREATE TABLE in public", "create table zz_probe_table (id int)");

  console.log("\n── role attributes ──");
  const attrs = await pool.query(
    `select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = current_user`,
  );
  const a = attrs.rows[0];
  for (const [k, v] of Object.entries(a)) {
    v === false ? ok(`${k} = false`) : bad(`${k} = ${v} (expected false)`);
  }

  console.log(`\n────────── ${pass} passed, ${fail} failed ──────────`);
  if (fail > 0) {
    console.log("DO NOT switch DATABASE_URL until every check passes.");
  } else {
    console.log("Safe to switch DATABASE_URL to this role. Keep the owner");
    console.log("credentials for migrations only — not in the running app.");
  }
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("verifyAppRole failed:", e); process.exit(1); });
