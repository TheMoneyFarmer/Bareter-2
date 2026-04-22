import { chatCompletion, type ChatMessage } from "./llm";
import { db } from "../db";
import { agentInteractions } from "@shared/schema";

const SAFE_FALLBACK_REPLY =
  "Sorry, I can't answer that right now. Please email support@bareter.com and a human will help you out.";

// Patterns that look like leaked secrets / tokens.
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/,            // OpenAI-style
  /AKIA[0-9A-Z]{16}/,                  // AWS access key id
  /AIza[0-9A-Za-z_-]{20,}/,            // Google API key
  /xox[baprs]-[A-Za-z0-9-]{10,}/,      // Slack
  /ghp_[A-Za-z0-9]{20,}/,              // GitHub PAT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT-shaped
];

// Distinctive phrases from the system prompt below. If the model echoes them
// verbatim, it's likely been jail-broken into leaking instructions.
const SYSTEM_PROMPT_FINGERPRINTS: string[] = [
  "You are BarterBot",
  "Important facts:",
  "Do NOT make up features",
];

function looksLikeQuotedInstructionDump(text: string): boolean {
  // Long quoted block (>= 400 chars between matching quotes/backticks/triple-backticks)
  // — a common shape when models echo back the prompt.
  const longQuoted = /([`"'])([\s\S]{400,}?)\1/.test(text)
    || /```[\s\S]{400,}?```/.test(text);
  return longQuoted;
}

function getActionIntent(reply: string): null | { ok: true; intent: unknown } | { ok: false } {
  // If the reply is meant to be a structured action, it must parse as JSON
  // and contain an "action" key. Plain prose replies pass through.
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

  // If it looks like an action intent attempt but isn't valid JSON, refuse.
  const intent = getActionIntent(reply);
  if (intent && intent.ok === false) return SAFE_FALLBACK_REPLY;

  // Hard cap on length to avoid runaway responses.
  if (reply.length > 4000) return reply.slice(0, 4000);
  return reply;
}

const SYSTEM_PROMPT = `You are BarterBot, the friendly customer support assistant for Bareter — a UAE barter marketplace for businesses.

You help users with:
- How to create listings and propose trades
- Understanding the deal flow (propose → accept → in_progress → delivery_proof → completed)
- Verification requirements (KYC for individuals, KYB/trade license for businesses)
- Safety tips for safe trading
- How the credibility score works
- Platform policies and terms of service
- How to report scams or issues

Important facts:
- Bareter charges a small success fee on completed deals
- Business accounts need an approved trade license (KYB) to create listings
- All users must verify identity before trading
- Trades over AED 5,000 require extra caution
- Users should never take communication off-platform

Keep responses concise (2-3 sentences max), friendly, and helpful. If you don't know something, say so and suggest contacting support@bareter.com.
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
