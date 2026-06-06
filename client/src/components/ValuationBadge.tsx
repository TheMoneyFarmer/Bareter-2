import { Sparkles, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Small chip that surfaces the AI's persisted valuation for a listing.
 * Renders nothing if the listing has no stored valuation. Designed to sit
 * next to the user-declared price on listing cards and detail pages.
 */
interface ValuationBadgeProps {
  /** Listing fields persisted by POST /api/listings after AI valuation. */
  minAed?: number | string | null;
  maxAed?: number | string | null;
  fairAed?: number | string | null;
  confidence?: number | string | null; // 0.0–1.0
  reasoning?: string | null;
  marketNote?: string | null;
  size?: "sm" | "md";
}

function formatAed(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return n.toLocaleString();
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function ValuationBadge({
  minAed,
  maxAed,
  fairAed,
  confidence,
  reasoning,
  marketNote,
  size = "sm",
}: ValuationBadgeProps) {
  const min = num(minAed);
  const max = num(maxAed);
  if (min === null || max === null) return null;

  const fair = num(fairAed);
  const conf = num(confidence); // 0–1
  const confLabel =
    conf === null
      ? null
      : conf >= 0.75
        ? "High confidence"
        : conf >= 0.5
          ? "Medium confidence"
          : "Estimated";
  const palette =
    conf === null || conf >= 0.75
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
      : conf >= 0.5
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800"
        : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300 dark:border-zinc-700";

  const sizeClasses =
    size === "md"
      ? "text-xs px-2.5 py-1 gap-1.5"
      : "text-[11px] px-2 py-0.5 gap-1";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center rounded-full border font-medium cursor-help ${palette} ${sizeClasses}`}
            data-testid="badge-valuation"
          >
            <Sparkles className="h-3 w-3 opacity-70" />
            <span className="font-semibold tracking-wide opacity-70">AED</span>
            <span>
              {formatAed(min)}–{formatAed(max)}
            </span>
            <Info className="h-3 w-3 opacity-50" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs space-y-1">
          <p className="text-sm font-semibold">Bareter Estimated Value</p>
          <p className="text-xs text-muted-foreground">
            AED {min.toLocaleString()} – AED {max.toLocaleString()}
            {fair !== null && (
              <>
                {" "}
                <span className="opacity-70">·</span> Fair: AED{" "}
                {fair.toLocaleString()}
              </>
            )}
          </p>
          {confLabel && (
            <p className="text-xs text-muted-foreground">
              {confLabel}
              {conf !== null && (
                <> · {Math.round(conf * 100)}%</>
              )}
            </p>
          )}
          {reasoning && (
            <p className="text-xs leading-snug">{reasoning}</p>
          )}
          {marketNote && (
            <p className="text-xs italic opacity-80">{marketNote}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
