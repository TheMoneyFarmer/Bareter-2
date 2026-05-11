import { Link } from "wouter";
import {
  Bookmark,
  MapPin,
  Package,
  ShieldCheck,
  Sparkles,
  Eye,
  Heart,
  ArrowLeftRight,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ListingWithUser } from "@shared/schema";

interface TrendingDetailedRowProps {
  listings: ListingWithUser[];
  max?: number;
  /** When true, cards link to /feed instead of the individual listing page */
  feedLinks?: boolean;
}

const CONDITION_LABEL: Record<string, string> = {
  brand_new: "Brand new",
  like_new: "Like new",
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  used: "Used",
};

function fmtAed(v: string | number | null | undefined) {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  if (!n) return "—";
  return `AED ${Math.round(n).toLocaleString()}`;
}

function topCornerBadge(l: ListingWithUser) {
  if (l.isFeatured)
    return { label: "Featured", className: "bg-amber-400 text-amber-950" };
  if (l.aiMatchScore && parseFloat(l.aiMatchScore as string) >= 80)
    return { label: "Top match", className: "bg-bareter-teal text-white" };
  if (l.type === "request")
    return { label: "Wanted", className: "bg-rose-500 text-white" };
  return { label: "New offer", className: "bg-emerald-500 text-white" };
}

export function TrendingDetailedRow({ listings, max = 8, feedLinks = false }: TrendingDetailedRowProps) {
  const items = (listings ?? []).slice(0, max);
  if (items.length === 0) return null;

  return (
    <div
      className="-mx-4 px-4 overflow-x-auto scrollbar-hide"
      data-testid="row-trending-detailed"
    >
      <div className="flex gap-4 sm:gap-5 min-w-min pb-2">
        {items.map((l) => {
          const cover = (l.images as string[] | undefined)?.[0];
          const wanted = (l.wantedCategories as string[] | undefined) ?? [];
          const tags = (l.tags as string[] | undefined) ?? [];
          const exchangeItems =
            (l.exchangeItems as Array<{ title?: string; name?: string }> | undefined) ?? [];
          const wantsLine =
            exchangeItems
              .map((x) => x.title || x.name)
              .filter(Boolean)
              .slice(0, 2)
              .join(" • ") ||
            wanted.slice(0, 3).join(" • ") ||
            (l.openToOffers ? "Open to offers" : "—");
          const corner = topCornerBadge(l);
          const condition =
            CONDITION_LABEL[l.condition ?? "like_new"] ?? (l.condition ?? "—");
          const cityLabel = l.city || l.location || l.country || "Worldwide";
          const isOffer = l.type === "offer";
          const verified = l.user?.isVerified;

          return (
            <Link
              key={l.id}
              href={feedLinks ? "/feed" : `/listings/${l.id}`}
              className="group flex-shrink-0 w-[280px] sm:w-[300px]"
              data-testid={`card-trending-${l.id}`}
            >
              <div className="bg-white dark:bg-card rounded-bareter-card overflow-hidden border border-bareter-border dark:border-border shadow-bareter-card hover:shadow-bareter-hover transition-shadow">
                {/* Image area */}
                <div className="relative aspect-[4/3] bg-bareter-teal-muted dark:bg-muted overflow-hidden">
                  {cover ? (
                    <img
                      src={cover}
                      alt={l.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-10 w-10 text-bareter-teal/40" />
                    </div>
                  )}

                  {/* Top-left corner badge */}
                  <span
                    className={`absolute top-2 start-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${corner.className}`}
                    data-testid={`badge-corner-${l.id}`}
                  >
                    <Sparkles className="h-3 w-3" /> {corner.label}
                  </span>

                  {/* Top-right bookmark */}
                  <button
                    type="button"
                    aria-label="Save listing"
                    onClick={(e) => {
                      e.preventDefault();
                    }}
                    className="absolute top-2 end-2 h-8 w-8 inline-flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-bareter-navy shadow-sm"
                    data-testid={`button-save-${l.id}`}
                  >
                    <Bookmark className="h-4 w-4" />
                  </button>

                  {/* Bottom-left "type" pill (Offer / Wanted) */}
                  <span
                    className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-full bg-bareter-navy/85 backdrop-blur-sm px-2.5 py-1 text-[10px] font-semibold text-white"
                    data-testid={`pill-type-${l.id}`}
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                    {isOffer ? "Offering" : "Looking for"}
                  </span>
                </div>

                {/* Body */}
                <div className="p-3 sm:p-4">
                  {/* Title */}
                  <h3
                    className="text-[15px] font-bold text-bareter-navy dark:text-foreground uppercase tracking-tight line-clamp-1"
                    data-testid={`text-title-${l.id}`}
                  >
                    {l.title}
                  </h3>
                  {/* Subtitle: categories */}
                  <p
                    className="mt-0.5 text-xs text-bareter-muted line-clamp-1"
                    data-testid={`text-subtitle-${l.id}`}
                  >
                    {((l.categories as string[] | undefined) ?? []).slice(0, 3).join(" • ") || "Misc"}
                  </p>

                  {/* Spec strip — condition · category · tag */}
                  <div className="mt-2 flex items-center flex-wrap gap-x-1.5 gap-y-1 text-[11px] text-bareter-navy/80 dark:text-foreground/80">
                    <span className="font-medium" data-testid={`text-condition-${l.id}`}>
                      {condition}
                    </span>
                    {tags.slice(0, 2).map((t) => (
                      <span key={t} className="inline-flex items-center gap-0.5">
                        <span className="text-bareter-muted">·</span>
                        <span>{t}</span>
                      </span>
                    ))}
                    {l.openToOffers && (
                      <span className="inline-flex items-center gap-0.5">
                        <span className="text-bareter-muted">·</span>
                        <span>Open to offers</span>
                      </span>
                    )}
                  </div>

                  {/* Value */}
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span
                      className="text-bareter-navy dark:text-foreground font-extrabold text-[18px]"
                      data-testid={`text-value-${l.id}`}
                    >
                      {fmtAed(l.retailValue)}
                    </span>
                    <span className="text-[10px] text-bareter-muted uppercase tracking-wider">
                      Listed value
                    </span>
                  </div>

                  {/* Wants in return (deliverables) */}
                  <div className="mt-1 flex items-start gap-1.5">
                    <Tag className="h-3.5 w-3.5 mt-0.5 text-bareter-teal flex-shrink-0" />
                    <p
                      className="text-[12px] text-bareter-navy/85 dark:text-foreground/85 line-clamp-1"
                      data-testid={`text-wants-${l.id}`}
                    >
                      <span className="text-bareter-muted">
                        {isOffer ? "Wants in return: " : "Will trade: "}
                      </span>
                      {wantsLine}
                    </p>
                  </div>

                  {/* Bottom row — location + interest stats + verified */}
                  <div className="mt-3 pt-2.5 border-t border-bareter-border dark:border-border flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-bareter-muted truncate min-w-0">
                      <MapPin className="h-3 w-3 flex-shrink-0 text-bareter-teal" />
                      <span className="truncate" data-testid={`text-city-${l.id}`}>
                        {cityLabel}
                      </span>
                    </span>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      {verified && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-bareter-teal"
                          title="Verified user"
                        >
                          <ShieldCheck className="h-3 w-3" /> KYC
                        </span>
                      )}
                      <span
                        className="inline-flex items-center gap-0.5 text-[11px] text-bareter-muted"
                        data-testid={`stat-likes-${l.id}`}
                      >
                        <Heart className="h-3 w-3" />
                        {l.likeCount ?? 0}
                      </span>
                      <span
                        className="inline-flex items-center gap-0.5 text-[11px] text-bareter-muted"
                        data-testid={`stat-views-${l.id}`}
                      >
                        <Eye className="h-3 w-3" />
                        {l.viewCount ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
