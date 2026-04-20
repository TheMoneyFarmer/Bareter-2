import { BadgeCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  kycStatus?: string | null;
  kybStatus?: string | null;
  accountType?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  testId?: string;
}

const SIZES = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function isUserVerified(
  kycStatus?: string | null,
  kybStatus?: string | null,
): boolean {
  return kycStatus === "APPROVED" || kybStatus === "APPROVED";
}

export function VerifiedBadge({
  kycStatus,
  kybStatus,
  accountType,
  size = "sm",
  className,
  testId,
}: VerifiedBadgeProps) {
  if (!isUserVerified(kycStatus, kybStatus)) return null;

  const isBusiness = kybStatus === "APPROVED" || accountType === "business";
  const label = isBusiness ? "Verified business" : "Verified identity";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center justify-center text-blue-500",
              className,
            )}
            data-testid={testId || "badge-verified"}
            aria-label={label}
          >
            <BadgeCheck className={cn(SIZES[size], "fill-blue-500 text-white")} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
