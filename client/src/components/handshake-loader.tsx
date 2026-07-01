/**
 * HandshakeLoader — two fists bump together and pull back on loop.
 * Uses emoji-safe unicode fists rendered in a full-brand loading screen.
 */

const KEYFRAMES = `
  @keyframes brt-fist-l {
    0%, 100% { transform: translateX(-48px); opacity: 0; }
    25%       { transform: translateX(-48px); opacity: 0; }
    55%, 70%  { transform: translateX(0);    opacity: 1; }
    85%       { transform: translateX(-8px);  opacity: 1; }
  }
  @keyframes brt-fist-r {
    0%, 100% { transform: translateX(48px);  opacity: 0; }
    25%       { transform: translateX(48px);  opacity: 0; }
    55%, 70%  { transform: translateX(0);     opacity: 1; }
    85%       { transform: translateX(8px);   opacity: 1; }
  }
  @keyframes brt-impact {
    0%, 50%    { transform: scale(0); opacity: 0; }
    60%        { transform: scale(1.4); opacity: 1; }
    70%        { transform: scale(1);   opacity: 0.6; }
    80%, 100%  { transform: scale(0);   opacity: 0; }
  }
  @keyframes brt-pulse {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50%      { opacity: 1;   transform: scale(1.05); }
  }
`;

interface Props {
  /** Use white fists on teal background (native splash). Default is teal on white. */
  inverted?: boolean;
  size?: "sm" | "md" | "lg";
}

export function HandshakeLoader({ inverted = false, size = "md" }: Props) {
  const fontSize = size === "sm" ? 24 : size === "lg" ? 52 : 38;
  const gap = size === "sm" ? 8 : size === "lg" ? 20 : 14;
  const impactSize = size === "sm" ? 12 : size === "lg" ? 24 : 18;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          gap: `${gap}px`,
          height: `${fontSize + 16}px`,
        }}
        aria-label="Loading…"
        role="img"
      >
        {/* Left fist — 🤜 right-pointing, slides in from left */}
        <span
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: 1,
            display: "block",
            animation: "brt-fist-l 2s ease-in-out infinite",
            filter: inverted ? "brightness(0) invert(1)" : "none",
          }}
        >
          🤜
        </span>

        {/* Impact flash at center */}
        <span
          style={{
            position: "absolute",
            fontSize: `${impactSize}px`,
            lineHeight: 1,
            animation: "brt-impact 2s ease-in-out infinite",
            pointerEvents: "none",
          }}
        >
          ✨
        </span>

        {/* Right fist — 🤛 left-pointing, slides in from right */}
        <span
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: 1,
            display: "block",
            animation: "brt-fist-r 2s ease-in-out infinite",
            filter: inverted ? "brightness(0) invert(1)" : "none",
          }}
        >
          🤛
        </span>
      </div>
    </>
  );
}

/** Full-screen centred loader — drop-in replacement for page-level spinners */
export function FullPageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-background">
      <HandshakeLoader size="lg" />
    </div>
  );
}
