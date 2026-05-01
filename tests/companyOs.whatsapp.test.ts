// End-to-end tests for the WhatsApp control plane (`/api/company-os/whatsapp`).
//
// The router uses the 200-then-process pattern: it returns an empty 200 to
// Twilio immediately and dispatches the actual reply via the Twilio REST
// API in the background. These tests therefore:
//   • Mount the router on a tiny Express app with the same body parser used
//     in production (`express.urlencoded`).
//   • Mock `sendWhatsApp` to capture outbound replies and signal completion
//     of the background task.
//   • Stub `db` (drizzle) and the Stripe client so each command path
//     returns its "no data yet" branch without touching Postgres.
//   • Exercise help / revenue / revenue week / status / agents / costs / a
//     free-form prompt, plus the founder ACL and Twilio signature gate.
//
// Signature validation runs in a dedicated `NODE_ENV=production` block —
// the rest of the suite uses the dev-mode permissive path so the tests
// don't have to compute a valid HMAC for every command.

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
// Environment: must be set before any module that reads it is imported.
// ---------------------------------------------------------------------------
const ORIGINAL_ENV = { ...process.env };

process.env.TWILIO_ACCOUNT_SID = "ACtest00000000000000000000000000000";
process.env.TWILIO_AUTH_TOKEN = "test_auth_token_for_signing";
process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
process.env.FOUNDER_WHATSAPP_NUMBER = "whatsapp:+971500000000";
process.env.COMPANY_OS_MONTHLY_BUDGET_AED = "400";
process.env.USD_TO_AED_RATE = "3.6725";

const FOUNDER_FROM = process.env.FOUNDER_WHATSAPP_NUMBER!;
const NON_FOUNDER_FROM = "whatsapp:+10000000001";
const TWILIO_TO = process.env.TWILIO_WHATSAPP_FROM!;
const FORWARDED_HOST = "bareter.test";
const WEBHOOK_PATH = "/api/company-os/whatsapp";
const ABSOLUTE_WEBHOOK_URL = `https://${FORWARDED_HOST}${WEBHOOK_PATH}`;

// ---------------------------------------------------------------------------
// Drizzle DB stub — every chained call resolves to an empty array, which is
// exactly what each command's "no data yet" branch expects.
// ---------------------------------------------------------------------------
function makeChain(resolveTo: () => unknown[]): any {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    groupBy: () => chain,
    values: () => chain,
    onConflictDoUpdate: () => chain,
    then: (onF: any, onR: any) =>
      Promise.resolve(resolveTo()).then(onF, onR),
    catch: (onR: any) => Promise.resolve(resolveTo()).catch(onR),
    finally: (onF: any) => Promise.resolve(resolveTo()).finally(onF),
  };
  return chain;
}

vi.mock("../server/db", () => ({
  db: {
    select: () => makeChain(() => []),
    insert: () => makeChain(() => []),
    update: () => makeChain(() => []),
    delete: () => makeChain(() => []),
  },
}));

// Stripe client → null (Twilio webhook flow never needs Stripe; the finance
// agent's `aggregateChargesForDate` short-circuits to zero when null).
vi.mock("../server/companyOs/stripeClient", () => ({
  getStripeClient: vi.fn(async () => null),
  getStripeWebhookSecret: vi.fn(async () => null),
  getStripeSecretKey: vi.fn(async () => null),
  isStripeConfigured: vi.fn(async () => false),
}));

// LLM stub for the free-form path. The mock returns a recognisable canned
// reply so we can assert the Manager Agent forwarded the founder's
// question to the broker and surfaced the answer over WhatsApp.
const FREEFORM_REPLY = "Mock LLM reply: revenue is steady.";
vi.mock("../server/agents/llm", () => ({
  chatCompletion: vi.fn(async () => ({
    content: FREEFORM_REPLY,
    tokensUsed: 42,
  })),
  jsonCompletion: vi.fn(),
}));

// Capture outbound WhatsApp messages. We keep the real
// `validateTwilioRequest` and `isFromFounder` so the security gates are
// exercised end-to-end; only the network-touching `sendWhatsApp` is stubbed.
//
// `vi.hoisted` is used so the captured state survives the hoisting that
// `vi.mock` performs — otherwise the factory would reference variables
// before they're initialised.
const hoisted = vi.hoisted(() => {
  const sendCalls: Array<{ to: string; body: string }> = [];
  const state: {
    resolveNextSend: (() => void) | null;
    // When set, overrides the budget verdict returned by costTracker so
    // tests can exercise the over-budget free-form refusal path.
    budgetOverride: {
      safe: boolean;
      spentAed: number;
      budgetAed: number;
      remainingAed: number;
      pctUsed: number;
    } | null;
  } = {
    resolveNextSend: null,
    budgetOverride: null,
  };
  return { sendCalls, state };
});

vi.mock("../server/companyOs/costTracker", async () => {
  const actual = await vi.importActual<
    typeof import("../server/companyOs/costTracker")
  >("../server/companyOs/costTracker");
  return {
    ...actual,
    getBudgetVerdict: async () => {
      if (hoisted.state.budgetOverride) return hoisted.state.budgetOverride;
      return actual.getBudgetVerdict();
    },
  };
});

vi.mock("../server/companyOs/twilio", async () => {
  const actual = await vi.importActual<
    typeof import("../server/companyOs/twilio")
  >("../server/companyOs/twilio");
  const { vi: vitestVi } = await import("vitest");
  return {
    ...actual,
    sendWhatsApp: vitestVi.fn(async (to: string, body: string) => {
      hoisted.sendCalls.push({ to, body });
      const r = hoisted.state.resolveNextSend;
      hoisted.state.resolveNextSend = null;
      if (r) r();
      return true;
    }),
  };
});

const sendCalls = hoisted.sendCalls;

// Imported AFTER the mocks so the router picks up the stubbed deps.
import { createCompanyOsRouter } from "../server/companyOs/router";
import { chatCompletion } from "../server/agents/llm";

function buildApp() {
  const app = express();
  // Production mounts this same parser at the same path in server/index.ts.
  app.use(WEBHOOK_PATH, express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(
    "/api/company-os",
    createCompanyOsRouter({
      // requireAdmin isn't exercised by the webhook tests; pass a no-op.
      requireAdmin: (_req, _res, next) => next(),
    }),
  );
  return app;
}

interface PostWebhookOpts {
  body: string;
  from?: string;
  signature?: string;
  expectReply?: boolean;
}

/**
 * POST a Twilio-shaped form payload to the webhook. By default, schedules a
 * deferred promise that resolves when `sendWhatsApp` is invoked, so callers
 * can `await` the background reply.
 */
async function postWebhook(app: express.Express, opts: PostWebhookOpts) {
  const params: Record<string, string> = {
    AccountSid: process.env.TWILIO_ACCOUNT_SID!,
    From: opts.from ?? FOUNDER_FROM,
    To: TWILIO_TO,
    Body: opts.body,
    NumMedia: "0",
    MessageSid: `SM${crypto.randomBytes(16).toString("hex")}`,
  };

  let sendPromise: Promise<void> | null = null;
  if (opts.expectReply !== false) {
    sendPromise = new Promise<void>((resolve) => {
      hoisted.state.resolveNextSend = resolve;
    });
  }

  const req = request(app)
    .post(WEBHOOK_PATH)
    .set("X-Forwarded-Proto", "https")
    .set("X-Forwarded-Host", FORWARDED_HOST)
    .set("Host", FORWARDED_HOST);

  if (opts.signature !== undefined) {
    req.set("X-Twilio-Signature", opts.signature);
  }

  const httpRes = await req
    .type("form")
    .send(new URLSearchParams(params).toString());

  return { httpRes, sendPromise, params };
}

/**
 * Compute a valid Twilio signature for the URL + sorted params, matching
 * the algorithm in `twilio/lib/webhooks/webhooks.js`.
 */
function signTwilio(
  url: string,
  params: Record<string, string>,
  token: string,
): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto
    .createHmac("sha1", token)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
}

// Resolve a handle to the mocked sendWhatsApp so individual tests can clear
// it / inspect call counts. The mock is created inside the `vi.mock` factory
// so we re-import the module here (the import is satisfied by the mock).
import * as twilioMod from "../server/companyOs/twilio";
const sendWhatsAppMock = twilioMod.sendWhatsApp as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  sendCalls.length = 0;
  hoisted.state.resolveNextSend = null;
  hoisted.state.budgetOverride = null;
  sendWhatsAppMock.mockClear();
  (chatCompletion as unknown as ReturnType<typeof vi.fn>).mockClear();
});

afterAll(() => {
  // Restore env so adjacent suites in the run aren't affected.
  for (const k of [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "FOUNDER_WHATSAPP_NUMBER",
    "COMPANY_OS_MONTHLY_BUDGET_AED",
    "USD_TO_AED_RATE",
    "NODE_ENV",
  ]) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

// ---------------------------------------------------------------------------
// Command coverage (dev-mode signature path: validateTwilioRequest returns
// true so we can focus on the Manager Agent's routing logic).
// ---------------------------------------------------------------------------

describe("Company OS WhatsApp · command routing", () => {
  let app: express.Express;
  let prevNodeEnv: string | undefined;

  beforeAll(() => {
    prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    app = buildApp();
  });

  afterAll(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("answers `help` with the command menu", async () => {
    const { httpRes, sendPromise } = await postWebhook(app, { body: "help" });
    expect(httpRes.status).toBe(200);
    expect(httpRes.text).toBe("");
    await sendPromise;

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].to).toBe(FOUNDER_FROM);
    expect(sendCalls[0].body).toContain("Bareter Company OS");
    expect(sendCalls[0].body).toContain("revenue");
    expect(sendCalls[0].body).toContain("status");
  });

  it("answers `revenue` with today's AED snapshot", async () => {
    const { httpRes, sendPromise } = await postWebhook(app, {
      body: "revenue",
    });
    expect(httpRes.status).toBe(200);
    await sendPromise;

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].body).toMatch(/\*Revenue · \d{4}-\d{2}-\d{2}\*/);
    expect(sendCalls[0].body).toContain("AED 0.00");
    expect(sendCalls[0].body).toContain("free-launch period");
  });

  it("answers `revenue week` with the 7-day report", async () => {
    const { httpRes, sendPromise } = await postWebhook(app, {
      body: "revenue week",
    });
    expect(httpRes.status).toBe(200);
    await sendPromise;

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].body).toContain("*Revenue · last 7 days*");
    expect(sendCalls[0].body).toContain("AED 0.00");
  });

  it("answers `status` with the full briefing", async () => {
    const { httpRes, sendPromise } = await postWebhook(app, { body: "status" });
    expect(httpRes.status).toBe(200);
    await sendPromise;

    expect(sendCalls).toHaveLength(1);
    const body = sendCalls[0].body;
    expect(body).toMatch(/\*Revenue · \d{4}-\d{2}-\d{2}\*/);
    expect(body).toMatch(/\*Platform status · \d{4}-\d{2}-\d{2}\*/);
    expect(body).toContain("*AI agent activity · last 24h*");
    expect(body).toContain("*AI spend · this month*");
  });

  it("answers `agents` with activity over the last 24h", async () => {
    const { httpRes, sendPromise } = await postWebhook(app, { body: "agents" });
    expect(httpRes.status).toBe(200);
    await sendPromise;

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].body).toContain("*AI agent activity · last 24h*");
    expect(sendCalls[0].body).toContain("No agent activity in the last 24 hours.");
  });

  it("answers `costs` with spend vs monthly budget", async () => {
    const { httpRes, sendPromise } = await postWebhook(app, { body: "costs" });
    expect(httpRes.status).toBe(200);
    await sendPromise;

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].body).toContain("*AI spend · this month*");
    expect(sendCalls[0].body).toContain("AED 0.00 of AED 400.00 budget");
    expect(sendCalls[0].body).toContain("Remaining: AED 400.00");
  });

  it("falls back to the LLM for free-form questions", async () => {
    const { httpRes, sendPromise } = await postWebhook(app, {
      body: "How are we doing this month?",
    });
    expect(httpRes.status).toBe(200);
    await sendPromise;

    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].body).toBe(FREEFORM_REPLY);
  });

  it("refuses free-form questions when the monthly AI budget is exhausted", async () => {
    // Force the budget gate to fire — pctUsed=0.97 is above the 0.95 threshold.
    hoisted.state.budgetOverride = {
      safe: false,
      spentAed: 388,
      budgetAed: 400,
      remainingAed: 12,
      pctUsed: 0.97,
    };

    const { httpRes, sendPromise } = await postWebhook(app, {
      body: "What's the latest on revenue trend?",
    });
    expect(httpRes.status).toBe(200);
    await sendPromise;

    // The LLM must NOT be called when the budget gate is on.
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].body).toContain("Budget gate is on");
    expect(sendCalls[0].body).toContain("97.0%");
    // The refusal still nudges the founder toward the free hard-coded commands.
    expect(sendCalls[0].body).toContain("status");
  });
});

// ---------------------------------------------------------------------------
// Founder ACL — non-founder messages must be silently dropped (200, no
// outbound reply). Runs in dev mode so signature checks pass automatically.
// ---------------------------------------------------------------------------

describe("Company OS WhatsApp · founder ACL", () => {
  let app: express.Express;
  let prevNodeEnv: string | undefined;

  beforeAll(() => {
    prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    app = buildApp();
  });

  afterAll(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("silently 200s and never replies to a non-founder sender", async () => {
    const { httpRes } = await postWebhook(app, {
      body: "help",
      from: NON_FOUNDER_FROM,
      expectReply: false,
    });
    expect(httpRes.status).toBe(200);
    expect(httpRes.text).toBe("");

    // Give any (incorrectly scheduled) background task a chance to fire.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 50));

    expect(sendWhatsAppMock).not.toHaveBeenCalled();
    expect(sendCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Production signature gate — invalid signatures are silently 200'd (so
// Twilio doesn't retry) but no reply is dispatched. A correctly signed
// founder message is processed normally.
// ---------------------------------------------------------------------------

describe("Company OS WhatsApp · Twilio signature (production)", () => {
  let app: express.Express;
  let prevNodeEnv: string | undefined;

  beforeAll(() => {
    prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    app = buildApp();
  });

  afterAll(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("rejects (silently 200s) requests with an invalid signature", async () => {
    const { httpRes } = await postWebhook(app, {
      body: "help",
      signature: "obviously-not-a-valid-signature",
      expectReply: false,
    });
    expect(httpRes.status).toBe(200);
    expect(httpRes.text).toBe("");

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 50));

    expect(sendWhatsAppMock).not.toHaveBeenCalled();
  });

  it("rejects requests with a missing signature header", async () => {
    const { httpRes } = await postWebhook(app, {
      body: "help",
      expectReply: false,
    });
    expect(httpRes.status).toBe(200);

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 50));

    expect(sendWhatsAppMock).not.toHaveBeenCalled();
  });

  it("processes a correctly signed founder message", async () => {
    const params: Record<string, string> = {
      AccountSid: process.env.TWILIO_ACCOUNT_SID!,
      From: FOUNDER_FROM,
      To: TWILIO_TO,
      Body: "help",
      NumMedia: "0",
      MessageSid: "SM" + crypto.randomBytes(16).toString("hex"),
    };
    const signature = signTwilio(
      ABSOLUTE_WEBHOOK_URL,
      params,
      process.env.TWILIO_AUTH_TOKEN!,
    );

    const sendPromise = new Promise<void>((resolve) => {
      hoisted.state.resolveNextSend = resolve;
    });

    const httpRes = await request(app)
      .post(WEBHOOK_PATH)
      .set("X-Forwarded-Proto", "https")
      .set("X-Forwarded-Host", FORWARDED_HOST)
      .set("Host", FORWARDED_HOST)
      .set("X-Twilio-Signature", signature)
      .type("form")
      .send(new URLSearchParams(params).toString());

    expect(httpRes.status).toBe(200);
    expect(httpRes.text).toBe("");
    await sendPromise;

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].to).toBe(FOUNDER_FROM);
    expect(sendCalls[0].body).toContain("Bareter Company OS");
  });
});
