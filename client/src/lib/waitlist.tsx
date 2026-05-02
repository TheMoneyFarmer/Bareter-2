import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { WaitlistDialog } from "@/components/waitlist-dialog";

type WaitlistMode = { enabled: boolean; count: number };

export interface WaitlistDefaults {
  country?: string | null;
  city?: string | null;
  reason?: "geo" | "manual" | null;
}

interface WaitlistContextType {
  mode: WaitlistMode;
  isLoading: boolean;
  isOpen: boolean;
  open: () => void;
  openWith: (defaults: WaitlistDefaults) => void;
  close: () => void;
  /** Returns true if user can proceed (either authed or waitlist disabled). Otherwise opens the dialog and returns false. */
  gate: () => boolean;
  referralCode: string | null;
  defaults: WaitlistDefaults;
}

const WaitlistContext = createContext<WaitlistContextType | null>(null);

const REF_KEY = "bareter_ref_code";

export function WaitlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<WaitlistDefaults>({ country: null, city: null, reason: null });

  const { data: mode, isLoading } = useQuery<WaitlistMode>({
    queryKey: ["/api/waitlist/mode"],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // Capture ?ref= from URL once on mount
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const ref = url.searchParams.get("ref");
      if (ref) {
        const code = ref.trim().toUpperCase().slice(0, 16);
        if (code) {
          localStorage.setItem(REF_KEY, code);
          setReferralCode(code);
        }
      } else {
        const stored = localStorage.getItem(REF_KEY);
        if (stored) setReferralCode(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const openWith = useCallback((d: WaitlistDefaults) => {
    setDefaults({ country: d.country ?? null, city: d.city ?? null, reason: d.reason ?? "manual" });
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const gate = useCallback(() => {
    if (user || !mode?.enabled) return true;
    setIsOpen(true);
    return false;
  }, [user, mode?.enabled]);

  return (
    <WaitlistContext.Provider
      value={{
        mode: mode ?? { enabled: false, count: 0 },
        isLoading,
        isOpen,
        open,
        openWith,
        close,
        gate,
        referralCode,
        defaults,
      }}
    >
      {children}
      <WaitlistDialog />
    </WaitlistContext.Provider>
  );
}

export function useWaitlist() {
  const ctx = useContext(WaitlistContext);
  if (!ctx) throw new Error("useWaitlist must be used inside WaitlistProvider");
  return ctx;
}

/** Convenience: returns a `gate` callback to wrap onClick on gated CTAs. */
export function useAuthGate() {
  const { gate } = useWaitlist();
  return gate;
}
