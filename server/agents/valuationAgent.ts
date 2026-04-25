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

const SYSTEM_PROMPT = `You are a valuation advisor for Bareter, a worldwide barter marketplace.
Help users price their items/services for barter by estimating fair market value in their local currency
(default AED if not specified).

Consider:
- Local market prices in the user's country/city
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

Be realistic and specific to the user's local market.`;

export async function getValuation(
  title: string,
  description: string,
  category: string,
  condition?: string,
  userId?: string,
  geo?: { country?: string | null; city?: string | null },
): Promise<ValuationAdvice> {
  const localeNote = geo?.country
    ? `Local market: ${[geo.city, geo.country].filter(Boolean).join(", ")}.`
    : "Local market: UAE (default).";
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Value this item/service for barter:\n${localeNote}\nTitle: ${title}\nDescription: ${description}\nCategory: ${category}${condition ? `\nCondition: ${condition}` : ""}`,
    },
  ];

  try {
    const { data, tokensUsed } = await jsonCompletion<ValuationAdvice>(messages, {
      agentName: "valuation",
      temperature: 0.4,
      maxTokens: 512,
      // Per-agent budget breach: return a neutral, low-confidence
      // valuation so the form still renders something usable.
      agentBudgetJsonFallback: {
        estimatedRange: { min: 0, max: 0 },
        fairValue: 0,
        confidence: 0.1,
        reasoning: "AI valuation paused: monthly valuation-agent budget reached.",
        tips: [],
        marketComparison: "",
      },
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
