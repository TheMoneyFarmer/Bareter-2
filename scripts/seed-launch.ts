/**
 * One-shot CLI to insert the curated launch listings into the connected
 * database. Idempotent — safe to re-run; will only insert what is missing.
 *
 * Safety gates (in order):
 *   1. Refuses to run unless `CONFIRM_SEED_LAUNCH=yes` is set in the env.
 *   2. When DATABASE_URL points at a production-shaped host (not localhost
 *      and not a *.replit.dev workspace URL), additionally requires
 *      `CONFIRM_SEED_LAUNCH_PRODUCTION=yes`.
 *
 * Run:
 *   CONFIRM_SEED_LAUNCH=yes npx tsx scripts/seed-launch.ts
 *
 *   # against production:
 *   CONFIRM_SEED_LAUNCH=yes CONFIRM_SEED_LAUNCH_PRODUCTION=yes \
 *     npx tsx scripts/seed-launch.ts
 */

import { runLaunchSeed, __launchSeedStats } from "../server/launchSeed.ts";

function looksLikeProductionDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    if (host.endsWith(".replit.dev")) return false; // workspace dev DBs
    return true;
  } catch {
    return true; // be conservative if we cannot parse the URL
  }
}

async function main() {
  if (process.env.CONFIRM_SEED_LAUNCH !== "yes") {
    console.error(
      "Refusing to run: set CONFIRM_SEED_LAUNCH=yes to proceed.\n" +
        "  CONFIRM_SEED_LAUNCH=yes npx tsx scripts/seed-launch.ts",
    );
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (
    looksLikeProductionDatabase(dbUrl) &&
    process.env.CONFIRM_SEED_LAUNCH_PRODUCTION !== "yes"
  ) {
    console.error(
      "Refusing to run against what looks like a production database.\n" +
        "If you are sure, also set CONFIRM_SEED_LAUNCH_PRODUCTION=yes.",
    );
    process.exit(1);
  }

  console.log(
    `[seed-launch] Inserting up to ${__launchSeedStats.totalUsers} editorial users ` +
      `and ${__launchSeedStats.totalListings} curated listings (idempotent)...`,
  );
  const report = await runLaunchSeed();
  console.log("[seed-launch] Done.");
  console.log(`  alreadySeeded     : ${report.alreadySeeded}`);
  console.log(`  usersInserted     : ${report.usersInserted}`);
  console.log(`  listingsInserted  : ${report.listingsInserted}`);
  console.log(`  listingsSkipped   : ${report.listingsSkipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-launch] FAILED:", err);
  process.exit(1);
});
