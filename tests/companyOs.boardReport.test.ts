// Unit + light-integration tests for the Board Report Agent (Task #67).
//
// Coverage:
//   • `parseReportMonth` — accepts YYYY-MM, rejects garbage / out-of-range.
//   • `lastCompletedMonthYyyyMm` — returns the prior calendar month in UTC.
//   • `monthBoundsUtc` — returns the right [start, endExclusive) UTC bounds.
//   • `parseBoardReportCommand` — parses both `board report` and
//     `board report YYYY-MM`, ignores unrelated text.
//   • `gatherMetrics` — degrades to zero/empty rows on DB failure (the
//     report still ships, no section throws).
//   • `templatedNarrative` — non-empty + mentions key numbers.
//   • `generateMonthlyReport` — happy path renders a PDF, uploads it to
//     the canonical `companyOs/board-reports/<month>.pdf` key, and
//     returns the upserted row + signed URL.
//   • Manager Agent integration — `board report` routes through the
//     WhatsApp webhook to a reply containing the PDF link.
//
// All external calls (DB, object storage, OpenAI, Twilio REST) are
// mocked so the suite runs offline.

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
// DB mock — programmable per-test, mirroring tests/companyOs.marketing.test.ts.
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

// LLM stub — narrative generator returns a canned reply with deterministic
// token usage. The boardReportAgent wraps the openai call in withRetry, so
// stubbing chatCompletion at the module boundary covers both paths.
vi.mock("../server/agents/llm", () => ({
  chatCompletion: vi.fn(async () => ({
    content:
      "Stubbed monthly narrative paragraph 1.\n\n" +
      "Stubbed monthly narrative paragraph 2.\n\n" +
      "Stubbed monthly narrative paragraph 3.\n\n" +
      "Stubbed monthly narrative paragraph 4.",
    tokensUsed: 320,
  })),
  jsonCompletion: vi.fn(async () => ({ data: {}, tokensUsed: 0 })),
}));

// Stripe stub — Manager Agent transitively imports it.
vi.mock("../server/companyOs/stripeClient", () => ({
  getStripeClient: vi.fn(async () => null),
  getStripeWebhookSecret: vi.fn(async () => null),
  getStripeSecretKey: vi.fn(async () => null),
  isStripeConfigured: vi.fn(async () => false),
}));

// Twilio REST capture — same pattern as the WhatsApp / marketing suites.
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
  parseReportMonth,
  lastCompletedMonthYyyyMm,
  monthBoundsUtc,
  parseBoardReportCommand,
  gatherMetrics,
  templatedNarrative,
  generateMonthlyReport,
  storageKeyFor,
} from "../server/companyOs/boardReportAgent";
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
// Pure helpers
// ===========================================================================
describe("parseReportMonth", () => {
  it("accepts YYYY-MM", () => {
    expect(parseReportMonth("2026-03")).toEqual({ year: 2026, month: 3 });
    expect(parseReportMonth("2026-12")).toEqual({ year: 2026, month: 12 });
  });

  it("rejects malformed strings", () => {
    expect(() => parseReportMonth("2026-3")).toThrow();
    expect(() => parseReportMonth("2026/03")).toThrow();
    expect(() => parseReportMonth("hello")).toThrow();
    expect(() => parseReportMonth("")).toThrow();
  });

  it("rejects out-of-range months / years", () => {
    expect(() => parseReportMonth("2026-00")).toThrow();
    expect(() => parseReportMonth("2026-13")).toThrow();
    expect(() => parseReportMonth("1999-05")).toThrow();
  });
});

describe("lastCompletedMonthYyyyMm", () => {
  it("returns the prior calendar month in UTC", () => {
    expect(lastCompletedMonthYyyyMm(new Date("2026-04-01T00:00:00Z"))).toBe("2026-03");
    expect(lastCompletedMonthYyyyMm(new Date("2026-04-25T13:00:00Z"))).toBe("2026-03");
    expect(lastCompletedMonthYyyyMm(new Date("2026-12-31T23:59:00Z"))).toBe("2026-11");
  });

  it("rolls back across year boundary", () => {
    expect(lastCompletedMonthYyyyMm(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12");
    expect(lastCompletedMonthYyyyMm(new Date("2026-01-15T08:00:00Z"))).toBe("2025-12");
  });
});

describe("monthBoundsUtc", () => {
  it("returns inclusive start + exclusive end at UTC midnight", () => {
    const b = monthBoundsUtc("2026-03");
    expect(b.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(b.endExclusive.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(b.label).toContain("March");
    expect(b.label).toContain("2026");
  });

  it("rolls forward across year boundary for December", () => {
    const b = monthBoundsUtc("2026-12");
    expect(b.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(b.endExclusive.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("parseBoardReportCommand", () => {
  it("parses the bare command", () => {
    expect(parseBoardReportCommand("board report")).toEqual({ month: null });
    expect(parseBoardReportCommand("BOARD REPORT")).toEqual({ month: null });
    expect(parseBoardReportCommand("  board   report  ")).toEqual({ month: null });
  });

  it("parses an explicit month", () => {
    expect(parseBoardReportCommand("board report 2026-03")).toEqual({ month: "2026-03" });
    expect(parseBoardReportCommand("Board Report 2026-12")).toEqual({ month: "2026-12" });
  });

  it("ignores unrelated text", () => {
    expect(parseBoardReportCommand("hello board")).toBeNull();
    expect(parseBoardReportCommand("board reports")).toBeNull();
    expect(parseBoardReportCommand("board report march")).toBeNull();
  });
});

describe("storageKeyFor", () => {
  it("returns the canonical key", () => {
    expect(storageKeyFor("2026-03")).toBe("companyOs/board-reports/2026-03.pdf");
  });

  it("validates the input month", () => {
    expect(() => storageKeyFor("hello")).toThrow();
  });
});

// ===========================================================================
// gatherMetrics — degrades on DB failure
// ===========================================================================
describe("gatherMetrics", () => {
  it("degrades to zero/empty rows when every read throws", async () => {
    dbState.selectShouldThrow = true;
    const m = await gatherMetrics("2026-03");
    expect(m.reportMonth).toBe("2026-03");
    expect(m.finance.totalRevenueAed).toBe(0);
    expect(m.growth.endingTotalUsers).toBe(0);
    expect(m.sales.totalLeads).toBe(0);
    // The topLeads array must exist (empty) so the PDF renderer can
    // safely iterate it on the cold-start path.
    expect(Array.isArray(m.sales.topLeads)).toBe(true);
    expect(m.sales.topLeads).toHaveLength(0);
    expect(m.marketing.activeCampaigns).toBe(0);
    expect(m.legal.contractsCount).toBe(0);
    expect(m.alerts.totalCreated).toBe(0);
    expect(m.aiCost.totalAed).toBe(0);
  });
});

// ===========================================================================
// templatedNarrative
// ===========================================================================
describe("templatedNarrative", () => {
  it("returns a non-empty string mentioning core metrics", () => {
    const out = templatedNarrative({
      reportMonth: "2026-03",
      monthLabel: "March 2026",
      finance: { totalRevenueAed: 12345, transactionCount: 50, refundsAed: 100, refundCount: 1, daysWithRevenue: 28 },
      growth: { avgTotalUsers: 100, avgActiveUsers7d: 30, newUsersTotal: 12, newPostsTotal: 80, completedDealsTotal: 22, avgCompletionRatePct: 75, endingTotalUsers: 120, endingTotalDeals: 200, endingGmv7dAed: 5000 },
      sales: { totalLeads: 40, leadsCreatedThisMonth: 8, convertedThisMonth: 3, byStatus: [], avgLeadScore: 55 },
      marketing: { activeCampaigns: 2, totalSpendAed: 800, totalConversions: 15, avgCtr: 2.4, topCampaigns: [] },
      legal: { contractsCount: 3, disputeSummaries: 1, vatFlags: 0, recentTitles: [] },
      alerts: { totalCreated: 4, bySeverity: [], criticalSample: [] },
      aiCost: { totalAed: 22.5, callsCount: 60, perAgent: [], errorCount: 0 },
    });
    expect(out.length).toBeGreaterThan(50);
    // Should reference revenue + the month label.
    expect(out).toMatch(/12,?345|12345/);
    expect(out).toContain("March 2026");
  });
});

// ===========================================================================
// generateMonthlyReport — full happy path
// ===========================================================================
describe("generateMonthlyReport", () => {
  it("renders, uploads, and upserts the report row", async () => {
    // gatherMetrics issues many selects; selectShouldThrow lets each one
    // safely return zeros via the per-section `safe()` wrapper. We then
    // queue up the upsert returning row.
    dbState.selectShouldThrow = true;
    dbState.returningQueue = [
      [
        {
          id: "rep-1",
          reportMonth: "2026-03",
          objectStorageKey: "companyOs/board-reports/2026-03.pdf",
          summaryText: "stub narrative",
          metricsJson: {},
          pdfSizeBytes: 12345,
          createdAt: new Date().toISOString(),
        },
      ],
    ];

    const r = await generateMonthlyReport("2026-03");

    // Uploaded to the canonical key with the correct content type.
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].key).toBe("companyOs/board-reports/2026-03.pdf");
    expect(uploadCalls[0].contentType).toBe("application/pdf");
    expect(uploadCalls[0].size).toBeGreaterThan(500); // a real PDF, not empty

    // Returned row is the one we queued; signedUrl is the canned helper.
    expect(r.report.id).toBe("rep-1");
    expect(r.report.reportMonth).toBe("2026-03");
    expect(r.signedUrl).toContain("https://signed.example/");
    expect(r.signedUrl).toContain("companyOs/board-reports/2026-03.pdf");
    expect(r.truncated).toBe(false);

    // Upsert payload must reference the right month + key + size.
    const upsert = dbState.insertedValues.find(
      (v) => v.reportMonth === "2026-03",
    );
    expect(upsert).toBeDefined();
    expect(upsert?.objectStorageKey).toBe("companyOs/board-reports/2026-03.pdf");
    expect(typeof upsert?.summaryText).toBe("string");
  });

  it("defaults to the prior calendar month when no arg given", async () => {
    dbState.selectShouldThrow = true;
    dbState.returningQueue = [
      [
        {
          id: "rep-default",
          reportMonth: lastCompletedMonthYyyyMm(),
          objectStorageKey: `companyOs/board-reports/${lastCompletedMonthYyyyMm()}.pdf`,
          summaryText: "stub",
          metricsJson: {},
          pdfSizeBytes: 1234,
          createdAt: null,
        },
      ],
    ];
    const r = await generateMonthlyReport();
    expect(r.report.reportMonth).toBe(lastCompletedMonthYyyyMm());
  });

  it("rejects invalid months without uploading", async () => {
    await expect(generateMonthlyReport("bogus")).rejects.toThrow();
    expect(uploadCalls).toHaveLength(0);
  });
});

// ===========================================================================
// Manager Agent integration — `board report` reaches the WhatsApp surface.
// ===========================================================================
describe("Manager Agent — `board report` command", () => {
  let app: express.Express;
  beforeAll(() => {
    app = buildApp();
  });

  it("auto-generates when no row exists and replies with the PDF link", async () => {
    // 1) getReportByMonth → empty (no existing row)
    // 2) gatherMetrics runs many selects; we let them all degrade safely.
    dbState.selectQueue = [[]];
    dbState.selectShouldThrow = false;
    // After the first select returns [] for getReportByMonth, switch to
    // throwing for the rest of the metrics gather. We can't toggle mid-run
    // cleanly here, so instead we just keep selectQueue empty (each
    // section has its own safe() fallback) — empty results give zero
    // rows, which is fine for the report PDF.
    dbState.returningQueue = [
      [
        {
          id: "rep-wa",
          reportMonth: "2026-03",
          objectStorageKey: "companyOs/board-reports/2026-03.pdf",
          summaryText: "WhatsApp-rendered narrative",
          metricsJson: {},
          pdfSizeBytes: 9999,
          createdAt: new Date().toISOString(),
        },
      ],
    ];

    const { httpRes, sendPromise } = await postWebhook(app, "board report 2026-03");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    expect(hoisted.sendCalls).toHaveLength(1);
    const body = hoisted.sendCalls[0].body;
    expect(body).toContain("Board report");
    expect(body).toContain("2026-03");
    expect(body).toContain("https://signed.example/companyOs/board-reports/2026-03.pdf");
  });

  it("rejects malformed month gracefully (no DB write)", async () => {
    const { httpRes, sendPromise } = await postWebhook(app, "board report 2026-99");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    expect(hoisted.sendCalls).toHaveLength(1);
    expect(hoisted.sendCalls[0].body.toLowerCase()).toContain("invalid");
    // No PDF should have been generated for a bad month.
    expect(uploadCalls).toHaveLength(0);
  });
});
