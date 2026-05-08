// Board Report Agent — monthly investor/board-ready PDF report.
//
// Cron: 1st of each month at 10:00 Asia/Dubai (== 06:00 UTC). Aggregates
// the prior calendar month's KPIs/finance/sales/marketing/legal/alerts/AI-
// cost rows from the existing Company OS tables, asks the LLM to write a
// concise founder-style 4-paragraph executive summary, then renders a
// multi-section PDF via jsPDF, uploads it to private object storage at
// `companyOs/board-reports/<YYYY-MM>.pdf`, and persists a `board_reports`
// row pinning the storage key + a JSON copy of the metrics.
//
// Idempotent on `reportMonth`: re-running the same month overwrites the
// storage key and updates the row instead of creating duplicates.
//
// Budget-safe: uses the per-agent budget gate (`boardReportAgent`), and
// when the cap is breached falls back to a deterministic templated
// narrative so the report still ships.

import { and, desc, eq, gte, lt, sql, count } from "drizzle-orm";
import { jsPDF } from "jspdf";
import { db } from "../db";
import {
  boardReports,
  campaignPerformance,
  companyOsLogs,
  financeSnapshots,
  kpiSnapshots,
  legalDocuments,
  proactiveAlerts,
  salesLeads,
  type BoardReport,
} from "@shared/schema";
import { chatCompletion, type ChatMessage } from "../agents/llm";
import {
  DEFAULT_MODEL,
  isAgentBudgetSafe,
  logLlmCall,
} from "./costTracker";
import { uploadPrivateBuffer, getSignedDownloadUrl } from "./objectStorageHelpers";
import { isDriveConfigured, uploadFileToDrive } from "../integrations/googleDrive";
import { isSlackConfigured, postSlackAlert } from "../integrations/slack";

export const AGENT = "boardReportAgent";
export const BOARD_REPORT_SIGNED_URL_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const STORAGE_PREFIX = "companyOs/board-reports/";

// ---------------------------------------------------------------------------
// Month math — pure, side-effect-free.
// ---------------------------------------------------------------------------

const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function parseReportMonth(month: string): { year: number; month: number } {
  const m = MONTH_RE.exec(month.trim());
  if (!m) throw new Error(`Invalid reportMonth (expected YYYY-MM): ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || y < 2020 || y > 2100) {
    throw new Error(`Invalid year in reportMonth: ${month}`);
  }
  if (!Number.isFinite(mo) || mo < 1 || mo > 12) {
    throw new Error(`Invalid month in reportMonth: ${month}`);
  }
  return { year: y, month: mo };
}

/**
 * "YYYY-MM" string for the calendar month BEFORE `now` in UTC. Used as
 * the default month when the cron fires on the 1st (we want the month
 * that just ended, not the one that just started).
 */
export function lastCompletedMonthYyyyMm(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0..11 — current month
  // Previous month, allowing roll-back across year boundary.
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 12 : m;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

export function monthBoundsUtc(month: string): { start: Date; endExclusive: Date; label: string } {
  const { year, month: mo } = parseReportMonth(month);
  const start = new Date(Date.UTC(year, mo - 1, 1, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, mo, 1, 0, 0, 0));
  const label = start.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { start, endExclusive, label };
}

// ---------------------------------------------------------------------------
// Aggregator — pulls the prior month from each Company OS table. Errors
// degrade to empty rows so a single dead read can't kill the report.
// ---------------------------------------------------------------------------

export interface AgentSpend {
  agentName: string;
  spentAed: number;
  calls: number;
}

export interface BoardReportMetrics {
  reportMonth: string;
  monthLabel: string;
  finance: {
    totalRevenueAed: number;
    transactionCount: number;
    refundsAed: number;
    refundCount: number;
    daysWithRevenue: number;
  };
  growth: {
    avgTotalUsers: number;
    avgActiveUsers7d: number;
    newUsersTotal: number;
    newPostsTotal: number;
    completedDealsTotal: number;
    avgCompletionRatePct: number;
    endingTotalUsers: number;
    endingTotalDeals: number;
    endingGmv7dAed: number;
  };
  sales: {
    totalLeads: number;
    leadsCreatedThisMonth: number;
    convertedThisMonth: number;
    byStatus: { status: string; count: number }[];
    avgLeadScore: number;
    // Top 5 leads ranked by leadScore desc, then most recent activity.
    // Rendered as a table in the PDF so the founder/board can spot the
    // hottest pipeline entries at a glance.
    topLeads: {
      fullName: string;
      email: string;
      userType: string;
      leadScore: number;
      status: string;
      location: string | null;
    }[];
  };
  marketing: {
    activeCampaigns: number;
    totalSpendAed: number;
    totalConversions: number;
    avgCtr: number;
    topCampaigns: { name: string; ctr: number; spendAed: number; conversions: number }[];
  };
  legal: {
    contractsCount: number;
    disputeSummaries: number;
    vatFlags: number;
    recentTitles: string[];
  };
  alerts: {
    totalCreated: number;
    bySeverity: { severity: string; count: number }[];
    criticalSample: { title: string; createdAt: string | null }[];
  };
  aiCost: {
    totalAed: number;
    callsCount: number;
    perAgent: AgentSpend[];
    errorCount: number;
  };
}

async function safe<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[companyOs.boardReport] ${label} failed:`, err);
    return fallback;
  }
}

export async function gatherMetrics(month: string): Promise<BoardReportMetrics> {
  const { start, endExclusive, label } = monthBoundsUtc(month);
  const startStr = month + "-01"; // "YYYY-MM-01" for snapshotDate text columns
  const { year, month: mo } = parseReportMonth(month);
  const endStr = `${mo === 12 ? year + 1 : year}-${String(mo === 12 ? 1 : mo + 1).padStart(2, "0")}-01`;

  // Finance — sum across the month's daily snapshots.
  const finance = await safe(async () => {
    const rows = await db
      .select({
        totalRevenueAed: sql<string>`COALESCE(SUM(${financeSnapshots.totalRevenueAed}), 0)`,
        transactionCount: sql<string>`COALESCE(SUM(${financeSnapshots.transactionCount}), 0)`,
        refundsAed: sql<string>`COALESCE(SUM(${financeSnapshots.refundsAed}), 0)`,
        refundCount: sql<string>`COALESCE(SUM(${financeSnapshots.refundCount}), 0)`,
        days: sql<string>`COUNT(*)`,
      })
      .from(financeSnapshots)
      .where(
        and(
          gte(financeSnapshots.snapshotDate, startStr),
          lt(financeSnapshots.snapshotDate, endStr),
        ),
      );
    const r = rows[0];
    return {
      totalRevenueAed: Number(r?.totalRevenueAed ?? "0"),
      transactionCount: Number(r?.transactionCount ?? "0"),
      refundsAed: Number(r?.refundsAed ?? "0"),
      refundCount: Number(r?.refundCount ?? "0"),
      daysWithRevenue: Number(r?.days ?? "0"),
    };
  }, {
    totalRevenueAed: 0,
    transactionCount: 0,
    refundsAed: 0,
    refundCount: 0,
    daysWithRevenue: 0,
  }, "finance");

  // Growth — from KPI snapshots. We average the daily totals (since
  // they're cumulative we also report the LAST snapshot as "ending" totals).
  const growth = await safe(async () => {
    const rows = await db
      .select({
        avgTotalUsers: sql<string>`COALESCE(AVG(${kpiSnapshots.totalUsers}), 0)`,
        avgActive7d: sql<string>`COALESCE(AVG(${kpiSnapshots.activeUsers7d}), 0)`,
        newUsers: sql<string>`COALESCE(SUM(${kpiSnapshots.newUsersToday}), 0)`,
        newPosts: sql<string>`COALESCE(SUM(${kpiSnapshots.postsToday}), 0)`,
        completedDeals: sql<string>`COALESCE(SUM(${kpiSnapshots.dealsCompletedToday}), 0)`,
        avgCompletion: sql<string>`COALESCE(AVG(${kpiSnapshots.completionRatePct}), 0)`,
      })
      .from(kpiSnapshots)
      .where(
        and(
          gte(kpiSnapshots.snapshotDate, startStr),
          lt(kpiSnapshots.snapshotDate, endStr),
        ),
      );
    const r = rows[0];
    const ending = await db
      .select()
      .from(kpiSnapshots)
      .where(
        and(
          gte(kpiSnapshots.snapshotDate, startStr),
          lt(kpiSnapshots.snapshotDate, endStr),
        ),
      )
      .orderBy(desc(kpiSnapshots.snapshotDate))
      .limit(1);
    const last = ending[0];
    return {
      avgTotalUsers: Math.round(Number(r?.avgTotalUsers ?? "0")),
      avgActiveUsers7d: Math.round(Number(r?.avgActive7d ?? "0")),
      newUsersTotal: Number(r?.newUsers ?? "0"),
      newPostsTotal: Number(r?.newPosts ?? "0"),
      completedDealsTotal: Number(r?.completedDeals ?? "0"),
      avgCompletionRatePct: Number(Number(r?.avgCompletion ?? "0").toFixed(2)),
      endingTotalUsers: last?.totalUsers ?? 0,
      endingTotalDeals: last?.totalDeals ?? 0,
      endingGmv7dAed: Number(last?.gmvAed7d ?? "0"),
    };
  }, {
    avgTotalUsers: 0,
    avgActiveUsers7d: 0,
    newUsersTotal: 0,
    newPostsTotal: 0,
    completedDealsTotal: 0,
    avgCompletionRatePct: 0,
    endingTotalUsers: 0,
    endingTotalDeals: 0,
    endingGmv7dAed: 0,
  }, "growth");

  // Sales — overall snapshot + breakdown + top 5 leads by score.
  const sales = await safe(async () => {
    const [byStatus, totals, createdMonth, convertedMonth, scoreRow, topLeads] = await Promise.all([
      db
        .select({ status: salesLeads.status, c: count() })
        .from(salesLeads)
        .groupBy(salesLeads.status),
      db.select({ c: count() }).from(salesLeads),
      db
        .select({ c: count() })
        .from(salesLeads)
        .where(and(gte(salesLeads.createdAt, start), lt(salesLeads.createdAt, endExclusive))),
      db
        .select({ c: count() })
        .from(salesLeads)
        .where(
          and(
            eq(salesLeads.status, "converted"),
            gte(salesLeads.updatedAt, start),
            lt(salesLeads.updatedAt, endExclusive),
          ),
        ),
      db
        .select({ avg: sql<string>`COALESCE(AVG(${salesLeads.leadScore}), 0)` })
        .from(salesLeads),
      db
        .select({
          fullName: salesLeads.fullName,
          email: salesLeads.email,
          userType: salesLeads.userType,
          leadScore: salesLeads.leadScore,
          status: salesLeads.status,
          location: salesLeads.location,
        })
        .from(salesLeads)
        .orderBy(desc(salesLeads.leadScore), desc(salesLeads.lastActivityAt))
        .limit(5),
    ]);
    return {
      totalLeads: totals[0]?.c ?? 0,
      leadsCreatedThisMonth: createdMonth[0]?.c ?? 0,
      convertedThisMonth: convertedMonth[0]?.c ?? 0,
      byStatus: byStatus.map((r) => ({ status: r.status, count: r.c })),
      avgLeadScore: Math.round(Number(scoreRow[0]?.avg ?? "0")),
      topLeads: topLeads.map((r) => ({
        fullName: r.fullName,
        email: r.email,
        userType: r.userType,
        leadScore: r.leadScore,
        status: r.status,
        location: r.location,
      })),
    };
  }, {
    totalLeads: 0,
    leadsCreatedThisMonth: 0,
    convertedThisMonth: 0,
    byStatus: [] as { status: string; count: number }[],
    avgLeadScore: 0,
    topLeads: [] as BoardReportMetrics["sales"]["topLeads"],
  }, "sales");

  // Marketing — campaigns updated this month.
  const marketing = await safe(async () => {
    const rows = await db
      .select()
      .from(campaignPerformance)
      .where(
        and(
          gte(campaignPerformance.updatedAt, start),
          lt(campaignPerformance.updatedAt, endExclusive),
        ),
      )
      .orderBy(desc(campaignPerformance.spendAed))
      .limit(50);
    const totalSpend = rows.reduce((s, r) => s + Number(r.spendAed ?? "0"), 0);
    const totalConv = rows.reduce((s, r) => s + (r.conversions ?? 0), 0);
    const avgCtr = rows.length === 0
      ? 0
      : rows.reduce((s, r) => s + Number(r.ctr ?? "0"), 0) / rows.length;
    const top = rows.slice(0, 5).map((r) => ({
      name: r.campaignName,
      ctr: Number(r.ctr ?? "0"),
      spendAed: Number(r.spendAed ?? "0"),
      conversions: r.conversions ?? 0,
    }));
    return {
      activeCampaigns: rows.length,
      totalSpendAed: Number(totalSpend.toFixed(2)),
      totalConversions: totalConv,
      avgCtr: Number(avgCtr.toFixed(2)),
      topCampaigns: top,
    };
  }, {
    activeCampaigns: 0,
    totalSpendAed: 0,
    totalConversions: 0,
    avgCtr: 0,
    topCampaigns: [] as { name: string; ctr: number; spendAed: number; conversions: number }[],
  }, "marketing");

  // Legal — documents created this month.
  const legal = await safe(async () => {
    const rows = await db
      .select()
      .from(legalDocuments)
      .where(
        and(
          gte(legalDocuments.createdAt, start),
          lt(legalDocuments.createdAt, endExclusive),
        ),
      )
      .orderBy(desc(legalDocuments.createdAt))
      .limit(50);
    const contracts = rows.filter((r) => r.documentType === "contract").length;
    const disputes = rows.filter((r) => r.documentType === "dispute_summary").length;
    const vat = rows.filter((r) => r.documentType === "vat_flag").length;
    const titles = rows.slice(0, 8).map((r) => r.title);
    return {
      contractsCount: contracts,
      disputeSummaries: disputes,
      vatFlags: vat,
      recentTitles: titles,
    };
  }, {
    contractsCount: 0,
    disputeSummaries: 0,
    vatFlags: 0,
    recentTitles: [] as string[],
  }, "legal");

  // Alerts — proactive alerts created this month.
  const alerts = await safe(async () => {
    const [bySev, totalRow, criticalRows] = await Promise.all([
      db
        .select({ severity: proactiveAlerts.severity, c: count() })
        .from(proactiveAlerts)
        .where(
          and(
            gte(proactiveAlerts.createdAt, start),
            lt(proactiveAlerts.createdAt, endExclusive),
          ),
        )
        .groupBy(proactiveAlerts.severity),
      db
        .select({ c: count() })
        .from(proactiveAlerts)
        .where(
          and(
            gte(proactiveAlerts.createdAt, start),
            lt(proactiveAlerts.createdAt, endExclusive),
          ),
        ),
      db
        .select()
        .from(proactiveAlerts)
        .where(
          and(
            eq(proactiveAlerts.severity, "critical"),
            gte(proactiveAlerts.createdAt, start),
            lt(proactiveAlerts.createdAt, endExclusive),
          ),
        )
        .orderBy(desc(proactiveAlerts.createdAt))
        .limit(5),
    ]);
    return {
      totalCreated: totalRow[0]?.c ?? 0,
      bySeverity: bySev.map((r) => ({ severity: r.severity, count: r.c })),
      criticalSample: criticalRows.map((r) => ({
        title: r.title,
        createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      })),
    };
  }, {
    totalCreated: 0,
    bySeverity: [] as { severity: string; count: number }[],
    criticalSample: [] as { title: string; createdAt: string | null }[],
  }, "alerts");

  // AI cost — sum companyOsLogs for the month, grouped by agent.
  const aiCost = await safe(async () => {
    const rows = await db
      .select({
        agentName: companyOsLogs.agentName,
        total: sql<string>`COALESCE(SUM(${companyOsLogs.costAed}), 0)`,
        c: count(),
      })
      .from(companyOsLogs)
      .where(and(gte(companyOsLogs.createdAt, start), lt(companyOsLogs.createdAt, endExclusive)))
      .groupBy(companyOsLogs.agentName);
    const errors = await db
      .select({ c: count() })
      .from(companyOsLogs)
      .where(
        and(
          eq(companyOsLogs.status, "error"),
          gte(companyOsLogs.createdAt, start),
          lt(companyOsLogs.createdAt, endExclusive),
        ),
      );
    const perAgent: AgentSpend[] = rows
      .map((r) => ({
        agentName: r.agentName,
        spentAed: Number(Number(r.total ?? "0").toFixed(2)),
        calls: r.c,
      }))
      .sort((a, b) => b.spentAed - a.spentAed);
    const totalAed = perAgent.reduce((s, r) => s + r.spentAed, 0);
    const callsCount = perAgent.reduce((s, r) => s + r.calls, 0);
    return {
      totalAed: Number(totalAed.toFixed(2)),
      callsCount,
      perAgent: perAgent.slice(0, 12),
      errorCount: errors[0]?.c ?? 0,
    };
  }, {
    totalAed: 0,
    callsCount: 0,
    perAgent: [] as AgentSpend[],
    errorCount: 0,
  }, "aiCost");

  return {
    reportMonth: month,
    monthLabel: label,
    finance,
    growth,
    sales,
    marketing,
    legal,
    alerts,
    aiCost,
  };
}

// ---------------------------------------------------------------------------
// Narrative — LLM call with budget gate + deterministic fallback.
// ---------------------------------------------------------------------------

const NARRATIVE_SYSTEM = `You are the Board Report Agent for Bareter (UAE/GCC barter marketplace). Write a concise, founder-style "month in 4 paragraphs" executive summary for the company's board.

Constraints:
- Exactly 4 paragraphs, separated by a blank line.
- Paragraph 1: financial result (revenue, refunds, transactions).
- Paragraph 2: growth (users, posts, completed deals, completion rate).
- Paragraph 3: sales + marketing performance + AI cost.
- Paragraph 4: risks (alerts, disputes) + the next month's focus.
- Plain English. No headings. No bullets. No emoji. No hashtags.
- Use AED for currency. Round numbers to whole AED.
- 600-900 characters total.
- Output only the prose, nothing else.`;

export function templatedNarrative(m: BoardReportMetrics): string {
  const aed = (n: number) => `AED ${Math.round(n).toLocaleString()}`;
  const pct = (n: number) => `${n.toFixed(1)}%`;
  const paragraphs = [
    `In ${m.monthLabel}, Bareter recorded ${aed(m.finance.totalRevenueAed)} of revenue across ${m.finance.transactionCount} transactions, with ${aed(m.finance.refundsAed)} in refunds (${m.finance.refundCount} refunds). Revenue was logged on ${m.finance.daysWithRevenue} days during the month.`,
    `The platform ended the month with ${m.growth.endingTotalUsers.toLocaleString()} total users (averaging ${m.growth.avgActiveUsers7d.toLocaleString()} active in the trailing 7-day window) and ${m.growth.endingTotalDeals.toLocaleString()} cumulative deals. New activity for the month: ${m.growth.newUsersTotal} users, ${m.growth.newPostsTotal} posts, ${m.growth.completedDealsTotal} completed deals at an average completion rate of ${pct(m.growth.avgCompletionRatePct)}.`,
    `Sales pipeline finished at ${m.sales.totalLeads.toLocaleString()} leads (${m.sales.leadsCreatedThisMonth} added this month, ${m.sales.convertedThisMonth} converted). Marketing ran ${m.marketing.activeCampaigns} active campaigns at ${aed(m.marketing.totalSpendAed)} spend for ${m.marketing.totalConversions} conversions (avg CTR ${pct(m.marketing.avgCtr)}). AI operating cost for the month was ${aed(m.aiCost.totalAed)} across ${m.aiCost.callsCount} agent calls.`,
    `Risk: ${m.alerts.totalCreated} proactive alerts were raised; ${m.legal.disputeSummaries} dispute summaries and ${m.legal.vatFlags} VAT flags were generated by the Legal Agent. Focus for next month: defend completion rate, convert top-of-funnel leads, and keep AI cost inside the monthly AED budget.`,
  ];
  return paragraphs.join("\n\n");
}

export async function generateNarrative(m: BoardReportMetrics): Promise<string> {
  const safe = await isAgentBudgetSafe(AGENT);
  if (!safe) {
    console.log("[companyOs.boardReport] per-agent budget breached — using templated narrative");
    return templatedNarrative(m);
  }
  // Compact JSON the LLM can paraphrase from. Keep it small to control tokens.
  const data = {
    month: m.monthLabel,
    finance: m.finance,
    growth: m.growth,
    sales: { totals: m.sales.totalLeads, created: m.sales.leadsCreatedThisMonth, converted: m.sales.convertedThisMonth, byStatus: m.sales.byStatus.slice(0, 6) },
    marketing: { campaigns: m.marketing.activeCampaigns, spend: m.marketing.totalSpendAed, conversions: m.marketing.totalConversions, avgCtr: m.marketing.avgCtr },
    legal: { contracts: m.legal.contractsCount, disputes: m.legal.disputeSummaries, vatFlags: m.legal.vatFlags },
    alerts: { total: m.alerts.totalCreated, bySeverity: m.alerts.bySeverity },
    aiCost: { totalAed: m.aiCost.totalAed, calls: m.aiCost.callsCount, errors: m.aiCost.errorCount },
  };
  const messages: ChatMessage[] = [
    { role: "system", content: NARRATIVE_SYSTEM },
    { role: "user", content: `Month metrics (JSON):\n${JSON.stringify(data)}` },
  ];
  try {
    const { content } = await chatCompletion(messages, {
      agentName: AGENT,
      command: "narrative",
      inputPreview: m.monthLabel,
      model: DEFAULT_MODEL,
      temperature: 0.4,
      maxTokens: 600,
      agentBudgetFallback: templatedNarrative(m),
    });
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : templatedNarrative(m);
  } catch (err) {
    console.error("[companyOs.boardReport] narrative LLM failed — using template:", err);
    return templatedNarrative(m);
  }
}

// ---------------------------------------------------------------------------
// PDF rendering — multi-section layout via jsPDF.
// ---------------------------------------------------------------------------

interface RenderArgs {
  metrics: BoardReportMetrics;
  narrative: string;
}

function renderText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  doc.text(lines, x, y);
  return y + lines.length * 5 + 1;
}

function ensureSpace(doc: jsPDF, y: number, needed = 14): number {
  if (y + needed > 280) {
    doc.addPage();
    return 22;
  }
  return y;
}

function sectionHeader(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, y, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, 18, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  return y + 7;
}

function table(
  doc: jsPDF,
  rows: { label: string; value: string }[],
  y: number,
): number {
  for (const row of rows) {
    y = ensureSpace(doc, y, 6);
    doc.setFont("helvetica", "normal");
    doc.text(row.label, 22, y);
    doc.setFont("helvetica", "bold");
    doc.text(row.value, 188, y, { align: "right" });
    y += 5;
  }
  return y + 2;
}

const aed = (n: number) => `AED ${Math.round(n).toLocaleString()}`;

export function renderBoardReportPdf({ metrics, narrative }: RenderArgs): Buffer {
  const doc = new jsPDF();
  const left = 18;
  const right = 192;
  const maxWidth = right - left;

  // Cover page
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("Bareter — Board Report", left, 50);
  doc.setFontSize(16);
  doc.text(metrics.monthLabel, left, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Report month: ${metrics.reportMonth}`, left, 72);
  doc.text(`Generated: ${new Date().toISOString()}`, left, 78);
  doc.text("Confidential — for board / investor use only.", left, 92);

  doc.addPage();
  let y = 22;

  // Executive summary
  y = sectionHeader(doc, "Executive summary", y);
  for (const para of narrative.split(/\n\n+/)) {
    y = ensureSpace(doc, y, 14);
    y = renderText(doc, para, left, y, maxWidth);
    y += 3;
  }
  y += 4;

  // Financials
  y = sectionHeader(doc, "Financials", y);
  y = table(doc, [
    { label: "Revenue (AED)", value: aed(metrics.finance.totalRevenueAed) },
    { label: "Transactions", value: metrics.finance.transactionCount.toLocaleString() },
    { label: "Refunds (AED)", value: aed(metrics.finance.refundsAed) },
    { label: "Refund count", value: metrics.finance.refundCount.toLocaleString() },
    { label: "Days with revenue", value: metrics.finance.daysWithRevenue.toLocaleString() },
  ], y);

  // Growth
  y = sectionHeader(doc, "Growth", y);
  y = table(doc, [
    { label: "Ending total users", value: metrics.growth.endingTotalUsers.toLocaleString() },
    { label: "Avg active users (7d)", value: metrics.growth.avgActiveUsers7d.toLocaleString() },
    { label: "New users (month)", value: metrics.growth.newUsersTotal.toLocaleString() },
    { label: "New posts (month)", value: metrics.growth.newPostsTotal.toLocaleString() },
    { label: "Completed deals (month)", value: metrics.growth.completedDealsTotal.toLocaleString() },
    { label: "Avg completion rate", value: `${metrics.growth.avgCompletionRatePct.toFixed(2)}%` },
    { label: "Ending GMV (7d, AED)", value: aed(metrics.growth.endingGmv7dAed) },
  ], y);

  // Sales
  y = sectionHeader(doc, "Sales pipeline", y);
  y = table(doc, [
    { label: "Total leads", value: metrics.sales.totalLeads.toLocaleString() },
    { label: "Created this month", value: metrics.sales.leadsCreatedThisMonth.toLocaleString() },
    { label: "Converted this month", value: metrics.sales.convertedThisMonth.toLocaleString() },
    { label: "Avg lead score", value: String(metrics.sales.avgLeadScore) },
    ...metrics.sales.byStatus.slice(0, 8).map((r) => ({
      label: `  · ${r.status}`,
      value: r.count.toLocaleString(),
    })),
  ], y);
  // Top leads — ranked by leadScore desc, then most recent activity.
  // Surfaces the hottest names so the board can pattern-match against
  // the qualitative narrative.
  if (metrics.sales.topLeads.length > 0) {
    y = ensureSpace(doc, y, 8);
    doc.setFont("helvetica", "bold");
    doc.text("Top leads", 22, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    for (const l of metrics.sales.topLeads) {
      y = ensureSpace(doc, y, 6);
      const loc = l.location ? `, ${l.location}` : "";
      const line = `• ${l.fullName} (${l.userType}${loc}) — score ${l.leadScore}, ${l.status}, ${l.email}`;
      y = renderText(doc, line, 22, y, maxWidth - 4);
    }
    y += 2;
  }

  // Marketing
  y = sectionHeader(doc, "Marketing", y);
  y = table(doc, [
    { label: "Active campaigns", value: metrics.marketing.activeCampaigns.toLocaleString() },
    { label: "Spend (AED)", value: aed(metrics.marketing.totalSpendAed) },
    { label: "Conversions", value: metrics.marketing.totalConversions.toLocaleString() },
    { label: "Avg CTR", value: `${metrics.marketing.avgCtr.toFixed(2)}%` },
  ], y);
  if (metrics.marketing.topCampaigns.length > 0) {
    y = ensureSpace(doc, y, 8);
    doc.setFont("helvetica", "bold");
    doc.text("Top campaigns", 22, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    for (const c of metrics.marketing.topCampaigns) {
      y = ensureSpace(doc, y, 6);
      const line = `• ${c.name} — CTR ${c.ctr.toFixed(2)}%, ${aed(c.spendAed)}, ${c.conversions} conv`;
      y = renderText(doc, line, 22, y, maxWidth - 4);
    }
    y += 2;
  }

  // Legal
  y = sectionHeader(doc, "Legal", y);
  y = table(doc, [
    { label: "Contracts generated", value: metrics.legal.contractsCount.toLocaleString() },
    { label: "Dispute summaries", value: metrics.legal.disputeSummaries.toLocaleString() },
    { label: "VAT flags", value: metrics.legal.vatFlags.toLocaleString() },
  ], y);
  if (metrics.legal.recentTitles.length > 0) {
    for (const t of metrics.legal.recentTitles) {
      y = ensureSpace(doc, y, 6);
      y = renderText(doc, `• ${t}`, 22, y, maxWidth - 4);
    }
    y += 2;
  }

  // Alerts
  y = sectionHeader(doc, "Alerts", y);
  y = table(doc, [
    { label: "Total alerts created", value: metrics.alerts.totalCreated.toLocaleString() },
    ...metrics.alerts.bySeverity.map((r) => ({
      label: `  · ${r.severity}`,
      value: r.count.toLocaleString(),
    })),
  ], y);
  if (metrics.alerts.criticalSample.length > 0) {
    y = ensureSpace(doc, y, 8);
    doc.setFont("helvetica", "bold");
    doc.text("Critical sample", 22, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    for (const c of metrics.alerts.criticalSample) {
      y = ensureSpace(doc, y, 6);
      y = renderText(doc, `• ${c.title}`, 22, y, maxWidth - 4);
    }
    y += 2;
  }

  // AI cost breakdown
  y = sectionHeader(doc, "AI cost breakdown", y);
  y = table(doc, [
    { label: "Total AED", value: aed(metrics.aiCost.totalAed) },
    { label: "Total LLM calls", value: metrics.aiCost.callsCount.toLocaleString() },
    { label: "Errors logged", value: metrics.aiCost.errorCount.toLocaleString() },
  ], y);
  if (metrics.aiCost.perAgent.length > 0) {
    for (const a of metrics.aiCost.perAgent) {
      y = ensureSpace(doc, y, 6);
      y = renderText(
        doc,
        `• ${a.agentName} — ${aed(a.spentAed)} (${a.calls} calls)`,
        22,
        y,
        maxWidth - 4,
      );
    }
  }

  return Buffer.from(doc.output("arraybuffer"));
}

// ---------------------------------------------------------------------------
// End-to-end orchestration: gather → narrate → render → upload → persist.
// ---------------------------------------------------------------------------

export interface GenerateResult {
  report: BoardReport;
  signedUrl: string | null;
  truncated: boolean;
}

export function storageKeyFor(month: string): string {
  parseReportMonth(month);
  return `${STORAGE_PREFIX}${month}.pdf`;
}

export async function generateMonthlyReport(month?: string): Promise<GenerateResult> {
  const target = month ? month : lastCompletedMonthYyyyMm();
  parseReportMonth(target); // throws on bad input
  const metrics = await gatherMetrics(target);
  const narrative = await generateNarrative(metrics);
  let pdf = renderBoardReportPdf({ metrics, narrative });
  let truncated = false;
  if (pdf.byteLength > MAX_PDF_BYTES) {
    // Truncate per-section row counts and re-render once. PDFs that
    // overflow are rare (would require thousands of campaigns/leads),
    // but we still ship under the 5 MB ceiling.
    truncated = true;
    const trimmed: BoardReportMetrics = {
      ...metrics,
      sales: {
        ...metrics.sales,
        byStatus: metrics.sales.byStatus.slice(0, 4),
        topLeads: metrics.sales.topLeads.slice(0, 3),
      },
      marketing: { ...metrics.marketing, topCampaigns: metrics.marketing.topCampaigns.slice(0, 3) },
      legal: { ...metrics.legal, recentTitles: metrics.legal.recentTitles.slice(0, 4) },
      alerts: { ...metrics.alerts, criticalSample: metrics.alerts.criticalSample.slice(0, 3) },
      aiCost: { ...metrics.aiCost, perAgent: metrics.aiCost.perAgent.slice(0, 6) },
    };
    pdf = renderBoardReportPdf({ metrics: trimmed, narrative });
  }

  const key = storageKeyFor(target);
  let signedUrl: string | null = null;
  let storageKey: string | null = null;
  let pdfSize = pdf.byteLength;
  try {
    await uploadPrivateBuffer(key, pdf, "application/pdf");
    storageKey = key;
    try {
      signedUrl = await getSignedDownloadUrl(key, BOARD_REPORT_SIGNED_URL_TTL_SEC);
    } catch (err) {
      console.error("[companyOs.boardReport] signed URL failed:", err);
    }
  } catch (err) {
    console.error("[companyOs.boardReport] upload failed:", err);
    pdfSize = 0;
  }

  // Mirror PDF to Google Drive if configured (non-blocking).
  if (await isDriveConfigured()) {
    try {
      const driveResult = await uploadFileToDrive(
        `Bareter-Board-Report-${target}.pdf`,
        pdf,
        "application/pdf",
      );
      if (driveResult) {
        console.log(`[companyOs.boardReport] uploaded to Drive: ${driveResult.webViewLink}`);
      }
    } catch (err) {
      console.error("[companyOs.boardReport] Drive upload failed (non-fatal):", err);
    }
  }

  // Notify Slack if configured (non-blocking).
  if (await isSlackConfigured()) {
    try {
      await postSlackAlert(
        `Board Report Ready — ${target}`,
        `Monthly board report for *${target}* has been generated.${signedUrl ? ` Download: ${signedUrl}` : ""}`,
        "info",
      );
    } catch (err) {
      console.error("[companyOs.boardReport] Slack alert failed (non-fatal):", err);
    }
  }

  // Idempotent upsert by reportMonth.
  const inserted = await db
    .insert(boardReports)
    .values({
      reportMonth: target,
      objectStorageKey: storageKey,
      summaryText: narrative,
      metricsJson: metrics as unknown as Record<string, unknown>,
      pdfSizeBytes: pdfSize,
    })
    .onConflictDoUpdate({
      target: boardReports.reportMonth,
      set: {
        objectStorageKey: storageKey,
        summaryText: narrative,
        metricsJson: metrics as unknown as Record<string, unknown>,
        pdfSizeBytes: pdfSize,
      },
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("Failed to upsert board_reports row");

  await logLlmCall({
    agentName: AGENT,
    command: "report",
    inputPreview: target,
    outputPreview: `pdf=${pdfSize}B truncated=${truncated}`,
    tokensUsed: 0,
  });

  return { report: row, signedUrl, truncated };
}

// ---------------------------------------------------------------------------
// Read helpers — backs HTTP routes + WhatsApp commands + dashboard panel.
// ---------------------------------------------------------------------------

export async function getRecentReports(limit = 12): Promise<BoardReport[]> {
  return db
    .select()
    .from(boardReports)
    .orderBy(desc(boardReports.reportMonth))
    .limit(Math.max(1, Math.min(120, limit)));
}

export async function getReportByMonth(month: string): Promise<BoardReport | null> {
  parseReportMonth(month);
  const rows = await db
    .select()
    .from(boardReports)
    .where(eq(boardReports.reportMonth, month))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// WhatsApp command surface — invoked by the Manager Agent. Returns the
// ready-to-send WhatsApp body. `board report` (no arg) targets the last
// completed month; `board report YYYY-MM` targets a specific one.
// ---------------------------------------------------------------------------

const BOARD_RE = /^board\s+report(?:\s+(\d{4}-\d{2}))?\s*$/i;

export function parseBoardReportCommand(text: string): { month: string | null } | null {
  const m = BOARD_RE.exec(text.trim());
  if (!m) return null;
  return { month: m[1] || null };
}

export async function handleBoardReportCommand(rawText: string): Promise<string> {
  const parsed = parseBoardReportCommand(rawText);
  if (!parsed) {
    return "Usage: `board report` (last month) or `board report YYYY-MM`";
  }
  const month = parsed.month || lastCompletedMonthYyyyMm();
  try {
    parseReportMonth(month);
  } catch {
    return `Invalid month \`${month}\`. Use YYYY-MM, e.g. \`board report 2026-03\`.`;
  }

  let report = await getReportByMonth(month);
  let signedUrl: string | null = null;
  if (!report || !report.objectStorageKey) {
    try {
      const r = await generateMonthlyReport(month);
      report = r.report;
      signedUrl = r.signedUrl;
    } catch (err) {
      console.error("[companyOs.boardReport] generate-on-demand failed:", err);
      return `Couldn't generate the board report for ${month}. Check the dashboard logs.`;
    }
  } else {
    try {
      signedUrl = await getSignedDownloadUrl(
        report.objectStorageKey,
        BOARD_REPORT_SIGNED_URL_TTL_SEC,
      );
    } catch (err) {
      console.error("[companyOs.boardReport] signed URL failed:", err);
    }
  }

  const lines = [
    `📑 *Board report — ${month}*`,
    `PDF size: ${(report.pdfSizeBytes / 1024).toFixed(0)} KB`,
  ];
  if (signedUrl) lines.push(`Download: ${signedUrl}`);
  else lines.push("(PDF link unavailable — check object storage logs)");
  lines.push("");
  lines.push(report.summaryText.slice(0, 1200));
  return lines.join("\n");
}
