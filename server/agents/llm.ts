import OpenAI from "openai";
import {
  logLlmCall,
  getBudgetVerdict,
  BudgetExceededError,
  DEFAULT_MODEL,
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
}

function lastUserContent(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return messages[messages.length - 1]?.content;
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

export async function jsonCompletion<T>(
  messages: ChatMessage[],
  options: LlmCallOptions,
): Promise<{ data: T; tokensUsed: number }> {
  const response = await chatCompletion(
    [
      ...messages,
      {
        role: "user",
        content: "Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.",
      },
    ],
    options,
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
