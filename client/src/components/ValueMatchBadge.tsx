import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ValueMatchBadgeProps {
  offerValue: number | string;
  listingValue: number | string;
  /** AI-estimated fair value of the offer — overrides offerValue for match calc if provided */
  aiFairValue?: number | string | null;
  aiConfidence?: number | string | null;
}

function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function ValueMatchBadge({ offerValue, listingValue, aiFairValue, aiConfidence }: ValueMatchBadgeProps) {
  const listingVal = toNum(listingValue);
  if (listingVal <= 0) return null;

  const aiVal = toNum(aiFairValue);
  const effectiveOffer = aiVal > 0 ? aiVal : toNum(offerValue);
  if (effectiveOffer <= 0) return null;

  const matchPct = Math.round(Math.min(effectiveOffer, listingVal) / Math.max(effectiveOffer, listingVal) * 100);
  const diff = effectiveOffer - listingVal;
  const diffPct = Math.round(Math.abs(diff) / listingVal * 100);

  const color =
    matchPct >= 90
      ? "border-green-200 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800"
      : matchPct >= 70
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800"
        : "border-orange-200 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800";

  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const conf = toNum(aiConfidence);
  const isAiBacked = aiVal > 0;
  const tooltipLabel = isAiBacked
    ? `AI-verified offer value: AED ${aiVal.toLocaleString()}${conf > 0 ? ` · ${Math.round(conf * 100)}% confidence` : ""}`
    : `Declared offer: AED ${toNum(offerValue).toLocaleString()}`;

  const diffLabel = diff === 0
    ? "Exact value match"
    : diff > 0
      ? `Offer is ${diffPct}% above listing value`
      : `Offer is ${diffPct}% below listing value`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-0.5 rounded-full border text-[10px] font-semibold px-1.5 py-0.5 cursor-help ${color}`}>
            <Icon className="h-2.5 w-2.5" />
            {matchPct}% match
            {isAiBacked && <span className="opacity-60 text-[9px]">·AI</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs space-y-1">
          <p className="text-sm font-semibold">Value Match</p>
          <p className="text-xs text-muted-foreground">{diffLabel}</p>
          <p className="text-xs text-muted-foreground">{tooltipLabel}</p>
          <p className="text-xs text-muted-foreground">Listing value: AED {listingVal.toLocaleString()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
