import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useSeo } from "@/hooks/use-seo";
import { Link, useSearch, useRoute, useLocation } from "wouter";
import { categoryFromSlug, subcategoryFromSlug } from "@shared/category-slugs";
import { ListingCard as BrandListingCard } from "@/components/ListingCard";
import { StaggeredReveal } from "@/components/StaggeredReveal";
import { TrendingTiles } from "@/components/TrendingTiles";
import { ChainMatchSection } from "@/components/chain-match-section";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORIES, LOCATIONS, ITEM_CONDITIONS, type ListingWithUser } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, API_BASE, assetUrl } from "@/lib/queryClient";
import { useActiveLocation, locationParams } from "@/lib/active-location";
import { useI18n } from "@/lib/i18n";
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
  Trash2,
  TrendingUp,
  Flame,
  BookmarkCheck,
  Heart,
  ThumbsUp,
  RefreshCw,
} from "lucide-react";
import { VerifiedBadge, VerificationLevelBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import { timeAgo, formatValue } from "@/lib/utils";
import type { ListingCommentWithUser } from "@shared/schema";
import type { ExchangeItem } from "@shared/schema";
import { ShareMenu } from "@/components/share-menu";

type ExploreTab = "discover" | "search" | "for-you" | "collabs" | "chain" | "creators" | "businesses" | "requests";

function ForYouTab({
  wishlistedIds,
  onWishlistToggle,
}: {
  wishlistedIds: Set<string>;
  onWishlistToggle?: (id: string) => void;
}) {
  const { data: forYouListings = [], isLoading, refetch } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/me/for-you"],
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-bareter-navy dark:text-foreground flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500 fill-red-400" />
            For You
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Personalised picks based on your interests, searches and activity
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => (
            <Card key={i}><CardContent className="p-0"><Skeleton className="h-48 rounded-t-md" /><div className="p-4 space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></CardContent></Card>
          ))}
        </div>
      ) : forYouListings.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Heart className="h-14 w-14 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h3 className="font-semibold text-lg mb-2">No personalised picks yet</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              Like listings, save items and search for things you&apos;re interested in — your "For You" feed will learn what to show you.
            </p>
            <Link href="/browse?showCategories=true">
              <Button variant="bareter" size="sm">Explore categories</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <StaggeredReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" testId="grid-for-you">
            {forYouListings.map((listing) => (
              <BrandListingCard
                key={listing.id}
                listing={listing}
                isWishlisted={wishlistedIds.has(listing.id)}
                onWishlistToggle={onWishlistToggle}
              />
            ))}
          </StaggeredReveal>
          <p className="text-xs text-center text-muted-foreground pt-2">
            <ThumbsUp className="h-3.5 w-3.5 inline mr-1" />
            Like and save listings to improve your recommendations
          </p>
        </>
      )}
    </div>
  );
}

export function BrowsePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const handlePullRefresh = useCallback(async () => {
    // Reset infinite scroll back to page 1 and re-fetch all active queries
    await queryClient.resetQueries({ queryKey: ["/api/listings"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/listings/featured"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/me/for-you"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/creators"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/businesses"] });
  }, [queryClient]);

  const { isRefreshing: isPullRefreshing } = usePullToRefresh(handlePullRefresh);
  const searchString = useSearch();
  const [matchCat, paramsCat] = useRoute("/c/:category");
  const [matchSub, paramsSub] = useRoute("/c/:category/:subcategory");
  const routeCategory = matchSub
    ? categoryFromSlug(paramsSub!.category)
    : matchCat
    ? categoryFromSlug(paramsCat!.category)
    : null;
  const routeSubcategory = matchSub
    ? subcategoryFromSlug(paramsSub!.category, paramsSub!.subcategory)
    : null;
  const initialParams = new URLSearchParams(searchString);
  const initialQ = initialParams.get("q") || "";
  const initialCategory = routeCategory || initialParams.get("category") || "";
  const initialLocationParam = initialParams.get("location") || "";

  const showCategoriesParam = initialParams.get("showCategories") === "true";
  const [, navigate] = useLocation();
  const initialTab = initialParams.get("tab") as ExploreTab | null;
  const [activeTab, setActiveTab] = useState<ExploreTab>(
    initialTab && ["discover","search","for-you","collabs","chain","creators","businesses","requests"].includes(initialTab)
      ? initialTab
      : showCategoriesParam ? "discover"
      : (initialQ || initialCategory || initialLocationParam || routeCategory ? "search" : "discover")
  );
  const [search, setSearch] = useState(initialQ || routeSubcategory || "");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialCategory ? [initialCategory] : []
  );
  const [selectedLocation, setSelectedLocation] = useState<string>(
    initialLocationParam || "all"
  );
  const [selectedCondition, setSelectedCondition] = useState<string>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const VALUE_MAX = 50_000_000;
  const SLIDER_STEPS = 1000;

  // Logarithmic slider helpers — maps 0..SLIDER_STEPS ↔ 0..VALUE_MAX
  // so small values (1–500 AED) are just as reachable as millions.
  const sliderToValue = (pos: number): number => {
    if (pos <= 0) return 0;
    if (pos >= SLIDER_STEPS) return VALUE_MAX;
    const logMax = Math.log(VALUE_MAX);
    return Math.round(Math.exp(logMax * (pos / SLIDER_STEPS)));
  };
  const valueToSlider = (val: number): number => {
    if (val <= 0) return 0;
    if (val >= VALUE_MAX) return SLIDER_STEPS;
    return Math.round((Math.log(val) / Math.log(VALUE_MAX)) * SLIDER_STEPS);
  };

  const [valueRange, setValueRange] = useState<[number, number]>([0, VALUE_MAX]);

  useEffect(() => {
    if (!routeCategory) return;
    setSelectedCategories([routeCategory]);
    setActiveTab("search");
    setSearch(routeSubcategory ?? "");
  }, [routeCategory, routeSubcategory]);

  const seoTitle = routeCategory
    ? routeSubcategory
      ? `${routeSubcategory} in ${routeCategory} — Bareter`
      : `${routeCategory} — Bareter`
    : "Browse — Bareter";
  const seoDescription = routeCategory
    ? routeSubcategory
      ? `Browse ${routeSubcategory} listings in ${routeCategory} on Bareter — UAE's cashless B2B barter marketplace.`
      : `Browse ${routeCategory} barter listings on Bareter — swap goods and services without cash.`
    : "Discover barter listings across all categories on Bareter — UAE's cashless B2B marketplace.";
  useSeo({ title: seoTitle, description: seoDescription });
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
  const PAGE_SIZE = 20;
  // Browse filters by country only — city is an explicit user-chosen filter, not auto-applied from profile
  const browseParams = new URLSearchParams();
  if (activeLocation.worldwide) {
    browseParams.set("worldwide", "true");
  } else if (activeLocation.country) {
    browseParams.set("country", activeLocation.country);
  }
  const listingsQs = browseParams.toString();

  const {
    data: listingsPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<ListingWithUser[]>({
    queryKey: ["/api/listings", { country: activeLocation.country, worldwide: activeLocation.worldwide }],
    queryFn: async ({ pageParam = 0 }) => {
      const qs = new URLSearchParams(listingsQs);
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(pageParam as number));
      const res = await fetch(`${API_BASE}/api/listings?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch listings");
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const listings = listingsPages?.pages.flat() ?? [];

  // Sentinel div — when it enters viewport, load next page
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: featuredListings } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings/featured"],
  });

  const { data: collabListings = [], isLoading: collabLoading } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings/collabs"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/listings/collabs`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  // ── Creators tab ────────────────────────────────────────────────────────
  const CREATOR_NICHES_BROWSE = ["Fashion", "Beauty", "Tech", "Food", "Travel", "Lifestyle", "Fitness", "Finance", "Entertainment", "Gaming", "Education"];
  const CREATOR_PLATFORMS_BROWSE = ["Instagram", "TikTok", "YouTube", "LinkedIn", "X (Twitter)", "Snapchat", "Podcast", "Blog"];
  const [creatorNiche, setCreatorNiche] = useState("");
  const [creatorPlatform, setCreatorPlatform] = useState("");
  const [creatorVerifiedOnly, setCreatorVerifiedOnly] = useState(false);
  const [creatorAudienceSize, setCreatorAudienceSize] = useState("");

  const [bizCategory, setBizCategory] = useState("");
  const [bizVerifiedOnly, setBizVerifiedOnly] = useState(false);

  const creatorsQs = new URLSearchParams();
  if (creatorNiche) creatorsQs.set("niche", creatorNiche);
  if (creatorPlatform) creatorsQs.set("platform", creatorPlatform);
  if (creatorVerifiedOnly) creatorsQs.set("verifiedOnly", "true");

  const { data: creatorsData = [], isLoading: creatorsLoading } = useQuery<any[]>({
    queryKey: ["/api/creators", creatorNiche, creatorPlatform, creatorVerifiedOnly],
    queryFn: async () => {
      const qs = creatorsQs.toString();
      const res = await fetch(`${API_BASE}/api/creators${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "creators",
    staleTime: 60_000,
  });

  // ── ISO Board — "request" type listings only ──────────────────────────────
  const { data: isoListings = [], isLoading: isoLoading } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings", { type: "request" }],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/listings?type=request&limit=40`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "requests",
    staleTime: 30_000,
  });

  // ── Businesses tab — pulled from GET /api/businesses (active only, server-filtered) ───
  const { data: businessDirectory, isLoading: bizDirLoading } = useQuery<any[]>({
    queryKey: ["/api/businesses"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/businesses`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "businesses",
    staleTime: 60_000,
  });

  const filteredCreators = creatorsData.filter((creator: any) => {
    if (!creatorAudienceSize) return true;
    const raw = (creator.creatorProfile?.audienceSize ?? "").replace(/,/g, "").toLowerCase();
    const m = raw.match(/([\d.]+)\s*([km]?)/);
    if (!m) return true;
    const n = parseFloat(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1);
    if (creatorAudienceSize === "1K–10K") return n >= 1_000 && n < 10_000;
    if (creatorAudienceSize === "10K–100K") return n >= 10_000 && n < 100_000;
    if (creatorAudienceSize === "100K–1M") return n >= 100_000 && n < 1_000_000;
    if (creatorAudienceSize === "1M+") return n >= 1_000_000;
    return true;
  });

  const filteredBusinesses = (businessDirectory ?? []).filter((biz: any) => {
    if (bizCategory && biz.category !== bizCategory) return false;
    if (bizVerifiedOnly && biz.kybStatus !== "verified") return false;
    return true;
  });

  const { data: recommendedUsers } = useQuery<any[]>({
    queryKey: ["/api/recommendations/users"],
    enabled: !!user,
  });

  const { data: recommendedListings } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/recommendations/listings"],
    enabled: !!user,
  });

  const userCity = (user as any)?.city || activeLocation.city || "";
  const { data: nearbyListings } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings-nearby", userCity],
    queryFn: async () => {
      if (!userCity) return [];
      const res = await fetch(`${API_BASE}/api/listings-nearby?city=${encodeURIComponent(userCity)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userCity,
  });

  const { data: savedSearches } = useQuery<Array<{ id: number; name: string | null; filters: unknown }>>({
    queryKey: ["/api/saved-searches"],
    enabled: !!user,
  });

  const saveSearchMutation = useMutation({
    mutationFn: async () => {
      const filters = {
        q: search,
        categories: selectedCategories,
        location: selectedLocation,
        condition: selectedCondition,
        minValue: valueRange[0] > 0 ? valueRange[0] : undefined,
        maxValue: valueRange[1] < VALUE_MAX ? valueRange[1] : undefined,
        verifiedOnly,
        type: selectedType !== "all" ? selectedType : undefined,
      };
      const name = search ? `"${search}"` : selectedCategories.length > 0 ? selectedCategories.join(", ") : "My search";
      const res = await apiRequest("POST", "/api/saved-searches", { name, filters });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
      toast({ title: "Search saved!", description: "Saved search added." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save search", variant: "destructive" });
    },
  });

  const deleteSavedSearchMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/saved-searches/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete saved search", variant: "destructive" });
    },
  });

  const applySearch = (filters: any) => {
    if (filters.q) setSearch(filters.q);
    if (filters.categories) setSelectedCategories(filters.categories);
    if (filters.location) setSelectedLocation(filters.location);
    if (filters.condition) setSelectedCondition(filters.condition);
    if (filters.type) setSelectedType(filters.type);
    if (filters.minValue) setValueRange((prev: [number, number]) => [filters.minValue, prev[1]]);
    if (filters.maxValue) setValueRange((prev: [number, number]) => [prev[0], filters.maxValue]);
  };

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
      queryClient.invalidateQueries({ queryKey: ["/api/me/liked-listings"] });
    },
  });

  const filteredListings = listings?.filter((listing) => {
    if (search) {
      // Multi-word AND search across many fields so keywords like
      // "dubai villa", "rolex", "photography services" all match.
      const haystack = [
        listing.title,
        listing.description,
        listing.location,
        listing.country,
        listing.condition,
        listing.user?.fullName,
        listing.user?.businessName,
        ...(listing.categories || []),
        ...((listing.offerItems as ExchangeItem[] | undefined) || []).map((i) => i?.name),
        ...((listing.wantItems as ExchangeItem[] | undefined) || []).map((i) => i?.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.every((t) => haystack.includes(t))) return false;
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
    const value = parseFloat(listing.retailValue as string) || 0;
    if (value < valueRange[0] || value > valueRange[1]) return false;
    return true;
  });

  // Record search history whenever the user has an active search query and results are loaded
  useEffect(() => {
    if (!user || !search.trim() || search.trim().length < 2 || listings === undefined) return;
    const resultCount = filteredListings?.length ?? 0;
    const category = selectedCategories[0] || null;
    const timer = setTimeout(() => {
      apiRequest("POST", "/api/search-history", { query: search.trim(), category, resultCount }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, listings]);

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
    setValueRange([0, VALUE_MAX]);
  };

  const hasActiveFilters =
    search ||
    selectedType !== "all" ||
    selectedCategories.length > 0 ||
    selectedLocation !== "all" ||
    selectedCondition !== "all" ||
    verifiedOnly ||
    valueRange[0] > 0 ||
    valueRange[1] < VALUE_MAX;

  const PRICE_PRESETS: { label: string; range: [number, number] }[] = [
    { label: "Any", range: [0, VALUE_MAX] },
    { label: "Under 500", range: [0, 500] },
    { label: "500–5k", range: [500, 5_000] },
    { label: "5k–50k", range: [5_000, 50_000] },
    { label: "50k–500k", range: [50_000, 500_000] },
    { label: "500k+", range: [500_000, VALUE_MAX] },
  ];

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
        <h4 className="font-medium mb-3">{t("browse.type")}</h4>
        <div className="flex gap-2 flex-wrap">
          <Button variant={selectedType === "all" ? "default" : "outline"} size="sm" onClick={() => setSelectedType("all")} data-testid="filter-type-all">{t("browse.all")}</Button>
          <Button variant={selectedType === "offer" ? "default" : "outline"} size="sm" onClick={() => setSelectedType("offer")} className="gap-1" data-testid="filter-type-offer"><Package className="h-3 w-3" />{t("browse.offers")}</Button>
          <Button variant={selectedType === "request" ? "default" : "outline"} size="sm" onClick={() => setSelectedType("request")} className="gap-1" data-testid="filter-type-request"><ShoppingCart className="h-3 w-3" />{t("browse.requests")}</Button>
        </div>
      </div>
      <div>
        <h4 className="font-medium mb-3">{t("browse.condition")}</h4>
        <Select value={selectedCondition} onValueChange={setSelectedCondition}>
          <SelectTrigger data-testid="filter-condition">
            <SelectValue placeholder={t("browse.anyCondition")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("browse.anyCondition")}</SelectItem>
            {ITEM_CONDITIONS.map((c) => (
              <SelectItem key={c} value={c}>{conditionLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <h4 className="font-medium mb-3">{t("browse.categories")}</h4>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Badge key={category} variant={selectedCategories.includes(category) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleCategory(category)} data-testid={`filter-category-${category.toLowerCase()}`}>
              {category}
            </Badge>
          ))}
        </div>
      </div>
      <div>
        <h4 className="font-medium mb-3">{t("listing.location")}</h4>
        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
          <SelectTrigger data-testid="filter-location">
            <SelectValue placeholder={t("browse.allLocations")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("browse.allLocations")}</SelectItem>
            {LOCATIONS.map((location) => (<SelectItem key={location} value={location}>{location}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <h4 className="font-medium mb-3">{t("browse.priceRange")}</h4>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PRICE_PRESETS.map((p) => {
            const active = valueRange[0] === p.range[0] && valueRange[1] === p.range[1];
            return (
              <Badge
                key={p.label}
                variant={active ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setValueRange(p.range)}
                data-testid={`filter-price-preset-${p.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
              >
                {p.label}
              </Badge>
            );
          })}
        </div>
        <div className="px-2">
          <Slider
            value={[valueToSlider(valueRange[0]), valueToSlider(valueRange[1])]}
            onValueChange={(v) => setValueRange([sliderToValue(v[0]), sliderToValue(v[1])])}
            max={SLIDER_STEPS}
            step={1}
            className="mb-2"
            data-testid="filter-value-range"
          />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>AED {valueRange[0] <= 0 ? "0" : valueRange[0].toLocaleString()}</span>
            <span>AED {valueRange[1] >= VALUE_MAX ? "50M+" : valueRange[1].toLocaleString()}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label className="text-[11px] text-muted-foreground" htmlFor="filter-min-price">Min</label>
            <Input
              id="filter-min-price"
              type="number"
              min={0}
              value={valueRange[0] || ""}
              onChange={(e) => {
                const v = Math.max(0, Math.min(VALUE_MAX, Number(e.target.value) || 0));
                setValueRange([v, Math.max(v, valueRange[1])]);
              }}
              className="h-9"
              data-testid="filter-min-price"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground" htmlFor="filter-max-price">Max</label>
            <Input
              id="filter-max-price"
              type="number"
              min={0}
              value={valueRange[1] >= VALUE_MAX ? "" : valueRange[1]}
              placeholder="50,000,000+"
              onChange={(e) => {
                const raw = Number(e.target.value);
                const v = !raw ? VALUE_MAX : Math.max(0, Math.min(VALUE_MAX, raw));
                setValueRange([Math.min(valueRange[0], v), v]);
              }}
              className="h-9"
              data-testid="filter-max-price"
            />
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
        <Button variant="outline" onClick={clearFilters} className="w-full" data-testid="button-clear-filters"><X className="h-4 w-4 me-2" />Clear All Filters</Button>
      )}
    </div>
  );

  return (
    <div className="bg-bareter-off-white dark:bg-background min-h-screen">
    {Capacitor.isNativePlatform() && isPullRefreshing && (
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-background rounded-full shadow-md p-2.5">
        <RefreshCw className="h-5 w-5 animate-spin text-bareter-teal" />
      </div>
    )}
    <div className="container px-2 sm:px-4 py-4 sm:py-8 mx-auto max-w-7xl">
      <nav aria-label="Breadcrumb" className="text-caption mb-3 hidden sm:flex items-center gap-1.5">
        <Link href="/" className="hover:text-bareter-teal">{t("nav.home")}</Link>
        <span>›</span>
        <span className="text-bareter-navy dark:text-foreground">{t("browse.title")}</span>
      </nav>
      <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide">
        <Button
          variant={activeTab === "discover" ? "bareter" : "bareter-outline"}
          onClick={() => setActiveTab("discover")}
          className="gap-2 flex-shrink-0"
          data-testid="tab-discover"
        >
          <Sparkles className="h-4 w-4" />
          {t("browse.discover")}
        </Button>
        <Button
          variant={activeTab === "search" ? "bareter" : "bareter-outline"}
          onClick={() => setActiveTab("search")}
          className="gap-2 flex-shrink-0"
          data-testid="tab-search"
        >
          <Search className="h-4 w-4" />
          {t("browse.searchFilter")}
        </Button>
        {user && (
          <Button
            variant={activeTab === "for-you" ? "bareter" : "bareter-outline"}
            onClick={() => setActiveTab("for-you")}
            className="gap-2 flex-shrink-0"
            data-testid="tab-for-you"
          >
            <Heart className="h-4 w-4" />
            For You
          </Button>
        )}
        <Button
          variant={activeTab === "collabs" ? "bareter" : "bareter-outline"}
          onClick={() => setActiveTab("collabs")}
          className="gap-2 flex-shrink-0"
          data-testid="tab-collabs"
        >
          <CameraIcon className="h-4 w-4" />
          Brand Collabs
        </Button>
        {user && (
          <Button
            variant={activeTab === "chain" ? "bareter" : "bareter-outline"}
            onClick={() => setActiveTab("chain")}
            className="gap-2 flex-shrink-0"
            data-testid="tab-chain"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Chain Deals
          </Button>
        )}
        <Button
          variant={activeTab === "requests" ? "bareter" : "bareter-outline"}
          onClick={() => setActiveTab("requests")}
          className="gap-2 flex-shrink-0"
          data-testid="tab-requests"
        >
          <ShoppingCart className="h-4 w-4" />
          ISO Board
        </Button>
        <Button
          variant={activeTab === "creators" ? "bareter" : "bareter-outline"}
          onClick={() => setActiveTab("creators")}
          className="gap-2 flex-shrink-0"
          data-testid="tab-creators"
        >
          <CameraIcon className="h-4 w-4" />
          Creators
        </Button>
        <Button
          variant={activeTab === "businesses" ? "bareter" : "bareter-outline"}
          onClick={() => setActiveTab("businesses")}
          className="gap-2 flex-shrink-0"
          data-testid="tab-businesses"
        >
          <Building2 className="h-4 w-4" />
          Businesses
        </Button>
      </div>

      {activeTab === "collabs" ? (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <CameraIcon className="h-5 w-5 text-primary" />
                Brand Collab Opportunities
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Brands offering products & services in exchange for content creation.
              </p>
            </div>
            <Link href="/creators">
              <Button variant="outline" size="sm" className="gap-2">
                <Users className="h-4 w-4" />
                Browse Creators
              </Button>
            </Link>
          </div>

          {collabLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i}><CardContent className="p-0"><Skeleton className="h-48 rounded-t-md" /><div className="p-4 space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></CardContent></Card>
              ))}
            </div>
          ) : collabListings.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CameraIcon className="h-14 w-14 mx-auto mb-4 text-muted-foreground opacity-30" />
                <h3 className="font-semibold text-lg mb-2">No brand collab listings yet</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Be the first to post a brand collab — offer your product or service in exchange for creator content.
                </p>
                <Link href="/create-listing">
                  <Button variant="bareter" size="sm">Post a Brand Collab</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              <StaggeredReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" testId="grid-collabs">
                {collabListings.map((listing) => (
                  <BrandListingCard
                    key={listing.id}
                    listing={listing}
                    isWishlisted={currentWishlistedIds.has(listing.id)}
                    onWishlistToggle={user ? (id) => toggleWishlistMutation.mutate({ listingId: id, isWishlisted: currentWishlistedIds.has(id) }) : undefined}
                  />
                ))}
              </StaggeredReveal>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 text-center">
                <Sparkles className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="font-semibold mb-1">Are you a content creator?</p>
                <p className="text-sm text-muted-foreground mb-3">Set up your creator profile and start receiving brand collab offers.</p>
                <Link href="/creators">
                  <Button size="sm">Discover Creators</Button>
                </Link>
              </div>
            </>
          )}
        </div>
      ) : activeTab === "creators" ? (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <CameraIcon className="h-5 w-5 text-primary" />
                Creators
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Discover content creators open to barter collaborations.
              </p>
            </div>
          </div>
          {/* Filters */}
          <div className="space-y-2">
            {/* Niche chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {["", ...CREATOR_NICHES_BROWSE].map(n => (
                <button
                  key={n || "all"}
                  type="button"
                  onClick={() => setCreatorNiche(n)}
                  className={`flex-shrink-0 h-7 px-3 rounded-full border text-xs font-medium transition-colors ${creatorNiche === n ? "border-primary bg-primary/10 text-primary" : "border-input hover:border-primary/40 text-muted-foreground"}`}
                >
                  {n || "All niches"}
                </button>
              ))}
            </div>
            {/* Platform chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {["", ...CREATOR_PLATFORMS_BROWSE].map(p => (
                <button
                  key={p || "all"}
                  type="button"
                  onClick={() => setCreatorPlatform(p)}
                  className={`flex-shrink-0 h-7 px-3 rounded-full border text-xs font-medium transition-colors ${creatorPlatform === p ? "border-primary bg-primary/10 text-primary" : "border-input hover:border-primary/40 text-muted-foreground"}`}
                >
                  {p || "All platforms"}
                </button>
              ))}
            </div>
            {/* Audience size + Verified toggle */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["1K–10K", "10K–100K", "100K–1M", "1M+"] as const).map(bucket => (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => setCreatorAudienceSize(v => v === bucket ? "" : bucket)}
                  className={`flex-shrink-0 h-7 px-3 rounded-full border text-xs font-medium transition-colors ${creatorAudienceSize === bucket ? "border-primary bg-primary/10 text-primary" : "border-input hover:border-primary/40 text-muted-foreground"}`}
                  data-testid={`filter-audience-${bucket}`}
                >
                  <Users className="h-3 w-3 inline mr-1" />{bucket}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCreatorVerifiedOnly(v => !v)}
                className={`flex-shrink-0 flex items-center gap-1.5 h-7 px-3 rounded-full border text-xs font-medium transition-colors ${creatorVerifiedOnly ? "border-primary bg-primary/10 text-primary" : "border-input hover:border-primary/40 text-muted-foreground"}`}
                data-testid="filter-creator-verified"
              >
                <Shield className="h-3.5 w-3.5" />
                Verified only
              </button>
              {(creatorNiche || creatorPlatform || creatorVerifiedOnly || creatorAudienceSize) && (
                <button
                  type="button"
                  onClick={() => { setCreatorNiche(""); setCreatorPlatform(""); setCreatorVerifiedOnly(false); setCreatorAudienceSize(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>
          {/* Grid */}
          {creatorsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i}><CardContent className="p-4"><div className="flex items-center gap-3"><Skeleton className="h-12 w-12 rounded-full" /><div className="space-y-2 flex-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div></CardContent></Card>
              ))}
            </div>
          ) : filteredCreators.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CameraIcon className="h-14 w-14 mx-auto mb-4 text-muted-foreground opacity-30" />
                <h3 className="font-semibold text-lg mb-2">No creators found</h3>
                <p className="text-muted-foreground text-sm">Try adjusting your filters or check back later.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCreators.map((creator: any) => (
                <Card
                  key={creator.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => navigate(`/creators/${creator.id}`)}
                  data-testid={`creator-card-${creator.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12 shrink-0">
                        <AvatarImage src={creator.avatarUrl || undefined} alt={creator.fullName} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {(creator.creatorProfile?.displayName || creator.fullName || "?")[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-sm truncate">
                            {creator.creatorProfile?.displayName || creator.fullName}
                          </p>
                          {creator.isVerified && <VerifiedBadge />}
                          <VerificationLevelBadge level={creator.verificationLevel} />
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {creator.creatorProfile?.niche && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 h-4">{creator.creatorProfile.niche}</Badge>
                          )}
                          {creator.creatorProfile?.primaryPlatform && (
                            <Badge variant="outline" className="text-[10px] px-1.5 h-4">{creator.creatorProfile.primaryPlatform}</Badge>
                          )}
                        </div>
                        {creator.creatorProfile?.audienceSize && (
                          <p className="text-xs text-muted-foreground mt-1">
                            <Users className="h-3 w-3 inline mr-0.5" />
                            {creator.creatorProfile.audienceSize}
                          </p>
                        )}
                        {(creator.totalCompletedDeals ?? 0) > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <CheckCircle2 className="h-3 w-3 inline mr-0.5 text-green-500" />
                            {creator.totalCompletedDeals} deals
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === "businesses" ? (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Businesses
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Verified businesses available for barter — products, wholesale deals, and services.
              </p>
            </div>
            <Link href="/businesses">
              <Button variant="bareter-outline" size="sm" className="flex-shrink-0">View all</Button>
            </Link>
          </div>
          {/* Business Filters */}
          {!bizDirLoading && businessDirectory && businessDirectory.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {["", ...Array.from(new Set((businessDirectory as any[]).map((b: any) => b.category).filter(Boolean))) as string[]].map((cat: string) => (
                  <button
                    key={cat || "all"}
                    type="button"
                    onClick={() => setBizCategory(cat)}
                    className={`flex-shrink-0 h-7 px-3 rounded-full border text-xs font-medium transition-colors ${bizCategory === cat ? "border-primary bg-primary/10 text-primary" : "border-input hover:border-primary/40 text-muted-foreground"}`}
                  >
                    {cat || "All types"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setBizVerifiedOnly(v => !v)}
                  className={`flex-shrink-0 flex items-center gap-1.5 h-7 px-3 rounded-full border text-xs font-medium transition-colors ${bizVerifiedOnly ? "border-primary bg-primary/10 text-primary" : "border-input hover:border-primary/40 text-muted-foreground"}`}
                  data-testid="filter-biz-verified"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  KYB Verified only
                </button>
                {(bizCategory || bizVerifiedOnly) && (
                  <button
                    type="button"
                    onClick={() => { setBizCategory(""); setBizVerifiedOnly(false); }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
          {bizDirLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i}><CardContent className="p-0"><Skeleton className="h-24 rounded-t-xl" /><div className="p-4 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></CardContent></Card>
              ))}
            </div>
          ) : filteredBusinesses.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Building2 className="h-14 w-14 mx-auto mb-4 text-muted-foreground opacity-30" />
                {businessDirectory && businessDirectory.length > 0 ? (
                  <>
                    <h3 className="font-semibold text-lg mb-2">No matching businesses</h3>
                    <p className="text-muted-foreground text-sm">Try clearing your filters to see all businesses.</p>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold text-lg mb-2">No businesses yet</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Be the first — create a business profile and start bartering.
                    </p>
                    <Link href="/settings">
                      <Button variant="bareter" size="sm">Create Business Profile</Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="grid-businesses">
              {filteredBusinesses.slice(0, 9).map((biz: any) => (
                <Link key={biz.id} href={`/businesses/${biz.id}`} className="group block">
                  <article className="bg-white dark:bg-card rounded-xl border border-bareter-border dark:border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col">
                    <div className="h-20 bg-gradient-to-br from-bareter-teal/20 to-bareter-navy/10 relative overflow-hidden flex-shrink-0">
                      {biz.coverImageUrl && (
                        <img src={biz.coverImageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      )}
                      {biz.isFeatured && (
                        <span className="absolute top-2 end-2 text-[9px] font-semibold text-white bg-bareter-gold/90 px-1.5 py-0.5 rounded-md">Featured</span>
                      )}
                    </div>
                    <div className="p-3 flex flex-col flex-1 gap-1.5">
                      <div className="flex items-center gap-2">
                        {biz.logoUrl ? (
                          <img src={biz.logoUrl} alt={biz.companyName} className="h-8 w-8 rounded-full object-cover ring-1 ring-bareter-teal/20 flex-shrink-0 -mt-6 bg-white shadow-sm" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-bareter-teal/10 flex items-center justify-center flex-shrink-0 -mt-6 ring-1 ring-background shadow-sm">
                            <Building2 className="h-4 w-4 text-bareter-teal" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-bareter-navy dark:text-foreground truncate">{biz.companyName}</p>
                          {biz.kybStatus === "verified" && (
                            <p className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-0.5">
                              <CheckCircle2 className="h-3 w-3" />Verified
                            </p>
                          )}
                        </div>
                      </div>
                      {biz.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{biz.description}</p>
                      )}
                      {biz.location && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-auto">
                          <MapPin className="h-3 w-3" />{biz.location}
                        </div>
                      )}
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
          {filteredBusinesses.length > 9 && (
            <div className="text-center pt-2">
              <Link href="/businesses">
                <Button variant="bareter-outline" size="sm">View all {filteredBusinesses.length} businesses →</Button>
              </Link>
            </div>
          )}
        </div>
      ) : activeTab === "for-you" ? (
        <ForYouTab
          wishlistedIds={currentWishlistedIds}
          onWishlistToggle={user ? (id) => toggleWishlistMutation.mutate({ listingId: id, isWishlisted: currentWishlistedIds.has(id) }) : undefined}
        />
      ) : activeTab === "chain" ? (
        <ChainMatchSection />
      ) : activeTab === "requests" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                ISO Board
              </h2>
              <p className="text-sm text-muted-foreground">People looking for something to barter — offer what you have</p>
            </div>
            <Badge variant="secondary">{isoListings.length} requests</Badge>
          </div>
          {isoLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : isoListings.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No requests yet. Be the first to post what you&apos;re looking for!</p>
              <Link href="/create-listing"><Button variant="bareter" size="sm" className="mt-4">Post a Request</Button></Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {isoListings.map((listing) => (
                <Link key={listing.id} href={`/listings/${listing.id}`}>
                  <div className="border rounded-xl p-4 bg-card hover:shadow-bareter-hover transition-shadow cursor-pointer bareter-slide-in">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <Badge variant="outline" className="text-[10px] mb-2">ISO · {listing.categories?.[0] ?? "General"}</Badge>
                        <h3 className="font-semibold text-sm line-clamp-2">{listing.title}</h3>
                      </div>
                      {(listing as any).user?.avatarUrl && (
                        <img src={assetUrl((listing as any).user.avatarUrl)} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                      )}
                    </div>
                    {listing.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{listing.description}</p>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{listing.location || "UAE"}
                      </span>
                      {listing.retailValue && Number(listing.retailValue) > 0 && (
                        <span className="text-xs font-semibold text-bareter-teal">Up to AED {Number(listing.retailValue).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === "discover" ? (
        <div className="space-y-8">
          {featuredListings && featuredListings.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Crown className="h-5 w-5 text-bareter-gold" />
                <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground" data-testid="text-featured-title">{t("browse.featuredListings")}</h2>
              </div>
              <StaggeredReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" testId="grid-browse-featured">
                {featuredListings.slice(0, 3).map((listing) => (
                  <BrandListingCard key={listing.id} listing={listing} isWishlisted={currentWishlistedIds.has(listing.id)} onWishlistToggle={user ? (id) => toggleWishlistMutation.mutate({ listingId: id, isWishlisted: currentWishlistedIds.has(id) }) : undefined} />
                ))}
              </StaggeredReveal>
            </section>
          )}

          <TrendingTiles listings={listings} />


          <section>
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground" data-testid="text-categories-title">{t("browse.browseByCategory")}</h2>
              <Link href="/map" className="ms-auto inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium" data-testid="link-map-view">
                <MapPin className="h-3.5 w-3.5" />
                {t("browse.mapView")}
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {CATEGORIES.map((cat) => {
                const count = categoryStats?.find(s => (s.category as any) === cat)?.count || 0;
                const CatIcon = categoryIconMap[cat] || Package;
                const trendBadge = count >= 10
                  ? { label: "Hot", icon: Flame, cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" }
                  : count >= 5
                  ? { label: "Active", icon: TrendingUp, cls: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" }
                  : count >= 2
                  ? { label: "Growing", icon: TrendingUp, cls: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" }
                  : null;
                return (
                  <Card
                    key={cat}
                    className="hover-elevate cursor-pointer"
                    onClick={() => { setSelectedCategories([cat]); setActiveTab("search"); }}
                    data-testid={`card-category-${cat.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <CardContent className="p-3 text-center">
                      <div className="flex justify-center mb-1 relative">
                        <CatIcon className="h-6 w-6 text-primary" />
                        {trendBadge && (
                          <span className={`absolute -top-1 -right-3 inline-flex items-center gap-0.5 px-1 py-0 rounded-full text-[9px] font-semibold ${trendBadge.cls}`} data-testid={`trend-badge-${cat}`}>
                            <trendBadge.icon className="h-2.5 w-2.5" />
                            {trendBadge.label}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-medium line-clamp-1 mt-1">{cat}</h4>
                      <span className="text-[10px] text-muted-foreground">{Number(count)} listings</span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {user && recommendedListings && recommendedListings.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-bareter-gold" />
                <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground" data-testid="text-recommended-barters-title">{t("browse.recommendedBarters")}</h2>
                <span className="text-xs text-muted-foreground ml-1">{t("browse.basedOnProfile")}</span>
              </div>
              <StaggeredReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" testId="grid-browse-recommended">
                {recommendedListings.slice(0, 6).map((listing) => (
                  <BrandListingCard key={listing.id} listing={listing} isWishlisted={currentWishlistedIds.has(listing.id)} onWishlistToggle={user ? (id) => toggleWishlistMutation.mutate({ listingId: id, isWishlisted: currentWishlistedIds.has(id) }) : undefined} />
                ))}
              </StaggeredReveal>
            </section>
          )}

          {nearbyListings && nearbyListings.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground" data-testid="text-nearby-title">
                  {t("browse.nearYou")}{userCity ? ` — ${userCity}` : ""}
                </h2>
              </div>
              <StaggeredReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" testId="grid-browse-nearby">
                {nearbyListings.slice(0, 6).map((listing) => (
                  <BrandListingCard key={listing.id} listing={listing} isWishlisted={currentWishlistedIds.has(listing.id)} onWishlistToggle={user ? (id) => toggleWishlistMutation.mutate({ listingId: id, isWishlisted: currentWishlistedIds.has(id) }) : undefined} />
                ))}
              </StaggeredReveal>
            </section>
          )}

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
                                  <CheckCircle2 className="h-2.5 w-2.5 me-0.5" />{recUser.credibilityScore}
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
          {/* Saved searches management panel */}
          {user && savedSearches && savedSearches.length > 0 && (
            <div className="mb-5 p-3 rounded-lg border bg-card" data-testid="saved-searches-panel">
              <div className="flex items-center gap-2 mb-2">
                <BookmarkCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Saved Searches</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">{savedSearches.length}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {savedSearches.map((ss) => (
                  <div key={ss.id} className="flex items-center gap-1 bg-muted/60 rounded-full pl-3 pr-1 py-1" data-testid={`saved-search-${ss.id}`}>
                    <button
                      className="text-xs font-medium hover:text-primary transition-colors"
                      onClick={() => { applySearch(ss.filters); }}
                      data-testid={`apply-saved-search-${ss.id}`}
                    >
                      {ss.name || "Saved search"}
                    </button>
                    <button
                      className="h-5 w-5 rounded-full flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors ml-1"
                      onClick={() => deleteSavedSearchMutation.mutate(ss.id)}
                      disabled={deleteSavedSearchMutation.isPending}
                      data-testid={`delete-saved-search-${ss.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t("browse.searchListings")} value={search} onChange={(e) => setSearch(e.target.value)} className="ps-9" data-testid="input-search" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[180px]" data-testid="select-sort">
                  <ArrowUpDown className="h-4 w-4 me-2" /><SelectValue placeholder={t("browse.sortBy")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{t("browse.newestFirst")}</SelectItem>
                  <SelectItem value="oldest">{t("browse.oldestFirst")}</SelectItem>
                  <SelectItem value="value-high">{t("browse.highValue")}</SelectItem>
                  <SelectItem value="value-low">{t("browse.lowValue")}</SelectItem>
                  <SelectItem value="popular">{t("browse.mostPopular")}</SelectItem>
                </SelectContent>
              </Select>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="md:hidden" data-testid="button-filters-mobile">
                    <Filter className="h-4 w-4 me-2" />{t("browse.filters")}
                    {hasActiveFilters && <Badge variant="secondary" className="ms-2">{selectedCategories.length + (verifiedOnly ? 1 : 0)}</Badge>}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80">
                  <SheetHeader className="mb-6"><SheetTitle>{t("browse.filters")}</SheetTitle></SheetHeader>
                  {FilterContent()}
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <div className="flex gap-8">
            <aside className="hidden md:block w-[280px] flex-shrink-0">
              <Card><CardContent className="p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2"><Filter className="h-4 w-4" />{t("browse.filters")}</h3>
                {FilterContent()}
              </CardContent></Card>
            </aside>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <p className="text-muted-foreground">
                  {isLoading ? t("browse.loading") : <><span className="font-medium text-foreground">{sortedListings.length}</span> {t("browse.listings")}</>}
                </p>
                <div className="flex items-center gap-2">
                  {user && hasActiveFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => saveSearchMutation.mutate()}
                      disabled={saveSearchMutation.isPending}
                      data-testid="button-save-search"
                    >
                      <Star className="h-3.5 w-3.5" />
                      {t("browse.saveSearch")}
                      {savedSearches && savedSearches.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 ms-0.5">{savedSearches.length}</Badge>
                      )}
                    </Button>
                  )}
                  <Link href="/create-listing">
                    <Button className="gap-2" data-testid="button-create-listing"><Sparkles className="h-4 w-4" />{t("browse.createListing")}</Button>
                  </Link>
                </div>
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
                    <h3 className="font-semibold text-lg mb-2">{t("browse.noListings")}</h3>
                    <p className="text-muted-foreground mb-4">{t("browse.noListingsDesc")}</p>
                    <Button variant="outline" onClick={clearFilters}>{t("browse.clearFilters")}</Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <StaggeredReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" testId="grid-browse-results">
                    {sortedListings.map((listing) => (
                      <BrandListingCard key={listing.id} listing={listing} isWishlisted={currentWishlistedIds.has(listing.id)} onWishlistToggle={user ? (id) => toggleWishlistMutation.mutate({ listingId: id, isWishlisted: currentWishlistedIds.has(id) }) : undefined} />
                    ))}
                  </StaggeredReveal>
                  {/* Infinite scroll sentinel — IntersectionObserver triggers next page */}
                  <div ref={sentinelRef} className="h-8 mt-4 flex items-center justify-center">
                    {isFetchingNextPage && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
