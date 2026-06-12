/**
 * HandshakeLoader — brand-specific loading indicator.
 * Two stylised hands slide in from each side, clasp, and release on loop.
 * Replaces generic spinning circles across the app.
 */

interface HandshakeLoaderProps {
  /** "sm" = 36 px wide (banner), "md" = 56 px (page), "lg" = 72 px (full-screen) */
  size?: "sm" | "md" | "lg";
  /** Use white hands (for dark/teal backgrounds) */
  white?: boolean;
}

const KEYFRAMES = `
  @keyframes brt-hs-l {
    0%, 100% { transform: translateX(-10px); opacity: 0.5; }
    35%, 65% { transform: translateX(0);    opacity: 1;   }
    50%       { transform: translateX(-2px); opacity: 1;   }
  }
  @keyframes brt-hs-r {
    0%, 100% { transform: translateX(10px);  opacity: 0.5; }
    35%, 65% { transform: translateX(0);     opacity: 1;   }
    50%       { transform: translateX(2px);  opacity: 1;   }
  }
`;

const SIZES = {
  sm: { w: 36, h: 20, vw: 52, vh: 28 },
  md: { w: 56, h: 28, vw: 52, vh: 28 },
  lg: { w: 72, h: 36, vw: 52, vh: 28 },
};

export function HandshakeLoader({ size = "md", white = false }: HandshakeLoaderProps) {
  const c = white ? "#ffffff" : "#0d9488";
  const { w, h, vw, vh } = SIZES[size];

  return (
    <>
      {/* Inject keyframes once — duplicate <style> tags are harmless */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${vw} ${vh}`}
        fill="none"
        aria-label="Loading…"
        role="img"
      >
        {/* Left hand: forearm + two finger bumps pointing right */}
        <g style={{ animation: "brt-hs-l 1.8s ease-in-out infinite" }}>
          {/* Forearm */}
          <rect x="1" y="11" width="21" height="6" rx="3" fill={c} />
          {/* Top finger */}
          <rect x="18" y="3"  width="5" height="10" rx="2.5" fill={c} />
          {/* Bottom finger */}
          <rect x="18" y="15" width="5" height="10" rx="2.5" fill={c} />
        </g>

        {/* Right hand: forearm + two finger bumps pointing left (mirror) */}
        <g style={{ animation: "brt-hs-r 1.8s ease-in-out infinite" }}>
          {/* Forearm */}
          <rect x="30" y="11" width="21" height="6" rx="3" fill={c} />
          {/* Top finger */}
          <rect x="29" y="3"  width="5" height="10" rx="2.5" fill={c} />
          {/* Bottom finger */}
          <rect x="29" y="15" width="5" height="10" rx="2.5" fill={c} />
        </g>
      </svg>
    </>
  );
}

/** Full-screen centred loader — drop-in replacement for page-level spinners */
export function FullPageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3">
      <HandshakeLoader size="lg" />
    </div>
  );
}
