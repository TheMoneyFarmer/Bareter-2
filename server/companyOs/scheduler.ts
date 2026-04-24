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
