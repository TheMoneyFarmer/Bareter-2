import OpenAI from "openai";
import {
  logLlmCall,
  getBudgetVerdict,
  BudgetExceededError,
  DEFAULT_MODEL,
  isAgentBudgetSafe,
  getAgentBudgetVerdict,
} from "../companyOs/costTracker";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type AgentRole = "moderation" | "support" | "matching" | "valuation" | "engagement" | "admin";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCallOptions {
  agentName: string;
  command?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  inputPreview?: string;
  outputPreview?: string;
  skipBudgetCheck?: boolean;
  /**
   * Skip the per-agent monthly cap pre-check. The global budget gate
   * still fires. Useful for callers that have already pre-checked the
   * agent budget (e.g. the Manager Agent's free-form path) or for
   * critical paths that must bypass per-agent throttling.
   */
  skipAgentBudgetCheck?: boolean;
  /**
   * Optional override for the fallback content returned on per-agent
   * breach. Defaults to a humanised "_(AI budget for <agent> reached…)_"
   * line so downstream UIs can still render something useful.
   */
  agentBudgetFallback?: string;
}

function lastUserContent(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return messages[messages.length - 1]?.content;
}

function defaultAgentBudgetFallback(agent: string): string {
  return `_(AI budget for ${agent} reached, summary skipped)_`;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: LlmCallOptions,
): Promise<{ content: string; tokensUsed: number }> {
  const model = options.model ?? DEFAULT_MODEL;
  const inputPreview = options.inputPreview ?? lastUserContent(messages);

  if (!options.skipBudgetCheck) {
    const verdict = await getBudgetVerdict();
    if (!verdict.safe) {
      await logLlmCall({
        agentName: options.agentName,
        command: options.command ?? null,
        inputPreview,
        model,
        tokensUsed: 0,
        status: "blocked_budget",
        errorMessage: `budget at ${(verdict.pctUsed * 100).toFixed(1)}%`,
      });
      throw new BudgetExceededError(verdict);
    }
  }

  // Per-agent cap — graceful: log + return a fallback string instead
  // of throwing. A runaway agent should degrade quietly so the rest of
  // the OS keeps responding to the founder over WhatsApp.
  if (!options.skipAgentBudgetCheck && options.agentName) {
    const agentVerdict = await getAgentBudgetVerdict(options.agentName);
    if (!agentVerdict.safe) {
      const fallback =
        options.agentBudgetFallback ??
        defaultAgentBudgetFallback(options.agentName);
      await logLlmCall({
        agentName: options.agentName,
        command: options.command ?? null,
        inputPreview,
        outputPreview: fallback,
        model,
        tokensUsed: 0,
        status: "blocked_budget",
        errorMessage: `agent_budget at ${(agentVerdict.pctUsed * 100).toFixed(1)}% of AED ${agentVerdict.budgetAed.toFixed(2)}`,
      });
      return { content: fallback, tokensUsed: 0 };
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
    });

    const content = response.choices[0]?.message?.content || "";
    const tokensUsed = response.usage?.total_tokens || 0;

    await logLlmCall({
      agentName: options.agentName,
      command: options.command ?? null,
      inputPreview,
      outputPreview: options.outputPreview ?? content,
      model,
      tokensUsed,
      status: "ok",
    });

    return { content, tokensUsed };
  } catch (error) {
    if (error instanceof BudgetExceededError) throw error;
    console.error("LLM chat completion error:", error);
    await logLlmCall({
      agentName: options.agentName,
      command: options.command ?? null,
      inputPreview,
      model,
      tokensUsed: 0,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export interface JsonCompletionOptions<T> extends LlmCallOptions {
  /**
   * Typed fallback returned when the per-agent budget is breached.
   * If omitted, the per-agent breach path returns `data: null` (typed
   * as `T`) so callers must null-check on breach. Either way the
   * function NEVER throws on per-agent breach — graceful degradation
   * is the architectural rule. Global breach still throws
   * `BudgetExceededError` (same as `chatCompletion`).
   */
  agentBudgetJsonFallback?: T;
}

/**
 * The shape `jsonCompletion` always returns. `data` is the parsed
 * JSON on the happy path, the supplied `agentBudgetJsonFallback` on
 * per-agent breach (when one was given), or `null` on per-agent breach
 * with no fallback. Callers expecting strict `T` should either pass a
 * fallback or null-check `data`.
 */
export interface JsonCompletionResult<T> {
  data: T | null;
  tokensUsed: number;
  /**
   * True when the per-agent budget was breached and the call short-
   * circuited without hitting OpenAI. Lets callers distinguish
   * "the LLM returned null" from "we never asked the LLM".
   */
  budgetBlocked?: boolean;
}

// Overloads: when a typed fallback is supplied we guarantee `data: T`
// (never null); otherwise `data: T | null` and callers must null-check.
export async function jsonCompletion<T>(
  messages: ChatMessage[],
  options: JsonCompletionOptions<T> & { agentBudgetJsonFallback: T },
): Promise<{ data: T; tokensUsed: number; budgetBlocked?: boolean }>;
export async function jsonCompletion<T>(
  messages: ChatMessage[],
  options: JsonCompletionOptions<T>,
): Promise<JsonCompletionResult<T>>;
export async function jsonCompletion<T>(
  messages: ChatMessage[],
  options: JsonCompletionOptions<T>,
): Promise<JsonCompletionResult<T>> {
  // Pre-check the per-agent cap ourselves so we can return a typed
  // fallback instead of letting `chatCompletion` hand back its
  // humanised "budget reached" string — which `JSON.parse` would
  // then choke on, defeating the whole point of graceful degradation.
  // Per the architectural rule we NEVER throw on a per-agent breach;
  // we return the supplied typed fallback when present, otherwise
  // `null` (typed as `T`) so the call still resolves cleanly.
  if (!options.skipAgentBudgetCheck && options.agentName) {
    const agentVerdict = await getAgentBudgetVerdict(options.agentName);
    if (!agentVerdict.safe) {
      const hasFallback = options.agentBudgetJsonFallback !== undefined;
      await logLlmCall({
        agentName: options.agentName,
        command: options.command ?? null,
        inputPreview: options.inputPreview ?? lastUserContent(messages),
        outputPreview: hasFallback
          ? "json_fallback_returned"
          : "json_null_returned",
        model: options.model ?? DEFAULT_MODEL,
        tokensUsed: 0,
        status: "blocked_budget",
        errorMessage: `agent_budget at ${(agentVerdict.pctUsed * 100).toFixed(1)}% of AED ${agentVerdict.budgetAed.toFixed(2)}`,
      });
      return {
        data: hasFallback ? (options.agentBudgetJsonFallback as T) : null,
        tokensUsed: 0,
        budgetBlocked: true,
      };
    }
  }

  // We've already cleared the per-agent gate; tell `chatCompletion` not
  // to re-check (and therefore never return its humanised fallback).
  const response = await chatCompletion(
    [
      ...messages,
      {
        role: "user",
        content: "Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.",
      },
    ],
    { ...options, skipAgentBudgetCheck: true },
  );

  let parsed: T;
  try {
    const cleaned = response.content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    parsed = JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`Failed to parse LLM JSON response: ${response.content.substring(0, 200)}`);
  }

  return { data: parsed, tokensUsed: response.tokensUsed };
}

// Re-export for callers that want to skip the broker-level pre-check
// (e.g. the Manager Agent renders a friendlier WhatsApp-side refusal).
export { isAgentBudgetSafe };
