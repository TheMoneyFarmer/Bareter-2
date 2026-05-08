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

function hashId(id: string): string {
  try {
    return btoa(id).replace(/=/g, "").slice(0, 16);
  } catch {
    return id.slice(0, 8);
  }
}

export function identifyUser(userId: string): void {
  if (!POSTHOG_KEY || !initialized) return;
  posthog.identify(hashId(userId));
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
