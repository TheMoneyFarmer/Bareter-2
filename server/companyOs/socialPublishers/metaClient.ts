// Meta publisher + insights fetcher.
//
// Two surfaces here:
//   1. `publishViaMeta` — posts to Instagram (preferred) or a Facebook
//      page when no IG image URL is available. IG posts require a
//      media container so we build one with `META_PUBLISH_IMAGE_URL`,
//      then call `/media_publish`. Without an image we fall back to
//      `/<page-id>/feed` for an FB text post.
//   2. `fetchCampaignInsights` — pulls `/act_<id>/insights` at the
//      campaign level and upserts into `campaign_performance` so the
//      scheduler can replace the founder's manual `campaign update`
//      command for connected ad accounts. Manual capture stays as a
//      fallback for accounts not connected through Meta yet.
//
// All env reads are lazy; the module never throws on import.
//
// Required env (publish):
//   • META_ACCESS_TOKEN          — long-lived page/user token
//   • One of:
//       META_IG_USER_ID + META_PUBLISH_IMAGE_URL  — IG image post
//       META_PAGE_ID                              — FB page text post
//
// Required env (insights):
//   • META_ACCESS_TOKEN          — same token, also needs `ads_read`
//   • META_AD_ACCOUNT_ID         — numeric, without the `act_` prefix
//   • META_INSIGHTS_DATE_PRESET  — defaults to `yesterday`
//   • META_AD_CURRENCY           — `AED` (default) or `USD` to convert

import { db } from "../../db";
import { campaignPerformance, type CampaignPerformance } from "@shared/schema";
import { logLlmCall } from "../costTracker";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v19.0";
function graphBase(): string {
  // Read at call-time so test overrides work.
  return `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || GRAPH_VERSION}`;
}

export function isMetaConfigured(): boolean {
  // Configured only when there is at least one *publishable* surface
  // wired end-to-end. The dispatcher uses this to decide whether Meta
  // can be picked at all, so it must match what `publishViaMeta` will
  // accept at runtime:
  //   • IG image post   — token + META_IG_USER_ID + META_PUBLISH_IMAGE_URL
  //   • FB text post    — token + META_PAGE_ID
  // If only a token + IG_USER_ID are present (no image URL, no page),
  // `publishViaMeta` would fail with "set META_PUBLISH_IMAGE_URL or
  // META_PAGE_ID", so we report unconfigured here to keep dispatcher
  // selection honest.
  const hasToken = Boolean((process.env.META_ACCESS_TOKEN || "").trim());
  if (!hasToken) return false;
  const hasIg = Boolean((process.env.META_IG_USER_ID || "").trim());
  const hasImage = Boolean((process.env.META_PUBLISH_IMAGE_URL || "").trim());
  const hasPage = Boolean((process.env.META_PAGE_ID || "").trim());
  return (hasIg && hasImage) || hasPage;
}

export function isMetaInsightsConfigured(): boolean {
  return Boolean(
    (process.env.META_ACCESS_TOKEN || "").trim() &&
      (process.env.META_AD_ACCOUNT_ID || "").trim(),
  );
}

export interface MetaPublishResult {
  channel: "meta";
  externalId?: string;
  externalUrl?: string;
  message: string;
}

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message || text.slice(0, 200) || res.statusText;
    const err = new Error(`Meta API HTTP ${res.status}: ${msg}`) as Error & {
      status?: number;
      body?: unknown;
    };
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function publishViaMeta(text: string): Promise<MetaPublishResult> {
  const token = (process.env.META_ACCESS_TOKEN || "").trim();
  const igUser = (process.env.META_IG_USER_ID || "").trim();
  const pageId = (process.env.META_PAGE_ID || "").trim();
  if (!token || (!igUser && !pageId)) {
    throw new Error(
      "Meta not configured (META_ACCESS_TOKEN + one of META_IG_USER_ID / META_PAGE_ID required)",
    );
  }
  const imageUrl = (process.env.META_PUBLISH_IMAGE_URL || "").trim();
  // Prefer IG image post when both an IG user and an image URL are set.
  if (igUser && imageUrl) {
    // 1. Create the IG media container.
    const createUrl = `${graphBase()}/${encodeURIComponent(igUser)}/media`;
    const createRes = await fetchJson(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: imageUrl,
        caption: text,
        access_token: token,
      }).toString(),
    });
    const containerId = createRes?.id;
    if (!containerId) throw new Error("Meta: media container missing id");
    // 2. Publish.
    const publishUrl = `${graphBase()}/${encodeURIComponent(igUser)}/media_publish`;
    const pubRes = await fetchJson(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: String(containerId),
        access_token: token,
      }).toString(),
    });
    const mediaId = pubRes?.id;
    // The Graph API returns a numeric media id, not the shortcode used
    // in `instagram.com/p/<shortcode>` URLs — there's no reliable way
    // to construct a public URL from it without an extra fetch, so we
    // omit `externalUrl` and let the founder open Instagram directly.
    return {
      channel: "meta",
      externalId: mediaId,
      message: "Posted to Instagram.",
    };
  }
  // Fallback — Facebook page text post. Used when:
  //   • Only META_PAGE_ID is set (FB-only mode), or
  //   • IG user is set but no image URL was provided.
  if (!pageId) {
    throw new Error(
      "Meta: set META_PUBLISH_IMAGE_URL (for IG) or META_PAGE_ID (for FB text posts)",
    );
  }
  const url = `${graphBase()}/${encodeURIComponent(pageId)}/feed`;
  const res = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message: text, access_token: token }).toString(),
  });
  return {
    channel: "meta",
    externalId: res?.id,
    externalUrl: res?.id
      ? `https://www.facebook.com/${encodeURIComponent(String(res.id))}`
      : undefined,
    message: "Posted to Facebook page.",
  };
}

// ---------------------------------------------------------------------------
// Campaign insights — Marketing API → campaign_performance upsert
// ---------------------------------------------------------------------------

export interface MetaInsightAction {
  action_type: string;
  value: string;
}

export interface MetaInsightRow {
  campaign_id: string;
  campaign_name: string;
  ctr?: string;
  spend?: string;
  actions?: MetaInsightAction[];
  conversions?: string;
}

export interface MetaInsightFetchResult {
  scanned: number;
  upserted: number;
  errors: string[];
  rows: CampaignPerformance[];
  skipped?: "not_configured";
}

const CONVERSION_ACTION_TYPES = new Set([
  "purchase",
  "offsite_conversion",
  "lead",
  "complete_registration",
  "app_install",
  "onsite_conversion.lead_grouped",
]);

function extractConversions(row: MetaInsightRow): number {
  if (row.conversions != null && row.conversions !== "") {
    const n = Number(row.conversions);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  let total = 0;
  for (const a of row.actions || []) {
    if (CONVERSION_ACTION_TYPES.has(a.action_type)) {
      const n = Number(a.value);
      if (Number.isFinite(n)) total += n;
    }
  }
  return Math.max(0, Math.round(total));
}

function spendToAed(rawSpend: number): number {
  // Meta returns spend in the ad account's billing currency. Most UAE
  // accounts run in AED — set META_AD_CURRENCY=USD to convert via the
  // platform-wide rate.
  const cur = (process.env.META_AD_CURRENCY || "AED").toUpperCase();
  if (cur === "AED") return rawSpend;
  if (cur === "USD") {
    const rate = Number(process.env.USD_TO_AED_RATE || "3.6725");
    return rawSpend * (Number.isFinite(rate) && rate > 0 ? rate : 3.6725);
  }
  return rawSpend;
}

export async function fetchCampaignInsights(): Promise<MetaInsightFetchResult> {
  if (!isMetaInsightsConfigured()) {
    return {
      scanned: 0,
      upserted: 0,
      errors: [],
      rows: [],
      skipped: "not_configured",
    };
  }
  const token = (process.env.META_ACCESS_TOKEN || "").trim();
  const account = (process.env.META_AD_ACCOUNT_ID || "").trim();
  const datePreset = (process.env.META_INSIGHTS_DATE_PRESET || "yesterday").trim();

  const params = new URLSearchParams({
    access_token: token,
    level: "campaign",
    date_preset: datePreset,
    fields: "campaign_id,campaign_name,ctr,spend,actions,conversions",
    limit: "200",
  });
  const firstUrl = `${graphBase()}/act_${encodeURIComponent(account)}/insights?${params.toString()}`;

  // Walk Meta's cursor-based paging (`paging.next`) so accounts with
  // more than one page of campaigns are fully synced. Cap the page
  // count so a misbehaving cursor can't loop forever.
  const data: MetaInsightRow[] = [];
  let nextUrl: string | null = firstUrl;
  const MAX_PAGES = 25;
  for (let page = 0; page < MAX_PAGES && nextUrl; page++) {
    let payload: {
      data?: MetaInsightRow[];
      error?: { message?: string };
      paging?: { next?: string };
    } = {};
    try {
      const res = await fetch(nextUrl);
      const text = await res.text();
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = {} as typeof payload;
      }
      if (!res.ok) {
        const msg = payload?.error?.message || text.slice(0, 200) || res.statusText;
        throw new Error(`Meta insights HTTP ${res.status}: ${msg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logLlmCall({
        agentName: "marketing",
        command: "meta_insights_fetch",
        inputPreview: `account=${account} preset=${datePreset}`,
        tokensUsed: 0,
        status: "error",
        errorMessage: msg.slice(0, 400),
      });
      return { scanned: 0, upserted: 0, errors: [msg], rows: [] };
    }
    if (Array.isArray(payload?.data)) data.push(...payload.data!);
    nextUrl = payload?.paging?.next || null;
  }

  const rows: CampaignPerformance[] = [];
  const errors: string[] = [];

  for (const row of data) {
    const name = (row.campaign_name || "").trim();
    if (!name) continue;
    const ctrNum = Number(row.ctr || 0);
    const spendRaw = Number(row.spend || 0);
    const spendAed = spendToAed(Number.isFinite(spendRaw) ? spendRaw : 0);
    const conversions = extractConversions(row);
    const note = `auto-fetch ${datePreset} (campaign_id=${row.campaign_id ?? "?"})`;
    try {
      const inserted = await db
        .insert(campaignPerformance)
        .values({
          campaignName: name.slice(0, 120),
          channel: "meta",
          ctr: (Number.isFinite(ctrNum) ? ctrNum : 0).toFixed(2),
          spendAed: spendAed.toFixed(2),
          conversions,
          notes: note,
        })
        .onConflictDoUpdate({
          target: campaignPerformance.campaignName,
          set: {
            channel: "meta",
            ctr: (Number.isFinite(ctrNum) ? ctrNum : 0).toFixed(2),
            spendAed: spendAed.toFixed(2),
            conversions,
            notes: note,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (inserted[0]) rows.push(inserted[0]);
    } catch (err) {
      errors.push(
        `${name}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 400),
      );
    }
  }

  await logLlmCall({
    agentName: "marketing",
    command: "meta_insights_fetch",
    inputPreview: `account=${account} preset=${datePreset}`,
    outputPreview: `scanned=${data.length} upserted=${rows.length} errors=${errors.length}`,
    tokensUsed: 0,
    status: errors.length > 0 ? "error" : "ok",
    errorMessage: errors[0]?.slice(0, 400) || null,
  });

  return { scanned: data.length, upserted: rows.length, errors, rows };
}
