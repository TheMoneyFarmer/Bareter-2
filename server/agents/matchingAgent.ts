import { jsonCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { agentInteractions } from "@shared/schema";
import type { User, Listing } from "@shared/schema";

interface OfferNeedItem {
  name: string;
  value: number;
}

export interface MatchResult {
  listingId: string;
  score: number;
  reason: string;
}

const SYSTEM_PROMPT = `You are a smart matching agent for Bareter, a UAE barter marketplace.
Given a user's profile (what they offer and need) and available listings, rank the best barter matches.

Consider:
- Direct match: user offers what listing needs, and listing offers what user needs
- Category alignment
- Value similarity (within 30% range is ideal for barter)
- Location proximity
- Complementary business types (e.g., photographer + fashion brand)

Respond with JSON array of matches:
[{"listingId": "id", "score": 0.0-1.0, "reason": "brief explanation"}]

Return up to 5 best matches, sorted by score descending. Only include matches with score > 0.3.`;

export async function findMatches(
  user: Pick<User, "id" | "whatIOffer" | "whatINeed" | "location" | "country" | "city" | "preferredCategories">,
  listings: Pick<Listing, "id" | "title" | "description" | "categories" | "retailValue" | "location" | "country" | "city" | "type" | "wantedCategories">[]
): Promise<MatchResult[]> {
  if (listings.length === 0) return [];

  const userLocationLabel = [user.city, user.country, user.location].filter(Boolean).join(", ") || "Not specified";

  const userProfile = `User profile:
- Offers: ${(user.whatIOffer as OfferNeedItem[] || []).map((i) => `${i.name} (AED ${i.value})`).join(", ") || "Not specified"}
- Needs: ${(user.whatINeed as OfferNeedItem[] || []).map((i) => `${i.name} (AED ${i.value})`).join(", ") || "Not specified"}
- Location: ${userLocationLabel}
- Preferred categories: ${(user.preferredCategories || []).join(", ") || "Any"}`;

  const listingSummaries = listings.slice(0, 20).map((l) => {
    const loc = [l.city, l.country, l.location].filter(Boolean).join(", ") || "N/A";
    return `ID:${l.id} | ${l.title} | ${l.type} | AED ${l.retailValue} | ${(l.categories || []).join(",")} | ${loc} | Wants: ${(l.wantedCategories || []).join(",") || "open"}`;
  }).join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${userProfile}\n\nAvailable listings:\n${listingSummaries}` },
  ];

  try {
    const { data, tokensUsed } = await jsonCompletion<MatchResult[]>(messages, {
      agentName: "matching",
      temperature: 0.3,
      maxTokens: 512,
      // Per-agent budget breach: return an empty match list so the
      // caller still resolves cleanly (the UI will fall back to its
      // standard "no AI matches yet" empty state).
      agentBudgetJsonFallback: [],
    });

    try {
      await db.insert(agentInteractions).values({
        userId: user.id,
        agentType: "matching",
        userMessage: `Match request for ${listings.length} listings`,
        agentResponse: JSON.stringify(data),
        tokensUsed,
      });
    } catch (err) {
      console.error("Failed to log matching interaction:", err);
    }

    return Array.isArray(data) ? data.filter((m) => m.score > 0.3).slice(0, 5) : [];
  } catch (error) {
    console.error("Matching agent error:", error);
    return [];
  }
}
