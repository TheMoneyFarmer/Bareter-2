import Anthropic from "@anthropic-ai/sdk";
import {
  logLlmCall,
  getBudgetVerdict,
  BudgetExceededError,
  DEFAULT_MODEL,
  isAgentBudgetSafe,
  getAgentBudgetVerdict,
} from "../companyOs/costTracker";
import { withRetry } from "../companyOs/retry";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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

// Claude requires messages to alternate between user and assistant.
// Merge consecutive same-role messages so the API never rejects the call.
function toAnthropicMessages(
  messages: ChatMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  const filtered = messages.filter((m) => m.role !== "system");
  const result: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of filtered) {
    const last = result[result.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n\n" + msg.content;
    } else {
      result.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }
  }
  return result;
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

  if (!options.skipAgentBudgetCheck && options.agentName) {
    const agentVerdict = await getAgentBudgetVerdict(options.agentName);
    if (!agentVerdict.safe) {
      const fallback =
        options.agentBudgetFallback ?? defaultAgentBudgetFallback(options.agentName);
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

  const systemMessage = messages.find((m) => m.role === "system")?.content;
  const chatMessages = toAnthropicMessages(messages);

  try {
    const { content, tokensUsed } = await withRetry(
      async () => {
        const response = await anthropic.messages.create({
          model,
          ...(systemMessage ? { system: systemMessage } : {}),
          messages: chatMessages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024,
        });
        return {
          content: response.content[0]?.type === "text" ? response.content[0].text : "",
          tokensUsed: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        };
      },
      { agentName: options.agentName, opName: "llm.chat" },
    );

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
  agentBudgetJsonFallback?: T;
}

export interface JsonCompletionResult<T> {
  data: T | null;
  tokensUsed: number;
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
  if (!options.skipAgentBudgetCheck && options.agentName) {
    const agentVerdict = await getAgentBudgetVerdict(options.agentName);
    if (!agentVerdict.safe) {
      const hasFallback = options.agentBudgetJsonFallback !== undefined;
      await logLlmCall({
        agentName: options.agentName,
        command: options.command ?? null,
        inputPreview: options.inputPreview ?? lastUserContent(messages),
        outputPreview: hasFallback ? "json_fallback_returned" : "json_null_returned",
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

  // Append JSON instruction as part of the last user message to avoid
  // consecutive user messages which Claude's API doesn't allow.
  const messagesWithJson = [...messages];
  const lastIdx = messagesWithJson.length - 1;
  if (lastIdx >= 0 && messagesWithJson[lastIdx].role === "user") {
    messagesWithJson[lastIdx] = {
      ...messagesWithJson[lastIdx],
      content:
        messagesWithJson[lastIdx].content +
        "\n\nRespond ONLY with valid JSON. No markdown, no code blocks, no explanation.",
    };
  } else {
    messagesWithJson.push({
      role: "user",
      content: "Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.",
    });
  }

  const response = await chatCompletion(messagesWithJson, {
    ...options,
    skipAgentBudgetCheck: true,
  });

  let parsed: T;
  try {
    // Strip markdown fences, then extract the outermost JSON object or array
    const stripped = response.content
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    // Find the first { or [ and the matching last } or ]
    const objStart = stripped.indexOf("{");
    const arrStart = stripped.indexOf("[");
    const isObj = objStart !== -1 && (arrStart === -1 || objStart < arrStart);
    const start = isObj ? objStart : arrStart;
    const end = isObj ? stripped.lastIndexOf("}") : stripped.lastIndexOf("]");
    const jsonStr = start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped;
    parsed = JSON.parse(jsonStr) as T;
  } catch {
    throw new Error(`Failed to parse LLM JSON response: ${response.content.substring(0, 200)}`);
  }

  return { data: parsed, tokensUsed: response.tokensUsed };
}

// Re-export for callers that want to skip the broker-level pre-check
export { isAgentBudgetSafe };
