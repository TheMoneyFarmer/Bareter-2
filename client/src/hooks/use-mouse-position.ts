import { useEffect, useState } from "react";

export function useMousePosition(enabled = true) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    if (window.matchMedia("(hover: none)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let pending: { x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (pending) {
        setPosition(pending);
        pending = null;
      }
    };

    const handler = (e: MouseEvent) => {
      pending = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
      if (!frame) frame = window.requestAnimationFrame(flush);
    };

    window.addEventListener("mousemove", handler, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handler);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return position;
}
