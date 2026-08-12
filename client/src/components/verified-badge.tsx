import { BadgeCheck, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isAccountVerified } from "@shared/verification";

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

/**
 * Whether to show the "Verified" badge.
 *
 * Delegates to the shared rule in `@shared/verification` — the same function
 * the server gates listing creation and trade creation on. Keeping these in
 * lockstep is the whole point: this badge previously counted a verified phone
 * as verified while the server demanded an approved identity KYC, so users
 * saw a green badge and were still refused at listing creation.
 *
 * Callers that only have kyc/kyb (e.g. a listing card, which does not carry
 * the poster's email/phone flags) still work: an APPROVED status short-circuits
 * the shared rule, which is exactly the signal those surfaces have.
 */
export function isUserVerified(
  kycStatus?: string | null,
  kybStatus?: string | null,
  phoneVerified?: boolean | null,
  isVerified?: boolean | null,
  emailVerified?: boolean | null,
  accountType?: string | null,
): boolean {
  return isAccountVerified({
    accountType,
    kycStatus,
    kybStatus,
    isVerified,
    phoneVerified,
    emailVerified,
  });
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

// ── Verification Level Badge ─────────────────────────────────────────────────

interface VerificationLevelBadgeProps {
  level?: number | null;
  className?: string;
}

export function VerificationLevelBadge({ level, className }: VerificationLevelBadgeProps) {
  if (!level || level < 1) return null;
  const isHigher = level >= 2;
  const label = isHigher ? "Identity verified — Level 2" : "Account verified — Level 1";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold",
              isHigher
                ? "bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400"
                : "bg-sky-50 dark:bg-sky-900/30 border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400",
              className,
            )}
            aria-label={label}
          >
            <ShieldCheck className="h-3 w-3" />
            Lvl {level}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
