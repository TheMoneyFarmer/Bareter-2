#!/usr/bin/env npx tsx
/**
 * Daily database backup — dumps the live PostgreSQL database and uploads
 * the compressed file to Cloudflare R2.
 *
 * Runs via the Company OS scheduler every day at 02:30 Dubai time.
 * Can also be triggered manually: npx tsx scripts/backup-db.ts
 *
 * Keeps the last 30 daily backups in R2 (older ones are deleted automatically).
 */

import { execSync } from "child_process";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import os from "os";

const KEEP_BACKUPS = 180; // 6 backups/day × 30 days

function log(msg: string) {
  console.log(`[backup-db] ${new Date().toISOString()} — ${msg}`);
}

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
  const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
  const r2Bucket = process.env.R2_BUCKET_NAME;

  if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
    throw new Error("R2 credentials not set (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)");
  }

  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey },
  });

  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `bareter-db-backup-${dateStr}.sql.gz`;
  const tmpPath = path.join(os.tmpdir(), filename);

  log(`Starting pg_dump → ${tmpPath}`);

  let usedFallback = false;
  try {
    execSync(`pg_dump "${dbUrl}" | gzip > "${tmpPath}"`, { stdio: "pipe" });
    const sizeKb = fs.statSync(tmpPath).size / 1024;
    if (sizeKb < 0.5) {
      // pg_dump ran but produced empty output (common with Neon TLS — fallback)
      log(`pg_dump produced empty output (${sizeKb.toFixed(1)} KB) — using node-postgres fallback`);
      usedFallback = true;
    } else {
      log(`pg_dump complete — ${sizeKb.toFixed(1)} KB`);
    }
  } catch (err: any) {
    log("pg_dump not available — using node-postgres fallback");
    usedFallback = true;
  }

  if (usedFallback) {
    await nodePostgresFallback(dbUrl, tmpPath);
  }

  const fileContent = fs.readFileSync(tmpPath);
  const key = `backups/db/${filename}`;

  log(`Uploading to R2: ${r2Bucket}/${key}`);
  await r2.send(new PutObjectCommand({
    Bucket: r2Bucket,
    Key: key,
    Body: fileContent,
    ContentType: "application/gzip",
    Metadata: { "backup-date": dateStr, "source": "bareter-db" },
  }));
  log(`Upload complete`);

  fs.unlinkSync(tmpPath);

  // Prune oldest backups, keep last KEEP_BACKUPS
  log(`Pruning — keeping newest ${KEEP_BACKUPS} backups`);
  const list = await r2.send(new ListObjectsV2Command({ Bucket: r2Bucket, Prefix: "backups/db/" }));
  const objects = (list.Contents ?? [])
    .filter(o => o.Key && o.Key.endsWith(".sql.gz"))
    .sort((a, b) => (a.Key! < b.Key! ? -1 : 1));

  const toDelete = objects.slice(0, Math.max(0, objects.length - KEEP_BACKUPS));
  for (const obj of toDelete) {
    await r2.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: obj.Key! }));
    log(`Deleted old backup: ${obj.Key}`);
  }

  log(`Done. ${Math.min(objects.length, KEEP_BACKUPS)} backups retained in R2.`);
}

async function nodePostgresFallback(dbUrl: string, outputPath: string) {
  const { Pool } = await import("pg");
  const { createGzip } = await import("zlib");
  const { pipeline } = await import("stream/promises");
  const { createWriteStream } = await import("fs");

  const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 15000 });

  const tables = (await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
  )).rows.map((r: any) => r.table_name as string);

  const lines: string[] = [
    "-- Bareter DB backup (node-postgres fallback)",
    `-- Date: ${new Date().toISOString()}`,
    "-- Tables: " + tables.join(", "),
    "",
  ];

  for (const table of tables) {
    try {
      const cols = (await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position",
        [table]
      )).rows.map((r: any) => r.column_name as string);

      const rows = (await pool.query(`SELECT * FROM "${table}"`)).rows;
      if (!rows.length) continue;

      lines.push(`-- TABLE: ${table} (${rows.length} rows)`);
      for (const row of rows) {
        const vals = cols.map(c => {
          const v = row[c];
          if (v === null || v === undefined) return "NULL";
          if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
          if (typeof v === "number") return String(v);
          if (v instanceof Date) return `'${v.toISOString()}'`;
          if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
          return `'${String(v).replace(/'/g, "''")}'`;
        });
        lines.push(`INSERT INTO "${table}" ("${cols.join('","')}") VALUES (${vals.join(",")}) ON CONFLICT DO NOTHING;`);
      }
      lines.push("");
    } catch (e: any) {
      lines.push(`-- SKIPPED ${table}: ${e.message}`);
    }
  }

  await pool.end();

  const tmpSql = outputPath.replace(".gz", "");
  fs.writeFileSync(tmpSql, lines.join("\n"), "utf8");

  await pipeline(
    fs.createReadStream(tmpSql),
    createGzip(),
    createWriteStream(outputPath)
  );

  fs.unlinkSync(tmpSql);
  log(`Fallback export complete — ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

run().catch(err => {
  console.error("[backup-db] FAILED:", err);
  process.exit(1);
});
