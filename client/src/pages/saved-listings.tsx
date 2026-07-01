import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, assetUrl } from "@/lib/queryClient";
import { Heart, MapPin, ArrowLeftRight, Bookmark } from "lucide-react";

type WishlistEntry = {
  id: string;
  listingId: string;
  userId: string;
  createdAt: string;
  listing: {
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
    isActive: boolean;
  };
};

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

function ListingGrid({
  items,
  onRemove,
  emptyTitle,
  emptyText,
  emptyAction,
}: {
  items: { id: string; title: string; images: string[] | null; retailValue: string | null; location: string | null; categories: string[] | null; type: string }[];
  onRemove: (id: string) => void;
  emptyTitle: string;
  emptyText: string;
  emptyAction?: React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-bareter-border p-12 text-center">
        <Heart className="h-12 w-12 mx-auto mb-4 text-bareter-muted" />
        <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground mb-1">{emptyTitle}</h2>
        <p className="text-sm text-muted-foreground mb-4">{emptyText}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((listing) => (
        <div
          key={listing.id}
          className="group relative bg-white dark:bg-card border border-bareter-border rounded-xl overflow-hidden hover:shadow-bareter-hover transition-shadow"
        >
          <button
            type="button"
            onClick={() => onRemove(listing.id)}
            className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-white/90 dark:bg-card/90 flex items-center justify-center shadow-sm hover:bg-red-50 transition-colors"
            aria-label="Remove"
          >
            <Heart className="h-4 w-4 text-red-500 fill-red-500" />
          </button>

          <Link href={`/listings/${listing.id}`}>
            {listing.images?.[0] ? (
              <img
                src={assetUrl(listing.images[0])}
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
  );
}

export function SavedListingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wishlistItems = [], isLoading: wishlistLoading } = useQuery<WishlistEntry[]>({
    queryKey: ["/api/wishlist"],
    enabled: !!user,
    staleTime: 0,
  });

  const { data: likedListings = [], isLoading: likedLoading } = useQuery<LikedListing[]>({
    queryKey: ["/api/listings/liked"],
    enabled: !!user,
    staleTime: 0,
  });

  const removeWishlistMutation = useMutation({
    mutationFn: (listingId: string) => apiRequest("DELETE", `/api/wishlist/${listingId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: "Removed from saved" });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  const unlikeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/listings/${id}/like`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings/liked"] });
      toast({ title: "Removed from liked" });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  if (!user) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-4xl text-center">
        <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Favorites</h1>
        <p className="text-muted-foreground mb-4">Please log in to view your saved listings.</p>
        <Link href="/login"><Button>Log In</Button></Link>
      </div>
    );
  }

  const isLoading = wishlistLoading || likedLoading;
  const totalSaved = wishlistItems.length + likedListings.length;

  const wishlistMapped = wishlistItems.map((w) => ({ ...w.listing, _wishlistId: w.listingId }));
  const likedMapped = likedListings.map((l) => ({ ...l }));

  return (
    <div className="container px-4 py-8 mx-auto max-w-7xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
          <Heart className="h-5 w-5 text-red-500 fill-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Favorites</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? "Loading..." : `${totalSaved} saved listings`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : (
        <Tabs defaultValue="saved">
          <TabsList className="mb-6">
            <TabsTrigger value="saved" className="gap-2">
              <Bookmark className="h-4 w-4" />
              Saved
              {wishlistItems.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{wishlistItems.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="liked" className="gap-2">
              <Heart className="h-4 w-4" />
              Liked
              {likedListings.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{likedListings.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="saved">
            <ListingGrid
              items={wishlistMapped}
              onRemove={(id) => removeWishlistMutation.mutate(id)}
              emptyTitle="No saved listings yet"
              emptyText="Tap the bookmark icon on any listing while browsing to save it here."
              emptyAction={<Link href="/browse"><Button variant="bareter" size="sm">Browse Listings</Button></Link>}
            />
          </TabsContent>

          <TabsContent value="liked">
            <ListingGrid
              items={likedMapped}
              onRemove={(id) => unlikeMutation.mutate(id)}
              emptyTitle="No liked listings yet"
              emptyText="Tap the heart icon on any listing to like it. Liked listings appear here."
              emptyAction={<Link href="/browse"><Button variant="bareter" size="sm">Browse Listings</Button></Link>}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
