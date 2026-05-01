import { useState, type CSSProperties, type MouseEvent } from "react";
import { Link } from "wouter";
import { MapPin, ShieldCheck, Crown, Lock, Heart } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ListingWithUser } from "@shared/schema";
import { isUserVerified } from "@/components/verified-badge";

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

const HIGH_VALUE_THRESHOLD_AED = 50000;

interface ListingCardProps {
  listing: ListingWithUser;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  isWishlisted?: boolean;
  onWishlistToggle?: (listingId: string) => void;
}

export function ListingCard({ listing, className = "", style, testId, isWishlisted, onWishlistToggle }: ListingCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const cover = listing.images?.[0] || null;
  const primaryCategory = (listing.categories as string[] | undefined)?.[0] || null;
  const pillColor = primaryCategory ? CATEGORY_PILL_COLORS[primaryCategory] || "#374151" : "#374151";
  const valueNum = parseFloat(listing.retailValue as string);
  const isHighValue = !Number.isNaN(valueNum) && valueNum >= HIGH_VALUE_THRESHOLD_AED;
  const verified = isUserVerified(listing.user?.kycStatus, listing.user?.kybStatus);

  // Build the "Looking for" line from priority exchange items, falling back to wantedCategories
  const exchangeItems = listing.exchangeItems ?? undefined;
  const wantedCategories = listing.wantedCategories ?? undefined;
  const lookingFor =
    exchangeItems?.find((i) => i.isPriority)?.name ||
    exchangeItems?.[0]?.name ||
    wantedCategories?.[0] ||
    null;

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={`group block ${className}`}
      style={style}
      data-testid={testId || `card-listing-${listing.id}`}
    >
      <article className="bareter-card-hover bg-white dark:bg-card rounded-bareter-card border border-bareter-border dark:border-border shadow-bareter-card overflow-hidden h-full flex flex-col">
        {/* IMAGE — strict 16:9 */}
        <div className="relative aspect-[16/9] bg-bareter-off-white dark:bg-muted overflow-hidden">
          {cover ? (
            <img
              src={cover}
              alt={listing.title}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              className={`w-full h-full object-cover bareter-img-blur ${imgLoaded ? "is-loaded" : ""}`}
            />
          ) : (
            <div className="w-full h-full bg-bareter-gradient flex items-center justify-center">
              <span className="text-white/60 text-xs font-medium tracking-wider">BARETER</span>
            </div>
          )}

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
              Featured
            </span>
          )}

          {isHighValue && !listing.isFeatured && (
            <span className="absolute top-3 end-3 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-bareter-navy/95 text-white shadow-sm">
              <Lock className="h-3 w-3" />
              Enhanced verification
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
              className="absolute bottom-3 end-3 h-9 w-9 rounded-full bg-white/90 dark:bg-bareter-navy-deep/80 backdrop-blur-sm inline-flex items-center justify-center shadow-sm hover:bg-white dark:hover:bg-bareter-navy-deep transition-colors"
              data-testid={`button-wishlist-${listing.id}`}
              aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart
                className={`h-4 w-4 transition-colors ${isWishlisted ? "fill-bareter-error text-bareter-error" : "text-bareter-navy dark:text-white"}`}
              />
            </button>
          )}
        </div>

        {/* BODY */}
        <div className="flex flex-col flex-1 p-4 gap-2.5">
          <h3
            className="text-card-title text-bareter-navy dark:text-foreground line-clamp-1"
            data-testid={`text-listing-title-${listing.id}`}
          >
            {listing.title}
          </h3>

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

          {lookingFor && (
            <div className="border-t border-bareter-border dark:border-border pt-2.5">
              <p className="text-caption text-bareter-muted dark:text-muted-foreground">
                <span className="font-semibold text-bareter-navy dark:text-foreground">Looking for:</span>{" "}
                <span className="line-clamp-1">{lookingFor}</span>
              </p>
            </div>
          )}

          {/* SELLER */}
          <div className="border-t border-bareter-border dark:border-border pt-2.5 mt-auto flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarImage src={listing.user?.avatarUrl || undefined} alt={listing.user?.fullName} />
              <AvatarFallback className="text-[10px] bg-bareter-teal-muted text-bareter-teal">
                {listing.user?.fullName?.charAt(0)?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <span className="text-[13px] font-medium text-bareter-navy dark:text-foreground truncate flex-1">
              {listing.user?.fullName || "Member"}
            </span>
            {verified && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-bareter-teal-muted text-bareter-teal text-[10px] font-semibold">
                <ShieldCheck className="h-3 w-3" />
                Verified
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
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
