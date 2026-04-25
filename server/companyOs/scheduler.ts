// Scheduler — node-cron jobs for the Company OS.
//
// All jobs use the Asia/Dubai timezone option so they fire at the right
// wall-clock time regardless of the host container's TZ. Each job is
// wrapped in try/catch so a single failure can't kill the others.

import * as cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { runDailyFinanceSnapshot } from "./financeAgent";
import { composeDailyBriefing } from "./managerAgent";
import { notifyFounder, isFounderConfigured } from "./twilio";
import { getBudgetVerdict } from "./costTracker";
import { generateAndStoreBrief, BRIEF_SIGNED_URL_TTL_SEC } from "./marketingAgent";
import { runDailySalesSync } from "./salesAgent";
import { runDisputeRiskSummary } from "./legalAgent";
import { captureDailySnapshot } from "./dashboardAgent";
import { getSignedDownloadUrl } from "./objectStorageHelpers";

const TZ_OPT = { timezone: "Asia/Dubai" } as const;
const isProd = () => process.env.NODE_ENV === "production";

let started = false;
const tasks: ScheduledTask[] = [];

function schedule(name: string, expr: string, run: () => Promise<void>) {
  const task = cron.schedule(
    expr,
    () => {
      run().catch((err) => {
        console.error(`[companyOs.scheduler] ${name} failed:`, err);
      });
    },
    TZ_OPT,
  );
  tasks.push(task);
  console.log(`[companyOs.scheduler] scheduled ${name} (${expr} ${TZ_OPT.timezone})`);
}

async function dailyBriefingJob(): Promise<void> {
  if (!isFounderConfigured()) {
    console.log("[companyOs.scheduler] dailyBriefing skipped — founder number not set");
    return;
  }
  // Always refresh today's snapshot first so the briefing reflects current Stripe data.
  try {
    await runDailyFinanceSnapshot();
  } catch (err) {
    console.error("[companyOs.scheduler] snapshot before briefing failed:", err);
  }
  const body = await composeDailyBriefing();
  await notifyFounder(body);
}

async function hourlyFinanceJob(): Promise<void> {
  await runDailyFinanceSnapshot();
}

async function weeklyMarketingBriefJob(): Promise<void> {
  if (!isFounderConfigured()) {
    console.log("[companyOs.scheduler] weeklyMarketingBrief skipped — founder number not set");
    return;
  }
  try {
    const brief = await generateAndStoreBrief();
    let url = "";
    if (brief.pdfStorageKey) {
      try {
        url = await getSignedDownloadUrl(brief.pdfStorageKey, BRIEF_SIGNED_URL_TTL_SEC);
      } catch (err) {
        console.error("[companyOs.scheduler] brief signed URL failed:", err);
      }
    }
    const lines = [
      `📣 *Weekly marketing brief — ${brief.weekStart}*`,
      `*Theme:* ${brief.theme}`,
      `*Suggested budget:* AED ${Number(brief.suggestedBudgetAed).toFixed(0)}`,
    ];
    if (Array.isArray(brief.hashtags) && brief.hashtags.length > 0) {
      lines.push((brief.hashtags as string[]).join("  "));
    }
    if (url) lines.push(`PDF: ${url}`);
    lines.push("", "Log results with `campaign update <name> ctr=X spend=Y conversions=Z`.");
    await notifyFounder(lines.join("\n"));
  } catch (err) {
    console.error("[companyOs.scheduler] weeklyMarketingBrief failed:", err);
  }
}

async function weeklyDisputeRiskJob(): Promise<void> {
  if (!isFounderConfigured()) {
    console.log("[companyOs.scheduler] weeklyDisputeRisk skipped — founder number not set");
    return;
  }
  try {
    const { snapshot, callouts } = await runDisputeRiskSummary(7);
    const lines: string[] = [
      `⚖️ *Dispute risk · last ${snapshot.windowDays} days*`,
      `Total reports: ${snapshot.totalReports}`,
    ];
    if (snapshot.byReason.length > 0) {
      lines.push("");
      lines.push("*By reason*");
      for (const r of snapshot.byReason) lines.push(`• ${r.reason}: ${r.count}`);
    }
    if (snapshot.byStatus.length > 0) {
      lines.push("");
      lines.push("*By status*");
      for (const r of snapshot.byStatus) lines.push(`• ${r.status}: ${r.count}`);
    }
    lines.push("");
    lines.push("*Risk callouts*");
    for (const c of callouts) lines.push(`• ${c}`);
    await notifyFounder(lines.join("\n"));
  } catch (err) {
    console.error("[companyOs.scheduler] weeklyDisputeRisk failed:", err);
  }
}

async function dailyDashboardSnapshotJob(): Promise<void> {
  try {
    const r = await captureDailySnapshot();
    console.log(
      `[companyOs.scheduler] dailyDashboardSnapshot: date=${r.date} inserted=${r.inserted}`,
    );
  } catch (err) {
    console.error("[companyOs.scheduler] dailyDashboardSnapshot failed:", err);
  }
}

async function dailySalesJob(): Promise<void> {
  try {
    const r = await runDailySalesSync();
    console.log(
      `[companyOs.scheduler] dailySales: scanned=${r.sync.scanned} new=${r.sync.inserted} updated=${r.sync.updated} ` +
      `re-engaged sent=${r.reEngagement.sent} (llm=${r.reEngagement.llmDrafted} static=${r.reEngagement.fallbackUsed} skipped=${r.reEngagement.skipped})`,
    );
  } catch (err) {
    console.error("[companyOs.scheduler] dailySales failed:", err);
  }
}

async function budgetWarningJob(): Promise<void> {
  if (!isFounderConfigured()) return;
  const v = await getBudgetVerdict();
  if (v.safe) return; // Only nag when over 95%.
  const pct = (v.pctUsed * 100).toFixed(1);
  await notifyFounder(
    `⚠️ Company OS AI budget at ${pct}% (AED ${v.spentAed.toFixed(2)} of ${v.budgetAed.toFixed(2)}). Free-form questions are now refused until next month. Use \`costs\` for details.`,
  );
}

/**
 * Mount all scheduled jobs. Idempotent — safe to call once at boot
 * (subsequent calls become no-ops).
 *
 * Production-only by default: in development we don't want random
 * WhatsApp pings firing at 8am from each developer's machine. Set
 * COMPANY_OS_SCHEDULER_FORCE=true to override (used during manual QA).
 */
export function startScheduler(): void {
  if (started) {
    console.log("[companyOs.scheduler] already started — ignoring repeat call");
    return;
  }
  if (!isProd() && process.env.COMPANY_OS_SCHEDULER_FORCE !== "true") {
    console.log("[companyOs.scheduler] not started (NODE_ENV != production)");
    started = true;
    return;
  }
  started = true;

  // 08:00 Dubai daily — daily briefing to the founder.
  schedule("dailyBriefing", "0 8 * * *", dailyBriefingJob);
  // Hourly during business hours (08:00–22:00 Dubai) — keep snapshot fresh.
  schedule("hourlyFinanceSnapshot", "0 8-22 * * *", hourlyFinanceJob);
  // 09:00 Dubai daily — budget warning when over 95%.
  schedule("budgetWarning", "0 9 * * *", budgetWarningJob);
  // 09:00 Dubai every Monday (== 05:00 UTC) — weekly marketing brief
  // to the founder. Shares the 09:00 tick with the daily budget warning
  // but node-cron dispatches them as separate jobs, so the founder gets
  // two distinct messages on Monday mornings.
  schedule("weeklyMarketingBrief", "0 9 * * 1", weeklyMarketingBriefJob);
  // 09:30 Dubai daily — Sales Agent leads sync + re-engagement sweep.
  // Re-engagement is deduped at the SQL level (14-day cooldown) so the
  // job is idempotent if it ever runs more than once per day.
  schedule("dailySalesSync", "30 9 * * *", dailySalesJob);
  // 10:00 Dubai every Friday (== 06:00 UTC) — Legal Agent dispute risk
  // summary. Persists a `dispute_summary` row and pings the founder.
  schedule("weeklyDisputeRisk", "0 10 * * 5", weeklyDisputeRiskJob);
  // 02:00 Dubai daily — Dashboard Agent KPI snapshot. Quiet hour,
  // no founder notification — just persists a `kpi_snapshots` row so
  // the admin page has 30-day history to chart.
  schedule("dailyDashboardSnapshot", "0 2 * * *", dailyDashboardSnapshotJob);

  // One-shot startup briefing — fires once a few seconds after boot when
  // COMPANY_OS_SEND_STARTUP_BRIEFING=true. Useful right after publishing
  // a new deployment to confirm the WhatsApp path works, without waiting
  // until 08:00 the next morning. Safe to leave on permanently — it only
  // sends a single message per process startup.
  if (process.env.COMPANY_OS_SEND_STARTUP_BRIEFING === "true") {
    setTimeout(() => {
      console.log("[companyOs.scheduler] firing one-shot startup briefing");
      dailyBriefingJob().catch((err) =>
        console.error("[companyOs.scheduler] startup briefing failed:", err),
      );
    }, 5_000);
  }
}

export function stopScheduler(): void {
  for (const t of tasks) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
  tasks.length = 0;
  started = false;
}
