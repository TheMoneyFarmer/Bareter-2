import { jsonCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { moderationLogs } from "@shared/schema";

export interface ModerationResult {
  action: "approved" | "flagged" | "rejected";
  reason: string;
  confidence: number;
  categories: string[];
}

const SYSTEM_PROMPT = `You are a content moderation agent for BarterGram, a UAE barter marketplace.
Evaluate content for:
- Prohibited items (weapons, drugs, counterfeit goods, sanctioned items)
- Scam indicators (unrealistic values, urgency pressure, request for off-platform contact)
- Inappropriate language or harassment
- Misleading descriptions or fake listings
- UAE/GCC regulatory compliance issues

Respond with JSON:
{
  "action": "approved" | "flagged" | "rejected",
  "reason": "brief explanation",
  "confidence": 0.0-1.0,
  "categories": ["category1"]
}

"approved" = content is safe. "flagged" = needs human review. "rejected" = clearly violates policies.
Be conservative - when in doubt, flag for review rather than reject.`;

export async function moderateContent(
  contentType: "listing" | "post" | "message",
  content: { title?: string; description?: string; text?: string; value?: number; categories?: string[] }
): Promise<ModerationResult> {
  const contentStr = [
    content.title ? `Title: ${content.title}` : "",
    content.description ? `Description: ${content.description}` : "",
    content.text ? `Text: ${content.text}` : "",
    content.value ? `Declared value: AED ${content.value}` : "",
    content.categories?.length ? `Categories: ${content.categories.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Moderate this ${contentType}:\n${contentStr}` },
  ];

  try {
    const { data, tokensUsed } = await jsonCompletion<ModerationResult>(messages, {
      temperature: 0.1,
      maxTokens: 256,
    });

    return {
      action: data.action || "flagged",
      reason: data.reason || "Unable to determine",
      confidence: Math.min(1, Math.max(0, data.confidence || 0.5)),
      categories: data.categories || [],
    };
  } catch (error) {
    console.error("Moderation agent error:", error);
    return {
      action: "flagged",
      reason: "Moderation service unavailable - flagged for manual review",
      confidence: 0,
      categories: ["error"],
    };
  }
}

export async function moderateAndLog(
  contentType: "listing" | "post" | "message",
  targetId: string,
  content: { title?: string; description?: string; text?: string; value?: number; categories?: string[] }
): Promise<ModerationResult> {
  const result = await moderateContent(contentType, content);

  try {
    await db.insert(moderationLogs).values({
      targetType: contentType,
      targetId,
      action: result.action,
      reason: result.reason,
      confidence: result.confidence.toString(),
      rawResponse: result as any,
    });
  } catch (err) {
    console.error("Failed to log moderation result:", err);
  }

  return result;
}
