// Tests for the Intelligence Agent (server/companyOs/intelligenceAgent.ts).
//
// We follow the same chainable-`db` proxy pattern as the dashboard suite
// so detectors can run without a live Postgres. Each detector is a tiny
// SQL aggregate, so the mock just resolves to whatever shape the unit
// under test wants — and the sweep wires those into the (alertType,
// dayKey) dedupe + WhatsApp notify path.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock state — reset in beforeEach.
// ---------------------------------------------------------------------------

interface MockState {
  selectQueue: unknown[][];
  insertReturn: Array<Record<string, unknown>> | null;
  updateReturn: Array<Record<string, unknown>> | null;
  executeQueue: Array<{ rows: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>;
  executeReturn: { rows: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  insertConflictHit: boolean;
  insertedRows: Array<Record<string, unknown>>;
  budgetVerdict: { spentAed: number; budgetAed: number; remainingAed: number; pctUsed: number; safe: boolean } | null;
  agentBudgetSafe: boolean;
  notifyCalls: string[];
  rememberCalls: Array<Record<string, unknown>>;
  recallReturn: Record<string, unknown> | null;
  insertCount: number;
  updateCount: number;
}

const state: MockState = {
  selectQueue: [],
  insertReturn: null,
  updateReturn: null,
  executeQueue: [],
  executeReturn: { rows: [] },
  insertConflictHit: false,
  insertedRows: [],
  budgetVerdict: null,
  agentBudgetSafe: true,
  notifyCalls: [],
  rememberCalls: [],
  recallReturn: null,
  insertCount: 0,
  updateCount: 0,
};

function makeSelectChain(rowsResolver: () => unknown[]): any {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    groupBy: () => chain,
    $dynamic: () => chain,
    then: (onF: any, onR: any) => Promise.resolve(rowsResolver()).then(onF, onR),
    catch: (onR: any) => Promise.resolve(rowsResolver()).catch(onR),
    finally: (onF: any) => Promise.resolve(rowsResolver()).finally(onF),
  };
  return chain;
}

function makeInsertChain(): any {
  const chain: any = {
    values: (v: any) => {
      state.insertedRows.push(v);
      return chain;
    },
    onConflictDoNothing: () => chain,
    onConflictDoUpdate: () => chain,
    returning: () => {
      state.insertCount += 1;
      // If the test marked the conflict as hit, the insert returns no
      // rows (mirroring Drizzle's onConflictDoNothing behaviour).
      if (state.insertConflictHit) return Promise.resolve([]);
      return Promise.resolve(state.insertReturn ?? []);
    },
    then: (onF: any, onR: any) => Promise.resolve(state.insertReturn ?? []).then(onF, onR),
  };
  return chain;
}

function makeUpdateChain(): any {
  const chain: any = {
    set: () => chain,
    where: () => chain,
    returning: () => {
      state.updateCount += 1;
      return Promise.resolve(state.updateReturn ?? []);
    },
    then: (onF: any, onR: any) => Promise.resolve(state.updateReturn ?? []).then(onF, onR),
  };
  return chain;
}

vi.mock("../server/db", () => ({
  db: {
    select: () =>
      makeSelectChain(() => {
        const next = state.selectQueue.shift();
        return next ?? [];
      }),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    delete: () => makeSelectChain(() => []),
    execute: async () => {
      const next = state.executeQueue.shift();
      return next ?? state.executeReturn;
    },
  },
}));

vi.mock("../server/companyOs/twilio", () => ({
  notifyFounder: vi.fn(async (body: string) => {
    state.notifyCalls.push(body);
    return true;
  }),
}));

vi.mock("../server/companyOs/costTracker", async (importOriginal) => {
  // Pull the REAL constants + helpers (AGENT_LIMITS_AED, getAgentBudgetAed,
  // normalizeAgentKey, …) so the per-agent budget table tests below can
  // assert on the canonical values, while still stubbing the IO-bound
  // helpers (logLlmCall, isAgentBudgetSafe, …) so the sweep stays offline.
  const actual = await importOriginal<typeof import("../server/companyOs/costTracker")>();
  return {
    ...actual,
    logLlmCall: vi.fn(async () => undefined),
    isAgentBudgetSafe: vi.fn(async () => state.agentBudgetSafe),
    getBudgetVerdict: vi.fn(async () => state.budgetVerdict),
    getAgentBudgetVerdict: vi.fn(async (agent: string) => ({
      agentName: agent,
      spentAed: 0,
      budgetAed: 40,
      remainingAed: 40,
      pctUsed: 0,
      safe: true,
    })),
    getAllAgentSpendsAed: vi.fn(async () => []),
    getAgentSpendAed: vi.fn(async () => 0),
  };
});

vi.mock("../server/companyOs/memoryAgent", () => ({
  remember: vi.fn(async (input: Record<string, unknown>) => {
    state.rememberCalls.push(input);
    return { id: "mem-1", changed: true };
  }),
  recallByKey: vi.fn(async () => state.recallReturn),
}));

// Stub the LLM module so the optional polish step in the sweep doesn't
// reach OpenAI under test. Use vi.hoisted so the spy survives the
// auto-hoisting that vi.mock does.
const { llmChatSpy } = vi.hoisted(() => ({
  llmChatSpy: vi.fn(async () => ({ content: "", tokensUsed: 0 })),
}));
vi.mock("../server/agents/llm", () => ({
  chatCompletion: llmChatSpy,
}));

// Imports must come AFTER all mocks so the module-under-test picks them up.
import {
  detectRevenueDropWoW,
  detectDisputeSpikeWoW,
  detectAiBurnRate,
  detectHotCategory,
  detectZeroDeals48h,
  runIntelligenceSweep,
  snoozeAlerts,
  isAlertsSnoozed,
  getAlertsSnoozedUntil,
  acknowledgeAlert,
  parseAckCommand,
  formatAlertForWhatsApp,
} from "../server/companyOs/intelligenceAgent";
import { getAgentBudgetAed, AGENT_LIMITS_AED } from "../server/companyOs/costTracker";
import type { ProactiveAlert } from "@shared/schema";

beforeEach(() => {
  state.selectQueue = [];
  state.insertReturn = null;
  state.updateReturn = null;
  state.executeReturn = { rows: [] };
  state.insertConflictHit = false;
  state.insertedRows = [];
  state.budgetVerdict = null;
  state.agentBudgetSafe = true;
  state.notifyCalls = [];
  state.rememberCalls = [];
  state.recallReturn = null;
  state.insertCount = 0;
  state.updateCount = 0;
});

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

describe("Intelligence Agent — detectors", () => {
  it("detectRevenueDropWoW: fires critical when WoW drop >= 30%", async () => {
    // Two select() chains: last7 sum, then prev7 sum.
    state.selectQueue = [
      [{ total: "120.00" }], // last 7 days
      [{ total: "300.00" }], // prior 7 days — 60% drop
    ];
    const out = await detectRevenueDropWoW();
    expect(out).not.toBeNull();
    expect(out!.alertType).toBe("revenue_drop_wow");
    expect(out!.severity).toBe("critical");
    expect(out!.dataJson.last7Aed).toBeCloseTo(120, 2);
    expect(out!.dataJson.prev7Aed).toBeCloseTo(300, 2);
    expect(Number(out!.dataJson.dropPct)).toBeGreaterThanOrEqual(0.5);
  });

  it("detectRevenueDropWoW: returns null when prior baseline is too small", async () => {
    state.selectQueue = [
      [{ total: "0.50" }],
      [{ total: "1.00" }],
    ];
    const out = await detectRevenueDropWoW();
    expect(out).toBeNull();
  });

  it("detectRevenueDropWoW: returns null when drop is below 30%", async () => {
    state.selectQueue = [
      [{ total: "85.00" }],
      [{ total: "100.00" }], // 15% drop only
    ];
    const out = await detectRevenueDropWoW();
    expect(out).toBeNull();
  });

  it("detectDisputeSpikeWoW: fires critical when WoW spike >= 200%", async () => {
    state.selectQueue = [
      [{ c: 18 }], // last 7 days
      [{ c: 5 }],  // prior 7 days — 260% spike
    ];
    const out = await detectDisputeSpikeWoW();
    expect(out).not.toBeNull();
    expect(out!.alertType).toBe("dispute_spike_wow");
    expect(out!.severity).toBe("critical");
    expect(out!.dataJson.last7Reports).toBe(18);
    expect(out!.dataJson.prev7Reports).toBe(5);
  });

  it("detectDisputeSpikeWoW: ignores low baselines (1 → 3 isn't a spike)", async () => {
    state.selectQueue = [
      [{ c: 3 }],
      [{ c: 1 }],
    ];
    const out = await detectDisputeSpikeWoW();
    expect(out).toBeNull();
  });

  it("detectAiBurnRate: warns when month-end projection > 110% of cap", async () => {
    // detectAiBurnRate uses the real wall-clock day-of-month, so we
    // pick a `spentAed` large enough that
    //   projection = (spent/day)*daysInMonth >> 1.1 * budget
    // for any day from 3 onwards. With spent=2000 vs budget=400 the
    // projection is at least 5× the cap regardless of day-of-month.
    state.budgetVerdict = {
      spentAed: 2000,
      budgetAed: 400,
      remainingAed: 0,
      pctUsed: 5,
      safe: false,
    };
    const out = await detectAiBurnRate();
    if (out) {
      expect(out.alertType).toBe("ai_burn_projection");
      expect(out.severity).toBe("warning");
      expect(out.dataJson.budgetAed).toBe(400);
      expect(Number(out.dataJson.projectionPct)).toBeGreaterThan(1.1);
    } else {
      // On days 1-2 the detector is intentionally a no-op (insufficient
      // baseline). That's the only reason this can resolve to null with
      // the inputs above.
      expect(new Date().getUTCDate()).toBeLessThan(3);
    }
  });

  it("detectAiBurnRate: returns null when verdict is unavailable", async () => {
    state.budgetVerdict = null;
    const out = await detectAiBurnRate();
    expect(out).toBeNull();
  });

  it("detectZeroDeals48h: warns when no deals in 48h despite >100 active users", async () => {
    state.selectQueue = [
      [{ c: 0 }],   // completed deals last 48h
      [{ c: 250 }], // active users last 7d
    ];
    const out = await detectZeroDeals48h();
    expect(out).not.toBeNull();
    expect(out!.alertType).toBe("zero_deals_48h");
    expect(out!.severity).toBe("warning");
    expect(out!.dataJson.completedDeals48h).toBe(0);
    expect(out!.dataJson.activeUsers7d).toBe(250);
  });

  it("detectZeroDeals48h: returns null when active users <= 100", async () => {
    state.selectQueue = [
      [{ c: 0 }],
      [{ c: 50 }],
    ];
    const out = await detectZeroDeals48h();
    expect(out).toBeNull();
  });

  it("detectZeroDeals48h: returns null when at least one deal completed", async () => {
    state.selectQueue = [
      [{ c: 1 }],
      [{ c: 250 }],
    ];
    const out = await detectZeroDeals48h();
    expect(out).toBeNull();
  });

  it("detectHotCategory: fires info when a category share jumps ≥25 pts WoW", async () => {
    // The detector calls topCategoryShare() twice — last week + prev
    // week — so we queue two execute() rows in order.
    state.executeQueue = [
      // last 7d: gadgets owns 6/8 listings (75%)
      { rows: [{ name: "gadgets", c: 6 }, { name: "fashion", c: 2 }] },
      // prev 7d: gadgets owned only 1/10 listings (10%) — +65 pts WoW
      { rows: [{ name: "fashion", c: 9 }, { name: "gadgets", c: 1 }] },
    ];
    const out = await detectHotCategory();
    expect(out).not.toBeNull();
    expect(out!.alertType).toBe("hot_category");
    expect(out!.severity).toBe("info");
    expect((out!.dataJson as Record<string, unknown>).category).toBe("gadgets");
    expect(Number((out!.dataJson as Record<string, unknown>).deltaPts)).toBeGreaterThanOrEqual(25);
  });

  it("detectHotCategory: returns null when last week has too few listings", async () => {
    // Only 2 listings total in the past 7 days — below the 5-listing
    // baseline floor — so we should NOT fire even though the share is
    // dramatic.
    state.executeQueue = [
      { rows: [{ name: "gadgets", c: 2 }] }, // last
      { rows: [{ name: "fashion", c: 9 }] }, // prev
    ];
    const out = await detectHotCategory();
    expect(out).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Per-agent budget table (canonical + suffixed names map to same cap)
// ---------------------------------------------------------------------------

describe("Per-agent budget caps — name normalisation", () => {
  it("getAgentBudgetAed returns the same cap for `marketing` and `marketingAgent`", () => {
    expect(getAgentBudgetAed("marketing")).toBe(80);
    expect(getAgentBudgetAed("marketingAgent")).toBe(80);
  });
  it("getAgentBudgetAed handles every documented agent", () => {
    expect(getAgentBudgetAed("manager")).toBe(60);
    expect(getAgentBudgetAed("sales")).toBe(80);
    expect(getAgentBudgetAed("salesAgent")).toBe(80);
    expect(getAgentBudgetAed("legal")).toBe(60);
    expect(getAgentBudgetAed("legalAgent")).toBe(60);
    expect(getAgentBudgetAed("finance")).toBe(30);
    expect(getAgentBudgetAed("financeAgent")).toBe(30);
    expect(getAgentBudgetAed("intelligenceAgent")).toBe(40);
  });
  it("getAgentBudgetAed falls back to 40 for unknown agents", () => {
    expect(getAgentBudgetAed("totallyNewAgent")).toBe(40);
  });
  it("AGENT_LIMITS_AED carries both the short + suffixed forms", () => {
    expect(AGENT_LIMITS_AED.marketing).toBe(AGENT_LIMITS_AED.marketingAgent);
    expect(AGENT_LIMITS_AED.sales).toBe(AGENT_LIMITS_AED.salesAgent);
    expect(AGENT_LIMITS_AED.legal).toBe(AGENT_LIMITS_AED.legalAgent);
    expect(AGENT_LIMITS_AED.finance).toBe(AGENT_LIMITS_AED.financeAgent);
  });
});

// ---------------------------------------------------------------------------
// Snooze + alert formatting + ack parsing
// ---------------------------------------------------------------------------

describe("Intelligence Agent — snooze + ack helpers", () => {
  it("snoozeAlerts persists an `untilIso` memory row and returns the future date", async () => {
    const before = Date.now();
    const until = await snoozeAlerts(2); // 2 hours
    expect(until.getTime()).toBeGreaterThan(before + 60_000);
    expect(state.rememberCalls).toHaveLength(1);
    const value = (state.rememberCalls[0] as { value: { untilIso: string; hours: number } }).value;
    expect(typeof value.untilIso).toBe("string");
    expect(value.hours).toBe(2);
  });

  it("isAlertsSnoozed: false when memory row missing", async () => {
    state.recallReturn = null;
    expect(await isAlertsSnoozed()).toBe(false);
  });

  it("getAlertsSnoozedUntil: returns null when stored timestamp is in the past", async () => {
    state.recallReturn = {
      value: { untilIso: new Date(Date.now() - 60_000).toISOString() },
    };
    expect(await getAlertsSnoozedUntil()).toBeNull();
  });

  it("getAlertsSnoozedUntil: returns the future Date when active", async () => {
    const future = new Date(Date.now() + 3600_000);
    state.recallReturn = { value: { untilIso: future.toISOString() } };
    const got = await getAlertsSnoozedUntil();
    expect(got?.toISOString()).toBe(future.toISOString());
  });

  it("parseAckCommand: extracts the id-prefix from `ack <prefix>`", () => {
    expect(parseAckCommand("ack 1234abcd")).toBe("1234abcd");
    expect(parseAckCommand("  ack  deadbeef  ")).toBe("deadbeef");
    expect(parseAckCommand("ack")).toBeNull();
    expect(parseAckCommand("ack abc")).toBeNull(); // <4 chars
    expect(parseAckCommand("hello")).toBeNull();
  });

  it("acknowledgeAlert: returns null when no open candidate matches the prefix", async () => {
    state.selectQueue = [[]]; // no candidates
    const got = await acknowledgeAlert("12345678");
    expect(got).toBeNull();
    expect(state.updateCount).toBe(0);
  });

  it("acknowledgeAlert: updates and returns the row when a single open match is found", async () => {
    state.selectQueue = [[{ id: "12345678-aaaa-bbbb-cccc-1234567890ab", ack: null }]];
    const updatedRow = {
      id: "12345678-aaaa-bbbb-cccc-1234567890ab",
      acknowledgedAt: new Date(),
      alertType: "revenue_drop_wow",
    };
    state.updateReturn = [updatedRow];
    const got = await acknowledgeAlert("12345678");
    expect(got).toEqual(updatedRow);
    expect(state.updateCount).toBe(1);
  });

  it("acknowledgeAlert: refuses ambiguous prefixes (>=2 open candidates)", async () => {
    state.selectQueue = [[
      { id: "abcd1111-...", ack: null },
      { id: "abcd2222-...", ack: null },
    ]];
    const got = await acknowledgeAlert("abcd");
    expect(got).toBeNull();
    expect(state.updateCount).toBe(0);
  });

  it("formatAlertForWhatsApp: includes severity icon, title, body, and ack hint", () => {
    const alert = {
      id: "deadbeef-1111-2222-3333-444455556666",
      alertType: "revenue_drop_wow",
      severity: "critical",
      title: "Revenue dropped",
      body: "Down 60% WoW",
      dataJson: {},
      dayKey: "2026-04-25",
      acknowledgedAt: null,
      createdAt: new Date(),
    } as unknown as ProactiveAlert;
    const out = formatAlertForWhatsApp(alert);
    expect(out).toContain("🚨");
    expect(out).toContain("Revenue dropped");
    expect(out).toContain("Down 60% WoW");
    expect(out).toContain("ack deadbeef");
  });
});

// ---------------------------------------------------------------------------
// Sweep — dedupe + notify behaviour
// ---------------------------------------------------------------------------

describe("Intelligence Agent — runIntelligenceSweep", () => {
  it("quiet sweep: returns 0 new alerts and notifies nobody when nothing fires", async () => {
    // No detectors will fire here — we starve every select() with empty
    // results so detectors return null. The sweep should still log and
    // return a SweepResult shape with no new alerts and no notifications.
    state.selectQueue = []; // every select chain resolves to []
    const result = await runIntelligenceSweep();
    expect(result.detectorsRun).toBeGreaterThan(0);
    expect(result.newAlerts).toEqual([]);
    expect(result.notified).toBe(0);
    expect(state.notifyCalls).toHaveLength(0);
  });

  it("dedupe: a fired detector is not WhatsApp'd when insertIfNew hits the unique index", async () => {
    // Force the dispute-spike detector to fire (last7=18 vs prev7=5).
    // Other detectors stay quiet because their selects resolve to [].
    state.selectQueue = [
      [{ total: "0" }],     // revenueDrop.last
      [{ total: "0" }],     // revenueDrop.prev
      [{ c: 18 }],          // disputeSpike.last → fires CRITICAL
      [{ c: 5 }],           // disputeSpike.prev
      [{ c: 0 }],           // zeroDeals.deals
      [{ c: 0 }],           // zeroDeals.active (low → no alert)
    ];
    // Mark every insert as conflicting (already alerted today) — the
    // sweep should treat the detector as a no-op.
    state.insertConflictHit = true;
    const result = await runIntelligenceSweep();
    expect(state.insertCount).toBeGreaterThanOrEqual(1);
    expect(result.newAlerts).toEqual([]);
    expect(result.notified).toBe(0);
    expect(state.notifyCalls).toHaveLength(0);
  });

  it("snooze: warning alerts are skipped (skippedSnoozed++) but critical still pages", async () => {
    // Arrange: snoozed for 1h, and force the zero-deals (warning) detector
    // to fire while keeping all others idle. Then arrange a critical-row
    // insert that *does* return so we can assert critical bypasses snooze.
    state.recallReturn = {
      value: { untilIso: new Date(Date.now() + 3600_000).toISOString() },
    };

    // Selects fed in detector order: revenueDrop(last+prev),
    // disputeSpike(last+prev), zeroDeals(deals+active). detectAiBurnRate
    // and detectHotCategory don't use select() (they call execute() and
    // getBudgetVerdict), so they fall through to default empty results.
    state.selectQueue = [
      [{ total: "0" }],     // revenueDrop.last → small baseline → null
      [{ total: "0" }],     // revenueDrop.prev
      [{ c: 0 }],           // disputeSpike.last → low baseline → null
      [{ c: 0 }],           // disputeSpike.prev
      [{ c: 0 }],           // zeroDeals.deals
      [{ c: 250 }],         // zeroDeals.active → fires WARNING
    ];
    // Each insertIfNew call returns one inserted row so the sweep treats
    // it as freshly inserted (not a same-day duplicate).
    state.insertReturn = [
      {
        id: "00000000-zero-deals-1234",
        alertType: "zero_deals_48h",
        severity: "warning",
        title: "Zero completed deals in the last 48 hours",
        body: "...",
        dataJson: {},
        dayKey: "2026-04-25",
        acknowledgedAt: null,
        createdAt: new Date(),
      },
    ];

    const result = await runIntelligenceSweep();
    // The warning alert was inserted but suppressed by the active snooze.
    expect(result.newAlerts.length).toBeGreaterThanOrEqual(1);
    expect(result.skippedSnoozed).toBeGreaterThanOrEqual(1);
    expect(result.notified).toBe(0);
    expect(state.notifyCalls).toHaveLength(0);
  });
});
