// Finance Agent — persists a daily AED snapshot.
//
// Stripe integration was removed during the pre-publish hardening so
// the deploy preflight doesn't demand a Stripe connection. All paths
// here now operate against the local `financeSnapshots` table only and
// always upsert AED 0 for the day until Stripe (or another revenue
// source) is reintroduced.
//
// Public API kept intact so the WhatsApp `revenue` / `revenue week`
// commands, the daily briefing scheduler, the admin Company OS
// endpoint (`GET /api/company-os/finance`), and the existing tests
// don't have to change.

import { and, gte, lte, eq, sql as drizzleSql, desc } from "drizzle-orm";
import { db } from "../db";
import { financeSnapshots } from "@shared/schema";
import { rememberInBackground } from "./memoryAgent";

const DUBAI_TZ = "Asia/Dubai";

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
 * Stripe is disabled — every Dubai-day reports zero revenue.
 * Kept so existing callers don't need to be rewritten.
 */
export async function aggregateChargesForDate(_dubaiDate: string): Promise<{
  totalAed: number;
  count: number;
  breakdown: Record<string, number>;
  refundsAed: number;
  refundCount: number;
}> {
  return {
    totalAed: 0,
    count: 0,
    breakdown: {},
    refundsAed: 0,
    refundCount: 0,
  };
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
    // Refresh on read so the founder always sees a current zero snapshot.
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
