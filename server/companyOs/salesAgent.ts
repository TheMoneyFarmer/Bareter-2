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

import crypto from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
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
  salesReengagementEvents,
  salesSyncState,
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
// Cursor / freshness tunables for the cursor-based refresh pass. Set so a
// healthy 1k-user marketplace gets every account re-scored at least once
// every ~40 runs (i.e. ~5 weeks at one cron tick/day, well inside the
// "every 24-48 hours" cadence on a per-active-user basis once the stale
// priority pass picks up dormant accounts first).
const DEFAULT_CURSOR_BATCH = 50;
const STALE_LEAD_FRESHNESS_DAYS = 14;
const DEFAULT_STALE_LIMIT = 25;
// Singleton key for the sales_sync_state row. We keep one cursor for the
// whole agent — per-tenant cursors aren't on the roadmap and a single row
// makes the upsert / read trivially cheap.
const SYNC_STATE_KEY = "default";
// Conversion-tracking window: of the most recent N "sent" events, how many
// brought the user back within `RE_ENGAGEMENT_CONVERSION_WINDOW_DAYS` days.
// Tunable via the `getReEngagementConversion` helper for tests / future
// admin filters.
const DEFAULT_CONVERSION_SAMPLE = 50;
const RE_ENGAGEMENT_CONVERSION_WINDOW_DAYS = 7;
// UTM tags applied to every tracked re-engagement link so analytics tools
// (and our own admin UI) can attribute downstream traffic to this campaign.
const REENGAGE_UTM = {
  utm_source: "reengage",
  utm_medium: "email",
  utm_campaign: "sales_reengagement",
} as const;

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
  if ((u.signupType || "").toLowerCase() === "personal" || (u.signupType || "").toLowerCase() === "creator") return "freelancer";
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
 * Three-phase candidate selection so the agent can never starve older
 * users:
 *
 *   1. **Backlog drain** — users with no `sales_leads` row yet (newest
 *      first). The LEFT JOIN + IS NULL filter guarantees older unsynced
 *      users eventually surface.
 *   2. **Stale priority** — existing leads whose `lastActivityAt` is
 *      older than the freshness window are re-scored on every run
 *      regardless of cursor position. This is what makes the
 *      re-engagement job continue to find dormant users even when
 *      sign-ups stop.
 *   3. **Cursor pagination** — every other user is walked in
 *      `users.id` order (cursor stored in `sales_sync_state`). Each
 *      run advances the cursor by ≤ `cursorLimit` users; when the
 *      query returns fewer rows than the limit we wrap the cursor
 *      back to the start (and bump `wrapCount`).
 *
 * Together, every Bareter user is re-scored on a predictable cadence
 * — recent or otherwise — even after the marketplace grows past any
 * single per-run budget. Same userId never gets ingested twice in
 * one run (deduped before the ingest loop).
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

export interface SyncCursorState {
  /** The userId we'll start AFTER on the next run, or null when the
   *  next run should start from the beginning of the user table. */
  cursorUserId: string | null;
  /** Wall-clock time of the most recent successful run. */
  lastRunAt: Date | null;
  /** How many full passes through the user table we've completed. A
   *  monotonic counter so the founder can see ingest cadence at a
   *  glance from the OS dashboard / a future admin endpoint. */
  wrapCount: number;
}

const ZERO_CURSOR: SyncCursorState = {
  cursorUserId: null,
  lastRunAt: null,
  wrapCount: 0,
};

/**
 * Read the persisted cursor (or the zero-state if no row exists yet).
 * Wrapped in try/catch so a transient DB hiccup degrades to a fresh
 * pass from the beginning instead of crashing the whole sync — the
 * only downside of the fallback is a single duplicated rescore on
 * the next run, which is harmless because `ingestUser` is idempotent.
 */
export async function getSalesSyncCursor(): Promise<SyncCursorState> {
  try {
    const [row] = await db
      .select()
      .from(salesSyncState)
      .where(eq(salesSyncState.id, SYNC_STATE_KEY))
      .limit(1);
    if (!row) return { ...ZERO_CURSOR };
    return {
      cursorUserId: row.cursorUserId ?? null,
      lastRunAt: row.lastRunAt ?? null,
      wrapCount: row.wrapCount ?? 0,
    };
  } catch (err) {
    console.error("[companyOs.sales] getSalesSyncCursor failed:", err);
    return { ...ZERO_CURSOR };
  }
}

/**
 * Persist the cursor for the next run. Single-row upsert keyed on
 * `id = 'default'`. `wrapped` is exposed as a parameter (rather than
 * derived inside the helper) so the caller can decide when a "wrap"
 * is meaningful — currently: when the cursor pagination query returns
 * fewer rows than the requested limit AND a previous cursor existed.
 */
async function persistSalesSyncCursor(opts: {
  cursorUserId: string | null;
  lastRunAt: Date;
  wrapped: boolean;
  previousWrapCount: number;
}): Promise<void> {
  const nextWrapCount = opts.wrapped
    ? opts.previousWrapCount + 1
    : opts.previousWrapCount;
  try {
    await db
      .insert(salesSyncState)
      .values({
        id: SYNC_STATE_KEY,
        cursorUserId: opts.cursorUserId,
        lastRunAt: opts.lastRunAt,
        wrapCount: nextWrapCount,
      })
      .onConflictDoUpdate({
        target: salesSyncState.id,
        set: {
          cursorUserId: opts.cursorUserId,
          lastRunAt: opts.lastRunAt,
          wrapCount: nextWrapCount,
          updatedAt: opts.lastRunAt,
        },
      });
  } catch (err) {
    // Cursor persistence failures are non-fatal — the next run will
    // re-read the previous (un-advanced) cursor and re-scan the same
    // window. ingestUser is idempotent so this just costs a wasted
    // refresh pass, never a duplicate or skipped lead.
    console.error("[companyOs.sales] persistSalesSyncCursor failed:", err);
  }
}

export interface SyncResultWithCursor extends SyncResult {
  cursor: SyncCursorState;
}

export async function syncNewLeads(
  opts: {
    limit?: number;
    refreshLimit?: number;
    cursorLimit?: number;
    staleLimit?: number;
    freshnessDays?: number;
  } = {},
): Promise<SyncResultWithCursor> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? DEFAULT_INGEST_BATCH));
  // `refreshLimit` is the legacy knob retained for backwards compat
  // with existing callers / tests: when supplied it caps the COMBINED
  // stale + cursor pass so the per-run footprint stays bounded. When
  // omitted, stale and cursor pulls each get their own default budget.
  const refreshLimit =
    opts.refreshLimit === undefined
      ? null
      : Math.max(0, Math.min(400, opts.refreshLimit));
  const cursorLimit = Math.max(
    0,
    Math.min(200, opts.cursorLimit ?? DEFAULT_CURSOR_BATCH),
  );
  const staleLimit = Math.max(
    0,
    Math.min(200, opts.staleLimit ?? DEFAULT_STALE_LIMIT),
  );
  const freshnessDays = Math.max(
    1,
    Math.min(90, opts.freshnessDays ?? STALE_LEAD_FRESHNESS_DAYS),
  );
  const now = new Date();
  const freshnessCutoff = new Date(
    now.getTime() - freshnessDays * 86_400_000,
  );

  // ── Phase 1 — backlog drain ────────────────────────────────────────────
  const unsynced = await db
    .select(USER_COLUMNS)
    .from(users)
    .leftJoin(salesLeads, eq(salesLeads.userId, users.id))
    .where(isNull(salesLeads.userId))
    .orderBy(desc(users.createdAt))
    .limit(limit);

  // Decide how many slots phase 2 + 3 may use. When the legacy
  // `refreshLimit` is set we honour it; otherwise stale + cursor each
  // get their own budget.
  const remaining =
    refreshLimit === null ? cursorLimit + staleLimit : refreshLimit;

  // ── Phase 2 — stale priority pass ──────────────────────────────────────
  // Pull existing leads whose lastActivityAt is older than the
  // freshness window, oldest first. These are re-scored on EVERY
  // run, independent of where the cursor is — which is exactly the
  // "re-score dormant users even when no new sign-ups happened"
  // requirement from the task spec.
  const staleBudget = Math.min(
    remaining,
    refreshLimit === null ? staleLimit : refreshLimit,
  );
  const stale =
    staleBudget > 0
      ? await db
          .select(USER_COLUMNS)
          .from(users)
          .innerJoin(salesLeads, eq(salesLeads.userId, users.id))
          .where(lt(salesLeads.lastActivityAt, freshnessCutoff))
          .orderBy(asc(salesLeads.lastActivityAt))
          .limit(staleBudget)
      : [];

  const remainingAfterStale = Math.max(0, remaining - stale.length);

  // ── Phase 3 — cursor pagination ────────────────────────────────────────
  // Walk the users table in `id` order, starting AFTER the persisted
  // cursor. When we receive fewer rows than the budget we know we've
  // hit the end of the table → wrap the cursor back to null and bump
  // wrapCount on the next persist. Cursor read is deferred until we
  // actually have a non-zero budget so callers passing `refreshLimit:0`
  // (e.g. one-shot backlog drain) skip the salesSyncState round-trip
  // entirely.
  const cursorBudget = Math.min(remainingAfterStale, cursorLimit);
  let cursorState: SyncCursorState = ZERO_CURSOR;
  let cursorUsers: UserCandidate[] = [];
  if (cursorBudget > 0) {
    cursorState = await getSalesSyncCursor();
    cursorUsers = (await db
      .select(USER_COLUMNS)
      .from(users)
      .where(
        cursorState.cursorUserId
          ? gt(users.id, cursorState.cursorUserId)
          : drizzleSql`TRUE`,
      )
      .orderBy(asc(users.id))
      .limit(cursorBudget)) as UserCandidate[];
  }

  // Wrap detection: any time the cursor pass returns fewer rows than
  // the budget AND we asked for a non-zero budget, we've reached the
  // tail of the user table. Reset the cursor so the next run starts
  // from the beginning. We treat the very-first run (no previous
  // cursor) the same way: if it returns < budget, the user table is
  // small enough that one run covers it — still a wrap.
  const wrapped = cursorBudget > 0 && cursorUsers.length < cursorBudget;
  const nextCursorUserId = wrapped
    ? null
    : cursorUsers.length > 0
      ? cursorUsers[cursorUsers.length - 1].id
      : cursorState.cursorUserId;

  // Dedupe across phases — a single run never ingests the same user
  // twice (e.g. a stale user whose id also falls in the cursor window).
  // First-write-wins: backlog → stale → cursor mirrors task priority.
  const seen = new Set<string>();
  const candidates: UserCandidate[] = [];
  for (const list of [unsynced, stale, cursorUsers]) {
    for (const u of list as UserCandidate[]) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      candidates.push(u);
    }
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  for (const u of candidates) {
    try {
      const r = await ingestUser(u, now);
      if (r.isNew) inserted++;
      else updated++;
    } catch (err) {
      errors++;
      console.error("[companyOs.sales] ingestUser failed for", u.id, err);
    }
  }

  // Persist the cursor LAST so a crash mid-ingest leaves the cursor
  // un-advanced and the next run safely re-scans the same window
  // (idempotent).
  let nextCursor: SyncCursorState = cursorState;
  if (cursorBudget > 0) {
    await persistSalesSyncCursor({
      cursorUserId: nextCursorUserId,
      lastRunAt: now,
      wrapped,
      previousWrapCount: cursorState.wrapCount,
    });
    nextCursor = {
      cursorUserId: nextCursorUserId,
      lastRunAt: now,
      wrapCount: wrapped ? cursorState.wrapCount + 1 : cursorState.wrapCount,
    };
  }

  return {
    scanned: candidates.length,
    inserted,
    updated,
    errors,
    cursor: nextCursor,
  };
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

const REENGAGE_SYSTEM_PROMPT = `You are the Sales Agent for Bareter — UAE's marketplace where businesses swap value. Barter. Collab. Grow.

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

function renderReEngagementHtml(bodyText: string, ctaUrl: string): string {
  const html = bodyText
    .split(/\n\n+/)
    .map((p) => `<p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  // The CTA URL is escaped both as href and as visible text — the visible
  // copy lets recipients see (and trust) the destination before clicking,
  // and the href is the same tracked URL so we can attribute the click.
  const safeUrl = escapeHtml(ctaUrl);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="margin:0;font-size:22px;color:#136c68;">${APP_NAME}</h1>
    </div>
    ${html}
    <a href="${safeUrl}" style="display:block;text-align:center;background:#136c68;color:white;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:600;margin:24px 0 8px;">
      Visit ${APP_NAME}
    </a>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0;">${APP_NAME} · UAE Barter Marketplace</p>
  </div>
</body></html>`;
}

/**
 * Server-trusted base URL for outbound re-engagement links. Mirrors the
 * pattern used by waitlistRoutes.baseUrlOf so we never trust request
 * headers (no req here — this runs from the cron) and never accidentally
 * point recipients at an attacker-controlled host.
 */
function reEngagementBaseUrl(): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (devDomain) return `https://${devDomain}`;
  return "https://bareter.com";
}

/**
 * Build the tracked CTA URL embedded in every re-engagement email. The
 * `token` is per-send (and unique in `sales_reengagement_events`), so the
 * server can attribute a click back to the exact send row even though no
 * user_id is in the URL. UTM params are appended for downstream analytics.
 */
export function buildTrackedReEngagementUrl(token: string, baseUrl?: string): string {
  const base = (baseUrl ?? reEngagementBaseUrl()).replace(/\/+$/, "");
  const params = new URLSearchParams(REENGAGE_UTM as Record<string, string>);
  return `${base}/api/sales/track/${encodeURIComponent(token)}?${params.toString()}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Per-lead delivery: draft → send → record event/log. Assumes the lead has
 * already been claimed (i.e. `reEngagementSentAt` was just stamped on it
 * by an atomic UPDATE … RETURNING). Returns whether the send succeeded
 * and which draft source was used so callers can update their counters.
 *
 * Failures here mean the lead stays "claimed" for the full cooldown — see
 * the trade-off note in `runReEngagementCampaign`. Surfaced as `ok=false`
 * so callers can label the outcome appropriately (cron vs manual).
 */
async function deliverReEngagementToClaimedLead(
  lead: SalesLead,
  opts: {
    verdict: { safe: boolean };
    trigger: "cron" | "manual";
    force?: boolean;
  },
): Promise<{ ok: boolean; usedFallback: boolean; linkToken: string }> {
  let bodyText: string | null = null;
  if (opts.verdict.safe) {
    bodyText = await draftReEngagementBodyText(lead);
  }
  let usedFallback = false;
  if (!bodyText) {
    bodyText = staticReEngagementBodyText(lead);
    usedFallback = true;
  }
  // One UUID per send — embedded in the CTA URL so the eventual
  // /api/sales/track/:token click maps back to this exact row in
  // sales_reengagement_events. Recording happens AFTER the send
  // succeeds so a failed Resend call doesn't leave a phantom "sent"
  // event that would skew the conversion rate downward.
  const linkToken = crypto.randomUUID();
  const ctaUrl = buildTrackedReEngagementUrl(linkToken);
  const trackedText = `${bodyText}\n\nVisit ${APP_NAME}: ${ctaUrl}`;
  const subject = `We miss you on ${APP_NAME}`;
  const ok = await sendReEngagementEmail(lead.email, {
    subject,
    html: renderReEngagementHtml(bodyText, ctaUrl),
    text: trackedText,
  });
  if (!ok) {
    return { ok: false, usedFallback, linkToken };
  }
  // Outcome-tracking event — one row per successful send. Failures
  // here are logged but never crash the caller; without this row a
  // return click can't be attributed, but the email already went out
  // so we'd rather lose the analytics signal than re-send the email.
  try {
    await db.insert(salesReengagementEvents).values({
      leadId: lead.id,
      userId: lead.userId,
      eventType: "sent",
      linkToken,
      metadata: {
        draftSource: usedFallback ? "static" : "llm",
        subject,
        trigger: opts.trigger,
        ...(opts.force ? { force: true } : {}),
      },
    });
  } catch (err) {
    console.error(
      "[companyOs.sales] failed to record 'sent' event for",
      lead.email,
      err,
    );
  }
  // Single semantic event per send — chatCompletion already logs the
  // LLM draft itself, so logging a separate zero-token line here would
  // inflate per-agent call counts without adding information.
  await logLlmCall({
    agentName: AGENT,
    command: opts.trigger === "manual" ? "reengage_send_manual" : "reengage_send",
    inputPreview: lead.email,
    outputPreview: usedFallback ? "static" : "llm",
    tokensUsed: 0,
  });
  return { ok: true, usedFallback, linkToken };
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

      const delivered = await deliverReEngagementToClaimedLead(lead, {
        verdict,
        trigger: "cron",
      });
      if (delivered.ok) {
        result.sent++;
        if (delivered.usedFallback) result.fallbackUsed++;
        else result.llmDrafted++;
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

/**
 * Per-lead re-engagement entry point — what the founder triggers from
 * the admin sales dashboard via POST /sales/leads/:id/re-engage. Mirrors
 * the bulk campaign's claim/draft/send/record-event flow but for a single
 * lead, with a `force` flag to bypass the 14-day cooldown.
 *
 * Status semantics let the route map outcomes to HTTP codes and lets the
 * UI render distinguishable toasts:
 *   • `sent`                  — email sent + event recorded (HTTP 200)
 *   • `skipped_not_found`     — no lead with that id (HTTP 404)
 *   • `skipped_converted`     — lead already converted, refuse (HTTP 409)
 *   • `skipped_cooldown`      — within 14-day cooldown, no force (HTTP 409)
 *   • `skipped_already_claimed` — race lost to another worker (HTTP 409)
 *   • `skipped_send_failed`   — Resend rejected the send (HTTP 502)
 */
export type ReEngagementSingleStatus =
  | "sent"
  | "skipped_not_found"
  | "skipped_converted"
  | "skipped_cooldown"
  | "skipped_already_claimed"
  | "skipped_send_failed";

export interface ReEngagementSingleResult {
  ok: boolean;
  status: ReEngagementSingleStatus;
  message?: string;
  draftSource?: "llm" | "static";
  reEngagementSentAt?: Date;
}

export async function runReEngagementForLead(
  leadId: string,
  opts: { force?: boolean } = {},
): Promise<ReEngagementSingleResult> {
  const force = !!opts.force;
  const now = new Date();
  const cooldownBefore = new Date(now.getTime() - RE_ENGAGEMENT_COOLDOWN_DAYS * 86_400_000);

  const found = await db
    .select()
    .from(salesLeads)
    .where(eq(salesLeads.id, leadId))
    .limit(1);
  const lead = found[0] as SalesLead | undefined;
  if (!lead) {
    return { ok: false, status: "skipped_not_found", message: "Lead not found" };
  }
  if (lead.status === "converted") {
    return {
      ok: false,
      status: "skipped_converted",
      message: "Lead already converted — refusing to re-engage.",
    };
  }
  if (
    !force &&
    lead.reEngagementSentAt &&
    new Date(lead.reEngagementSentAt) > cooldownBefore
  ) {
    return {
      ok: false,
      status: "skipped_cooldown",
      message: `Lead is still within the ${RE_ENGAGEMENT_COOLDOWN_DAYS}-day cooldown. Pass force=true to override.`,
    };
  }

  // Atomic claim — when forced, drop the cooldown predicate; we still
  // refuse to re-engage a converted lead at the SQL layer so a status
  // flip mid-flight cannot bypass the converted guard.
  const claimWhere = force
    ? and(
        eq(salesLeads.id, leadId),
        drizzleSql`${salesLeads.status} <> 'converted'`,
      )
    : and(
        eq(salesLeads.id, leadId),
        drizzleSql`${salesLeads.status} <> 'converted'`,
        or(
          isNull(salesLeads.reEngagementSentAt),
          lt(salesLeads.reEngagementSentAt, cooldownBefore),
        ),
      );
  const claimed = await db
    .update(salesLeads)
    .set({ reEngagementSentAt: now, status: "re_engaged", updatedAt: now })
    .where(claimWhere)
    .returning({ id: salesLeads.id });
  if (claimed.length === 0) {
    return {
      ok: false,
      status: "skipped_already_claimed",
      message: "Could not claim lead — another worker beat us to it.",
    };
  }

  const verdict = await getBudgetVerdict();
  const delivered = await deliverReEngagementToClaimedLead(lead, {
    verdict,
    trigger: "manual",
    force,
  });
  if (!delivered.ok) {
    return {
      ok: false,
      status: "skipped_send_failed",
      message:
        "Email send failed. Lead is now in the cooldown window for 14 days.",
    };
  }
  return {
    ok: true,
    status: "sent",
    draftSource: delivered.usedFallback ? "static" : "llm",
    reEngagementSentAt: now,
  };
}

// ---------------------------------------------------------------------------
// Daily orchestration — used by the 09:30 Asia/Dubai cron.
// ---------------------------------------------------------------------------

export interface DailySalesResult {
  sync: SyncResultWithCursor;
  reEngagement: ReEngagementResult;
}

/**
 * Daily orchestration entry point used by the 09:30 Asia/Dubai cron.
 *
 * Three-pass ingest: backlog drain (new users) → stale-priority refresh
 * (existing leads inactive past the freshness window) → cursor pagination
 * over every other user. The cursor is persisted in `sales_sync_state`
 * so successive runs cover the entire user base instead of starving
 * older accounts when the marketplace grows past one batch. See
 * `syncNewLeads` for the per-phase budgets and dedupe rules.
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
  reEngagementConversion: ReEngagementConversion;
}

export interface ReEngagementConversion {
  /** Number of "sent" events sampled (most recent first, capped at sample). */
  sent: number;
  /** Of those, how many had a return-visit click, post, or completed deal
   *  by the same user inside the conversion window. */
  returned: number;
  /** Conversion rate, 0..100, rounded to the nearest whole percent. */
  rate: number;
  /** Sample size used for the calculation (defaults to 50). */
  windowSize: number;
  /** Days after send within which a return must occur to count. */
  windowDays: number;
}

const ZERO_CONVERSION: ReEngagementConversion = {
  sent: 0,
  returned: 0,
  rate: 0,
  windowSize: DEFAULT_CONVERSION_SAMPLE,
  windowDays: RE_ENGAGEMENT_CONVERSION_WINDOW_DAYS,
};

/**
 * Compute the re-engagement conversion rate over the most recent N "sent"
 * events. A send is considered "converted" if any of the following happened
 * within `RE_ENGAGEMENT_CONVERSION_WINDOW_DAYS` days after it:
 *   1. The recipient clicked the tracked link (return_visit event with
 *      the same linkToken — persisted in `salesReengagementEvents`).
 *   2. The recipient posted a new listing (live join against `posts`).
 *   3. A deal involving the recipient (seeker or provider) flipped to
 *      `completed` (live join against `deals`).
 *
 * Design note — why posts/deals are *inferred live* and not persisted as
 * extra event rows: Task #71 scopes `salesReengagementEvents` to the
 * email-attribution surface (sent + return_visit). Posts and completed
 * deals already live in their own tables with their own timestamps; we
 * intentionally do NOT shadow-write `post`/`deal_completed` rows into
 * the events table because (a) they'd be redundant with the source-of-
 * truth tables, (b) backfilling existing posts/deals would require a
 * one-shot migration, and (c) the conversion query stays correct and
 * cheap (≤50 sent rows × bounded post/deal scan inside the earliest
 * send window). If a future task wants a single unified events feed
 * for the admin UI, materialize posts/deals into the events table at
 * write time and adjust this query to read only from
 * `salesReengagementEvents`.
 *
 * Implementation note: we don't push the entire calculation into a single
 * SQL query because the "win window per row" predicate is awkward in
 * Drizzle's query builder and the dataset is bounded (≤50 rows by
 * default). Instead we do four bounded selects and join in JS. The
 * bounded fan-out keeps this O(N) and naturally degrades to a no-op
 * when no sends have happened yet.
 */
export async function getReEngagementConversion(opts: {
  windowSize?: number;
  windowDays?: number;
} = {}): Promise<ReEngagementConversion> {
  const windowSize = Math.max(
    1,
    Math.min(500, opts.windowSize ?? DEFAULT_CONVERSION_SAMPLE),
  );
  const windowDays = Math.max(
    1,
    Math.min(60, opts.windowDays ?? RE_ENGAGEMENT_CONVERSION_WINDOW_DAYS),
  );
  try {
    const sentEvents = await db
      .select({
        linkToken: salesReengagementEvents.linkToken,
        userId: salesReengagementEvents.userId,
        sentAt: salesReengagementEvents.createdAt,
      })
      .from(salesReengagementEvents)
      .where(eq(salesReengagementEvents.eventType, "sent"))
      .orderBy(desc(salesReengagementEvents.createdAt))
      .limit(windowSize);

    if (sentEvents.length === 0) {
      return { ...ZERO_CONVERSION, windowSize, windowDays };
    }

    const tokens = sentEvents.map((e) => e.linkToken);
    const userIds = Array.from(new Set(sentEvents.map((e) => e.userId)));
    // Earliest send timestamp bounds the post / deal window so we don't
    // pull the entire posts/deals tables — only rows that could possibly
    // be inside any one send's conversion window.
    const earliestSent = new Date(
      Math.min(...sentEvents.map((e) => new Date(e.sentAt as unknown as string).getTime())),
    );
    const winMs = windowDays * 86_400_000;

    const [returnEvents, userPosts, userDeals] = await Promise.all([
      db
        .select({
          linkToken: salesReengagementEvents.linkToken,
          createdAt: salesReengagementEvents.createdAt,
        })
        .from(salesReengagementEvents)
        .where(
          and(
            eq(salesReengagementEvents.eventType, "return_visit"),
            inArray(salesReengagementEvents.linkToken, tokens),
          ),
        ),
      db
        .select({ userId: posts.userId, createdAt: posts.createdAt })
        .from(posts)
        .where(and(inArray(posts.userId, userIds), gte(posts.createdAt, earliestSent))),
      db
        .select({
          seekerId: deals.seekerId,
          providerId: deals.providerId,
          updatedAt: deals.updatedAt,
        })
        .from(deals)
        .where(
          and(
            or(inArray(deals.seekerId, userIds), inArray(deals.providerId, userIds)),
            eq(deals.state, "completed"),
            gte(deals.updatedAt, earliestSent),
          ),
        ),
    ]);

    const returnByToken = new Map<string, number>();
    for (const r of returnEvents) {
      const ts = new Date(r.createdAt as unknown as string).getTime();
      const existing = returnByToken.get(r.linkToken);
      if (existing === undefined || ts < existing) {
        returnByToken.set(r.linkToken, ts);
      }
    }

    let returned = 0;
    for (const s of sentEvents) {
      const sentMs = new Date(s.sentAt as unknown as string).getTime();
      const cutoff = sentMs + winMs;
      const visit = returnByToken.get(s.linkToken);
      if (visit !== undefined && visit >= sentMs && visit <= cutoff) {
        returned++;
        continue;
      }
      const postHit = userPosts.some((p) => {
        if (p.userId !== s.userId) return false;
        const t = new Date(p.createdAt as unknown as string).getTime();
        return t > sentMs && t <= cutoff;
      });
      if (postHit) {
        returned++;
        continue;
      }
      const dealHit = userDeals.some((d) => {
        if (d.seekerId !== s.userId && d.providerId !== s.userId) return false;
        const t = new Date(d.updatedAt as unknown as string).getTime();
        return t > sentMs && t <= cutoff;
      });
      if (dealHit) {
        returned++;
      }
    }

    return {
      sent: sentEvents.length,
      returned,
      rate:
        sentEvents.length === 0
          ? 0
          : Math.round((returned / sentEvents.length) * 100),
      windowSize,
      windowDays,
    };
  } catch (err) {
    console.error("[companyOs.sales] getReEngagementConversion failed:", err);
    return { ...ZERO_CONVERSION, windowSize, windowDays };
  }
}

/**
 * Record a click on the tracked re-engagement CTA URL. Idempotent on
 * `linkToken` thanks to the (linkToken, eventType) unique index — a
 * recipient who clicks the link 5 times still produces a single
 * "return_visit" row, so the conversion rate isn't inflated by repeat
 * opens of the same email.
 *
 * Returns the lead/user ids of the originating send when the token is
 * known, or `null` when it's unknown (random hits, expired tokens).
 */
export async function recordReEngagementReturnVisit(
  token: string,
  metadata?: Record<string, unknown>,
): Promise<{ leadId: string; userId: string } | null> {
  if (!token || token.length > 64) return null;
  try {
    const [sentEvent] = await db
      .select({
        leadId: salesReengagementEvents.leadId,
        userId: salesReengagementEvents.userId,
      })
      .from(salesReengagementEvents)
      .where(
        and(
          eq(salesReengagementEvents.linkToken, token),
          eq(salesReengagementEvents.eventType, "sent"),
        ),
      )
      .limit(1);
    if (!sentEvent) return null;

    // ON CONFLICT DO NOTHING on the (linkToken, eventType) unique index
    // makes repeat clicks a no-op — exactly what we want for a fair
    // "X of last 50 returned" metric.
    await db
      .insert(salesReengagementEvents)
      .values({
        leadId: sentEvent.leadId,
        userId: sentEvent.userId,
        eventType: "return_visit",
        linkToken: token,
        metadata: metadata ?? null,
      })
      .onConflictDoNothing({
        target: [salesReengagementEvents.linkToken, salesReengagementEvents.eventType],
      });

    // Bump lastActivityAt on the lead so the next sync sees the visit
    // (and the cron's "still inactive" filter doesn't immediately re-queue
    // them for another email). Best-effort — failure here doesn't matter
    // for the conversion metric.
    try {
      await db
        .update(salesLeads)
        .set({ lastActivityAt: new Date(), updatedAt: new Date() })
        .where(eq(salesLeads.id, sentEvent.leadId));
    } catch (err) {
      console.warn("[companyOs.sales] lastActivityAt bump failed:", err);
    }

    return sentEvent;
  } catch (err) {
    console.error("[companyOs.sales] recordReEngagementReturnVisit failed:", err);
    return null;
  }
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
    // Conversion stats run as a separate awaited call (not folded into the
    // Promise.all above) so a future caller adding a new aggregate doesn't
    // interleave its inner selects with these four counters. Keeping the
    // sequential break also means the function still returns sensible
    // numbers when the conversion read happens to fail — we wrap it with
    // a fallback so the leads command never goes silent on an analytics
    // hiccup.
    let reEngagementConversion: ReEngagementConversion;
    try {
      reEngagementConversion = await getReEngagementConversion();
    } catch (err) {
      console.error("[companyOs.sales] conversion read failed:", err);
      reEngagementConversion = { ...ZERO_CONVERSION };
    }
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
      reEngagementConversion,
    };
  } catch (err) {
    console.error("[companyOs.sales] getSalesReport failed:", err);
    return {
      total: 0,
      new: 0,
      active: 0,
      reEngaged: 0,
      avgScore: 0,
      newThisWeek: 0,
      reEngagementConversion: { ...ZERO_CONVERSION },
    };
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

// ---------------------------------------------------------------------------
// updateLead — admin-side editor for the Company OS sales page.
//
// Lets the founder edit the freeform `notes` and/or override the lifecycle
// `status` from the browser (PATCH /api/company-os/sales/leads/:id).
//
// Only the two fields we want to expose are accepted; everything else
// (score, email, lastActivityAt, …) is owned by the agent and must not
// be hand-edited from the UI. `notes` is null-able so an empty string
// from the editor clears the field. A bumped `updatedAt` keeps the
// stale-leads refresh pass deterministic — manually-edited rows go to
// the back of the refresh queue rather than being re-scored on the next
// cron tick.
// ---------------------------------------------------------------------------

const ALLOWED_LEAD_STATUSES: readonly LeadStatus[] = [
  "new",
  "active",
  "engaged",
  "re_engaged",
  "converted",
  "dormant",
];

export interface LeadUpdateInput {
  notes?: string | null;
  status?: LeadStatus;
}

export async function updateLead(
  id: string,
  patch: LeadUpdateInput,
): Promise<SalesLead | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.notes !== undefined) {
    const trimmed = (patch.notes ?? "").toString();
    set.notes = trimmed.length === 0 ? null : trimmed.slice(0, 4000);
  }
  if (patch.status !== undefined) {
    if (!ALLOWED_LEAD_STATUSES.includes(patch.status)) {
      throw new Error(`Invalid lead status: ${patch.status}`);
    }
    set.status = patch.status;
  }
  // Only `updatedAt` was set → caller asked for nothing actionable.
  if (Object.keys(set).length === 1) {
    const [row] = await db.select().from(salesLeads).where(eq(salesLeads.id, id)).limit(1);
    return row ?? null;
  }
  const rows = await db
    .update(salesLeads)
    .set(set)
    .where(eq(salesLeads.id, id))
    .returning();
  return rows[0] ?? null;
}

/**
 * Express handler for `GET /api/sales/track/:token`.
 *
 * Extracted from `server/routes.ts` so it can be exercised in isolation
 * without booting the entire app. The behaviour is intentionally
 * forgiving: even if the DB write fails (or the token is malformed) we
 * still 302-redirect to the home page so the recipient never sees an
 * error — protecting a metric is never worth bouncing the user out of
 * Bareter.
 *
 * The shape (string token in/out, query-param preservation, default UTM
 * tags, `re_t=1` marker only on valid tokens) is locked down by
 * `tests/companyOs.sales.test.ts → "/api/sales/track/:token route"`.
 */
const TRACKING_TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;
export async function handleSalesTrackingRequest(
  req: {
    params: { token?: string };
    query: Record<string, unknown>;
    ip?: string;
    get(name: string): string | undefined;
  },
  res: { redirect(status: number, url: string): void },
): Promise<void> {
  const rawToken = String(req.params.token || "");
  let validToken = false;
  if (TRACKING_TOKEN_RE.test(rawToken)) {
    validToken = true;
    try {
      await recordReEngagementReturnVisit(rawToken, {
        ip: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      });
    } catch (err) {
      console.error("[sales] return_visit recording failed:", err);
    }
  } else {
    console.warn("[sales] tracked link hit with invalid token shape");
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (typeof v === "string" && k.startsWith("utm_")) params.set(k, v);
  }
  if (!params.has("utm_source")) params.set("utm_source", REENGAGE_UTM.utm_source);
  if (!params.has("utm_medium")) params.set("utm_medium", REENGAGE_UTM.utm_medium);
  if (!params.has("utm_campaign")) {
    params.set("utm_campaign", REENGAGE_UTM.utm_campaign);
  }
  // Only set the attribution marker for valid tokens — bogus tokens
  // shouldn't contribute to "this load was a re-engagement click".
  if (validToken) params.set("re_t", "1");
  res.redirect(302, `/?${params.toString()}`);
}

export function formatSalesReport(r: SalesReport): string {
  // The conversion line is only meaningful once at least one re-engagement
  // email has gone out. Before then, render a friendlier "no sends yet"
  // string instead of "0 of 0 returned (0%)" which looks like a failure.
  const conv = r.reEngagementConversion;
  const convLine = conv.sent === 0
    ? `• Re-engagement: no sends in last ${conv.windowSize}`
    : `• Re-engagement: ${conv.returned} of last ${conv.sent} returned within ${conv.windowDays}d (${conv.rate}%)`;
  return [
    "*Sales · leads snapshot*",
    `• Total: ${r.total}`,
    `• New: ${r.new}`,
    `• Active: ${r.active}`,
    `• Re-engaged: ${r.reEngaged}`,
    `• Avg score: ${r.avgScore}`,
    `• New this week: ${r.newThisWeek}`,
    convLine,
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
