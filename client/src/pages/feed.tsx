import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Heart,
  MessageCircle,
  Share2,
  MapPin,
  Shield,
  Bed,
  Bath,
  Ruler,
  Car,
  Gauge,
  Gem,
  ArrowRightLeft,
  Hash,
  TrendingUp,
  Plus,
  Fuel,
  Settings2,
  Palette,
  CheckCircle2,
  PackagePlus,
  Search,
  Sofa,
  Eye,
  Bookmark,
  MoreHorizontal,
} from "lucide-react";
import type { PostWithUser, PostCategoryDetails } from "@shared/schema";
import { FEED_CATEGORIES } from "@shared/schema";

function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w`;
  return past.toLocaleDateString();
}

function formatValue(value: string | number | null | undefined): string {
  if (!value) return "0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return num.toLocaleString();
}

function StoriesRow() {
  const { data: stories, isLoading } = useQuery<PostWithUser[]>({
    queryKey: ["/api/stories"],
  });

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto flex-nowrap py-4 px-1 scrollbar-hide" data-testid="stories-loading">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (!stories || stories.length === 0) return null;

  const uniqueUsers = stories.reduce<PostWithUser[]>((acc, story) => {
    if (!acc.find((s) => s.userId === story.userId)) {
      acc.push(story);
    }
    return acc;
  }, []);

  return (
    <div className="flex gap-4 overflow-x-auto flex-nowrap py-4 px-1 scrollbar-hide border-b" data-testid="stories-row">
      {uniqueUsers.map((story) => (
        <button
          key={story.id}
          className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer"
          data-testid={`story-${story.id}`}
        >
          <div className="rounded-full p-0.5 bg-gradient-to-tr from-primary to-primary/60">
            <Avatar className="h-14 w-14 border-2 border-background">
              <AvatarImage src={story.user?.avatarUrl || undefined} />
              <AvatarFallback className="text-sm">
                {story.user?.fullName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
          </div>
          <span className="text-xs text-muted-foreground truncate w-16 text-center">
            {story.user?.fullName?.split(" ")[0] || "User"}
          </span>
        </button>
      ))}
    </div>
  );
}

function CategoryTabs({
  activeCategory,
  onCategoryChange,
}: {
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto flex-nowrap py-3 px-1 scrollbar-hide sticky top-0 z-40 bg-background border-b"
      data-testid="category-tabs"
    >
      {FEED_CATEGORIES.map((cat) => (
        <Button
          key={cat}
          variant={activeCategory === cat ? "default" : "outline"}
          size="sm"
          className="flex-shrink-0 whitespace-nowrap"
          onClick={() => onCategoryChange(cat)}
          data-testid={`tab-${cat.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
        >
          {cat}
        </Button>
      ))}
    </div>
  );
}

function FeedCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="w-full aspect-square" />
        <div className="p-3 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryDetails({ details, feedCategory }: { details: PostCategoryDetails | null | undefined; feedCategory: string | null | undefined }) {
  if (!details) return null;

  const badges: { icon: typeof Bed; label: string }[] = [];

  if (feedCategory === "Real Estate" || feedCategory === "Space & Office") {
    if (details.bedrooms) badges.push({ icon: Bed, label: `${details.bedrooms} bed` });
    if (details.bathrooms) badges.push({ icon: Bath, label: `${details.bathrooms} bath` });
    if (details.squareMeters) badges.push({ icon: Ruler, label: `${details.squareMeters} sqm` });
    if (details.furnished) badges.push({ icon: Sofa, label: "Furnished" });
    if (details.viewType) badges.push({ icon: Eye, label: details.viewType });
    if (details.amenities && details.amenities.length > 0) {
      badges.push({ icon: CheckCircle2, label: details.amenities.slice(0, 3).join(", ") });
    }
  }

  if (feedCategory === "Vehicles" || feedCategory === "Assets & Vehicles") {
    if (details.make || details.model) {
      badges.push({ icon: Car, label: [details.make, details.model, details.year].filter(Boolean).join(" ") });
    }
    if (details.mileage) badges.push({ icon: Gauge, label: `${details.mileage.toLocaleString()} km` });
    if (details.engineType) badges.push({ icon: Fuel, label: details.engineType });
    if (details.transmission) badges.push({ icon: Settings2, label: details.transmission });
    if (details.color) badges.push({ icon: Palette, label: details.color });
  }

  if (feedCategory === "Luxury Goods" || feedCategory === "Big Ticket") {
    if (details.brand || details.model) {
      badges.push({ icon: Gem, label: [details.brand, details.model].filter(Boolean).join(" ") });
    }
    if (details.condition) badges.push({ icon: CheckCircle2, label: details.condition });
    if (details.material) badges.push({ icon: Gem, label: details.material });
    if (details.boxAndPapers) badges.push({ icon: CheckCircle2, label: "Box & Papers" });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b, i) => {
        const Icon = b.icon;
        return (
          <Badge key={i} variant="secondary" className="gap-1 text-xs">
            <Icon className="h-3 w-3" />
            {b.label}
          </Badge>
        );
      })}
    </div>
  );
}

function FeedCard({ post }: { post: PostWithUser }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClientHook = useQueryClient();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(post.liked ?? false);
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);

  const likeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/posts/${post.id}/like`);
    },
    onMutate: () => {
      setLiked((prev) => !prev);
      setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
    },
    onError: () => {
      setLiked((prev) => !prev);
      setLikeCount((prev) => (liked ? prev + 1 : prev - 1));
      toast({ title: "Error", description: "Failed to update like", variant: "destructive" });
    },
    onSettled: () => {
      queryClientHook.invalidateQueries({ queryKey: ["/api/posts"] });
    },
  });

  const handleLike = () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to like posts" });
      return;
    }
    likeMutation.mutate();
  };

  const handleProposeBarter = () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to propose a barter" });
      navigate("/login");
      return;
    }
    const kycApproved = user.kycStatus === "APPROVED";
    const kybApproved = user.kybStatus === "APPROVED";
    if (!kycApproved && !kybApproved) {
      toast({
        title: "Verification required",
        description: "Please verify your identity before proposing a barter.",
        variant: "destructive",
      });
      navigate("/profile");
      return;
    }
    navigate("/create-listing");
  };

  const declaredValue = post.declaredValue ? parseFloat(post.declaredValue as string) : 0;
  const isHighValue = declaredValue > 100000;
  const caption = post.caption || "";
  const shouldTruncate = caption.length > 120;
  const displayCaption = expanded || !shouldTruncate ? caption : caption.slice(0, 120);

  return (
    <Card className="overflow-visible border-x-0 sm:border-x rounded-none sm:rounded-md" data-testid={`card-post-${post.id}`}>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <Link href={`/users/${post.userId}`}>
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-9 w-9">
                <AvatarImage src={post.user?.avatarUrl || undefined} />
                <AvatarFallback className="text-sm font-medium">
                  {post.user?.fullName?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold truncate" data-testid={`text-username-${post.id}`}>
                    {post.user?.fullName}
                  </span>
                  {post.user?.isVerified && (
                    <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0" data-testid={`badge-verified-${post.id}`} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {post.location && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {post.location}
                    </span>
                  )}
                  <span>{timeAgo(post.createdAt)}</span>
                </div>
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {post.postType === "request" ? (
              <Badge variant="outline" className="gap-1 text-xs border-amber-500/50 text-amber-600 dark:text-amber-400" data-testid={`badge-post-type-${post.id}`}>
                <Search className="h-3 w-3" />
                Looking For
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs border-green-500/50 text-green-600 dark:text-green-400" data-testid={`badge-post-type-${post.id}`}>
                <PackagePlus className="h-3 w-3" />
                Offering
              </Badge>
            )}
          </div>
        </div>

        <div className="relative">
          {post.mediaUrls && post.mediaUrls.length > 0 ? (
            <div className="w-full aspect-square bg-muted" data-testid={`media-${post.id}`}>
              <img
                src={post.mediaUrls[0]}
                alt={post.title || "Post media"}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-full aspect-square bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
              {post.postType === "request" ? (
                <Search className="h-20 w-20 text-primary/20" />
              ) : (
                <PackagePlus className="h-20 w-20 text-primary/20" />
              )}
            </div>
          )}
          {isHighValue && (
            <div className="absolute top-3 left-3">
              <Badge variant="default" className="text-xs gap-1" data-testid={`badge-high-value-${post.id}`}>
                <TrendingUp className="h-3 w-3" />
                High Value
              </Badge>
            </div>
          )}
          {declaredValue > 0 && (
            <div className="absolute bottom-3 right-3">
              <Badge variant="secondary" className="font-semibold bg-background/90 backdrop-blur-sm text-sm" data-testid={`badge-value-${post.id}`}>
                AED {formatValue(post.declaredValue)}
              </Badge>
            </div>
          )}
        </div>

        <div className="px-3 pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button
                onClick={handleLike}
                className="flex items-center gap-1"
                data-testid={`button-like-${post.id}`}
              >
                <Heart className={`h-6 w-6 transition-colors ${liked ? "fill-destructive text-destructive" : "text-foreground"}`} />
              </button>
              <button className="flex items-center" data-testid={`button-comment-${post.id}`}>
                <MessageCircle className="h-6 w-6 text-foreground" />
              </button>
              <button className="flex items-center" data-testid={`button-share-${post.id}`}>
                <Share2 className="h-6 w-6 text-foreground" />
              </button>
            </div>
            <Button
              size="sm"
              onClick={handleProposeBarter}
              className="gap-1.5"
              data-testid={`button-propose-barter-${post.id}`}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Propose Barter
            </Button>
          </div>

          {likeCount > 0 && (
            <p className="text-sm font-semibold mt-1.5" data-testid={`text-likes-${post.id}`}>
              {likeCount.toLocaleString()} {likeCount === 1 ? "like" : "likes"}
            </p>
          )}
        </div>

        <div className="px-3 pb-3 pt-1 space-y-2">
          {post.title && (
            <h3 className="font-semibold text-sm" data-testid={`text-title-${post.id}`}>{post.title}</h3>
          )}

          {caption && (
            <p className="text-sm" data-testid={`text-caption-${post.id}`}>
              <span className="font-semibold mr-1">{post.user?.fullName?.split(" ")[0]}</span>
              {displayCaption}
              {shouldTruncate && !expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  className="text-muted-foreground ml-1"
                  data-testid={`button-expand-${post.id}`}
                >
                  ...more
                </button>
              )}
            </p>
          )}

          <CategoryDetails details={post.categoryDetails} feedCategory={post.feedCategory} />

          {(post.offerItems?.length || post.wantItems?.length) ? (
            <div className="flex flex-wrap gap-1.5">
              {post.offerItems?.slice(0, 3).map((item, i) => (
                <Badge key={`offer-${i}`} variant="default" className="text-xs bg-green-600 text-white no-default-hover-elevate no-default-active-elevate gap-1">
                  <PackagePlus className="h-3 w-3" />
                  {item.name}
                </Badge>
              ))}
              {post.wantItems?.slice(0, 3).map((item, i) => (
                <Badge key={`want-${i}`} variant="outline" className="text-xs gap-1">
                  <Search className="h-3 w-3" />
                  {item.name}
                </Badge>
              ))}
            </div>
          ) : null}

          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {post.hashtags.slice(0, 5).map((tag, i) => (
                <span key={i} className="text-xs text-primary font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function FeedPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeCategory, setActiveCategory] = useState("All");

  const postsQueryKey =
    activeCategory === "All"
      ? ["/api/posts", { limit: "20", offset: "0" }]
      : ["/api/posts", { category: activeCategory, limit: "20", offset: "0" }];

  const queryUrl =
    activeCategory === "All"
      ? "/api/posts?limit=20&offset=0"
      : `/api/posts?category=${encodeURIComponent(activeCategory)}&limit=20&offset=0`;

  const { data: posts, isLoading } = useQuery<PostWithUser[]>({
    queryKey: postsQueryKey,
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
  });

  return (
    <div className="max-w-lg mx-auto pb-8">
      <StoriesRow />
      <CategoryTabs activeCategory={activeCategory} onCategoryChange={setActiveCategory} />

      <div className="mt-2 space-y-4 sm:space-y-6">
        {isLoading ? (
          <>
            {[...Array(3)].map((_, i) => (
              <FeedCardSkeleton key={i} />
            ))}
          </>
        ) : !posts || posts.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2" data-testid="text-empty-title">No posts yet</h3>
              <p className="text-muted-foreground mb-4" data-testid="text-empty-description">
                Be the first to share what you have to barter
              </p>
              {user ? (
                <Link href="/create-listing">
                  <Button data-testid="button-create-first-post">Create a Post</Button>
                </Link>
              ) : (
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={() => navigate("/login")} data-testid="button-login-cta">
                    Sign In
                  </Button>
                  <Button onClick={() => navigate("/register")} data-testid="button-register-cta">
                    Get Started
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          posts.map((post) => <FeedCard key={post.id} post={post} />)
        )}
      </div>
    </div>
  );
}
