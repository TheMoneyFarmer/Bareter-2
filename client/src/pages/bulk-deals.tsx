import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Package, Users, ArrowRightLeft } from "lucide-react";

interface BulkListing {
  id: number;
  title: string;
  description: string;
  categories: string[];
  retailValue: number;
  bulkQuantity: number;
  bulkUnit: string;
  bulkMinOrder: number;
  bulkMaxPartners: number;
  location: string;
  country: string;
  city: string;
  type: string;
  images: string[];
  createdAt: string;
  userId: number;
  userName: string;
  userEmail: string;
}

interface BulkDealsResponse {
  listings: BulkListing[];
  total: number;
  page: number;
  limit: number;
}

function BulkListingCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/3" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
    </Card>
  );
}

export function BulkDealsPage() {
  const { data, isLoading } = useQuery<BulkDealsResponse>({
    queryKey: ["/api/listings/bulk"],
  });

  const listings = data?.listings ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="bg-gradient-to-br from-bareter-teal to-emerald-700 text-white">
        <div className="container mx-auto max-w-7xl px-4 py-14">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
                B2B Bulk Trade Board
              </h1>
              <p className="text-emerald-100 text-lg">
                High-volume barter opportunities for businesses
              </p>
              {!isLoading && (
                <p className="text-emerald-200 text-sm mt-2">
                  {total} bulk {total === 1 ? "listing" : "listings"} available
                </p>
              )}
            </div>
            <Link href="/create-listing">
              <Button
                size="lg"
                className="bg-white text-bareter-teal hover:bg-emerald-50 font-semibold shadow-md"
              >
                <Package className="w-4 h-4 mr-2" />
                List a Bulk Deal
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto max-w-7xl px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <BulkListingCardSkeleton key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <ArrowRightLeft className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              No bulk deals yet
            </h2>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Be the first to post a high-volume barter opportunity for other businesses.
            </p>
            <Link href="/create-listing">
              <Button className="bg-bareter-teal hover:bg-bareter-teal/90">
                List a Bulk Deal
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <Link href={`/listings/${listing.id}`} key={listing.id}>
                <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base leading-snug line-clamp-2">
                      {listing.title}
                    </CardTitle>
                    <p className="text-xl font-bold text-bareter-teal">
                      AED {listing.retailValue.toLocaleString()}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {listing.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {listing.description}
                      </p>
                    )}

                    {/* Quantity & min order */}
                    <div className="flex flex-wrap gap-3 text-sm">
                      {listing.bulkQuantity && listing.bulkUnit && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Package className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {listing.bulkQuantity.toLocaleString()} {listing.bulkUnit}
                          </span>
                        </div>
                      )}
                      {listing.bulkMinOrder && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          <span>Min {listing.bulkMinOrder.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Location */}
                    {(listing.city || listing.country) && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {[listing.city, listing.country].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    )}

                    {/* Categories */}
                    {listing.categories && listing.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {listing.categories.slice(0, 3).map((cat) => (
                          <Badge
                            key={cat}
                            variant="secondary"
                            className="text-xs"
                          >
                            {cat}
                          </Badge>
                        ))}
                        {listing.categories.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{listing.categories.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Seller */}
                    {listing.userName && (
                      <p className="text-xs text-muted-foreground border-t pt-2">
                        By <span className="font-medium text-foreground">{listing.userName}</span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
