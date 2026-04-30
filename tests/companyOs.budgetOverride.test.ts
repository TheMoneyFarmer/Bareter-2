// Per-agent budget override persistence + cache reload.
//
// Covers the "founder edits a cap, restarts the server, and the new
// cap is in effect on the very first read" guarantee promised by the
// admin dashboard. We mock `server/db` so the test runs without
// Postgres and stage a synthetic agent_budgets row.

import { describe, it, expect, beforeEach, vi } from "vitest";

interface CaptureState {
  selectRows: Array<{ agentName: string; monthlyCapAed: string }>;
  upserts: Array<{ agentName: string; monthlyCapAed: string }>;
}

const state: CaptureState = {
  selectRows: [],
  upserts: [],
};

vi.mock("../server/db", () => {
  const selectChain: any = {
    from: () => Promise.resolve(state.selectRows),
  };
  const insertChain: any = {
    values: (v: any) => {
      state.upserts.push({
        agentName: v.agentName,
        monthlyCapAed: String(v.monthlyCapAed),
      });
      return insertChain;
    },
    onConflictDoUpdate: () => Promise.resolve(),
  };
  return {
    db: {
      select: () => selectChain,
      insert: () => insertChain,
    },
  };
});

beforeEach(() => {
  state.selectRows = [];
  state.upserts = [];
  vi.resetModules();
  // Make sure no stray env override fights the test.
  delete process.env.COMPANY_OS_BUDGET_AED_MARKETING;
  delete process.env.COMPANY_OS_BUDGET_AED_VALUATION;
});

describe("Per-agent budget override · DB persistence + cache", () => {
  it("getAgentBudgetAed returns the DB override after warm-up", async () => {
    state.selectRows = [{ agentName: "marketing", monthlyCapAed: "123.45" }];
    const mod = await import("../server/companyOs/costTracker");
    await mod.ensureAgentBudgetOverridesLoaded();
    const cap = mod.getAgentBudgetAed("marketing");
    expect(cap).toBe(123.45);
  });

  it("env override beats DB override", async () => {
    state.selectRows = [{ agentName: "marketing", monthlyCapAed: "200" }];
    process.env.COMPANY_OS_BUDGET_AED_MARKETING = "999";
    const mod = await import("../server/companyOs/costTracker");
    await mod.ensureAgentBudgetOverridesLoaded();
    expect(mod.getAgentBudgetAed("marketing")).toBe(999);
  });

  it("falls back to hardcoded AGENT_LIMITS_AED when no DB row exists", async () => {
    state.selectRows = [];
    const mod = await import("../server/companyOs/costTracker");
    await mod.ensureAgentBudgetOverridesLoaded();
    // Marketing default is non-zero in the hardcoded map; we only
    // assert it's a positive finite number to avoid coupling to the
    // exact AED amount which the founder may tune later.
    const cap = mod.getAgentBudgetAed("marketing");
    expect(Number.isFinite(cap)).toBe(true);
    expect(cap).toBeGreaterThan(0);
  });

  it("setAgentBudgetOverride upserts and updates the in-memory cache atomically", async () => {
    state.selectRows = [];
    const mod = await import("../server/companyOs/costTracker");
    await mod.ensureAgentBudgetOverridesLoaded();
    await mod.setAgentBudgetOverride("valuation", 77);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].agentName).toBe("valuation");
    expect(Number(state.upserts[0].monthlyCapAed)).toBe(77);
    expect(mod.getAgentBudgetAed("valuation")).toBe(77);
  });

  it("normalizes alias variants to the same canonical row", async () => {
    state.selectRows = [];
    const mod = await import("../server/companyOs/costTracker");
    await mod.ensureAgentBudgetOverridesLoaded();
    await mod.setAgentBudgetOverride("marketingAgent", 88);
    // Both query forms should resolve to the same cap because the
    // canonical name strips the trailing "Agent".
    expect(mod.getAgentBudgetAed("marketing")).toBe(88);
    expect(mod.getAgentBudgetAed("marketingAgent")).toBe(88);
    // Both query forms canonicalise to the same DB row, so the
    // single upsert should be written under the short name.
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].agentName).toBe("marketing");
  });
});
