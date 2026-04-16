import { chatCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { agentInteractions } from "@shared/schema";

const SYSTEM_PROMPT = `You are BarterBot, the friendly customer support assistant for BarterGram — a UAE barter marketplace for businesses.

You help users with:
- How to create listings and propose trades
- Understanding the deal flow (propose → accept → in_progress → delivery_proof → completed)
- Verification requirements (KYC for individuals, KYB/trade license for businesses)
- Safety tips for safe trading
- How the credibility score works
- Platform policies and terms of service
- How to report scams or issues

Important facts:
- BarterGram charges a small success fee on completed deals
- Business accounts need an approved trade license (KYB) to create listings
- All users must verify identity before trading
- Trades over AED 5,000 require extra caution
- Users should never take communication off-platform

Keep responses concise (2-3 sentences max), friendly, and helpful. If you don't know something, say so and suggest contacting support@bartergram.ae.
Do NOT make up features that don't exist. Answer in the same language the user writes in (English or Arabic).`;

export async function getSupportResponse(
  userMessage: string,
  conversationHistory: ChatMessage[] = [],
  userId?: string
): Promise<{ response: string; tokensUsed: number }> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-6),
    { role: "user", content: userMessage },
  ];

  try {
    const { content, tokensUsed } = await chatCompletion(messages, {
      temperature: 0.5,
      maxTokens: 512,
    });

    if (userId) {
      try {
        await db.insert(agentInteractions).values({
          userId,
          agentType: "support",
          userMessage,
          agentResponse: content,
          tokensUsed,
        });
      } catch (err) {
        console.error("Failed to log support interaction:", err);
      }
    }

    return { response: content, tokensUsed };
  } catch (error) {
    console.error("Support agent error:", error);
    return {
      response: "I'm having trouble right now. Please try again or email support@bartergram.ae for help.",
      tokensUsed: 0,
    };
  }
}
