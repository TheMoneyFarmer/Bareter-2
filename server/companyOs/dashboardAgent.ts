// Dashboard Agent — daily KPI snapshots + live aggregation for the
// Company OS admin page (/admin/company-os).
//
// Replaces the Week-4 prompt's Google Sheets export: the admin page IS
// the export, plus a downloadable JSON snapshot. The 02:00 Asia/Dubai
// cron persists `kpi_snapshots` rows; the admin page polls
// `getDashboardData()` (live aggregation) every 60s; WhatsApp `dashboard`
// returns the short summary from `getKpiSummary()`.

import { and, eq, gte, lte, sql as drizzleSql, count, desc } from "drizzle-orm";
import { db } from "../db";
import {
  campaignPerformance,
  companyOsLogs,
  contentBriefs,
  deals,
  financeSnapshots,
  kpiSnapshots,
  legalDocuments,
  listings,
  marketingPosts,
  posts,
  salesLeads,
  users,
} from "@shared/schema";
import { dubaiDateString } from "./financeAgent";
import { getMonthSpendAed, getMonthSpendByAgent } from "./costTracker";
import { rememberInBackground } from "./memoryAgent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveKpis {
  date: string;
  // Headline numbers — also persisted by the daily snapshot.
  totalUsers: number;
  newUsersToday: number;
  activeUsers7d: number;
  totalPosts: number;
  postsToday: number;
  totalDeals: number;
  dealsCompletedToday: number;
  gmvAed7d: number;
  completionRatePct: number;
  topCategory: string | null;
  topCity: string | null;
  aiCostAedMonthToDate: number;

  // Chart-feeding extras (fresh on every live call; mirrored into the
  // snapshot's `extras` blob for historical playback).
  revenue30d: { date: string; totalAed: number; count: number }[];
  gmv30d: { date: string; gmvAed: number; deals: number }[];
  agentCost30d: { date: string; agents: Record<string, number> }[];
  agentRunHeatmap7d: { hour: number; day: number; count: number }[];
  salesPipeline: { status: string; count: number }[];
  topCategories: { name: string; count: number }[];
  topCities: { name: string; count: number }[];
  recentLegalDocuments: {
    id: string;
    title: string;
    documentType: string;
    createdAt: string | null;
  }[];
  latestContentBriefs: {
    id: string;
    weekStart: string;
    theme: string;
    suggestedBudgetAed: number;
  }[];
  latestCampaigns: {
    id: string;
    campaignName: string;
    channel: string | null;
    ctr: number;
    spendAed: number;
    conversions: number;
  }[];
  latestMarketingPosts: {
    id: string;
    channel: string | null;
    topic: string;
    status: string;
    externalUrl: string | null;
    error: string | null;
    createdAt: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfDubaiToday(): Date {
  const ds = dubaiDateString();
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, -4, 0, 0));
}

function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function dubaiDayBoundsUtc(dubaiDate: string): { startUtc: Date; endUtc: Date } {
  const [y, m, d] = dubaiDate.split("-").map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d, -4, 0, 0));
  const endUtc = new Date(Date.UTC(y, m - 1, d, 19, 59, 59, 999));
  return { startUtc, endUtc };
}

function lastNDubaiDates(n: number): string[] {
  const today = dubaiDateString();
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(base.getTime() - i * 86400 * 1000);
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

function safeNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// `db.execute` with the neon-http driver returns either `{ rows: [...] }`
// (postgres / neon-serverless) or an array directly. This helper unwraps
// either shape to a typed row array without leaking `any` into callers.
function executeRows<R>(result: unknown): R[] {
  if (Array.isArray(result)) return result as R[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return ((result as { rows: R[] }).rows) ?? [];
  }
  return [];
}

interface CategoryRow {
  name: string;
  c: number | string;
}

interface GmvDayRow {
  day: string;
  gmv: number | string;
  c: number | string;
}

interface AgentSpendDayRow {
  day: string;
  agentName: string;
  totalCost: number | string;
}

interface HeatmapRow {
  dow: number;
  hour: number;
  c: number | string;
}

interface SalesPipelineRow {
  status: string | null;
  c: number;
}

interface FinanceSnapshotRow {
  snapshotDate: string;
  totalRevenueAed: number | string | null;
  transactionCount: number | string | null;
}

interface LegalDocRow {
  id: string;
  title: string | null;
  documentType: string | null;
  createdAt: Date | string | null;
}

interface ContentBriefRow {
  id: string;
  weekStart: string | null;
  theme: string | null;
  suggestedBudgetAed: number | string | null;
}

interface CampaignRow {
  id: string;
  campaignName: string | null;
  channel: string | null;
  ctr: number | string | null;
  spendAed: number | string | null;
  conversions: number | string | null;
}

interface MarketingPostRow {
  id: string;
  channel: string | null;
  topic: string | null;
  status: string | null;
  externalUrl: string | null;
  error: string | null;
  createdAt: Date | string | null;
}

// ---------------------------------------------------------------------------
// Live aggregation — runs all queries in parallel, caps each with LIMIT
// where applicable, and degrades gracefully on per-query failure.
// ---------------------------------------------------------------------------

async function safe<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[companyOs.dashboard] ${label} failed:`, err);
    return fallback;
  }
}

export async function getLiveKpis(): Promise<LiveKpis> {
  const today = dubaiDateString();
  const startToday = startOfDubaiToday();
  const since7d = new Date(Date.now() - 7 * 86400 * 1000);
  const since30d = new Date(Date.now() - 30 * 86400 * 1000);
  const dates30 = lastNDubaiDates(30);
  const dates7 = lastNDubaiDates(7);

  const [
    uTotal,
    uToday,
    uActive7d,
    pTotal,
    pToday,
    dTotal,
    dCompletedToday,
    gmvRows,
    completedTotal,
    catRows,
    cityRows,
    finRows,
    aiCostMtd,
    aiByAgent,
    agentRunsByDay30,
    agentRunsHourly,
    salesPipelineRows,
    legalDocs,
    briefs,
    campaigns,
    recentPosts,
  ] = await Promise.all([
    safe(
      db.select({ c: count() }).from(users).then((r) => safeNum(r[0]?.c)),
      0,
      "users.total",
    ),
    safe(
      db
        .select({ c: count() })
        .from(users)
        .where(gte(users.createdAt, startToday))
        .then((r) => safeNum(r[0]?.c)),
      0,
      "users.today",
    ),
    safe(
      db
        .select({ c: count() })
        .from(users)
        .where(gte(users.lastActiveAt, since7d))
        .then((r) => safeNum(r[0]?.c)),
      0,
      "users.active7d",
    ),
    safe(
      db.select({ c: count() }).from(posts).then((r) => safeNum(r[0]?.c)),
      0,
      "posts.total",
    ),
    safe(
      db
        .select({ c: count() })
        .from(posts)
        .where(gte(posts.createdAt, startToday))
        .then((r) => safeNum(r[0]?.c)),
      0,
      "posts.today",
    ),
    safe(
      db.select({ c: count() }).from(deals).then((r) => safeNum(r[0]?.c)),
      0,
      "deals.total",
    ),
    safe(
      db
        .select({ c: count() })
        .from(deals)
        .where(and(eq(deals.state, "completed"), gte(deals.updatedAt, startToday)))
        .then((r) => safeNum(r[0]?.c)),
      0,
      "deals.completedToday",
    ),
    safe(
      db
        .select({
          gmv: drizzleSql<string>`COALESCE(SUM(${deals.seekerValue} + ${deals.providerValue}), 0)`,
          c: count(),
        })
        .from(deals)
        .where(and(eq(deals.state, "completed"), gte(deals.updatedAt, since7d)))
        .then((r) => ({ gmv: safeNum(r[0]?.gmv), c: safeNum(r[0]?.c) })),
      { gmv: 0, c: 0 },
      "deals.gmv7d",
    ),
    safe(
      db
        .select({ c: count() })
        .from(deals)
        .where(eq(deals.state, "completed"))
        .then((r) => safeNum(r[0]?.c)),
      0,
      "deals.completedTotal",
    ),
    // Top category from listings.categories — JSONB array. Use a SQL
    // unnest so we count per-tag instead of per-row.
    safe(
      db
        .execute(
          drizzleSql`SELECT cat AS name, COUNT(*)::int AS c
            FROM ${listings}, jsonb_array_elements_text(${listings.categories}) AS cat
            WHERE ${listings.isActive} = true
            GROUP BY cat
            ORDER BY c DESC
            LIMIT 5`,
        )
        .then((result) =>
          executeRows<CategoryRow>(result).map((row) => ({
            name: String(row.name ?? ""),
            count: safeNum(row.c),
          })),
        ),
      [] as { name: string; count: number }[],
      "listings.topCategories",
    ),
    safe(
      db
        .select({ name: users.city, c: count() })
        .from(users)
        .where(drizzleSql`${users.city} IS NOT NULL AND ${users.city} <> ''`)
        .groupBy(users.city)
        .orderBy(desc(count()))
        .limit(5)
        .then((r) =>
          r.map((row) => ({ name: String(row.name ?? ""), count: safeNum(row.c) })),
        ),
      [] as { name: string; count: number }[],
      "users.topCities",
    ),
    safe(
      db
        .select({
          snapshotDate: financeSnapshots.snapshotDate,
          totalRevenueAed: financeSnapshots.totalRevenueAed,
          transactionCount: financeSnapshots.transactionCount,
        })
        .from(financeSnapshots)
        .where(
          and(
            gte(financeSnapshots.snapshotDate, dates30[0]),
            lte(financeSnapshots.snapshotDate, dates30[dates30.length - 1]),
          ),
        )
        .orderBy(financeSnapshots.snapshotDate),
      [] as FinanceSnapshotRow[],
      "finance.snapshots30d",
    ),
    safe(getMonthSpendAed(), 0, "ai.monthSpend"),
    safe(getMonthSpendByAgent(), [], "ai.byAgent"),
    safe(
      db
        .select({
          day: drizzleSql<string>`to_char(${companyOsLogs.createdAt} AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD')`,
          agentName: companyOsLogs.agentName,
          totalCost: drizzleSql<string>`COALESCE(SUM(${companyOsLogs.costAed}), 0)`,
        })
        .from(companyOsLogs)
        .where(gte(companyOsLogs.createdAt, since30d))
        .groupBy(
          drizzleSql`to_char(${companyOsLogs.createdAt} AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD')`,
          companyOsLogs.agentName,
        )
        .limit(2000),
      [] as AgentSpendDayRow[],
      "ai.runsByDay30",
    ),
    safe(
      db
        .select({
          dow: drizzleSql<number>`EXTRACT(DOW FROM ${companyOsLogs.createdAt} AT TIME ZONE 'Asia/Dubai')::int`,
          hour: drizzleSql<number>`EXTRACT(HOUR FROM ${companyOsLogs.createdAt} AT TIME ZONE 'Asia/Dubai')::int`,
          c: count(),
        })
        .from(companyOsLogs)
        .where(gte(companyOsLogs.createdAt, since7d))
        .groupBy(
          drizzleSql`EXTRACT(DOW FROM ${companyOsLogs.createdAt} AT TIME ZONE 'Asia/Dubai')`,
          drizzleSql`EXTRACT(HOUR FROM ${companyOsLogs.createdAt} AT TIME ZONE 'Asia/Dubai')`,
        )
        .limit(200),
      [] as HeatmapRow[],
      "ai.heatmap7d",
    ),
    safe(
      db
        .select({ status: salesLeads.status, c: count() })
        .from(salesLeads)
        .groupBy(salesLeads.status),
      [] as SalesPipelineRow[],
      "sales.pipeline",
    ),
    safe(
      db
        .select({
          id: legalDocuments.id,
          title: legalDocuments.title,
          documentType: legalDocuments.documentType,
          createdAt: legalDocuments.createdAt,
        })
        .from(legalDocuments)
        .orderBy(desc(legalDocuments.createdAt))
        .limit(5),
      [] as LegalDocRow[],
      "legal.recent",
    ),
    safe(
      db
        .select({
          id: contentBriefs.id,
          weekStart: contentBriefs.weekStart,
          theme: contentBriefs.theme,
          suggestedBudgetAed: contentBriefs.suggestedBudgetAed,
        })
        .from(contentBriefs)
        .orderBy(desc(contentBriefs.createdAt))
        .limit(5),
      [] as ContentBriefRow[],
      "marketing.briefs",
    ),
    safe(
      db
        .select({
          id: campaignPerformance.id,
          campaignName: campaignPerformance.campaignName,
          channel: campaignPerformance.channel,
          ctr: campaignPerformance.ctr,
          spendAed: campaignPerformance.spendAed,
          conversions: campaignPerformance.conversions,
        })
        .from(campaignPerformance)
        .orderBy(desc(campaignPerformance.updatedAt))
        .limit(5),
      [] as CampaignRow[],
      "marketing.campaigns",
    ),
    safe(
      db
        .select({
          id: marketingPosts.id,
          channel: marketingPosts.channel,
          topic: marketingPosts.topic,
          status: marketingPosts.status,
          externalUrl: marketingPosts.externalUrl,
          error: marketingPosts.error,
          createdAt: marketingPosts.createdAt,
        })
        .from(marketingPosts)
        .orderBy(desc(marketingPosts.createdAt))
        .limit(10),
      [] as MarketingPostRow[],
      "marketing.posts",
    ),
  ]);

  // Build the 30-day revenue series, filling gaps with zeros.
  const finByDate = new Map<string, { totalAed: number; count: number }>();
  for (const r of finRows) {
    finByDate.set(r.snapshotDate, {
      totalAed: safeNum(r.totalRevenueAed),
      count: safeNum(r.transactionCount),
    });
  }
  const revenue30d = dates30.map((date) => {
    const v = finByDate.get(date);
    return { date, totalAed: v?.totalAed ?? 0, count: v?.count ?? 0 };
  });

  // GMV series: per-day SUM of completed deals' (seeker+provider) value
  // over the last 30 days. We compute it inline (one query) rather than
  // pre-bucketing in JS.
  const gmvByDay: { date: string; gmvAed: number; deals: number }[] = await safe(
    db
      .execute(
        drizzleSql`SELECT to_char(${deals.updatedAt} AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS day,
            COALESCE(SUM(${deals.seekerValue} + ${deals.providerValue}), 0)::numeric AS gmv,
            COUNT(*)::int AS c
          FROM ${deals}
          WHERE ${deals.state} = 'completed' AND ${deals.updatedAt} >= ${since30d}
          GROUP BY day
          ORDER BY day
          LIMIT 60`,
      )
      .then((result) =>
        executeRows<GmvDayRow>(result).map((row) => ({
          day: String(row.day),
          gmv: safeNum(row.gmv),
          c: safeNum(row.c),
        })),
      ),
    [] as { day: string; gmv: number; c: number }[],
    "deals.gmvByDay",
  ).then((rows) => {
    const map = new Map<string, { gmv: number; c: number }>(
      rows.map((r) => [r.day, { gmv: r.gmv, c: r.c }]),
    );
    return dates30.map((date) => {
      const v = map.get(date);
      return { date, gmvAed: v?.gmv ?? 0, deals: v?.c ?? 0 };
    });
  });

  // Build the per-day agent cost stacked-area series.
  const costByDay = new Map<string, Record<string, number>>();
  const agentNamesSet = new Set<string>();
  for (const r of agentRunsByDay30) {
    const day = String(r.day);
    const agent = String(r.agentName);
    const cost = safeNum(r.totalCost);
    if (!costByDay.has(day)) costByDay.set(day, {});
    costByDay.get(day)![agent] = cost;
    agentNamesSet.add(agent);
  }
  const agentCost30d = dates30.map((date) => ({
    date,
    agents: costByDay.get(date) ?? {},
  }));

  // Heatmap rows are { dow, hour, c }; return a flat list the frontend
  // can render however it likes.
  const agentRunHeatmap7d = agentRunsHourly.map((r) => ({
    hour: safeNum(r.hour),
    day: safeNum(r.dow),
    count: safeNum(r.c),
  }));

  const salesPipeline = salesPipelineRows.map((r) => ({
    status: String(r.status ?? "unknown"),
    count: safeNum(r.c),
  }));

  const completionRatePct =
    dTotal > 0 ? Number(((completedTotal / dTotal) * 100).toFixed(2)) : 0;

  return {
    date: today,
    totalUsers: uTotal,
    newUsersToday: uToday,
    activeUsers7d: uActive7d,
    totalPosts: pTotal,
    postsToday: pToday,
    totalDeals: dTotal,
    dealsCompletedToday: dCompletedToday,
    gmvAed7d: Number(gmvRows.gmv.toFixed(2)),
    completionRatePct,
    topCategory: catRows[0]?.name ?? null,
    topCity: cityRows[0]?.name ?? null,
    aiCostAedMonthToDate: Number(aiCostMtd.toFixed(2)),
    revenue30d,
    gmv30d: gmvByDay,
    agentCost30d,
    agentRunHeatmap7d,
    salesPipeline,
    topCategories: catRows,
    topCities: cityRows,
    recentLegalDocuments: legalDocs.map((d) => ({
      id: String(d.id),
      title: String(d.title ?? ""),
      documentType: String(d.documentType ?? ""),
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
    })),
    latestContentBriefs: briefs.map((b) => ({
      id: String(b.id),
      weekStart: String(b.weekStart ?? ""),
      theme: String(b.theme ?? ""),
      suggestedBudgetAed: safeNum(b.suggestedBudgetAed),
    })),
    latestCampaigns: campaigns.map((c) => ({
      id: String(c.id),
      campaignName: String(c.campaignName ?? ""),
      channel: c.channel ?? null,
      ctr: safeNum(c.ctr),
      spendAed: safeNum(c.spendAed),
      conversions: safeNum(c.conversions),
    })),
    latestMarketingPosts: recentPosts.map((p) => ({
      id: String(p.id),
      channel: p.channel ?? null,
      topic: String(p.topic ?? ""),
      status: String(p.status ?? "unknown"),
      externalUrl: p.externalUrl ?? null,
      error: p.error ?? null,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Live aggregation bundle used by the admin page (`/admin/company-os`).
 * Polls every 60s via React Query.
 */
export async function getDashboardData(): Promise<LiveKpis> {
  return getLiveKpis();
}

/**
 * Persist today's headline KPIs to `kpi_snapshots`. Idempotent — the
 * 02:00 cron upserts on `snapshotDate`.
 */
export async function captureDailySnapshot(): Promise<{
  date: string;
  inserted: boolean;
}> {
  const live = await getLiveKpis();
  try {
    await db
      .insert(kpiSnapshots)
      .values({
        snapshotDate: live.date,
        totalUsers: live.totalUsers,
        newUsersToday: live.newUsersToday,
        activeUsers7d: live.activeUsers7d,
        totalPosts: live.totalPosts,
        postsToday: live.postsToday,
        totalDeals: live.totalDeals,
        dealsCompletedToday: live.dealsCompletedToday,
        gmvAed7d: live.gmvAed7d.toFixed(2),
        completionRatePct: live.completionRatePct.toFixed(2),
        topCategory: live.topCategory,
        topCity: live.topCity,
        aiCostAedMonthToDate: live.aiCostAedMonthToDate.toFixed(2),
        extras: {
          topCategories: live.topCategories,
          topCities: live.topCities,
          salesPipeline: live.salesPipeline,
          revenue30d: live.revenue30d,
          gmv30d: live.gmv30d,
          agentCost30d: live.agentCost30d,
        },
      })
      .onConflictDoUpdate({
        target: kpiSnapshots.snapshotDate,
        set: {
          totalUsers: live.totalUsers,
          newUsersToday: live.newUsersToday,
          activeUsers7d: live.activeUsers7d,
          totalPosts: live.totalPosts,
          postsToday: live.postsToday,
          totalDeals: live.totalDeals,
          dealsCompletedToday: live.dealsCompletedToday,
          gmvAed7d: live.gmvAed7d.toFixed(2),
          completionRatePct: live.completionRatePct.toFixed(2),
          topCategory: live.topCategory,
          topCity: live.topCity,
          aiCostAedMonthToDate: live.aiCostAedMonthToDate.toFixed(2),
          extras: {
            topCategories: live.topCategories,
            topCities: live.topCities,
            salesPipeline: live.salesPipeline,
            revenue30d: live.revenue30d,
            gmv30d: live.gmv30d,
            agentCost30d: live.agentCost30d,
          },
        },
      });
    // Seed memory: which KPI segment the dashboard is currently
    // surfacing. Other agents (marketing, sales) read this so their
    // copy can lean into the strongest category/city.
    rememberInBackground({
      agentName: "dashboard",
      memoryType: "learning",
      key: "latest_top_segment",
      value: {
        date: live.date,
        topCategory: live.topCategory,
        topCity: live.topCity,
        completionRatePct: Number(live.completionRatePct.toFixed(2)),
        gmvAed7d: Number(live.gmvAed7d.toFixed(2)),
      },
      confidence: 0.8,
    });

    return { date: live.date, inserted: true };
  } catch (err) {
    console.error("[companyOs.dashboard] captureDailySnapshot upsert failed:", err);
    return { date: live.date, inserted: false };
  }
}

/**
 * WhatsApp-friendly short summary. Reads from the latest persisted
 * snapshot when available, otherwise falls back to a fresh live call.
 */
export async function getKpiSummary(): Promise<string> {
  // Subset of KpiSnapshot we actually render in the WhatsApp summary —
  // typing this explicitly lets us share one shape between the persisted
  // snapshot row and the live fallback without an `any` escape hatch.
  type SummaryShape = {
    snapshotDate: string;
    totalUsers: number;
    newUsersToday: number;
    activeUsers7d: number;
    totalPosts: number;
    postsToday: number;
    totalDeals: number;
    dealsCompletedToday: number;
    gmvAed7d: number | string;
    completionRatePct: number | string;
    topCategory: string | null;
    topCity: string | null;
    aiCostAedMonthToDate: number | string;
  };

  let latest: SummaryShape | null = null;
  try {
    const rows = await db
      .select()
      .from(kpiSnapshots)
      .orderBy(desc(kpiSnapshots.snapshotDate))
      .limit(1);
    const row = rows[0];
    if (row) {
      latest = {
        snapshotDate: row.snapshotDate,
        totalUsers: row.totalUsers,
        newUsersToday: row.newUsersToday,
        activeUsers7d: row.activeUsers7d,
        totalPosts: row.totalPosts,
        postsToday: row.postsToday,
        totalDeals: row.totalDeals,
        dealsCompletedToday: row.dealsCompletedToday,
        gmvAed7d: row.gmvAed7d,
        completionRatePct: row.completionRatePct,
        topCategory: row.topCategory,
        topCity: row.topCity,
        aiCostAedMonthToDate: row.aiCostAedMonthToDate,
      };
    }
  } catch (err) {
    console.error("[companyOs.dashboard] getKpiSummary read failed:", err);
  }

  if (!latest) {
    const live = await getLiveKpis();
    latest = {
      snapshotDate: live.date,
      totalUsers: live.totalUsers,
      newUsersToday: live.newUsersToday,
      activeUsers7d: live.activeUsers7d,
      totalPosts: live.totalPosts,
      postsToday: live.postsToday,
      totalDeals: live.totalDeals,
      dealsCompletedToday: live.dealsCompletedToday,
      gmvAed7d: live.gmvAed7d,
      completionRatePct: live.completionRatePct,
      topCategory: live.topCategory,
      topCity: live.topCity,
      aiCostAedMonthToDate: live.aiCostAedMonthToDate,
    };
  }

  const lines = [
    `*Dashboard · ${latest.snapshotDate}*`,
    `• Users: ${latest.totalUsers} (+${latest.newUsersToday} today, ${latest.activeUsers7d} active 7d)`,
    `• Posts: ${latest.totalPosts} (+${latest.postsToday} today)`,
    `• Deals: ${latest.totalDeals} (${latest.dealsCompletedToday} completed today)`,
    `• GMV 7d: AED ${safeNum(latest.gmvAed7d).toFixed(2)}`,
    `• Completion rate: ${safeNum(latest.completionRatePct).toFixed(1)}%`,
    `• Top category: ${latest.topCategory ?? "—"}`,
    `• Top city: ${latest.topCity ?? "—"}`,
    `• AI spend MTD: AED ${safeNum(latest.aiCostAedMonthToDate).toFixed(2)}`,
  ];

  // Seed memory: each `dashboard` invocation bumps the founder's
  // most-asked KPI surface. usageCount on this row tells the rest of
  // the OS which summary the founder relies on most.
  rememberInBackground({
    agentName: "dashboard",
    memoryType: "preference",
    key: "founder_asked_kpi_summary",
    value: { lastShownDate: latest.snapshotDate },
    confidence: 0.5,
  });

  return lines.join("\n");
}

/**
 * List recent snapshots for the admin page's history table / sparkline.
 */
export async function getRecentSnapshots(limit = 30) {
  try {
    return await db
      .select()
      .from(kpiSnapshots)
      .orderBy(desc(kpiSnapshots.snapshotDate))
      .limit(Math.max(1, Math.min(180, limit)));
  } catch (err) {
    console.error("[companyOs.dashboard] getRecentSnapshots failed:", err);
    return [];
  }
}

/**
 * Fetch a snapshot by Dubai date (YYYY-MM-DD). Used by the
 * `/dashboard/snapshot/:date` JSON download.
 */
export async function getSnapshotByDate(date: string) {
  try {
    const rows = await db
      .select()
      .from(kpiSnapshots)
      .where(eq(kpiSnapshots.snapshotDate, date))
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    console.error("[companyOs.dashboard] getSnapshotByDate failed:", err);
    return null;
  }
}

