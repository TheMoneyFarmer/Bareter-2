import { chatCompletion, jsonCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { agentInteractions } from "@shared/schema";

export interface AdminInsight {
  summary: string;
  alerts: { level: "info" | "warning" | "critical"; message: string }[];
  recommendations: string[];
}

const SYSTEM_PROMPT = `You are an admin intelligence assistant for Bareter, a UAE barter marketplace.
Analyze platform metrics and respond with ONLY a JSON object matching this exact structure — no markdown, no explanation:
{
  "summary": "one sentence platform health summary",
  "alerts": [{"level": "info|warning|critical", "message": "alert text"}],
  "recommendations": ["action item 1", "action item 2"]
}
Keep the summary under 120 characters. Limit to max 3 alerts and 3 recommendations.`;

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
      agentName: "admin",
      command: "insight",
      temperature: 0.3,
      maxTokens: 1024,
      // Per-agent budget breach: degrade to an "unavailable" insight
      // rather than throwing — the caller still renders something.
      agentBudgetJsonFallback: {
        summary: "AI insights paused: monthly admin-agent budget reached.",
        alerts: [],
        recommendations: [],
      },
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

export interface DisputeResolutionSuggestion {
  analysis: string;
  suggestedOutcome: "in_favor_party_a" | "in_favor_party_b" | "mutual" | "dismissed";
  suggestedDecision: string;
  suggestedReasoning: string;
  confidence: "low" | "medium" | "high";
}

export async function getDisputeResolution(
  dispute: {
    subject: string;
    description?: string | null;
    partyAName: string;
    partyBName: string;
    evidence?: { submittedByName?: string; description: string }[];
    status: string;
  },
  adminUserId?: string
): Promise<DisputeResolutionSuggestion> {
  const evidenceLines = dispute.evidence?.length
    ? dispute.evidence.map((e, i) => `${i + 1}. ${e.submittedByName ? `[${e.submittedByName}] ` : ""}${e.description}`).join("\n")
    : "No evidence submitted by either party.";

  const userMessage = `You are an impartial arbiter on Bareter, a UAE B2B barter marketplace. Review this dispute and suggest a resolution.

Subject: ${dispute.subject}
Party A: ${dispute.partyAName}
Party B: ${dispute.partyBName}
Status: ${dispute.status}
Description: ${dispute.description || "No description provided."}

Evidence:
${evidenceLines}

Respond with JSON containing:
- analysis: 2-3 sentence neutral summary of the dispute and key facts
- suggestedOutcome: "in_favor_party_a", "in_favor_party_b", "mutual", or "dismissed"
- suggestedDecision: 1-3 sentence formal decision text an admin would write (use party names, not "Party A/B")
- suggestedReasoning: 2-4 sentence explanation of why this outcome is appropriate, referencing the evidence
- confidence: "low" (insufficient evidence), "medium" (some evidence), or "high" (clear evidence)`;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}

You are acting as a dispute resolution assistant. Your suggestions help admins draft fair, professional decisions. Always base decisions on evidence. When evidence is insufficient, suggest "mutual" or "dismissed" and note the need for more information.`,
    },
    { role: "user", content: userMessage },
  ];

  try {
    const { data, tokensUsed } = await jsonCompletion<DisputeResolutionSuggestion>(messages, {
      agentName: "admin",
      command: "dispute_resolve",
      temperature: 0.2,
      maxTokens: 600,
      agentBudgetJsonFallback: {
        analysis: "AI dispute analysis paused: monthly admin-agent budget reached.",
        suggestedOutcome: "mutual",
        suggestedDecision: "AI suggestions unavailable. Please review the evidence manually.",
        suggestedReasoning: "",
        confidence: "low",
      },
    });

    if (adminUserId) {
      db.insert(agentInteractions).values({
        userId: adminUserId,
        agentType: "admin",
        userMessage: `Dispute resolution request: ${dispute.subject}`,
        agentResponse: JSON.stringify(data),
        tokensUsed,
      }).catch((err) => console.error("Failed to log dispute resolution interaction:", err));
    }

    return {
      analysis: data.analysis || "Unable to generate analysis.",
      suggestedOutcome: (["in_favor_party_a", "in_favor_party_b", "mutual", "dismissed"].includes(data.suggestedOutcome) ? data.suggestedOutcome : "mutual") as DisputeResolutionSuggestion["suggestedOutcome"],
      suggestedDecision: data.suggestedDecision || "",
      suggestedReasoning: data.suggestedReasoning || "",
      confidence: (["low", "medium", "high"].includes(data.confidence) ? data.confidence : "low") as DisputeResolutionSuggestion["confidence"],
    };
  } catch (error) {
    console.error("Dispute resolution agent error:", error);
    return {
      analysis: "Unable to analyze dispute at this time.",
      suggestedOutcome: "mutual",
      suggestedDecision: "",
      suggestedReasoning: "",
      confidence: "low",
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
      agentName: "admin",
      command: "chat",
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
