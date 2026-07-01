/**
 * Contact-circumvention pattern detection for in-app messages.
 *
 * Detects phone numbers, email addresses, social @handles, and platform
 * keywords/URLs. When a pattern fires BEFORE a deal is accepted, the
 * message is still delivered but a warning is surfaced to both parties
 * and the event is logged to message_flags for admin review.
 *
 * The gate runs at the moment a message is sent. It does NOT retroactively
 * flag messages, and it does NOT block delivery or auto-suspend anyone.
 */

export type ContactFlagType = "phone" | "email" | "social_handle" | "platform_url";

export interface ContactDetectionResult {
  detected: boolean;
  flagType: ContactFlagType | null;
}

// Phone numbers: international format (+971 50 123 4567), local UAE, or
// any digit run that could plausibly be a phone (7+ consecutive digits
// after normalising spaces/dashes/dots).
// Anchored with word boundaries to avoid false positives on order numbers.
const PHONE_RE =
  /(?<!\d)(\+\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}(?!\d)/;

// Email addresses.
const EMAIL_RE = /[a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]{2,}\.[a-zA-Z]{2,}/;

// @handle: "@" followed by 3–30 word chars. Require a non-word boundary
// before so we don't fire on "email@domain" (the EMAIL_RE catches that).
// We run EMAIL_RE first, so only bare @handles reach this check.
const HANDLE_RE = /(?<![a-zA-Z0-9._%+\-])@[a-zA-Z0-9._]{3,30}/;

// Platform keywords and domain fragments. Covers the most common channels
// used to bypass in-app chat. Not exhaustive — meant to catch obvious
// explicit circumvention, not every possible URL.
const PLATFORM_RE =
  /\b(wa\.me|t\.me|telegram\.me|instagram\.com|insta\.com|tiktok\.com|snapchat\.com|snap\.com|twitter\.com|x\.com|facebook\.com|fb\.com|linkedin\.com|youtube\.com|discord\.gg|discord\.com|signal\.org|viber\.com|wechat\.com|weixin\.qq\.com|line\.me|kakaolink|zalo\.me)\b/i;

/**
 * Scan a message string for contact-circumvention patterns.
 * Returns the first match found (checks in order of specificity).
 */
export function detectContactCircumvention(content: string): ContactDetectionResult {
  // Email before handle so "user@domain.com" doesn't double-fire.
  if (EMAIL_RE.test(content)) {
    return { detected: true, flagType: "email" };
  }
  if (PHONE_RE.test(content)) {
    return { detected: true, flagType: "phone" };
  }
  if (PLATFORM_RE.test(content)) {
    return { detected: true, flagType: "platform_url" };
  }
  if (HANDLE_RE.test(content)) {
    return { detected: true, flagType: "social_handle" };
  }
  return { detected: false, flagType: null };
}

/**
 * The user-facing warning shown in chat when a pattern fires before a
 * deal is accepted. Both parties see this inline with the message.
 */
export const CONTACT_CIRCUMVENTION_WARNING =
  "Sharing contact info before a deal is confirmed may violate Bareter's terms and removes your e-contract protection.";
