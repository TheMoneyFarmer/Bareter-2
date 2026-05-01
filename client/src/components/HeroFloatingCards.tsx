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

const FLOAT_CARDS: FloatCard[] = [
  {
    emoji: "🚗",
    title: "Land Cruiser 2021",
    meta: "AED 145,000 · Dubai",
    layer: "back",
    position: { top: "8%", left: "4%" },
    animClass: "float-1",
  },
  {
    emoji: "💼",
    title: "Brand Design",
    meta: "AED 8,000 · Abu Dhabi",
    layer: "back",
    position: { top: "12%", right: "6%" },
    animClass: "float-2",
  },
  {
    emoji: "🍽",
    title: "Private Dining for 8",
    meta: "AED 3,500 · Dubai",
    layer: "front",
    position: { top: "55%", left: "2%" },
    animClass: "float-3",
  },
  {
    emoji: "🏢",
    title: "Office Space",
    meta: "AED 18,000 · DIFC",
    layer: "back",
    position: { bottom: "10%", right: "10%" },
    animClass: "float-4",
  },
  {
    emoji: "📱",
    title: "MacBook Pro M3",
    meta: "AED 9,200 · Sharjah",
    layer: "back",
    position: { top: "48%", right: "-3%" },
    animClass: "float-5",
  },
  {
    emoji: "⛵",
    title: "Yacht Charter",
    meta: "AED 35,000 · Dubai Marina",
    layer: "front",
    position: { bottom: "8%", left: "8%" },
    animClass: "float-6",
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
