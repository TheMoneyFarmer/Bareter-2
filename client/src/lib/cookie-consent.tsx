import { useCallback, useEffect, useState } from "react";

// Bumped whenever the public Cookie Policy / cookie practices change
// meaningfully. Must stay in sync with `COOKIE_POLICY_VERSION` in
// shared/schema.ts. A user whose stored prefs carry an older version is
// treated as having no decision yet and is re-prompted with the banner.
export const COOKIE_POLICY_VERSION = 1;

export type CookiePreferences = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  ts: number;
  policyVersion: number;
};

const STORAGE_KEY = "bareter.cookieConsent";
const ANON_ID_KEY = "bareter.consentAnonId";
const OPEN_EVENT = "bareter:open-cookie-prefs";
const CHANGE_EVENT = "bareter:cookie-consent-changed";

export const DEFAULT_PREFS: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
  ts: 0,
  policyVersion: COOKIE_POLICY_VERSION,
};

// Stable per-browser id so consent decisions made by an unauthenticated
// visitor can still be tied back to a single subject in the audit log.
// Generated lazily and persisted in localStorage. NOT a tracking id —
// only ever sent to /api/consent.
function getOrCreateAnonymousId(): string | null {
  try {
    const existing = localStorage.getItem(ANON_ID_KEY);
    if (existing && existing.length >= 8) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `anon-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    localStorage.setItem(ANON_ID_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

export function readPrefs(): CookiePreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookiePreferences>;
    if (typeof parsed !== "object" || parsed === null) return null;
    const policyVersion = Number(parsed.policyVersion ?? 0);
    // Treat consent against an older policy version as no consent at all
    // so the user is re-prompted under the new policy text.
    if (policyVersion < COOKIE_POLICY_VERSION) return null;
    return {
      essential: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      ts: Number(parsed.ts ?? 0),
      policyVersion,
    };
  } catch {
    return null;
  }
}

type Decision = "accept_all" | "reject_non_essential" | "custom";

function decisionFor(prefs: { analytics: boolean; marketing: boolean }): Decision {
  if (prefs.analytics && prefs.marketing) return "accept_all";
  if (!prefs.analytics && !prefs.marketing) return "reject_non_essential";
  return "custom";
}

// Best-effort POST to /api/consent so we have a server-side audit row.
// We don't block the UI on this — losing a single decision to a network
// blip is acceptable; storing the choice locally is the user-visible
// contract. The server stamps IP / user-agent / userId / timestamp.
function syncConsentToServer(prefs: { analytics: boolean; marketing: boolean }) {
  const anonymousId = getOrCreateAnonymousId();
  const payload = {
    decision: decisionFor(prefs),
    analytics: prefs.analytics,
    marketing: prefs.marketing,
    policyVersion: COOKIE_POLICY_VERSION,
    anonymousId: anonymousId ?? undefined,
  };
  try {
    void fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
      keepalive: true,
    }).catch(() => {
      /* noop — client-side prefs are still authoritative */
    });
  } catch {
    /* noop */
  }
}

export function writePrefs(prefs: { analytics: boolean; marketing: boolean }) {
  const full: CookiePreferences = {
    essential: true,
    analytics: prefs.analytics,
    marketing: prefs.marketing,
    ts: Date.now(),
    policyVersion: COOKIE_POLICY_VERSION,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: full }));
  } catch {
    /* noop */
  }
  syncConsentToServer(prefs);
  return full;
}

export function openCookiePreferences() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function useCookieConsent() {
  const [prefs, setPrefs] = useState<CookiePreferences | null>(() => readPrefs());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as CookiePreferences | undefined;
      if (detail) setPrefs(detail);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const save = useCallback((next: { analytics: boolean; marketing: boolean }) => {
    const saved = writePrefs(next);
    setPrefs(saved);
  }, []);

  return {
    prefs,
    save,
    openPreferences: openCookiePreferences,
    // Aliases to match the documented integration contract.
    preferences: prefs,
    set: save,
    reopen: openCookiePreferences,
  };
}

export const COOKIE_OPEN_EVENT = OPEN_EVENT;
