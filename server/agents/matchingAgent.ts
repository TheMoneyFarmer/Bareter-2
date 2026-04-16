import { jsonCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { agentInteractions } from "@shared/schema";
import type { User, Listing, Post } from "@shared/schema";

export interface MatchResult {
  listingId: string;
  score: number;
  reason: string;
}

const SYSTEM_PROMPT = `You are a smart matching agent for BarterGram, a UAE barter marketplace.
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
  user: Pick<User, "id" | "whatIOffer" | "whatINeed" | "location" | "preferredCategories">,
  listings: Pick<Listing, "id" | "title" | "description" | "categories" | "retailValue" | "location" | "type" | "wantedCategories">[]
): Promise<MatchResult[]> {
  if (listings.length === 0) return [];

  const userProfile = `User profile:
- Offers: ${(user.whatIOffer || []).map((i: any) => `${i.name} (AED ${i.value})`).join(", ") || "Not specified"}
- Needs: ${(user.whatINeed || []).map((i: any) => `${i.name} (AED ${i.value})`).join(", ") || "Not specified"}
- Location: ${user.location || "Not specified"}
- Preferred categories: ${(user.preferredCategories || []).join(", ") || "Any"}`;

  const listingSummaries = listings.slice(0, 20).map((l) =>
    `ID:${l.id} | ${l.title} | ${l.type} | AED ${l.retailValue} | ${(l.categories || []).join(",")} | ${l.location || "N/A"} | Wants: ${(l.wantedCategories || []).join(",") || "open"}`
  ).join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${userProfile}\n\nAvailable listings:\n${listingSummaries}` },
  ];

  try {
    const { data, tokensUsed } = await jsonCompletion<MatchResult[]>(messages, {
      temperature: 0.3,
      maxTokens: 512,
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
