import { Link } from "wouter";
import { MapPin, Package, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { assetUrl } from "@/lib/queryClient";
import type { ListingWithUser } from "@shared/schema";

interface BusinessProductCardProps {
  listing: ListingWithUser;
}

export function BusinessProductCard({ listing }: BusinessProductCardProps) {
  const images = (listing.images as string[] | undefined) ?? [];
  const thumb = images[0] ? assetUrl(images[0]) : null;
  const valueNum = parseFloat(listing.retailValue as string);
  const isWholesale = listing.listingType === "business_wholesale";

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group block"
      data-testid={`biz-product-card-${listing.id}`}
    >
      <article className="bg-white dark:bg-card rounded-xl border border-bareter-border dark:border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col">
        {/* Thumbnail — 4:3 */}
        <div className="aspect-[4/3] bg-muted overflow-hidden relative flex-shrink-0">
          {thumb ? (
            <img
              src={thumb}
              alt={listing.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}
          {/* Type badge */}
          <span className={`absolute top-2 start-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white shadow-sm ${isWholesale ? "bg-bareter-teal/90" : "bg-bareter-navy/90"}`}>
            <Package className="h-3 w-3" />
            {isWholesale ? "Wholesale" : "Product"}
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-col flex-1 p-3 gap-1.5">
          <h3 className="text-sm font-semibold text-bareter-navy dark:text-foreground line-clamp-2 leading-snug">
            {listing.title}
          </h3>

          {listing.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
              {listing.description}
            </p>
          )}

          <div className="mt-auto pt-1.5 flex items-end justify-between gap-2">
            <div>
              <p className="text-[9px] font-normal text-muted-foreground uppercase tracking-wide leading-none mb-0.5">Est. value</p>
              <p className="text-sm font-bold text-bareter-navy dark:text-foreground">
                AED {Number.isFinite(valueNum) ? valueNum.toLocaleString() : listing.retailValue}
              </p>
            </div>
            {listing.location && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {listing.location}
              </span>
            )}
          </div>

          {/* Wholesale quantity bar */}
          {isWholesale && listing.totalQuantity != null && (
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-bareter-teal transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, ((listing.remainingQuantity ?? listing.totalQuantity) / listing.totalQuantity) * 100))}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                {listing.remainingQuantity ?? listing.totalQuantity}/{listing.totalQuantity}{listing.unitLabel ? ` ${listing.unitLabel}` : ""} left
              </span>
            </div>
          )}

          <div className="flex items-center justify-end pt-1 border-t border-bareter-border dark:border-border">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-bareter-teal bg-bareter-teal-muted px-2 py-0.5 rounded-full">
              <ArrowLeftRight className="h-2.5 w-2.5" />
              Propose barter
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
