import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AiMatchCards from "@/components/ai-match-cards";
import { VerifiedBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import { useActiveLocation, locationParams } from "@/lib/active-location";
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
  Phone,
  Mail,
  Send,
  ExternalLink,
  Copy,
  X,
  Flag,
  ShieldAlert,
} from "lucide-react";
import type { PostWithUser, PostCategoryDetails, PostCommentWithUser } from "@shared/schema";
import { FEED_CATEGORIES } from "@shared/schema";
import { ReportModal } from "@/components/report-modal";

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
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs text-muted-foreground truncate w-16 text-center">
              {story.user?.fullName?.split(" ")[0] || "User"}
            </span>
            <FounderBadge show={!!story.user?.founderBadge} />
          </div>
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
      className="flex gap-2 overflow-x-auto flex-nowrap py-3 px-2 sm:px-1 scrollbar-hide sticky top-16 z-40 bg-background border-b"
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

function CommentsSection({ postId, commentCount: initialCount }: { postId: string; commentCount: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [offerName, setOfferName] = useState("");
  const [offerValue, setOfferValue] = useState("");
  const [message, setMessage] = useState("");

  const { data: comments, isLoading } = useQuery<PostCommentWithUser[]>({
    queryKey: ["/api/posts", postId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
  });

  const addProposalMutation = useMutation({
    mutationFn: async (data: { offerItemName: string; offerItemValue: string; content?: string }) => {
      const res = await apiRequest("POST", `/api/posts/${postId}/comments`, data);
      return res.json();
    },
    onSuccess: () => {
      setOfferName("");
      setOfferValue("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: "Proposal sent", description: "Your barter proposal has been submitted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit proposal", variant: "destructive" });
    },
  });

  const handleSubmitProposal = () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to propose a barter" });
      return;
    }
    if (!offerName.trim()) {
      toast({ title: "Missing info", description: "Please enter what you want to offer", variant: "destructive" });
      return;
    }
    if (!offerValue || Number(offerValue) <= 0) {
      toast({ title: "Missing info", description: "Please enter the value of your offer", variant: "destructive" });
      return;
    }
    addProposalMutation.mutate({
      offerItemName: offerName.trim(),
      offerItemValue: offerValue,
      content: message.trim() || undefined,
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Barter Proposals
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : comments && comments.length > 0 ? (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/40" data-testid={`proposal-${comment.id}`}>
              <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                <AvatarImage src={comment.user?.avatarUrl || undefined} />
                <AvatarFallback className="text-[10px]">
                  {comment.user?.fullName?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold">{comment.user?.fullName?.split(" ")[0]}</span>
                  <FounderBadge show={!!comment.user?.founderBadge} />
                  {comment.offerItemName && (
                    <Badge variant="default" className="text-[10px] gap-0.5 bg-green-600 text-white no-default-hover-elevate no-default-active-elevate">
                      <ArrowRightLeft className="h-2.5 w-2.5" />
                      {comment.offerItemName}
                    </Badge>
                  )}
                  {comment.offerItemValue && (
                    <span className="text-[11px] font-medium text-muted-foreground">
                      AED {formatValue(comment.offerItemValue)}
                    </span>
                  )}
                </div>
                {comment.content && (
                  <p className="text-sm text-muted-foreground mt-0.5">{comment.content}</p>
                )}
                <span className="text-[10px] text-muted-foreground">{timeAgo(comment.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No proposals yet. Be the first to propose a barter!</p>
      )}

      <div className="space-y-2 pt-1 border-t">
        <p className="text-xs font-medium">Propose what you want to offer in exchange</p>
        <div className="flex items-center gap-2">
          <Input
            value={offerName}
            onChange={(e) => setOfferName(e.target.value)}
            placeholder="What are you offering? (e.g. Photography Package)"
            className="text-sm flex-1"
            data-testid={`input-offer-name-${postId}`}
          />
          <div className="relative flex-shrink-0 w-32">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">AED</span>
            <Input
              type="number"
              value={offerValue}
              onChange={(e) => setOfferValue(e.target.value)}
              placeholder="Value"
              className="text-sm pl-10"
              min="1"
              data-testid={`input-offer-value-${postId}`}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a message (optional)"
            className="text-sm flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleSubmitProposal()}
            data-testid={`input-proposal-message-${postId}`}
          />
          <Button
            size="sm"
            onClick={handleSubmitProposal}
            disabled={addProposalMutation.isPending || !offerName.trim() || !offerValue}
            className="gap-1"
            data-testid={`button-submit-proposal-${postId}`}
          >
            <Send className="h-3.5 w-3.5" />
            Propose
          </Button>
        </div>
      </div>
    </div>
  );
}

function BarterExchangeSection({ post, onPropose }: { post: PostWithUser; onPropose: () => void }) {
  const [showAllWants, setShowAllWants] = useState(false);
  const offerItems = post.offerItems || [];
  const wantItems = post.wantItems || [];

  if (offerItems.length === 0 && wantItems.length === 0) return null;

  const visibleWants = showAllWants ? wantItems : wantItems.slice(0, 3);

  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-2.5" data-testid={`barter-exchange-${post.id}`}>
      {offerItems.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            {post.postType === "request" ? "Looking For" : "Offering"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {offerItems.map((item, i) => (
              <Badge key={`offer-${i}`} variant="default" className="text-xs bg-green-600 text-white no-default-hover-elevate no-default-active-elevate gap-1">
                <PackagePlus className="h-3 w-3" />
                {item.name}
                {item.value > 0 && <span className="opacity-75">AED {formatValue(item.value)}</span>}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {wantItems.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Willing to trade for
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleWants.map((item, i) => (
              <Badge key={`want-${i}`} variant="outline" className="text-xs gap-1">
                <Search className="h-3 w-3" />
                {item.name}
                {item.value > 0 && <span className="opacity-75">~AED {formatValue(item.value)}</span>}
              </Badge>
            ))}
            {wantItems.length > 3 && !showAllWants && (
              <button
                onClick={() => setShowAllWants(true)}
                className="text-xs text-primary font-medium"
                data-testid={`button-show-more-wants-${post.id}`}
              >
                +{wantItems.length - 3} more
              </button>
            )}
          </div>
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={onPropose}
        className="w-full gap-1.5 mt-1"
        data-testid={`button-propose-different-${post.id}`}
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
        Propose a Different Barter
      </Button>
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
  const [bookmarked, setBookmarked] = useState(post.bookmarked ?? false);
  const [showComments, setShowComments] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);

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

  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/posts/${post.id}/bookmark`);
    },
    onMutate: () => {
      setBookmarked((prev) => !prev);
    },
    onError: () => {
      setBookmarked((prev) => !prev);
      toast({ title: "Error", description: "Failed to update bookmark", variant: "destructive" });
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

  const handleBookmark = () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to save posts" });
      return;
    }
    bookmarkMutation.mutate();
  };

  const handleShare = async () => {
    const postUrl = `${window.location.origin}/posts/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: post.title || "Bareter Post",
          text: post.caption || "Check out this barter opportunity!",
          url: postUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      setShowShareMenu((prev) => !prev);
    }
  };

  const handleCopyLink = async () => {
    const postUrl = `${window.location.origin}/posts/${post.id}`;
    try {
      await navigator.clipboard.writeText(postUrl);
      toast({ title: "Link copied", description: "Post link copied to clipboard" });
    } catch {
      toast({ title: "Error", description: "Failed to copy link", variant: "destructive" });
    }
    setShowShareMenu(false);
  };

  const handleContact = (type: "call" | "email" | "message") => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to contact this trader" });
      navigate("/login");
      return;
    }
    const poster = post.user;
    if (type === "call") {
      if (poster?.phone && poster?.showPhone !== false) {
        window.open(`tel:${poster.phone}`, "_self");
      } else {
        toast({ title: "Not available", description: "This trader hasn't shared their phone number" });
      }
    } else if (type === "email") {
      if (poster?.email && poster?.showEmail !== false) {
        window.open(`mailto:${poster.email}?subject=Barter Inquiry - ${post.title || "Bareter"}`, "_self");
      } else {
        toast({ title: "Not available", description: "This trader hasn't shared their email address" });
      }
    } else if (type === "message") {
      if (poster?.allowDirectMessages === false) {
        toast({ title: "Not available", description: "This trader has disabled direct messages" });
      } else {
        toast({ title: "Coming soon", description: "Direct messaging will be available soon" });
      }
    }
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
  const commentCount = post.commentCount ?? 0;

  return (
    <>
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
                  <VerifiedBadge
                    kycStatus={post.user?.kycStatus}
                    kybStatus={post.user?.kybStatus}
                    accountType={post.user?.accountType}
                    isVerified={post.user?.isVerified}
                    size="sm"
                    testId={`badge-verified-${post.id}`}
                  />
                  <FounderBadge show={!!post.user?.founderBadge} />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {post.user?.businessName && (
                    <span className="truncate">{post.user.businessName}</span>
                  )}
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
            {user && (
              <button
                onClick={() => setShowReport(true)}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                data-testid={`button-report-post-${post.id}`}
                title="Report this post"
              >
                <Flag className="h-3.5 w-3.5" />
              </button>
            )}
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
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={handleLike}
                className="flex items-center gap-1"
                data-testid={`button-like-${post.id}`}
              >
                <Heart className={`h-6 w-6 transition-colors ${liked ? "fill-destructive text-destructive" : "text-foreground"}`} />
              </button>
              <button
                onClick={() => setShowComments((prev) => !prev)}
                className="flex items-center gap-1"
                data-testid={`button-comment-${post.id}`}
              >
                <MessageCircle className={`h-6 w-6 transition-colors ${showComments ? "text-primary" : "text-foreground"}`} />
              </button>
              <div className="relative">
                <button
                  onClick={handleShare}
                  className="flex items-center"
                  data-testid={`button-share-${post.id}`}
                >
                  <Share2 className="h-6 w-6 text-foreground" />
                </button>
                {showShareMenu && (
                  <div className="absolute top-8 left-0 z-50 bg-background border rounded-md shadow-lg p-1 min-w-[160px]" data-testid={`share-menu-${post.id}`}>
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover-elevate rounded-sm"
                      data-testid={`button-copy-link-${post.id}`}
                    >
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </button>
                    <button
                      onClick={() => {
                        window.open(`https://wa.me/?text=${encodeURIComponent(`Check out this barter: ${window.location.origin}/posts/${post.id}`)}`, "_blank");
                        setShowShareMenu(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover-elevate rounded-sm"
                      data-testid={`button-share-whatsapp-${post.id}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                      WhatsApp
                    </button>
                    <button
                      onClick={() => setShowShareMenu(false)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover-elevate rounded-sm text-muted-foreground"
                      data-testid={`button-close-share-${post.id}`}
                    >
                      <X className="h-4 w-4" />
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 sm:gap-1.5">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleContact("call")}
                data-testid={`button-call-${post.id}`}
              >
                <Phone className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleContact("email")}
                data-testid={`button-email-${post.id}`}
              >
                <Mail className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleContact("message")}
                data-testid={`button-message-${post.id}`}
              >
                <Send className="h-4 w-4" />
              </Button>
              <button
                onClick={handleBookmark}
                className="flex items-center"
                data-testid={`button-bookmark-${post.id}`}
              >
                <Bookmark className={`h-6 w-6 transition-colors ${bookmarked ? "fill-foreground text-foreground" : "text-foreground"}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1.5">
            {likeCount > 0 && (
              <p className="text-sm font-semibold" data-testid={`text-likes-${post.id}`}>
                {likeCount.toLocaleString()} {likeCount === 1 ? "like" : "likes"}
              </p>
            )}
            {commentCount > 0 && (
              <button
                onClick={() => setShowComments(true)}
                className="text-sm text-muted-foreground"
                data-testid={`button-view-comments-${post.id}`}
              >
                {commentCount === 1 ? "1 barter proposal" : `${commentCount} barter proposals`}
              </button>
            )}
          </div>
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

          <BarterExchangeSection post={post} onPropose={handleProposeBarter} />

          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {post.hashtags.slice(0, 5).map((tag, i) => (
                <span key={i} className="text-xs text-primary font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {showComments && (
            <CommentsSection postId={post.id} commentCount={commentCount} />
          )}
        </div>
      </CardContent>
    </Card>

    <ReportModal
      open={showReport}
      onOpenChange={setShowReport}
      targetType="post"
      targetId={post.id}
    />
    </>
  );
}

function FeedSidebar({ posts }: { posts: PostWithUser[] | undefined }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const trendingCategories = [
    { name: "Services & Skills", count: 42, color: "text-blue-600 dark:text-blue-400" },
    { name: "Space & Office", count: 38, color: "text-emerald-600 dark:text-emerald-400" },
    { name: "Food & Hospitality", count: 31, color: "text-orange-600 dark:text-orange-400" },
    { name: "Assets & Vehicles", count: 27, color: "text-purple-600 dark:text-purple-400" },
    { name: "Big Ticket", count: 15, color: "text-rose-600 dark:text-rose-400" },
  ];

  const suggestedUsers = posts
    ?.reduce<PostWithUser[]>((acc, post) => {
      if (!acc.find((p) => p.userId === post.userId) && post.user) {
        acc.push(post);
      }
      return acc;
    }, [])
    .slice(0, 5) || [];

  return (
    <div className="space-y-5">
      {user ? (
        <Card>
          <CardContent className="p-4">
            <Link href="/profile" data-testid="sidebar-profile-link">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={user.avatarUrl || undefined} />
                  <AvatarFallback className="font-medium">
                    {user.fullName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate" data-testid="sidebar-username">{user.fullName}</span>
                    <VerifiedBadge isVerified={user.isVerified} kycStatus={user.kycStatus} kybStatus={user.kybStatus} accountType={user.accountType} size="xs" testId="badge-verified" />
                  </div>
                  <span className="text-xs text-muted-foreground">{user.businessName || user.email}</span>
                </div>
              </div>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <ArrowRightLeft className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm" data-testid="sidebar-join-title">Join Bareter</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Start trading goods & services with UAE businesses
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate("/login")} data-testid="sidebar-login">
                Sign In
              </Button>
              <Button size="sm" className="flex-1" onClick={() => navigate("/register")} data-testid="sidebar-register">
                Sign Up
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3" data-testid="sidebar-trending-title">Trending Categories</h3>
          <div className="space-y-1">
            {trendingCategories.map((cat) => (
              <Link key={cat.name} href="/browse" data-testid={`sidebar-category-${cat.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                <Button variant="ghost" size="sm" className="w-full justify-between gap-2">
                  <span className="text-sm font-medium">{cat.name}</span>
                  <Badge variant="secondary" className="text-xs">{cat.count}</Badge>
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {suggestedUsers.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-sm" data-testid="sidebar-suggested-title">Active Traders</h3>
              <Link href="/browse" data-testid="sidebar-see-all">
                <span className="text-xs text-primary font-medium underline">See All</span>
              </Link>
            </div>
            <div className="space-y-3">
              {suggestedUsers.map((p) => (
                <Link key={p.userId} href={`/users/${p.userId}`} data-testid={`sidebar-user-${p.userId}`}>
                  <div className="flex items-center gap-2.5 py-1">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={p.user?.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs font-medium">
                        {p.user?.fullName?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium truncate">{p.user?.fullName}</span>
                        <VerifiedBadge isVerified={p.user?.isVerified} kycStatus={p.user?.kycStatus} kybStatus={p.user?.kybStatus} accountType={p.user?.accountType} size="xs" testId="badge-verified" />
                        <FounderBadge show={!!p.user?.founderBadge} />
                      </div>
                      <span className="text-xs text-muted-foreground truncate block">
                        {p.user?.businessName || p.location || "UAE"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3" data-testid="sidebar-stats-title">Platform Stats</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-2 rounded-md bg-muted/50">
              <span className="text-lg font-bold text-primary" data-testid="sidebar-stat-trades">850+</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Completed Trades</p>
            </div>
            <div className="text-center p-2 rounded-md bg-muted/50">
              <span className="text-lg font-bold text-primary" data-testid="sidebar-stat-users">2,500+</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Active Users</p>
            </div>
            <div className="text-center p-2 rounded-md bg-muted/50">
              <span className="text-lg font-bold text-primary" data-testid="sidebar-stat-value">AED 12M+</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Trade Value</p>
            </div>
            <div className="text-center p-2 rounded-md bg-muted/50">
              <span className="text-lg font-bold text-primary" data-testid="sidebar-stat-satisfaction">98%</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">Satisfaction</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="px-1">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <Link href="/terms" data-testid="sidebar-link-terms"><span className="underline">Terms</span></Link>
          {" · "}
          <Link href="/privacy" data-testid="sidebar-link-privacy"><span className="underline">Privacy</span></Link>
          {" · "}
          <Link href="/help" data-testid="sidebar-link-help"><span className="underline">Help</span></Link>
          {" · "}
          <Link href="/faq" data-testid="sidebar-link-faq"><span className="underline">FAQ</span></Link>
          {" · "}
          <Link href="/how-it-works" data-testid="sidebar-link-how"><span className="underline">How It Works</span></Link>
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">Bareter 2026</p>
      </div>
    </div>
  );
}

function SafetyBanner() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("safety_banner_dismissed") === "true";
  });

  if (dismissed) return null;

  return (
    <div className="mx-auto max-w-xl lg:max-w-none mb-3 mx-0 sm:mx-4 lg:mx-0">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
        <ShieldAlert className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Trade safely on Bareter</p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-blue-700 dark:text-blue-400">
            <li>• Always verify the business badge before trading</li>
            <li>• Keep all negotiations inside the platform</li>
            <li>• Report suspicious listings or requests</li>
          </ul>
        </div>
        <button
          onClick={() => { localStorage.setItem("safety_banner_dismissed", "true"); setDismissed(true); }}
          className="text-blue-500 hover:text-blue-700 flex-shrink-0"
          data-testid="button-dismiss-safety-banner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function FeedPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeCategory, setActiveCategory] = useState("All");

  const activeLocation = useActiveLocation();
  const params = new URLSearchParams({ limit: "20", offset: "0" });
  Object.entries(locationParams(activeLocation)).forEach(([k, v]) => params.set(k, v));
  if (activeCategory !== "All") params.set("category", activeCategory);

  const postsQueryKey = ["/api/posts", {
    category: activeCategory,
    country: activeLocation.country,
    city: activeLocation.city,
    worldwide: activeLocation.worldwide,
    limit: "20",
    offset: "0",
  }];
  const queryUrl = `/api/posts?${params.toString()}`;

  const { data: posts, isLoading } = useQuery<PostWithUser[]>({
    queryKey: postsQueryKey,
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
  });

  return (
    <div className="max-w-6xl mx-auto px-0 sm:px-4 pb-4 sm:pb-8">
      <div className="flex gap-8">
        <div className="flex-1 max-w-xl mx-auto lg:mx-0 lg:max-w-none lg:flex-[3]">
          <StoriesRow />
          <SafetyBanner />
          <AiMatchCards />
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

        <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0 pt-4 sticky top-16 z-50 self-start h-[calc(100vh-5rem)] overflow-y-auto" data-testid="feed-sidebar">
          <FeedSidebar posts={posts} />
        </aside>
      </div>
    </div>
  );
}
