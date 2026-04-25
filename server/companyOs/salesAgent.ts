// Sales Agent — DB-backed CRM + Resend re-engagement.
//
// Replaces a third-party CRM (Airtable) with a `sales_leads` Postgres table
// that's filterable / sortable / editable from the Company OS admin page,
// and replaces Gmail OAuth with the already-installed Resend integration
// for personalised re-engagement emails to dormant Bareter users.
//
// What this module exposes:
//   • `computeLeadScore` / `deriveUserType` — pure helpers (unit tested).
//   • `syncNewLeads()` — ingests up to N users (newest first), scores them,
//     upserts into `sales_leads`.
//   • `runReEngagementCampaign()` — emails up to 20 leads inactive 7+ days
//     who haven't been emailed in the last 14 days. Personalised by the
//     LLM when budget is safe; static template otherwise.
//   • `runDailySalesSync()` — orchestration entry point used by the
//     09:30 Asia/Dubai cron job.
//   • `getSalesReport()` / `getLeads()` — read-side helpers backing the
//     `leads` WhatsApp command and the `/api/company-os/sales/leads`
//     admin route.
//   • `handleLeadsCommand` / `handleSyncLeadsCommand` — WhatsApp surface.

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNull,
  lt,
  lte,
  or,
  sql as drizzleSql,
} from "drizzle-orm";
import { db } from "../db";
import {
  users,
  posts,
  deals,
  salesLeads,
  type SalesLead,
} from "@shared/schema";
import { chatCompletion, type ChatMessage } from "../agents/llm";
import { buildAgentContext, rememberInBackground } from "./memoryAgent";
import { logLlmCall, getBudgetVerdict, DEFAULT_MODEL } from "./costTracker";
import { sendReEngagementEmail } from "../emailService";

const AGENT = "salesAgent";
const APP_NAME = "Bareter";
const RE_ENGAGEMENT_INACTIVE_DAYS = 7;
const RE_ENGAGEMENT_COOLDOWN_DAYS = 14;
const DEFAULT_INGEST_BATCH = 50;
const DEFAULT_REENGAGE_CAP = 20;

// ---------------------------------------------------------------------------
// Pure helpers — unit tested.
// ---------------------------------------------------------------------------

export type DerivedUserType = "asset_owner" | "business" | "freelancer";

/**
 * Bareter doesn't store a single "user type" column, so we derive the value
 * the Sales Agent reasons about from the two fields that do exist:
 *   • `accountType` (individual | business)
 *   • `signupType`  (creator    | brand)
 * Business accounts are always "business"; creators are "freelancer";
 * everyone else (individual + brand) is treated as an asset owner.
 */
export function deriveUserType(u: {
  accountType?: string | null;
  signupType?: string | null;
}): DerivedUserType {
  if ((u.accountType || "").toLowerCase() === "business") return "business";
  if ((u.signupType || "").toLowerCase() === "creator") return "freelancer";
  return "asset_owner";
}

export interface LeadScoreInputs {
  userType: DerivedUserType;
  location?: string | null;
  city?: string | null;
  onboardingCompleted: boolean;
  hasPost: boolean;
  hasCompletedDeal: boolean;
  daysSinceLastActivity: number;
  hasAnyDeal: boolean;
}

/**
 * Pure scoring function. Clamped to 0..100. Weights match the task spec:
 *   +20 onboarding completed
 *   +20 first post
 *   +30 first completed deal
 *   +15 / +10 / +5 user-type bonus (asset_owner / business / freelancer)
 *   +10 located in Dubai or Abu Dhabi
 *    -5 inactive >14 days without any deal
 */
export function computeLeadScore(i: LeadScoreInputs): number {
  let s = 0;
  if (i.onboardingCompleted) s += 20;
  if (i.hasPost) s += 20;
  if (i.hasCompletedDeal) s += 30;
  if (i.userType === "asset_owner") s += 15;
  else if (i.userType === "business") s += 10;
  else s += 5; // freelancer
  const loc = (i.location || i.city || "").trim().toLowerCase();
  if (loc === "dubai" || loc === "abu dhabi") s += 10;
  if (i.daysSinceLastActivity > 14 && !i.hasAnyDeal) s -= 5;
  return Math.max(0, Math.min(100, s));
}

export type LeadStatus = "new" | "active" | "engaged" | "re_engaged" | "converted" | "dormant";

/**
 * Bucket a lead into one of the five status values used in WhatsApp
 * reports. `re_engaged` is set imperatively by the email sender; this
 * helper only computes the activity-based bucket.
 */
export function deriveStatus(opts: {
  hasCompletedDeal: boolean;
  daysSinceLastActivity: number;
  isNew: boolean;
}): LeadStatus {
  if (opts.hasCompletedDeal) return "converted";
  if (opts.isNew && opts.daysSinceLastActivity <= 1) return "new";
  if (opts.daysSinceLastActivity <= 7) return "active";
  if (opts.daysSinceLastActivity <= 30) return "engaged";
  return "dormant";
}

// ---------------------------------------------------------------------------
// User-feature aggregation — one round-trip per user, kept on the storage
// interface so the agent stays DB-agnostic.
// ---------------------------------------------------------------------------

interface UserCandidate {
  id: string;
  email: string;
  fullName: string;
  accountType: string | null;
  signupType: string | null;
  city: string | null;
  location: string | null;
  onboardingCompleted: boolean | null;
  lastActiveAt: Date | null;
  createdAt: Date | null;
}

interface UserFeatures {
  hasPost: boolean;
  hasAnyDeal: boolean;
  hasCompletedDeal: boolean;
  firstDealAt: Date | null;
  lastActivityAt: Date;
}

async function gatherUserFeatures(u: UserCandidate): Promise<UserFeatures> {
  const userId = u.id;
  const userDealsFilter = or(eq(deals.seekerId, userId), eq(deals.providerId, userId));

  const [postRow] = await db
    .select({ c: count(), latest: drizzleSql<Date | null>`MAX(${posts.createdAt})` })
    .from(posts)
    .where(eq(posts.userId, userId));

  const [dealAll] = await db
    .select({ c: count(), latest: drizzleSql<Date | null>`MAX(${deals.updatedAt})` })
    .from(deals)
    .where(userDealsFilter);

  const [dealDone] = await db
    .select({ c: count(), first: drizzleSql<Date | null>`MIN(${deals.updatedAt})` })
    .from(deals)
    .where(and(userDealsFilter, eq(deals.state, "completed")));

  const hasPost = (postRow?.c ?? 0) > 0;
  const hasAnyDeal = (dealAll?.c ?? 0) > 0;
  const hasCompletedDeal = (dealDone?.c ?? 0) > 0;
  const firstDealAt = dealDone?.first ? new Date(dealDone.first as unknown as string) : null;

  // Last activity = newest of (lastActiveAt, latest post, latest deal touch, signup).
  const candidates: number[] = [];
  if (u.lastActiveAt) candidates.push(new Date(u.lastActiveAt).getTime());
  if (postRow?.latest) candidates.push(new Date(postRow.latest as unknown as string).getTime());
  if (dealAll?.latest) candidates.push(new Date(dealAll.latest as unknown as string).getTime());
  if (u.createdAt) candidates.push(new Date(u.createdAt).getTime());
  const lastActivityAt = candidates.length
    ? new Date(Math.max(...candidates))
    : new Date();

  return { hasPost, hasAnyDeal, hasCompletedDeal, firstDealAt, lastActivityAt };
}

// ---------------------------------------------------------------------------
// Ingest one user — score, status, upsert.
// ---------------------------------------------------------------------------

interface IngestResult {
  userId: string;
  isNew: boolean;
  score: number;
  status: LeadStatus;
}

async function ingestUser(u: UserCandidate, now: Date): Promise<IngestResult> {
  const features = await gatherUserFeatures(u);
  const userType = deriveUserType(u);
  const daysSinceLastActivity = Math.floor(
    (now.getTime() - features.lastActivityAt.getTime()) / 86_400_000,
  );

  const score = computeLeadScore({
    userType,
    location: u.location,
    city: u.city,
    onboardingCompleted: !!u.onboardingCompleted,
    hasPost: features.hasPost,
    hasCompletedDeal: features.hasCompletedDeal,
    daysSinceLastActivity,
    hasAnyDeal: features.hasAnyDeal,
  });

  // We compute the status bucket as if the row were brand-new; the
  // ON CONFLICT branch below downgrades the special "new" value back
  // to "active" for existing rows so we never resurrect that label
  // for a returning lead.
  const status = deriveStatus({
    hasCompletedDeal: features.hasCompletedDeal,
    daysSinceLastActivity,
    isNew: true,
  });

  const location = u.city || u.location || null;

  // Atomic upsert. The unique index on user_id serialises concurrent
  // upserts at the DB layer, so manual `sync leads` overlapping the
  // 09:30 cron can never produce a duplicate-key error or two
  // competing rows. The returned `xmax = 0` Postgres flag tells us
  // whether this call did the INSERT or hit the ON CONFLICT branch.
  //
  // The CASE expression on `status` preserves two pieces of important
  // history that `excluded.*` (the candidate row) doesn't know about:
  //   • `converted` is sticky — once a lead has closed a deal we
  //     never demote them.
  //   • `re_engaged` is preserved when the new bucket would be
  //     `dormant`, so a lead that was just emailed isn't immediately
  //     downgraded back to dormant on the next sync.
  // `excluded.status = 'new'` is also flipped to `active` for the
  // ON CONFLICT path so the "new" badge only ever appears on a true
  // first-time insert.
  const result = await db
    .insert(salesLeads)
    .values({
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      userType,
      location,
      leadScore: score,
      status,
      lastActivityAt: features.lastActivityAt,
      firstDealAt: features.firstDealAt,
      reEngagementSentAt: null,
      notes: null,
    })
    .onConflictDoUpdate({
      target: salesLeads.userId,
      set: {
        email: drizzleSql`excluded.email`,
        fullName: drizzleSql`excluded.full_name`,
        userType: drizzleSql`excluded.user_type`,
        location: drizzleSql`excluded.location`,
        leadScore: drizzleSql`excluded.lead_score`,
        firstDealAt: drizzleSql`COALESCE(${salesLeads.firstDealAt}, excluded.first_deal_at)`,
        status: drizzleSql`CASE
          WHEN ${salesLeads.status} = 'converted' THEN 'converted'
          WHEN ${salesLeads.status} = 're_engaged' AND excluded.status = 'dormant' THEN 're_engaged'
          WHEN excluded.status = 'new' THEN 'active'
          ELSE excluded.status
        END`,
        lastActivityAt: drizzleSql`excluded.last_activity_at`,
        updatedAt: now,
      },
    })
    .returning({ wasInsert: drizzleSql<boolean>`(xmax = 0)` });

  const isNew = !!result[0]?.wasInsert;
  return { userId: u.id, isNew, score, status };
}

// ---------------------------------------------------------------------------
// Sync — public entry point.
// ---------------------------------------------------------------------------

export interface SyncResult {
  scanned: number;
  inserted: number;
  updated: number;
  errors: number;
}

/**
 * Two-phase candidate selection so the agent can never starve older
 * users: backlog drain first (users without a `sales_leads` row yet),
 * then refresh-pass on the stalest existing leads with whatever
 * capacity remains. This keeps every Bareter user re-scored on a
 * predictable cadence even after the marketplace grows past the
 * per-run limit.
 */
const USER_COLUMNS = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  accountType: users.accountType,
  signupType: users.signupType,
  city: users.city,
  location: users.location,
  onboardingCompleted: users.onboardingCompleted,
  lastActiveAt: users.lastActiveAt,
  createdAt: users.createdAt,
} as const;

export async function syncNewLeads(
  opts: { limit?: number; refreshLimit?: number } = {},
): Promise<SyncResult> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? DEFAULT_INGEST_BATCH));
  // Default refresh budget = half the ingest budget (rounded up). Caller
  // can override or set to 0 to skip the refresh pass entirely.
  const refreshLimit =
    opts.refreshLimit === undefined
      ? Math.ceil(limit / 2)
      : Math.max(0, Math.min(200, opts.refreshLimit));
  const now = new Date();

  // Phase 1 — backlog drain: pull users that don't yet have a row in
  // sales_leads, newest first. The LEFT JOIN + IS NULL filter ensures
  // older unsynced users eventually surface even after the newest
  // cohort is fully scored.
  const unsynced = await db
    .select(USER_COLUMNS)
    .from(users)
    .leftJoin(salesLeads, eq(salesLeads.userId, users.id))
    .where(isNull(salesLeads.userId))
    .orderBy(desc(users.createdAt))
    .limit(limit);

  // Phase 2 — refresh pass: re-score the stalest existing leads (oldest
  // updatedAt first) so their score and lastActivityAt don't drift.
  const stale =
    refreshLimit > 0
      ? await db
          .select(USER_COLUMNS)
          .from(users)
          .innerJoin(salesLeads, eq(salesLeads.userId, users.id))
          .orderBy(asc(salesLeads.updatedAt))
          .limit(refreshLimit)
      : [];

  const candidates = [...unsynced, ...stale];
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  for (const u of candidates) {
    try {
      const r = await ingestUser(u as UserCandidate, now);
      if (r.isNew) inserted++;
      else updated++;
    } catch (err) {
      errors++;
      console.error("[companyOs.sales] ingestUser failed for", u.id, err);
    }
  }
  return { scanned: candidates.length, inserted, updated, errors };
}

// ---------------------------------------------------------------------------
// Re-engagement.
// ---------------------------------------------------------------------------

export interface ReEngagementResult {
  attempted: number;
  sent: number;
  skipped: number;
  llmDrafted: number;
  fallbackUsed: number;
}

const REENGAGE_SYSTEM_PROMPT = `You are the Sales Agent for Bareter, a UAE/GCC barter marketplace.

Write a short, warm re-engagement email to a Bareter user who hasn't been active for a while.

Rules:
- 90-130 words total.
- Use their first name once.
- Mention one concrete reason to come back (e.g. "new offers in your category", "barter deals closing this week").
- One clear call to action: visit Bareter and post or browse.
- Friendly, never pushy. No emojis.
- Output ONLY the email body text. No subject line, no signature, no markdown.`;

async function draftReEngagementBodyText(lead: SalesLead): Promise<string | null> {
  const memoryBlock = await buildAgentContext("sales");
  const systemContent = memoryBlock
    ? `${memoryBlock}\n\n${REENGAGE_SYSTEM_PROMPT}`
    : REENGAGE_SYSTEM_PROMPT;
  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    {
      role: "user",
      content: `Lead context (JSON):\n${JSON.stringify({
        fullName: lead.fullName,
        userType: lead.userType,
        location: lead.location,
        leadScore: lead.leadScore,
      })}`,
    },
  ];
  try {
    const { content } = await chatCompletion(messages, {
      agentName: AGENT,
      command: "reengage_draft",
      inputPreview: lead.email,
      model: DEFAULT_MODEL,
      temperature: 0.6,
      maxTokens: 250,
    });
    const trimmed = (content || "").trim();
    return trimmed || null;
  } catch (err) {
    console.error("[companyOs.sales] LLM draft failed for", lead.email, err);
    return null;
  }
}

function staticReEngagementBodyText(lead: SalesLead): string {
  const first = (lead.fullName || "there").split(/\s+/)[0];
  return `Hi ${first},

It's been a while since you've been on ${APP_NAME}. New offers in your category are added daily, and a number of barter trades closed this past week.

Take 2 minutes to post what you have or browse what others are offering — it's still 100% cashless and free to use during launch.

See you on ${APP_NAME}.`;
}

function renderReEngagementHtml(bodyText: string): string {
  const html = bodyText
    .split(/\n\n+/)
    .map((p) => `<p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="margin:0;font-size:22px;color:#136c68;">${APP_NAME}</h1>
    </div>
    ${html}
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0;">${APP_NAME} · UAE Barter Marketplace</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function runReEngagementCampaign(
  opts: { capacity?: number } = {},
): Promise<ReEngagementResult> {
  const cap = Math.max(1, Math.min(100, opts.capacity ?? DEFAULT_REENGAGE_CAP));
  const now = new Date();
  const inactiveBefore = new Date(now.getTime() - RE_ENGAGEMENT_INACTIVE_DAYS * 86_400_000);
  const cooldownBefore = new Date(now.getTime() - RE_ENGAGEMENT_COOLDOWN_DAYS * 86_400_000);

  // Eligible: inactive ≥7 days AND (never emailed OR cooldown elapsed) AND not converted.
  // The cooldown filter is enforced at the SQL level so the job is safe to
  // run more than once per day (idempotent within the 14-day window).
  const eligible = await db
    .select()
    .from(salesLeads)
    .where(
      and(
        lte(salesLeads.lastActivityAt, inactiveBefore),
        drizzleSql`${salesLeads.status} <> 'converted'`,
        or(
          isNull(salesLeads.reEngagementSentAt),
          lt(salesLeads.reEngagementSentAt, cooldownBefore),
        ),
      ),
    )
    .orderBy(desc(salesLeads.leadScore))
    .limit(cap);

  const verdict = await getBudgetVerdict();
  const result: ReEngagementResult = {
    attempted: eligible.length,
    sent: 0,
    skipped: 0,
    llmDrafted: 0,
    fallbackUsed: 0,
  };

  for (const lead of eligible) {
    try {
      // Atomic claim BEFORE we send. We re-assert the cooldown filter
      // inside the WHERE clause and use RETURNING to detect whether
      // we actually won the row. If two concurrent runs (manual sync
      // overlapping the cron) try to claim the same lead, only one
      // UPDATE returns a row; the other gets [] and skips. This is a
      // compare-and-swap on `reEngagementSentAt`.
      //
      // Trade-off: if the email send subsequently fails, the lead is
      // locked out of re-engagement for the full 14-day cooldown. For
      // a low-volume founder-driven campaign this is the right call —
      // duplicate emails to the same user are far more damaging than
      // a once-per-fortnight retry gap, and the founder can always
      // re-trigger via `sync leads` after the cooldown elapses.
      const claimed = await db
        .update(salesLeads)
        .set({ reEngagementSentAt: now, status: "re_engaged", updatedAt: now })
        .where(
          and(
            eq(salesLeads.id, lead.id),
            drizzleSql`${salesLeads.status} <> 'converted'`,
            or(
              isNull(salesLeads.reEngagementSentAt),
              lt(salesLeads.reEngagementSentAt, cooldownBefore),
            ),
          ),
        )
        .returning({ id: salesLeads.id });
      if (claimed.length === 0) {
        // Lost the race — another concurrent worker already claimed
        // this lead. Skip silently; their send will cover it.
        result.skipped++;
        continue;
      }

      let bodyText: string | null = null;
      if (verdict.safe) {
        bodyText = await draftReEngagementBodyText(lead);
      }
      let usedFallback = false;
      if (!bodyText) {
        bodyText = staticReEngagementBodyText(lead);
        usedFallback = true;
      }
      const subject = `We miss you on ${APP_NAME}`;
      const ok = await sendReEngagementEmail(lead.email, {
        subject,
        html: renderReEngagementHtml(bodyText),
        text: bodyText,
      });
      if (ok) {
        result.sent++;
        if (usedFallback) result.fallbackUsed++;
        else result.llmDrafted++;
        // Single semantic event per send — chatCompletion already logs
        // the LLM draft itself, so logging a separate zero-token line
        // here would inflate per-agent call counts without adding
        // information.
        await logLlmCall({
          agentName: AGENT,
          command: "reengage_send",
          inputPreview: lead.email,
          outputPreview: usedFallback ? "static" : "llm",
          tokensUsed: 0,
        });
      } else {
        // Send failed AFTER the claim. Lead stays "claimed" for the
        // 14-day cooldown — see the trade-off note above.
        result.skipped++;
      }
    } catch (err) {
      result.skipped++;
      console.error("[companyOs.sales] re-engagement send failed:", err);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Daily orchestration — used by the 09:30 Asia/Dubai cron.
// ---------------------------------------------------------------------------

export interface DailySalesResult {
  sync: SyncResult;
  reEngagement: ReEngagementResult;
}

/**
 * Daily orchestration entry point used by the 09:30 Asia/Dubai cron.
 *
 * Two-pass ingest: up to `DEFAULT_INGEST_BATCH` new users from the
 * backlog, plus up to ~half that many of the *stalest* existing leads
 * for a refresh re-score. Total processed users per run can therefore
 * exceed `DEFAULT_INGEST_BATCH` — that's deliberate, so older leads
 * never drift indefinitely once the backlog has been drained. Override
 * by passing `refreshLimit: 0` to `syncNewLeads` directly if a strict
 * "exactly N" cap is ever required.
 */
export async function runDailySalesSync(): Promise<DailySalesResult> {
  const sync = await syncNewLeads({ limit: DEFAULT_INGEST_BATCH });
  const reEngagement = await runReEngagementCampaign({ capacity: DEFAULT_REENGAGE_CAP });

  // Seed memory: which user-type / location is currently producing the
  // highest-scoring leads. The next re-engagement draft will see this
  // in its system prompt and tilt copy toward that segment.
  try {
    const top = await db
      .select({
        userType: salesLeads.userType,
        location: salesLeads.location,
        avgScore: drizzleSql<string>`COALESCE(AVG(${salesLeads.leadScore}), 0)`,
        c: count(),
      })
      .from(salesLeads)
      .groupBy(salesLeads.userType, salesLeads.location)
      .orderBy(desc(drizzleSql`AVG(${salesLeads.leadScore})`))
      .limit(1);
    const t = top[0];
    if (t && (t.userType || t.location)) {
      rememberInBackground({
        agentName: "sales",
        memoryType: "learning",
        key: "top_converting_segment",
        value: {
          userType: t.userType,
          location: t.location,
          avgScore: Math.round(Number(t.avgScore)),
          leadCount: t.c,
        },
        confidence: 0.7,
      });
    }
  } catch (err) {
    console.warn("[companyOs.sales] top segment memory seed failed:", err);
  }

  return { sync, reEngagement };
}

// ---------------------------------------------------------------------------
// Read helpers — back the WhatsApp `leads` command + admin route.
// ---------------------------------------------------------------------------

export interface SalesReport {
  total: number;
  new: number;
  active: number;
  reEngaged: number;
  avgScore: number;
  newThisWeek: number;
}

export async function getSalesReport(): Promise<SalesReport> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const [tot, byStatus, avg, weekly] = await Promise.all([
      db.select({ c: count() }).from(salesLeads),
      db
        .select({ status: salesLeads.status, c: count() })
        .from(salesLeads)
        .groupBy(salesLeads.status),
      db
        .select({ a: drizzleSql<string>`COALESCE(AVG(${salesLeads.leadScore}), 0)` })
        .from(salesLeads),
      db.select({ c: count() }).from(salesLeads).where(gte(salesLeads.createdAt, sevenDaysAgo)),
    ]);
    const total = tot[0]?.c ?? 0;
    const newCount = byStatus.find((r) => r.status === "new")?.c ?? 0;
    const activeCount = byStatus.find((r) => r.status === "active")?.c ?? 0;
    const reEngaged = byStatus.find((r) => r.status === "re_engaged")?.c ?? 0;
    const avgScore = Math.round(Number(avg[0]?.a ?? 0));
    return {
      total,
      new: newCount,
      active: activeCount,
      reEngaged,
      avgScore,
      newThisWeek: weekly[0]?.c ?? 0,
    };
  } catch (err) {
    console.error("[companyOs.sales] getSalesReport failed:", err);
    return { total: 0, new: 0, active: 0, reEngaged: 0, avgScore: 0, newThisWeek: 0 };
  }
}

export async function getLeads(opts: { limit?: number; status?: string } = {}): Promise<SalesLead[]> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 50));
  const baseQuery = db.select().from(salesLeads);
  const filtered = opts.status
    ? baseQuery.where(eq(salesLeads.status, opts.status))
    : baseQuery;
  return filtered.orderBy(desc(salesLeads.leadScore), desc(salesLeads.createdAt)).limit(limit);
}

export function formatSalesReport(r: SalesReport): string {
  return [
    "*Sales · leads snapshot*",
    `• Total: ${r.total}`,
    `• New: ${r.new}`,
    `• Active: ${r.active}`,
    `• Re-engaged: ${r.reEngaged}`,
    `• Avg score: ${r.avgScore}`,
    `• New this week: ${r.newThisWeek}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// WhatsApp command surface — invoked by the Manager Agent.
// ---------------------------------------------------------------------------

export async function handleLeadsCommand(rawText: string): Promise<string> {
  const report = await getSalesReport();
  const out = formatSalesReport(report);
  await logLlmCall({
    agentName: "manager",
    command: "leads",
    inputPreview: rawText,
    outputPreview: out,
    tokensUsed: 0,
  });
  return out;
}

export async function handleSyncLeadsCommand(rawText: string): Promise<string> {
  try {
    const r = await runDailySalesSync();
    const out = [
      "*Sales · ad-hoc sync*",
      `Ingested: ${r.sync.scanned} (new ${r.sync.inserted}, updated ${r.sync.updated}, errors ${r.sync.errors})`,
      `Re-engagement: ${r.reEngagement.sent} sent (LLM ${r.reEngagement.llmDrafted}, static ${r.reEngagement.fallbackUsed}, skipped ${r.reEngagement.skipped})`,
    ].join("\n");
    await logLlmCall({
      agentName: "manager",
      command: "sync_leads",
      inputPreview: rawText,
      outputPreview: out,
      tokensUsed: 0,
    });
    return out;
  } catch (err) {
    console.error("[companyOs.sales] handleSyncLeadsCommand failed:", err);
    return "Couldn't run the leads sync — check the server logs.";
  }
}
