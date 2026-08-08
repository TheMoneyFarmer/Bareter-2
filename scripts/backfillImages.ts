// Backfill: re-encode existing images to sane sizes and generate thumbnails.
//
// Listing photos uploaded before the resize pipeline are raw camera originals.
// Measured live in production: one listing image was 3.43 MB (4032x3024) and a
// 16-listing browse page pulled ~55 MB. After processing the same image is
// ~292 KB display / ~44 KB thumbnail.
//
// For every image this script:
//   1. downloads the current bytes,
//   2. produces a display copy (<=1600px) and a thumbnail (<=600px, WebP),
//   3. uploads both to R2,
//   4. repoints the DB row at the new display URL.
//
// SAFETY
//   - Dry run by default. Nothing is written without --apply.
//   - Originals are never deleted, so any row can be repointed back.
//   - A row is only updated after BOTH uploads succeed; any failure leaves that
//     row completely untouched and is reported at the end.
//
// Usage:
//   node --env-file-if-exists=.env.local --import tsx scripts/backfillImages.ts
//   node --env-file-if-exists=.env.local --import tsx scripts/backfillImages.ts --apply

import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { listings, users, businessProfiles } from "@shared/schema";
import { processImage, isResizableImage, thumbKeyFor } from "../server/lib/images";
import { uploadToR2, generateR2Key, r2Enabled } from "../server/lib/r2";

const APPLY = process.argv.includes("--apply");
const ORIGIN = (process.env.BACKFILL_ORIGIN || "https://bareter.com").replace(/\/$/, "");

/** Images already produced by the new pipeline are WebP — skip them. */
function alreadyProcessed(url: string): boolean {
  return /\.webp($|\?)/i.test(url);
}

let downloaded = 0;
let processedCount = 0;
let bytesBefore = 0;
let bytesAfter = 0;
const failures: string[] = [];

async function fetchBytes(url: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const absolute = url.startsWith("http") ? url : `${ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
  try {
    const res = await fetch(absolute, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      failures.push(`${url} — HTTP ${res.status}`);
      return null;
    }
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
    const buffer = Buffer.from(await res.arrayBuffer());
    downloaded++;
    return { buffer, mime };
  } catch (err: any) {
    failures.push(`${url} — ${err?.message}`);
    return null;
  }
}

/**
 * Returns the new display URL for an image, or null to leave the row alone.
 */
async function migrateOne(url: string, folder: string): Promise<string | null> {
  if (!url || alreadyProcessed(url)) return null;

  const got = await fetchBytes(url);
  if (!got) return null;
  if (!isResizableImage(got.mime)) return null;

  // Nothing to gain on images that are already small.
  if (got.buffer.length < 120 * 1024) return null;

  let newUrl: string;
  try {
    const out = await processImage(got.buffer, got.mime);
    const displayKey = generateR2Key(folder, out.display.ext);

    if (!APPLY) {
      bytesBefore += got.buffer.length;
      bytesAfter += out.display.buffer.length;
      processedCount++;
      console.log(
        `  would migrate ${url}\n    ${(got.buffer.length / 1048576).toFixed(2)} MB -> ` +
          `${(out.display.buffer.length / 1024).toFixed(0)} KB display, ` +
          `${((out.thumb?.buffer.length ?? 0) / 1024).toFixed(0)} KB thumb`,
      );
      return null;
    }

    newUrl = await uploadToR2(displayKey, out.display.buffer, out.display.mime);
    if (out.thumb) {
      await uploadToR2(thumbKeyFor(displayKey), out.thumb.buffer, out.thumb.mime);
    }

    bytesBefore += got.buffer.length;
    bytesAfter += out.display.buffer.length;
    processedCount++;
    console.log(
      `  migrated ${url}\n    -> ${newUrl} ` +
        `(${(got.buffer.length / 1048576).toFixed(2)} MB -> ${(out.display.buffer.length / 1024).toFixed(0)} KB)`,
    );
  } catch (err: any) {
    failures.push(`${url} — ${err?.message}`);
    return null;
  }
  return newUrl;
}

async function backfillListings() {
  const rows = await db.select({ id: listings.id, images: listings.images }).from(listings);
  console.log(`\n[listings] ${rows.length} row(s)`);
  for (const row of rows) {
    const urls = (row.images as string[] | null) ?? [];
    if (urls.length === 0) continue;
    let changed = false;
    const next: string[] = [];
    for (const u of urls) {
      const migrated = await migrateOne(u, "public-uploads");
      if (migrated) { next.push(migrated); changed = true; } else { next.push(u); }
    }
    if (changed && APPLY) {
      await db.update(listings).set({ images: next }).where(eq(listings.id, row.id));
    }
  }
}

async function backfillAvatars() {
  const rows = await db.select({ id: users.id, avatarUrl: users.avatarUrl }).from(users);
  const withAvatar = rows.filter((r) => !!r.avatarUrl);
  console.log(`\n[avatars] ${withAvatar.length} row(s)`);
  for (const row of withAvatar) {
    const migrated = await migrateOne(row.avatarUrl!, "public-uploads");
    if (migrated && APPLY) {
      await db.update(users).set({ avatarUrl: migrated }).where(eq(users.id, row.id));
    }
  }
}

async function backfillBusinesses() {
  const rows = await db
    .select({ id: businessProfiles.id, cover: businessProfiles.coverImageUrl, logo: businessProfiles.logoUrl })
    .from(businessProfiles);
  console.log(`\n[businesses] ${rows.length} row(s)`);
  for (const row of rows) {
    const patch: Record<string, string> = {};
    if (row.cover) { const m = await migrateOne(row.cover, "business"); if (m) patch.coverImageUrl = m; }
    if (row.logo)  { const m = await migrateOne(row.logo, "business");  if (m) patch.logoUrl = m; }
    if (Object.keys(patch).length && APPLY) {
      await db.update(businessProfiles).set(patch).where(eq(businessProfiles.id, row.id));
    }
  }
}

async function main() {
  if (!r2Enabled()) {
    console.error("R2 is not configured — refusing to run. Set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_PUBLIC_URL.");
    process.exit(1);
  }
  console.log(APPLY ? "MODE: APPLY (writes to R2 and the database)" : "MODE: DRY RUN (no writes — pass --apply to commit)");
  console.log(`Fetching relative URLs from ${ORIGIN}`);

  await backfillListings();
  await backfillAvatars();
  await backfillBusinesses();

  console.log("\n────────── summary ──────────");
  console.log(`downloaded : ${downloaded}`);
  console.log(`processed  : ${processedCount}`);
  if (processedCount > 0) {
    console.log(`size       : ${(bytesBefore / 1048576).toFixed(1)} MB -> ${(bytesAfter / 1048576).toFixed(2)} MB  (${(bytesBefore / Math.max(bytesAfter, 1)).toFixed(1)}x smaller)`);
  }
  if (failures.length) {
    console.log(`\nfailures (${failures.length}) — these rows were left untouched:`);
    for (const f of failures.slice(0, 40)) console.log(`  - ${f}`);
  }
  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write.");

  await pool.end();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
