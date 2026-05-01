// Tests for the Memory Agent — both the pure helper layer
// (`memoryAgent.ts`) against an in-memory mock of `db`, and the WhatsApp
// `memory` / `forget` surface routed through the Manager Agent.
//
// Why mock `db` instead of using a real Postgres? The other Company OS
// suites (e.g. companyOs.whatsapp.test.ts) follow the same pattern, and
// keeping the test surface independent of a live DB lets the suite run
// in CI without provisioning. The mock implements the small Drizzle
// chain shape these helpers exercise: insert+onConflictDoUpdate+returning,
// select+from+where+orderBy+limit, update+set+where+returning, delete
// +where+returning.

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

const ORIGINAL_ENV = { ...process.env };

process.env.TWILIO_ACCOUNT_SID = "ACtest00000000000000000000000000000";
process.env.TWILIO_AUTH_TOKEN = "test_auth_token_for_signing";
process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
process.env.FOUNDER_WHATSAPP_NUMBER = "whatsapp:+971500000000";
process.env.COMPANY_OS_MONTHLY_BUDGET_AED = "400";
process.env.USD_TO_AED_RATE = "3.6725";

const FOUNDER_FROM = process.env.FOUNDER_WHATSAPP_NUMBER!;
const TWILIO_TO = process.env.TWILIO_WHATSAPP_FROM!;
const FORWARDED_HOST = "bareter.test";
const WEBHOOK_PATH = "/api/company-os/whatsapp";

// ---------------------------------------------------------------------------
// In-memory `agent_memory` table + Drizzle chain mock.
// ---------------------------------------------------------------------------

interface MemoryRow {
  id: string;
  agentName: string;
  memoryType: string;
  key: string;
  value: unknown;
  confidence: string;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const memoryStore = new Map<string, MemoryRow>();

function uniqueKey(agent: string, type: string, key: string): string {
  return `${agent}::${type}::${key}`;
}

function lookupByUnique(agent: string, type: string, key: string): MemoryRow | undefined {
  for (const row of memoryStore.values()) {
    if (row.agentName === agent && row.memoryType === type && row.key === key) return row;
  }
  return undefined;
}

const hoisted = vi.hoisted(() => {
  const sendCalls: Array<{ to: string; body: string }> = [];
  const state: { resolveNextSend: (() => void) | null } = { resolveNextSend: null };
  return { sendCalls, state };
});

// Stub Stripe / OpenAI dependencies before importing the module under test.
vi.mock("../server/companyOs/stripeClient", () => ({
  getStripeClient: vi.fn(async () => null),
  getStripeWebhookSecret: vi.fn(async () => null),
  getStripeSecretKey: vi.fn(async () => null),
  isStripeConfigured: vi.fn(async () => false),
}));

vi.mock("../server/agents/llm", () => ({
  chatCompletion: vi.fn(async () => ({ content: "stub", tokensUsed: 0 })),
  jsonCompletion: vi.fn(),
}));

// Capture WhatsApp sends so we can assert on the `memory` / `forget`
// command outputs.
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

// The mocked db needs to handle:
//   - insert(agentMemory).values(...).onConflictDoUpdate(...).returning()
//   - select().from(agentMemory).where(...).orderBy(...).limit(...)
//   - update(agentMemory).set(...).where(...).returning()
//   - delete(agentMemory).where(...).returning()
//
// Other Company OS modules also call `db.select().from(...).limit()`
// against unrelated tables (e.g. financeSnapshots inside the Manager
// Agent's freeform context). For those we return [] — the manager
// branch we exercise (`memory` command) doesn't read finance, but the
// import graph evaluates them at startup so we need a permissive shape.
vi.mock("../server/db", () => {
  const db = {
    insert: (table: any) => insertChain(table),
    select: (..._args: any[]) => selectChain(),
    update: (table: any) => updateChain(table),
    delete: (table: any) => deleteChain(table),
  };
  return { db };
});

function isAgentMemoryTable(table: any): boolean {
  // Drizzle pgTable objects store the table name on a `Symbol(drizzle:Name)`
  // symbol — there's no public accessor, so we walk own symbols to find it.
  if (!table || typeof table !== "object") return false;
  for (const sym of Object.getOwnPropertySymbols(table)) {
    if (String(sym).includes("drizzle:Name")) {
      return String((table as any)[sym]) === "agent_memory";
    }
  }
  return false;
}

/**
 * Walk a Drizzle `eq(col, val)` / `and(...)` SQL object and pull out the
 * `(columnName, value)` pairs we care about.
 *
 * Drizzle SQL is a tree of nodes with a `queryChunks` array; for `eq` the
 * chunks include a column reference (a PgColumn with a `name`) and a `Param`
 * holding the literal value. We don't try to model the SQL generation —
 * we just collect the predicates so the chain mock can route the query.
 */
function extractEqFilters(node: any): Array<{ col: string; val: unknown }> {
  const out: Array<{ col: string; val: unknown }> = [];
  if (!node || typeof node !== "object") return out;
  const stack: any[] = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (Array.isArray(cur.queryChunks)) {
      // An eq() chunk has shape:
      //   [StringChunk, ColumnRef, StringChunk, Param, StringChunk]
      // (with " = " literal between them). For and()/or() the chunks
      // themselves contain nested SQL nodes; recurse into those.
      let pendingCol: string | null = null;
      for (const chunk of cur.queryChunks) {
        if (chunk && typeof chunk === "object") {
          // Column reference — pgColumn has `name` + `columnType`.
          if (typeof chunk.name === "string" && typeof chunk.columnType === "string") {
            pendingCol = chunk.name;
            continue;
          }
          // Param node — has `encoder` and `value`.
          if ("value" in chunk && "encoder" in chunk && pendingCol) {
            out.push({ col: pendingCol, val: chunk.value });
            pendingCol = null;
            continue;
          }
          // Nested SQL (and/or composite) — recurse.
          if (Array.isArray(chunk.queryChunks)) stack.push(chunk);
        }
      }
    }
  }
  return out;
}

function insertChain(table: any) {
  const isMemory = isAgentMemoryTable(table);
  let pendingValues: any = null;
  let pendingConflict: any = null;
  const chain: any = {
    values: (v: any) => {
      pendingValues = v;
      return chain;
    },
    onConflictDoUpdate: (cfg: any) => {
      pendingConflict = cfg;
      return chain;
    },
    returning: async (_sel?: any) => {
      if (!isMemory) return [];
      const v = pendingValues;
      const existing = lookupByUnique(v.agentName, v.memoryType, v.key);
      const now = new Date();
      if (existing && pendingConflict) {
        // Apply the upsert's set block. We mirror the helper's blended
        // confidence calculation since the SQL template wouldn't run
        // against the in-memory store.
        const blended = ((Number(existing.confidence) + Number(v.confidence)) / 2);
        existing.value = v.value;
        existing.confidence = blended.toFixed(3);
        existing.updatedAt = now;
        return [{ id: existing.id }];
      }
      const id = crypto.randomUUID();
      const row: MemoryRow = {
        id,
        agentName: v.agentName,
        memoryType: v.memoryType,
        key: v.key,
        value: v.value,
        confidence: String(v.confidence ?? "0.500"),
        usageCount: 0,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      memoryStore.set(uniqueKey(row.agentName, row.memoryType, row.key), row);
      memoryStore.set(id, row); // also index by id for delete-by-id
      return [{ id }];
    },
    then: (onF: any, onR: any) =>
      Promise.resolve(chain.returning()).then(onF, onR),
  };
  return chain;
}

function makeFilteredRows(): MemoryRow[] {
  // Always return ALL distinct rows; the test queries don't introspect
  // the `where(...)` arg, so individual cases narrow the result set
  // themselves via the agent / type filters they pass to listMemories.
  const seen = new Set<string>();
  const out: MemoryRow[] = [];
  for (const row of memoryStore.values()) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function selectChain() {
  let limitN: number | null = null;
  const filters: Array<{ col: string; val: unknown }> = [];
  const chain: any = {
    from: (_t: any) => chain,
    $dynamic: () => chain,
    where: (op: any) => {
      filters.push(...extractEqFilters(op));
      return chain;
    },
    orderBy: (..._args: any[]) => chain,
    limit: (n: number) => {
      limitN = n;
      return chain;
    },
    then: (onF: any, onR: any) => {
      let rows = makeFilteredRows();
      for (const f of filters) {
        if (f.col === "agent_name") rows = rows.filter((r) => r.agentName === f.val);
        else if (f.col === "memory_type") rows = rows.filter((r) => r.memoryType === f.val);
        else if (f.col === "key") rows = rows.filter((r) => r.key === f.val);
        else if (f.col === "id") rows = rows.filter((r) => r.id === f.val);
      }
      if (limitN !== null) rows = rows.slice(0, limitN);
      return Promise.resolve(rows).then(onF, onR);
    },
  };
  return chain;
}

function updateChain(table: any) {
  const isMemory = isAgentMemoryTable(table);
  let pendingSet: any = {};
  const filters: Array<{ col: string; val: unknown }> = [];
  const chain: any = {
    set: (s: any) => {
      pendingSet = s;
      return chain;
    },
    where: (op: any) => {
      filters.push(...extractEqFilters(op));
      return chain;
    },
    returning: async () => {
      if (!isMemory) return [];
      const idFilter = filters.find((f) => f.col === "id");
      if (!idFilter) return [];
      const row = memoryStore.get(String(idFilter.val));
      if (!row) return [];
      // Apply the visible bumps (`usageCount` / `lastUsedAt`).
      // The helper sends a SQL template for usageCount; emulate it.
      if (pendingSet.usageCount) row.usageCount += 1;
      if (pendingSet.lastUsedAt instanceof Date) row.lastUsedAt = pendingSet.lastUsedAt;
      return [{ id: row.id }];
    },
    then: (onF: any, onR: any) =>
      Promise.resolve(chain.returning()).then(onF, onR),
  };
  return chain;
}

function deleteChain(table: any) {
  const isMemory = isAgentMemoryTable(table);
  const filters: Array<{ col: string; val: unknown }> = [];
  const chain: any = {
    where: (op: any) => {
      filters.push(...extractEqFilters(op));
      return chain;
    },
    returning: async () => {
      if (!isMemory) return [];
      const filterAgent = filters.find((f) => f.col === "agent_name")?.val as string | undefined;
      const filterKey = filters.find((f) => f.col === "key")?.val as string | undefined;
      const filterId = filters.find((f) => f.col === "id")?.val as string | undefined;
      if (!filterAgent && !filterKey && !filterId) return [];
      const removed: { id: string }[] = [];
      const seenIds = new Set<string>();
      for (const row of Array.from(memoryStore.values())) {
        if (seenIds.has(row.id)) continue;
        const matchesId = filterId ? row.id === filterId : true;
        const matchesAgent = filterAgent ? row.agentName === filterAgent : true;
        const matchesKey = filterKey ? row.key === filterKey : true;
        if (matchesId && matchesAgent && matchesKey) {
          memoryStore.delete(uniqueKey(row.agentName, row.memoryType, row.key));
          memoryStore.delete(row.id);
          removed.push({ id: row.id });
          seenIds.add(row.id);
        }
      }
      return removed;
    },
    then: (onF: any, onR: any) =>
      Promise.resolve(chain.returning()).then(onF, onR),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Imported AFTER mocks so the modules pick up the stubbed `db`.
// ---------------------------------------------------------------------------

import {
  remember,
  recall,
  recallByKey,
  incrementUsage,
  buildAgentContext,
  getMemorySummary,
  parseForgetCommand,
  forgetMemory,
  deleteMemoryById,
  listMemories,
  rememberInBackground,
} from "../server/companyOs/memoryAgent";
import { createCompanyOsRouter } from "../server/companyOs/router";

beforeEach(() => {
  memoryStore.clear();
  hoisted.sendCalls.length = 0;
  hoisted.state.resolveNextSend = null;
});

afterAll(() => {
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
// Helper layer — remember / recall / recallByKey / buildAgentContext.
// ---------------------------------------------------------------------------

describe("memoryAgent · remember / recall", () => {
  it("inserts a fresh memory row and returns its id", async () => {
    const r = await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "top_ctr_campaign",
      value: { name: "Ramadan2026", ctr: 4.2 },
      confidence: 0.8,
    });
    expect(r.ok).toBe(true);
    expect(typeof r.id).toBe("string");
    const list = await recall("marketing");
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe("top_ctr_campaign");
    expect(Number(list[0].confidence)).toBeCloseTo(0.8, 3);
  });

  it("upserts the same (agent, type, key) instead of duplicating", async () => {
    await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "top_ctr_campaign",
      value: { ctr: 2 },
      confidence: 0.4,
    });
    await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "top_ctr_campaign",
      value: { ctr: 6 },
      confidence: 0.8,
    });
    const list = await recall("marketing");
    expect(list).toHaveLength(1);
    // Confidence is a 50/50 weighted average of the two writes.
    expect(Number(list[0].confidence)).toBeCloseTo(0.6, 3);
    expect((list[0].value as any).ctr).toBe(6);
  });

  it("rejects values larger than 4 KB without throwing", async () => {
    const big = "x".repeat(5000);
    const r = await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "huge",
      value: { big },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/4096/);
  });

  it("rejects empty agent / type / key without throwing", async () => {
    const r = await remember({
      agentName: "",
      memoryType: "learning",
      key: "x",
      value: {},
    });
    expect(r.ok).toBe(false);
  });

  it("recall returns [] when the agent has no memories", async () => {
    const r = await recall("nobody");
    expect(r).toEqual([]);
  });

  it("recallByKey returns the exact match (or null)", async () => {
    await remember({
      agentName: "sales",
      memoryType: "learning",
      key: "top_segment",
      value: { userType: "freelancer" },
    });
    const hit = await recallByKey("sales", "learning", "top_segment");
    expect(hit).not.toBeNull();
    expect((hit?.value as any).userType).toBe("freelancer");
    const miss = await recallByKey("sales", "learning", "missing");
    expect(miss).toBeNull();
  });
});

describe("memoryAgent · usage tracking + buildAgentContext", () => {
  it("incrementUsage bumps usageCount and stamps lastUsedAt", async () => {
    const r = await remember({
      agentName: "manager",
      memoryType: "preference",
      key: "tone",
      value: "warm",
    });
    expect(r.ok).toBe(true);
    await incrementUsage(r.id!);
    await incrementUsage(r.id!);
    const after = await recallByKey("manager", "preference", "tone");
    expect(after?.usageCount).toBe(2);
    expect(after?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("buildAgentContext returns '' when there are no memories", async () => {
    const ctx = await buildAgentContext("manager");
    expect(ctx).toBe("");
  });

  it("buildAgentContext renders a header + bullet list under 800 chars", async () => {
    await remember({
      agentName: "manager",
      memoryType: "preference",
      key: "tone",
      value: "warm and concise",
      confidence: 0.9,
    });
    await remember({
      agentName: "manager",
      memoryType: "learning",
      key: "founder_topic",
      value: "revenue + costs",
      confidence: 0.7,
    });
    const ctx = await buildAgentContext("manager");
    expect(ctx).toContain("Prior learnings for manager agent");
    expect(ctx).toContain("[preference] tone:");
    expect(ctx).toContain("[learning] founder_topic:");
    expect(ctx.length).toBeLessThanOrEqual(800);
  });

  it("buildAgentContext bumps usageCount on the rendered rows", async () => {
    await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "k1",
      value: 1,
    });
    await buildAgentContext("marketing");
    // Allow the fire-and-forget bump promise to flush.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 5));
    const list = await recall("marketing");
    expect(list[0].usageCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// `rememberInBackground` — the void Promise wrapper used by every agent
// so seeding errors never crash the user-facing reply path.
// ---------------------------------------------------------------------------

describe("memoryAgent · rememberInBackground", () => {
  it("returns void synchronously and persists eventually", async () => {
    const ret = rememberInBackground({
      agentName: "finance",
      memoryType: "learning",
      key: "trend",
      value: { direction: "up" },
    });
    expect(ret).toBeUndefined();
    // Wait a tick so the inner promise resolves.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 5));
    const got = await recallByKey("finance", "learning", "trend");
    expect(got).not.toBeNull();
    expect((got?.value as any).direction).toBe("up");
  });
});

// ---------------------------------------------------------------------------
// `forget` + `deleteMemoryById` + `listMemories`.
// ---------------------------------------------------------------------------

describe("memoryAgent · admin operations", () => {
  it("listMemories filters by agent and type", async () => {
    await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "k1",
      value: 1,
    });
    await remember({
      agentName: "marketing",
      memoryType: "preference",
      key: "k2",
      value: 2,
    });
    await remember({
      agentName: "sales",
      memoryType: "learning",
      key: "k3",
      value: 3,
    });
    const all = await listMemories();
    expect(all.length).toBe(3);
    const mkt = await listMemories({ agent: "marketing" });
    expect(mkt.length).toBe(2);
    const mktLearning = await listMemories({
      agent: "marketing",
      type: "learning",
    });
    expect(mktLearning.length).toBe(1);
    expect(mktLearning[0].key).toBe("k1");
  });

  it("forgetMemory removes (agent, key) tuples and reports the count", async () => {
    await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "to_forget",
      value: 1,
    });
    const removed = await forgetMemory("marketing", "to_forget");
    expect(removed).toBe(1);
    const after = await recall("marketing");
    expect(after.length).toBe(0);
  });

  it("forgetMemory returns 0 when nothing matches", async () => {
    const r = await forgetMemory("marketing", "missing");
    expect(r).toBe(0);
  });

  it("deleteMemoryById removes one row by primary key", async () => {
    const r = await remember({
      agentName: "manager",
      memoryType: "preference",
      key: "tone",
      value: "warm",
    });
    expect(r.ok).toBe(true);
    const ok = await deleteMemoryById(r.id!);
    expect(ok).toBe(true);
    const again = await deleteMemoryById(r.id!);
    expect(again).toBe(false);
  });

  it("parseForgetCommand parses agent + key (key may contain spaces)", async () => {
    expect(parseForgetCommand("forget marketing top_ctr_campaign")).toEqual({
      agent: "marketing",
      key: "top_ctr_campaign",
    });
    expect(parseForgetCommand("forget sales top segment with spaces")).toEqual({
      agent: "sales",
      key: "top segment with spaces",
    });
    expect(parseForgetCommand("forget")).toBeNull();
    expect(parseForgetCommand("forget agent_only")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// `getMemorySummary` — backs the WhatsApp `memory` command.
// ---------------------------------------------------------------------------

describe("memoryAgent · getMemorySummary", () => {
  it("groups memories per agent with the top 3 keys each", async () => {
    await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "k_a",
      value: 1,
    });
    await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "k_b",
      value: 2,
    });
    await remember({
      agentName: "sales",
      memoryType: "learning",
      key: "top_segment",
      value: 1,
    });
    const out = await getMemorySummary();
    expect(out).toContain("*Agent memory*");
    expect(out).toContain("*marketing*");
    expect(out).toContain("k_a");
    expect(out).toContain("*sales*");
    expect(out).toContain("top_segment");
    expect(out).toContain("forget");
  });

  it("returns a friendly empty-state message when the table is empty", async () => {
    const out = await getMemorySummary();
    expect(out).toContain("No memories stored yet.");
  });
});

// ---------------------------------------------------------------------------
// WhatsApp surface — `memory` and `forget <agent> <key>` commands routed
// through the real Manager Agent + Twilio webhook handler.
// ---------------------------------------------------------------------------

describe("WhatsApp · memory + forget commands", () => {
  let app: express.Express;
  let prevNodeEnv: string | undefined;

  function buildApp() {
    const a = express();
    a.use(WEBHOOK_PATH, express.urlencoded({ extended: false }));
    a.use(express.json());
    a.use(express.urlencoded({ extended: false }));
    a.use(
      "/api/company-os",
      createCompanyOsRouter({
        requireAdmin: (_req, _res, next) => next(),
      }),
    );
    return a;
  }

  async function postWebhook(body: string) {
    const params: Record<string, string> = {
      AccountSid: process.env.TWILIO_ACCOUNT_SID!,
      From: FOUNDER_FROM,
      To: TWILIO_TO,
      Body: body,
      NumMedia: "0",
      MessageSid: `SM${crypto.randomBytes(16).toString("hex")}`,
    };
    const sendPromise = new Promise<void>((resolve) => {
      hoisted.state.resolveNextSend = resolve;
    });
    const res = await request(app)
      .post(WEBHOOK_PATH)
      .set("X-Forwarded-Proto", "https")
      .set("X-Forwarded-Host", FORWARDED_HOST)
      .set("Host", FORWARDED_HOST)
      .type("form")
      .send(new URLSearchParams(params).toString());
    return { res, sendPromise };
  }

  beforeAll(() => {
    prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    app = buildApp();
  });

  afterAll(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("`memory` returns the per-agent rollup", async () => {
    await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "top_ctr_campaign",
      value: { ctr: 4.2 },
    });
    const { res, sendPromise } = await postWebhook("memory");
    expect(res.status).toBe(200);
    await sendPromise;
    expect(hoisted.sendCalls).toHaveLength(1);
    expect(hoisted.sendCalls[0].body).toContain("*Agent memory*");
    expect(hoisted.sendCalls[0].body).toContain("marketing");
    expect(hoisted.sendCalls[0].body).toContain("top_ctr_campaign");
  });

  it("`forget <agent> <key>` deletes the memory and reports the count", async () => {
    await remember({
      agentName: "sales",
      memoryType: "learning",
      key: "stale_signal",
      value: { x: 1 },
    });
    const { res, sendPromise } = await postWebhook("forget sales stale_signal");
    expect(res.status).toBe(200);
    await sendPromise;
    expect(hoisted.sendCalls).toHaveLength(1);
    expect(hoisted.sendCalls[0].body).toContain("Forgot 1 memory");
    expect(hoisted.sendCalls[0].body).toContain("sales");
    expect(hoisted.sendCalls[0].body).toContain("stale_signal");
    const after = await recall("sales");
    expect(after.length).toBe(0);
  });

  it("`forget` with no key surfaces a usage hint instead of crashing", async () => {
    const { res, sendPromise } = await postWebhook("forget marketing");
    expect(res.status).toBe(200);
    await sendPromise;
    expect(hoisted.sendCalls[0].body).toContain("Usage:");
  });

  it("`forget` returns a friendly miss message when nothing matches", async () => {
    const { res, sendPromise } = await postWebhook("forget marketing never_set");
    expect(res.status).toBe(200);
    await sendPromise;
    expect(hoisted.sendCalls[0].body).toContain("No memory found");
  });

  it("`help` advertises both commands", async () => {
    const { res, sendPromise } = await postWebhook("help");
    expect(res.status).toBe(200);
    await sendPromise;
    expect(hoisted.sendCalls[0].body).toContain("memory");
    expect(hoisted.sendCalls[0].body).toContain("forget");
  });
});

// ---------------------------------------------------------------------------
// HTTP surface — GET /memory and DELETE /memory/:id (founder-only).
// ---------------------------------------------------------------------------

describe("HTTP · /memory routes", () => {
  function buildApp(allowAdmin: boolean) {
    const a = express();
    a.use(express.json());
    a.use(
      "/api/company-os",
      createCompanyOsRouter({
        requireAdmin: (_req, res, next) => {
          if (!allowAdmin) {
            res.status(403).json({ message: "Forbidden" });
            return;
          }
          next();
        },
      }),
    );
    return a;
  }

  it("GET /memory returns the listing as JSON", async () => {
    await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "k1",
      value: { v: 1 },
    });
    const app = buildApp(true);
    const res = await request(app).get("/api/company-os/memory");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.memories[0].key).toBe("k1");
  });

  it("GET /memory respects the admin guard", async () => {
    const app = buildApp(false);
    const res = await request(app).get("/api/company-os/memory");
    expect(res.status).toBe(403);
  });

  it("DELETE /memory/:id removes one row", async () => {
    const r = await remember({
      agentName: "marketing",
      memoryType: "learning",
      key: "to_delete",
      value: 1,
    });
    expect(r.ok).toBe(true);
    const app = buildApp(true);
    const res = await request(app).delete(`/api/company-os/memory/${r.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("DELETE /memory/:id returns 404 when nothing matches", async () => {
    const app = buildApp(true);
    const res = await request(app).delete(
      "/api/company-os/memory/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /memory/:id is gated by requireAdmin", async () => {
    const app = buildApp(false);
    const res = await request(app).delete("/api/company-os/memory/anything");
    expect(res.status).toBe(403);
  });
});
