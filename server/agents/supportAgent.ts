import { chatCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { agentInteractions } from "@shared/schema";

const SAFE_FALLBACK_REPLY =
  "Sorry, I can't answer that right now. Please email support@bareter.com and a human will help you out.";

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

const SYSTEM_PROMPT_FINGERPRINTS: string[] = [
  "You are BarterBot",
  "Important facts:",
  "Do NOT make up features",
];

function looksLikeQuotedInstructionDump(text: string): boolean {
  const longQuoted = /([`"'])([\s\S]{400,}?)\1/.test(text)
    || /```[\s\S]{400,}?```/.test(text);
  return longQuoted;
}

function getActionIntent(reply: string): null | { ok: true; intent: unknown } | { ok: false } {
  const trimmed = reply.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && "action" in parsed) {
      return { ok: true, intent: parsed };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export function sanitizeSupportReply(raw: string): string {
  if (!raw || typeof raw !== "string") return SAFE_FALLBACK_REPLY;
  const reply = raw.trim();
  if (!reply) return SAFE_FALLBACK_REPLY;

  for (const re of SECRET_PATTERNS) {
    if (re.test(reply)) return SAFE_FALLBACK_REPLY;
  }
  for (const fp of SYSTEM_PROMPT_FINGERPRINTS) {
    if (reply.includes(fp)) return SAFE_FALLBACK_REPLY;
  }
  if (looksLikeQuotedInstructionDump(reply)) return SAFE_FALLBACK_REPLY;

  const intent = getActionIntent(reply);
  if (intent && intent.ok === false) return SAFE_FALLBACK_REPLY;

  if (reply.length > 4000) return reply.slice(0, 4000);
  return reply;
}

export interface SupportUserContext {
  recentDeals?: Array<{ id: string; status: string; createdAt: string }>;
  activeListings?: Array<{ id: string; title: string; category: string }>;
  faqContent?: string;
  helpContent?: string;
  notionKbContent?: string;
}

const BASE_SYSTEM_PROMPT = `You are BarterBot, the friendly customer support assistant for Bareter — a UAE barter marketplace for businesses.

You help users with:
- How to create listings and propose trades
- Understanding the deal flow (propose → accept → in_progress → delivery_proof → completed)
- Verification requirements (KYC for individuals, KYB/trade license for businesses)
- Safety tips for safe trading
- How the credibility score works
- Platform policies and terms of service
- How to report scams or issues

Important facts:
- Bareter is free to use — there are no fees for listing, trading, or completing deals
- Business accounts need an approved trade license (KYB) to create listings
- All users must verify identity before trading
- Trades over AED 5,000 require extra caution
- Users should never take communication off-platform

Keep responses concise (2-3 sentences max), friendly, and helpful. If you don't know something, say so and suggest contacting support@bareter.com.
Do NOT make up features that don't exist. Answer in the same language the user writes in (English or Arabic).`;

function buildSystemPrompt(userContext?: SupportUserContext): string {
  let prompt = BASE_SYSTEM_PROMPT;

  const contextParts: string[] = [];

  if (userContext?.activeListings?.length) {
    const listing_list = userContext.activeListings.map(l => `  - "${l.title}" (${l.category})`).join("\n");
    contextParts.push(`User's active listings:\n${listing_list}`);
  }

  if (userContext?.recentDeals?.length) {
    const deal_list = userContext.recentDeals.map(d => `  - Deal ${d.id.slice(0, 8)} (${d.status})`).join("\n");
    contextParts.push(`User's recent deals:\n${deal_list}`);
  }

  if (userContext?.faqContent) {
    try {
      const faqItems = JSON.parse(userContext.faqContent);
      if (Array.isArray(faqItems) && faqItems.length) {
        const faqText = faqItems.slice(0, 8).map((f: { q: string; a: string }) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
        contextParts.push(`Platform FAQ for reference:\n${faqText}`);
      }
    } catch {
      if (typeof userContext.faqContent === "string" && userContext.faqContent.length < 3000) {
        contextParts.push(`Platform FAQ content:\n${userContext.faqContent}`);
      }
    }
  }

  if (userContext?.helpContent) {
    try {
      const helpItems = JSON.parse(userContext.helpContent);
      if (Array.isArray(helpItems) && helpItems.length) {
        const helpText = helpItems
          .slice(0, 10)
          .map((h: { title?: string; content?: string; question?: string; answer?: string }) => {
            const heading = h.title ?? h.question ?? "";
            const body = h.content ?? h.answer ?? "";
            return heading ? `${heading}: ${body}` : body;
          })
          .filter(Boolean)
          .join("\n");
        if (helpText) contextParts.push(`Help centre articles:\n${helpText}`);
      }
    } catch {
      if (typeof userContext.helpContent === "string" && userContext.helpContent.length < 3000) {
        contextParts.push(`Help centre content:\n${userContext.helpContent}`);
      }
    }
  }

  if (userContext?.notionKbContent) {
    contextParts.push(`Notion knowledge base articles:\n${userContext.notionKbContent}`);
  }

  if (contextParts.length) {
    prompt += `\n\nContext for this conversation:\n${contextParts.join("\n\n")}`;
  }

  return prompt;
}

export async function getSupportResponse(
  userMessage: string,
  conversationHistory: ChatMessage[] = [],
  userId?: string,
  userContext?: SupportUserContext,
): Promise<{ response: string; tokensUsed: number }> {
  const systemPrompt = buildSystemPrompt(userContext);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6),
    { role: "user", content: userMessage },
  ];

  try {
    const { content, tokensUsed } = await chatCompletion(messages, {
      agentName: "support",
      temperature: 0.5,
      maxTokens: 512,
    });

    const safeContent = sanitizeSupportReply(content);

    if (userId) {
      try {
        await db.insert(agentInteractions).values({
          userId,
          agentType: "support",
          userMessage,
          agentResponse: safeContent,
          tokensUsed,
        });
      } catch (err) {
        console.error("Failed to log support interaction:", err);
      }
    }

    return { response: safeContent, tokensUsed };
  } catch (error) {
    console.error("Support agent error:", error);
    return {
      response: "I'm having trouble right now. Please try again or email support@bareter.com for help.",
      tokensUsed: 0,
    };
  }
}
