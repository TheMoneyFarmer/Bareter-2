import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ||
  "https://us.i.posthog.com";

let initialized = false;

export function initPostHog(): void {
  if (initialized || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: false,
    persistence: "localStorage",
  });
  initialized = true;
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function identifyUser(userId: string): Promise<void> {
  if (!POSTHOG_KEY || !initialized) return;
  try {
    const hashed = await sha256Hex(userId);
    posthog.identify(hashed);
  } catch {
    // If hashing fails, do not send any identifier
  }
}

export function resetIdentity(): void {
  if (!POSTHOG_KEY || !initialized) return;
  posthog.reset();
}

export function capturePageview(path: string): void {
  if (!POSTHOG_KEY || !initialized) return;
  posthog.capture("$pageview", {
    $current_url: window.location.origin + path,
  });
}

export type TrackableEvent =
  | "register"
  | "login"
  | "listing_created"
  | "listing_viewed"
  | "barter_proposed"
  | "deal_completed"
  | "waitlist_signup";

export interface EventProperties {
  listing_id?: string;
  listing_category?: string;
  listing_value?: number;
  deal_id?: string;
  account_type?: string;
  country?: string;
}

export function trackEvent(
  event: TrackableEvent,
  props?: EventProperties
): void {
  if (!POSTHOG_KEY || !initialized) return;
  posthog.capture(event, props ?? {});
}
