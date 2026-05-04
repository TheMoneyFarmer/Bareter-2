import { useEffect, useRef, useState } from "react";

export function useCountUp(end: number, duration = 1500, start = false) {
  const [count, setCount] = useState(end);
  const prevEnd = useRef<number | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!start) return;

    if (!initialized.current) {
      initialized.current = true;
      setCount(end);
      prevEnd.current = end;
      return;
    }

    if (end === 0) {
      setCount(0);
      prevEnd.current = 0;
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setCount(end);
      prevEnd.current = end;
      return;
    }

    const from = prevEnd.current ?? end;
    prevEnd.current = end;

    if (from === end) return;

    let raf = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(from + eased * (end - from)));
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [end, duration, start]);

  return count;
}
