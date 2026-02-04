import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ListingWithUser, Listing } from "@shared/schema";
import {
  MapPin,
  Package,
  ShoppingCart,
  Shield,
  Star,
  Eye,
  Calendar,
  Tag,
  Handshake,
  ArrowLeft,
  Loader2,
  MessageSquare,
  Share2,
  Heart,
  ExternalLink,
} from "lucide-react";

export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [proposeOpen, setProposeOpen] = useState(false);
  const [counterOffer, setCounterOffer] = useState("");
  const [counterValue, setCounterValue] = useState("");

  const { data: listing, isLoading } = useQuery<ListingWithUser>({
    queryKey: ["/api/listings", id],
  });

  const { data: myListings } = useQuery<Listing[]>({
    queryKey: ["/api/listings/user", user?.id],
    enabled: !!user,
  });

  const proposeTradeMutation = useMutation({
    mutationFn: async (data: {
      providerListingId: string;
      seekerOffer: string;
      seekerValue: string;
    }) => {
      const res = await apiRequest("POST", "/api/deals", {
        providerListingId: data.providerListingId,
        seekerOffer: data.seekerOffer,
        seekerValue: data.seekerValue,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({
        title: "Trade proposed!",
        description: "Your trade proposal has been sent. You can chat to negotiate.",
      });
      navigate(`/deals/${data.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to propose trade",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleProposeTrade = () => {
    if (!listing || !counterOffer || !counterValue) return;
    proposeTradeMutation.mutate({
      providerListingId: listing.id,
      seekerOffer: counterOffer,
      seekerValue: counterValue,
    });
  };

  if (isLoading) {
    return (
      <div className="container px-4 py-8 mx-auto max-w-5xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-80 rounded-lg" />
            <Skeleton className="h-32" />
          </div>
          <div>
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold mb-2">Listing not found</h2>
        <p className="text-muted-foreground mb-4">
          This listing may have been removed or doesn't exist.
        </p>
        <Link href="/browse">
          <Button>Browse Listings</Button>
        </Link>
      </div>
    );
  }

  const isOwnListing = user?.id === listing.userId;
  const createdDate = listing.createdAt ? new Date(listing.createdAt).toLocaleDateString() : "N/A";

  return (
    <div className="container px-4 py-8 mx-auto max-w-5xl">
      <Link href="/browse" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to listings
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="relative rounded-lg overflow-hidden bg-muted aspect-video">
            {listing.images && listing.images.length > 0 ? (
              <img
                src={listing.images[0]}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                {listing.type === "offer" ? (
                  <Package className="h-24 w-24 text-primary/30" />
                ) : (
                  <ShoppingCart className="h-24 w-24 text-primary/30" />
                )}
              </div>
            )}
            <Badge
              variant={listing.type === "offer" ? "default" : "secondary"}
              className="absolute top-4 left-4"
            >
              {listing.type === "offer" ? (
                <><Package className="h-3 w-3 mr-1" /> Offer</>
              ) : (
                <><ShoppingCart className="h-3 w-3 mr-1" /> Request</>
              )}
            </Badge>
          </div>

          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-2xl md:text-3xl font-bold">{listing.title}</h1>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" data-testid="button-share">
                  <Share2 className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" data-testid="button-save">
                  <Heart className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
              {listing.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {listing.location}
                </div>
              )}
              <div className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {listing.viewCount || 0} views
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Listed {createdDate}
              </div>
            </div>

            <div className="text-3xl font-bold text-primary mb-6">
              AED {parseFloat(listing.retailValue as string).toLocaleString()}
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {(listing.categories || []).map((category) => (
                <Badge key={category} variant="secondary">
                  {category}
                </Badge>
              ))}
            </div>

            <Separator className="my-6" />

            <div>
              <h3 className="font-semibold mb-3">Description</h3>
              <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                {listing.description}
              </p>
            </div>

            {(listing.tags || []).length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(listing.tags || []).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">About the {listing.type === "offer" ? "Seller" : "Buyer"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={listing.user?.avatarUrl || undefined} />
                  <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                    {listing.user?.fullName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold">{listing.user?.fullName}</span>
                    {listing.user?.isVerified && (
                      <Shield className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  {listing.user?.businessName && (
                    <p className="text-sm text-muted-foreground">{listing.user.businessName}</p>
                  )}
                </div>
              </div>

              {listing.user?.bio && (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                  {listing.user.bio}
                </p>
              )}

              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  <span className="font-medium">4.8</span>
                </div>
                <span className="text-sm text-muted-foreground">(24 reviews)</span>
              </div>

              <Link href={`/users/${listing.userId}`}>
                <Button variant="outline" className="w-full gap-2" data-testid="button-view-profile">
                  View Full Profile
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {!isOwnListing && user && (
            <Dialog open={proposeOpen} onOpenChange={setProposeOpen}>
              <DialogTrigger asChild>
                <Button className="w-full gap-2" size="lg" data-testid="button-propose-trade">
                  <Handshake className="h-5 w-5" />
                  Propose Trade
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Propose a Trade</DialogTitle>
                  <DialogDescription>
                    Tell {listing.user?.fullName} what you can offer in exchange
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">They are offering:</p>
                    <p className="font-medium">{listing.title}</p>
                    <p className="text-sm text-primary font-bold">
                      AED {parseFloat(listing.retailValue as string).toLocaleString()}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="counter-offer">Your Counter-Offer</Label>
                    <Textarea
                      id="counter-offer"
                      placeholder="Describe what you can offer in return..."
                      value={counterOffer}
                      onChange={(e) => setCounterOffer(e.target.value)}
                      className="min-h-[100px] resize-none"
                      data-testid="textarea-counter-offer"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="counter-value">Estimated Value (AED)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        AED
                      </span>
                      <Input
                        id="counter-value"
                        type="number"
                        placeholder="0.00"
                        value={counterValue}
                        onChange={(e) => setCounterValue(e.target.value)}
                        className="pl-14"
                        data-testid="input-counter-value"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setProposeOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleProposeTrade}
                    disabled={!counterOffer || !counterValue || proposeTradeMutation.isPending}
                    data-testid="button-submit-proposal"
                  >
                    {proposeTradeMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Send Proposal
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {!user && (
            <Link href="/login">
              <Button className="w-full gap-2" size="lg">
                <Handshake className="h-5 w-5" />
                Sign in to Trade
              </Button>
            </Link>
          )}

          {isOwnListing && (
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">This is your listing</p>
                <Button variant="outline" className="mt-2 w-full" data-testid="button-edit-listing">
                  Edit Listing
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
