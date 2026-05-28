// Marketing Agent — weekly campaign briefs + manual campaign tracking.
//
// What this ships:
//   • `gatherTrendingData` pulls last-7-day platform activity (post
//     categories, top cities, listing/post counts, average listing value).
//   • `generateAndStoreBrief` asks the LLM (via the cost-tracked broker)
//     for a UAE/GCC-tailored brief, persists the row, renders a PDF with
//     jsPDF, uploads the PDF to private object storage, and returns the
//     finalised row with a `pdfStorageKey`.
//   • `parseCampaignUpdate` + `recordCampaignUpdate` accept the WhatsApp
//     `campaign update <name> ctr=X spend=Y conversions=Z` command and
//     upsert into `campaign_performance`. This replaces Meta Graph
//     auto-fetch until the founder is approved on Meta's Marketing API.
//   • `draftPost` returns a single short post that works on IG / LI / X.
//   • `formatMarketingReport` is the WhatsApp-shaped report behind the
//     `marketing` command and the Monday cron message.
//
// Auto-publishing (Task #69):
//   • `publishPostFromTopic(topic)` drafts via `draftPost` and routes
//     through the `socialPublishers/` connector picked from env config
//     (Buffer, LinkedIn, or Meta IG/FB). The WhatsApp surface is
//     `publish post <topic>`. When no connector is wired, the helper
//     surfaces a friendly "not configured" reply rather than crashing.
//   • `runMetaCampaignSync()` pulls Meta Marketing API insights at the
//     campaign level and upserts into `campaign_performance`. The
//     scheduler runs it daily; manual `campaign update` stays as the
//     fallback for ad accounts not connected through Meta yet.

import { and, gte, eq, count, desc, sql as drizzleSql } from "drizzle-orm";
import { jsPDF } from "jspdf";
import { db } from "../db";
import {
  posts,
  listings,
  contentBriefs,
  campaignPerformance,
  marketingPosts,
  type ContentBrief,
  type CampaignPerformance,
  type MarketingPost,
} from "@shared/schema";
import { jsonCompletion, chatCompletion, type ChatMessage } from "../agents/llm";
import { logLlmCall, DEFAULT_MODEL } from "./costTracker";
import { uploadPrivateBuffer, getSignedDownloadUrl } from "./objectStorageHelpers";
import { dubaiDateString } from "./financeAgent";
import {
  buildAgentContext,
  rememberInBackground,
  recall,
  recallByKey,
  remember,
  forgetMemoryTyped,
} from "./memoryAgent";
import {
  publishPost as dispatchPublishPost,
  getConfiguredChannels,
  type PublishOutcome,
} from "./socialPublishers";
import { fetchCampaignInsights } from "./socialPublishers/metaClient";

const AGENT = "marketingAgent";
export const BRIEF_SIGNED_URL_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

// ---------------------------------------------------------------------------
// Trending data — purely column-based aggregations so the agent stays
// portable and doesn't need raw-SQL JSONB unnesting (which is harder to mock
// in tests). Any DB error degrades to an empty snapshot rather than throwing.
// ---------------------------------------------------------------------------

export interface TrendingSnapshot {
  topPostCategories: { category: string; count: number }[];
  topCities: { city: string; count: number }[];
  newListings: number;
  newPosts: number;
  avgListingValueAed: number;
  windowDays: number;
}

export async function gatherTrendingData(windowDays = 7): Promise<TrendingSnapshot> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  try {
    const [postCats, cityRows, newL, newP, avgValRow] = await Promise.all([
      db
        .select({ category: posts.feedCategory, c: count() })
        .from(posts)
        .where(and(gte(posts.createdAt, since), eq(posts.isActive, true)))
        .groupBy(posts.feedCategory)
        .orderBy(desc(count()))
        .limit(5),
      db
        .select({ city: listings.city, c: count() })
        .from(listings)
        .where(and(gte(listings.createdAt, since), drizzleSql`${listings.city} IS NOT NULL`))
        .groupBy(listings.city)
        .orderBy(desc(count()))
        .limit(5),
      db.select({ c: count() }).from(listings).where(gte(listings.createdAt, since)),
      db.select({ c: count() }).from(posts).where(gte(posts.createdAt, since)),
      db
        .select({ avg: drizzleSql<string>`COALESCE(AVG(${listings.retailValue}), 0)` })
        .from(listings)
        .where(gte(listings.createdAt, since)),
    ]);
    return {
      topPostCategories: postCats
        .filter((r) => r.category)
        .map((r) => ({ category: String(r.category), count: r.c })),
      topCities: cityRows
        .filter((r) => r.city)
        .map((r) => ({ city: String(r.city), count: r.c })),
      newListings: newL[0]?.c ?? 0,
      newPosts: newP[0]?.c ?? 0,
      avgListingValueAed: Math.round(Number(avgValRow[0]?.avg ?? 0)),
      windowDays,
    };
  } catch (err) {
    console.error("[companyOs.marketing] gatherTrendingData failed:", err);
    return {
      topPostCategories: [],
      topCities: [],
      newListings: 0,
      newPosts: 0,
      avgListingValueAed: 0,
      windowDays,
    };
  }
}

// ---------------------------------------------------------------------------
// Brief generation — LLM -> contentBriefs row -> PDF -> object storage.
// ---------------------------------------------------------------------------

interface BriefDraft {
  theme: string;
  audience: string;
  hooks: string[];
  hashtags: string[];
  suggestedBudgetAed: number;
  recommendations: string;
}

const BRIEF_SYSTEM_PROMPT = `You are the Marketing Agent for Bareter, a UAE/GCC barter marketplace for SMEs and freelancers.

Generate a weekly campaign brief.

Rules:
- Audience: UAE/GCC SMEs, founders, freelancers active in cashless barter.
- Hooks must be culturally appropriate; reference real platform data when possible.
- Hashtags: 5-8 total, mix global (#barter, #cashlesstrade) with at least one UAE-specific (#UAEBusiness, #DubaiSME, #GCCBarter, etc.).
- Suggested budget in AED, between 200 and 5000 (assume the founder is testing, not scaling).
- Recommendations: 2-3 sentences on which channel (Instagram / LinkedIn / TikTok / X) and posting cadence works best.

Output strict JSON: { theme, audience, hooks (3-5 strings), hashtags (5-8 strings), suggestedBudgetAed (number), recommendations (string) }.`;

export async function generateBriefDraft(snapshot: TrendingSnapshot): Promise<BriefDraft> {
  const memoryBlock = await buildAgentContext("marketing");
  const systemContent = memoryBlock
    ? `${memoryBlock}\n\n${BRIEF_SYSTEM_PROMPT}`
    : BRIEF_SYSTEM_PROMPT;
  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    {
      role: "user",
      content: `Real Bareter activity (last ${snapshot.windowDays} days):\n${JSON.stringify(snapshot, null, 2)}\n\nDraft this week's marketing brief.`,
    },
  ];
  const { data } = await jsonCompletion<BriefDraft>(messages, {
    agentName: AGENT,
    command: "generate_brief",
    model: DEFAULT_MODEL,
    temperature: 0.6,
    maxTokens: 700,
    // Per-agent budget breach: emit a placeholder brief so the cron
    // job still inserts a row (and the founder sees something
    // explaining why this week's brief is sparse).
    agentBudgetJsonFallback: {
      theme: "Marketing brief paused (budget reached)",
      audience: "UAE/GCC SMEs and freelancers",
      hooks: [],
      hashtags: [],
      suggestedBudgetAed: 0,
      recommendations:
        "Marketing AI budget for the month has been reached. Resume next month or raise the cap via env override.",
    },
  });
  // Defensive normalisation — if the LLM returns malformed shapes we patch
  // rather than crash, so the cron job still produces a row.
  return {
    theme: String(data.theme ?? "Untitled brief").slice(0, 200),
    audience: String(data.audience ?? "UAE/GCC SMEs and freelancers").slice(0, 400),
    hooks: Array.isArray(data.hooks) ? data.hooks.map((h) => String(h)).slice(0, 6) : [],
    hashtags: Array.isArray(data.hashtags) ? data.hashtags.map((h) => String(h)).slice(0, 10) : [],
    suggestedBudgetAed: Math.max(0, Math.min(5000, Math.round(Number(data.suggestedBudgetAed) || 500))),
    recommendations: String(data.recommendations ?? "").slice(0, 600),
  };
}

/**
 * Compute the Asia/Dubai Monday of the current week as a YYYY-MM-DD string.
 * Used as the human-friendly `weekStart` field on each brief row.
 */
export function dubaiWeekStart(now = new Date()): string {
  // Convert "now" to a Dubai-local Date by adding the +4 offset, then snap
  // back to UTC midnight so weekday math works without TZ surprises.
  const dubaiMs = now.getTime() + 4 * 60 * 60 * 1000;
  const dubai = new Date(dubaiMs);
  const utcMidnight = new Date(
    Date.UTC(dubai.getUTCFullYear(), dubai.getUTCMonth(), dubai.getUTCDate()),
  );
  const dow = utcMidnight.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
  const offsetToMonday = (dow + 6) % 7;
  const monday = new Date(utcMidnight.getTime() - offsetToMonday * 24 * 60 * 60 * 1000);
  return monday.toISOString().slice(0, 10);
}

export function renderBriefPdf(brief: ContentBrief): Buffer {
  const doc = new jsPDF();
  const left = 18;
  let y = 22;
  doc.setFontSize(20);
  doc.text("Bareter — Weekly Marketing Brief", left, y);
  y += 10;
  doc.setFontSize(11);
  doc.text(`Week of ${brief.weekStart}`, left, y);
  y += 12;

  const section = (title: string, body: string) => {
    if (y > 270) {
      doc.addPage();
      y = 22;
    }
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(title, left, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(body || "—", 175);
    doc.text(lines, left, y);
    y += lines.length * 6 + 4;
  };

  section("Theme", brief.theme);
  section("Audience", brief.audience);
  const hooks = (brief.hooks as string[] | null) ?? [];
  section(
    "Hooks",
    hooks.length ? hooks.map((h, i) => `${i + 1}. ${h}`).join("\n") : "—",
  );
  const tags = (brief.hashtags as string[] | null) ?? [];
  section("Hashtags", tags.length ? tags.join("  ") : "—");
  section("Suggested budget", `AED ${Number(brief.suggestedBudgetAed).toFixed(0)}`);
  section("Recommendations", brief.recommendations || "—");

  return Buffer.from(doc.output("arraybuffer"));
}

export async function generateAndStoreBrief(): Promise<ContentBrief> {
  const snapshot = await gatherTrendingData(7);
  const draft = await generateBriefDraft(snapshot);
  const weekStart = dubaiWeekStart();

  const inserted = await db
    .insert(contentBriefs)
    .values({
      weekStart,
      theme: draft.theme,
      audience: draft.audience,
      hooks: draft.hooks,
      hashtags: draft.hashtags,
      suggestedBudgetAed: String(draft.suggestedBudgetAed),
      recommendations: draft.recommendations,
      pdfStorageKey: null,
    })
    .returning();
  const brief = inserted[0];
  if (!brief) {
    throw new Error("Failed to insert content brief row");
  }

  // Seed memory: remember the brief's theme + budget so the next
  // weekly brief can build on the founder's most recent direction.
  rememberInBackground({
    agentName: "marketing",
    memoryType: "learning",
    key: "latest_brief_theme",
    value: {
      weekStart: brief.weekStart,
      theme: draft.theme,
      suggestedBudgetAed: draft.suggestedBudgetAed,
      hashtags: draft.hashtags.slice(0, 5),
    },
    confidence: 0.7,
  });

  // PDF is best-effort — if object storage is misconfigured the brief
  // still exists in Postgres and is reachable via /api/company-os/briefs.
  try {
    const pdf = renderBriefPdf(brief);
    const key = `companyOs/briefs/${brief.id}.pdf`;
    await uploadPrivateBuffer(key, pdf, "application/pdf");
    const updated = await db
      .update(contentBriefs)
      .set({ pdfStorageKey: key })
      .where(eq(contentBriefs.id, brief.id))
      .returning();
    return updated[0] ?? { ...brief, pdfStorageKey: key };
  } catch (err) {
    console.error("[companyOs.marketing] PDF render/upload failed:", err);
    return brief;
  }
}

// ---------------------------------------------------------------------------
// Manual campaign capture — `campaign update <name> ctr=X spend=Y conversions=Z`
// ---------------------------------------------------------------------------

const CAMPAIGN_UPDATE_RE =
  /^campaign\s+update\s+(.+?)\s+ctr\s*=\s*([\d.]+)\s+spend\s*=\s*([\d.]+)\s+conversions\s*=\s*(\d+)\s*$/i;

export interface CampaignUpdate {
  campaignName: string;
  ctr: number;
  spendAed: number;
  conversions: number;
}

export function parseCampaignUpdate(text: string): CampaignUpdate | null {
  const m = text.trim().match(CAMPAIGN_UPDATE_RE);
  if (!m) return null;
  const ctr = Number(m[2]);
  const spend = Number(m[3]);
  const conv = Number(m[4]);
  if (!Number.isFinite(ctr) || ctr < 0 || ctr > 100) return null;
  if (!Number.isFinite(spend) || spend < 0) return null;
  if (!Number.isFinite(conv) || conv < 0) return null;
  const name = m[1].trim().slice(0, 120);
  if (!name) return null;
  return { campaignName: name, ctr, spendAed: spend, conversions: conv };
}

export async function recordCampaignUpdate(u: CampaignUpdate): Promise<CampaignPerformance> {
  const inserted = await db
    .insert(campaignPerformance)
    .values({
      campaignName: u.campaignName,
      channel: null,
      ctr: u.ctr.toFixed(2),
      spendAed: u.spendAed.toFixed(2),
      conversions: u.conversions,
      notes: null,
    })
    .onConflictDoUpdate({
      target: campaignPerformance.campaignName,
      set: {
        ctr: u.ctr.toFixed(2),
        spendAed: u.spendAed.toFixed(2),
        conversions: u.conversions,
        updatedAt: new Date(),
      },
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw new Error("Failed to upsert campaign_performance row");
  }
  return row;
}

// ---------------------------------------------------------------------------
// Draft post — single short copy block usable on IG / LinkedIn / X.
// ---------------------------------------------------------------------------

const DRAFT_POST_SYSTEM = `You are the Marketing Agent for Bareter (UAE/GCC barter marketplace). Draft ONE short social post that works on Instagram, LinkedIn and X simultaneously.

Constraints:
- Hard limit: 220 characters total (so X works).
- Structure: hook (one line), value prop (one short sentence), CTA, then 3 hashtags on a final line.
- No emoji at the very start (LinkedIn-friendly).
- At least one hashtag must be UAE/GCC-specific (e.g. #UAEBusiness, #DubaiSME, #GCCBarter).
- Output ONLY the post text. No commentary, no quotes, no labels.`;

export async function draftPost(topic: string): Promise<string> {
  const memoryBlock = await buildAgentContext("marketing");
  const systemContent = memoryBlock
    ? `${memoryBlock}\n\n${DRAFT_POST_SYSTEM}`
    : DRAFT_POST_SYSTEM;
  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: `Topic: ${topic.slice(0, 200)}` },
  ];
  const { content } = await chatCompletion(messages, {
    agentName: AGENT,
    command: "draft_post",
    inputPreview: topic,
    model: DEFAULT_MODEL,
    temperature: 0.85,
    maxTokens: 200,
  });
  const post = content.trim();
  // Seed memory: track which topics the founder has drafted so the next
  // brief can pick up on them.
  rememberInBackground({
    agentName: "marketing",
    memoryType: "pattern",
    key: "recent_draft_topic",
    value: { topic: topic.slice(0, 200), generatedChars: post.length },
    confidence: 0.5,
  });
  return post;
}

// ---------------------------------------------------------------------------
// AI email draft — used by the admin broadcast tool.
// ---------------------------------------------------------------------------

const EMAIL_DRAFT_SYSTEM = `You are the Marketing Agent for Bareter, a UAE/GCC cashless barter marketplace for SMEs and freelancers.

Draft a broadcast email for the admin to send to platform users.

Rules:
- Audience: UAE/GCC SMEs, founders, freelancers.
- Tone: warm, professional, energetic — never salesy or spammy.
- Subject: concise (max 60 chars), curiosity-driven.
- Body: plain text, 3–5 short paragraphs. Use {{name}} for personalisation.
- End with a clear call to action.
- Do NOT include HTML tags.

Output strict JSON: { "subject": string, "body": string }`;

export async function draftBroadcastEmail(prompt: string): Promise<{ subject: string; body: string }> {
  const memoryBlock = await buildAgentContext("marketing");
  const systemContent = memoryBlock ? `${memoryBlock}\n\n${EMAIL_DRAFT_SYSTEM}` : EMAIL_DRAFT_SYSTEM;
  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: `Draft a broadcast email for this purpose: ${prompt.slice(0, 500)}` },
  ];
  const { data } = await jsonCompletion<{ subject: string; body: string }>(messages, {
    agentName: AGENT,
    command: "draft_broadcast_email",
    inputPreview: prompt,
    model: DEFAULT_MODEL,
    temperature: 0.75,
    maxTokens: 800,
  });
  if (!data) throw new Error("AI budget blocked or no response from LLM");
  rememberInBackground({
    agentName: "marketing",
    memoryType: "pattern",
    key: "recent_email_draft",
    value: { prompt: prompt.slice(0, 200), subjectChars: data.subject?.length ?? 0 },
    confidence: 0.5,
  });
  return { subject: data.subject ?? "", body: data.body ?? "" };
}

// ---------------------------------------------------------------------------
// WhatsApp formatters + DB read helpers (used by manager + admin router).
// ---------------------------------------------------------------------------

export async function getLatestBrief(): Promise<ContentBrief | null> {
  const rows = await db
    .select()
    .from(contentBriefs)
    .orderBy(desc(contentBriefs.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRecentCampaigns(limit = 5): Promise<CampaignPerformance[]> {
  return db
    .select()
    .from(campaignPerformance)
    .orderBy(desc(campaignPerformance.updatedAt))
    .limit(limit);
}

/**
 * Persist one marketing publish attempt (success OR failure) to the
 * `marketing_posts` table. Best-effort — a write failure is logged but
 * never raised to the caller, so a Postgres hiccup can never block an
 * actual publish or confirmation reply.
 *
 * Called from both `publishPostFromTopic` (legacy auto-publish path) and
 * `handleConfirmPublishSend` (Task #86 confirmation flow) so every
 * outbound post — regardless of which surface triggered it — shows up
 * on the dashboard.
 */
export async function recordPublishedPost(input: {
  topic: string;
  postBody: string;
  outcome: PublishOutcome;
}): Promise<void> {
  const { topic, postBody, outcome } = input;
  try {
    await db.insert(marketingPosts).values({
      channel: outcome.channel ?? null,
      topic: topic.slice(0, 500),
      body: postBody.slice(0, 4000),
      externalId: outcome.ok ? outcome.externalId ?? null : null,
      externalUrl: outcome.ok ? outcome.externalUrl ?? null : null,
      status: outcome.ok ? "success" : "failure",
      error: outcome.ok ? null : `${outcome.reason}: ${outcome.detail}`.slice(0, 1000),
    });
  } catch (err) {
    console.error("[companyOs.marketing] recordPublishedPost failed:", err);
  }
}

/**
 * Read the last N marketing publish attempts. Used by the dashboard,
 * the WhatsApp `marketing` report, and the weekly brief notification.
 */
export async function getRecentMarketingPosts(limit = 5): Promise<MarketingPost[]> {
  try {
    return await db
      .select()
      .from(marketingPosts)
      .orderBy(desc(marketingPosts.createdAt))
      .limit(Math.max(1, Math.min(100, limit)));
  } catch (err) {
    console.error("[companyOs.marketing] getRecentMarketingPosts failed:", err);
    return [];
  }
}

export async function getAllBriefs(limit = 50): Promise<ContentBrief[]> {
  return db
    .select()
    .from(contentBriefs)
    .orderBy(desc(contentBriefs.createdAt))
    .limit(limit);
}

export async function getBriefById(id: string): Promise<ContentBrief | null> {
  const rows = await db
    .select()
    .from(contentBriefs)
    .where(eq(contentBriefs.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function formatMarketingReport(): Promise<string> {
  const [latest, recent, recentPosts] = await Promise.all([
    getLatestBrief(),
    getRecentCampaigns(3),
    getRecentMarketingPosts(5),
  ]);
  const lines: string[] = ["*Marketing · latest brief*"];

  if (!latest) {
    lines.push("No brief generated yet. Trigger one from the dashboard or wait for Monday 09:00 (Asia/Dubai).");
  } else {
    lines.push(`Week of ${latest.weekStart}`);
    lines.push(`*${latest.theme}*`);
    if (Array.isArray(latest.hashtags) && latest.hashtags.length > 0) {
      lines.push((latest.hashtags as string[]).join("  "));
    }
    if (latest.pdfStorageKey) {
      try {
        const url = await getSignedDownloadUrl(latest.pdfStorageKey, BRIEF_SIGNED_URL_TTL_SEC);
        lines.push(`PDF: ${url}`);
      } catch (err) {
        console.error("[companyOs.marketing] signed URL failed:", err);
        lines.push("(PDF link unavailable — check object storage logs)");
      }
    }
  }

  lines.push("");
  if (recent.length > 0) {
    lines.push("*Recent campaigns*");
    for (const c of recent) {
      lines.push(
        `• ${c.campaignName}: CTR ${Number(c.ctr).toFixed(2)}%, AED ${Number(c.spendAed).toFixed(0)}, ${c.conversions} conv`,
      );
    }
  } else {
    lines.push("_Log results with:_ `campaign update <name> ctr=X spend=Y conversions=Z`");
  }

  // Recent published posts — one line per attempt with the upstream URL
  // when available so the founder can jump straight to the live post.
  // Failed attempts surface their error so debugging stays in one place.
  lines.push("");
  if (recentPosts.length > 0) {
    lines.push("*Recent posts*");
    for (const p of recentPosts) {
      lines.push(formatMarketingPostLine(p));
    }
  } else {
    lines.push("_No posts published yet._ Use `publish post <topic>` to send one.");
  }

  // `dubaiDateString` is referenced so the import is non-decorative — and so
  // future formatters can sprinkle the date if needed without re-importing.
  void dubaiDateString;

  return lines.join("\n");
}

/**
 * One-line WhatsApp summary for a single `marketing_posts` row.
 * Exported so the scheduler's weekly brief job can render the same
 * format without re-running the formatter.
 */
export function formatMarketingPostLine(p: MarketingPost): string {
  const channel = p.channel ?? "unknown";
  const topic = (p.topic ?? "").slice(0, 60) || "(no topic)";
  if (p.status === "success") {
    const tail = p.externalUrl ? ` — ${p.externalUrl}` : "";
    return `• ✅ ${channel} · ${topic}${tail}`;
  }
  const detail = (p.error ?? "publish failed").slice(0, 120);
  return `• ❌ ${channel} · ${topic} — ${detail}`;
}

// ---------------------------------------------------------------------------
// WhatsApp command surface — invoked by the Manager Agent. Each helper
// returns the ready-to-send WhatsApp body.
// ---------------------------------------------------------------------------

export async function handleMarketingCommand(rawText: string): Promise<string> {
  const out = await formatMarketingReport();
  await logLlmCall({
    agentName: "manager",
    command: "marketing",
    inputPreview: rawText,
    outputPreview: out,
    tokensUsed: 0,
  });
  return out;
}

export async function handleCampaignUpdateCommand(rawText: string): Promise<string> {
  const parsed = parseCampaignUpdate(rawText);
  if (!parsed) {
    return [
      "Usage: `campaign update <name> ctr=X spend=Y conversions=Z`",
      "Example: `campaign update Ramadan2026 ctr=2.4 spend=850 conversions=12`",
    ].join("\n");
  }
  try {
    const row = await recordCampaignUpdate(parsed);
    await logLlmCall({
      agentName: "manager",
      command: "campaign_update",
      inputPreview: rawText,
      tokensUsed: 0,
    });
    return `✅ Logged *${row.campaignName}* — CTR ${Number(row.ctr).toFixed(2)}%, AED ${Number(row.spendAed).toFixed(0)} spend, ${row.conversions} conversions.`;
  } catch (err) {
    console.error("[companyOs.marketing] campaign update failed:", err);
    return "Couldn't save that campaign update — check the server logs.";
  }
}

export async function handleDraftPostCommand(rawText: string): Promise<string> {
  const topic = rawText.replace(/^draft\s+post\s*/i, "").trim();
  if (!topic) {
    return "Usage: `draft post <topic>`\nExample: `draft post Ramadan barter offers for restaurants`";
  }
  try {
    const post = await draftPost(topic);
    return post || "I couldn't draft a post — try again with a more specific topic.";
  } catch (err) {
    console.error("[companyOs.marketing] draft post failed:", err);
    return "Drafting failed (likely the AI budget gate). Try `costs` to see remaining budget.";
  }
}

// ---------------------------------------------------------------------------
// Auto-publish (Task #69) — draft + push through the configured
// socialPublishers connector.
//
// Task #86 — Confirmation step: by default `publish post <topic>` only
// drafts the post and asks the founder to confirm with `send` (within
// `MARKETING_PUBLISH_CONFIRM_TIMEOUT_MIN` minutes, default 10) before it
// actually goes live. Set `MARKETING_PUBLISH_REQUIRE_CONFIRMATION=false`
// to opt out and restore the previous one-tap auto-publish behaviour.
// The pending draft is parked in the existing `agentMemory` table so
// founder restarts / pod restarts don't lose it.
// ---------------------------------------------------------------------------

export interface PublishPostResult {
  topic: string;
  postBody: string;
  outcome: PublishOutcome;
}

const PUBLISH_CONFIRM_MEMORY_TYPE = "pending_publish";
const DEFAULT_CONFIRM_TIMEOUT_MIN = 10;

interface PendingPublishDraft {
  topic: string;
  postBody: string;
  expiresAt: string; // ISO timestamp
}

function publishConfirmationEnabled(): boolean {
  const raw = (process.env.MARKETING_PUBLISH_REQUIRE_CONFIRMATION ?? "true")
    .toString()
    .trim()
    .toLowerCase();
  return !["false", "0", "off", "no"].includes(raw);
}

function publishConfirmTimeoutMs(): number {
  const raw = Number(process.env.MARKETING_PUBLISH_CONFIRM_TIMEOUT_MIN);
  const minutes =
    Number.isFinite(raw) && raw > 0 ? Math.min(raw, 60 * 24) : DEFAULT_CONFIRM_TIMEOUT_MIN;
  return minutes * 60 * 1000;
}

function publishConfirmTimeoutMin(): number {
  return Math.round(publishConfirmTimeoutMs() / 60000);
}

/**
 * Identify the founder slot for confirmation state. We keep a single
 * key per env (the founder's WhatsApp number, or "default") so the
 * pending draft survives router restarts via the agentMemory table.
 */
function pendingPublishKey(senderId?: string): string {
  const id = (senderId || process.env.FOUNDER_WHATSAPP_NUMBER || "default").trim();
  // Strip the "whatsapp:" prefix Twilio uses so the key is more readable
  // in `memory` listings.
  return id.replace(/^whatsapp:/i, "") || "default";
}

export async function storePendingPublishDraft(
  senderId: string | undefined,
  topic: string,
  postBody: string,
): Promise<PendingPublishDraft> {
  const draft: PendingPublishDraft = {
    topic,
    postBody,
    expiresAt: new Date(Date.now() + publishConfirmTimeoutMs()).toISOString(),
  };
  // Surface persist failures (4KB memory cap, DB write error) so an
  // edit / tweak doesn't silently keep the OLD body parked.
  const result = await remember({
    agentName: AGENT,
    memoryType: PUBLISH_CONFIRM_MEMORY_TYPE,
    key: pendingPublishKey(senderId),
    value: draft,
    confidence: 1,
  });
  if (!result.ok) {
    throw new Error(`pending publish draft persist failed: ${result.reason}`);
  }
  return draft;
}

export async function getPendingPublishDraft(
  senderId?: string,
): Promise<PendingPublishDraft | null> {
  const row = await recallByKey(AGENT, PUBLISH_CONFIRM_MEMORY_TYPE, pendingPublishKey(senderId));
  if (!row) return null;
  const v = row.value as Partial<PendingPublishDraft> | null;
  if (!v || typeof v.postBody !== "string" || typeof v.expiresAt !== "string") return null;
  // Graceful timeout — expired drafts are ignored AND swept from storage
  // so the founder doesn't accidentally publish a stale draft after
  // replying `send` an hour later.
  if (Date.parse(v.expiresAt) <= Date.now()) {
    void clearPendingPublishDraft(senderId);
    return null;
  }
  return {
    topic: typeof v.topic === "string" ? v.topic : "",
    postBody: v.postBody,
    expiresAt: v.expiresAt,
  };
}

export async function clearPendingPublishDraft(senderId?: string): Promise<void> {
  // Typed delete so we only drop the `pending_publish` slot — never any
  // other memoryType that happens to share the same per-founder key.
  await forgetMemoryTyped(AGENT, PUBLISH_CONFIRM_MEMORY_TYPE, pendingPublishKey(senderId));
}

/**
 * Public-facing shape of a parked draft for the admin dashboard. Carries
 * the per-founder `senderId` (the agentMemory `key`, with the `whatsapp:`
 * prefix already stripped) so the UI can post `/send` and `/skip` for the
 * exact slot — important once we support more than one founder phone.
 */
export interface PendingPublishDraftListItem extends PendingPublishDraft {
  senderId: string;
}

/**
 * Enumerate every parked `publish post` draft so the founder can
 * see what's waiting from the admin dashboard (Task #112). Expired
 * drafts are filtered out AND swept from storage in the background
 * so the panel never advertises a draft you can no longer publish.
 */
export async function listPendingPublishDrafts(): Promise<PendingPublishDraftListItem[]> {
  const rows = await recall(AGENT, PUBLISH_CONFIRM_MEMORY_TYPE, 50);
  const now = Date.now();
  const out: PendingPublishDraftListItem[] = [];
  for (const row of rows) {
    const v = row.value as Partial<PendingPublishDraft> | null;
    if (!v || typeof v.postBody !== "string" || typeof v.expiresAt !== "string") {
      continue;
    }
    if (Date.parse(v.expiresAt) <= now) {
      // Fire-and-forget cleanup so the dashboard converges to a clean
      // state without paying a deletion round-trip per request.
      void forgetMemoryTyped(AGENT, PUBLISH_CONFIRM_MEMORY_TYPE, row.key);
      continue;
    }
    out.push({
      senderId: row.key,
      topic: typeof v.topic === "string" ? v.topic : "",
      postBody: v.postBody,
      expiresAt: v.expiresAt,
    });
  }
  // Soonest-to-expire first so the founder triages the most urgent draft
  // before it disappears.
  out.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
  return out;
}

export async function publishPostFromTopic(topic: string): Promise<PublishPostResult> {
  const cleanTopic = topic.trim();
  if (!cleanTopic) {
    return {
      topic: cleanTopic,
      postBody: "",
      outcome: { ok: false, reason: "publish_failed", detail: "Empty topic" },
    };
  }
  const postBody = await draftPost(cleanTopic);
  const outcome = await dispatchPublishPost(postBody);
  // Cost log so the founder sees publish attempts in `agents` / `costs`.
  await logLlmCall({
    agentName: AGENT,
    command: "publish_post",
    inputPreview: `topic=${cleanTopic.slice(0, 120)} channel=${outcome.ok ? outcome.channel : (outcome.channel ?? "none")}`,
    outputPreview: outcome.ok
      ? `published id=${outcome.externalId ?? "?"} url=${outcome.externalUrl ?? "?"}`
      : `${outcome.reason}: ${outcome.detail}`,
    tokensUsed: 0,
    status: outcome.ok ? "ok" : "error",
    errorMessage: outcome.ok ? null : outcome.detail.slice(0, 400),
  });
  // First-class record of the post for the dashboard / weekly brief.
  await recordPublishedPost({ topic: cleanTopic, postBody, outcome });
  return { topic: cleanTopic, postBody, outcome };
}

export async function handlePublishPostCommand(
  rawText: string,
  senderId?: string,
): Promise<string> {
  const topic = rawText.replace(/^publish\s+post\s*/i, "").trim();
  if (!topic) {
    const channels = getConfiguredChannels();
    const status =
      channels.length > 0
        ? `Configured: ${channels.join(", ")}.`
        : "No publisher configured. Set SOCIAL_PUBLISH_CHANNEL + matching credentials.";
    return [
      "Usage: `publish post <topic>`",
      "Example: `publish post Ramadan barter offers for restaurants`",
      status,
    ].join("\n");
  }

  // Confirmation flow (default ON) — draft the post, park it for the
  // founder, and return a preview with `send` / `skip` instructions
  // instead of publishing immediately. This is the safety net Task #86
  // adds so off-brand or factually wrong drafts don't go live before
  // the founder sees them.
  if (publishConfirmationEnabled()) {
    let postBody: string;
    try {
      postBody = await draftPost(topic);
    } catch (err) {
      console.error("[companyOs.marketing] publish post draft failed:", err);
      return "Drafting failed (likely the AI budget gate). Try `costs` to see remaining budget.";
    }
    if (!postBody) {
      return "I couldn't draft a post — try again with a more specific topic.";
    }
    try {
      await storePendingPublishDraft(senderId, topic, postBody);
    } catch (err) {
      console.error("[companyOs.marketing] storePendingPublishDraft failed:", err);
      // Fall through to a copy-paste reply — better than crashing.
      return [
        "📝 *Draft ready* (couldn't save the confirmation slot — copy/paste manually):",
        "",
        postBody,
      ].join("\n");
    }
    const channels = getConfiguredChannels();
    const channelLine =
      channels.length > 0
        ? `Will publish to: ${channels.join(", ")}.`
        : "No publisher configured yet — `send` will draft a copy-paste reply only.";
    return [
      `📝 *Draft for "${topic}"* — review before it goes live:`,
      "",
      postBody,
      "",
      `Reply *send* within ${publishConfirmTimeoutMin()} min to publish, *skip* to discard, or *edit <new body>* / *tweak <hint>* to iterate.`,
      channelLine,
    ].join("\n");
  }

  let result: PublishPostResult;
  try {
    result = await publishPostFromTopic(topic);
  } catch (err) {
    console.error("[companyOs.marketing] publish post failed:", err);
    return "Drafting failed (likely the AI budget gate). Try `costs` to see remaining budget.";
  }
  return formatPublishOutcomeReply(result);
}

/**
 * Render the WhatsApp body for a finished publish attempt — extracted so
 * both the legacy auto-publish path and the Task #86 confirmation path
 * (`send` reply) emit identical messages.
 */
function formatPublishOutcomeReply(result: PublishPostResult): string {
  const { postBody, outcome } = result;
  if (!outcome.ok) {
    if (outcome.reason === "not_configured") {
      return [
        "📝 *Drafted but not published* — no social publisher configured.",
        "",
        postBody,
        "",
        "Set `SOCIAL_PUBLISH_CHANNEL=buffer|linkedin|meta` and the matching credentials, then resend.",
      ].join("\n");
    }
    if (outcome.reason === "channel_unavailable") {
      return [
        `📝 *Drafted but not published* — ${outcome.detail}`,
        "",
        postBody,
      ].join("\n");
    }
    return [
      `❌ *Publish failed* on ${outcome.channel ?? "unknown"}: ${outcome.detail}`,
      "",
      "Draft (copy-paste backup):",
      postBody,
    ].join("\n");
  }
  const lines = [
    `✅ *Posted to ${outcome.channel}* — ${outcome.message}`,
  ];
  if (outcome.externalUrl) lines.push(outcome.externalUrl);
  lines.push("", postBody);
  return lines.join("\n");
}

/**
 * Handle the founder's `send` reply — publishes whatever draft is sitting
 * in the per-founder confirmation slot. Returns a friendly hint when no
 * draft is parked (or the slot has timed out). Idempotent: the slot is
 * cleared whether the publish succeeds or fails so a stale reply later
 * doesn't double-post.
 */
export async function handleConfirmPublishSend(senderId?: string): Promise<string> {
  const draft = await getPendingPublishDraft(senderId);
  if (!draft) {
    return [
      "No draft is waiting for confirmation.",
      `Drafts expire after ${publishConfirmTimeoutMin()} min — start a new one with \`publish post <topic>\`.`,
    ].join("\n");
  }
  // Clear up-front so a parallel `send` retry can't double-publish, and
  // a stored expired draft can't leak back if the publisher hangs.
  await clearPendingPublishDraft(senderId);
  const outcome = await dispatchPublishPost(draft.postBody);
  await logLlmCall({
    agentName: AGENT,
    command: "publish_post_confirmed",
    inputPreview: `topic=${draft.topic.slice(0, 120)} channel=${
      outcome.ok ? outcome.channel : outcome.channel ?? "none"
    }`,
    outputPreview: outcome.ok
      ? `published id=${outcome.externalId ?? "?"} url=${outcome.externalUrl ?? "?"}`
      : `${outcome.reason}: ${outcome.detail}`,
    tokensUsed: 0,
    status: outcome.ok ? "ok" : "error",
    errorMessage: outcome.ok ? null : outcome.detail.slice(0, 400),
  });
  // First-class record of the confirmed publish for the dashboard /
  // weekly brief — same row shape as the legacy auto-publish path.
  await recordPublishedPost({
    topic: draft.topic,
    postBody: draft.postBody,
    outcome,
  });
  return formatPublishOutcomeReply({
    topic: draft.topic,
    postBody: draft.postBody,
    outcome,
  });
}

// `[\s\S]+` lets the body span newlines so multi-line edits paste cleanly.
const EDIT_COMMAND_RE = /^edit(?:\s+([\s\S]+))?$/i;
const TWEAK_COMMAND_RE = /^tweak(?:\s+([\s\S]+))?$/i;

/**
 * Handle the founder's `edit <new body>` reply — replaces the parked
 * draft body and resets the confirmation expiry. Costs zero LLM tokens.
 */
export async function handleConfirmPublishEdit(
  rawText: string,
  senderId?: string,
): Promise<string> {
  const match = (rawText ?? "").trim().match(EDIT_COMMAND_RE);
  const newBody = (match?.[1] ?? "").trim();
  if (!newBody) {
    return "Usage: `edit <new body>` — replaces the parked draft. Example: `edit Hook line\\nValue prop\\nCTA #UAEBusiness`";
  }
  const draft = await getPendingPublishDraft(senderId);
  if (!draft) {
    return [
      "No draft is waiting to edit.",
      `Drafts expire after ${publishConfirmTimeoutMin()} min — start a new one with \`publish post <topic>\`.`,
    ].join("\n");
  }
  let updated: PendingPublishDraft;
  try {
    updated = await storePendingPublishDraft(senderId, draft.topic, newBody);
  } catch (err) {
    console.error("[companyOs.marketing] storePendingPublishDraft (edit) failed:", err);
    return [
      "❌ Couldn't save your edit — the original draft is still parked.",
      "Try a shorter body (4KB cap) or start fresh with `publish post <topic>`.",
    ].join("\n");
  }
  await logLlmCall({
    agentName: AGENT,
    command: "publish_post_edited",
    inputPreview: `topic=${draft.topic.slice(0, 120)} chars=${newBody.length}`,
    outputPreview: "draft replaced",
    tokensUsed: 0,
  });
  const channels = getConfiguredChannels();
  const channelLine =
    channels.length > 0
      ? `Will publish to: ${channels.join(", ")}.`
      : "No publisher configured yet — `send` will draft a copy-paste reply only.";
  return [
    `✏️ *Updated draft for "${draft.topic}"* — review again:`,
    "",
    updated.postBody,
    "",
    `Reply *send* within ${publishConfirmTimeoutMin()} min to publish, *skip* to discard, or *edit <new body>* / *tweak <hint>* to keep iterating.`,
    channelLine,
  ].join("\n");
}

const TWEAK_POST_SYSTEM = `You are the Marketing Agent for Bareter (UAE/GCC barter marketplace). Revise an existing draft social post using the founder's hint.

Constraints:
- Keep the same hard limits as the original draft: 220 characters total, hook + value prop + CTA + 3 hashtags on a final line.
- Preserve the original's intent unless the hint explicitly contradicts it.
- At least one hashtag must be UAE/GCC-specific (e.g. #UAEBusiness, #DubaiSME, #GCCBarter).
- No emoji at the very start (LinkedIn-friendly).
- Output ONLY the revised post text. No commentary, no quotes, no labels.`;

/**
 * Re-prompt the LLM with the parked draft + the founder's hint and
 * return the revised post body.
 */
export async function tweakPostDraft(
  topic: string,
  originalDraft: string,
  hint: string,
): Promise<string> {
  const memoryBlock = await buildAgentContext("marketing");
  const systemContent = memoryBlock
    ? `${memoryBlock}\n\n${TWEAK_POST_SYSTEM}`
    : TWEAK_POST_SYSTEM;
  const userContent = [
    `Topic: ${topic.slice(0, 200)}`,
    "",
    "Original draft:",
    originalDraft,
    "",
    `Founder's hint: ${hint.slice(0, 400)}`,
  ].join("\n");
  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
  const { content } = await chatCompletion(messages, {
    agentName: AGENT,
    command: "tweak_post",
    inputPreview: `topic=${topic.slice(0, 80)} hint=${hint.slice(0, 80)}`,
    model: DEFAULT_MODEL,
    temperature: 0.7,
    maxTokens: 200,
  });
  return content.trim();
}

/**
 * Handle the founder's `tweak <hint>` reply — re-prompts the LLM with
 * the original draft + hint, then re-parks the new version. Returns a
 * friendly hint when no draft is parked or when the LLM call fails
 * (e.g. budget gate triggered).
 */
export async function handleConfirmPublishTweak(
  rawText: string,
  senderId?: string,
): Promise<string> {
  const match = (rawText ?? "").trim().match(TWEAK_COMMAND_RE);
  const hint = (match?.[1] ?? "").trim();
  if (!hint) {
    return "Usage: `tweak <hint>` — re-roll the parked draft using your hint. Example: `tweak make it more urgent and add a discount angle`";
  }
  const draft = await getPendingPublishDraft(senderId);
  if (!draft) {
    return [
      "No draft is waiting to tweak.",
      `Drafts expire after ${publishConfirmTimeoutMin()} min — start a new one with \`publish post <topic>\`.`,
    ].join("\n");
  }
  let revised: string;
  try {
    revised = await tweakPostDraft(draft.topic, draft.postBody, hint);
  } catch (err) {
    console.error("[companyOs.marketing] tweakPostDraft failed:", err);
    return "Tweak failed (likely the AI budget gate). Try `costs` to see remaining budget. Your previous draft is still parked.";
  }
  if (!revised) {
    return "I couldn't generate a tweak — your previous draft is still parked. Try a more specific hint.";
  }
  let updated: PendingPublishDraft;
  try {
    updated = await storePendingPublishDraft(senderId, draft.topic, revised);
  } catch (err) {
    console.error("[companyOs.marketing] storePendingPublishDraft (tweak) failed:", err);
    return [
      "📝 *Tweaked draft* (couldn't save it — copy/paste manually):",
      "",
      revised,
    ].join("\n");
  }
  const channels = getConfiguredChannels();
  const channelLine =
    channels.length > 0
      ? `Will publish to: ${channels.join(", ")}.`
      : "No publisher configured yet — `send` will draft a copy-paste reply only.";
  return [
    `🔁 *Tweaked draft for "${draft.topic}"* — review again:`,
    "",
    updated.postBody,
    "",
    `Reply *send* within ${publishConfirmTimeoutMin()} min to publish, *skip* to discard, or *edit <new body>* / *tweak <hint>* to keep iterating.`,
    channelLine,
  ].join("\n");
}

/**
 * Handle the founder's `skip` reply — discard the parked draft.
 * Always returns a confirmation, including when no draft was waiting
 * (so a misfired `skip` doesn't fail silently).
 */
export async function handleConfirmPublishSkip(senderId?: string): Promise<string> {
  const draft = await getPendingPublishDraft(senderId);
  if (!draft) {
    return "No draft was waiting — nothing to skip.";
  }
  await clearPendingPublishDraft(senderId);
  await logLlmCall({
    agentName: AGENT,
    command: "publish_post_skipped",
    inputPreview: `topic=${draft.topic.slice(0, 120)}`,
    outputPreview: "skipped",
    tokensUsed: 0,
  });
  return `🗑️ Skipped the draft for "${draft.topic.slice(0, 120)}".`;
}

// ---------------------------------------------------------------------------
// Meta campaign performance auto-fetch (Task #69) — replaces the
// founder's manual `campaign update` for connected ad accounts. The
// manual command stays available as a fallback.
// ---------------------------------------------------------------------------

export async function runMetaCampaignSync() {
  return fetchCampaignInsights();
}
