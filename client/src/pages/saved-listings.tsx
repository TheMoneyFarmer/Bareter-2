import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ListingWithUser } from "@shared/schema";
import {
  Heart,
  MapPin,
  Shield,
  Package,
  ShoppingCart,
  Eye,
  Bookmark,
} from "lucide-react";

type WishlistItem = {
  id: string;
  userId: string;
  listingId: string;
  createdAt: string;
  listing: ListingWithUser;
};

export function SavedListingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wishlistItems, isLoading } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: !!user,
  });

  const removeMutation = useMutation({
    mutationFn: async (listingId: string) => {
      await apiRequest("DELETE", `/api/wishlist/${listingId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: "Removed from saved listings" });
    },
  });

  if (!user) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-4xl text-center">
        <Bookmark className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Saved Listings</h1>
        <p className="text-muted-foreground mb-4">Please log in to view your saved listings.</p>
        <Link href="/login">
          <Button data-testid="button-login">Log In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto max-w-7xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Bookmark className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Saved Listings</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? "Loading..." : `${wishlistItems?.length || 0} saved items`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-0">
                <Skeleton className="h-48 rounded-t-lg" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !wishlistItems || wishlistItems.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Heart className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-2" data-testid="text-empty-state">No saved listings yet</h3>
            <p className="text-muted-foreground mb-4">
              Browse listings and tap the heart icon to save them for later
            </p>
            <Link href="/browse">
              <Button data-testid="button-browse">Browse Listings</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {wishlistItems.map((item) => {
            const listing = item.listing;
            return (
              <Card key={item.id} className="h-full overflow-hidden" data-testid={`card-saved-${listing.id}`}>
                <CardContent className="p-0">
                  <div className="relative">
                    {listing.images && listing.images.length > 0 ? (
                      <div className="relative h-48 bg-muted">
                        <img
                          src={listing.images[0]}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="relative h-48 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                        {listing.type === "offer" ? (
                          <Package className="h-16 w-16 text-primary/30" />
                        ) : (
                          <ShoppingCart className="h-16 w-16 text-primary/30" />
                        )}
                      </div>
                    )}
                    <Badge
                      variant={listing.type === "offer" ? "default" : "secondary"}
                      className="absolute top-3 left-3"
                    >
                      {listing.type === "offer" ? "Offer" : "Request"}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeMutation.mutate(listing.id);
                      }}
                      data-testid={`button-unsave-${listing.id}`}
                    >
                      <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                    </Button>
                  </div>
                  <Link href={`/listings/${listing.id}`}>
                    <div className="p-4 cursor-pointer hover-elevate">
                      <h3 className="font-semibold line-clamp-1 mb-1">{listing.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {listing.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-primary">
                          AED {parseFloat(listing.retailValue as string).toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Eye className="h-3 w-3" />
                          {listing.viewCount || 0}
                        </div>
                      </div>
                    </div>
                  </Link>
                </CardContent>
                <CardFooter className="p-4 pt-0 border-t">
                  <div className="flex items-center gap-2 w-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={listing.user?.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs">
                        {listing.user?.fullName?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium truncate">
                          {listing.user?.fullName}
                        </span>
                        {listing.user?.isVerified && (
                          <Shield className="h-3 w-3 text-primary flex-shrink-0" />
                        )}
                      </div>
                      {listing.location && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{listing.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}