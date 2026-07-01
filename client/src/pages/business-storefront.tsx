import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  MapPin,
  ShieldCheck,
  ArrowLeft,
  Package,
  Clock,
} from "lucide-react";
import { Link } from "wouter";
import { API_BASE, assetUrl } from "@/lib/queryClient";
import { ListingCard as BrandListingCard } from "@/components/ListingCard";
import { useSeo } from "@/hooks/use-seo";

interface BusinessStorefrontData {
  id: string;
  companyName: string;
  category?: string | null;
  kybStatus: string;
  kybVerifiedAt?: string | null;
  createdAt: string;
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

function BusinessStorefrontSkeleton() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-8">
      <Skeleton className="h-5 w-24" />
      <div className="flex items-start gap-5">
        <Skeleton className="h-16 w-16 rounded-xl flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function BusinessStorefrontPage() {
  const { id } = useParams<{ id: string }>();

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
        <p className="text-muted-foreground mb-6">This business profile doesn't exist or has been removed.</p>
        <Link href="/browse" className="text-primary text-sm font-medium hover:underline">
          Browse listings
        </Link>
      </div>
    );
  }

  const { companyName, category, kybStatus, createdAt, owner, activeListings } = data as BusinessStorefrontData;
  const isVerified = kybStatus === "verified";
  const initials = companyName?.slice(0, 2).toUpperCase() ?? "BZ";
  const joinedYear = createdAt ? new Date(createdAt).getFullYear() : null;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-8">
      {/* Back navigation */}
      <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Browse businesses
      </Link>

      {/* Company header */}
      <Card className="bareter-card">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Company logo placeholder */}
            <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-bareter-navy/10 flex items-center justify-center">
              <span className="text-lg font-bold text-bareter-navy">{initials}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-foreground">{companyName}</h1>
                {isVerified && (
                  <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0" />
                )}
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <Badge
                  variant="outline"
                  className={`gap-1 text-xs ${
                    isVerified
                      ? "border-green-300 text-green-700 bg-green-50"
                      : "border-amber-300 text-amber-700 bg-amber-50"
                  }`}
                >
                  <Building2 className="h-3 w-3" />
                  {isVerified ? "Verified business" : "Business"}
                </Badge>
                {category && (
                  <Badge variant="secondary" className="text-xs">{category}</Badge>
                )}
              </div>

              {owner && (
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={assetUrl(owner.avatarUrl)} alt={owner.fullName} />
                    <AvatarFallback className="text-[10px] bg-muted">
                      {owner.fullName?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground">
                    {owner.fullName}
                  </span>
                  {(owner.city || owner.country) && (
                    <span className="flex items-center gap-0.5 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {[owner.city, owner.country].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
              )}

              {joinedYear && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                  <Clock className="h-3 w-3" />
                  On Bareter since {joinedYear}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active listings */}
      {activeListings.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            Listings ({activeListings.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(activeListings as any[]).map((listing) => (
              <BrandListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </section>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No active listings yet.</p>
        </div>
      )}
    </div>
  );
}
