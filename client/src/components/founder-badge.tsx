import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles } from "lucide-react";

interface FounderBadgeProps {
  show?: boolean | null;
  size?: "sm" | "md";
  className?: string;
}

export function FounderBadge({ show: _show, size: _size, className: _className }: FounderBadgeProps) {
  return null;
  const sizeCls = size === "md" ? "h-5 px-2 text-[11px]" : "h-4 px-1.5 text-[10px]";
  const iconCls = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold ${sizeCls} ${className}`}
          data-testid="badge-founder"
        >
          <Sparkles className={iconCls} />
          Founder
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Joined the Bareter waitlist before launch</p>
      </TooltipContent>
    </Tooltip>
  );
}
