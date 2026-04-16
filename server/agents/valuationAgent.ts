import { jsonCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { agentInteractions } from "@shared/schema";

export interface ValuationAdvice {
  estimatedRange: { min: number; max: number };
  fairValue: number;
  confidence: number;
  reasoning: string;
  tips: string[];
  marketComparison: string;
}

const SYSTEM_PROMPT = `You are a valuation advisor for BarterGram, a UAE barter marketplace.
Help users price their items/services for barter by estimating fair market value in AED.

Consider:
- UAE/GCC market prices
- Item condition and age
- Service rates in the region
- Barter premium (items may trade at 10-20% above cash value in barter)
- Category-specific factors

Respond with JSON:
{
  "estimatedRange": {"min": number, "max": number},
  "fairValue": number,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of valuation",
  "tips": ["tip1", "tip2"],
  "marketComparison": "how this compares to market average"
}

All values in AED. Be realistic and specific to the UAE market.`;

export async function getValuation(
  title: string,
  description: string,
  category: string,
  condition?: string,
  userId?: string
): Promise<ValuationAdvice> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Value this item/service for barter:\nTitle: ${title}\nDescription: ${description}\nCategory: ${category}${condition ? `\nCondition: ${condition}` : ""}`,
    },
  ];

  try {
    const { data, tokensUsed } = await jsonCompletion<ValuationAdvice>(messages, {
      temperature: 0.4,
      maxTokens: 512,
    });

    if (userId) {
      try {
        await db.insert(agentInteractions).values({
          userId,
          agentType: "valuation",
          userMessage: `Valuation: ${title} - ${category}`,
          agentResponse: JSON.stringify(data),
          tokensUsed,
        });
      } catch (err) {
        console.error("Failed to log valuation interaction:", err);
      }
    }

    return {
      estimatedRange: data.estimatedRange || { min: 0, max: 0 },
      fairValue: data.fairValue || 0,
      confidence: Math.min(1, Math.max(0, data.confidence || 0.5)),
      reasoning: data.reasoning || "Unable to determine",
      tips: data.tips || [],
      marketComparison: data.marketComparison || "",
    };
  } catch (error) {
    console.error("Valuation agent error:", error);
    return {
      estimatedRange: { min: 0, max: 0 },
      fairValue: 0,
      confidence: 0,
      reasoning: "Valuation service temporarily unavailable",
      tips: ["Try searching for similar items on the platform to compare prices"],
      marketComparison: "",
    };
  }
}
