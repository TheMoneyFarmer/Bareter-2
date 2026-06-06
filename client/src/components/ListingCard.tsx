import { useState, type CSSProperties, type MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, ShieldCheck, Crown, Lock, Heart, MoreVertical, Flag, Languages, Loader2, MessageCircle, ArrowLeftRight, UserPlus, UserMinus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ListingWithUser } from "@shared/schema";
import { isUserVerified } from "@/components/verified-badge";
import { ImageCarousel } from "@/components/ImageCarousel";
import { ReportModal } from "@/components/report-modal";
import { ValuationBadge } from "@/components/ValuationBadge";
import { useWaitlist } from "@/lib/waitlist";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useActionGuard } from "@/lib/action-guard";

const CATEGORY_PILL_COLORS: Record<string, string> = {
  Cars: "#1C2D4A",
  Automotive: "#1C2D4A",
  Services: "#1A7272",
  Consulting: "#1A7272",
  Marketing: "#1A7272",
  Food: "#B45309",
  "Real Estate": "#4A1D96",
  Electronics: "#1E40AF",
  Technology: "#1E40AF",
  SaaS: "#1E40AF",
  Yachts: "#0C4A6E",
  Hospitality: "#7C2D12",
  Fashion: "#9D174D",
  Photography: "#374151",
  Modeling: "#374151",
  Legal: "#1F2937",
  Events: "#A16207",
  "Health & Wellness": "#065F46",
  Education: "#1E3A8A",
  Design: "#7C2D12",
  Entertainment: "#7C2D12",
};

const DEFAULT_HIGH_VALUE_THRESHOLD = 50000;

interface ListingCardProps {
  listing: ListingWithUser;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  isWishlisted?: boolean;
  onWishlistToggle?: (listingId: string) => void;
}

type TranslationCache = Map<string, { title: string; description: string }>;
const translationCache: TranslationCache = new Map();

export function ListingCard({ listing, className = "", style, testId, isWishlisted, onWishlistToggle }: ListingCardProps) {
  const { gate } = useWaitlist();
  const { user } = useAuth();
  const { guardAuth } = useActionGuard();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showReport, setShowReport] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<{ title: string; description: string } | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);

  const ownerId = listing.user?.id || listing.userId;
  const isOwnListing = user?.id === ownerId;

  const { data: followData } = useQuery<{ isFollowing: boolean }>({
    queryKey: ["/api/users", ownerId, "is-following"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${ownerId}/is-following`);
      return res.json();
    },
    enabled: !!user && !!ownerId && !isOwnListing,
    staleTime: 60_000,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (followData?.isFollowing) {
        await apiRequest("DELETE", `/api/users/${ownerId}/follow`);
      } else {
        await apiRequest("POST", `/api/users/${ownerId}/follow`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", ownerId, "is-following"] });
      toast({ title: followData?.isFollowing ? "Unfollowed" : "Following" });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  const { data: pubSettings } = useQuery<Record<string, string | null>>({
    queryKey: ["/api/public/settings"],
    staleTime: 60_000,
  });
  const highValueThreshold = pubSettings?.high_value_threshold
    ? parseFloat(pubSettings.high_value_threshold)
    : DEFAULT_HIGH_VALUE_THRESHOLD;

  const allImages = (listing.images as string[] | undefined) ?? [];
  const primaryCategory = (listing.categories as string[] | undefined)?.[0] || null;
  const pillColor = primaryCategory ? CATEGORY_PILL_COLORS[primaryCategory] || "#374151" : "#374151";
  const valueNum = parseFloat(listing.retailValue as string);
  const isHighValue = !Number.isNaN(valueNum) && valueNum >= highValueThreshold;
  const verified = isUserVerified(listing.user?.kycStatus, listing.user?.kybStatus);

  const exchangeItems = listing.exchangeItems ?? undefined;
  const wantedCategories = listing.wantedCategories ?? undefined;
  const lookingFor =
    exchangeItems?.find((i) => i.isPriority)?.name ||
    exchangeItems?.[0]?.name ||
    wantedCategories?.[0] ||
    null;

  const handleTranslate = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (showTranslated) {
      setShowTranslated(false);
      return;
    }

    const targetLang = "ar";
    const cacheKey = `${listing.id}-${targetLang}`;
    if (translationCache.has(cacheKey)) {
      setTranslation(translationCache.get(cacheKey)!);
      setShowTranslated(true);
      return;
    }

    setTranslating(true);
    try {
      const textToTranslate = `TITLE: ${listing.title}\nDESCRIPTION: ${listing.description || ""}`;
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: textToTranslate, targetLang }),
      });
      if (!res.ok) throw new Error("Translation failed");
      const data = await res.json();
      const translated = {
        title: data.title || listing.title,
        description: data.description || (listing.description || ""),
      };
      translationCache.set(cacheKey, translated);
      setTranslation(translated);
      setShowTranslated(true);
    } catch {
      toast({ title: t("translate.error"), variant: "destructive" });
    } finally {
      setTranslating(false);
    }
  };

  const displayTitle = showTranslated && translation ? translation.title : listing.title;
  const displayDescription = showTranslated && translation?.description
    ? translation.description
    : listing.description || null;

  return (
    <>
    <Link
      href={`/listings/${listing.id}`}
      className={`group block ${className}`}
      style={style}
      data-testid={testId || `card-listing-${listing.id}`}
    >
      <article className="bareter-card-hover bg-white dark:bg-card rounded-bareter-card border border-bareter-border dark:border-border shadow-bareter-card overflow-hidden h-full flex flex-col">
        {/* IMAGE — 16:9 with swipe carousel */}
        <ImageCarousel
          images={allImages}
          alt={listing.title}
          aspect="aspect-[16/9]"
          testIdPrefix={`listing-media-${listing.id}`}
          overlays={
            <>
              {primaryCategory && (
                <span
                  className="absolute top-3 start-3 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white rounded-md shadow-sm"
                  style={{ backgroundColor: pillColor }}
                  data-testid={`pill-category-${listing.id}`}
                >
                  {primaryCategory}
                </span>
              )}

              {listing.isFeatured && (
                <span className="absolute top-3 end-3 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-bareter-gold text-bareter-navy-deep shadow-sm">
                  <Crown className="h-3 w-3" />
                  {t("listingCard.featured")}
                </span>
              )}

              {isHighValue && !listing.isFeatured && (
                <span className="absolute top-3 end-3 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-bareter-navy/95 text-white shadow-sm">
                  <Lock className="h-3 w-3" />
                  {t("listingCard.enhancedVerification")}
                </span>
              )}

              {onWishlistToggle && (
                <button
                  type="button"
                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onWishlistToggle(listing.id);
                  }}
                  className="absolute bottom-3 end-3 h-9 w-9 rounded-full bg-white/90 dark:bg-bareter-navy-deep/80 backdrop-blur-sm inline-flex items-center justify-center shadow-sm hover:bg-white dark:hover:bg-bareter-navy-deep transition-colors z-10"
                  data-testid={`button-wishlist-${listing.id}`}
                  aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                >
                  <Heart
                    className={`h-4 w-4 transition-colors ${isWishlisted ? "fill-bareter-error text-bareter-error" : "text-bareter-navy dark:text-white"}`}
                  />
                </button>
              )}

              <div
                className="absolute top-3 end-3 z-10"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`h-8 w-8 rounded-full bg-white/85 dark:bg-bareter-navy-deep/75 backdrop-blur-sm inline-flex items-center justify-center shadow-sm hover:bg-white dark:hover:bg-bareter-navy-deep transition-colors ${listing.isFeatured || isHighValue ? "mt-9" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      data-testid={`button-listing-menu-${listing.id}`}
                      aria-label="Listing options"
                    >
                      <MoreVertical className="h-4 w-4 text-bareter-navy dark:text-white" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        if (!gate()) return;
                        if (!guardAuth()) return;
                        setShowReport(true);
                      }}
                      className="text-destructive focus:text-destructive"
                      data-testid={`menuitem-report-listing-${listing.id}`}
                    >
                      <Flag className="me-2 h-4 w-4" />
                      {t("listingCard.reportListing")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          }
        />

        {/* BODY */}
        <div className="flex flex-col flex-1 p-4 gap-2.5">
          <h3
            className="text-card-title text-bareter-navy dark:text-foreground line-clamp-1"
            data-testid={`text-listing-title-${listing.id}`}
          >
            {displayTitle}
          </h3>

          {displayDescription && (
            <p
              className="text-[12px] text-bareter-muted dark:text-muted-foreground line-clamp-2"
              data-testid={`text-listing-desc-${listing.id}`}
            >
              {displayDescription}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <span
              className="text-price"
              data-testid={`text-listing-price-${listing.id}`}
            >
              AED {Number.isFinite(valueNum) ? valueNum.toLocaleString() : listing.retailValue}
            </span>
            {listing.location && (
              <span className="inline-flex items-center gap-1 text-caption text-bareter-muted dark:text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {listing.location}
              </span>
            )}
          </div>

          {(listing.valuationMinAed != null && listing.valuationMaxAed != null) && (
            <div data-testid={`row-valuation-${listing.id}`}>
              <ValuationBadge
                minAed={listing.valuationMinAed}
                maxAed={listing.valuationMaxAed}
                fairAed={listing.valuationFairAed}
                confidence={listing.valuationConfidence}
                reasoning={listing.valuationReasoning}
                marketNote={listing.valuationMarketNote}
                size="sm"
              />
            </div>
          )}

          {lookingFor && (
            <div className="border-t border-bareter-border dark:border-border pt-2.5">
              <p className="text-caption text-bareter-muted dark:text-muted-foreground">
                <span className="font-semibold text-bareter-navy dark:text-foreground">{t("listingCard.lookingFor")}</span>{" "}
                <span className="line-clamp-1">{lookingFor}</span>
              </p>
            </div>
          )}

          {/* Translate button — hidden until multi-language release */}

          {/* SOCIAL FOOTER */}
          <div
            className="flex items-center gap-3 border-t border-bareter-border dark:border-border pt-2.5"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <span className="inline-flex items-center gap-1 text-[12px] text-bareter-muted dark:text-muted-foreground">
              <Heart className="h-3.5 w-3.5" />
              {listing.likeCount ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] text-bareter-muted dark:text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5" />
              {listing.commentCount ?? 0}
            </span>
            <span className="ms-auto inline-flex items-center gap-1 text-[11px] font-semibold text-bareter-teal bg-bareter-teal-muted px-2 py-0.5 rounded-full">
              <ArrowLeftRight className="h-3 w-3" />
              {t("listingCard.propose")}
            </span>
          </div>

          {/* SELLER — clicking the name/avatar goes to their profile */}
          <div
            className="border-t border-bareter-border dark:border-border pt-2.5 mt-auto flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href={listing.user?.id ? `/users/${listing.user.id}` : "#"}
              onClick={(e: MouseEvent) => e.stopPropagation()}
              className="flex items-center gap-2 flex-1 min-w-0 group/seller"
            >
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarImage src={listing.user?.avatarUrl || undefined} alt={listing.user?.fullName} />
                <AvatarFallback className="text-[10px] bg-bareter-teal-muted text-bareter-teal">
                  {listing.user?.fullName?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-[13px] font-medium text-bareter-navy dark:text-foreground truncate group-hover/seller:underline group-hover/seller:text-bareter-teal transition-colors">
                {listing.user?.fullName || "Member"}
              </span>
              {verified && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-bareter-teal-muted text-bareter-teal text-[10px] font-semibold flex-shrink-0">
                  <ShieldCheck className="h-3 w-3" />
                  {t("listingCard.verified")}
                </span>
              )}
            </Link>
            {!isOwnListing && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!gate()) return;
                  if (!guardAuth()) return;
                  followMutation.mutate();
                }}
                disabled={followMutation.isPending}
                className={`flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                  followData?.isFollowing
                    ? "border-bareter-teal text-bareter-teal bg-bareter-teal-muted"
                    : "border-bareter-border text-bareter-muted hover:border-bareter-teal hover:text-bareter-teal"
                }`}
                data-testid={`button-follow-card-${listing.id}`}
              >
                {followData?.isFollowing ? (
                  <><UserMinus className="h-3 w-3" />Following</>
                ) : (
                  <><UserPlus className="h-3 w-3" />Follow</>
                )}
              </button>
            )}
          </div>
        </div>
      </article>
    </Link>
    <ReportModal
      open={showReport}
      onOpenChange={setShowReport}
      targetType="listing"
      targetId={listing.id}
    />
  </>
  );
}

/* Skeleton variant — drop-in replacement for spinners */
export function ListingCardSkeleton() {
  return (
    <div className="bg-white dark:bg-card rounded-bareter-card border border-bareter-border dark:border-border shadow-bareter-card overflow-hidden">
      <div className="aspect-[16/9] bareter-shimmer" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 rounded bareter-shimmer" />
        <div className="h-5 w-1/2 rounded bareter-shimmer" />
        <div className="h-3 w-2/3 rounded bareter-shimmer" />
        <div className="h-7 w-full rounded bareter-shimmer" />
      </div>
    </div>
  );
}

export default ListingCard;
