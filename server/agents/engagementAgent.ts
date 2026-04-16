import { jsonCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { agentInteractions } from "@shared/schema";
import type { User } from "@shared/schema";

interface OfferNeedItem {
  name: string;
  value: number;
}

export interface EngagementSuggestion {
  type: "listing_idea" | "profile_tip" | "trade_suggestion" | "trending_alert";
  title: string;
  message: string;
  actionUrl?: string;
}

const SYSTEM_PROMPT = `You are an engagement advisor for BarterGram, a UAE barter marketplace.
Based on user activity and profile, suggest actions to improve their trading success.

Types of suggestions:
- listing_idea: suggest new listings based on their offers/needs
- profile_tip: suggest profile improvements
- trade_suggestion: suggest specific trade opportunities
- trending_alert: highlight trending categories or opportunities

Respond with JSON array:
[{"type": "listing_idea"|"profile_tip"|"trade_suggestion"|"trending_alert", "title": "short title", "message": "actionable suggestion"}]

Return 2-3 relevant suggestions. Be specific to the UAE/GCC market. Keep messages under 100 words.`;

export async function getEngagementSuggestions(
  user: Pick<User, "id" | "whatIOffer" | "whatINeed" | "location" | "credibilityScore" | "totalCompletedDeals" | "bio">,
  recentActivity?: { postsCount: number; dealsCount: number; lastActive?: Date }
): Promise<EngagementSuggestion[]> {
  const profile = `User profile:
- Offers: ${(user.whatIOffer as OfferNeedItem[] || []).map((i) => i.name).join(", ") || "None listed"}
- Needs: ${(user.whatINeed as OfferNeedItem[] || []).map((i) => i.name).join(", ") || "None listed"}
- Location: ${user.location || "Not specified"}
- Credibility score: ${user.credibilityScore || 0}
- Completed deals: ${user.totalCompletedDeals || 0}
- Bio: ${user.bio || "Not set"}
- Recent posts: ${recentActivity?.postsCount ?? 0}
- Recent deals: ${recentActivity?.dealsCount ?? 0}`;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: profile },
  ];

  try {
    const { data, tokensUsed } = await jsonCompletion<EngagementSuggestion[]>(messages, {
      temperature: 0.7,
      maxTokens: 512,
    });

    try {
      await db.insert(agentInteractions).values({
        userId: user.id,
        agentType: "engagement",
        userMessage: "Engagement suggestions request",
        agentResponse: JSON.stringify(data),
        tokensUsed,
      });
    } catch (err) {
      console.error("Failed to log engagement interaction:", err);
    }

    return Array.isArray(data) ? data.slice(0, 3) : [];
  } catch (error) {
    console.error("Engagement agent error:", error);
    return [];
  }
}
