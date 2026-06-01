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

const SYSTEM_PROMPT = `You are an engagement advisor for Bareter, a worldwide barter marketplace.
Based on user activity, profile, and current location, suggest actions to improve their trading success.

Types of suggestions:
- listing_idea: suggest new listings based on their offers/needs
- profile_tip: suggest profile improvements
- trade_suggestion: suggest specific trade opportunities
- trending_alert: highlight trending categories or opportunities

Respond with JSON array:
[{"type": "listing_idea"|"profile_tip"|"trade_suggestion"|"trending_alert", "title": "short title", "message": "actionable suggestion"}]

Return 2-3 relevant suggestions. Tailor advice to the user's local market. Keep messages under 100 words.`;

export async function getEngagementSuggestions(
  user: Pick<User, "id" | "whatIOffer" | "whatINeed" | "location" | "country" | "city" | "credibilityScore" | "totalCompletedDeals" | "bio">,
  recentActivity?: { postsCount: number; dealsCount: number; lastActive?: Date }
): Promise<EngagementSuggestion[]> {
  const locationLabel = [user.city, user.country, user.location].filter(Boolean).join(", ") || "Not specified";
  const profile = `User profile:
- Offers: ${(user.whatIOffer as OfferNeedItem[] || []).map((i) => i.name).join(", ") || "None listed"}
- Needs: ${(user.whatINeed as OfferNeedItem[] || []).map((i) => i.name).join(", ") || "None listed"}
- Location: ${locationLabel}
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
      agentName: "engagement",
      temperature: 0.7,
      maxTokens: 512,
      // Per-agent budget breach: return an empty list so the panel
      // simply renders no suggestions instead of erroring.
      agentBudgetJsonFallback: [],
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
