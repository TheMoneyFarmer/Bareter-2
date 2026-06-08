import { BadgeCheck, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  kycStatus?: string | null;
  kybStatus?: string | null;
  accountType?: string | null;
  isVerified?: boolean | null;
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

// ── Email / Phone trust badges ───────────────────────────────────────────────

interface TrustBadgesProps {
  emailVerified?: boolean | null;
  phoneVerified?: boolean | null;
  className?: string;
}

export function TrustBadges({ emailVerified, phoneVerified, className }: TrustBadgesProps) {
  const both = emailVerified && phoneVerified;
  if (!emailVerified && !phoneVerified) return null;

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-1.5", className)}>
        {both && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold">
                <ShieldCheck className="h-3 w-3" />
                Trusted
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Email and phone verified</TooltipContent>
          </Tooltip>
        )}
        {!both && emailVerified && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-blue-500" aria-label="Email verified">
                <Mail className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Email verified</TooltipContent>
          </Tooltip>
        )}
        {!both && phoneVerified && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-green-500" aria-label="Phone verified">
                <MessageCircle className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">WhatsApp verified</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

export function VerifiedBadge({
  kycStatus,
  kybStatus,
  accountType,
  isVerified,
  size = "sm",
  className,
  testId,
}: VerifiedBadgeProps) {
  if (!isUserVerified(kycStatus, kybStatus) && !isVerified) return null;

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
