import { useEffect, useState } from "react";
import { useMousePosition } from "@/hooks/use-mouse-position";

type Layer = "back" | "front";

interface FloatCard {
  emoji: string;
  title: string;
  meta: string;
  layer: Layer;
  position: React.CSSProperties;
  animClass: string;
}

// Positions are tuned for lg+ (>=1024px) screens only — floats are hidden
// below that breakpoint via CSS. They sit in the four corners and the two
// far edges so they never overlap the headline, search, or category pills.
const FLOAT_CARDS: FloatCard[] = [
  {
    emoji: "🚗",
    title: "Land Cruiser 2021",
    meta: "AED 145,000 · Dubai",
    layer: "back",
    position: { top: "6%", left: "1.5%" },
    animClass: "float-1",
  },
  {
    emoji: "💼",
    title: "Brand Design",
    meta: "AED 8,000 · Abu Dhabi",
    layer: "back",
    position: { top: "8%", right: "1.5%" },
    animClass: "float-2",
  },
  {
    emoji: "🍽",
    title: "Private Dining for 8",
    meta: "AED 3,500 · Dubai",
    layer: "front",
    position: { bottom: "6%", left: "2%" },
    animClass: "float-3",
  },
  {
    emoji: "🏢",
    title: "Office Space",
    meta: "AED 18,000 · DIFC",
    layer: "back",
    position: { bottom: "8%", right: "2%" },
    animClass: "float-4",
  },
];

export function HeroFloatingCards() {
  const [paused, setPaused] = useState(false);
  const mouse = useMousePosition();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div
      className={`bareter-floats ${paused ? "is-paused" : ""}`}
      aria-hidden="true"
      data-testid="hero-floating-cards"
    >
      {FLOAT_CARDS.map((card, i) => {
        const depthX = card.layer === "back" ? 8 : 18;
        const depthY = card.layer === "back" ? 6 : 14;
        const parallax = `translate(${(mouse.x * depthX).toFixed(2)}px, ${(mouse.y * depthY).toFixed(2)}px)`;
        return (
          <div
            key={i}
            className="bareter-float"
            style={{ ...card.position, transform: parallax }}
          >
            <div className={`bareter-float-inner ${card.animClass}`}>
              <span className="float-emoji">{card.emoji}</span>
              <span className="float-title">{card.title}</span>
              <span className="float-meta">{card.meta}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default HeroFloatingCards;
