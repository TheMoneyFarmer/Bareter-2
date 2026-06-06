import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { ActionGuardDialog } from "@/components/action-guard-dialog";

export type BlockReason = "login" | "verify" | null;

interface ActionGuardContextType {
  /** Requires login + verified identity. Blocks both anonymous and unverified users. */
  guard: (fn?: () => void) => boolean;
  /** Requires login only. Blocks anonymous users but allows unverified logged-in users. */
  guardAuth: (fn?: () => void) => boolean;
  blockReason: BlockReason;
  setBlockReason: (r: BlockReason) => void;
}

const ActionGuardContext = createContext<ActionGuardContextType | null>(null);

export function ActionGuardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [blockReason, setBlockReason] = useState<BlockReason>(null);

  const isVerified = !!(
    user &&
    (user.kycStatus === "APPROVED" || user.kybStatus === "APPROVED" || user.isVerified)
  );

  const guard = useCallback(
    (fn?: () => void): boolean => {
      if (!user) { setBlockReason("login"); return false; }
      if (!isVerified) { setBlockReason("verify"); return false; }
      fn?.();
      return true;
    },
    [user, isVerified]
  );

  const guardAuth = useCallback(
    (fn?: () => void): boolean => {
      if (!user) { setBlockReason("login"); return false; }
      fn?.();
      return true;
    },
    [user]
  );

  return (
    <ActionGuardContext.Provider value={{ guard, guardAuth, blockReason, setBlockReason }}>
      {children}
      <ActionGuardDialog blockReason={blockReason} onClose={() => setBlockReason(null)} />
    </ActionGuardContext.Provider>
  );
}

const FALLBACK: ActionGuardContextType = {
  guard: (fn) => { fn?.(); return true; },
  guardAuth: (fn) => { fn?.(); return true; },
  blockReason: null,
  setBlockReason: () => {},
};

export function useActionGuard() {
  return useContext(ActionGuardContext) ?? FALLBACK;
}
