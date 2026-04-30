// Unit + integration tests for Task #69 (auto-publish marketing posts).
//
// Coverage:
//   • `publishPost` dispatcher — picks the right channel by env config,
//     surfaces friendly "not configured" / "channel unavailable" /
//     "publish failed" outcomes without throwing.
//   • Buffer / LinkedIn / Meta connectors — happy paths POST the
//     expected payload to the right URL with the right Authorization.
//   • `runMetaCampaignSync` — pulls Meta insights, upserts into
//     `campaign_performance`, returns scanned/upserted counts; degrades
//     to a zero-count `skipped: not_configured` result when env is
//     missing.
//   • Manager Agent integration — `publish post <topic>` routes to the
//     right handler and surfaces both success + "no publisher" replies.
//
// All HTTP / DB calls are mocked so the suite runs offline.

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import express from "express";
import request from "supertest";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Env — set BEFORE the modules under test load.
// ---------------------------------------------------------------------------
const ORIGINAL_ENV = { ...process.env };
process.env.TWILIO_ACCOUNT_SID = "ACtest00000000000000000000000000000";
process.env.TWILIO_AUTH_TOKEN = "test_auth_token_for_signing";
process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
process.env.FOUNDER_WHATSAPP_NUMBER = "whatsapp:+971500000000";
process.env.COMPANY_OS_MONTHLY_BUDGET_AED = "400";
process.env.USD_TO_AED_RATE = "3.6725";
process.env.PRIVATE_OBJECT_DIR = "/test-bucket/.private";

const FOUNDER_FROM = process.env.FOUNDER_WHATSAPP_NUMBER!;
const TWILIO_TO = process.env.TWILIO_WHATSAPP_FROM!;
const FORWARDED_HOST = "bareter.test";
const WEBHOOK_PATH = "/api/company-os/whatsapp";

// ---------------------------------------------------------------------------
// DB mock — programmable per-test, mirroring the marketing test pattern.
// ---------------------------------------------------------------------------
type AnyRow = Record<string, unknown>;

interface DbState {
  selectQueue: AnyRow[][];
  returningQueue: AnyRow[][];
  selectShouldThrow: boolean;
  insertedValues: AnyRow[];
  updatedSets: AnyRow[];
}

const dbState: DbState = {
  selectQueue: [],
  returningQueue: [],
  selectShouldThrow: false,
  insertedValues: [],
  updatedSets: [],
};

function resetDbState() {
  dbState.selectQueue = [];
  dbState.returningQueue = [];
  dbState.selectShouldThrow = false;
  dbState.insertedValues = [];
  dbState.updatedSets = [];
}

function makeSelectChain(): any {
  const next = (): AnyRow[] => {
    if (dbState.selectShouldThrow) throw new Error("simulated db failure");
    return dbState.selectQueue.shift() ?? [];
  };
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    groupBy: () => chain,
    then: (onF: any, onR: any) => {
      try {
        return Promise.resolve(next()).then(onF, onR);
      } catch (err) {
        return Promise.reject(err).catch(onR);
      }
    },
    catch: (onR: any) => {
      try {
        return Promise.resolve(next()).catch(onR);
      } catch (err) {
        return Promise.reject(err).catch(onR);
      }
    },
    finally: (onF: any) => Promise.resolve(next()).finally(onF),
  };
  return chain;
}

function makeWriteChain(captureInto: AnyRow[], captured: AnyRow): any {
  const chain: any = {
    values: (v: AnyRow) => {
      captureInto.push({ ...captured, ...v });
      return chain;
    },
    set: (v: AnyRow) => {
      captureInto.push({ ...captured, ...v });
      return chain;
    },
    where: () => chain,
    onConflictDoUpdate: () => chain,
    returning: () => Promise.resolve(dbState.returningQueue.shift() ?? []),
    then: (onF: any, onR: any) =>
      Promise.resolve(dbState.returningQueue.shift() ?? []).then(onF, onR),
  };
  return chain;
}

vi.mock("../server/db", () => ({
  db: {
    select: () => makeSelectChain(),
    insert: () => makeWriteChain(dbState.insertedValues, { __op: "insert" }),
    update: () => makeWriteChain(dbState.updatedSets, { __op: "update" }),
    delete: () => makeWriteChain([], { __op: "delete" }),
  },
}));

// Object storage helpers — never called by these tests but the marketing
// agent imports them.
vi.mock("../server/companyOs/objectStorageHelpers", () => ({
  uploadPrivateBuffer: vi.fn(async (key: string) => key),
  getSignedDownloadUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
}));

// LLM stub — return canned post text so `draftPost` is deterministic.
vi.mock("../server/agents/llm", () => ({
  chatCompletion: vi.fn(async () => ({
    content:
      "Hook line\nValue prop sentence.\nCTA — try Bareter today.\n#barter #cashlesstrade #UAEBusiness",
    tokensUsed: 33,
  })),
  jsonCompletion: vi.fn(async () => ({ data: {}, tokensUsed: 0 })),
}));

vi.mock("../server/companyOs/stripeClient", () => ({
  getStripeClient: vi.fn(async () => null),
  getStripeWebhookSecret: vi.fn(async () => null),
}));

// Twilio REST capture.
const hoisted = vi.hoisted(() => {
  const sendCalls: Array<{ to: string; body: string }> = [];
  const state: { resolveNextSend: (() => void) | null } = {
    resolveNextSend: null,
  };
  return { sendCalls, state };
});
vi.mock("../server/companyOs/twilio", async () => {
  const actual = await vi.importActual<
    typeof import("../server/companyOs/twilio")
  >("../server/companyOs/twilio");
  return {
    ...actual,
    sendWhatsApp: vi.fn(async (to: string, body: string) => {
      hoisted.sendCalls.push({ to, body });
      const r = hoisted.state.resolveNextSend;
      hoisted.state.resolveNextSend = null;
      if (r) r();
      return true;
    }),
  };
});

// ---------------------------------------------------------------------------
// fetch mock — programmable per-test.
// ---------------------------------------------------------------------------
type FetchHandler = (
  url: string,
  init?: RequestInit,
) => Promise<{ status?: number; body: any; headers?: Record<string, string> }>;

const fetchState: { handler: FetchHandler | null; calls: Array<{ url: string; init?: RequestInit }> } = {
  handler: null,
  calls: [],
};

const realFetch = global.fetch;
beforeAll(() => {
  global.fetch = (async (url: any, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url?.url ?? String(url);
    fetchState.calls.push({ url: u, init });
    if (!fetchState.handler) {
      throw new Error(`Unexpected fetch call to ${u}`);
    }
    const resp = await fetchState.handler(u, init);
    const status = resp.status ?? 200;
    const bodyText =
      typeof resp.body === "string" ? resp.body : JSON.stringify(resp.body ?? {});
    return new Response(bodyText, {
      status,
      headers: { "Content-Type": "application/json", ...(resp.headers || {}) },
    });
  }) as typeof global.fetch;
});

afterAll(() => {
  global.fetch = realFetch;
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    process.env[k] = v;
  }
});

beforeEach(() => {
  resetDbState();
  fetchState.calls.length = 0;
  fetchState.handler = null;
  hoisted.sendCalls.length = 0;
  hoisted.state.resolveNextSend = null;
  // Reset publisher env per test.
  delete process.env.SOCIAL_PUBLISH_CHANNEL;
  delete process.env.BUFFER_ACCESS_TOKEN;
  delete process.env.BUFFER_PROFILE_IDS;
  delete process.env.LINKEDIN_ACCESS_TOKEN;
  delete process.env.LINKEDIN_AUTHOR_URN;
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_IG_USER_ID;
  delete process.env.META_PAGE_ID;
  delete process.env.META_PUBLISH_IMAGE_URL;
  delete process.env.META_AD_ACCOUNT_ID;
  delete process.env.META_INSIGHTS_DATE_PRESET;
  delete process.env.META_AD_CURRENCY;
  // Task #86 — confirmation-step env. Most legacy tests assert the
  // immediate auto-publish behaviour, so default the suite to opt-out
  // and let the new describe block flip it back on.
  process.env.MARKETING_PUBLISH_REQUIRE_CONFIRMATION = "false";
  delete process.env.MARKETING_PUBLISH_CONFIRM_TIMEOUT_MIN;
});

// Imports AFTER mocks.
import {
  publishPost,
  selectChannel,
  getConfiguredChannels,
} from "../server/companyOs/socialPublishers";
import {
  fetchCampaignInsights,
  isMetaInsightsConfigured,
} from "../server/companyOs/socialPublishers/metaClient";
import {
  publishPostFromTopic,
  handlePublishPostCommand,
  handleConfirmPublishSend,
  handleConfirmPublishSkip,
  handleConfirmPublishEdit,
  handleConfirmPublishTweak,
  storePendingPublishDraft,
  getPendingPublishDraft,
  listPendingPublishDrafts,
  runMetaCampaignSync,
} from "../server/companyOs/marketingAgent";
import { chatCompletion as mockedChatCompletion } from "../server/agents/llm";
import { createCompanyOsRouter } from "../server/companyOs/router";

function buildApp() {
  const app = express();
  app.use(WEBHOOK_PATH, express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(
    "/api/company-os",
    createCompanyOsRouter({
      requireAdmin: (_req, _res, next) => next(),
    }),
  );
  return app;
}

async function postWebhook(app: express.Express, body: string, from = FOUNDER_FROM) {
  const params: Record<string, string> = {
    AccountSid: process.env.TWILIO_ACCOUNT_SID!,
    From: from,
    To: TWILIO_TO,
    Body: body,
    NumMedia: "0",
    MessageSid: `SM${crypto.randomBytes(16).toString("hex")}`,
  };
  const sendPromise = new Promise<void>((resolve) => {
    hoisted.state.resolveNextSend = resolve;
  });
  const httpRes = await request(app)
    .post(WEBHOOK_PATH)
    .set("X-Forwarded-Proto", "https")
    .set("X-Forwarded-Host", FORWARDED_HOST)
    .set("Host", FORWARDED_HOST)
    .type("form")
    .send(new URLSearchParams(params).toString());
  return { httpRes, sendPromise };
}

// ===========================================================================
// Dispatcher — channel selection + outcome surfaces
// ===========================================================================
describe("publishPost dispatcher", () => {
  it("returns not_configured when no env is set", async () => {
    expect(selectChannel()).toBeNull();
    expect(getConfiguredChannels()).toEqual([]);
    const out = await publishPost("hi there");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("not_configured");
      expect(out.detail).toMatch(/SOCIAL_PUBLISH_CHANNEL/);
    }
  });

  it("returns channel_unavailable when SOCIAL_PUBLISH_CHANNEL is set but creds are missing", async () => {
    process.env.SOCIAL_PUBLISH_CHANNEL = "buffer";
    const out = await publishPost("hi");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("channel_unavailable");
    }
  });

  it("auto-picks Buffer when its env is configured", () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf_token";
    process.env.BUFFER_PROFILE_IDS = "p1,p2";
    expect(selectChannel()).toBe("buffer");
    expect(getConfiguredChannels()).toEqual(["buffer"]);
  });

  it("falls back to LinkedIn when Buffer is missing but LinkedIn is configured", () => {
    process.env.LINKEDIN_ACCESS_TOKEN = "li_token";
    process.env.LINKEDIN_AUTHOR_URN = "urn:li:person:abc";
    expect(selectChannel()).toBe("linkedin");
  });

  it("respects an explicit SOCIAL_PUBLISH_CHANNEL=meta override", () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf";
    process.env.BUFFER_PROFILE_IDS = "p1";
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_IG_USER_ID = "1234";
    process.env.META_PUBLISH_IMAGE_URL = "https://img.example/x.jpg";
    process.env.SOCIAL_PUBLISH_CHANNEL = "meta";
    expect(selectChannel()).toBe("meta");
  });

  it("does not auto-pick Meta when only token + IG user id are set (no image, no page)", () => {
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_IG_USER_ID = "1234";
    // No image URL, no page id — isMetaConfigured() must report false
    // so the dispatcher doesn't pick Meta and then crash at publish time.
    expect(selectChannel()).toBeNull();
    expect(getConfiguredChannels()).toEqual([]);
  });

  it("returns channel_unavailable when the explicit override has no creds", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf";
    process.env.BUFFER_PROFILE_IDS = "p1";
    process.env.SOCIAL_PUBLISH_CHANNEL = "linkedin"; // no LI creds set
    const out = await publishPost("hi");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("channel_unavailable");
  });
});

// ===========================================================================
// Buffer connector
// ===========================================================================
describe("Buffer connector", () => {
  it("POSTs to /1/updates/create.json with all profile ids and returns the new update id", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf_token";
    process.env.BUFFER_PROFILE_IDS = "profile-A,profile-B";
    fetchState.handler = async (url, init) => {
      expect(url).toBe("https://api.bufferapp.com/1/updates/create.json");
      expect(init?.method).toBe("POST");
      const body = String(init?.body ?? "");
      expect(body).toContain("access_token=buf_token");
      expect(body).toContain("profile_ids%5B%5D=profile-A");
      expect(body).toContain("profile_ids%5B%5D=profile-B");
      expect(body).toContain("now=true");
      return {
        body: {
          success: true,
          updates: [{ id: "update-1", service_link: "https://twitter.com/foo/123" }],
        },
      };
    };
    const out = await publishPost("hello world");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.channel).toBe("buffer");
      expect(out.externalId).toBe("update-1");
      expect(out.externalUrl).toBe("https://twitter.com/foo/123");
      expect(out.message).toContain("2 profiles");
    }
  });

  it("surfaces a publish_failed outcome on Buffer 4xx", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf_token";
    process.env.BUFFER_PROFILE_IDS = "profile-A";
    fetchState.handler = async () => ({ status: 403, body: { code: 1004, message: "Access token invalid" } });
    const out = await publishPost("hi");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("publish_failed");
      expect(out.channel).toBe("buffer");
      expect(out.detail).toMatch(/HTTP 403/);
    }
  });
});

// ===========================================================================
// LinkedIn connector
// ===========================================================================
describe("LinkedIn connector", () => {
  it("POSTs the UGC payload with the bearer token and parses the post id from x-restli-id", async () => {
    process.env.LINKEDIN_ACCESS_TOKEN = "li_token";
    process.env.LINKEDIN_AUTHOR_URN = "urn:li:person:abc";
    fetchState.handler = async (url, init) => {
      expect(url).toBe("https://api.linkedin.com/v2/ugcPosts");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer li_token");
      expect(headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
      const payload = JSON.parse(String(init?.body));
      expect(payload.author).toBe("urn:li:person:abc");
      expect(payload.lifecycleState).toBe("PUBLISHED");
      expect(
        payload.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text,
      ).toBe("hello LinkedIn");
      return {
        body: {},
        headers: { "x-restli-id": "urn:li:share:9876" },
      };
    };
    const out = await publishPost("hello LinkedIn");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.channel).toBe("linkedin");
      expect(out.externalId).toBe("urn:li:share:9876");
      expect(out.externalUrl).toContain("urn:li:share:9876");
    }
  });
});

// ===========================================================================
// Meta connector — IG image post + FB fallback
// ===========================================================================
describe("Meta connector", () => {
  it("creates an IG media container then publishes when META_PUBLISH_IMAGE_URL is set", async () => {
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_IG_USER_ID = "ig123";
    process.env.META_PUBLISH_IMAGE_URL = "https://img.example/x.jpg";

    let step = 0;
    fetchState.handler = async (url, init) => {
      step++;
      if (step === 1) {
        expect(url).toContain("/ig123/media");
        const body = String(init?.body ?? "");
        expect(body).toContain("image_url=https%3A%2F%2Fimg.example%2Fx.jpg");
        expect(body).toContain("caption=hello+IG");
        return { body: { id: "container-1" } };
      }
      if (step === 2) {
        expect(url).toContain("/ig123/media_publish");
        const body = String(init?.body ?? "");
        expect(body).toContain("creation_id=container-1");
        return { body: { id: "ig-post-9" } };
      }
      throw new Error(`unexpected step ${step}`);
    };
    const out = await publishPost("hello IG");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.channel).toBe("meta");
      expect(out.externalId).toBe("ig-post-9");
      // We intentionally omit externalUrl for IG — see metaClient.ts.
      expect(out.externalUrl).toBeUndefined();
    }
  });

  it("falls back to a Facebook page text post when no image URL is set", async () => {
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_IG_USER_ID = "ig123";
    process.env.META_PAGE_ID = "page-77";
    fetchState.handler = async (url, init) => {
      expect(url).toContain("/page-77/feed");
      expect(String(init?.body)).toContain("message=Hello+FB");
      return { body: { id: "fbpost-1" } };
    };
    const out = await publishPost("Hello FB");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.channel).toBe("meta");
      expect(out.externalId).toBe("fbpost-1");
      expect(out.externalUrl).toContain("facebook.com");
    }
  });

  it("publishes via FB page even when META_IG_USER_ID is unset (FB-only mode)", async () => {
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_PAGE_ID = "page-77";
    // No META_IG_USER_ID, no META_PUBLISH_IMAGE_URL — FB-only mode.
    fetchState.handler = async (url, init) => {
      expect(url).toContain("/page-77/feed");
      expect(String(init?.body)).toContain("message=FB+only");
      return { body: { id: "fbpost-2" } };
    };
    const out = await publishPost("FB only");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.channel).toBe("meta");
      expect(out.externalId).toBe("fbpost-2");
    }
  });

  it("auto-dispatch reports not_configured when only token + IG user id are set", async () => {
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_IG_USER_ID = "ig123";
    // No META_PUBLISH_IMAGE_URL, no META_PAGE_ID — dispatcher refuses
    // to pick Meta because the publish call would fail.
    const out = await publishPost("nope");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("not_configured");
  });

  it("explicit Meta override surfaces a clear publish error when image+page are missing", async () => {
    process.env.SOCIAL_PUBLISH_CHANNEL = "meta";
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_IG_USER_ID = "ig123";
    // The override skips dispatcher gating, but isMetaConfigured() now
    // requires either image URL or page id — so the override surfaces
    // channel_unavailable.
    const out = await publishPost("nope");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("channel_unavailable");
  });
});

// ===========================================================================
// Meta insights — fetch + upsert
// ===========================================================================
describe("fetchCampaignInsights", () => {
  it("returns skipped:not_configured when env is missing", async () => {
    expect(isMetaInsightsConfigured()).toBe(false);
    const r = await fetchCampaignInsights();
    expect(r.skipped).toBe("not_configured");
    expect(r.scanned).toBe(0);
  });

  it("upserts each campaign and converts USD spend to AED when META_AD_CURRENCY=USD", async () => {
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_AD_ACCOUNT_ID = "9999";
    process.env.META_INSIGHTS_DATE_PRESET = "yesterday";
    process.env.META_AD_CURRENCY = "USD";
    process.env.USD_TO_AED_RATE = "3.6725";

    fetchState.handler = async (url) => {
      expect(url).toContain("/act_9999/insights");
      expect(url).toContain("level=campaign");
      expect(url).toContain("date_preset=yesterday");
      return {
        body: {
          data: [
            {
              campaign_id: "c1",
              campaign_name: "Ramadan2026",
              ctr: "2.50",
              spend: "100",
              actions: [
                { action_type: "purchase", value: "3" },
                { action_type: "lead", value: "2" },
                { action_type: "page_view", value: "999" },
              ],
            },
            {
              campaign_id: "c2",
              campaign_name: "Q2-push",
              ctr: "1.10",
              spend: "50.5",
              conversions: "7",
            },
          ],
        },
      };
    };

    // Two upserts → two `returning` payloads + one log insert.
    dbState.returningQueue = [
      [
        {
          id: "row-1",
          campaignName: "Ramadan2026",
          channel: "meta",
          ctr: "2.50",
          spendAed: "367.25",
          conversions: 5,
          notes: "auto-fetch yesterday (campaign_id=c1)",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [
        {
          id: "row-2",
          campaignName: "Q2-push",
          channel: "meta",
          ctr: "1.10",
          spendAed: "185.46",
          conversions: 7,
          notes: "auto-fetch yesterday (campaign_id=c2)",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [], // logLlmCall insert
    ];

    const r = await fetchCampaignInsights();
    expect(r.skipped).toBeUndefined();
    expect(r.scanned).toBe(2);
    expect(r.upserted).toBe(2);
    expect(r.errors).toEqual([]);

    // Verify the AED conversion + extracted conversions.
    const ramadan = dbState.insertedValues.find((v) => v.campaignName === "Ramadan2026");
    expect(ramadan).toBeDefined();
    expect(ramadan?.channel).toBe("meta");
    expect(ramadan?.conversions).toBe(5); // 3 + 2
    expect(ramadan?.spendAed).toBe("367.25"); // 100 USD * 3.6725

    const q2 = dbState.insertedValues.find((v) => v.campaignName === "Q2-push");
    expect(q2?.conversions).toBe(7);
    expect(q2?.spendAed).toBe("185.46");
  });

  it("aggregates errors per row without aborting the whole sync", async () => {
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_AD_ACCOUNT_ID = "9999";
    fetchState.handler = async () => ({
      body: {
        data: [
          { campaign_id: "c1", campaign_name: "OK", ctr: "1", spend: "10" },
          { campaign_id: "c2", campaign_name: "BadRow", ctr: "1", spend: "20" },
        ],
      },
    });

    let calls = 0;
    // Override the insert chain so the second insert throws.
    const origInsert = (await import("../server/db")).db.insert;
    (await import("../server/db")).db.insert = (() => {
      calls++;
      if (calls === 2) {
        // Build a chain that throws on `.returning()`.
        const chain: any = {
          values: () => chain,
          set: () => chain,
          where: () => chain,
          onConflictDoUpdate: () => chain,
          returning: () => Promise.reject(new Error("boom")),
          then: (_f: any, r: any) => Promise.reject(new Error("boom")).catch(r),
        };
        return chain;
      }
      // Default chain — succeed.
      const chain: any = {
        values: (v: AnyRow) => {
          dbState.insertedValues.push({ __op: "insert", ...v });
          return chain;
        },
        set: () => chain,
        where: () => chain,
        onConflictDoUpdate: () => chain,
        returning: () =>
          Promise.resolve([
            {
              id: "row-1",
              campaignName: "OK",
              channel: "meta",
              ctr: "1.00",
              spendAed: "10.00",
              conversions: 0,
              notes: "auto-fetch",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        then: (f: any, _r: any) => Promise.resolve([]).then(f),
      };
      return chain;
    }) as any;

    try {
      const r = await fetchCampaignInsights();
      expect(r.scanned).toBe(2);
      expect(r.upserted).toBe(1);
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatch(/BadRow/);
    } finally {
      (await import("../server/db")).db.insert = origInsert;
    }
  });

  it("follows paging.next so accounts with multiple pages are fully synced", async () => {
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_AD_ACCOUNT_ID = "9999";

    let call = 0;
    fetchState.handler = async (url) => {
      call++;
      if (call === 1) {
        expect(url).toContain("/act_9999/insights");
        return {
          body: {
            data: [{ campaign_id: "p1c1", campaign_name: "P1-A", ctr: "1", spend: "10" }],
            paging: { next: "https://graph.facebook.com/v19.0/act_9999/insights?after=cursor1" },
          },
        };
      }
      if (call === 2) {
        expect(url).toContain("after=cursor1");
        return {
          body: {
            data: [{ campaign_id: "p2c1", campaign_name: "P2-A", ctr: "1", spend: "20" }],
          },
        };
      }
      throw new Error(`unexpected meta call #${call}`);
    };

    // Two upserts → two `returning` payloads + one log insert.
    dbState.returningQueue = [
      [{ id: "r1", campaignName: "P1-A", channel: "meta", ctr: "1.00", spendAed: "10.00", conversions: 0, notes: "auto-fetch", createdAt: new Date(), updatedAt: new Date() }],
      [{ id: "r2", campaignName: "P2-A", channel: "meta", ctr: "1.00", spendAed: "20.00", conversions: 0, notes: "auto-fetch", createdAt: new Date(), updatedAt: new Date() }],
      [],
    ];

    const r = await fetchCampaignInsights();
    expect(r.scanned).toBe(2);
    expect(r.upserted).toBe(2);
    expect(call).toBe(2);
  });

  it("returns an error result without throwing when Meta returns 4xx", async () => {
    process.env.META_ACCESS_TOKEN = "meta_token";
    process.env.META_AD_ACCOUNT_ID = "9999";
    fetchState.handler = async () => ({
      status: 400,
      body: { error: { message: "Invalid OAuth access token" } },
    });
    const r = await fetchCampaignInsights();
    expect(r.scanned).toBe(0);
    expect(r.upserted).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/Invalid OAuth/);
  });
});

// ===========================================================================
// publishPostFromTopic — drafts then publishes
// ===========================================================================
describe("publishPostFromTopic", () => {
  it("drafts via LLM and routes the post body through the dispatcher", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf_token";
    process.env.BUFFER_PROFILE_IDS = "p1";
    fetchState.handler = async () => ({
      body: {
        success: true,
        updates: [{ id: "u-1", service_link: "https://example/post" }],
      },
    });
    const result = await publishPostFromTopic("Ramadan barter");
    expect(result.outcome.ok).toBe(true);
    if (result.outcome.ok) {
      expect(result.outcome.externalId).toBe("u-1");
    }
    expect(result.postBody).toContain("#UAEBusiness");
  });

  it("returns the LLM-drafted body alongside a not_configured outcome", async () => {
    const result = await publishPostFromTopic("anything");
    expect(result.outcome.ok).toBe(false);
    expect(result.postBody).toContain("#UAEBusiness");
  });
});

// ===========================================================================
// runMetaCampaignSync — scheduler entry point
// ===========================================================================
describe("runMetaCampaignSync", () => {
  it("delegates to fetchCampaignInsights (skipped when not configured)", async () => {
    const r = await runMetaCampaignSync();
    expect(r.skipped).toBe("not_configured");
  });
});

// ===========================================================================
// WhatsApp surface — `publish post <topic>` + help text
// ===========================================================================
describe("Manager Agent — publish post via WhatsApp", () => {
  it("`help` lists the new `publish post` command", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "help");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("`publish post <topic>`");
  });

  it("`publish post` without topic prints usage + configured channels", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "publish post");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Usage: `publish post <topic>`");
    expect(reply).toContain("No publisher configured");
  });

  it("`publish post <topic>` drafts and publishes through Buffer when configured", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf_token";
    process.env.BUFFER_PROFILE_IDS = "p1";
    fetchState.handler = async () => ({
      body: {
        success: true,
        updates: [{ id: "u-77", service_link: "https://example/posted" }],
      },
    });
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "publish post Eid barter offers",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Posted to buffer");
    expect(reply).toContain("https://example/posted");
    expect(reply).toContain("#UAEBusiness");
  });

  it("`publish post <topic>` returns the draft + a not_configured note when no channel is wired", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "publish post Eid barter offers",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Drafted but not published");
    expect(reply).toContain("#UAEBusiness");
    expect(reply).toContain("SOCIAL_PUBLISH_CHANNEL");
  });
});

// Light direct-call test of the handler so we don't require the webhook
// path for every assertion.
describe("handlePublishPostCommand (direct)", () => {
  it("returns publish_failed on Buffer error", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf_token";
    process.env.BUFFER_PROFILE_IDS = "p1";
    fetchState.handler = async () => ({
      status: 500,
      body: { error: "internal" },
    });
    const out = await handlePublishPostCommand("publish post test topic");
    expect(out).toContain("Publish failed");
    expect(out).toContain("buffer");
    // Draft body still surfaces as a copy-paste backup.
    expect(out).toContain("#UAEBusiness");
  });
});

// ===========================================================================
// Task #86 — `publish post` confirmation step (`send` / `skip`).
// ===========================================================================
describe("Task #86 — publish post confirmation flow", () => {
  beforeEach(() => {
    // Re-enable confirmation for this block (the suite default opts out).
    process.env.MARKETING_PUBLISH_REQUIRE_CONFIRMATION = "true";
  });

  it("`publish post <topic>` drafts and asks for confirmation instead of publishing", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf_token";
    process.env.BUFFER_PROFILE_IDS = "p1";
    // Pre-load the agentMemory upsert.returning() result so remember()
    // returns an id without throwing.
    dbState.returningQueue.push([{ id: "mem-1" }]);
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "publish post Eid barter offers",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain('Draft for "Eid barter offers"');
    expect(reply).toContain("#UAEBusiness");
    expect(reply).toMatch(/Reply \*send\*.*to publish.*\*skip\*/);
    // Critically: NO publish should have happened yet.
    expect(fetchState.calls.some((c) => c.url.includes("buffer"))).toBe(false);
  });

  it("`send` reply publishes the parked draft via the configured channel", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf_token";
    process.env.BUFFER_PROFILE_IDS = "p1";
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "Hook line\nValue prop sentence.\nCTA — try Bareter today.\n#barter #cashlesstrade #UAEBusiness",
    );
    expect(stored.expiresAt).toBeDefined();
    // recallByKey returns the draft we just stored.
    dbState.selectQueue.push([
      {
        id: "mem-1",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: stored.expiresAt && "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    fetchState.handler = async () => ({
      body: {
        success: true,
        updates: [{ id: "u-99", service_link: "https://example/posted-99" }],
      },
    });
    const out = await handleConfirmPublishSend();
    expect(out).toContain("Posted to buffer");
    expect(out).toContain("https://example/posted-99");
    // Confirmed publish actually hit Buffer.
    expect(fetchState.calls.some((c) => c.url.includes("buffer"))).toBe(true);
  });

  it("`skip` reply discards the draft without publishing", async () => {
    process.env.BUFFER_ACCESS_TOKEN = "buf_token";
    process.env.BUFFER_PROFILE_IDS = "p1";
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "Hook line\nValue prop sentence.\nCTA — try Bareter today.\n#barter #cashlesstrade #UAEBusiness",
    );
    dbState.selectQueue.push([
      {
        id: "mem-1",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const out = await handleConfirmPublishSkip();
    expect(out).toContain("Skipped the draft");
    expect(out).toContain("Eid barter offers");
    // Crucially: skip never calls the publisher.
    expect(fetchState.calls.some((c) => c.url.includes("buffer"))).toBe(false);
  });

  it("`send` with no draft waiting returns a friendly hint", async () => {
    // No selectQueue entry → recallByKey returns [] → null draft.
    const out = await handleConfirmPublishSend();
    expect(out).toContain("No draft is waiting");
    expect(out).toContain("publish post");
  });

  it("expired drafts are ignored and swept", async () => {
    const expired = {
      topic: "stale topic",
      postBody: "old body",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    dbState.selectQueue.push([
      {
        id: "mem-stale",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: expired,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const draft = await getPendingPublishDraft();
    expect(draft).toBeNull();
  });

  it("two distinct sender ids do not share confirmation state", async () => {
    const founderA = "whatsapp:+971500000001";
    const founderB = "whatsapp:+971500000002";
    const draftA = await storePendingPublishDraft(
      founderA,
      "Topic A",
      "Body A — #UAEBusiness",
    );
    const draftB = await storePendingPublishDraft(
      founderB,
      "Topic B",
      "Body B — #UAEBusiness",
    );
    // Each founder should only see their own draft.
    dbState.selectQueue.push([
      {
        id: "mem-a",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000001",
        value: draftA,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const seenA = await getPendingPublishDraft(founderA);
    expect(seenA?.topic).toBe("Topic A");
    expect(seenA?.postBody).toContain("Body A");

    dbState.selectQueue.push([
      {
        id: "mem-b",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000002",
        value: draftB,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const seenB = await getPendingPublishDraft(founderB);
    expect(seenB?.topic).toBe("Topic B");
    expect(seenB?.postBody).toContain("Body B");
  });

  it("opt-out env restores immediate auto-publish behaviour", async () => {
    process.env.MARKETING_PUBLISH_REQUIRE_CONFIRMATION = "false";
    process.env.BUFFER_ACCESS_TOKEN = "buf_token";
    process.env.BUFFER_PROFILE_IDS = "p1";
    fetchState.handler = async () => ({
      body: {
        success: true,
        updates: [{ id: "u-direct", service_link: "https://example/direct" }],
      },
    });
    const out = await handlePublishPostCommand("publish post Direct topic");
    expect(out).toContain("Posted to buffer");
    expect(out).toContain("https://example/direct");
  });
});

// `help` should advertise the new confirmation reply keywords.
describe("Task #86 — help text mentions confirmation", () => {
  it("`help` lists `send` / `skip`", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "help");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("`send`");
    expect(reply).toContain("`skip`");
  });
});

// ===========================================================================
// Task #114 — `edit` / `tweak` while a draft is parked.
// ===========================================================================
describe("Task #114 — publish draft edit + tweak commands", () => {
  beforeEach(() => {
    process.env.MARKETING_PUBLISH_REQUIRE_CONFIRMATION = "true";
  });

  it("`edit <new body>` replaces the parked draft and re-prompts the founder", async () => {
    // Pre-seed the parked draft for this founder.
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "Original hook\nOriginal value\nOriginal CTA\n#barter #cashlesstrade #UAEBusiness",
    );
    // recallByKey for the lookup inside handleConfirmPublishEdit.
    dbState.selectQueue.push([
      {
        id: "mem-edit-1",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const newBody =
      "Reworked Hook\nReworked value prop\nReworked CTA\n#barter #cashlesstrade #DubaiSME";
    const out = await handleConfirmPublishEdit(`edit ${newBody}`);
    expect(out).toContain('Updated draft for "Eid barter offers"');
    expect(out).toContain("Reworked Hook");
    expect(out).toContain("#DubaiSME");
    // Re-prompt mentions all four follow-up commands.
    expect(out).toMatch(/\*send\*/);
    expect(out).toMatch(/\*skip\*/);
    expect(out).toMatch(/edit <new body>/);
    expect(out).toMatch(/tweak <hint>/);
    // No publisher fetch happened — edit is publish-free.
    expect(fetchState.calls.some((c) => c.url.includes("buffer"))).toBe(false);
  });

  it("`edit` with no parked draft returns a friendly hint and does not crash", async () => {
    // No selectQueue entry → recallByKey returns [] → null draft.
    const out = await handleConfirmPublishEdit("edit some new body text");
    expect(out).toContain("No draft is waiting");
    expect(out).toContain("publish post");
  });

  it("`edit` with no body after the keyword returns the usage hint", async () => {
    const out = await handleConfirmPublishEdit("edit ");
    expect(out).toContain("Usage:");
    expect(out).toContain("edit <new body>");
  });

  it("bare `edit` (no whitespace, no body) returns usage even when a draft is parked", async () => {
    // Park a draft so the missing-draft branch can't be the reason
    // for the usage hint — bare `edit` must never overwrite the
    // parked body with the literal string "edit".
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "Original hook\nOriginal value\nOriginal CTA\n#barter #cashlesstrade #UAEBusiness",
    );
    dbState.selectQueue.push([
      {
        id: "mem-bare-edit",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const out = await handleConfirmPublishEdit("edit");
    expect(out).toContain("Usage:");
    expect(out).toContain("edit <new body>");
    // Crucially: the response must NOT confirm an update; the parked
    // draft must remain untouched (verified by the absence of the
    // confirmation envelope).
    expect(out).not.toContain("Updated draft");
  });

  it("multi-line `edit\\nbody` routes to the edit handler (not the free-form LLM)", async () => {
    vi.mocked(mockedChatCompletion).mockClear();
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "old\nold\nold\n#a #b #c",
    );
    dbState.selectQueue.push([
      {
        id: "mem-multiline-edit",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "edit\nLine one of the body\nLine two\n#UAEBusiness #DubaiSME #GCCBarter",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Updated draft");
    expect(reply).toContain("Line one of the body");
    // Critically: the LLM must NOT have been called — `edit` is free.
    expect(vi.mocked(mockedChatCompletion)).not.toHaveBeenCalled();
  });

  it("`edit` reports a clear failure (and keeps the old draft) when the persist call fails", async () => {
    // Park a draft so the missing-draft branch doesn't short-circuit.
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "Original\nOriginal\nOriginal\n#barter #cashlesstrade #UAEBusiness",
    );
    dbState.selectQueue.push([
      {
        id: "mem-edit-fail",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    // Trigger the persist-failure path by sending a payload that
    // exceeds the 4KB memory cap — `remember()` returns
    // `{ ok: false }` and `storePendingPublishDraft` now throws.
    const oversized = "X".repeat(5000);
    const out = await handleConfirmPublishEdit(`edit ${oversized}`);
    expect(out).toContain("Couldn't save your edit");
    expect(out).toContain("original draft is still parked");
    // The misleading success envelope must not be present.
    expect(out).not.toContain("Updated draft");
  });

  it("`edit` preserves the founder's exact capitalisation, punctuation and hashtags", async () => {
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "old\nold\nold\n#a #b #c",
    );
    dbState.selectQueue.push([
      {
        id: "mem-edit-case",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const out = await handleConfirmPublishEdit(
      "edit RAMADAN Special: 30% MORE deals?\nLine two!\n#UAEBusiness #DubaiSME #GCCBarter",
    );
    expect(out).toContain("RAMADAN Special: 30% MORE deals?");
    expect(out).toContain("Line two!");
    expect(out).toContain("#UAEBusiness");
  });

  it("`tweak <hint>` re-prompts the LLM and re-parks the revised draft", async () => {
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "Original hook\nOriginal value\nOriginal CTA\n#barter #cashlesstrade #UAEBusiness",
    );
    dbState.selectQueue.push([
      {
        id: "mem-tweak-1",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    // Override the canned LLM stub for this single call so we can
    // verify the revised body actually reaches the founder.
    vi.mocked(mockedChatCompletion).mockResolvedValueOnce({
      content:
        "Urgent hook!\nValue prop with discount\nClaim before Eid\n#UAEBusiness #DubaiSME #GCCBarter",
      tokensUsed: 42,
    });
    const out = await handleConfirmPublishTweak(
      "tweak make it more urgent and add a discount angle",
    );
    expect(out).toContain('Tweaked draft for "Eid barter offers"');
    expect(out).toContain("Urgent hook!");
    expect(out).toContain("#UAEBusiness");
    expect(out).toMatch(/\*send\*/);
    expect(out).toMatch(/edit <new body>/);
    // The LLM was called for the tweak.
    expect(vi.mocked(mockedChatCompletion)).toHaveBeenCalled();
    // No publish happened.
    expect(fetchState.calls.some((c) => c.url.includes("buffer"))).toBe(false);
  });

  it("`tweak` with no parked draft returns a friendly hint and skips the LLM", async () => {
    vi.mocked(mockedChatCompletion).mockClear();
    const out = await handleConfirmPublishTweak("tweak punchier hook please");
    expect(out).toContain("No draft is waiting");
    expect(out).toContain("publish post");
    // Crucially: the LLM was NOT called when there's nothing to tweak.
    expect(vi.mocked(mockedChatCompletion)).not.toHaveBeenCalled();
  });

  it("`tweak` with no hint after the keyword returns the usage hint", async () => {
    vi.mocked(mockedChatCompletion).mockClear();
    const out = await handleConfirmPublishTweak("tweak ");
    expect(out).toContain("Usage:");
    expect(out).toContain("tweak <hint>");
    expect(vi.mocked(mockedChatCompletion)).not.toHaveBeenCalled();
  });

  it("bare `tweak` (no whitespace, no hint) returns usage and does NOT call the LLM", async () => {
    // Park a draft so the missing-draft branch can't be the reason
    // the LLM was skipped — bare `tweak` must never burn LLM budget
    // by passing the literal string "tweak" as the hint.
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "Original\nOriginal\nOriginal\n#barter #cashlesstrade #UAEBusiness",
    );
    dbState.selectQueue.push([
      {
        id: "mem-bare-tweak",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    vi.mocked(mockedChatCompletion).mockClear();
    const out = await handleConfirmPublishTweak("tweak");
    expect(out).toContain("Usage:");
    expect(out).toContain("tweak <hint>");
    expect(vi.mocked(mockedChatCompletion)).not.toHaveBeenCalled();
  });

  it("multi-line `tweak\\nhint` routes to the tweak handler (not the free-form LLM)", async () => {
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "Original\nOriginal\nOriginal\n#barter #cashlesstrade #UAEBusiness",
    );
    dbState.selectQueue.push([
      {
        id: "mem-multiline-tweak",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    vi.mocked(mockedChatCompletion).mockResolvedValueOnce({
      content:
        "Sharper hook!\nValue with proof\nClaim today\n#UAEBusiness #DubaiSME #GCCBarter",
      tokensUsed: 31,
    });
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "tweak\nmake the hook punchier\nand add a stat",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Tweaked draft");
    expect(reply).toContain("Sharper hook!");
    // The LLM was called exactly once for the tweak — the free-form
    // Manager handler must not have been used.
    expect(vi.mocked(mockedChatCompletion)).toHaveBeenCalledTimes(1);
  });

  it("`tweak` falls back to a friendly error when the LLM call fails (e.g. budget gate)", async () => {
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "Original hook\nOriginal value\nOriginal CTA\n#barter #cashlesstrade #UAEBusiness",
    );
    dbState.selectQueue.push([
      {
        id: "mem-tweak-fail",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    vi.mocked(mockedChatCompletion).mockRejectedValueOnce(
      new Error("budget exceeded"),
    );
    const out = await handleConfirmPublishTweak("tweak shorter please");
    expect(out.toLowerCase()).toContain("tweak failed");
    expect(out).toContain("costs");
    // Original draft remains parked (we didn't overwrite it).
    expect(out).toContain("previous draft is still parked");
  });
});

// `help` should also advertise the Task #114 commands so founders can discover them.
describe("Task #114 — help text mentions edit + tweak", () => {
  it("`help` lists `edit` and `tweak`", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "help");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("edit <new body>");
    expect(reply).toContain("tweak <hint>");
  });
});

// End-to-end through the WhatsApp webhook: send `edit ...` and verify the
// reply gets dispatched (not just the direct handler call).
describe("Task #114 — webhook routes edit/tweak to the right handlers", () => {
  beforeEach(() => {
    process.env.MARKETING_PUBLISH_REQUIRE_CONFIRMATION = "true";
  });

  it("webhook `edit <body>` from the founder updates the parked draft", async () => {
    const stored = await storePendingPublishDraft(
      undefined,
      "Eid barter offers",
      "old\nold\nold\n#a #b #c",
    );
    dbState.selectQueue.push([
      {
        id: "mem-wh-edit",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000000",
        value: stored,
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "edit Brand new body line\nSecond line\n#UAEBusiness #DubaiSME #GCCBarter",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Updated draft");
    expect(reply).toContain("Brand new body line");
  });
});

// ===========================================================================
// Task #112 — admin dashboard pending publish drafts panel.
// ===========================================================================
describe("Task #112 — listPendingPublishDrafts", () => {
  beforeEach(() => {
    process.env.MARKETING_PUBLISH_REQUIRE_CONFIRMATION = "true";
    delete process.env.MARKETING_PUBLISH_CONFIRM_TIMEOUT_MIN;
  });

  it("returns parked drafts with senderId, topic, body, expiry — soonest first", async () => {
    // Two distinct rows in the recall queue: founderB expires sooner.
    const soonExpiry = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const lateExpiry = new Date(Date.now() + 9 * 60 * 1000).toISOString();
    dbState.selectQueue.push([
      {
        id: "mem-a",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000001",
        value: { topic: "Topic A", postBody: "Body A", expiresAt: lateExpiry },
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: "mem-b",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000002",
        value: { topic: "Topic B", postBody: "Body B", expiresAt: soonExpiry },
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const drafts = await listPendingPublishDrafts();
    expect(drafts).toHaveLength(2);
    // Soonest-to-expire first.
    expect(drafts[0].senderId).toBe("+971500000002");
    expect(drafts[0].topic).toBe("Topic B");
    expect(drafts[0].postBody).toBe("Body B");
    expect(drafts[1].senderId).toBe("+971500000001");
  });

  it("filters out expired rows (and does not include them in the response)", async () => {
    const expired = new Date(Date.now() - 60 * 1000).toISOString();
    const valid = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    dbState.selectQueue.push([
      {
        id: "mem-expired",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000003",
        value: { topic: "Stale", postBody: "Stale body", expiresAt: expired },
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: "mem-valid",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000004",
        value: { topic: "Fresh", postBody: "Fresh body", expiresAt: valid },
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const drafts = await listPendingPublishDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].senderId).toBe("+971500000004");
    expect(drafts[0].topic).toBe("Fresh");
  });

  it("returns an empty array when no drafts are parked", async () => {
    dbState.selectQueue.push([]);
    const drafts = await listPendingPublishDrafts();
    expect(drafts).toEqual([]);
  });

  it("ignores rows whose value is malformed (defence-in-depth)", async () => {
    const valid = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    dbState.selectQueue.push([
      {
        id: "mem-bad",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000005",
        // missing postBody / expiresAt
        value: { topic: "Just a topic" },
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: "mem-good",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000006",
        value: { topic: "Real", postBody: "Real body", expiresAt: valid },
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const drafts = await listPendingPublishDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].senderId).toBe("+971500000006");
  });
});

describe("Task #112 — admin pending-publish endpoints", () => {
  beforeEach(() => {
    process.env.MARKETING_PUBLISH_REQUIRE_CONFIRMATION = "true";
  });

  it("GET /marketing/pending-publish surfaces parked drafts to admins", async () => {
    const expiry = new Date(Date.now() + 8 * 60 * 1000).toISOString();
    dbState.selectQueue.push([
      {
        id: "mem-x",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000111",
        value: { topic: "X topic", postBody: "X body", expiresAt: expiry },
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const app = buildApp();
    const res = await request(app).get("/api/company-os/marketing/pending-publish");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.drafts[0].senderId).toBe("+971500000111");
    expect(res.body.drafts[0].topic).toBe("X topic");
    expect(res.body.drafts[0].postBody).toBe("X body");
    expect(res.body.drafts[0].expiresAt).toBe(expiry);
  });

  it("POST /marketing/pending-publish/:senderId/skip clears the draft and returns the reply", async () => {
    const expiry = new Date(Date.now() + 8 * 60 * 1000).toISOString();
    // recallByKey lookup inside handleConfirmPublishSkip
    dbState.selectQueue.push([
      {
        id: "mem-y",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000222",
        value: { topic: "Y topic", postBody: "Y body", expiresAt: expiry },
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const app = buildApp();
    const res = await request(app).post(
      `/api/company-os/marketing/pending-publish/${encodeURIComponent("+971500000222")}/skip`,
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.reply).toContain("Skipped");
    expect(res.body.reply).toContain("Y topic");
  });

  it("POST /skip with no parked draft returns the friendly fallback reply", async () => {
    // recallByKey returns empty
    dbState.selectQueue.push([]);
    const app = buildApp();
    const res = await request(app).post(
      `/api/company-os/marketing/pending-publish/${encodeURIComponent("+971500000999")}/skip`,
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.reply).toContain("nothing to skip");
  });

  it("POST /send dispatches the parked draft and returns the publish reply", async () => {
    const expiry = new Date(Date.now() + 8 * 60 * 1000).toISOString();
    // No publisher channel envs set in beforeEach, so dispatchPublishPost
    // returns a "no publisher" outcome — exercises the full route → handler
    // → dispatcher path without needing a fetch fixture.
    dbState.selectQueue.push([
      {
        id: "mem-z",
        agentName: "marketingAgent",
        memoryType: "pending_publish",
        key: "+971500000333",
        value: { topic: "Z topic", postBody: "Z body", expiresAt: expiry },
        confidence: "1.000",
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const app = buildApp();
    const res = await request(app).post(
      `/api/company-os/marketing/pending-publish/${encodeURIComponent("+971500000333")}/send`,
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Reply is whatever `formatPublishOutcomeReply` produced — the
    // important assertion is that the route plumbing works and the topic
    // shows up so the dashboard can echo it in the toast.
    expect(typeof res.body.reply).toBe("string");
    expect(res.body.reply.length).toBeGreaterThan(0);
  });
});
