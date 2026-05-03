import { useCallback, useEffect, useState } from "react";

export type CookiePreferences = {
  essential: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  ts: number;
};

const STORAGE_KEY = "bareter.cookieConsent.v1";
const OPEN_EVENT = "bareter:open-cookie-prefs";

export const DEFAULT_PREFS: CookiePreferences = {
  essential: true,
  functional: true,
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
      functional: Boolean(parsed.functional ?? true),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      ts: Number(parsed.ts ?? 0),
    };
  } catch {
    return null;
  }
}

export function writePrefs(prefs: Omit<CookiePreferences, "essential" | "ts">) {
  const full: CookiePreferences = {
    essential: true,
    functional: prefs.functional,
    analytics: prefs.analytics,
    marketing: prefs.marketing,
    ts: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    window.dispatchEvent(new CustomEvent("bareter:cookie-consent-changed", { detail: full }));
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
    window.addEventListener("bareter:cookie-consent-changed", onChange);
    return () => window.removeEventListener("bareter:cookie-consent-changed", onChange);
  }, []);

  const save = useCallback((next: Omit<CookiePreferences, "essential" | "ts">) => {
    const saved = writePrefs(next);
    setPrefs(saved);
  }, []);

  return { prefs, save, openPreferences: openCookiePreferences };
}

export const COOKIE_OPEN_EVENT = OPEN_EVENT;
