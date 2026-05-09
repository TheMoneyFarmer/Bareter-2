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
import {
  generateAndStoreBrief,
  BRIEF_SIGNED_URL_TTL_SEC,
  runMetaCampaignSync,
  getRecentMarketingPosts,
  formatMarketingPostLine,
} from "./marketingAgent";
import { runDailySalesSync } from "./salesAgent";
import { runDisputeRiskSummary } from "./legalAgent";
import {
  sendDisputeRiskEmail,
  sendVerificationApprovedEmail,
  sendVerificationDeclinedEmail,
  sendVerificationUnderReviewEmail,
  sendVerificationReminderEmail,
  sendDraftReminderEmail,
  sendEngagementReminderEmail,
} from "../emailService";
import { getSessionStatus } from "../diditClient";
import { captureDailySnapshot } from "./dashboardAgent";
import { getSignedDownloadUrl } from "./objectStorageHelpers";
import { runIntelligenceSweep } from "./intelligenceAgent";
import {
  generateMonthlyReport,
  lastCompletedMonthYyyyMm,
  BOARD_REPORT_SIGNED_URL_TTL_SEC,
} from "./boardReportAgent";
import { withRetry } from "./retry";
import { storage } from "../storage";
import { isSlackConfigured, postSlackAlert } from "../integrations/slack";

const AGENT_JOB_MAP: Record<string, string> = {
  diditStatusPoll: "scheduler",
  dailyBriefing: "manager",
  hourlyFinanceSnapshot: "finance",
  budgetWarning: "finance",
  weeklyMarketingBrief: "marketing",
  dailyMetaCampaignSync: "marketing",
  dailySalesSync: "sales",
  weeklyDisputeRisk: "legal",
  dailyDashboardSnapshot: "dashboard",
  intelligenceSweep: "intelligence",
  monthlyBoardReport: "manager",
  // Task #248 — daily completion-reminder sweep. Guarded by the
  // "engagement" agent toggle so admins can pause it from the agent
  // dashboard without redeploying.
  dailyProgressReminders: "engagement",
};

const TZ_OPT = { timezone: "Asia/Dubai" } as const;
const isProd = () => process.env.NODE_ENV === "production";

let started = false;
const tasks: ScheduledTask[] = [];

function schedule(name: string, expr: string, run: () => Promise<void>) {
  const task = cron.schedule(
    expr,
    () => {
      const agentName = AGENT_JOB_MAP[name];
      const guardedRun = async () => {
        if (agentName) {
          const enabled = await storage.getAgentEnabled(agentName);
          if (!enabled) {
            console.log(`[companyOs.scheduler] ${name} skipped — agent "${agentName}" is disabled`);
            return;
          }
        }
        await run();
      };
      withRetry(guardedRun, { agentName: "scheduler", opName: name }).catch((err) => {
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
  // Mirror to Slack if configured.
  if (await isSlackConfigured()) {
    try {
      await postSlackAlert("Daily Briefing", body, "info");
    } catch (err) {
      console.error("[companyOs.scheduler] Slack daily briefing failed (non-fatal):", err);
    }
  }
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
    // Tail the brief with the most recent posts that actually went out so
    // the founder sees both the plan (theme/budget) and the proof
    // (channels + URLs / errors) in a single WhatsApp message.
    try {
      const recentPosts = await getRecentMarketingPosts(5);
      if (recentPosts.length > 0) {
        lines.push("", "*Recent posts*");
        for (const p of recentPosts) lines.push(formatMarketingPostLine(p));
      }
    } catch (err) {
      console.error("[companyOs.scheduler] recent posts append failed:", err);
    }
    lines.push("", "Log results with `campaign update <name> ctr=X spend=Y conversions=Z`.");
    const briefBody = lines.join("\n");
    await notifyFounder(briefBody);
    // Mirror to Slack.
    if (await isSlackConfigured()) {
      try {
        await postSlackAlert("Weekly Marketing Brief", briefBody, "info");
      } catch (err) {
        console.error("[companyOs.scheduler] Slack marketing brief failed (non-fatal):", err);
      }
    }
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
    const { snapshot, callouts, pdf, document } = await runDisputeRiskSummary(7);
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
    const whatsappBody = lines.join("\n");
    await notifyFounder(whatsappBody);
    // Mirror to Slack.
    if (await isSlackConfigured()) {
      try {
        await postSlackAlert(
          "Weekly Dispute Risk Report",
          whatsappBody,
          snapshot.totalReports > 5 ? "warning" : "info",
        );
      } catch (err) {
        console.error("[companyOs.scheduler] Slack dispute risk failed (non-fatal):", err);
      }
    }

    // Email the founder the same rollup with the PDF attached. The
    // WhatsApp ping above is the primary channel — email is the
    // archival record — so a missing FOUNDER_EMAIL or a Resend
    // failure is logged but does not fail the job.
    const founderEmail = process.env.FOUNDER_EMAIL?.trim();
    if (!founderEmail) {
      console.log(
        "[companyOs.scheduler] weeklyDisputeRisk: FOUNDER_EMAIL not set, skipping email",
      );
      return;
    }
    if (!pdf) {
      console.warn(
        "[companyOs.scheduler] weeklyDisputeRisk: PDF render failed, skipping email",
      );
      return;
    }
    // Subject + preview text mirror the WhatsApp summary so the
    // founder's inbox preview looks familiar at a glance.
    const subject = `⚖️ Dispute risk · last ${snapshot.windowDays} days · ${snapshot.totalReports} reports`;
    const topReasons = snapshot.byReason
      .slice(0, 3)
      .map((r) => `${r.reason}: ${r.count}`)
      .join(", ");
    const previewText = topReasons
      ? `Total ${snapshot.totalReports} · ${topReasons}`
      : `Total ${snapshot.totalReports} · no new reports filed this week`;
    const filenameDate = (document?.createdAt ?? new Date())
      .toISOString()
      .slice(0, 10);
    try {
      const ok = await sendDisputeRiskEmail(founderEmail, {
        subject,
        previewText,
        summaryText: whatsappBody,
        pdf,
        pdfFilename: `bareter-dispute-risk-${filenameDate}.pdf`,
      });
      if (!ok) {
        console.warn(
          "[companyOs.scheduler] weeklyDisputeRisk: email send returned false",
        );
      }
    } catch (err) {
      console.error(
        "[companyOs.scheduler] weeklyDisputeRisk: email send threw:",
        err,
      );
    }
  } catch (err) {
    console.error("[companyOs.scheduler] weeklyDisputeRisk failed:", err);
  }
}

async function diditStatusPollJob(): Promise<void> {
  try {
    if (!process.env.DIDIT_API_KEY) {
      console.log("[diditPoll] DIDIT_API_KEY not set — skipping");
      return;
    }
    const pendingUsers = await storage.getUsersWithPendingVerification();
    if (pendingUsers.length === 0) {
      console.log("[diditPoll] No pending verification sessions");
      return;
    }
    console.log(`[diditPoll] Checking ${pendingUsers.length} pending session(s)`);
    let updated = 0;
    for (const user of pendingUsers) {
      if (!user.diditSessionId) continue;
      try {
        const latestStatus = await getSessionStatus(user.diditSessionId);
        if (!latestStatus) continue; // network error — try next cycle
        const isBusinessAccount = user.accountType === "business";
        const currentStatus = isBusinessAccount ? user.kybStatus : user.kycStatus;
        if (latestStatus === currentStatus) continue;

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (isBusinessAccount) {
          updateData.kybStatus = latestStatus;
        } else {
          updateData.kycStatus = latestStatus;
        }

        // Task #248: clear the in-flight marker on any terminal status
        // so the reminder cron doesn't keep nudging completed users.
        if (
          latestStatus === "APPROVED" ||
          latestStatus === "DECLINED" ||
          latestStatus === "REJECTED" ||
          latestStatus === "EXPIRED" ||
          latestStatus === "ABANDONED"
        ) {
          updateData.verificationSessionStartedAt = null;
        }

        // Session expired on Didit's side — clear the stale ID so user can restart
        if (latestStatus === "EXPIRED") {
          updateData.diditSessionId = null;
          updateData.verificationStatus = "pending";
          await storage.createNotification({
            userId: user.id, type: "system",
            title: "Verification Session Expired",
            message: "Your verification session expired before it could be reviewed. Please go to your profile and start a new verification.",
          });
          await storage.updateUser(user.id, updateData as Partial<typeof user>);
          console.log(`[diditPoll] userId=${user.id} session expired — cleared`);
          updated++;
          continue;
        }

        if (latestStatus === "APPROVED") {
          updateData.isVerified = true;
          updateData.verificationStatus = "verified";
          updateData.diditVerifiedAt = new Date();
          await storage.createNotification({
            userId: user.id, type: "system",
            title: "Verification Approved!",
            message: "Your identity has been verified. You can now create listings and start bartering!",
          });
          sendVerificationApprovedEmail(user.email, { fullName: user.fullName ?? undefined, accountType: user.accountType ?? undefined }).catch(() => {});
        } else if (latestStatus === "DECLINED" || latestStatus === "REJECTED") {
          updateData.isVerified = false;
          updateData.verificationStatus = "rejected";
          sendVerificationDeclinedEmail(user.email, { fullName: user.fullName ?? undefined, accountType: user.accountType ?? undefined }).catch(() => {});
        } else if (latestStatus === "IN_REVIEW" || latestStatus === "PENDING_REVIEW") {
          updateData.verificationStatus = "submitted";
          sendVerificationUnderReviewEmail(user.email, { fullName: user.fullName ?? undefined, accountType: user.accountType ?? undefined }).catch(() => {});
        }

        await storage.updateUser(user.id, updateData as Partial<typeof user>);
        console.log(`[diditPoll] userId=${user.id} ${currentStatus} → ${latestStatus}`);
        updated++;
      } catch (err) {
        console.error(`[diditPoll] Error checking session for userId=${user.id}:`, err);
      }
    }
    console.log(`[diditPoll] Done: ${updated}/${pendingUsers.length} updated`);
  } catch (err) {
    console.error("[diditPoll] Job failed:", err);
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

async function dailyMetaCampaignSyncJob(): Promise<void> {
  try {
    const r = await runMetaCampaignSync();
    if (r.skipped === "not_configured") {
      console.log(
        "[companyOs.scheduler] dailyMetaCampaignSync: skipped (META_ACCESS_TOKEN / META_AD_ACCOUNT_ID not set)",
      );
      return;
    }
    console.log(
      `[companyOs.scheduler] dailyMetaCampaignSync: scanned=${r.scanned} upserted=${r.upserted} errors=${r.errors.length}`,
    );
  } catch (err) {
    console.error("[companyOs.scheduler] dailyMetaCampaignSync failed:", err);
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

/**
 * Return the current hour-of-day in the Asia/Dubai timezone (0-23).
 * Used as a defence-in-depth guard so a misconfigured cron expression
 * (or a future move to UTC ticks) can never page the founder outside
 * of business hours.
 */
function dubaiHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "0";
  const n = Number(hh);
  return Number.isFinite(n) ? n % 24 : 0;
}

async function intelligenceSweepJob(): Promise<void> {
  // Defence-in-depth: even though the cron expression already pins
  // ticks to 06/10/14/18/22, double-check we're inside the Dubai
  // 06:00–22:00 window before running. Allows the manual `POST
  // /alerts/sweep` route to opt out via COMPANY_OS_SCHEDULER_FORCE.
  const hour = dubaiHour();
  if ((hour < 6 || hour > 22) && process.env.COMPANY_OS_SCHEDULER_FORCE !== "true") {
    console.log(
      `[companyOs.scheduler] intelligenceSweep skipped (Dubai hour=${hour} outside 06–22 window)`,
    );
    return;
  }
  try {
    const r = await runIntelligenceSweep();
    console.log(
      `[companyOs.scheduler] intelligenceSweep: detectors=${r.detectorsRun} new=${r.newAlerts.length} notified=${r.notified} snoozed=${r.skippedSnoozed} errors=${r.errors.length}`,
    );
    // Post new alerts to Slack (non-blocking).
    if (r.newAlerts.length > 0 && await isSlackConfigured()) {
      try {
        const alertLines = r.newAlerts.slice(0, 5).map(a => `• ${(a as { title?: string }).title ?? "Alert"}`).join("\n");
        await postSlackAlert(
          `Intelligence: ${r.newAlerts.length} new alert${r.newAlerts.length !== 1 ? "s" : ""}`,
          alertLines,
          "warning",
        );
      } catch (err) {
        console.error("[companyOs.scheduler] Slack intelligence alert failed (non-fatal):", err);
      }
    }
  } catch (err) {
    console.error("[companyOs.scheduler] intelligenceSweep failed:", err);
  }
}

async function monthlyBoardReportJob(): Promise<void> {
  // Always targets the most recently completed calendar month.
  const month = lastCompletedMonthYyyyMm();
  try {
    const r = await generateMonthlyReport(month);
    console.log(
      `[companyOs.scheduler] monthlyBoardReport: month=${month} pdfBytes=${r.report.pdfSizeBytes} truncated=${r.truncated}`,
    );
    if (!isFounderConfigured()) {
      console.log("[companyOs.scheduler] monthlyBoardReport: founder number not set, skipping ping");
      return;
    }
    let url = r.signedUrl;
    if (!url && r.report.objectStorageKey) {
      try {
        url = await getSignedDownloadUrl(r.report.objectStorageKey, BOARD_REPORT_SIGNED_URL_TTL_SEC);
      } catch (err) {
        console.error("[companyOs.scheduler] monthlyBoardReport signed URL failed:", err);
      }
    }
    const lines = [
      `📑 *Board report ready — ${month}*`,
      `PDF size: ${(r.report.pdfSizeBytes / 1024).toFixed(0)} KB`,
    ];
    if (url) lines.push(`Download: ${url}`);
    if (r.truncated) lines.push("(some sections were truncated to stay under 5 MB)");
    lines.push("");
    lines.push(r.report.summaryText.slice(0, 1200));
    const boardBody = lines.join("\n");
    await notifyFounder(boardBody);
    // Mirror to Slack.
    if (await isSlackConfigured()) {
      try {
        await postSlackAlert(`Board Report Ready — ${month}`, boardBody, "info");
      } catch (err) {
        console.error("[companyOs.scheduler] Slack board report failed (non-fatal):", err);
      }
    }
  } catch (err) {
    console.error("[companyOs.scheduler] monthlyBoardReport failed:", err);
  }
}

// ─── Task #248: daily completion-reminder sweep ───────────────────────
//
// Runs once a day. For each in-flight verification session / saved draft
// / recent engagement, decides which (if any) reminder email to send and
// records the send in `reminder_log` so we never double-fire. Per-user
// opt-outs (set via the unsubscribe link or admin toggles) are honoured
// at the top of each branch.
async function dailyProgressRemindersJob(): Promise<void> {
  // Master toggle first — admins can hard-stop every reminder channel at
  // once with `reminders_enabled=false` without flipping each per-channel
  // key individually.
  const masterEnabled = await storage.getAppSetting("reminders_enabled");
  if (masterEnabled === "false") {
    console.log("[reminders] master toggle off — skipping daily run");
    return;
  }
  const [vEnabled, dEnabled, eEnabled] = await Promise.all([
    storage.getAppSetting("reminders_verification_enabled"),
    storage.getAppSetting("reminders_drafts_enabled"),
    storage.getAppSetting("reminders_engagement_enabled"),
  ]);
  const verificationOn = vEnabled !== "false";
  const draftsOn = dEnabled !== "false";
  const engagementOn = eEnabled !== "false";
  // Send-once-ever per (user, kind, target). The cadence stage is
  // encoded in the kind, so we use a very long lookback to make
  // hasRecentReminder behave as a permanent dedupe.
  const FOREVER_HOURS = 365 * 24 * 10;

  let sentVerify = 0, sentDraft = 0, sentEngage = 0;

  if (verificationOn) {
    try {
      const candidates = await storage.getVerificationReminderCandidates();
      for (const u of candidates) {
        if (u.reminderPreferences && u.reminderPreferences.verification === false) continue;
        const startedAt = u.verificationSessionStartedAt;
        if (!startedAt) continue;
        const ageHrs = (Date.now() - new Date(startedAt).getTime()) / (60 * 60 * 1000);
        let stage: "24h" | "72h" | "7d" | null = null;
        let kind: "verification_24h" | "verification_72h" | "verification_7d" | null = null;
        if (ageHrs >= 24 && ageHrs < 72) { stage = "24h"; kind = "verification_24h"; }
        else if (ageHrs >= 72 && ageHrs < 7 * 24) { stage = "72h"; kind = "verification_72h"; }
        else if (ageHrs >= 7 * 24 && ageHrs < 14 * 24) { stage = "7d"; kind = "verification_7d"; }
        if (!stage || !kind) continue;
        if (await storage.hasRecentReminder(u.id, kind, u.diditSessionId ?? null, FOREVER_HOURS)) continue;
        const token = await storage.getOrCreateUnsubscribeToken(u.id);
        const ok = await sendVerificationReminderEmail({
          toEmail: u.email,
          fullName: u.fullName ?? null,
          language: (u.language === "ar" ? "ar" : "en"),
          unsubscribeToken: token,
          stage,
        }).catch((err) => { console.error("[reminders] verification send failed:", err); return false; });
        if (ok) {
          await storage.recordReminder(u.id, kind, u.diditSessionId ?? null);
          sentVerify++;
        }
      }
    } catch (err) {
      console.error("[reminders] verification branch failed:", err);
    }
  }

  if (draftsOn) {
    try {
      const candidates = await storage.getDraftReminderCandidates();
      for (const { user, draft } of candidates) {
        if (user.reminderPreferences && user.reminderPreferences.drafts === false) continue;
        const updatedAt = draft.updatedAt;
        if (!updatedAt) continue;
        const ageHrs = (Date.now() - new Date(updatedAt).getTime()) / (60 * 60 * 1000);
        let stage: "24h" | "72h" | null = null;
        let kind: "draft_24h" | "draft_72h" | null = null;
        if (ageHrs >= 24 && ageHrs < 72) { stage = "24h"; kind = "draft_24h"; }
        else if (ageHrs >= 72 && ageHrs < 7 * 24) { stage = "72h"; kind = "draft_72h"; }
        if (!stage || !kind) continue;
        if (await storage.hasRecentReminder(user.id, kind, draft.id, FOREVER_HOURS)) continue;
        const token = await storage.getOrCreateUnsubscribeToken(user.id);
        const ok = await sendDraftReminderEmail({
          toEmail: user.email,
          fullName: user.fullName ?? null,
          language: (user.language === "ar" ? "ar" : "en"),
          unsubscribeToken: token,
          stage,
          draftTitle: draft.title ?? "",
          draftId: draft.id,
        }).catch((err) => { console.error("[reminders] draft send failed:", err); return false; });
        if (ok) {
          await storage.recordReminder(user.id, kind, draft.id);
          sentDraft++;
        }
      }
    } catch (err) {
      console.error("[reminders] drafts branch failed:", err);
    }
  }

  if (engagementOn) {
    try {
      const candidates = await storage.getEngagementReminderCandidates();
      for (const { user, lastEvent } of candidates) {
        if (user.reminderPreferences && user.reminderPreferences.engagement === false) continue;
        if (!lastEvent.listingId) continue;
        if (await storage.hasRecentReminder(user.id, "engagement_48h", lastEvent.listingId, FOREVER_HOURS)) continue;
        // Hydrate the listing for the email subject — skip silently if it
        // was deleted / deactivated since the user touched it.
        const listing = await storage.getListing(lastEvent.listingId).catch(() => null);
        if (!listing || !listing.isActive) continue;
        const token = await storage.getOrCreateUnsubscribeToken(user.id);
        const ok = await sendEngagementReminderEmail({
          toEmail: user.email,
          fullName: user.fullName ?? null,
          language: (user.language === "ar" ? "ar" : "en"),
          unsubscribeToken: token,
          listingTitle: listing.title,
          listingId: listing.id,
        }).catch((err) => { console.error("[reminders] engagement send failed:", err); return false; });
        if (ok) {
          await storage.recordReminder(user.id, "engagement_48h", lastEvent.listingId);
          sentEngage++;
        }
      }
    } catch (err) {
      console.error("[reminders] engagement branch failed:", err);
    }
  }

  console.log(`[reminders] dailyProgressReminders done: verify=${sentVerify} draft=${sentDraft} engage=${sentEngage}`);
}

async function budgetWarningJob(): Promise<void> {
  if (!isFounderConfigured()) return;
  const v = await getBudgetVerdict();
  if (v.safe) return; // Only nag when over 95%.
  const pct = (v.pctUsed * 100).toFixed(1);
  const budgetMsg = `⚠️ Company OS AI budget at ${pct}% (AED ${v.spentAed.toFixed(2)} of ${v.budgetAed.toFixed(2)}). Free-form questions are now refused until next month. Use \`costs\` for details.`;
  await notifyFounder(budgetMsg);
  // Also alert Slack on budget warnings.
  if (await isSlackConfigured()) {
    try {
      await postSlackAlert("AI Budget Warning", budgetMsg, "critical");
    } catch (err) {
      console.error("[companyOs.scheduler] Slack budget warning failed (non-fatal):", err);
    }
  }
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
  // 03:30 Dubai daily — Meta Marketing API insights pull. Upserts into
  // `campaign_performance` for accounts connected via META_ACCESS_TOKEN
  // + META_AD_ACCOUNT_ID; the manual `campaign update` command stays as
  // a fallback for everything else. Skips silently if no Meta creds are
  // wired so dev environments don't see noisy errors.
  // Every 5 minutes — Didit verification status polling fallback.
  // Catches cases where the Didit webhook never fired (network issues,
  // misconfigured URL, etc.). Idempotent — only updates rows where the
  // Didit API status differs from what's stored.
  schedule("diditStatusPoll", "*/5 * * * *", diditStatusPollJob);
  schedule("dailyMetaCampaignSync", "30 3 * * *", dailyMetaCampaignSyncJob);
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
  // Every 4 hours from 06:00 to 22:00 Dubai — Intelligence Agent sweep.
  // Daytime only so the founder isn't woken by warnings. Detectors are
  // dedup'd at the SQL level (alertType + dayKey) so multiple ticks per
  // day are safe — at most one alert of each type per UTC day.
  schedule("intelligenceSweep", "0 6,10,14,18,22 * * *", intelligenceSweepJob);
  // 10:00 Dubai on the 1st of every month (== 06:00 UTC) — Board Report
  // Agent. Aggregates the prior calendar month's KPIs / finance / sales
  // / marketing / legal / alerts / AI cost into a multi-section PDF,
  // uploads it to private object storage, and pings the founder with a
  // signed download link. Idempotent on `reportMonth` so re-runs of
  // the same month overwrite cleanly.
  schedule("monthlyBoardReport", "0 10 1 * *", monthlyBoardReportJob);

  // 11:00 Dubai daily — Task #248 reminder sweep. Daytime so the
  // unsubscribe link in any mis-fired email is acted on within
  // business hours. Idempotent via reminder_log.
  schedule("dailyProgressReminders", "0 11 * * *", dailyProgressRemindersJob);

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
