import { chatCompletion, jsonCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { agentInteractions } from "@shared/schema";

export interface AdminInsight {
  summary: string;
  alerts: { level: "info" | "warning" | "critical"; message: string }[];
  recommendations: string[];
}

const SYSTEM_PROMPT = `You are an admin intelligence assistant for Bareter, a UAE barter marketplace.
Help admins understand platform health, identify issues, and make data-driven decisions.

You can analyze:
- User growth and activity patterns
- Deal completion rates and bottlenecks
- Content moderation trends
- Revenue and fee collection
- Safety and compliance metrics

Provide actionable insights. Flag critical issues prominently.
Keep responses data-focused and concise.`;

export async function getAdminInsights(
  stats: {
    totalUsers: number;
    activeUsers: number;
    totalListings: number;
    totalDeals: number;
    completedDeals: number;
    pendingReports: number;
    flaggedListings: number;
    recentSignups: number;
  },
  adminUserId?: string
): Promise<AdminInsight> {
  const statsStr = `Platform stats:
- Total users: ${stats.totalUsers} (${stats.recentSignups} new this week)
- Active users: ${stats.activeUsers}
- Total listings: ${stats.totalListings} (${stats.flaggedListings} flagged)
- Total deals: ${stats.totalDeals} (${stats.completedDeals} completed)
- Completion rate: ${stats.totalDeals > 0 ? ((stats.completedDeals / stats.totalDeals) * 100).toFixed(1) : 0}%
- Pending reports: ${stats.pendingReports}`;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Analyze these platform metrics and provide insights:\n${statsStr}` },
  ];

  try {
    const { data, tokensUsed } = await jsonCompletion<AdminInsight>(messages, {
      temperature: 0.3,
      maxTokens: 512,
    });

    if (adminUserId) {
      try {
        await db.insert(agentInteractions).values({
          userId: adminUserId,
          agentType: "admin",
          userMessage: "Admin insights request",
          agentResponse: JSON.stringify(data),
          tokensUsed,
        });
      } catch (err) {
        console.error("Failed to log admin interaction:", err);
      }
    }

    return {
      summary: data.summary || "Unable to generate summary",
      alerts: data.alerts || [],
      recommendations: data.recommendations || [],
    };
  } catch (error) {
    console.error("Admin agent error:", error);
    return {
      summary: "Admin intelligence service temporarily unavailable",
      alerts: [],
      recommendations: [],
    };
  }
}

export async function askAdminAgent(
  question: string,
  context: string,
  adminUserId?: string
): Promise<{ response: string; tokensUsed: number }> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
  ];

  try {
    const { content, tokensUsed } = await chatCompletion(messages, {
      temperature: 0.4,
      maxTokens: 512,
    });

    if (adminUserId) {
      try {
        await db.insert(agentInteractions).values({
          userId: adminUserId,
          agentType: "admin",
          userMessage: question,
          agentResponse: content,
          tokensUsed,
        });
      } catch (err) {
        console.error("Failed to log admin interaction:", err);
      }
    }

    return { response: content, tokensUsed };
  } catch (error) {
    console.error("Admin agent error:", error);
    return { response: "Unable to process request right now.", tokensUsed: 0 };
  }
}
