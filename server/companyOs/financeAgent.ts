// Finance Agent — reads Stripe charges (read-only), groups by
// `metadata.category`, and persists a daily AED snapshot.
//
// Today the platform is free, so the expected value is "AED 0 today".
// The agent never crashes when charges are empty; it just upserts a
// zero row so the WhatsApp `revenue` command always has something to
// read.

import { and, gte, lte, eq, sql as drizzleSql, desc } from "drizzle-orm";
import { db } from "../db";
import { financeSnapshots } from "@shared/schema";
import { getStripeClient } from "./stripeClient";
import { notifyFounder } from "./twilio";
import { logLlmCall } from "./costTracker";
import { rememberInBackground } from "./memoryAgent";
import type Stripe from "stripe";

const DUBAI_TZ = "Asia/Dubai";

// AED threshold above which a single payment notifies the founder on WhatsApp.
const FOUNDER_ALERT_THRESHOLD_AED = 50;

function getUsdToAed(): number {
  const raw = Number(process.env.USD_TO_AED_RATE);
  return Number.isFinite(raw) && raw > 0 ? raw : 3.6725;
}

/**
 * Convert a Stripe minor-currency amount + currency to AED. We treat
 * USD/AED as the only first-class currencies; anything else is
 * heuristically converted via the USD rate (good enough for v1).
 */
export function chargeAmountToAed(amountMinor: number, currency: string): number {
  const cur = (currency || "usd").toLowerCase();
  if (cur === "aed") return Number((amountMinor / 100).toFixed(2));
  // Stripe treats most currencies as 100 minor units = 1 major unit.
  const major = amountMinor / 100;
  if (cur === "usd") return Number((major * getUsdToAed()).toFixed(2));
  // Unknown currency → assume USD-shaped and convert. Real multi-currency
  // support comes later when we ship products outside USD/AED.
  return Number((major * getUsdToAed()).toFixed(2));
}

function dubaiDateParts(date = new Date()): { y: string; m: string; d: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: DUBAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day") };
}

export function dubaiDateString(date = new Date()): string {
  const { y, m, d } = dubaiDateParts(date);
  return `${y}-${m}-${d}`;
}

/**
 * Compute UTC timestamps for the start and end of a Dubai-day. Used so
 * Stripe charge windows align to the founder's working day instead of UTC.
 */
function dubaiDayBoundsUtc(dubaiDate: string): { startUtc: Date; endUtc: Date } {
  // Dubai is UTC+4 year-round (no DST). Hard-coding the offset keeps us
  // free of timezone-database dependencies and matches Stripe filtering.
  const [y, m, d] = dubaiDate.split("-").map((s) => Number(s));
  const startUtc = new Date(Date.UTC(y, m - 1, d, -4, 0, 0));
  const endUtc = new Date(Date.UTC(y, m - 1, d, 19, 59, 59, 999));
  return { startUtc, endUtc };
}

function categoryOf(charge: Stripe.Charge): string {
  const meta = charge.metadata || {};
  const raw = meta.category ?? meta.product ?? "uncategorized";
  return String(raw).slice(0, 64) || "uncategorized";
}

/**
 * Pull all successful (non-refunded) charges for a Dubai-day from Stripe
 * and aggregate them. Refunds are tracked separately so we don't
 * accidentally net them out twice (Stripe also reports `amount_refunded`).
 */
export async function aggregateChargesForDate(dubaiDate: string): Promise<{
  totalAed: number;
  count: number;
  breakdown: Record<string, number>;
  refundsAed: number;
  refundCount: number;
}> {
  const stripe = await getStripeClient();
  const result = {
    totalAed: 0,
    count: 0,
    breakdown: {} as Record<string, number>,
    refundsAed: 0,
    refundCount: 0,
  };
  if (!stripe) return result;

  const { startUtc, endUtc } = dubaiDayBoundsUtc(dubaiDate);
  const startSec = Math.floor(startUtc.getTime() / 1000);
  const endSec = Math.floor(endUtc.getTime() / 1000);

  try {
    let starting_after: string | undefined;
    // Cap pages so a runaway loop can't burn quota; v1 will never come
    // close to 1k charges/day.
    for (let i = 0; i < 10; i++) {
      const page = await stripe.charges.list({
        created: { gte: startSec, lte: endSec },
        limit: 100,
        ...(starting_after ? { starting_after } : {}),
      });
      for (const ch of page.data) {
        if (ch.status !== "succeeded") continue;
        const cat = categoryOf(ch);
        const grossAed = chargeAmountToAed(ch.amount, ch.currency);
        result.totalAed = Number((result.totalAed + grossAed).toFixed(2));
        result.count += 1;
        result.breakdown[cat] = Number(
          ((result.breakdown[cat] ?? 0) + grossAed).toFixed(2),
        );
        if ((ch.amount_refunded ?? 0) > 0) {
          const refAed = chargeAmountToAed(ch.amount_refunded, ch.currency);
          result.refundsAed = Number((result.refundsAed + refAed).toFixed(2));
          result.refundCount += 1;
        }
      }
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1]?.id;
      if (!starting_after) break;
    }
  } catch (err) {
    console.error("[companyOs.finance] aggregateChargesForDate failed:", err);
  }

  return result;
}

/**
 * Upsert today's finance snapshot. Returns the resulting AED total so
 * callers can compose log/WhatsApp messages.
 */
export async function runDailyFinanceSnapshot(): Promise<{
  date: string;
  totalAed: number;
  count: number;
}> {
  const date = dubaiDateString();
  const agg = await aggregateChargesForDate(date);

  try {
    await db
      .insert(financeSnapshots)
      .values({
        snapshotDate: date,
        totalRevenueAed: agg.totalAed.toFixed(2),
        transactionCount: agg.count,
        breakdown: agg.breakdown,
        refundsAed: agg.refundsAed.toFixed(2),
        refundCount: agg.refundCount,
      })
      .onConflictDoUpdate({
        target: financeSnapshots.snapshotDate,
        set: {
          totalRevenueAed: agg.totalAed.toFixed(2),
          transactionCount: agg.count,
          breakdown: agg.breakdown,
          refundsAed: agg.refundsAed.toFixed(2),
          refundCount: agg.refundCount,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("[companyOs.finance] runDailyFinanceSnapshot upsert failed:", err);
  }

  // Seed memory: revenue trend direction (up/flat/down vs the previous
  // day). Cheap derived signal that other agents can read to colour
  // their copy.
  try {
    const [prev] = await db
      .select()
      .from(financeSnapshots)
      .where(drizzleSql`${financeSnapshots.snapshotDate} < ${date}`)
      .orderBy(desc(financeSnapshots.snapshotDate))
      .limit(1);
    const prevAed = prev ? Number(prev.totalRevenueAed) || 0 : 0;
    const delta = agg.totalAed - prevAed;
    const direction = delta > 0.01 ? "up" : delta < -0.01 ? "down" : "flat";
    rememberInBackground({
      agentName: "finance",
      memoryType: "learning",
      key: "revenue_trend_direction",
      value: {
        date,
        direction,
        todayAed: Number(agg.totalAed.toFixed(2)),
        previousAed: Number(prevAed.toFixed(2)),
        deltaAed: Number(delta.toFixed(2)),
      },
      confidence: 0.65,
    });
  } catch (err) {
    console.warn("[companyOs.finance] revenue trend memory seed failed:", err);
  }

  return { date, totalAed: agg.totalAed, count: agg.count };
}

export interface WeeklyRevenue {
  totalAed: number;
  count: number;
  byDay: { date: string; totalAed: number; count: number }[];
}

export async function getWeeklyRevenue(): Promise<WeeklyRevenue> {
  // Last 7 Dubai-days including today.
  const today = dubaiDateString();
  const todayParts = today.split("-").map((s) => Number(s));
  const dates: string[] = [];
  const base = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]));
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400 * 1000);
    const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    dates.push(ds);
  }

  const rows = await db
    .select()
    .from(financeSnapshots)
    .where(
      and(
        gte(financeSnapshots.snapshotDate, dates[0]),
        lte(financeSnapshots.snapshotDate, dates[dates.length - 1]),
      ),
    );

  const byDate = new Map<string, { totalAed: number; count: number }>();
  for (const r of rows) {
    byDate.set(r.snapshotDate, {
      totalAed: Number(r.totalRevenueAed) || 0,
      count: r.transactionCount ?? 0,
    });
  }

  let totalAed = 0;
  let count = 0;
  const byDay = dates.map((date) => {
    const v = byDate.get(date) ?? { totalAed: 0, count: 0 };
    totalAed = Number((totalAed + v.totalAed).toFixed(2));
    count += v.count;
    return { date, totalAed: v.totalAed, count: v.count };
  });

  return { totalAed, count, byDay };
}

export async function getTodaySnapshot() {
  const date = dubaiDateString();
  const rows = await db
    .select()
    .from(financeSnapshots)
    .where(eq(financeSnapshots.snapshotDate, date))
    .limit(1);
  return rows[0] ?? null;
}

function fmtAed(n: number): string {
  return `AED ${n.toFixed(2)}`;
}

export async function formatFinanceReport(scope: "today" | "week"): Promise<string> {
  if (scope === "today") {
    const date = dubaiDateString();
    // Refresh on read so the founder always sees current Stripe data.
    await runDailyFinanceSnapshot();
    const snap = await getTodaySnapshot();
    if (!snap || Number(snap.totalRevenueAed) === 0) {
      return `*Revenue · ${date}*\n${fmtAed(0)} (no revenue today — free-launch period)`;
    }
    const total = Number(snap.totalRevenueAed) || 0;
    const lines = [`*Revenue · ${date}*`, `${fmtAed(total)} across ${snap.transactionCount} txn(s)`];
    const breakdown = (snap.breakdown ?? {}) as Record<string, number>;
    const cats = Object.keys(breakdown);
    if (cats.length > 0) {
      lines.push("");
      lines.push("By category:");
      for (const c of cats.sort()) {
        lines.push(`• ${c}: ${fmtAed(Number(breakdown[c]) || 0)}`);
      }
    }
    if ((snap.refundCount ?? 0) > 0) {
      lines.push("");
      lines.push(`Refunds: ${fmtAed(Number(snap.refundsAed) || 0)} (${snap.refundCount})`);
    }
    return lines.join("\n");
  }

  const week = await getWeeklyRevenue();
  if (week.totalAed === 0) {
    return `*Revenue · last 7 days*\n${fmtAed(0)} (no revenue yet — free-launch period)`;
  }
  const lines = [
    `*Revenue · last 7 days*`,
    `${fmtAed(week.totalAed)} across ${week.count} txn(s)`,
    "",
    "By day:",
  ];
  for (const d of week.byDay) {
    lines.push(`• ${d.date}: ${fmtAed(d.totalAed)} (${d.count})`);
  }
  return lines.join("\n");
}

/**
 * Webhook entry point — called by /api/company-os/stripe-webhook after
 * signature verification. Refreshes today's snapshot and pings the
 * founder for any individual payment ≥ AED 50.
 */
export async function handleStripePaymentSucceeded(event: Stripe.Event): Promise<void> {
  if (event.type !== "payment_intent.succeeded") return;

  const intent = event.data.object as Stripe.PaymentIntent;
  const amountAed = chargeAmountToAed(intent.amount_received ?? intent.amount ?? 0, intent.currency ?? "usd");
  const meta = intent.metadata || {};
  const category = String(meta.category ?? meta.product ?? "uncategorized");

  // Persist an audit row for the payment event so the WhatsApp `logs`
  // surface and the admin /api/company-os/logs endpoint show every
  // Stripe-driven AED movement, not just LLM calls.
  await logLlmCall({
    agentName: "finance",
    command: event.type,
    inputPreview: `${event.id} · intent=${intent.id}`,
    outputPreview: `${fmtAed(amountAed)} · ${category}`,
    tokensUsed: 0,
    status: "ok",
  });

  // Always refresh today's snapshot so the next `revenue` command is accurate.
  try {
    await runDailyFinanceSnapshot();
  } catch (err) {
    console.error("[companyOs.finance] snapshot refresh after webhook failed:", err);
    await logLlmCall({
      agentName: "finance",
      command: "snapshot_refresh",
      inputPreview: event.id,
      tokensUsed: 0,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  if (amountAed >= FOUNDER_ALERT_THRESHOLD_AED) {
    const body = `💰 New payment\n${fmtAed(amountAed)} · ${category}\nIntent: ${intent.id}`;
    await notifyFounder(body).catch((err) => {
      console.error("[companyOs.finance] founder alert failed:", err);
    });
  }
}

/**
 * Logged for visibility but does NOT mutate the snapshot — Stripe will
 * re-emit `charge.refunded` and the next snapshot refresh will pick the
 * new totals up automatically.
 */
export async function handleStripeChargeRefunded(event: Stripe.Event): Promise<void> {
  if (event.type !== "charge.refunded") return;
  const charge = event.data.object as Stripe.Charge;
  const refundedAed = chargeAmountToAed(charge.amount_refunded ?? 0, charge.currency ?? "usd");
  console.log(
    `[companyOs.finance] charge.refunded ${charge.id} ${fmtAed(refundedAed)} — snapshot will reconcile on next refresh`,
  );

  await logLlmCall({
    agentName: "finance",
    command: event.type,
    inputPreview: `${event.id} · charge=${charge.id}`,
    outputPreview: `refund ${fmtAed(refundedAed)}`,
    tokensUsed: 0,
    status: "ok",
  });

  try {
    await runDailyFinanceSnapshot();
  } catch (err) {
    console.error("[companyOs.finance] snapshot refresh after refund failed:", err);
    await logLlmCall({
      agentName: "finance",
      command: "snapshot_refresh",
      inputPreview: event.id,
      tokensUsed: 0,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Used by the daily briefing — pulls the most recent N snapshots so
 * the WhatsApp summary can show a quick trend.
 */
export async function getRecentSnapshots(limit = 7) {
  return db
    .select()
    .from(financeSnapshots)
    .orderBy(desc(financeSnapshots.snapshotDate))
    .limit(limit);
}

// Re-export for convenience in router/tests.
export { drizzleSql };
