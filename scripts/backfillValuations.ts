/**
 * One-off backfill for the AI valuation columns on the `listings` table.
 *
 * For every listing that has no AI valuation yet (valuation_min_aed IS NULL),
 * runs the existing valuation agent and writes the result onto the listing
 * row using the exact same clamping/safety logic as POST /api/listings.
 *
 * Safe to interrupt with Ctrl-C and rerun: only NULL rows are processed.
 *
 * Run with:
 *   npm run backfill:valuations            # full run
 *   LIMIT=10 npm run backfill:valuations   # only do the first 10 NULL rows
 *   DRY_RUN=1 npm run backfill:valuations  # show what it WOULD do, write nothing
 *
 * Requires in env (already in .env.local locally; in Replit Secrets in prod):
 *   DATABASE_URL, AI_INTEGRATIONS_OPENAI_API_KEY
 */

import { db } from "../server/db";
import { listings } from "../shared/schema";
import { isNull, eq } from "drizzle-orm";
import { getValuation } from "../server/agents/valuationAgent";

const DELAY_MS = Number(process.env.BACKFILL_DELAY_MS ?? 1500);
const LIMIT = Number(process.env.LIMIT ?? 0); // 0 = no limit
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const MAX_AED = 100_000_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: number) => Math.max(0, Math.min(MAX_AED, Math.round(n)));

interface BackfillStats {
  scanned: number;
  filled: number;
  skipped: number;
  failed: number;
}

async function main() {
  console.log(
    `[backfillValuations] starting${DRY_RUN ? " (DRY RUN — no writes)" : ""}, delay=${DELAY_MS}ms, limit=${LIMIT || "none"}`,
  );

  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      description: listings.description,
      categories: listings.categories,
      condition: listings.condition,
      userId: listings.userId,
    })
    .from(listings)
    .where(isNull(listings.valuationMinAed));

  const target = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
  console.log(
    `[backfillValuations] ${rows.length} listings missing a valuation${
      LIMIT > 0 ? `; processing first ${target.length}` : ""
    }.`,
  );

  const stats: BackfillStats = { scanned: 0, filled: 0, skipped: 0, failed: 0 };

  for (const row of target) {
    stats.scanned++;
    const cats = (row.categories as string[] | null) ?? [];
    const primaryCategory = cats[0];
    if (!primaryCategory) {
      console.warn(`  - ${row.id}  skipped (no category) "${row.title.slice(0, 40)}"`);
      stats.skipped++;
      continue;
    }

    try {
      const advice = await getValuation(
        row.title,
        row.description ?? "",
        primaryCategory,
        row.condition ?? undefined,
        // No userId passed: we don't want backfill calls counted against a
        // founder's per-user interaction log. Cost still goes through the
        // valuation agent's monthly budget cap, which is the safety we want.
        undefined,
      );

      const min = advice.estimatedRange?.min;
      const max = advice.estimatedRange?.max;
      if (!Number.isFinite(min) || !Number.isFinite(max) || (min === 0 && max === 0)) {
        // The agent returns {min:0,max:0} when the monthly budget cap is
        // breached — treat that as a soft failure and stop early to avoid
        // wasting wall-clock time on a fleet of zero-valued writes.
        console.warn(
          `  ! ${row.id}  agent returned no value (likely budget cap). Stopping run.`,
        );
        stats.failed++;
        break;
      }

      const minAed = clamp(min);
      const maxAed = Math.max(minAed, clamp(max));
      const fairAed = Number.isFinite(advice.fairValue)
        ? Math.max(minAed, Math.min(maxAed, clamp(advice.fairValue)))
        : Math.round((minAed + maxAed) / 2);
      const conf = Number.isFinite(advice.confidence)
        ? Math.max(0, Math.min(1, advice.confidence))
        : null;

      const patch = {
        valuationMinAed: minAed,
        valuationMaxAed: maxAed,
        valuationFairAed: fairAed,
        valuationConfidence: conf !== null ? conf.toFixed(2) : null,
        valuationReasoning: (advice.reasoning ?? "").slice(0, 1000) || null,
        valuationMarketNote: (advice.marketComparison ?? "").slice(0, 500) || null,
        valuationCurrency: "AED",
        valuationAt: new Date(),
      };

      if (DRY_RUN) {
        console.log(
          `  ~ ${row.id}  "${row.title.slice(0, 40)}"  -> ${minAed}-${maxAed} AED (DRY)`,
        );
      } else {
        await db.update(listings).set(patch).where(eq(listings.id, row.id));
        console.log(
          `  ✓ ${row.id}  "${row.title.slice(0, 40)}"  -> ${minAed}-${maxAed} AED`,
        );
      }
      stats.filled++;
    } catch (err) {
      stats.failed++;
      console.error(`  ✗ ${row.id}  failed:`, err instanceof Error ? err.message : err);
    }

    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  console.log(
    `[backfillValuations] done. scanned=${stats.scanned} filled=${stats.filled} skipped=${stats.skipped} failed=${stats.failed}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfillValuations] crashed:", err);
  process.exit(1);
});
