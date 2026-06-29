// Unit + light-integration tests for the Legal Agent (Task #63).
//
// Coverage:
//   • `parseContractCommand` — accepts well-formed `contract` commands,
//     rejects malformed input, ranges, and missing parts.
//   • `buildContractBody` — UAE-jurisdiction template + AI disclaimer.
//   • `generateContract` — happy path: insert row → render PDF → upload
//     → patch storage key → return signed URL.
//   • `gatherDisputeData` — aggregates report counts; degrades to an
//     empty snapshot when DB throws.
//   • `runDisputeRiskSummary` — persists a `dispute_summary` row.
//   • `runVatCheck` — flags users at/over the AED 187,500 hard threshold
//     and at/over the AED 150,000 soft threshold; persists a `vat_flag`
//     row only when there's something to flag.
//   • Manager Agent integration — `contract`, `dispute risk`, `vat check`,
//     and `help` route through the WhatsApp webhook with the expected
//     reply bodies. The contract command is LLM-free.
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
// Env — must be set before any module that reads it loads.
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
// DB mock — programmable per-test. Default is "empty everywhere" so the
// "no data yet" branches are exercised by default.
// ---------------------------------------------------------------------------
type AnyRow = Record<string, unknown>;

interface DbState {
  selectQueue: AnyRow[][];
  returningQueue: AnyRow[][];
  executeQueue: { rows: AnyRow[] }[];
  selectShouldThrow: boolean;
  executeShouldThrow: boolean;
  insertedValues: AnyRow[];
  updatedSets: AnyRow[];
}

const dbState: DbState = {
  selectQueue: [],
  returningQueue: [],
  executeQueue: [],
  selectShouldThrow: false,
  executeShouldThrow: false,
  insertedValues: [],
  updatedSets: [],
};

function resetDbState() {
  dbState.selectQueue = [];
  dbState.returningQueue = [];
  dbState.executeQueue = [];
  dbState.selectShouldThrow = false;
  dbState.executeShouldThrow = false;
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
    execute: async () => {
      if (dbState.executeShouldThrow) throw new Error("simulated execute failure");
      return dbState.executeQueue.shift() ?? { rows: [] };
    },
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

// LLM stub — return canned dispute callouts JSON.
const llmCallouts = [
  "Scam reports up — tighten KYC re-verification on accounts older than 6 months.",
  "Listing-value flags suggest tighter valuation thresholds in the SaaS category.",
  "Two repeat reporters in 7 days — review whether a UAE consumer-protection FAQ link in-app would reduce complaints.",
];
vi.mock("../server/agents/llm", () => ({
  chatCompletion: vi.fn(async () => ({
    content: "ignored",
    tokensUsed: 25,
  })),
  jsonCompletion: vi.fn(async () => ({
    data: { callouts: llmCallouts },
    tokensUsed: 220,
  })),
}));

// Stripe stub (Manager Agent transitively imports it).
vi.mock("../server/companyOs/stripeClient", () => ({
  getStripeClient: vi.fn(async () => null),
  getStripeWebhookSecret: vi.fn(async () => null),
  getStripeSecretKey: vi.fn(async () => null),
  isStripeConfigured: vi.fn(async () => false),
}));

// Twilio REST capture — same pattern as the WhatsApp + Marketing suites.
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
  parseContractCommand,
  parseSignCommand,
  buildContractBody,
  buildContractBodyArabic,
  buildContractBodies,
  generateContract,
  getContractByToken,
  signContract,
  gatherDisputeData,
  gatherDisputeDailyTotals,
  renderDisputeRiskPdf,
  runDisputeRiskSummary,
  runVatCheck,
  DISPUTE_TREND_WINDOW_DAYS,
  VAT_HARD_THRESHOLD_AED,
  VAT_SOFT_THRESHOLD_AED,
} from "../server/companyOs/legalAgent";
import { createCompanyOsRouter } from "../server/companyOs/router";
import {
  handleContractSignPage,
  handleContractSignSubmit,
} from "../server/companyOs/contractSignRoute";

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
// parseContractCommand
// ===========================================================================
describe("parseContractCommand", () => {
  it("parses a well-formed command (defaults to English)", () => {
    const r = parseContractCommand(
      "contract Acme Studios | Palm Hotel | 10 hours photography for 1 week stay | 8500",
    );
    expect(r).toEqual({
      partyA: "Acme Studios",
      partyB: "Palm Hotel",
      exchange: "10 hours photography for 1 week stay",
      valueAed: 8500,
      language: "en",
    });
  });

  it("is case-insensitive on the keyword", () => {
    const r = parseContractCommand(
      "CONTRACT A | B | exchange detail | 100",
    );
    expect(r?.partyA).toBe("A");
    expect(r?.valueAed).toBe(100);
    expect(r?.language).toBe("en");
  });

  it("trims surrounding whitespace in each field", () => {
    const r = parseContractCommand(
      "contract   Alpha Co   |   Beta LLC   |   10 photos for 1 dinner   |   500.50",
    );
    expect(r?.partyA).toBe("Alpha Co");
    expect(r?.partyB).toBe("Beta LLC");
    expect(r?.exchange).toBe("10 photos for 1 dinner");
    expect(r?.valueAed).toBe(500.5);
  });

  it("rejects missing parts", () => {
    expect(parseContractCommand("contract")).toBeNull();
    expect(parseContractCommand("contract A | B | exchange")).toBeNull();
    expect(
      parseContractCommand("contract A | B | exchange | notanumber"),
    ).toBeNull();
  });

  it("rejects zero / negative values", () => {
    expect(parseContractCommand("contract A | B | x | 0")).toBeNull();
    // The regex itself rejects negatives (no `-` in the value capture).
    expect(parseContractCommand("contract A | B | x | -10")).toBeNull();
  });

  it("parses an `ar` language flag", () => {
    const r = parseContractCommand("contract A | B | x | 100 | ar");
    expect(r?.language).toBe("ar");
    expect(r?.valueAed).toBe(100);
  });

  it("parses a `bilingual` language flag (and the `bi` alias)", () => {
    const a = parseContractCommand("contract A | B | x | 100 | bilingual");
    expect(a?.language).toBe("bilingual");
    const b = parseContractCommand("contract A | B | x | 100 | bi");
    expect(b?.language).toBe("bilingual");
  });

  it("accepts long-form `english` / `arabic`", () => {
    expect(parseContractCommand("contract A | B | x | 100 | English")?.language).toBe("en");
    expect(parseContractCommand("contract A | B | x | 100 | Arabic")?.language).toBe("ar");
  });

  it("rejects an unrecognised language flag", () => {
    expect(parseContractCommand("contract A | B | x | 100 | fr")).toBeNull();
    expect(parseContractCommand("contract A | B | x | 100 | xx")).toBeNull();
  });
});

// ===========================================================================
// buildContractBody — UAE template + disclaimer
// ===========================================================================
describe("buildContractBody", () => {
  it("includes UAE jurisdiction, DIFC seat, and the AI disclaimer", () => {
    const body = buildContractBody({
      partyA: "Acme",
      partyB: "Beta",
      exchange: "X for Y",
      valueAed: 1000,
      date: "2026-04-25",
    });
    expect(body).toContain("BARTER EXCHANGE AGREEMENT");
    expect(body).toContain("United Arab Emirates");
    expect(body).toContain("UAE Federal Law No. (5) of 1985");
    expect(body).toContain("DIFC");
    expect(body).toContain("Acme");
    expect(body).toContain("Beta");
    expect(body).toContain("X for Y");
    expect(body).toContain("AED 1000.00");
    expect(body).toContain("Date: 2026-04-25");
    // Non-AI disclaimer is mandatory per the task spec.
    expect(body).toContain("AI-generated");
    expect(body).toContain("UAE-qualified lawyer");
  });
});

// ===========================================================================
// buildContractBodyArabic + buildContractBodies — Arabic / bilingual templates
// ===========================================================================
describe("buildContractBodyArabic", () => {
  it("includes Arabic UAE jurisdiction wording, parties, value, and disclaimer", () => {
    const body = buildContractBodyArabic({
      partyA: "Acme",
      partyB: "Beta",
      exchange: "X for Y",
      valueAed: 1000,
      date: "2026-04-25",
      language: "ar",
    });
    // Title and major Arabic legal anchors.
    expect(body).toContain("اتفاقية تبادل مقايضة");
    expect(body).toContain("الإمارات العربية المتحدة");
    expect(body).toContain("القانون الاتحادي رقم (5) لسنة 1985");
    expect(body).toContain("DIFC");
    expect(body).toContain("ضريبة القيمة المضافة");
    // Parties + value + date carried through.
    expect(body).toContain("Acme");
    expect(body).toContain("Beta");
    expect(body).toContain("X for Y");
    expect(body).toContain("AED 1000.00");
    expect(body).toContain("2026-04-25");
    // AI disclaimer (Arabic).
    expect(body).toContain("الذكاء الاصطناعي");
    expect(body).toContain("محامٍ مؤهل");
  });
});

describe("buildContractBodies", () => {
  const sample = {
    partyA: "Acme",
    partyB: "Beta",
    exchange: "X for Y",
    valueAed: 1000,
    date: "2026-04-25",
  };

  it("defaults to English when no language is passed", () => {
    const b = buildContractBodies({ ...sample });
    expect(b.en).toBeDefined();
    expect(b.ar).toBeUndefined();
    expect(b.en).toContain("BARTER EXCHANGE AGREEMENT");
  });

  it("returns only the Arabic body for `ar`", () => {
    const b = buildContractBodies({ ...sample, language: "ar" });
    expect(b.en).toBeUndefined();
    expect(b.ar).toBeDefined();
    expect(b.ar).toContain("اتفاقية تبادل مقايضة");
  });

  it("returns both bodies for `bilingual`", () => {
    const b = buildContractBodies({ ...sample, language: "bilingual" });
    expect(b.en).toContain("BARTER EXCHANGE AGREEMENT");
    expect(b.ar).toContain("اتفاقية تبادل مقايضة");
  });
});

// ===========================================================================
// generateContract — insert + PDF upload + signed URL + status update
// ===========================================================================
describe("generateContract", () => {
  it("inserts a contract row, uploads a PDF, returns a signed URL", async () => {
    const initialRow = {
      id: "doc-abc",
      documentType: "contract",
      title: "Barter contract: Acme ⇄ Beta (2026-04-25)",
      partyA: "Acme",
      partyB: "Beta",
      valueAed: "1000.00",
      body: "...",
      metadata: { exchange: "X for Y", date: "2026-04-25" },
      objectStorageKey: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbState.returningQueue = [
      [initialRow],
      [
        {
          ...initialRow,
          objectStorageKey: "companyOs/legal/doc-abc.pdf",
          status: "sent",
        },
      ],
    ];

    const result = await generateContract({
      partyA: "Acme",
      partyB: "Beta",
      exchange: "X for Y",
      valueAed: 1000,
      date: "2026-04-25",
    });

    expect(result.document.id).toBe("doc-abc");
    expect(result.document.objectStorageKey).toBe("companyOs/legal/doc-abc.pdf");
    // Lifecycle: contracts now flip to "sent" once the PDF is uploaded;
    // they only become "signed"/"active" after parties accept.
    expect(result.document.status).toBe("sent");
    expect(result.signedUrl).toContain(
      "https://signed.example/companyOs/legal/doc-abc.pdf",
    );
    // Per-party signing URLs are minted at insert time so they can be
    // shared via WhatsApp / email immediately.
    expect(result.signingUrls.partyA).toMatch(/\/contract\/sign\//);
    expect(result.signingUrls.partyB).toMatch(/\/contract\/sign\//);
    expect(result.signingUrls.partyA).not.toBe(result.signingUrls.partyB);
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].key).toBe("companyOs/legal/doc-abc.pdf");
    expect(uploadCalls[0].contentType).toBe("application/pdf");
    // jsPDF output sanity — a real PDF buffer is non-trivial in size.
    expect(uploadCalls[0].size).toBeGreaterThan(800);

    // Persisted insert payload uses our trimmed values. (Multiple inserts
    // happen — the contract row plus a `logLlmCall` audit log row — so we
    // filter by documentType rather than asserting an exact count.)
    const contractInsert = dbState.insertedValues.find(
      (r) => r.documentType === "contract",
    );
    expect(contractInsert).toBeDefined();
    expect(contractInsert!.partyA).toBe("Acme");
    expect(contractInsert!.partyB).toBe("Beta");
    expect(contractInsert!.valueAed).toBe("1000.00");
    expect(typeof contractInsert!.body).toBe("string");
    expect(String(contractInsert!.body)).toContain("DIFC");

    // The follow-up update patches storage key + status.
    expect(dbState.updatedSets).toHaveLength(1);
    const updated = dbState.updatedSets[0];
    expect(updated.objectStorageKey).toBe("companyOs/legal/doc-abc.pdf");
    expect(updated.status).toBe("sent");

    // Default language is English — metadata records it explicitly so
    // the admin dashboard can group / filter by language.
    expect((contractInsert!.metadata as { language?: string }).language).toBe("en");
  });

  it("renders an Arabic-only contract (PDF embeds the Arabic font)", async () => {
    const initialRow = {
      id: "doc-ar",
      documentType: "contract",
      title: "Barter contract: A ⇄ B (2026-04-25) [AR]",
      partyA: "A",
      partyB: "B",
      valueAed: "200.00",
      body: "...",
      metadata: { exchange: "x for y", date: "2026-04-25", language: "ar" },
      objectStorageKey: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbState.returningQueue = [
      [initialRow],
      [
        {
          ...initialRow,
          objectStorageKey: "companyOs/legal/doc-ar.pdf",
          status: "sent",
        },
      ],
    ];

    const result = await generateContract({
      partyA: "A",
      partyB: "B",
      exchange: "x for y",
      valueAed: 200,
      date: "2026-04-25",
      language: "ar",
    });

    expect(result.document.id).toBe("doc-ar");
    expect(result.document.title).toContain("[AR]");
    const contractInsert = dbState.insertedValues.find(
      (r) => r.documentType === "contract",
    );
    expect(contractInsert).toBeDefined();
    // Persisted body holds the Arabic template.
    expect(String(contractInsert!.body)).toContain("اتفاقية تبادل مقايضة");
    expect((contractInsert!.metadata as { language?: string }).language).toBe("ar");
    expect(uploadCalls).toHaveLength(1);
    // Arabic PDFs embed the Noto Sans Arabic TTF (~190 KB) so the file
    // is materially larger than the English-only output.
    expect(uploadCalls[0].size).toBeGreaterThan(50_000);
  });

  it("renders a bilingual contract (both English and Arabic bodies persisted)", async () => {
    const initialRow = {
      id: "doc-bi",
      documentType: "contract",
      title: "Barter contract: A ⇄ B (2026-04-25) [EN+AR]",
      partyA: "A",
      partyB: "B",
      valueAed: "200.00",
      body: "...",
      metadata: { exchange: "x for y", date: "2026-04-25", language: "bilingual" },
      objectStorageKey: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbState.returningQueue = [
      [initialRow],
      [
        {
          ...initialRow,
          objectStorageKey: "companyOs/legal/doc-bi.pdf",
          status: "sent",
        },
      ],
    ];

    const result = await generateContract({
      partyA: "A",
      partyB: "B",
      exchange: "x for y",
      valueAed: 200,
      language: "bilingual",
      date: "2026-04-25",
    });

    expect(result.document.title).toContain("[EN+AR]");
    const contractInsert = dbState.insertedValues.find(
      (r) => r.documentType === "contract",
    );
    expect(contractInsert).toBeDefined();
    const persistedBody = String(contractInsert!.body);
    expect(persistedBody).toContain("BARTER EXCHANGE AGREEMENT");
    expect(persistedBody).toContain("اتفاقية تبادل مقايضة");
    expect((contractInsert!.metadata as { language?: string }).language).toBe(
      "bilingual",
    );
    expect(uploadCalls[0].size).toBeGreaterThan(50_000);
  });

  it("falls back to English when an unknown language is forced", async () => {
    const initialRow = {
      id: "doc-fallback",
      documentType: "contract",
      title: "Barter contract: A ⇄ B (2026-04-25)",
      partyA: "A",
      partyB: "B",
      valueAed: "100.00",
      body: "...",
      metadata: {},
      objectStorageKey: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbState.returningQueue = [
      [initialRow],
      [{ ...initialRow, objectStorageKey: "companyOs/legal/doc-fallback.pdf", status: "sent" }],
    ];
    await generateContract({
      partyA: "A",
      partyB: "B",
      exchange: "x for y",
      valueAed: 100,
      // Type-cast to simulate a stale / corrupted value flowing in from
      // an external caller — we want to land on English, not crash.
      language: "fr" as unknown as "en",
      date: "2026-04-25",
    });
    const contractInsert = dbState.insertedValues.find(
      (r) => r.documentType === "contract",
    );
    expect((contractInsert!.metadata as { language?: string }).language).toBe("en");
    expect(String(contractInsert!.body)).toContain("BARTER EXCHANGE AGREEMENT");
    expect(String(contractInsert!.body)).not.toContain("اتفاقية");
  });
});

// ===========================================================================
// gatherDisputeData — aggregate counts; degrade to empty snapshot on error
// ===========================================================================
describe("gatherDisputeData", () => {
  it("aggregates report counts when the DB responds", async () => {
    // Order: byReason, byTarget, byStatus, total
    dbState.selectQueue = [
      [
        { reason: "scam", c: 5 },
        { reason: "spam", c: 2 },
      ],
      [
        { targetType: "listing", c: 4 },
        { targetType: "user", c: 3 },
      ],
      [
        { status: "pending", c: 6 },
        { status: "actioned", c: 1 },
      ],
      [{ c: 7 }],
    ];
    const snap = await gatherDisputeData(7);
    expect(snap.windowDays).toBe(7);
    expect(snap.totalReports).toBe(7);
    expect(snap.byReason).toEqual([
      { reason: "scam", count: 5 },
      { reason: "spam", count: 2 },
    ]);
    expect(snap.byTargetType[0]).toEqual({ targetType: "listing", count: 4 });
    expect(snap.byStatus[0]).toEqual({ status: "pending", count: 6 });
  });

  it("degrades to an empty snapshot when the DB throws", async () => {
    dbState.selectShouldThrow = true;
    const snap = await gatherDisputeData(7);
    expect(snap).toEqual({
      windowDays: 7,
      totalReports: 0,
      byReason: [],
      byTargetType: [],
      byStatus: [],
    });
  });
});

// ===========================================================================
// gatherDisputeDailyTotals — zero-filled daily series for the trend chart
// ===========================================================================
describe("gatherDisputeDailyTotals", () => {
  it("returns one entry per day in the window, zero-filled, sorted oldest → newest", async () => {
    dbState.selectQueue = [[]]; // No reports → all zeros.
    const series = await gatherDisputeDailyTotals(7);
    expect(series).toHaveLength(7);
    expect(series.every((d) => d.count === 0)).toBe(true);
    // Sorted ascending.
    for (let i = 1; i < series.length; i++) {
      expect(series[i - 1].date <= series[i].date).toBe(true);
    }
  });

  it("merges DB rows into the right buckets and leaves the others at zero", async () => {
    const today = new Date().toISOString().slice(0, 10);
    dbState.selectQueue = [[{ day: today, c: 5 }]];
    const series = await gatherDisputeDailyTotals(7);
    const todayBucket = series.find((d) => d.date === today);
    expect(todayBucket?.count).toBe(5);
    const others = series.filter((d) => d.date !== today);
    expect(others.every((d) => d.count === 0)).toBe(true);
  });

  it("degrades to a zero-filled series when the DB throws", async () => {
    dbState.selectShouldThrow = true;
    const series = await gatherDisputeDailyTotals(DISPUTE_TREND_WINDOW_DAYS);
    expect(series).toHaveLength(DISPUTE_TREND_WINDOW_DAYS);
    expect(series.every((d) => d.count === 0)).toBe(true);
  });
});

// ===========================================================================
// renderDisputeRiskPdf — produces a non-empty PDF buffer with the rollup
// ===========================================================================
describe("renderDisputeRiskPdf", () => {
  it("renders a PDF buffer that starts with the %PDF magic bytes", () => {
    const snapshot = {
      windowDays: 7,
      totalReports: 4,
      byReason: [
        { reason: "scam", count: 2 },
        { reason: "spam", count: 2 },
      ],
      byTargetType: [{ targetType: "listing", count: 4 }],
      byStatus: [{ status: "pending", count: 4 }],
    };
    const callouts = ["Watch out for scam reports.", "Tighten KYC."];
    const dailyTotals = Array.from({ length: 28 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      count: i % 3,
    }));
    const buf = renderDisputeRiskPdf(
      snapshot,
      callouts,
      dailyTotals,
      "2026-04-25",
    );
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
    // PDF magic.
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("renders even with empty snapshot data (cold-start week)", () => {
    const buf = renderDisputeRiskPdf(
      {
        windowDays: 7,
        totalReports: 0,
        byReason: [],
        byTargetType: [],
        byStatus: [],
      },
      [
        "No new reports filed this week — keep monitoring.",
        "Schedule a quarterly review.",
        "Re-confirm KYC.",
      ],
      [],
      "2026-04-25",
    );
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});

// ===========================================================================
// runDisputeRiskSummary — persists a `dispute_summary` row + LLM callouts
// ===========================================================================
describe("runDisputeRiskSummary", () => {
  it("aggregates, calls the LLM, persists a dispute_summary row, renders a PDF, and patches the storage key", async () => {
    dbState.selectQueue = [
      [{ reason: "scam", c: 3 }],
      [{ targetType: "listing", c: 3 }],
      [{ status: "pending", c: 3 }],
      [{ c: 3 }],
      // Daily totals trend select — partial coverage is fine; the
      // helper zero-fills the rest of the 28-day window.
      [
        { day: new Date().toISOString().slice(0, 10), c: 3 },
      ],
    ];
    dbState.returningQueue = [
      [
        {
          id: "summary-1",
          documentType: "dispute_summary",
          title: "Dispute risk summary · 2026-04-25",
          partyA: null,
          partyB: null,
          valueAed: null,
          body: "...",
          metadata: {},
          objectStorageKey: null,
          status: "generated",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      // Patch row after PDF upload — picks up the storage key.
      [
        {
          id: "summary-1",
          documentType: "dispute_summary",
          title: "Dispute risk summary · 2026-04-25",
          partyA: null,
          partyB: null,
          valueAed: null,
          body: "...",
          metadata: {},
          objectStorageKey: "companyOs/legal/dispute-summaries/summary-1.pdf",
          status: "generated",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ];

    const result = await runDisputeRiskSummary(7);
    expect(result.snapshot.totalReports).toBe(3);
    expect(result.callouts).toEqual(llmCallouts);
    expect(result.document?.documentType).toBe("dispute_summary");
    expect(dbState.insertedValues).toHaveLength(1);
    expect(dbState.insertedValues[0].documentType).toBe("dispute_summary");
    // Metadata now carries the daily totals series for the chart.
    const meta = dbState.insertedValues[0].metadata as Record<string, unknown>;
    expect(Array.isArray(meta.dailyTotals)).toBe(true);
    expect((meta.dailyTotals as unknown[]).length).toBe(28);
    // Body has the rolled-up counts AND the callouts.
    const body = String(dbState.insertedValues[0].body);
    expect(body).toContain("scam: 3");
    expect(body).toContain("Risk callouts:");
    // PDF was rendered, uploaded, and the row was patched with the key.
    expect(result.pdf).toBeInstanceOf(Buffer);
    expect((result.pdf as Buffer).length).toBeGreaterThan(0);
    expect(result.pdfStorageKey).toBe(
      "companyOs/legal/dispute-summaries/summary-1.pdf",
    );
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].key).toBe(
      "companyOs/legal/dispute-summaries/summary-1.pdf",
    );
    expect(uploadCalls[0].contentType).toBe("application/pdf");
    expect(dbState.updatedSets).toHaveLength(1);
    expect(dbState.updatedSets[0].objectStorageKey).toBe(
      "companyOs/legal/dispute-summaries/summary-1.pdf",
    );
    expect(result.document?.objectStorageKey).toBe(
      "companyOs/legal/dispute-summaries/summary-1.pdf",
    );
  });

  it("produces hand-crafted fallback callouts when totalReports == 0", async () => {
    // Empty selects across the board (4 from gatherDisputeData + 1 from
    // gatherDisputeDailyTotals).
    dbState.selectQueue = [[], [], [], [{ c: 0 }], []];
    dbState.returningQueue = [
      [
        {
          id: "summary-empty",
          documentType: "dispute_summary",
          title: "Dispute risk summary · today",
          partyA: null,
          partyB: null,
          valueAed: null,
          body: "...",
          metadata: {},
          objectStorageKey: null,
          status: "generated",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      // PDF-upload patch row.
      [
        {
          id: "summary-empty",
          documentType: "dispute_summary",
          title: "Dispute risk summary · today",
          partyA: null,
          partyB: null,
          valueAed: null,
          body: "...",
          metadata: {},
          objectStorageKey:
            "companyOs/legal/dispute-summaries/summary-empty.pdf",
          status: "generated",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ];
    const result = await runDisputeRiskSummary(7);
    expect(result.snapshot.totalReports).toBe(0);
    expect(result.callouts).toHaveLength(3);
    // The cold-start callouts are hard-coded so we can assert the first one.
    expect(result.callouts[0]).toContain("No new reports");
    // PDF still renders even with no incidents — provides the founder's
    // archival "quiet week" record.
    expect(result.pdf).toBeInstanceOf(Buffer);
    expect(result.pdfStorageKey).toBe(
      "companyOs/legal/dispute-summaries/summary-empty.pdf",
    );
  });
});

// ===========================================================================
// runVatCheck — flag soft + hard threshold users; persist only when needed
// ===========================================================================
describe("runVatCheck", () => {
  it("flags users at/over the soft and hard UAE VAT thresholds", async () => {
    dbState.executeQueue = [
      {
        rows: [
          {
            user_id: "u1",
            email: "alice@example.com",
            full_name: "Alice",
            total_aed: "200000.00",
            deals_count: "12",
          },
          {
            user_id: "u2",
            email: "bob@example.com",
            full_name: "Bob",
            total_aed: "160000.00",
            deals_count: "8",
          },
        ],
      },
    ];
    // The second SELECT chain is the totals row.
    dbState.selectQueue = [[{ totalAed: "500000.00", dealsCount: 50 }]];
    dbState.returningQueue = [
      [
        {
          id: "vat-1",
          documentType: "vat_flag",
          title: "VAT threshold check · today",
          partyA: null,
          partyB: null,
          valueAed: "500000.00",
          body: "...",
          metadata: {},
          objectStorageKey: null,
          status: "generated",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ];

    const result = await runVatCheck();
    expect(result.snapshot.softThresholdAed).toBe(VAT_SOFT_THRESHOLD_AED);
    expect(result.snapshot.hardThresholdAed).toBe(VAT_HARD_THRESHOLD_AED);
    expect(result.snapshot.totalCompletedAed).toBe(500000);
    expect(result.snapshot.totalCompletedDeals).toBe(50);
    expect(result.snapshot.flagged).toHaveLength(2);
    expect(result.snapshot.overCount).toBe(1);
    expect(result.snapshot.approachingCount).toBe(1);

    const alice = result.snapshot.flagged.find((u) => u.userId === "u1")!;
    const bob = result.snapshot.flagged.find((u) => u.userId === "u2")!;
    expect(alice.overThreshold).toBe(true);
    expect(alice.approachingThreshold).toBe(false);
    expect(bob.overThreshold).toBe(false);
    expect(bob.approachingThreshold).toBe(true);

    // A row was persisted because at least one user is flagged.
    expect(result.document?.documentType).toBe("vat_flag");
    expect(dbState.insertedValues).toHaveLength(1);
    expect(dbState.insertedValues[0].documentType).toBe("vat_flag");
  });

  it("does NOT persist a vat_flag row when nothing is flagged", async () => {
    dbState.executeQueue = [{ rows: [] }];
    dbState.selectQueue = [[{ totalAed: "0.00", dealsCount: 0 }]];
    const result = await runVatCheck();
    expect(result.snapshot.flagged).toHaveLength(0);
    expect(result.snapshot.overCount).toBe(0);
    expect(result.snapshot.approachingCount).toBe(0);
    expect(result.document).toBeNull();
    expect(dbState.insertedValues).toHaveLength(0);
  });

  it("degrades to an empty snapshot when the SQL fails", async () => {
    dbState.executeShouldThrow = true;
    const result = await runVatCheck();
    expect(result.snapshot.flagged).toEqual([]);
    expect(result.snapshot.totalCompletedAed).toBe(0);
    expect(result.document).toBeNull();
  });
});

// ===========================================================================
// Manager Agent integration via the WhatsApp webhook
// ===========================================================================
describe("Manager Agent — legal commands via WhatsApp webhook", () => {
  it("`help` lists the new legal commands", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "help");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("`contract <A>");
    expect(reply).toContain("`dispute risk`");
    expect(reply).toContain("`vat check`");
  });

  it("`contract ...` drafts a contract, uploads PDF, and returns a signed URL", async () => {
    const initialRow = {
      id: "doc-wa",
      documentType: "contract",
      title: "Barter contract: A ⇄ B",
      partyA: "A",
      partyB: "B",
      valueAed: "200.00",
      body: "...",
      metadata: {},
      objectStorageKey: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbState.returningQueue = [
      [initialRow],
      [
        {
          ...initialRow,
          objectStorageKey: "companyOs/legal/doc-wa.pdf",
          status: "sent",
        },
      ],
    ];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "contract A | B | x for y | 200",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Contract drafted");
    expect(reply).toContain("A ⇄ B");
    expect(reply).toContain("AED 200.00");
    expect(reply).toContain("Language: English");
    expect(reply).toContain("https://signed.example/companyOs/legal/doc-wa.pdf");
    expect(reply).toContain("UAE-qualified lawyer");
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].contentType).toBe("application/pdf");
  });

  it("`contract ... | ar` drafts an Arabic-only contract", async () => {
    const initialRow = {
      id: "doc-wa-ar",
      documentType: "contract",
      title: "Barter contract: A ⇄ B [AR]",
      partyA: "A",
      partyB: "B",
      valueAed: "200.00",
      body: "...",
      metadata: { language: "ar" },
      objectStorageKey: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbState.returningQueue = [
      [initialRow],
      [
        {
          ...initialRow,
          objectStorageKey: "companyOs/legal/doc-wa-ar.pdf",
          status: "sent",
        },
      ],
    ];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "contract A | B | x for y | 200 | ar",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Contract drafted");
    expect(reply).toContain("Language: Arabic");
    expect(reply).toContain("https://signed.example/companyOs/legal/doc-wa-ar.pdf");
    const contractInsert = dbState.insertedValues.find(
      (r) => r.documentType === "contract",
    );
    expect((contractInsert!.metadata as { language?: string }).language).toBe("ar");
    expect(String(contractInsert!.body)).toContain("اتفاقية تبادل مقايضة");
  });

  it("`contract ... | bilingual` drafts an EN+AR contract", async () => {
    const initialRow = {
      id: "doc-wa-bi",
      documentType: "contract",
      title: "Barter contract: A ⇄ B [EN+AR]",
      partyA: "A",
      partyB: "B",
      valueAed: "200.00",
      body: "...",
      metadata: { language: "bilingual" },
      objectStorageKey: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbState.returningQueue = [
      [initialRow],
      [
        {
          ...initialRow,
          objectStorageKey: "companyOs/legal/doc-wa-bi.pdf",
          status: "sent",
        },
      ],
    ];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "contract A | B | x for y | 200 | bilingual",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Language: Bilingual (EN + AR)");
  });

  it("`contract` with bad syntax returns the usage hint without DB write", async () => {
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      "contract just one part",
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Usage:");
    expect(dbState.insertedValues).toHaveLength(0);
    expect(uploadCalls).toHaveLength(0);
  });

  it("`dispute risk` returns the rollup + callouts", async () => {
    dbState.selectQueue = [
      [{ reason: "scam", c: 2 }],
      [{ targetType: "user", c: 2 }],
      [{ status: "pending", c: 2 }],
      [{ c: 2 }],
      // gatherDisputeDailyTotals select.
      [],
    ];
    dbState.returningQueue = [
      [
        {
          id: "summary-2",
          documentType: "dispute_summary",
          title: "Dispute risk summary · today",
          partyA: null,
          partyB: null,
          valueAed: null,
          body: "...",
          metadata: {},
          objectStorageKey: null,
          status: "generated",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      // PDF-upload patch row.
      [
        {
          id: "summary-2",
          documentType: "dispute_summary",
          title: "Dispute risk summary · today",
          partyA: null,
          partyB: null,
          valueAed: null,
          body: "...",
          metadata: {},
          objectStorageKey: "companyOs/legal/dispute-summaries/summary-2.pdf",
          status: "generated",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "dispute risk");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Dispute risk · last 7 days");
    expect(reply).toContain("Total reports: 2");
    expect(reply).toContain("scam: 2");
    expect(reply).toContain("Risk callouts");
    expect(reply).toContain(llmCallouts[0]);
  });

  it("`vat check` reports flagged users", async () => {
    dbState.executeQueue = [
      {
        rows: [
          {
            user_id: "u-over",
            email: "x@x.com",
            full_name: "Over Threshold Co",
            total_aed: "200000.00",
            deals_count: "10",
          },
        ],
      },
    ];
    dbState.selectQueue = [[{ totalAed: "200000.00", dealsCount: 10 }]];
    dbState.returningQueue = [
      [
        {
          id: "vat-2",
          documentType: "vat_flag",
          title: "VAT threshold check · today",
          partyA: null,
          partyB: null,
          valueAed: "200000.00",
          body: "...",
          metadata: {},
          objectStorageKey: null,
          status: "generated",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "vat check");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("UAE VAT check");
    expect(reply).toContain("187,500");
    expect(reply).toContain("Users at/over threshold: 1");
    expect(reply).toContain("Over Threshold Co");
    expect(reply).toContain("[OVER]");
  });

  it("`vat check` with no flagged users says so without persisting a row", async () => {
    dbState.executeQueue = [{ rows: [] }];
    dbState.selectQueue = [[{ totalAed: "1000.00", dealsCount: 1 }]];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "vat check");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("UAE VAT check");
    expect(reply).toContain("Users at/over threshold: 0");
    expect(reply).toContain("No users flagged");
    expect(dbState.insertedValues).toHaveLength(0);
  });
});

// ===========================================================================
// HTTP route smoke tests — admin surface for the future dashboard.
// ===========================================================================
describe("HTTP routes — /api/company-os/legal/*", () => {
  it("POST /legal/contract with structured body returns the doc + signed URL", async () => {
    const initialRow = {
      id: "doc-http",
      documentType: "contract",
      title: "Barter contract",
      partyA: "Foo Co",
      partyB: "Bar LLC",
      valueAed: "1500.00",
      body: "...",
      metadata: {},
      objectStorageKey: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbState.returningQueue = [
      [initialRow],
      [
        {
          ...initialRow,
          objectStorageKey: "companyOs/legal/doc-http.pdf",
          status: "sent",
        },
      ],
    ];
    const app = buildApp();
    const res = await request(app)
      .post("/api/company-os/legal/contract")
      .send({
        partyA: "Foo Co",
        partyB: "Bar LLC",
        exchange: "10 hours of consulting for 1 month coworking",
        valueAed: 1500,
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.document.id).toBe("doc-http");
    expect(res.body.signedUrl).toContain(
      "companyOs/legal/doc-http.pdf",
    );
  });

  it("POST /legal/contract with invalid body returns 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/company-os/legal/contract")
      .send({ partyA: "", partyB: "x", exchange: "", valueAed: -1 });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("POST /legal/contract accepts a `language` field and persists it", async () => {
    const initialRow = {
      id: "doc-http-ar",
      documentType: "contract",
      title: "Barter contract [AR]",
      partyA: "Foo",
      partyB: "Bar",
      valueAed: "100.00",
      body: "...",
      metadata: { language: "ar" },
      objectStorageKey: null,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbState.returningQueue = [
      [initialRow],
      [{ ...initialRow, objectStorageKey: "companyOs/legal/doc-http-ar.pdf", status: "sent" }],
    ];
    const app = buildApp();
    const res = await request(app)
      .post("/api/company-os/legal/contract")
      .send({
        partyA: "Foo",
        partyB: "Bar",
        exchange: "x for y",
        valueAed: 100,
        language: "ar",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const contractInsert = dbState.insertedValues.find(
      (r) => r.documentType === "contract",
    );
    expect((contractInsert!.metadata as { language?: string }).language).toBe("ar");
  });

  it("POST /legal/contract rejects an unknown `language` value", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/company-os/legal/contract")
      .send({
        partyA: "Foo",
        partyB: "Bar",
        exchange: "x for y",
        valueAed: 100,
        language: "fr",
      });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("GET /legal/documents returns recent documents", async () => {
    dbState.selectQueue = [
      [
        {
          id: "d1",
          documentType: "contract",
          title: "Some contract",
          createdAt: new Date(),
        },
      ],
    ];
    const app = buildApp();
    const res = await request(app).get("/api/company-os/legal/documents");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.documents[0].id).toBe("d1");
  });

  it("GET /legal/vat-check returns the snapshot", async () => {
    dbState.executeQueue = [{ rows: [] }];
    dbState.selectQueue = [[{ totalAed: "0", dealsCount: 0 }]];
    const app = buildApp();
    const res = await request(app).get("/api/company-os/legal/vat-check");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.snapshot.softThresholdAed).toBe(VAT_SOFT_THRESHOLD_AED);
    expect(res.body.snapshot.hardThresholdAed).toBe(VAT_HARD_THRESHOLD_AED);
  });
});

// ===========================================================================
// Per-party e-signature flow (Task #74)
// ===========================================================================

// Helper that builds a typical "sent" contract row, optionally with
// one party's signature already recorded.
function makeContractRow(opts: {
  id?: string;
  status?: "sent" | "signed" | "active" | "draft" | "generated";
  partyASignedAt?: Date | null;
  partyASignedName?: string | null;
  partyBSignedAt?: Date | null;
  partyBSignedName?: string | null;
  signatureTokenA?: string;
  signatureTokenB?: string;
} = {}): AnyRow {
  return {
    id: opts.id ?? "doc-sign",
    documentType: "contract",
    title: "Barter contract: Acme ⇄ Beta (2026-04-25)",
    partyA: "Acme",
    partyB: "Beta",
    valueAed: "1000.00",
    body: "BARTER EXCHANGE AGREEMENT…",
    metadata: { exchange: "X for Y", date: "2026-04-25", language: "en" },
    objectStorageKey: "companyOs/legal/doc-sign.pdf",
    status: opts.status ?? "sent",
    signatureTokenA: opts.signatureTokenA ?? "tokenA12345678901234567890",
    signatureTokenB: opts.signatureTokenB ?? "tokenB12345678901234567890",
    partyASignedAt: opts.partyASignedAt ?? null,
    partyASignedName: opts.partyASignedName ?? null,
    partyASignedIp: null,
    partyBSignedAt: opts.partyBSignedAt ?? null,
    partyBSignedName: opts.partyBSignedName ?? null,
    partyBSignedIp: null,
    signedObjectStorageKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("parseSignCommand", () => {
  it("parses a `sign <token> <name>` command", () => {
    expect(parseSignCommand("sign abc123 John Doe")).toEqual({
      token: "abc123",
      signerName: "John Doe",
    });
  });
  it("is case-insensitive on the keyword and trims input", () => {
    expect(parseSignCommand("  SIGN   tok  Jane  ")).toEqual({
      token: "tok",
      signerName: "Jane",
    });
  });
  it("rejects missing parts", () => {
    expect(parseSignCommand("sign")).toBeNull();
    expect(parseSignCommand("sign abc")).toBeNull();
  });
  it("clamps an excessively long signer name", () => {
    const r = parseSignCommand(`sign tok ${"x".repeat(300)}`);
    expect(r?.signerName.length).toBe(200);
  });
});

describe("getContractByToken", () => {
  it("returns null for an empty or unknown token", async () => {
    dbState.selectQueue = [[]];
    expect(await getContractByToken("")).toBeNull();
    dbState.selectQueue = [[]];
    expect(await getContractByToken("nope")).toBeNull();
  });

  it("returns partyA when the token matches signatureTokenA", async () => {
    const row = makeContractRow({ signatureTokenA: "AAA111BBB222CCC333DDD" });
    dbState.selectQueue = [[row]];
    const r = await getContractByToken("AAA111BBB222CCC333DDD");
    expect(r?.party).toBe("partyA");
    expect(r?.document.id).toBe("doc-sign");
  });

  it("returns partyB when the token matches signatureTokenB", async () => {
    const row = makeContractRow({ signatureTokenB: "BBB111AAA222CCC333DDD" });
    dbState.selectQueue = [[row]];
    const r = await getContractByToken("BBB111AAA222CCC333DDD");
    expect(r?.party).toBe("partyB");
  });

  it("ignores non-contract document types defensively", async () => {
    dbState.selectQueue = [[
      { ...makeContractRow(), documentType: "dispute_summary" },
    ]];
    expect(await getContractByToken("any")).toBeNull();
  });
});

describe("signContract", () => {
  it("records partyA's signature and flips status to 'signed'", async () => {
    const row = makeContractRow();
    // Two select calls happen inside signContract on the bothSigned=false
    // path: one for getContractByToken, none after the update.
    dbState.selectQueue = [[row]];
    dbState.returningQueue = [
      [{ ...row, status: "signed", partyASignedAt: new Date(), partyASignedName: "Alice" }],
    ];

    const r = await signContract({
      token: row.signatureTokenA as string,
      signerName: "Alice",
      signerIp: "1.2.3.4",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.party).toBe("partyA");
    expect(r.bothSigned).toBe(false);
    expect(r.document.status).toBe("signed");
    expect(r.signedPdfKey).toBeNull();
    // The update payload includes the per-party signature columns + IP.
    const update = dbState.updatedSets[0];
    expect(update.status).toBe("signed");
    expect(update.partyASignedName).toBe("Alice");
    expect(update.partyASignedIp).toBe("1.2.3.4");
    // No signed-PDF upload yet — only after both parties sign.
    expect(uploadCalls).toHaveLength(0);
  });

  it("when partyB signs after partyA, flips to 'active' and uploads the signed PDF", async () => {
    const row = makeContractRow({
      status: "signed",
      partyASignedAt: new Date("2026-04-24T10:00:00Z"),
      partyASignedName: "Alice",
    });
    dbState.selectQueue = [[row]];
    dbState.returningQueue = [
      // First update — status flips to active, partyB columns recorded.
      [{ ...row, status: "active", partyBSignedAt: new Date(), partyBSignedName: "Bob" }],
      // Second update — signedObjectStorageKey patched in.
      [{
        ...row,
        status: "active",
        partyBSignedAt: new Date(),
        partyBSignedName: "Bob",
        signedObjectStorageKey: `companyOs/legal/${row.id}-signed.pdf`,
      }],
    ];

    const r = await signContract({
      token: row.signatureTokenB as string,
      signerName: "Bob",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bothSigned).toBe(true);
    expect(r.document.status).toBe("active");
    expect(r.signedPdfKey).toBe(`companyOs/legal/${row.id}-signed.pdf`);
    expect(r.signedPdfUrl).toContain("signed.example");
    // The signed PDF was uploaded with a distinct "<id>-signed.pdf" key.
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].key).toBe(`companyOs/legal/${row.id}-signed.pdf`);
    expect(uploadCalls[0].contentType).toBe("application/pdf");
  });

  it("returns 'already_signed' when the same party signs twice", async () => {
    const row = makeContractRow({
      status: "signed",
      partyASignedAt: new Date(),
      partyASignedName: "Alice",
    });
    dbState.selectQueue = [[row]];
    const r = await signContract({
      token: row.signatureTokenA as string,
      signerName: "Alice",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("already_signed");
    expect(dbState.updatedSets).toHaveLength(0);
  });

  it("returns 'wrong_status' for a draft or already-active contract", async () => {
    dbState.selectQueue = [[makeContractRow({ status: "draft" })]];
    const r1 = await signContract({ token: "tokenA12345678901234567890", signerName: "X" });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe("wrong_status");

    dbState.selectQueue = [[makeContractRow({
      status: "active",
      partyASignedAt: new Date(),
      partyASignedName: "Alice",
      partyBSignedAt: new Date(),
      partyBSignedName: "Bob",
    })]];
    const r2 = await signContract({ token: "tokenA12345678901234567890", signerName: "X" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe("wrong_status");
  });

  it("returns 'not_found' for an unknown token", async () => {
    dbState.selectQueue = [[]];
    const r = await signContract({ token: "nosuch", signerName: "X" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_found");
  });

  it("returns 'missing_name' when the signer name is blank", async () => {
    dbState.selectQueue = [[makeContractRow()]];
    const r = await signContract({ token: "tokenA12345678901234567890", signerName: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("missing_name");
  });
});

// ===========================================================================
// `sign` WhatsApp command — wired from managerAgent through the webhook
// ===========================================================================
describe("Manager Agent · `sign` command", () => {
  it("records a signature and replies with the new status", async () => {
    const row = makeContractRow();
    dbState.selectQueue = [[row]];
    dbState.returningQueue = [
      [{ ...row, status: "signed", partyASignedAt: new Date(), partyASignedName: "Alice" }],
    ];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      `sign ${row.signatureTokenA} Alice`,
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Signed");
    expect(reply).toContain("Acme");
    expect(reply).toContain("Status: signed");
    // Until partyB signs we should be told what link to share.
    expect(reply).toContain("Waiting on Beta");
    expect(reply).toContain("/contract/sign/");
  });

  it("on the second signature reports 'active' + signed-PDF URL", async () => {
    const row = makeContractRow({
      status: "signed",
      partyASignedAt: new Date(),
      partyASignedName: "Alice",
    });
    dbState.selectQueue = [[row]];
    dbState.returningQueue = [
      [{ ...row, status: "active", partyBSignedAt: new Date(), partyBSignedName: "Bob" }],
      [{
        ...row,
        status: "active",
        partyBSignedAt: new Date(),
        partyBSignedName: "Bob",
        signedObjectStorageKey: `companyOs/legal/${row.id}-signed.pdf`,
      }],
    ];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(
      app,
      `sign ${row.signatureTokenB} Bob`,
    );
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply).toContain("Status: active");
    expect(reply).toContain("Both parties have signed");
    expect(reply).toContain(`signed.example/companyOs/legal/${row.id}-signed.pdf`);
  });

  it("rejects bad tokens with a friendly error", async () => {
    dbState.selectQueue = [[]];
    const app = buildApp();
    const { httpRes, sendPromise } = await postWebhook(app, "sign nosuch Alice");
    expect(httpRes.status).toBe(200);
    await sendPromise;
    const reply = hoisted.sendCalls[0]?.body ?? "";
    expect(reply.toLowerCase()).toContain("couldn't find");
  });
});

// ===========================================================================
// Public HTTP signing route — GET renders the page, POST records the signature
// ===========================================================================
describe("/contract/sign/:token route", () => {
  function mkApp() {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.get("/contract/sign/:token", handleContractSignPage);
    app.post("/contract/sign/:token", handleContractSignSubmit);
    return app;
  }

  it("GET renders contract summary + signature form for a valid token", async () => {
    const row = makeContractRow();
    dbState.selectQueue = [[row]];
    const res = await request(mkApp()).get(
      `/contract/sign/${row.signatureTokenA}`,
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("Sign contract");
    expect(res.text).toContain("Acme");
    expect(res.text).toContain("Beta");
    expect(res.text).toContain("AED 1000.00");
    // Form is present (not disabled).
    expect(res.text).toContain('name="signerName"');
    expect(res.text).toContain('name="agree"');
  });

  it("GET returns 404 HTML for an unknown token", async () => {
    dbState.selectQueue = [[]];
    const res = await request(mkApp()).get(
      `/contract/sign/${"x".repeat(20)}`,
    );
    expect(res.status).toBe(404);
    expect(res.text).toContain("Contract not found");
  });

  it("GET returns 404 for a malformed token (defensive)", async () => {
    const res = await request(mkApp()).get("/contract/sign/short");
    expect(res.status).toBe(404);
    // No DB read should have happened.
    expect(res.text).toContain("Contract not found");
  });

  it("POST without consent re-renders the form with an error", async () => {
    const row = makeContractRow();
    dbState.selectQueue = [[row]];
    const res = await request(mkApp())
      .post(`/contract/sign/${row.signatureTokenA}`)
      .type("form")
      .send({ signerName: "Alice" });
    expect(res.status).toBe(400);
    expect(res.text).toContain("tick the consent box");
    expect(dbState.updatedSets).toHaveLength(0);
  });

  it("POST with consent + name records the signature and shows confirmation", async () => {
    const row = makeContractRow();
    dbState.selectQueue = [
      [row], // GET inside handleContractSignSubmit
      [row], // signContract → getContractByToken
    ];
    dbState.returningQueue = [
      [{ ...row, status: "signed", partyASignedAt: new Date(), partyASignedName: "Alice" }],
    ];
    const res = await request(mkApp())
      .post(`/contract/sign/${row.signatureTokenA}`)
      .type("form")
      .send({ signerName: "Alice", agree: "on" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Signed");
    expect(res.text).toContain("Waiting for Beta to sign");
    const update = dbState.updatedSets[0];
    expect(update.status).toBe("signed");
    expect(update.partyASignedName).toBe("Alice");
  });

  it("POST as the second party flips status to active and uploads signed PDF", async () => {
    const row = makeContractRow({
      status: "signed",
      partyASignedAt: new Date(),
      partyASignedName: "Alice",
    });
    dbState.selectQueue = [
      [row], // GET inside handleContractSignSubmit
      [row], // signContract → getContractByToken
    ];
    dbState.returningQueue = [
      [{ ...row, status: "active", partyBSignedAt: new Date(), partyBSignedName: "Bob" }],
      [{
        ...row,
        status: "active",
        partyBSignedAt: new Date(),
        partyBSignedName: "Bob",
        signedObjectStorageKey: `companyOs/legal/${row.id}-signed.pdf`,
      }],
    ];
    const res = await request(mkApp())
      .post(`/contract/sign/${row.signatureTokenB}`)
      .type("form")
      .send({ signerName: "Bob", agree: "on" });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Both parties have signed");
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].key).toBe(`companyOs/legal/${row.id}-signed.pdf`);
  });

  it("POST as a party who already signed shows 'already signed'", async () => {
    const row = makeContractRow({
      status: "signed",
      partyASignedAt: new Date(),
      partyASignedName: "Alice",
    });
    dbState.selectQueue = [
      [row], // initial GET
      [row], // signContract lookup
    ];
    const res = await request(mkApp())
      .post(`/contract/sign/${row.signatureTokenA}`)
      .type("form")
      .send({ signerName: "Alice", agree: "on" });
    expect(res.status).toBe(400);
    expect(res.text.toLowerCase()).toContain("already signed");
  });
});
