import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import type { ListingWithUser, Listing, ListingCommentWithUser } from "@shared/schema";
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
  ExternalLink,
  ArrowLeftRight,
  Sparkles,
  CheckCircle,
  ClipboardList,
  ThumbsUp,
  Send,
} from "lucide-react";
import type { ExchangeItem } from "@shared/schema";
import { getDeliverablesForCategories, type DeliverableItem } from "@shared/deliverables";
import { ShareMenu } from "@/components/share-menu";

export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const [proposeOpen, setProposeOpen] = useState(searchParams.get("propose") === "true");
  const [counterOffer, setCounterOffer] = useState("");
  const [counterValue, setCounterValue] = useState("");
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>([]);

  const { data: listing, isLoading } = useQuery<ListingWithUser>({
    queryKey: ["/api/listings", id],
  });

  const { data: myListings } = useQuery<Listing[]>({
    queryKey: ["/api/listings/user", user?.id],
    enabled: !!user,
  });

  useEffect(() => {
    if (proposeOpen && listing?.categories) {
      const items = getDeliverablesForCategories(listing.categories as string[]);
      setDeliverables(items);
    }
  }, [proposeOpen, listing]);

  const toggleDeliverable = (index: number) => {
    setDeliverables(prev => prev.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item
    ));
  };

  const proposeTradeMutation = useMutation({
    mutationFn: async (data: {
      providerListingId: string;
      seekerOffer: string;
      seekerValue: string;
      deliverables: DeliverableItem[];
    }) => {
      const res = await apiRequest("POST", "/api/deals", {
        providerListingId: data.providerListingId,
        seekerOffer: data.seekerOffer,
        seekerValue: data.seekerValue,
        deliverables: data.deliverables,
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

  const [commentOfferName, setCommentOfferName] = useState("");
  const [commentOfferValue, setCommentOfferValue] = useState("");
  const [commentMessage, setCommentMessage] = useState("");

  const { data: listingComments } = useQuery<ListingCommentWithUser[]>({
    queryKey: ["/api/listings", id, "comments"],
    enabled: !!id,
  });

  const listingLikeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/listings/${id}/like`);
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/listings", id] });
      const previous = queryClient.getQueryData<any>(["/api/listings", id]);
      if (previous) {
        queryClient.setQueryData(["/api/listings", id], {
          ...previous,
          isLiked: !previous.isLiked,
          likeCount: previous.isLiked ? Math.max(0, (previous.likeCount || 0) - 1) : (previous.likeCount || 0) + 1,
        });
      }
      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["/api/listings", id], context.previous);
      toast({ title: "Error", description: error.message || "Could not update like", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id] });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: { content: string | null; offerItemName: string; offerItemValue: string }) => {
      const res = await apiRequest("POST", `/api/listings/${id}/comments`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id, "comments"] });
      setCommentOfferName("");
      setCommentOfferValue("");
      setCommentMessage("");
      toast({ title: "Proposal posted", description: "Your barter proposal is now visible on this listing." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmitComment = () => {
    if (!commentOfferName || !commentOfferValue) return;
    createCommentMutation.mutate({
      content: commentMessage || null,
      offerItemName: commentOfferName,
      offerItemValue: commentOfferValue,
    });
  };

  const handleProposeTrade = () => {
    if (!listing || !counterOffer || !counterValue) return;
    proposeTradeMutation.mutate({
      providerListingId: listing.id,
      seekerOffer: counterOffer,
      seekerValue: counterValue,
      deliverables,
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
                {user && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={listingLikeMutation.isPending}
                    onClick={() => listingLikeMutation.mutate()}
                    data-testid="button-header-like"
                  >
                    <ThumbsUp className={`h-5 w-5 ${listing.isLiked ? "fill-primary text-primary" : ""}`} />
                  </Button>
                )}
                <ShareMenu
                  url={window.location.href}
                  title={listing.title}
                  size="icon"
                  variant="ghost"
                  data-testid="button-header-share"
                />
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

            {(((listing as any).exchangeItems?.length > 0) || ((listing as any).wantedCategories?.length > 0)) && (
              <div className="mt-6">
                <Separator className="mb-6" />
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ArrowLeftRight className="h-5 w-5 text-primary" />
                      What I Want in Exchange
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {((listing as any).exchangeItems as ExchangeItem[] || []).filter((item: ExchangeItem) => item.isPriority).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5 text-primary">
                          <Star className="h-4 w-4 fill-current" />
                          Priority Items (What I Really Want)
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {((listing as any).exchangeItems as ExchangeItem[] || [])
                            .filter((item: ExchangeItem) => item.isPriority)
                            .map((item: ExchangeItem) => (
                              <Badge key={item.name} className="gap-1">
                                <Star className="h-3 w-3 fill-current" />
                                {item.name}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}

                    {((listing as any).exchangeItems as ExchangeItem[] || []).filter((item: ExchangeItem) => !item.isPriority).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5 text-muted-foreground">
                          <Sparkles className="h-4 w-4" />
                          Also Open To
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {((listing as any).exchangeItems as ExchangeItem[] || [])
                            .filter((item: ExchangeItem) => !item.isPriority)
                            .map((item: ExchangeItem) => (
                              <Badge key={item.name} variant="secondary">
                                {item.name}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}

                    {((listing as any).wantedCategories as string[] || []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 text-muted-foreground">Preferred Categories</h4>
                        <div className="flex flex-wrap gap-2">
                          {((listing as any).wantedCategories as string[] || []).map((category: string) => (
                            <Badge key={category} variant="outline">
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {(listing as any).openToOffers && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>Open to other offers not listed above</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 py-3 border-t border-b" data-testid="listing-engagement-bar">
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                disabled={listingLikeMutation.isPending}
                onClick={() => listingLikeMutation.mutate()}
                data-testid="button-like-listing"
              >
                <ThumbsUp className={`h-4 w-4 ${listing.isLiked ? "fill-primary text-primary" : ""}`} />
                <span>{listing.likeCount || 0} likes</span>
              </Button>
            )}
            {!user && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ThumbsUp className="h-4 w-4" />
                <span>{listing.likeCount || 0} likes</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span>{listing.commentCount || 0} proposals</span>
            </div>
            <ShareMenu
              url={window.location.href}
              title={listing.title}
              showLabel
              data-testid="button-share-listing"
            />
          </div>

          <Card id="comments" data-testid="listing-comments-section">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Barter Proposals ({listingComments?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {user && !isOwnListing && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">What you offer</Label>
                      <Input
                        placeholder="e.g. Website design"
                        value={commentOfferName}
                        onChange={(e) => setCommentOfferName(e.target.value)}
                        data-testid="input-comment-offer-name"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Estimated value (AED)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={commentOfferValue}
                        onChange={(e) => setCommentOfferValue(e.target.value)}
                        data-testid="input-comment-offer-value"
                      />
                    </div>
                  </div>
                  <Textarea
                    placeholder="Add a message (optional)"
                    value={commentMessage}
                    onChange={(e) => setCommentMessage(e.target.value)}
                    rows={2}
                    data-testid="input-comment-message"
                  />
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={!commentOfferName || !commentOfferValue || createCommentMutation.isPending}
                    onClick={handleSubmitComment}
                    data-testid="button-submit-comment"
                  >
                    {createCommentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Post Proposal
                  </Button>
                </div>
              )}

              {listingComments?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No barter proposals yet. Be the first to propose!</p>
              )}

              {listingComments?.map((comment) => (
                <div key={comment.id} className="flex gap-3 py-3 border-b last:border-0" data-testid={`comment-${comment.id}`}>
                  <Link href={`/users/${comment.userId}`}>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={comment.user?.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs">{comment.user?.fullName?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link href={`/users/${comment.userId}`}>
                        <span className="text-sm font-medium hover:underline">{comment.user?.fullName}</span>
                      </Link>
                      {comment.user?.isVerified && <Shield className="h-3 w-3 text-primary" />}
                      <span className="text-xs text-muted-foreground">
                        {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs">
                        <ArrowLeftRight className="h-3 w-3 mr-1" />
                        {comment.offerItemName} — AED {parseFloat(comment.offerItemValue).toLocaleString()}
                      </Badge>
                    </div>
                    {comment.content && <p className="text-sm text-muted-foreground">{comment.content}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
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
              <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Propose a Trade</DialogTitle>
                  <DialogDescription>
                    Tell {listing.user?.fullName} what you can offer in exchange
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 pr-4">
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

                    {deliverables.length > 0 && (
                      <div className="space-y-3" data-testid="deliverables-checklist">
                        <Separator />
                        <div>
                          <Label className="flex items-center gap-2 mb-1">
                            <ClipboardList className="h-4 w-4 text-primary" />
                            Deliverables Checklist
                          </Label>
                          <p className="text-xs text-muted-foreground mb-3">
                            Suggested deliverables based on the listing category. Check or uncheck items to customize.
                          </p>
                        </div>
                        <div className="space-y-2.5 rounded-lg border p-3">
                          {deliverables.map((item, index) => (
                            <div key={index} className="flex items-start gap-2.5">
                              <Checkbox
                                id={`deliverable-${index}`}
                                checked={item.checked}
                                onCheckedChange={() => toggleDeliverable(index)}
                                data-testid={`checkbox-deliverable-${index}`}
                              />
                              <label
                                htmlFor={`deliverable-${index}`}
                                className={`text-sm leading-tight cursor-pointer ${
                                  item.checked ? "text-foreground" : "text-muted-foreground line-through"
                                }`}
                              >
                                {item.label}
                              </label>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {deliverables.filter(d => d.checked).length} of {deliverables.length} items selected
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
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
