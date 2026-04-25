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
// What this DOES NOT do (and why):
//   • No Buffer / Meta / Instagram / TikTok auto-posting — the founder
//     does not yet have those API credentials. Once they do, plug in a
//     single connector file (`bufferClient.ts`, `metaClient.ts`, …) that
//     calls `draftPost` and posts the result. No schema change required.
//   • No Meta Graph campaign-performance pull — same reason. The manual
//     `campaign update` command keeps the metrics flowing in the meantime.

import { and, gte, eq, count, desc, sql as drizzleSql } from "drizzle-orm";
import { jsPDF } from "jspdf";
import { db } from "../db";
import {
  posts,
  listings,
  contentBriefs,
  campaignPerformance,
  type ContentBrief,
  type CampaignPerformance,
} from "@shared/schema";
import { jsonCompletion, chatCompletion, type ChatMessage } from "../agents/llm";
import { logLlmCall, DEFAULT_MODEL } from "./costTracker";
import { uploadPrivateBuffer, getSignedDownloadUrl } from "./objectStorageHelpers";
import { dubaiDateString } from "./financeAgent";
import { buildAgentContext, rememberInBackground } from "./memoryAgent";

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
  const [latest, recent] = await Promise.all([getLatestBrief(), getRecentCampaigns(3)]);
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

  // `dubaiDateString` is referenced so the import is non-decorative — and so
  // future formatters can sprinkle the date if needed without re-importing.
  void dubaiDateString;

  return lines.join("\n");
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
