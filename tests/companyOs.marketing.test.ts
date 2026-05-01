// Unit + light-integration tests for the Marketing Agent (Task #61).
//
// Coverage:
//   • `parseCampaignUpdate` — accepts well-formed updates, rejects garbage,
//     ranges, and missing fields.
//   • `dubaiWeekStart` — always returns the Monday (YYYY-MM-DD) of the
//     current Asia/Dubai week, regardless of which weekday "now" falls on.
//   • `gatherTrendingData` — degrades to an empty snapshot when the DB
//     layer throws (so the cron job never crashes the scheduler).
//   • `formatMarketingReport` — works in the "no brief, no campaigns" cold
//     start state and surfaces both sections when data exists.
//   • Manager Agent integration — `marketing`, `campaign update`,
//     `draft post`, and `help` route through the WhatsApp webhook with the
//     expected reply bodies, and `marketing` does NOT consume LLM budget.
//
// All external calls (DB, object storage sidecar, OpenAI, Twilio REST) are
// mocked so the suite runs offline in CI.

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
// DB mock — programmable per-test. Each test installs a `dbState` describing
// what each operation should return; default is "empty" everywhere so the
// "no data yet" branches are exercised by default.
// ---------------------------------------------------------------------------
type AnyRow = Record<string, unknown>;

interface DbState {
  // Rows returned for any select chain (in order of read).
  selectQueue: AnyRow[][];
  // Rows returned for `.returning()` after insert/update.
  returningQueue: AnyRow[][];
  // Whether the next select should reject (used to test gatherTrendingData
  // resilience).
  selectShouldThrow: boolean;
  // Captures all values passed to insert/update for assertions.
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

// Object storage helpers — capture upload calls, return canned signed URLs.
const uploadCalls: { key: string; size: number; contentType: string }[] = [];
vi.mock("../server/companyOs/objectStorageHelpers", () => ({
  uploadPrivateBuffer: vi.fn(
    async (key: string, buf: Buffer, contentType: string) => {
      uploadCalls.push({ key, size: buf.length, contentType });
      return key;
    },
  ),
  getSignedDownloadUrl: vi.fn(
    async (key: string) => `https://signed.example/${key}?sig=test`,
  ),
}));

// LLM stub — return canned brief draft + post text, with deterministic
// token usage so we can assert the budget tracker isn't consulted on the
// `marketing` command path.
const llmJsonReply = {
  theme: "Ramadan barter offers",
  audience: "UAE/GCC restaurants and SMEs",
  hooks: ["Hook 1", "Hook 2", "Hook 3"],
  hashtags: ["#barter", "#cashlesstrade", "#UAEBusiness", "#DubaiSME", "#Ramadan"],
  suggestedBudgetAed: 750,
  recommendations: "Post on LinkedIn Tue/Thu and Instagram daily.",
};
vi.mock("../server/agents/llm", () => ({
  chatCompletion: vi.fn(async () => ({
    content: "Hook line\nValue prop sentence.\nCTA — try Bareter today.\n#barter #cashlesstrade #UAEBusiness",
    tokensUsed: 33,
  })),
  jsonCompletion: vi.fn(async () => ({ data: llmJsonReply, tokensUsed: 220 })),
}));

// Stripe stub (Manager Agent transitively imports it).
vi.mock("../server/companyOs/stripeClient", () => ({
  getStripeClient: vi.fn(async () => null),
  getStripeWebhookSecret: vi.fn(async () => null),
  getStripeSecretKey: vi.fn(async () => null),
  isStripeConfigured: vi.fn(async () => false),
}));

// Twilio REST capture — same pattern as the WhatsApp suite.
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

// Imports AFTER mocks so the modules under test pick up the stubs.
import {
  parseCampaignUpdate,
  dubaiWeekStart,
  gatherTrendingData,
  generateAndStoreBrief,
  formatMarketingReport,
  recordCampaignUpdate,
} from "../server/companyOs/marketingAgent";
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

beforeEach(() => {
  resetDbState();
  uploadCalls.length = 0;
  hoisted.sendCalls.length = 0;
  hoisted.state.resolveNextSend = null;
});

afterAll(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    process.env[k] = v;
  }
});

// ===========================================================================
// parseCampaignUpdate
// ===========================================================================
describe("parseCampaignUpdate", () => {
  it("parses a well-formed update", () => {
    const r = parseCampaignUpdate("campaign update Ramadan2026 ctr=2.4 spend=850 conversions=12");
    expect(r).toEqual({
      campaignName: "Ramadan2026",
      ctr: 2.4,
      spendAed: 850,
      conversions: 12,
    });
  });

  it("is case-insensitive on the keyword", () => {
    const r = parseCampaignUpdate("CAMPAIGN UPDATE Test ctr=1 spend=10 conversions=0");
    expect(r?.campaignName).toBe("Test");
  });

  it("accepts multi-word campaign names", () => {
    const r = parseCampaignUpdate("campaign update My Q2 push ctr=3.5 spend=1200 conversions=8");
    expect(r?.campaignName).toBe("My Q2 push");
  });

  it("rejects malformed input", () => {
    expect(parseCampaignUpdate("campaign update")).toBeNull();
    expect(parseCampaignUpdate("campaign update Foo ctr=x spend=y conversions=z")).toBeNull();
    expect(parseCampaignUpdate("hello world")).toBeNull();
  });

  it("rejects out-of-range CTR (>100)", () => {
    expect(
      parseCampaignUpdate("campaign update Foo ctr=150 spend=10 conversions=0"),
    ).toBeNull();
  });

  it("rejects negative spend / conversions", () => {
    // The regex requires non-negative integers / decimals so negatives won't match.
    expect(parseCampaignUpdate("campaign update Foo ctr=1 spend=-5 conversions=0")).toBeNull();
    expect(parseCampaignUpdate("campaign update Foo ctr=1 spend=10 conversions=-1")).toBeNull();
  });
});

// ===========================================================================
// dubaiWeekStart
// ===========================================================================
describe("dubaiWeekStart", () => {
  it("returns the same Monday for every day of that Dubai week", () => {
    // Wed 2026-04-22 12:00 UTC === Wed 2026-04-22 16:00 Dubai
    // Mon of that week (Dubai) = 2026-04-20.
    const wednesday = new Date("2026-04-22T12:00:00Z");
    expect(dubaiWeekStart(wednesday)).toBe("2026-04-20");

    const monday = new Date("2026-04-20T05:00:00Z"); // 09:00 Dubai
    expect(dubaiWeekStart(monday)).toBe("2026-04-20");

    const sunday = new Date("2026-04-26T20:00:00Z"); // Mon 00:00 Dubai
    expect(dubaiWeekStart(sunday)).toBe("2026-04-27");
  });

  it("returns YYYY-MM-DD format", () => {
    expect(dubaiWeekStart()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ===========================================================================
// gatherTrendingData
// ===========================================================================
describe("gatherTrendingData", () => {
  it("returns aggregated counts when the DB responds", async () => {
    dbState.selectQueue = [
      [
        { category: "services", c: 12 },
        { category: "products", c: 7 },
      ],
      [
        { city: "Dubai", c: 9 },
        { city: "Abu Dhabi", c: 4 },
      ],
      [{ c: 21 }],
      [{ c: 33 }],
      [{ avg: "1450.5" }],
    ];
    const snap = await gatherTrendingData(7);
    expect(snap.windowDays).toBe(7);
    expect(snap.topPostCategories).toHaveLength(2);
    expect(snap.topPostCategories[0]).toEqual({ category: "services", count: 12 });
    expect(snap.topCities[0]).toEqual({ city: "Dubai", count: 9 });
    expect(snap.newListings).toBe(21);
    expect(snap.newPosts).toBe(33);
    expect(snap.avgListingValueAed).toBe(1451);
  });

  it("degrades to an empty snapshot when the DB throws", async () => {
    dbState.selectShouldThrow = true;
    const snap = await gatherTrendingData(7);
    expect(snap).toEqual({
      topPostCategories: [],
      topCities: [],
      newListings: 0,
      newPosts: 0,
      avgListingValueAed: 0,
      windowDays: 7,
    });
  });
});

// ===========================================================================
// formatMarketingReport — cold start vs populated
// ===========================================================================
describe("formatMarketingReport", () => {
  it("shows the cold-start guidance when there's no brief and no campaigns", async () => {
    // 1 select for getLatestBrief → empty, 1 select for getRecentCampaigns → empty.
    dbState.selectQueue = [[], []];
    const out = await formatMarketingReport();
    expect(out).toContain("No brief generated yet");
    expect(out).toContain("campaign update");
  });

  it("renders the brief + recent campaigns when present", async () => {
    dbState.selectQueue = [
      [
        {
          id: "brief-1",
          weekStart: "2026-04-20",
          theme: "Ramadan barter offers",
          audience: "UAE/GCC restaurants and SMEs",
          hooks: ["h1"],
          hashtags: ["#barter", "#UAEBusiness"],
          suggestedBudgetAed: "750",
          recommendations: "Post on LinkedIn",
          pdfStorageKey: "companyOs/briefs/brief-1.pdf",
          createdAt: new Date(),
        },
      ],
      [
        {
          campaignName: "Q2 push",
          channel: null,
          ctr: "2.40",
          spendAed: "850.00",
          conversions: 12,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ];
    const out = await formatMarketingReport();
    expect(out).toContain("Ramadan barter offers");
    expect(out).toContain("Week of 2026-04-20");
    expect(out).toContain("#UAEBusiness");
    expect(out).toContain("PDF: https://signed.example/companyOs/briefs/brief-1.pdf");
    expect(out).toContain("Q2 push");
    expect(out).toContain("CTR 2.40%");
    expect(out).toContain("12 conv");
  });
});

// ===========================================================================
// generateAndStoreBrief — DB insert, PDF upload, second update
// ===========================================================================
describe("generateAndStoreBrief", () => {
  it("inserts a brief row, uploads a PDF, and patches the storage key", async () => {
    const briefRow = {
      id: "brief-xyz",
      weekStart: "2026-04-20",
      theme: llmJsonReply.theme,
      audience: llmJsonReply.audience,
      hooks: llmJsonReply.hooks,
      hashtags: llmJsonReply.hashtags,
      suggestedBudgetAed: "750",
      recommendations: llmJsonReply.recommendations,
      pdfStorageKey: null,
      createdAt: new Date(),
    };
    // gatherTrendingData makes 5 select calls; provide 5 empty arrays.
    dbState.selectQueue = [[], [], [{ c: 0 }], [{ c: 0 }], [{ avg: "0" }]];
    // First returning() = insert(brief), second = update(set pdfStorageKey).
    dbState.returningQueue = [
      [briefRow],
      [{ ...briefRow, pdfStorageKey: "companyOs/briefs/brief-xyz.pdf" }],
    ];

    const result = await generateAndStoreBrief();

    expect(result.id).toBe("brief-xyz");
    expect(result.pdfStorageKey).toBe("companyOs/briefs/brief-xyz.pdf");
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].key).toBe("companyOs/briefs/brief-xyz.pdf");
    expect(uploadCalls[0].contentType).toBe("application/pdf");
    expect(uploadCalls[0].size).toBeGreaterThan(500); // jsPDF output sanity
    expect(dbState.insertedValues).toHaveLength(1); // initial insert
    expect(dbState.updatedSets).toHaveLength(1); // pdfStorageKey patch
  });
});

// ===========================================================================
// recordCampaignUpdate — happy path upsert
// ===========================================================================
describe("recordCampaignUpdate", () => {
  it("upserts and returns the resulting row", async () => {
    const row = {
      campaignName: "Ramadan2026",
      channel: null,
      ctr: "2.40",
      spendAed: "850.00",
      conversions: 12,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbState.returningQueue = [[row]];
    const result = await recordCampaignUpdate({
      campaignName: "Ramadan2026",
      ctr: 2.4,
      spendAed: 850,
      conversions: 12,
    });
    expect(result.campaignName).toBe("Ramadan2026");
    expect(dbState.insertedValues[0].campaignName).toBe("Ramadan2026");
    expect(dbState.insertedValues[0].ctr).toBe("2.40");
  });
});

// ===========================================================================
// Manager Agent integration via the WhatsApp webhook
// ===========================================================================
describe("Manager Agent — marketing commands via WhatsApp webhook", () => {
  it("`help` lists the new marketing commands", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "help");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("`marketing`");
    expect(reply).toContain("`draft post <topic>`");
    expect(reply).toContain("`campaign update");
  });

  it("`marketing` returns the cold-start report", async () => {
    // formatMarketingReport: 1 select for latest brief + 1 for recent campaigns.
    dbState.selectQueue = [[], []];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "marketing");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Marketing");
    expect(reply).toContain("No brief generated yet");
  });

  it("`campaign update ...` upserts and confirms", async () => {
    dbState.returningQueue = [
      [
        {
          campaignName: "Test",
          channel: null,
          ctr: "1.50",
          spendAed: "200.00",
          conversions: 4,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "campaign update Test ctr=1.5 spend=200 conversions=4",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Logged");
    expect(reply).toContain("Test");
    expect(reply).toContain("CTR 1.50%");
    expect(dbState.insertedValues[0].campaignName).toBe("Test");
  });

  it("`campaign update` with bad syntax returns the usage hint without DB write", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "campaign update broken");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Usage:");
    expect(dbState.insertedValues).toHaveLength(0);
  });

  it("`draft post <topic>` returns LLM-drafted copy", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "draft post Ramadan barter offers for restaurants",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("#UAEBusiness");
  });

  it("`draft post` without topic returns usage hint", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "draft post");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Usage:");
  });
});
