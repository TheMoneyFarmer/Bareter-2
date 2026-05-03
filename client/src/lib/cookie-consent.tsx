import { useCallback, useEffect, useState } from "react";

export type CookiePreferences = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  ts: number;
};

const STORAGE_KEY = "bareter.cookieConsent";
const OPEN_EVENT = "bareter:open-cookie-prefs";
const CHANGE_EVENT = "bareter:cookie-consent-changed";

export const DEFAULT_PREFS: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
  ts: 0,
};

export function readPrefs(): CookiePreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookiePreferences>;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      essential: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      ts: Number(parsed.ts ?? 0),
    };
  } catch {
    return null;
  }
}

export function writePrefs(prefs: { analytics: boolean; marketing: boolean }) {
  const full: CookiePreferences = {
    essential: true,
    analytics: prefs.analytics,
    marketing: prefs.marketing,
    ts: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: full }));
  } catch {
    /* noop */
  }
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
