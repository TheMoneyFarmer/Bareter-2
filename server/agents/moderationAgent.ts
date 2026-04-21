import { jsonCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { moderationLogs, listings, posts, notifications } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";

export interface ModerationResult {
  action: "approved" | "flagged" | "rejected";
  reason: string;
  confidence: number;
  categories: string[];
}

const SYSTEM_PROMPT = `You are a content moderation agent for Bareter, a UAE barter marketplace.
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
    const { data } = await jsonCompletion<ModerationResult>(messages, {
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
  content: { title?: string; description?: string; text?: string; value?: number; categories?: string[] },
  userId?: string
): Promise<ModerationResult> {
  const result = await moderateContent(contentType, content);

  try {
    await db.insert(moderationLogs).values({
      targetType: contentType,
      targetId,
      action: result.action,
      reason: result.reason,
      confidence: result.confidence.toString(),
      rawResponse: JSON.parse(JSON.stringify(result)),
    });
  } catch (err) {
    console.error("Failed to log moderation result:", err);
  }

  if (contentType === "listing") {
    try {
      await db.update(listings).set({ moderationStatus: result.action }).where(eq(listings.id, targetId));
      if (result.action === "flagged" || result.action === "rejected") {
        await db.update(listings).set({ isActive: false }).where(eq(listings.id, targetId));
        if (userId) {
          await storage.createNotification({
            userId,
            type: "system",
            title: result.action === "rejected" ? "Listing Rejected" : "Listing Under Review",
            message: result.action === "rejected"
              ? `Your listing has been rejected: ${result.reason}`
              : `Your listing has been flagged for review: ${result.reason}`,
          });
        }
      } else if (result.action === "approved") {
        await db.update(listings).set({ isActive: true }).where(eq(listings.id, targetId));
      }
    } catch (err) {
      console.error("Failed to update listing moderation status:", err);
    }
  }

  if (contentType === "post") {
    try {
      await db.update(posts).set({ moderationStatus: result.action }).where(eq(posts.id, targetId));
      if (result.action === "flagged" || result.action === "rejected") {
        await db.update(posts).set({ isActive: false }).where(eq(posts.id, targetId));
        if (userId) {
          await storage.createNotification({
            userId,
            type: "system",
            title: result.action === "rejected" ? "Post Rejected" : "Post Under Review",
            message: result.action === "rejected"
              ? `Your post has been rejected: ${result.reason}`
              : `Your post has been flagged for review: ${result.reason}`,
          });
        }
      } else if (result.action === "approved") {
        await db.update(posts).set({ isActive: true }).where(eq(posts.id, targetId));
      }
    } catch (err) {
      console.error("Failed to update post moderation status:", err);
    }
  }

  return result;
}
