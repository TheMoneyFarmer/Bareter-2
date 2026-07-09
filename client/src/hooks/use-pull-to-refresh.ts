import { useState, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";

const PULL_THRESHOLD = 80; // px pulled before refresh fires

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  const isRefreshingRef = useRef(false);
  const startYRef = useRef<number | null>(null);

  // Keep ref in sync without re-running the effect
  useEffect(() => { onRefreshRef.current = onRefresh; });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const onTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;
      const scrollTop = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
      if (scrollTop > 5) return; // only detect when at top
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchEnd = async (e: TouchEvent) => {
      if (startYRef.current === null || isRefreshingRef.current) return;
      const delta = e.changedTouches[0].clientY - startYRef.current;
      startYRef.current = null;
      if (delta < PULL_THRESHOLD) return;

      isRefreshingRef.current = true;
      setIsRefreshing(true);
      try {
        await onRefreshRef.current();
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
      }
    };

    const onTouchCancel = () => { startYRef.current = null; };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  return { isRefreshing };
}
