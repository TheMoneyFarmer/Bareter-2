import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";

const STORAGE_KEY = "active_location";

export interface ActiveLocation {
  country: string;
  city: string | null;
  worldwide: boolean;
}

function readStored(): Partial<ActiveLocation> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(loc: Partial<ActiveLocation>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } catch {}
}

/**
 * Returns the active location used to filter feed/browse/matches queries.
 * Order of precedence: explicit "worldwide" mode > user profile country/city > guest localStorage > AE default.
 */
export function useActiveLocation(): ActiveLocation & {
  setWorldwide: (on: boolean) => void;
  setLocation: (country: string, city?: string | null) => void;
} {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setTick((t) => t + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const stored = readStored() || {};
  const worldwide = stored.worldwide === true;

  const country = worldwide
    ? ""
    : (user?.country || stored.country || "AE").toUpperCase();
  const city = worldwide ? null : (user?.city || stored.city || null);

  const setWorldwide = useCallback((on: boolean) => {
    const prev = readStored() || {};
    writeStored({ ...prev, worldwide: on });
    setTick((t) => t + 1);
  }, []);

  const setLocation = useCallback((newCountry: string, newCity?: string | null) => {
    writeStored({ country: newCountry, city: newCity || null, worldwide: false });
    setTick((t) => t + 1);
  }, []);

  // Re-read on tick changes
  void tick;

  return { country, city, worldwide, setWorldwide, setLocation };
}

/**
 * Build URLSearchParams entries for filtering by active location. When worldwide
 * is active, returns the explicit `worldwide=true` flag instead of country/city.
 */
export function locationParams(loc: Pick<ActiveLocation, "country" | "city" | "worldwide">): Record<string, string> {
  if (loc.worldwide) return { worldwide: "true" };
  const out: Record<string, string> = {};
  if (loc.country) out.country = loc.country;
  if (loc.city) out.city = loc.city;
  return out;
}
