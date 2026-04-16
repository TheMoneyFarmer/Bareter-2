import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type AgentRole = "moderation" | "support" | "matching" | "valuation" | "engagement" | "admin";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ content: string; tokensUsed: number }> {
  try {
    const response = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
    });

    const content = response.choices[0]?.message?.content || "";
    const tokensUsed = response.usage?.total_tokens || 0;

    return { content, tokensUsed };
  } catch (error) {
    console.error("LLM chat completion error:", error);
    throw error;
  }
}

export async function jsonCompletion<T>(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ data: T; tokensUsed: number }> {
  const response = await chatCompletion(
    [
      ...messages,
      {
        role: "user",
        content: "Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.",
      },
    ],
    options
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
