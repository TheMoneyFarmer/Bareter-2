// Alias-safe accounting for per-agent budget caps.
//
// Verifies that no matter which naming variant a call site uses to
// query spend (`marketing` vs `marketingAgent`, etc.) we always sum
// across BOTH forms — so a cap is never bypassed by writing logs
// under one alias and querying under the other.
//
// We mock `server/db` with a tiny capture-shim that records the
// `inArray` call's value list so we can assert the variants set is
// symmetric, and stage a synthetic row total to verify the resolved
// number flows back through `getAgentSpendAed`.

import { describe, it, expect, beforeEach, vi } from "vitest";

interface CaptureState {
  inArrayValues: unknown[] | null;
  selectTotal: number;
}

const state: CaptureState = {
  inArrayValues: null,
  selectTotal: 0,
};

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    inArray: (_col: unknown, values: unknown[]) => {
      state.inArrayValues = values;
      // Return a sentinel — the mocked db ignores it.
      return { __mock: "inArray", values } as unknown;
    },
  };
});

vi.mock("../server/db", () => {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    then: (onF: any, onR: any) =>
      Promise.resolve([{ total: String(state.selectTotal) }]).then(onF, onR),
  };
  return {
    db: {
      select: () => chain,
    },
  };
});

import {
  aliasesForAgent,
  getAgentSpendAed,
  AGENT_LIMITS_AED,
  CANONICAL_AGENT_NAMES,
  canonicalAgentName,
} from "../server/companyOs/costTracker";

beforeEach(() => {
  state.inArrayValues = null;
  state.selectTotal = 0;
});

describe("Per-agent alias-safe accounting", () => {
  it("aliasesForAgent('marketing') includes 'marketingAgent'", () => {
    const aliases = aliasesForAgent("marketing");
    expect(aliases).toContain("marketing");
    expect(aliases).toContain("marketingAgent");
  });

  it("aliasesForAgent('marketingAgent') ALSO includes 'marketing' (the asymmetry fix)", () => {
    const aliases = aliasesForAgent("marketingAgent");
    expect(aliases).toContain("marketing");
    expect(aliases).toContain("marketingAgent");
  });

  it("aliasesForAgent is symmetric for every short<->suffixed pair in AGENT_LIMITS_AED", () => {
    for (const short of ["marketing", "sales", "legal", "finance", "dashboard", "memory"]) {
      const fromShort = aliasesForAgent(short);
      const fromSuffixed = aliasesForAgent(`${short}Agent`);
      expect(fromShort).toContain(short);
      expect(fromShort).toContain(`${short}Agent`);
      expect(fromSuffixed).toContain(short);
      expect(fromSuffixed).toContain(`${short}Agent`);
    }
  });

  it("aliasesForAgent leaves canonical-suffixed agents (intelligenceAgent) intact", () => {
    const aliases = aliasesForAgent("intelligenceAgent");
    expect(aliases).toContain("intelligenceAgent");
    // No `intelligence` short alias is configured but the helper still
    // proposes the bare form defensively — caps lookup will gracefully
    // miss it, which is fine.
    expect(aliases).toContain("intelligence");
  });

  it("getAgentSpendAed('marketing') queries against BOTH aliases via inArray", async () => {
    state.selectTotal = 12.5;
    const total = await getAgentSpendAed("marketing");
    expect(total).toBeCloseTo(12.5);
    expect(state.inArrayValues).toBeTruthy();
    expect(state.inArrayValues).toContain("marketing");
    expect(state.inArrayValues).toContain("marketingAgent");
  });

  it("getAgentSpendAed('marketingAgent') ALSO queries against the short form (the asymmetry fix)", async () => {
    state.selectTotal = 7.25;
    const total = await getAgentSpendAed("marketingAgent");
    expect(total).toBeCloseTo(7.25);
    expect(state.inArrayValues).toBeTruthy();
    expect(state.inArrayValues).toContain("marketing");
    expect(state.inArrayValues).toContain("marketingAgent");
  });

  it("AGENT_LIMITS_AED has matching caps for every short/suffixed pair", () => {
    expect(AGENT_LIMITS_AED.marketing).toBe(AGENT_LIMITS_AED.marketingAgent);
    expect(AGENT_LIMITS_AED.sales).toBe(AGENT_LIMITS_AED.salesAgent);
    expect(AGENT_LIMITS_AED.legal).toBe(AGENT_LIMITS_AED.legalAgent);
    expect(AGENT_LIMITS_AED.finance).toBe(AGENT_LIMITS_AED.financeAgent);
    expect(AGENT_LIMITS_AED.dashboard).toBe(AGENT_LIMITS_AED.dashboardAgent);
    expect(AGENT_LIMITS_AED.memory).toBe(AGENT_LIMITS_AED.memoryAgent);
  });

  it("canonicalAgentName collapses suffixed back to short", () => {
    expect(canonicalAgentName("marketingAgent")).toBe("marketing");
    expect(canonicalAgentName("marketing")).toBe("marketing");
    expect(canonicalAgentName("salesAgent")).toBe("sales");
    expect(canonicalAgentName("intelligenceAgent")).toBe("intelligenceAgent");
  });

  it("CANONICAL_AGENT_NAMES list is the documented set", () => {
    expect(CANONICAL_AGENT_NAMES).toContain("marketing");
    expect(CANONICAL_AGENT_NAMES).toContain("intelligenceAgent");
    expect(CANONICAL_AGENT_NAMES).not.toContain("marketingAgent");
  });
});
