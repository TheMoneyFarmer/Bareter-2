import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Heart, MapPin, ArrowLeftRight } from "lucide-react";

type LikedListing = {
  id: string;
  title: string;
  description: string | null;
  categories: string[] | null;
  type: string;
  images: string[] | null;
  retailValue: string | null;
  location: string | null;
  condition: string | null;
  likeCount: number;
  isLiked: boolean;
  createdAt: string;
  likedAt: string;
};

export function SavedListingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: likedListings, isLoading } = useQuery<LikedListing[]>({
    queryKey: ["/api/listings/liked"],
    enabled: !!user,
  });

  const unlikeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/listings/${id}/like`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings/liked"] });
      toast({ title: "Removed from Favorites" });
    },
    onError: () => {
      toast({ title: "Failed to remove", variant: "destructive" });
    },
  });

  if (!user) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-4xl text-center">
        <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Favorites</h1>
        <p className="text-muted-foreground mb-4">Please log in to view your liked listings.</p>
        <Link href="/login">
          <Button>Log In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto max-w-7xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
          <Heart className="h-5 w-5 text-red-500 fill-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Favorites</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? "Loading..." : `${likedListings?.length || 0} saved listings`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : !likedListings || likedListings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-bareter-border p-12 text-center">
          <Heart className="h-12 w-12 mx-auto mb-4 text-bareter-muted" />
          <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground mb-1">
            No favorites yet
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Tap the heart icon on any listing while browsing to save it here.
          </p>
          <Link href="/browse">
            <Button variant="bareter" size="sm">Browse Listings</Button>
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {likedListings.map((listing) => (
            <div
              key={listing.id}
              className="group relative bg-white dark:bg-card border border-bareter-border rounded-xl overflow-hidden hover:shadow-bareter-hover transition-shadow"
            >
              {/* Unlike button */}
              <button
                type="button"
                onClick={() => unlikeMutation.mutate(listing.id)}
                className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-white/90 dark:bg-card/90 flex items-center justify-center shadow-sm hover:bg-red-50 transition-colors"
                aria-label="Remove from favorites"
              >
                <Heart className="h-4 w-4 text-red-500 fill-red-500" />
              </button>

              <Link href={`/listings/${listing.id}`}>
                {listing.images?.[0] ? (
                  <img
                    src={listing.images[0]}
                    alt={listing.title}
                    className="w-full h-44 object-cover group-hover:scale-[1.02] transition-transform"
                  />
                ) : (
                  <div className="w-full h-44 bg-bareter-off-white flex items-center justify-center">
                    <ArrowLeftRight className="h-8 w-8 text-bareter-muted" />
                  </div>
                )}

                <div className="p-3">
                  <p className="font-semibold text-bareter-navy dark:text-foreground text-sm line-clamp-2 mb-1">
                    {listing.title}
                  </p>
                  {listing.retailValue && (
                    <p className="text-bareter-teal font-bold text-sm">
                      AED {Number(listing.retailValue).toLocaleString()}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {listing.location && (
                      <span className="flex items-center gap-0.5 text-[11px] text-bareter-muted">
                        <MapPin className="h-3 w-3" />
                        {listing.location}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 h-4 ms-auto">
                      {listing.categories?.[0] ?? listing.type}
                    </Badge>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
