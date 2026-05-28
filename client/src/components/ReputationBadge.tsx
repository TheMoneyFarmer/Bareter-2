import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, ShieldCheck, Award, Gem } from "lucide-react";

interface ReputationBadgeProps {
  completedDeals: number;
  avgRating?: number;
  size?: "sm" | "md";
}

function getTier(deals: number) {
  if (deals >= 25) return { label: "Elite Trader", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800", Icon: Gem };
  if (deals >= 10) return { label: "Trusted Trader", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800", Icon: Award };
  if (deals >= 5)  return { label: "Verified Trader", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800", Icon: ShieldCheck };
  return null;
}

export function ReputationBadge({ completedDeals, avgRating, size = "sm" }: ReputationBadgeProps) {
  const tier = getTier(completedDeals);
  if (!tier) return null;
  const { label, color, bg, Icon } = tier;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 rounded-full border text-[10px] font-semibold px-2 py-0.5 cursor-default ${bg} ${color}`}>
            <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="space-y-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{completedDeals} completed deals</p>
          {avgRating != null && avgRating > 0 && (
            <p className="text-xs text-muted-foreground">{avgRating.toFixed(1)} ★ average rating</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
