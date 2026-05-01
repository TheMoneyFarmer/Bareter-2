import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { ListingCard as BrandListingCard } from "@/components/ListingCard";
import { StaggeredReveal } from "@/components/StaggeredReveal";
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
import { useActiveLocation, locationParams } from "@/lib/active-location";
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
  ArrowRightLeft,
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
  MessageSquare,
  Handshake,
  AlertTriangle,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { VerifiedBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import { timeAgo, formatValue } from "@/lib/utils";
import type { ListingCommentWithUser } from "@shared/schema";
import type { ExchangeItem } from "@shared/schema";
import { ShareMenu } from "@/components/share-menu";

type ExploreTab = "discover" | "search";

export function BrowsePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchString = useSearch();
  const initialParams = new URLSearchParams(searchString);
  const initialQ = initialParams.get("q") || "";
  const initialCategory = initialParams.get("category") || "";
  const initialLocationParam = initialParams.get("location") || "";

  const [activeTab, setActiveTab] = useState<ExploreTab>(
    initialQ || initialCategory || initialLocationParam ? "search" : "discover"
  );
  const [search, setSearch] = useState(initialQ);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialCategory ? [initialCategory] : []
  );
  const [selectedLocation, setSelectedLocation] = useState<string>(
    initialLocationParam || "all"
  );
  const [selectedCondition, setSelectedCondition] = useState<string>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [valueRange, setValueRange] = useState([0, 100000]);
  const [sortBy, setSortBy] = useState<string>("newest");

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const q = params.get("q") || "";
    const cat = params.get("category") || "";
    const loc = params.get("location") || "";
    if (q || cat || loc) {
      setSearch(q);
      if (cat) setSelectedCategories([cat]);
      if (loc) setSelectedLocation(loc);
      setActiveTab("search");
    }
  }, [searchString]);

  const [openProposalForms, setOpenProposalForms] = useState<Record<string, boolean>>({});
  const [proposalOfferName, setProposalOfferName] = useState<Record<string, string>>({});
  const [proposalOfferValue, setProposalOfferValue] = useState<Record<string, string>>({});
  const [proposalMessage, setProposalMessage] = useState<Record<string, string>>({});

  const toggleProposalForm = (listingId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to propose a barter" });
      return;
    }
    setOpenProposalForms((prev) => ({ ...prev, [listingId]: !prev[listingId] }));
  };

  const listingCommentMutation = useMutation({
    mutationFn: async ({ listingId, offerItemName, offerItemValue, content }: { listingId: string; offerItemName: string; offerItemValue: string; content?: string }) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/comments`, { offerItemName, offerItemValue, content });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      setProposalOfferName((prev) => ({ ...prev, [variables.listingId]: "" }));
      setProposalOfferValue((prev) => ({ ...prev, [variables.listingId]: "" }));
      setProposalMessage((prev) => ({ ...prev, [variables.listingId]: "" }));
      setOpenProposalForms((prev) => ({ ...prev, [variables.listingId]: false }));
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      toast({ title: "Proposal sent!", description: "Your barter proposal has been posted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit proposal", variant: "destructive" });
    },
  });

  const handleSubmitProposal = (listingId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const name = proposalOfferName[listingId]?.trim();
    const value = proposalOfferValue[listingId];
    if (!name) {
      toast({ title: "Missing info", description: "Please enter what you want to offer", variant: "destructive" });
      return;
    }
    if (!value || Number(value) <= 0) {
      toast({ title: "Missing info", description: "Please enter the value of your offer", variant: "destructive" });
      return;
    }
    listingCommentMutation.mutate({ listingId, offerItemName: name, offerItemValue: value, content: proposalMessage[listingId]?.trim() || undefined });
  };

  const activeLocation = useActiveLocation();
  const listingsParams = new URLSearchParams(locationParams(activeLocation));
  const listingsQs = listingsParams.toString();
  const { data: listings, isLoading } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings", { country: activeLocation.country, city: activeLocation.city, worldwide: activeLocation.worldwide }],
    queryFn: async () => {
      const res = await fetch(`/api/listings${listingsQs ? `?${listingsQs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch listings");
      return res.json();
    },
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

  const optimisticToggleLike = (old: ListingWithUser[] | undefined, listingId: string) =>
    old?.map(l => l.id === listingId ? { ...l, isLiked: !l.isLiked, likeCount: l.isLiked ? Math.max(0, (l.likeCount || 0) - 1) : (l.likeCount || 0) + 1 } : l);

  const listingLikeMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const res = await apiRequest("POST", `/api/listings/${listingId}/like`);
      return res.json();
    },
    onMutate: async (listingId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/listings"] });
      await queryClient.cancelQueries({ queryKey: ["/api/listings/featured"] });
      const previousAll = queryClient.getQueryData<ListingWithUser[]>(["/api/listings"]);
      const previousFeatured = queryClient.getQueryData<ListingWithUser[]>(["/api/listings/featured"]);
      queryClient.setQueryData<ListingWithUser[]>(["/api/listings"], (old) => optimisticToggleLike(old, listingId));
      queryClient.setQueryData<ListingWithUser[]>(["/api/listings/featured"], (old) => optimisticToggleLike(old, listingId));
      return { previousAll, previousFeatured };
    },
    onError: (error: any, _listingId, context) => {
      if (context?.previousAll) queryClient.setQueryData(["/api/listings"], context.previousAll);
      if (context?.previousFeatured) queryClient.setQueryData(["/api/listings/featured"], context.previousFeatured);
      toast({ title: "Error", description: error.message || "Could not update like", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/featured"] });
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
    if (verifiedOnly && !(listing.user?.kycStatus === "APPROVED" || listing.user?.kybStatus === "APPROVED" || listing.user?.isVerified)) return false;
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
    <div className="bg-bareter-off-white dark:bg-background min-h-screen">
    <div className="container px-2 sm:px-4 py-4 sm:py-8 mx-auto max-w-7xl">
      <nav aria-label="Breadcrumb" className="text-caption mb-3 hidden sm:flex items-center gap-1.5">
        <Link href="/" className="hover:text-bareter-teal">Home</Link>
        <span>›</span>
        <span className="text-bareter-navy dark:text-foreground">Browse</span>
      </nav>
      <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide">
        <Button
          variant={activeTab === "discover" ? "bareter" : "bareter-outline"}
          onClick={() => setActiveTab("discover")}
          className="gap-2 flex-shrink-0"
          data-testid="tab-discover"
        >
          <Sparkles className="h-4 w-4" />
          Discover
        </Button>
        <Button
          variant={activeTab === "search" ? "bareter" : "bareter-outline"}
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
                <Crown className="h-5 w-5 text-bareter-gold" />
                <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground" data-testid="text-featured-title">Featured Listings</h2>
              </div>
              <StaggeredReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" testId="grid-browse-featured">
                {featuredListings.slice(0, 3).map((listing) => (
                  <BrandListingCard key={listing.id} listing={listing} isWishlisted={currentWishlistedIds.has(listing.id)} onWishlistToggle={user ? (id) => toggleWishlistMutation.mutate({ listingId: id, isWishlisted: currentWishlistedIds.has(id) }) : undefined} />
                ))}
              </StaggeredReveal>
            </section>
          )}

          {trendingPosts && trendingPosts.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground" data-testid="text-trending-title">Trending Posts</h2>
              </div>
              <StaggeredReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" testId="grid-browse-trending">
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
              </StaggeredReveal>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground" data-testid="text-categories-title">Browse by Category</h2>
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
                <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground" data-testid="text-recommended-title">Businesses to Barter With</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedUsers.slice(0, 6).map((recUser: any) => (
                  <Link key={recUser.id} href={`/users/${recUser.id}`}>
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
                              <VerifiedBadge isVerified={recUser.isVerified} kycStatus={recUser.kycStatus} kybStatus={recUser.kybStatus} accountType={recUser.accountType} size="xs" testId="badge-verified" />
                              <FounderBadge show={!!recUser.founderBadge} />
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
                <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground" data-testid="text-latest-title">Latest Listings</h2>
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
              <StaggeredReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" testId="grid-browse-latest">
                {(listings || []).slice(0, 6).map((listing) => (
                  <BrandListingCard key={listing.id} listing={listing} isWishlisted={currentWishlistedIds.has(listing.id)} onWishlistToggle={user ? (id) => toggleWishlistMutation.mutate({ listingId: id, isWishlisted: currentWishlistedIds.has(id) }) : undefined} />
                ))}
              </StaggeredReveal>
            )}
          </section>
        </div>
      ) : (
        <div>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search listings..." value={search} onChange={(e) => setSearch(e.target.value)} className="ps-9" data-testid="input-search" />
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
            <aside className="hidden md:block w-[280px] flex-shrink-0">
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
                <StaggeredReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" testId="grid-browse-results">
                  {sortedListings.map((listing) => (
                    <BrandListingCard key={listing.id} listing={listing} isWishlisted={currentWishlistedIds.has(listing.id)} onWishlistToggle={user ? (id) => toggleWishlistMutation.mutate({ listingId: id, isWishlisted: currentWishlistedIds.has(id) }) : undefined} />
                  ))}
                </StaggeredReveal>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
