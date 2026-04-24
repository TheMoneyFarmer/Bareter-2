// Per-LLM-call cost tracker for the Company OS / WhatsApp Manager Agent.
//
// Every call routed through the manager records token usage + an AED
// estimate to `company_os_logs`. The monthly budget gate short-circuits
// the free-form path before it ever hits OpenAI when spend reaches 95%
// of the configured AED budget.

import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { companyOsLogs } from "@shared/schema";

export const DEFAULT_MODEL = "openai/gpt-4o-mini";

// USD price per 1K tokens, blended (input/output averaged for simplicity).
// Easy to extend by adding rows. We keep the values deliberately
// conservative (round up) so the budget gate fires earlier rather than
// later.
const MODEL_USD_PER_1K_TOKENS: Record<string, number> = {
  "openai/gpt-4o-mini": 0.0006, // ~$0.15/M in + $0.60/M out, blended high
  "openai/gpt-4o": 0.0125,
  "openai/gpt-4.1-mini": 0.0008,
};

function getUsdToAed(): number {
  const raw = Number(process.env.USD_TO_AED_RATE);
  return Number.isFinite(raw) && raw > 0 ? raw : 3.6725;
}

function getMonthlyBudgetAed(): number {
  const raw = Number(process.env.COMPANY_OS_MONTHLY_BUDGET_AED);
  return Number.isFinite(raw) && raw > 0 ? raw : 400;
}

export function estimateCostAed(model: string, tokens: number): number {
  const usdPer1k = MODEL_USD_PER_1K_TOKENS[model] ?? MODEL_USD_PER_1K_TOKENS[DEFAULT_MODEL];
  const usd = (tokens / 1000) * usdPer1k;
  return Number((usd * getUsdToAed()).toFixed(6));
}

export interface LogLlmCallInput {
  agentName: string;
  command?: string | null;
  inputPreview?: string | null;
  outputPreview?: string | null;
  model?: string;
  tokensUsed: number;
  status?: "ok" | "error" | "blocked_budget";
  errorMessage?: string | null;
}

function preview(s: string | null | undefined, max = 500): string | null {
  if (!s) return null;
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

export async function logLlmCall(input: LogLlmCallInput): Promise<void> {
  const model = input.model ?? DEFAULT_MODEL;
  const costAed = estimateCostAed(model, input.tokensUsed);
  try {
    await db.insert(companyOsLogs).values({
      agentName: input.agentName,
      command: input.command ?? null,
      inputPreview: preview(input.inputPreview),
      outputPreview: preview(input.outputPreview),
      model,
      tokensUsed: input.tokensUsed,
      costAed: costAed.toFixed(6),
      status: input.status ?? "ok",
      errorMessage: input.errorMessage ?? null,
    });
  } catch (err) {
    console.error("[companyOs] logLlmCall failed:", err);
  }
}

export interface BudgetVerdict {
  safe: boolean;
  spentAed: number;
  budgetAed: number;
  remainingAed: number;
  pctUsed: number; // 0..1
}

function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getMonthSpendAed(): Promise<number> {
  try {
    const since = startOfMonthUtc();
    const rows = await db
      .select({
        total: sql<string>`COALESCE(SUM(${companyOsLogs.costAed}), 0)`,
      })
      .from(companyOsLogs)
      .where(gte(companyOsLogs.createdAt, since));
    const raw = rows[0]?.total ?? "0";
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    console.error("[companyOs] getMonthSpendAed failed:", err);
    return 0;
  }
}

export async function getBudgetVerdict(): Promise<BudgetVerdict> {
  const budgetAed = getMonthlyBudgetAed();
  const spentAed = await getMonthSpendAed();
  const pctUsed = budgetAed > 0 ? spentAed / budgetAed : 0;
  const safe = pctUsed < 0.95;
  return {
    safe,
    spentAed: Number(spentAed.toFixed(2)),
    budgetAed,
    remainingAed: Number(Math.max(0, budgetAed - spentAed).toFixed(2)),
    pctUsed,
  };
}

export async function isBudgetSafe(): Promise<boolean> {
  return (await getBudgetVerdict()).safe;
}

// Total cost in AED for a custom date range — used by the daily briefing
// and the WhatsApp `costs` command.
export async function getSpendBetween(from: Date, to: Date): Promise<number> {
  try {
    const rows = await db
      .select({
        total: sql<string>`COALESCE(SUM(${companyOsLogs.costAed}), 0)`,
      })
      .from(companyOsLogs)
      .where(and(gte(companyOsLogs.createdAt, from), lte(companyOsLogs.createdAt, to)));
    const n = Number(rows[0]?.total ?? "0");
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    console.error("[companyOs] getSpendBetween failed:", err);
    return 0;
  }
}
