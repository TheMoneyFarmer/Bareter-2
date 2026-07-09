import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  MapPin,
  ShieldCheck,
  ArrowLeft,
  Package,
  Globe,
  Clock,
  Settings,
} from "lucide-react";
import { API_BASE, assetUrl } from "@/lib/queryClient";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/lib/auth";
import { useSeo } from "@/hooks/use-seo";
import { BusinessProductCard } from "@/components/BusinessProductCard";
import { ListingCard as BrandListingCard } from "@/components/ListingCard";

// ── Types ──────────────────────────────────────────────────────────────────

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

interface DayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}

type BusinessHours = Partial<Record<DayKey, DayHours>>;

interface BusinessStorefrontData {
  id: string;
  companyName: string;
  category?: string | null;
  kybStatus: string;
  kybVerifiedAt?: string | null;
  createdAt: string;
  coverImageUrl?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  businessHours?: BusinessHours | null;
  location?: string | null;
  websiteDisplay?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
  owner: {
    id: string;
    fullName: string;
    avatarUrl?: string | null;
    city?: string | null;
    country?: string | null;
    isVerified?: boolean;
  } | null;
  activeListings: any[];
}

type CatalogTab = "all" | "products" | "wholesale" | "services";

// ── Dubai timezone helpers ─────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS: Record<DayKey, string> = {
  sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday",
  thu: "Thursday", fri: "Friday", sat: "Saturday",
};
const DAY_SHORT: Record<DayKey, string> = {
  sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat",
};

function getDubaiNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
}

function getDayKey(d: Date): DayKey {
  return DAY_KEYS[d.getDay()];
}

function fmt12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function isOpenNow(hours: BusinessHours): { open: boolean; label: string } {
  const now = getDubaiNow();
  const dayKey = getDayKey(now);
  const today = hours[dayKey];
  if (!today || today.closed) return { open: false, label: "Closed today" };
  if (!today.open || !today.close) return { open: false, label: "Hours not set" };
  const cur = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (cur >= today.open && cur < today.close) {
    return { open: true, label: `Open · closes ${fmt12(today.close)}` };
  }
  if (cur < today.open) {
    return { open: false, label: `Closed · opens ${fmt12(today.open)}` };
  }
  return { open: false, label: "Closed now" };
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function BusinessStorefrontSkeleton() {
  return (
    <div className="container mx-auto max-w-5xl px-4 pb-12 space-y-0">
      <Skeleton className="w-full h-48 rounded-none" />
      <div className="px-6 pb-6 space-y-4">
        <div className="flex items-end gap-4 -mt-10">
          <Skeleton className="h-20 w-20 rounded-xl flex-shrink-0 ring-4 ring-background" />
          <div className="space-y-2 pb-2 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-4 w-full max-w-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    </div>
  );
}

// ── Hours panel ────────────────────────────────────────────────────────────

function HoursPanel({ hours }: { hours: BusinessHours }) {
  const [expanded, setExpanded] = useState(false);
  const now = getDubaiNow();
  const todayKey = getDayKey(now);
  const status = isOpenNow(hours);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 text-sm hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className={`font-medium ${status.open ? "text-green-600" : "text-muted-foreground"}`}>
          {status.label}
        </span>
        <span className="text-xs text-muted-foreground">(tap to see hours)</span>
      </button>
      {expanded && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
          {DAY_KEYS.slice(1).concat(DAY_KEYS[0]).map(day => {
            const dh = hours[day];
            const isToday = day === todayKey;
            return (
              <div key={day} className={`flex justify-between gap-4 ${isToday ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                <span className="w-24 shrink-0">{DAY_LABELS[day]}</span>
                <span>
                  {dh?.closed ? "Closed" : (dh?.open && dh?.close) ? `${fmt12(dh.open)} – ${fmt12(dh.close)}` : "—"}
                </span>
              </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground pt-1 border-t border-border mt-1">All times Dubai (GST, UTC+4)</p>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function BusinessStorefrontPage() {
  const { id } = useParams<{ id: string }>();
  const { user: loggedInUser } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<CatalogTab>("all");

  const { data, isLoading, isError } = useQuery<BusinessStorefrontData | null>({
    queryKey: ["/api/businesses", id, "storefront"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/businesses/${id}/storefront`, {
        credentials: "include",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load business profile");
      return res.json();
    },
    enabled: !!id,
    staleTime: 60_000,
    retry: false,
  });

  useSeo({
    title: data?.companyName ? `${data.companyName} — Bareter` : "Business — Bareter",
  });

  if (isLoading) return <BusinessStorefrontSkeleton />;

  if (isError || !data) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Business not found</h1>
        <p className="text-muted-foreground mb-6">
          This business profile doesn't exist or is currently unavailable.
        </p>
        <Link href="/browse" className="text-primary text-sm font-medium hover:underline">
          Browse listings
        </Link>
      </div>
    );
  }

  const profile = data as BusinessStorefrontData;
  const isOwner = !!loggedInUser && loggedInUser.id === profile.owner?.id;
  const isVerified = profile.kybStatus === "verified";
  const initials = profile.companyName?.slice(0, 2).toUpperCase() ?? "BZ";
  const hours = profile.businessHours as BusinessHours | null | undefined;

  // Catalog filtering
  const products   = profile.activeListings.filter(l => l.listingType === "business_product");
  const wholesale  = profile.activeListings.filter(l => l.listingType === "business_wholesale");
  const services   = profile.activeListings.filter(l => l.listingType !== "business_product" && l.listingType !== "business_wholesale");
  const tabListings: Record<CatalogTab, any[]> = {
    all: profile.activeListings,
    products,
    wholesale,
    services,
  };
  const visibleListings = tabListings[activeTab];
  const isBizListing = (l: any) => l.listingType === "business_product" || l.listingType === "business_wholesale";

  return (
    <div className="bg-bareter-off-white dark:bg-background min-h-screen">
      {/* ── Cover banner ── */}
      <div className="relative w-full h-44 sm:h-56 bg-bareter-navy overflow-hidden">
        {profile.coverImageUrl ? (
          <img
            src={assetUrl(profile.coverImageUrl)}
            alt={`${profile.companyName} cover`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-bareter-navy via-bareter-navy/90 to-bareter-teal/40" />
        )}
        {/* Back nav sits top-left */}
        <div className="absolute top-4 start-4">
          <BackButton fallback="/browse" label="Browse" variant="overlay" />
        </div>
        {/* Owner: edit button top-right */}
        {isOwner && (
          <div className="absolute top-4 end-4">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs bg-black/20 border-white/30 text-white hover:bg-black/30 hover:text-white backdrop-blur-sm"
              onClick={() => navigate("/settings")}
            >
              <Settings className="h-3.5 w-3.5" />
              Edit business
            </Button>
          </div>
        )}
      </div>

      <div className="container mx-auto max-w-5xl px-4">
        {/* ── Logo overlap ── */}
        <div className="flex items-end gap-4 -mt-10 mb-4">
          <div className="relative flex-shrink-0">
            {profile.logoUrl ? (
              <img
                src={assetUrl(profile.logoUrl)}
                alt={`${profile.companyName} logo`}
                className="h-20 w-20 rounded-xl object-cover ring-4 ring-background shadow-md"
              />
            ) : (
              <div className="h-20 w-20 rounded-xl ring-4 ring-background shadow-md bg-bareter-navy flex items-center justify-center">
                <span className="text-xl font-bold text-white">{initials}</span>
              </div>
            )}
            {isVerified && (
              <span className="absolute -bottom-1 -end-1 h-6 w-6 rounded-full bg-green-500 border-2 border-background flex items-center justify-center shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5 text-white" />
              </span>
            )}
          </div>
        </div>

        {/* ── Business header ── */}
        <div className="space-y-3 pb-5 border-b border-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{profile.companyName}</h1>
                {isVerified && (
                  <Badge variant="outline" className="gap-1 text-xs border-green-300 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                    <ShieldCheck className="h-3 w-3" />
                    Verified business
                  </Badge>
                )}
                {profile.isFeatured && (
                  <Badge className="text-xs bg-bareter-gold text-bareter-navy border-0">Featured</Badge>
                )}
                {!profile.isActive && isOwner && (
                  <Badge variant="outline" className="text-xs border-red-300 text-red-600 bg-red-50">Inactive — not publicly visible</Badge>
                )}
              </div>
              {profile.category && (
                <p className="text-sm text-muted-foreground mt-0.5">{profile.category}</p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {profile.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" />
                {profile.location}
              </span>
            )}
            {profile.websiteDisplay && (
              <span className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 shrink-0" />
                {/* Plain text only — never rendered as <a> */}
                <span>{profile.websiteDisplay}</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Package className="h-4 w-4 shrink-0" />
              {profile.activeListings.length} listing{profile.activeListings.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Description */}
          {profile.description && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {profile.description}
            </p>
          )}

          {/* Business hours */}
          {hours && Object.keys(hours).length > 0 && (
            <HoursPanel hours={hours} />
          )}
        </div>

        {/* ── Catalog tabs ── */}
        <div className="flex items-center gap-1 pt-4 pb-2 overflow-x-auto scrollbar-hide">
          {(["all", "products", "wholesale", "services"] as CatalogTab[]).map(tab => {
            const count = tabListings[tab].length;
            const labels: Record<CatalogTab, string> = { all: "All", products: "Products", wholesale: "Wholesale", services: "Services" };
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-bareter-teal text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                }`}
                data-testid={`tab-catalog-${tab}`}
              >
                {labels[tab]}
                {count > 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0 rounded-full ${
                    activeTab === tab ? "bg-white/20 text-white" : "bg-background text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Listing grid ── */}
        <div className="pb-12 pt-2">
          {visibleListings.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No listings in this category yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleListings.map((listing: any) =>
                isBizListing(listing)
                  ? <BusinessProductCard key={listing.id} listing={listing} />
                  : <BrandListingCard key={listing.id} listing={listing} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
