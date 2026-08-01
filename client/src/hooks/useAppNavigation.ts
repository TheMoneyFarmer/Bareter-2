import { useCallback } from "react";
import { useLocation } from "wouter";

// Module-level stack persists across hook instances and re-renders.
const navStack: string[] = [];

export function useAppNavigation() {
  const [location, navigate] = useLocation();

  const push = useCallback(
    (path: string) => {
      navStack.push(location);
      navigate(path);
    },
    [location, navigate],
  );

  const back = useCallback(
    (fallback = "/browse") => {
      const prev = navStack.pop();
      navigate(prev ?? fallback);
    },
    [navigate],
  );

  // Call this on every bottom-tab press so the stack doesn't stale-accumulate.
  const resetStack = useCallback(() => {
    navStack.length = 0;
  }, []);

  return { push, back, resetStack, currentPath: location };
}
