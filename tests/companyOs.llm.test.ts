import { describe, it, expect, beforeEach, vi } from "vitest";

// State the cost-tracker mock will read from. Switch `safe` to false to
// simulate a per-agent monthly cap breach, then re-import jsonCompletion.
const ctState = {
  agentSafe: true,
  globalSafe: true,
  loggedCalls: [] as Array<Record<string, unknown>>,
};

vi.mock("../server/companyOs/costTracker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/companyOs/costTracker")>();
  return {
    ...actual,
    DEFAULT_MODEL: "gpt-test",
    logLlmCall: vi.fn(async (row: Record<string, unknown>) => {
      ctState.loggedCalls.push(row);
    }),
    getBudgetVerdict: vi.fn(async () => ({
      spentAed: 0,
      budgetAed: 1000,
      remainingAed: 1000,
      pctUsed: 0,
      safe: ctState.globalSafe,
    })),
    isAgentBudgetSafe: vi.fn(async () => ctState.agentSafe),
    getAgentBudgetVerdict: vi.fn(async (agent: string) => ({
      agentName: agent,
      spentAed: ctState.agentSafe ? 1 : 50,
      budgetAed: 40,
      remainingAed: ctState.agentSafe ? 39 : 0,
      pctUsed: ctState.agentSafe ? 0.025 : 1.25,
      safe: ctState.agentSafe,
    })),
  };
});

// Stub OpenAI so a passing test never reaches the real network. If a
// jsonCompletion call falls through to OpenAI we want it to either
// return a valid JSON string (happy path) or throw loudly (so a buggy
// fallback path can be detected). Use vi.hoisted so the spy survives
// vi.mock's automatic hoisting.
const { openaiCreate } = vi.hoisted(() => ({
  openaiCreate: vi.fn(async () => ({
    choices: [{ message: { content: '{"ok":true,"echo":"live"}' } }],
    usage: { total_tokens: 12 },
  })),
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
  },
}));

import { jsonCompletion, chatCompletion } from "../server/agents/llm";
import { BudgetExceededError } from "../server/companyOs/costTracker";

beforeEach(() => {
  ctState.agentSafe = true;
  ctState.globalSafe = true;
  ctState.loggedCalls = [];
  openaiCreate.mockClear();
});

describe("jsonCompletion — per-agent budget graceful degradation", () => {
  it("returns the typed fallback (no JSON.parse, no throw) when the per-agent cap is breached and a fallback is supplied", async () => {
    ctState.agentSafe = false;
    interface Out { ok: boolean; reason: string }
    const fallback: Out = { ok: false, reason: "agent_budget" };

    const result = await jsonCompletion<Out>(
      [{ role: "user", content: "irrelevant" }],
      {
        agentName: "intelligenceAgent",
        command: "test",
        agentBudgetJsonFallback: fallback,
      },
    );

    expect(result.data).toEqual(fallback);
    expect(result.tokensUsed).toBe(0);
    // OpenAI must NOT have been called — the whole point is to skip it.
    expect(openaiCreate).not.toHaveBeenCalled();
    // We should have logged the blocked call for auditing.
    expect(ctState.loggedCalls.length).toBe(1);
    expect(ctState.loggedCalls[0].status).toBe("blocked_budget");
    expect(ctState.loggedCalls[0].outputPreview).toBe("json_fallback_returned");
  });

  it("returns { data: null, budgetBlocked: true } on per-agent breach when no fallback is supplied — never throws", async () => {
    ctState.agentSafe = false;
    const result = await jsonCompletion<{ ok: boolean }>(
      [{ role: "user", content: "irrelevant" }],
      { agentName: "intelligenceAgent", command: "test" },
    );
    expect(result.data).toBeNull();
    expect(result.tokensUsed).toBe(0);
    expect(result.budgetBlocked).toBe(true);
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(ctState.loggedCalls[0].status).toBe("blocked_budget");
    expect(ctState.loggedCalls[0].outputPreview).toBe("json_null_returned");
  });

  it("happy path: parses live JSON when the per-agent cap is safe", async () => {
    ctState.agentSafe = true;
    const result = await jsonCompletion<{ ok: boolean; echo: string }>(
      [{ role: "user", content: "ping" }],
      { agentName: "intelligenceAgent" },
    );
    expect(result.data).toEqual({ ok: true, echo: "live" });
    expect(result.tokensUsed).toBe(12);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
  });
});

describe("chatCompletion — per-agent budget graceful degradation", () => {
  it("returns the humanised fallback string (no throw) when the per-agent cap is breached", async () => {
    ctState.agentSafe = false;
    const out = await chatCompletion(
      [{ role: "user", content: "summarise X" }],
      { agentName: "marketingAgent", command: "summarise" },
    );
    expect(out.tokensUsed).toBe(0);
    expect(out.content).toMatch(/AI budget for marketingAgent reached/);
    expect(openaiCreate).not.toHaveBeenCalled();
  });

  it("still throws BudgetExceededError on global budget breach (per-agent gate is graceful, global is hard)", async () => {
    ctState.agentSafe = true;
    ctState.globalSafe = false;
    await expect(
      chatCompletion(
        [{ role: "user", content: "anything" }],
        { agentName: "marketingAgent" },
      ),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});
