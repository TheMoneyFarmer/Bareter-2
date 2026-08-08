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
  sendSignupUnverifiedReminderEmail,
  sendSignupNoListingReminderEmail,
  sendListingNoProposalReminderEmail,
  sendWaitlistFinalCallEmail,
  sendListingExpiringEmail,
  buildAppBaseUrl,
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
import { db, pool } from "../db";
import { deals, users, listingComments, listings } from "@shared/schema";
import { and, inArray, lt, eq, gte, lte } from "drizzle-orm";
import crypto from "crypto";

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
  dailyDbBackup: "scheduler",
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

/**
 * Delete expired rows from the connect-pg-simple `session` table.
 *
 * This replaces the store's built-in 15-minute prune timer, which kept Neon
 * compute awake around the clock for pure housekeeping. Only rows whose
 * `expire` timestamp is already in the past are removed — those are rows the
 * session store would refuse to load anyway, so no live session is affected.
 */
async function sessionPruneJob(): Promise<void> {
  try {
    const res = await pool.query('DELETE FROM "session" WHERE "expire" < NOW()');
    console.log(`[sessionPrune] Removed ${res.rowCount ?? 0} expired session row(s)`);
  } catch (err: any) {
    console.error("[sessionPrune] Failed to prune expired sessions:", err?.message);
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
        if (!latestStatus) continue;
        const isBusinessAccount = user.accountType === "business";
        const currentStatus = isBusinessAccount ? user.kybStatus : user.kycStatus;
        if (latestStatus === currentStatus) continue;

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (isBusinessAccount) {
          updateData.kybStatus = latestStatus;
        } else {
          updateData.kycStatus = latestStatus;
        }

        if (
          latestStatus === "APPROVED" ||
          latestStatus === "DECLINED" ||
          latestStatus === "REJECTED" ||
          latestStatus === "EXPIRED" ||
          latestStatus === "ABANDONED"
        ) {
          updateData.verificationSessionStartedAt = null;
        }

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
  const [vEnabled, dEnabled, eEnabled, signupNudgeFlag, listingNudgeFlag] = await Promise.all([
    storage.getAppSetting("reminders_verification_enabled"),
    storage.getAppSetting("reminders_drafts_enabled"),
    storage.getAppSetting("reminders_engagement_enabled"),
    storage.getAppSetting("reminders_signup_nudge_enabled"),
    storage.getAppSetting("reminders_listing_nudge_enabled"),
  ]);
  const verificationOn = vEnabled !== "false";
  const draftsOn = dEnabled !== "false";
  const engagementOn = eEnabled !== "false";
  const signupNudgeOn = signupNudgeFlag !== "false";
  const listingNudgeOn = listingNudgeFlag !== "false";
  // Send-once-ever per (user, kind, target). The cadence stage is
  // encoded in the kind, so we use a very long lookback to make
  // hasRecentReminder behave as a permanent dedupe.
  const FOREVER_HOURS = 365 * 24 * 10;

  let sentVerify = 0, sentDraft = 0, sentEngage = 0, sentSignupUnverified = 0, sentSignupNoListing = 0, sentListingNoProposal = 0;

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

  if (signupNudgeOn) {
    try {
      const candidates = await storage.getSignupUnverifiedCandidates();
      for (const u of candidates) {
        if (u.reminderPreferences && u.reminderPreferences.signupNudge === false) continue;
        const kind = "signup_unverified_24h" as const;
        if (await storage.hasRecentReminder(u.id, kind, null, FOREVER_HOURS)) continue;
        const token = await storage.getOrCreateUnsubscribeToken(u.id);
        // The token from signup (if any) is 24h+ old by now, so issue a
        // fresh one — same pattern as POST /api/auth/resend-verification.
        const verifyToken = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.update(users).set({
          emailVerificationToken: verifyToken,
          emailVerificationExpires: expires,
        }).where(eq(users.id, u.id));
        const verifyUrl = `${buildAppBaseUrl()}/api/auth/verify-email?token=${verifyToken}`;
        const ok = await sendSignupUnverifiedReminderEmail({
          toEmail: u.email,
          fullName: u.fullName ?? null,
          language: (u.language === "ar" ? "ar" : "en"),
          unsubscribeToken: token,
          verifyUrl,
        }).catch((err) => { console.error("[reminders] signup-unverified send failed:", err); return false; });
        if (ok) {
          await storage.recordReminder(u.id, kind, null);
          sentSignupUnverified++;
        }
      }
    } catch (err) {
      console.error("[reminders] signup-unverified branch failed:", err);
    }

    try {
      const candidates = await storage.getSignupNoListingCandidates();
      for (const u of candidates) {
        if (u.reminderPreferences && u.reminderPreferences.signupNudge === false) continue;
        const kind = "signup_no_listing_24h" as const;
        if (await storage.hasRecentReminder(u.id, kind, null, FOREVER_HOURS)) continue;
        const token = await storage.getOrCreateUnsubscribeToken(u.id);
        const ok = await sendSignupNoListingReminderEmail({
          toEmail: u.email,
          fullName: u.fullName ?? null,
          language: (u.language === "ar" ? "ar" : "en"),
          unsubscribeToken: token,
        }).catch((err) => { console.error("[reminders] signup-no-listing send failed:", err); return false; });
        if (ok) {
          await storage.recordReminder(u.id, kind, null);
          sentSignupNoListing++;
        }
      }
    } catch (err) {
      console.error("[reminders] signup-no-listing branch failed:", err);
    }
  }

  if (listingNudgeOn) {
    try {
      const candidates = await storage.getListingNoProposalCandidates();
      for (const u of candidates) {
        if (u.reminderPreferences && u.reminderPreferences.listingNudge === false) continue;
        const kind = "listing_no_proposal_72h" as const;
        if (await storage.hasRecentReminder(u.id, kind, null, FOREVER_HOURS)) continue;
        const token = await storage.getOrCreateUnsubscribeToken(u.id);
        const ok = await sendListingNoProposalReminderEmail({
          toEmail: u.email,
          fullName: u.fullName ?? null,
          language: (u.language === "ar" ? "ar" : "en"),
          unsubscribeToken: token,
        }).catch((err) => { console.error("[reminders] listing-no-proposal send failed:", err); return false; });
        if (ok) {
          await storage.recordReminder(u.id, kind, null);
          sentListingNoProposal++;
        }
      }
    } catch (err) {
      console.error("[reminders] listing-no-proposal branch failed:", err);
    }
  }

  console.log(`[reminders] dailyProgressReminders done: verify=${sentVerify} draft=${sentDraft} engage=${sentEngage} signupUnverified=${sentSignupUnverified} signupNoListing=${sentSignupNoListing} listingNoProposal=${sentListingNoProposal}`);
}

// Runs once a day (same cron tick as dailyProgressRemindersJob). Anchored
// to the one-time waitlist launch-email send (`waitlist_launch_email_sent_at`,
// stamped by POST /api/admin/email/broadcast when audience="waitlist-main")
// rather than a per-user signup age — this is a global campaign trigger,
// not a per-user lifecycle nudge, so it doesn't share reminder_log/users-keyed
// dedupe and instead tracks its own sent-marker directly on waitlistEntries.
async function waitlistFinalCallJob(): Promise<void> {
  const enabled = await storage.getAppSetting("reminders_waitlist_final_call_enabled");
  if (enabled === "false") {
    console.log("[reminders] waitlist final-call disabled — skipping");
    return;
  }
  const anchorIso = await storage.getAppSetting("waitlist_launch_email_sent_at");
  if (!anchorIso) {
    console.log("[reminders] waitlist final-call: no launch email sent yet — skipping");
    return;
  }
  const delayRaw = await storage.getAppSetting("waitlist_final_call_delay_days");
  const delayDays = delayRaw ? Number.parseInt(delayRaw, 10) : 5;
  let sent = 0;
  try {
    const candidates = await storage.getWaitlistFinalCallCandidates(
      Number.isFinite(delayDays) ? delayDays : 5,
      anchorIso,
    );
    const betaInviteCode = await storage.getAppSetting("beta_invite_code");
    for (const entry of candidates) {
      const token = await storage.getOrCreateWaitlistUnsubscribeToken(entry.id);
      const ok = await sendWaitlistFinalCallEmail(entry.email, {
        name: entry.name,
        unsubscribeToken: token,
        inviteCode: betaInviteCode,
      }).catch((err) => { console.error("[reminders] waitlist final-call send failed:", err); return false; });
      if (ok) {
        await storage.markWaitlistFinalCallSent(entry.id);
        sent++;
      }
    }
  } catch (err) {
    console.error("[reminders] waitlist final-call job failed:", err);
  }
  console.log(`[reminders] waitlistFinalCall done: sent=${sent}`);
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

async function dailyDbBackupJob(): Promise<void> {
  try {
    const dbUrl = process.env.DATABASE_URL;
    const r2AccountId = process.env.R2_ACCOUNT_ID;
    const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
    const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
    const r2Bucket = process.env.R2_BUCKET_NAME;

    if (!dbUrl || !r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
      console.log("[backup-db] Missing DATABASE_URL or R2 credentials — skipping");
      return;
    }

    const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const { createGzip } = await import("zlib");
    const { pipeline } = await import("stream/promises");
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");

    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey },
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `bareter-db-backup-${dateStr}.sql.gz`;
    const tmpSql = path.join(os.tmpdir(), filename.replace(".gz", ""));
    const tmpGz = path.join(os.tmpdir(), filename);

    console.log(`[backup-db] Starting backup for ${dateStr}`);

    const { Pool: PgPool } = await import("pg");
    const pgPool = new PgPool({ connectionString: dbUrl, connectionTimeoutMillis: 30000 });

    const tablesRes = await pgPool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    );
    const tables = tablesRes.rows.map((r: any) => r.table_name as string);

    const lines: string[] = [
      `-- Bareter DB backup — ${new Date().toISOString()}`,
      `-- Tables: ${tables.join(", ")}`,
      "",
    ];

    for (const table of tables) {
      try {
        const colRows = await pgPool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position",
          [table]
        );
        const cols = colRows.rows.map((r: any) => r.column_name as string);
        const dataRows = (await pgPool.query(`SELECT * FROM "${table}"`)).rows as Record<string, unknown>[];
        if (!dataRows.length) continue;

        lines.push(`-- TABLE: ${table} (${dataRows.length} rows)`);
        for (const row of dataRows) {
          const vals = cols.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
            if (typeof v === "number") return String(v);
            if (v instanceof Date) return `'${v.toISOString()}'`;
            if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          lines.push(`INSERT INTO "${table}" ("${cols.join('","')}") VALUES (${vals.join(",")}) ON CONFLICT DO NOTHING;`);
        }
        lines.push("");
      } catch (e: any) {
        lines.push(`-- SKIPPED ${table}: ${e.message}`);
      }
    }

    await pgPool.end();
    fs.writeFileSync(tmpSql, lines.join("\n"), "utf8");

    await pipeline(
      fs.createReadStream(tmpSql),
      createGzip(),
      fs.createWriteStream(tmpGz)
    );
    fs.unlinkSync(tmpSql);

    const fileContent = fs.readFileSync(tmpGz);
    const key = `backups/db/${filename}`;
    await r2.send(new PutObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      Body: fileContent,
      ContentType: "application/gzip",
      Metadata: { "backup-date": dateStr },
    }));
    fs.unlinkSync(tmpGz);

    const sizekb = (fileContent.length / 1024).toFixed(1);
    console.log(`[backup-db] Uploaded ${key} (${sizekb} KB)`);

    // Prune — keep last 30 backups
    const list = await r2.send(new ListObjectsV2Command({ Bucket: r2Bucket, Prefix: "backups/db/" }));
    const objects = (list.Contents ?? [])
      .filter((o: any) => o.Key?.endsWith(".sql.gz"))
      .sort((a: any, b: any) => (a.Key < b.Key ? -1 : 1));
    const toDelete = objects.slice(0, Math.max(0, objects.length - 30));
    for (const obj of toDelete as any[]) {
      await r2.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: obj.Key }));
      console.log(`[backup-db] Pruned ${obj.Key}`);
    }

    console.log(`[backup-db] Done — ${objects.length - toDelete.length} backups in R2`);
  } catch (err) {
    console.error("[backup-db] Job failed:", err);
  }
}

async function dealInactivityReminderJob(): Promise<void> {
  try {
    const THRESHOLD_MS = 36 * 60 * 60 * 1000; // 36 hours
    const cutoff = new Date(Date.now() - THRESHOLD_MS);
    const ACTIONABLE_STATES = ["proposed", "negotiating", "accepted", "countered"];

    const staleDeals = await db
      .select({ id: deals.id, seekerId: deals.seekerId, providerId: deals.providerId, dealNumber: deals.dealNumber, state: deals.state, updatedAt: deals.updatedAt })
      .from(deals)
      .where(and(inArray(deals.state, ACTIONABLE_STATES), lt(deals.updatedAt, cutoff)));

    if (staleDeals.length === 0) return;

    const { sendMail } = await import("../emailService");
    const baseUrl = process.env.BASE_URL ?? "https://bareter.com";

    for (const deal of staleDeals) {
      const parties = await db
        .select({ id: users.id, email: users.email, fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, [deal.seekerId, deal.providerId]));

      for (const party of parties) {
        const dealUrl = `${baseUrl}/deals/${deal.id}`;
        const greeting = party.fullName ? `Hi ${party.fullName},` : "Hi there,";
        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 12px;">Your deal is waiting for a response ⏳</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.55;">${greeting}</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.55;">Deal <strong>#${deal.dealNumber}</strong> has been in <strong>${deal.state}</strong> status for over 36 hours with no activity. Don't let a good deal go cold — log in to respond and keep things moving.</p>
    <a href="${dealUrl}" style="display:block;text-align:center;background:#136c68;color:white;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:600;margin:24px 0;">View Deal → Respond Now</a>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">Bareter · UAE's Barter Marketplace</p>
  </div>
</body></html>`;
        await sendMail({
          to: party.email,
          subject: `⏳ Deal #${deal.dealNumber} needs your attention`,
          html,
          text: `${greeting}\n\nDeal #${deal.dealNumber} (${deal.state}) has had no activity for 36+ hours. Log in to respond:\n${dealUrl}\n\n— Bareter`,
        }).catch(console.error);
      }
    }
    console.log(`[dealInactivity] Sent reminders for ${staleDeals.length} stale deals`);
  } catch (err) {
    console.error("[dealInactivity] job failed:", err);
  }
}

// Runs once a day. Finds proposals expiring within the next 24 hours (still
// pending) and emails the proposer so they know the listing owner still has
// time to respond. Deduped via reminder_log (kind "proposal_expiry_24h").
async function proposalExpiryWarningJob(): Promise<void> {
  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const expiring = await db
      .select({
        proposalId: listingComments.id,
        proposerUserId: listingComments.userId,
        listingId: listingComments.listingId,
        offerItemName: listingComments.offerItemName,
        expiresAt: listingComments.expiresAt,
        listingTitle: listings.title,
        userEmail: users.email,
        userFullName: users.fullName,
        userReminderPrefs: users.reminderPreferences,
      })
      .from(listingComments)
      .innerJoin(listings, eq(listingComments.listingId, listings.id))
      .innerJoin(users, eq(listingComments.userId, users.id))
      .where(and(
        eq(listingComments.status, "pending"),
        gte(listingComments.expiresAt, now),
        lte(listingComments.expiresAt, in24h),
      ));

    let sent = 0;
    const FOREVER_HOURS = 365 * 24 * 10;
    for (const row of expiring) {
      if (!row.expiresAt) continue;
      if (row.userReminderPrefs && (row.userReminderPrefs as Record<string, boolean>).proposals === false) continue;
      if (await storage.hasRecentReminder(row.proposerUserId, "proposal_expiry_24h", row.proposalId, FOREVER_HOURS)) continue;
      const ok = await sendListingExpiringEmail(row.userEmail, {
        recipientName: row.userFullName ?? null,
        offerItemName: row.offerItemName,
        listingTitle: row.listingTitle,
        listingId: row.listingId,
        expiresAt: new Date(row.expiresAt),
      }).catch((err) => { console.error("[proposalExpiry] email failed:", err); return false; });
      if (ok) {
        await storage.recordReminder(row.proposerUserId, "proposal_expiry_24h", row.proposalId);
        sent++;
      }
    }
    console.log(`[proposalExpiry] done: scanned=${expiring.length} sent=${sent}`);
  } catch (err) {
    console.error("[proposalExpiry] job failed:", err);
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
  // Every 15 minutes — reduced from every 5 min. At zero users with pending
  // verification sessions the poll is a no-op DB query; 15 min is fast enough.
  schedule("diditStatusPoll", "*/15 * * * *", diditStatusPollJob);
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
  // 02:30 Dubai daily — prune expired session rows. Replaces connect-pg-simple's
  // built-in 15-minute prune timer, which kept Neon compute from ever
  // autosuspending just to delete already-dead rows. Anchored to the same quiet
  // hour as the dashboard snapshot so both share one compute wake-up.
  schedule("sessionPrune", "30 2 * * *", sessionPruneJob);
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

  // 11:00 Dubai daily (same tick as the reminder sweep above) — beta
  // waitlist final-call. Anchored to waitlist_launch_email_sent_at rather
  // than per-user signup age, so it gets its own job for failure isolation
  // and clearer logs.
  schedule("waitlistFinalCall", "0 11 * * *", waitlistFinalCallJob);

  // 02:30 Dubai daily — full database backup to Cloudflare R2.
  // Reduced from every-4-hours to once-daily: the full table scan was
  // generating ~1.6M Neon object-storage page reads per billing cycle at
  // zero user traffic. Once/day is more than sufficient for a pre-launch DB.
  schedule("dailyDbBackup", "30 2 * * *", dailyDbBackupJob);

  // 09:00 Dubai daily — deal inactivity reminders. Emails both parties
  // in any deal that has been stuck (no updatedAt change) for ≥36 hours
  // and is still in an actionable state (proposed/negotiating/accepted).
  schedule("dealInactivityReminders", "0 9 * * *", dealInactivityReminderJob);

  // 10:30 Dubai daily — proposal expiry warnings. Emails proposers whose
  // pending proposals expire within the next 24 hours so they know the
  // listing owner still has time to respond before auto-decline fires.
  schedule("proposalExpiryWarnings", "30 10 * * *", proposalExpiryWarningJob);

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
