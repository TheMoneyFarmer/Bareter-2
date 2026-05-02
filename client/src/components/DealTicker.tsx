const TICKER_ITEMS: { emoji: string; from: string; to: string; value: string }[] = [
  { emoji: "🚗", from: "Nissan Patrol",       to: "6 months office space",      value: "AED 95,000" },
  { emoji: "💻", from: "MacBook Pro",         to: "Brand identity design",      value: "AED 9,000"  },
  { emoji: "🍽", from: "Restaurant experience", to: "Food photography",         value: "AED 7,000"  },
  { emoji: "🏢", from: "Co-working space",    to: "Marketing consultancy",      value: "AED 36,000" },
  { emoji: "⛵", from: "Yacht day charter",   to: "Villa stay Palm Jumeirah",   value: "AED 70,000" },
  { emoji: "📱", from: "iPhone 15 Pro",       to: "3 months personal training", value: "AED 5,500"  },
  { emoji: "🏋", from: "Gym membership",      to: "Graphic design package",     value: "AED 4,200"  },
  { emoji: "🚙", from: "Toyota Land Cruiser", to: "Legal services package",     value: "AED 52,000" },
];

export function DealTicker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <div
      className="bareter-ticker"
      role="region"
      aria-label="Recent barter deals"
      data-testid="ticker-deals"
    >
      <div className="bareter-ticker-track">
        {items.map((it, i) => (
          <span
            key={`${it.from}-${i}`}
            className="bareter-ticker-item"
            aria-hidden={i >= TICKER_ITEMS.length}
          >
            <span aria-hidden>{it.emoji}</span>
            <span>{it.from}</span>
            <span aria-hidden>→</span>
            <span>{it.to}</span>
            <span className="ticker-value">· {it.value}</span>
            <span className="bareter-ticker-sep" aria-hidden>·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default DealTicker;
