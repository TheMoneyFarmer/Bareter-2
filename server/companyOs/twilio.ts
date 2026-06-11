// Thin Twilio WhatsApp wrapper for the Company OS.
//
// All exported helpers fail soft if the Twilio secrets are missing —
// they log a warning and return a sensible default instead of throwing.
// This keeps the rest of the app booting cleanly even before the
// founder has provisioned the secrets in production.

import twilio from "twilio";
import type { Twilio } from "twilio";
import { withRetry } from "./retry";

// Twilio's WhatsApp freeform message hard limit is 1600 chars. Anything
// longer is rejected with "The concatenated message body exceeds the
// 1600 character limit." Keep this value at or below 1600 so truncate
// short-circuits before Twilio does.
const MAX_BODY_LEN = 1600;

let cachedClient: Twilio | null = null;
let cachedClientKey = "";

function getClient(): Twilio | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  const key = `${sid}:${token}`;
  if (cachedClient && cachedClientKey === key) return cachedClient;
  cachedClient = twilio(sid, token);
  cachedClientKey = key;
  return cachedClient;
}

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM,
  );
}

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_FROM,
  );
}

/**
 * Send an SMS via Twilio. Returns true on success, false on any failure.
 * Never throws. Use for OTP delivery — no opt-in required unlike WhatsApp sandbox.
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const client = getClient();
  if (!client) {
    console.warn("[companyOs.twilio] sendSms skipped — Twilio not configured");
    return false;
  }
  const from = process.env.TWILIO_PHONE_FROM;
  if (!from || !to) {
    console.warn("[companyOs.twilio] sendSms skipped — missing from/to");
    return false;
  }
  try {
    await withRetry(
      () => client.messages.create({ from, to, body: truncateBody(body) }),
      { agentName: "twilio", opName: "sendSms" },
    );
    return true;
  } catch (err) {
    console.error("[companyOs.twilio] sendSms failed:", err);
    return false;
  }
}

export function isFounderConfigured(): boolean {
  return Boolean(process.env.FOUNDER_WHATSAPP_NUMBER);
}

function normalizeWhatsappNumber(n: string | null | undefined): string {
  if (!n) return "";
  const trimmed = String(n).trim();
  if (!trimmed) return "";
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
}

export function isFromFounder(fromNumber: string | null | undefined): boolean {
  const founder = normalizeWhatsappNumber(process.env.FOUNDER_WHATSAPP_NUMBER);
  if (!founder) return false;
  return normalizeWhatsappNumber(fromNumber) === founder;
}

export function truncateBody(body: string): string {
  if (!body) return "";
  return body.length <= MAX_BODY_LEN ? body : body.slice(0, MAX_BODY_LEN - 1) + "…";
}

/**
 * Send a WhatsApp message via Twilio. Returns true on success, false on
 * any failure (missing config, API error, etc.). Never throws — the
 * Manager Agent and scheduler should keep running even if Twilio is down.
 */
export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  const client = getClient();
  if (!client) {
    console.warn("[companyOs.twilio] sendWhatsApp skipped — Twilio not configured");
    return false;
  }
  const from = normalizeWhatsappNumber(process.env.TWILIO_WHATSAPP_FROM);
  const dest = normalizeWhatsappNumber(to);
  if (!from || !dest) {
    console.warn("[companyOs.twilio] sendWhatsApp skipped — missing from/to");
    return false;
  }
  try {
    await withRetry(
      () => client.messages.create({ from, to: dest, body: truncateBody(body) }),
      { agentName: "twilio", opName: "sendWhatsApp" },
    );
    return true;
  } catch (err) {
    console.error("[companyOs.twilio] sendWhatsApp failed:", err);
    return false;
  }
}

/**
 * Send a WhatsApp message to the configured founder number. No-op if
 * FOUNDER_WHATSAPP_NUMBER is unset.
 */
export async function notifyFounder(body: string): Promise<boolean> {
  const founder = process.env.FOUNDER_WHATSAPP_NUMBER;
  if (!founder) {
    console.warn("[companyOs.twilio] notifyFounder skipped — FOUNDER_WHATSAPP_NUMBER unset");
    return false;
  }
  return sendWhatsApp(founder, body);
}

/**
 * Best-effort, single-attempt page to the founder. Used by the retry
 * helper to alert on critical agent failures WITHOUT going through
 * `withRetry` / `notifyFounder` (which themselves use `withRetry`
 * and would re-enter the same paging path on failure, causing
 * recursion). Returns true on a successful Twilio API call, false on
 * any failure (missing config, API error, etc.). Never throws.
 */
export async function pageFounder(body: string): Promise<boolean> {
  const founder = process.env.FOUNDER_WHATSAPP_NUMBER;
  if (!founder) return false;
  const client = getClient();
  if (!client) return false;
  const from = normalizeWhatsappNumber(process.env.TWILIO_WHATSAPP_FROM);
  const dest = normalizeWhatsappNumber(founder);
  if (!from || !dest) return false;
  try {
    await client.messages.create({ from, to: dest, body: truncateBody(body) });
    return true;
  } catch (err) {
    console.error("[companyOs.twilio] pageFounder failed:", err);
    return false;
  }
}

/**
 * Verify a Twilio webhook signature against the URL + form-body params.
 * In non-production we skip verification so the founder can hit the
 * webhook from the Replit dev URL during initial setup; in production
 * a missing/invalid signature returns false.
 */
export function validateTwilioRequest(
  signature: string | null | undefined,
  url: string,
  params: Record<string, string>,
): boolean {
  // Permissive in non-production so devs can curl-test the webhook.
  if (process.env.NODE_ENV !== "production") return true;

  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    console.warn("[companyOs.twilio] validateTwilioRequest: TWILIO_AUTH_TOKEN unset — rejecting");
    return false;
  }
  if (!signature) return false;
  try {
    return twilio.validateRequest(token, signature, url, params);
  } catch (err) {
    console.error("[companyOs.twilio] validateTwilioRequest threw:", err);
    return false;
  }
}
