import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORIES, LOCATIONS, ITEM_CONDITIONS, type ListingWithUser, type PostWithUser } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Search,
  Filter,
  MapPin,
  ArrowUpDown,
  Shield,
  Package,
  ShoppingCart,
  Eye,
  Sparkles,
  X,
  ArrowLeftRight,
  Star,
  Heart,
  TrendingUp,
  Users,
  Zap,
  Crown,
  Clock,
  CheckCircle2,
  MessageCircle,
  Building2,
  Shirt,
  Camera as CameraIcon,
  Monitor,
  Wrench,
  UtensilsCrossed,
  Scale,
  CalendarDays,
  Building,
  Car,
  HeartPulse,
  GraduationCap,
  Megaphone,
  Cpu,
  Lightbulb,
  Palette,
  Music,
  ThumbsUp,
  MessageSquare,
  Handshake,
} from "lucide-react";
import type { ExchangeItem } from "@shared/schema";
import { ShareMenu } from "@/components/share-menu";

type ExploreTab = "discover" | "search";

export function BrowsePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ExploreTab>("discover");
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [selectedCondition, setSelectedCondition] = useState<string>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [valueRange, setValueRange] = useState([0, 100000]);
  const [sortBy, setSortBy] = useState<string>("newest");

  const { data: listings, isLoading } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings"],
  });

  const { data: trendingPosts } = useQuery<PostWithUser[]>({
    queryKey: ["/api/posts/trending"],
  });

  const { data: featuredListings } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings/featured"],
  });

  const { data: recommendedUsers } = useQuery<any[]>({
    queryKey: ["/api/recommendations/users"],
    enabled: !!user,
  });

  const { data: categoryStats } = useQuery<Array<{ category: string; count: number }>>({
    queryKey: ["/api/explore/stats"],
  });

  const { data: wishlistItems } = useQuery<Array<{ listingId: string }>>({
    queryKey: ["/api/wishlist"],
    enabled: !!user,
  });

  const currentWishlistedIds = new Set(wishlistItems?.map(w => w.listingId) || []);

  const toggleWishlistMutation = useMutation({
    mutationFn: async ({ listingId, isWishlisted }: { listingId: string; isWishlisted: boolean }) => {
      if (isWishlisted) {
        await apiRequest("DELETE", `/api/wishlist/${listingId}`);
      } else {
        await apiRequest("POST", `/api/wishlist/${listingId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendInquiryMutation = useMutation({
    mutationFn: async ({ toUserId, listingId }: { toUserId: string; listingId: string }) => {
      await apiRequest("POST", "/api/inquiries", { toUserId, listingId });
    },
    onSuccess: () => {
      toast({ title: "Sent!", description: "Your inquiry has been sent to the seller." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const listingLikeMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/like`);
      return res.json();
    },
    onMutate: async (listingId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/listings"] });
      const previous = queryClient.getQueryData<any[]>(["/api/listings"]);
      queryClient.setQueryData<any[]>(["/api/listings"], (old) =>
        old?.map(l => l.id === listingId ? { ...l, isLiked: !l.isLiked, likeCount: l.isLiked ? Math.max(0, (l.likeCount || 0) - 1) : (l.likeCount || 0) + 1 } : l)
      );
      return { previous };
    },
    onError: (error: any, _listingId, context) => {
      if (context?.previous) queryClient.setQueryData(["/api/listings"], context.previous);
      toast({ title: "Error", description: error.message || "Could not update like", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
    },
  });

  const filteredListings = listings?.filter((listing) => {
    if (search) {
      const searchLower = search.toLowerCase();
      if (
        !listing.title.toLowerCase().includes(searchLower) &&
        !listing.description.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }
    if (selectedType !== "all" && listing.type !== selectedType) return false;
    if (selectedCategories.length > 0) {
      const hasCategory = (listing.categories || []).some((c) =>
        selectedCategories.includes(c)
      );
      if (!hasCategory) return false;
    }
    if (selectedLocation !== "all" && listing.location !== selectedLocation) return false;
    if (selectedCondition !== "all" && listing.condition !== selectedCondition) return false;
    if (verifiedOnly && !listing.user?.isVerified) return false;
    const value = parseFloat(listing.retailValue as string);
    if (value < valueRange[0] || value > valueRange[1]) return false;
    return true;
  });

  const sortedListings = [...(filteredListings || [])].sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case "oldest":
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      case "value-high":
        return parseFloat(b.retailValue as string) - parseFloat(a.retailValue as string);
      case "value-low":
        return parseFloat(a.retailValue as string) - parseFloat(b.retailValue as string);
      case "popular":
        return (b.viewCount || 0) - (a.viewCount || 0);
      default:
        return 0;
    }
  });

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedType("all");
    setSelectedCategories([]);
    setSelectedLocation("all");
    setSelectedCondition("all");
    setVerifiedOnly(false);
    setValueRange([0, 100000]);
  };

  const hasActiveFilters =
    search ||
    selectedType !== "all" ||
    selectedCategories.length > 0 ||
    selectedLocation !== "all" ||
    selectedCondition !== "all" ||
    verifiedOnly ||
    valueRange[0] > 0 ||
    valueRange[1] < 100000;

  const conditionLabel = (c: string) => {
    const labels: Record<string, string> = {
      new: "New",
      like_new: "Like New",
      excellent: "Excellent",
      good: "Good",
      fair: "Fair",
      refurbished: "Refurbished",
    };
    return labels[c] || c;
  };

  const categoryIconMap: Record<string, typeof Package> = {
    Hospitality: Building2,
    Fashion: Shirt,
    Modeling: CameraIcon,
    SaaS: Monitor,
    Photography: CameraIcon,
    Services: Wrench,
    Food: UtensilsCrossed,
    Legal: Scale,
    Events: CalendarDays,
    "Real Estate": Building,
    Automotive: Car,
    "Health & Wellness": HeartPulse,
    Education: GraduationCap,
    Marketing: Megaphone,
    Technology: Cpu,
    Consulting: Lightbulb,
    Design: Palette,
    Entertainment: Music,
  };

  const ListingCard = ({ listing }: { listing: ListingWithUser }) => {
    const isWishlisted = currentWishlistedIds.has(listing.id);
    return (
      <Link href={`/listings/${listing.id}`}>
        <Card className="h-full hover-elevate cursor-pointer overflow-hidden" data-testid={`card-listing-${listing.id}`}>
          <CardContent className="p-0">
            {listing.images && listing.images.length > 0 ? (
              <div className="relative h-48 bg-muted">
                <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover" />
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <Badge variant={listing.type === "offer" ? "default" : "secondary"}>
                    {listing.type === "offer" ? <><Package className="h-3 w-3 mr-1" /> Offer</> : <><ShoppingCart className="h-3 w-3 mr-1" /> Request</>}
                  </Badge>
                  {listing.isFeatured && (
                    <Badge className="bg-amber-500 text-white">
                      <Crown className="h-3 w-3 mr-1" /> Featured
                    </Badge>
                  )}
                </div>
                {listing.condition && listing.condition !== "like_new" && (
                  <Badge variant="outline" className="absolute bottom-3 left-3 bg-background/80 backdrop-blur-sm text-[10px]">
                    {conditionLabel(listing.condition)}
                  </Badge>
                )}
                {user && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-3 right-3 rounded-full bg-background/80 backdrop-blur-sm"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlistMutation.mutate({ listingId: listing.id, isWishlisted }); }}
                    data-testid={`button-wishlist-${listing.id}`}
                  >
                    <Heart className={`h-4 w-4 ${isWishlisted ? "fill-destructive text-destructive" : "text-muted-foreground"}`} />
                  </Button>
                )}
              </div>
            ) : (
              <div className="relative h-48 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                {listing.type === "offer" ? <Package className="h-16 w-16 text-primary/30" /> : <ShoppingCart className="h-16 w-16 text-primary/30" />}
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <Badge variant={listing.type === "offer" ? "default" : "secondary"}>
                    {listing.type === "offer" ? "Offer" : "Request"}
                  </Badge>
                  {listing.isFeatured && <Badge className="bg-amber-500 text-white"><Crown className="h-3 w-3 mr-1" /> Featured</Badge>}
                </div>
                {user && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-3 right-3 rounded-full bg-background/80 backdrop-blur-sm"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlistMutation.mutate({ listingId: listing.id, isWishlisted }); }}
                    data-testid={`button-wishlist-${listing.id}`}
                  >
                    <Heart className={`h-4 w-4 ${isWishlisted ? "fill-destructive text-destructive" : "text-muted-foreground"}`} />
                  </Button>
                )}
              </div>
            )}
            <div className="p-4">
              <h3 className="font-semibold line-clamp-1 mb-1">{listing.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{listing.description}</p>
              {((listing as any).exchangeItems?.length > 0 || (listing as any).wantedCategories?.length > 0) && (
                <div className="mb-3 p-2 rounded-md bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-1 text-xs text-primary mb-1.5">
                    <ArrowLeftRight className="h-3 w-3" />
                    <span className="font-medium">Wants in exchange:</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {((listing as any).exchangeItems as ExchangeItem[] || []).filter((item: ExchangeItem) => item.isPriority).slice(0, 2).map((item: ExchangeItem) => (
                      <Badge key={item.name} variant="default" className="text-[10px] px-1.5 py-0 gap-0.5"><Star className="h-2 w-2 fill-current" />{item.name}</Badge>
                    ))}
                    {((listing as any).exchangeItems as ExchangeItem[] || []).filter((item: ExchangeItem) => !item.isPriority).slice(0, 2).map((item: ExchangeItem) => (
                      <Badge key={item.name} variant="secondary" className="text-[10px] px-1.5 py-0">{item.name}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-lg font-bold text-primary">AED {parseFloat(listing.retailValue as string).toLocaleString()}</span>
                <div className="flex items-center gap-2">
                  {user && listing.userId !== user.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); sendInquiryMutation.mutate({ toUserId: listing.userId, listingId: listing.id }); }}
                      data-testid={`button-inquiry-${listing.id}`}
                    >
                      <MessageCircle className="h-3 w-3 mr-1" />
                      Available?
                    </Button>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Eye className="h-3 w-3" />{listing.viewCount || 0}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
          <div className="px-4 py-2 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              {user && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1 text-xs"
                  disabled={listingLikeMutation.isPending}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); listingLikeMutation.mutate(listing.id); }}
                  data-testid={`button-like-listing-${listing.id}`}
                >
                  <ThumbsUp className={`h-3.5 w-3.5 ${(listing as any).isLiked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  <span>{listing.likeCount || 0}</span>
                </Button>
              )}
              {!user && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground px-2">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  <span>{listing.likeCount || 0}</span>
                </div>
              )}
              <Link href={`/listings/${listing.id}#comments`}>
                <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={(e) => e.stopPropagation()} data-testid={`button-comments-listing-${listing.id}`}>
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{(listing as any).commentCount || 0}</span>
                </Button>
              </Link>
              <ShareMenu
                url={`${window.location.origin}/listings/${listing.id}`}
                title={listing.title}
                size="sm"
                className="h-7 px-2 text-xs"
                data-testid={`button-share-listing-${listing.id}`}
              />
            </div>
            {user && listing.userId !== user.id && (
              <Link href={`/listings/${listing.id}`}>
                <Button
                  size="sm"
                  className="h-7 px-2 gap-1 text-xs"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-propose-barter-${listing.id}`}
                >
                  <Handshake className="h-3.5 w-3.5" />
                  Propose Barter
                </Button>
              </Link>
            )}
          </div>
          <CardFooter className="p-4 pt-0 flex-wrap gap-2">
            <div className="flex items-center gap-2 w-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={listing.user?.avatarUrl || undefined} />
                <AvatarFallback className="text-xs">{listing.user?.fullName?.charAt(0) || "U"}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium truncate">{listing.user?.fullName}</span>
                  {listing.user?.isVerified && <Shield className="h-3 w-3 text-primary flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {listing.location && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{listing.location}</span>}
                  {listing.user?.avgResponseTime ? (
                    <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{listing.user.avgResponseTime < 60 ? `${listing.user.avgResponseTime}m` : `${Math.round(listing.user.avgResponseTime / 60)}h`}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </CardFooter>
        </Card>
      </Link>
    );
  };

  const FilterContent = () => (
    <div className="space-y-6">
      <div>
        <h4 className="font-medium mb-3">Type</h4>
        <div className="flex gap-2 flex-wrap">
          <Button variant={selectedType === "all" ? "default" : "outline"} size="sm" onClick={() => setSelectedType("all")} data-testid="filter-type-all">All</Button>
          <Button variant={selectedType === "offer" ? "default" : "outline"} size="sm" onClick={() => setSelectedType("offer")} className="gap-1" data-testid="filter-type-offer"><Package className="h-3 w-3" />Offers</Button>
          <Button variant={selectedType === "request" ? "default" : "outline"} size="sm" onClick={() => setSelectedType("request")} className="gap-1" data-testid="filter-type-request"><ShoppingCart className="h-3 w-3" />Requests</Button>
        </div>
      </div>
      <div>
        <h4 className="font-medium mb-3">Condition</h4>
        <Select value={selectedCondition} onValueChange={setSelectedCondition}>
          <SelectTrigger data-testid="filter-condition">
            <SelectValue placeholder="Any condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Condition</SelectItem>
            {ITEM_CONDITIONS.map((c) => (
              <SelectItem key={c} value={c}>{conditionLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <h4 className="font-medium mb-3">Categories</h4>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Badge key={category} variant={selectedCategories.includes(category) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleCategory(category)} data-testid={`filter-category-${category.toLowerCase()}`}>
              {category}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <h4 className="font-medium mb-3">Location</h4>
        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
          <SelectTrigger data-testid="filter-location">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {LOCATIONS.map((location) => (<SelectItem key={location} value={location}>{location}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <h4 className="font-medium mb-3">Value Range (AED)</h4>
        <div className="px-2">
          <Slider value={valueRange} onValueChange={setValueRange} max={100000} step={1000} className="mb-2" data-testid="filter-value-range" />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>AED {valueRange[0].toLocaleString()}</span>
            <span>AED {valueRange[1].toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="verified" checked={verifiedOnly} onCheckedChange={(checked) => setVerifiedOnly(checked as boolean)} data-testid="filter-verified" />
        <label htmlFor="verified" className="text-sm font-medium cursor-pointer flex items-center gap-1">
          <Shield className="h-4 w-4 text-primary" />Verified users only
        </label>
      </div>
      {hasActiveFilters && (
        <Button variant="outline" onClick={clearFilters} className="w-full" data-testid="button-clear-filters"><X className="h-4 w-4 mr-2" />Clear All Filters</Button>
      )}
    </div>
  );

  return (
    <div className="container px-2 sm:px-4 py-4 sm:py-8 mx-auto max-w-7xl">
      <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide">
        <Button
          variant={activeTab === "discover" ? "default" : "outline"}
          onClick={() => setActiveTab("discover")}
          className="gap-2 flex-shrink-0"
          data-testid="tab-discover"
        >
          <Sparkles className="h-4 w-4" />
          Discover
        </Button>
        <Button
          variant={activeTab === "search" ? "default" : "outline"}
          onClick={() => setActiveTab("search")}
          className="gap-2 flex-shrink-0"
          data-testid="tab-search"
        >
          <Search className="h-4 w-4" />
          Search & Filter
        </Button>
      </div>

      {activeTab === "discover" ? (
        <div className="space-y-8">
          {featuredListings && featuredListings.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Crown className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-semibold" data-testid="text-featured-title">Featured Listings</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {featuredListings.slice(0, 3).map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            </section>
          )}

          {trendingPosts && trendingPosts.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold" data-testid="text-trending-title">Trending Posts</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {trendingPosts.slice(0, 6).map((post) => (
                  <Link key={post.id} href={`/feed`}>
                    <Card className="hover-elevate cursor-pointer overflow-hidden" data-testid={`card-trending-${post.id}`}>
                      <CardContent className="p-0">
                        {post.mediaUrls && post.mediaUrls.length > 0 ? (
                          <div className="relative h-32 bg-muted">
                            <img src={post.mediaUrls[0]} alt={post.title || ""} className="w-full h-full object-cover" />
                            <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
                              <TrendingUp className="h-3 w-3 mr-1" />{post.likeCount || 0} likes
                            </Badge>
                          </div>
                        ) : (
                          <div className="h-32 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                            <Zap className="h-8 w-8 text-primary/30" />
                          </div>
                        )}
                        <div className="p-3">
                          <h4 className="font-medium text-sm line-clamp-1">{post.title || post.caption}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={post.user?.avatarUrl || undefined} />
                              <AvatarFallback className="text-[8px]">{post.user?.fullName?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground truncate">{post.user?.fullName}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold" data-testid="text-categories-title">Browse by Category</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {CATEGORIES.map((cat) => {
                const count = categoryStats?.find(s => (s.category as any) === cat)?.count || 0;
                const CatIcon = categoryIconMap[cat] || Package;
                return (
                  <Card
                    key={cat}
                    className="hover-elevate cursor-pointer"
                    onClick={() => { setSelectedCategories([cat]); setActiveTab("search"); }}
                    data-testid={`card-category-${cat.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <CardContent className="p-3 text-center">
                      <div className="flex justify-center mb-1">
                        <CatIcon className="h-6 w-6 text-primary" />
                      </div>
                      <h4 className="text-xs font-medium line-clamp-1">{cat}</h4>
                      <span className="text-[10px] text-muted-foreground">{Number(count)} listings</span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {user && recommendedUsers && recommendedUsers.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold" data-testid="text-recommended-title">Businesses to Barter With</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedUsers.slice(0, 6).map((recUser: any) => (
                  <Link key={recUser.id} href={`/profile/${recUser.id}`}>
                    <Card className="hover-elevate cursor-pointer" data-testid={`card-recommended-${recUser.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={recUser.avatarUrl || undefined} />
                            <AvatarFallback>{recUser.fullName?.charAt(0) || "U"}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-medium truncate">{recUser.fullName}</span>
                              {recUser.isVerified && <Shield className="h-3 w-3 text-primary flex-shrink-0" />}
                            </div>
                            {recUser.businessName && <p className="text-xs text-muted-foreground truncate">{recUser.businessName}</p>}
                            <div className="flex items-center gap-2 mt-1">
                              {recUser.credibilityScore > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{recUser.credibilityScore}
                                </Badge>
                              )}
                              {recUser.totalCompletedDeals > 0 && (
                                <span className="text-[10px] text-muted-foreground">{recUser.totalCompletedDeals} deals</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold" data-testid="text-latest-title">Latest Listings</h2>
              </div>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("search")} data-testid="button-view-all">
                View All
              </Button>
            </div>
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}><CardContent className="p-0"><Skeleton className="h-48 rounded-t-md" /><div className="p-4 space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></CardContent></Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(listings || []).slice(0, 6).map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search listings..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[180px]" data-testid="select-sort">
                  <ArrowUpDown className="h-4 w-4 mr-2" /><SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="value-high">Highest Value</SelectItem>
                  <SelectItem value="value-low">Lowest Value</SelectItem>
                  <SelectItem value="popular">Most Popular</SelectItem>
                </SelectContent>
              </Select>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="md:hidden" data-testid="button-filters-mobile">
                    <Filter className="h-4 w-4 mr-2" />Filters
                    {hasActiveFilters && <Badge variant="secondary" className="ml-2">{selectedCategories.length + (verifiedOnly ? 1 : 0)}</Badge>}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80">
                  <SheetHeader className="mb-6"><SheetTitle>Filters</SheetTitle></SheetHeader>
                  <FilterContent />
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <div className="flex gap-8">
            <aside className="hidden md:block w-64 flex-shrink-0">
              <Card><CardContent className="p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2"><Filter className="h-4 w-4" />Filters</h3>
                <FilterContent />
              </CardContent></Card>
            </aside>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <p className="text-muted-foreground">
                  {isLoading ? "Loading..." : <><span className="font-medium text-foreground">{sortedListings.length}</span> listings found</>}
                </p>
                <Link href="/create-listing">
                  <Button className="gap-2" data-testid="button-create-listing"><Sparkles className="h-4 w-4" />Create Listing</Button>
                </Link>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <Card key={i}><CardContent className="p-0"><Skeleton className="h-48 rounded-t-md" /><div className="p-4 space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-full" /></div></CardContent></Card>
                  ))}
                </div>
              ) : sortedListings.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4"><Search className="h-8 w-8 text-muted-foreground" /></div>
                    <h3 className="font-semibold text-lg mb-2">No listings found</h3>
                    <p className="text-muted-foreground mb-4">Try adjusting your filters or search terms</p>
                    <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedListings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
