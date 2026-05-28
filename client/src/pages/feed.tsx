import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { openCookiePreferences } from "@/lib/cookie-consent";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AiMatchCards from "@/components/ai-match-cards";
import { VerifiedBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import { ImageCarousel } from "@/components/ImageCarousel";
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
  Upload,
  ImageIcon,
  Loader2,
  RotateCw,
} from "lucide-react";
import type { PostWithUser, PostCategoryDetails, PostCommentWithUser, ListingWithUser } from "@shared/schema";
import { FEED_CATEGORIES } from "@shared/schema";
import { ReportModal } from "@/components/report-modal";
import { ValuationBadge } from "@/components/ValuationBadge";
import { ValueMatchBadge } from "@/components/ValueMatchBadge";
import { ReviewModal } from "@/components/ReviewModal";
import { ReputationBadge } from "@/components/ReputationBadge";

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
  const { gate } = useWaitlist();
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
          onClick={() => gate()}
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
  const { gate } = useWaitlist();
  const { toast } = useToast();
  const [offerName, setOfferName] = useState("");
  const [offerValue, setOfferValue] = useState("");
  const [message, setMessage] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [offerImages, setOfferImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    try {
      const urls = await Promise.all(Array.from(files).map(async (file) => {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image file`);
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} exceeds 5MB limit`);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "listing");
        const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
        if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Upload failed"); }
        return (await res.json()).url as string;
      }));
      setOfferImages(prev => [...prev, ...urls]);
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message || "Could not upload image", variant: "destructive" });
    } finally {
      setUploadingImages(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const { data: comments, isLoading } = useQuery<PostCommentWithUser[]>({
    queryKey: ["/api/posts", postId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
  });

  const addProposalMutation = useMutation({
    mutationFn: async (data: { offerItemName: string; offerItemValue: string; content?: string; offerDescription?: string; images: string[] }) => {
      const res = await apiRequest("POST", `/api/posts/${postId}/comments`, data);
      return res.json();
    },
    onSuccess: () => {
      setOfferName("");
      setOfferValue("");
      setMessage("");
      setOfferDescription("");
      setOfferImages([]);
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: "Proposal sent", description: "Your barter proposal has been submitted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit proposal", variant: "destructive" });
    },
  });

  const handleSubmitProposal = () => {
    if (!gate()) return;
    if (!offerName.trim()) {
      toast({ title: "Missing info", description: "Please enter what you want to offer", variant: "destructive" });
      return;
    }
    if (!offerValue || Number(offerValue) <= 0) {
      toast({ title: "Missing info", description: "Please enter the value of your offer", variant: "destructive" });
      return;
    }
    if (offerImages.length < 2) {
      toast({ title: "Images required", description: "Please upload at least 2 images of your offer", variant: "destructive" });
      return;
    }
    addProposalMutation.mutate({
      offerItemName: offerName.trim(),
      offerItemValue: offerValue,
      content: message.trim() || undefined,
      offerDescription: offerDescription.trim() || undefined,
      images: offerImages,
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
                {(comment as any).offerDescription && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{(comment as any).offerDescription}</p>
                )}
                {(comment as any).images && ((comment as any).images as string[]).length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {((comment as any).images as string[]).map((imgUrl: string, imgIdx: number) => (
                      <a key={imgIdx} href={imgUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={imgUrl}
                          alt={`Offer image ${imgIdx + 1}`}
                          className="h-12 w-12 object-cover rounded border hover:opacity-90 transition-opacity"
                        />
                      </a>
                    ))}
                  </div>
                )}
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

      <div className="space-y-4 pt-2 border-t">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
          Propose what you want to offer in exchange
        </p>

        {/* Name + value */}
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

        {/* Description */}
        <Textarea
          value={offerDescription}
          onChange={(e) => setOfferDescription(e.target.value)}
          placeholder="Describe your offer — condition, brand, what's included..."
          className="text-sm resize-none"
          rows={2}
          data-testid={`input-offer-description-${postId}`}
        />

        {/* Image upload — 2 required */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-medium flex items-center gap-1">
              <ImageIcon className="h-3.5 w-3.5" />
              Offer Images
              <span className="text-destructive ml-0.5">*</span>
              <span className="text-muted-foreground font-normal ml-1">({offerImages.length}/2 minimum)</span>
            </Label>
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImages}
              className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
              data-testid={`button-upload-image-${postId}`}
            >
              {uploadingImages ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Add photos
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleImageUpload(e.target.files)}
            />
          </div>

          {offerImages.length === 0 ? (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImages}
              className="w-full border-2 border-dashed border-muted-foreground/30 rounded-lg p-5 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
              data-testid={`dropzone-images-${postId}`}
            >
              {uploadingImages ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              <span className="text-xs font-medium">Upload at least 2 photos of your offer</span>
              <span className="text-[11px]">JPG, PNG, WEBP · Max 5MB each</span>
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {offerImages.map((url, idx) => (
                <div key={idx} className="relative aspect-square rounded-md overflow-hidden border bg-muted group">
                  <img src={url} alt={`Offer ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setOfferImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImages}
                className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
              >
                {uploadingImages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
          {offerImages.length > 0 && offerImages.length < 2 && (
            <p className="text-[11px] text-destructive mt-1">Add {2 - offerImages.length} more photo{2 - offerImages.length > 1 ? "s" : ""} to continue</p>
          )}
        </div>

        {/* Optional message + submit */}
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
            disabled={addProposalMutation.isPending || !offerName.trim() || !offerValue || offerImages.length < 2}
            className="gap-1 shrink-0"
            data-testid={`button-submit-proposal-${postId}`}
          >
            {addProposalMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
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
            Willing to barter for
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
  const { gate } = useWaitlist();
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

  const isOwnPost = user?.id === post.userId;
  const { data: followData } = useQuery<{ isFollowing: boolean }>({
    queryKey: ["/api/users", post.userId, "is-following"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${post.userId}/is-following`);
      return res.json();
    },
    enabled: !!user && !isOwnPost,
    staleTime: 60_000,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (followData?.isFollowing) {
        await apiRequest("DELETE", `/api/users/${post.userId}/follow`);
      } else {
        await apiRequest("POST", `/api/users/${post.userId}/follow`);
      }
    },
    onSuccess: () => {
      queryClientHook.invalidateQueries({ queryKey: ["/api/users", post.userId, "is-following"] });
      toast({ title: followData?.isFollowing ? "Unfollowed" : "Now following" });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

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
    if (!gate()) return;
    likeMutation.mutate();
  };

  const handleBookmark = () => {
    if (!gate()) return;
    bookmarkMutation.mutate();
  };

  const handleComments = () => {
    if (!gate()) return;
    setShowComments((prev) => !prev);
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
    if (!gate()) return;
    const poster = post.user;
    if (type === "call") {
      if (poster?.phone && poster?.showPhone !== false) {
        window.open(`tel:${poster.phone}`, "_self");
      } else {
        toast({ title: "Phone not available", description: "Opening direct message instead." });
        navigate(`/inbox?userId=${post.userId}`);
      }
    } else if (type === "email") {
      if (poster?.email && poster?.showEmail !== false) {
        window.open(`mailto:${poster.email}?subject=Barter Inquiry - ${post.title || "Bareter"}`, "_self");
      } else {
        toast({ title: "Email not public", description: "Opening direct message instead." });
        navigate(`/inbox?userId=${post.userId}`);
      }
    } else if (type === "message") {
      if (poster?.allowDirectMessages === false) {
        toast({ title: "Messaging disabled", description: "This member has disabled direct messages.", variant: "destructive" });
      } else {
        navigate(`/inbox?userId=${post.userId}`);
      }
    }
  };

  const handleProposeBarter = () => {
    if (!gate()) return;
    if (!user) { navigate("/login"); return; }
    const isVerified = user.isVerified || user.kycStatus === "APPROVED" || user.kybStatus === "APPROVED";
    if (!isVerified) {
      toast({
        title: "Verification required",
        description: "Please verify your identity before proposing a barter.",
        variant: "destructive",
      });
      navigate("/profile");
      return;
    }
    // Navigate to user profile so they can send a direct message / barter proposal
    navigate(`/users/${post.userId}`);
  };

  const declaredValue = post.declaredValue ? parseFloat(post.declaredValue as string) : 0;
  const isHighValue = declaredValue > 100000;
  const postValuation = (() => {
    if (!post.marketValuation) return null;
    try { return JSON.parse(post.marketValuation as string) as { minAed: number; maxAed: number; fairAed: number; confidence: number; reasoning: string }; } catch { return null; }
  })();
  const caption = post.caption || "";
  const shouldTruncate = caption.length > 120;
  const displayCaption = expanded || !shouldTruncate ? caption : caption.slice(0, 120);
  const commentCount = post.commentCount ?? 0;

  return (
    <>
    <Card id={`post-${post.id}`} className="overflow-visible border-x-0 sm:border-x rounded-none sm:rounded-md scroll-mt-24" data-testid={`card-post-${post.id}`}>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={(e) => {
              if (!user) { e.preventDefault(); gate(); return; }
              navigate(`/users/${post.userId}`);
            }}
            className="text-start min-w-0"
            data-testid={`link-user-${post.id}`}
          >
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
          </button>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {user && !isOwnPost && (
              <button
                type="button"
                onClick={() => { if (!gate()) return; followMutation.mutate(); }}
                disabled={followMutation.isPending}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                  followData?.isFollowing
                    ? "border-bareter-teal text-bareter-teal bg-bareter-teal-muted"
                    : "border-bareter-border text-muted-foreground hover:border-bareter-teal hover:text-bareter-teal"
                }`}
                data-testid={`button-follow-post-${post.id}`}
              >
                {followData?.isFollowing ? "Following" : "+ Follow"}
              </button>
            )}
            <button
              onClick={() => { if (!gate()) return; setShowReport(true); }}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              data-testid={`button-report-post-${post.id}`}
              title="Report this post"
            >
              <Flag className="h-3.5 w-3.5" />
            </button>
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

        <div className="relative group" data-testid={`media-${post.id}`}>
          {post.mediaUrls && post.mediaUrls.length > 0 ? (
            <ImageCarousel
              images={post.mediaUrls as string[]}
              alt={post.title || "Post media"}
              aspect="aspect-square"
              testIdPrefix={`post-media-${post.id}`}
              overlays={
                <>
                  {isHighValue && (
                    <div className="absolute top-3 left-3 z-10">
                      <Badge variant="default" className="text-xs gap-1" data-testid={`badge-high-value-${post.id}`}>
                        <TrendingUp className="h-3 w-3" />
                        High Value
                      </Badge>
                    </div>
                  )}
                  {declaredValue > 0 && (
                    <div className="absolute bottom-3 right-3 z-10">
                      <Badge variant="secondary" className="font-semibold bg-background/90 backdrop-blur-sm text-sm" data-testid={`badge-value-${post.id}`}>
                        AED {formatValue(post.declaredValue)}
                      </Badge>
                    </div>
                  )}
                </>
              }
            />
          ) : (
            <div className="w-full aspect-square bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center relative">
              {post.postType === "request" ? (
                <Search className="h-20 w-20 text-primary/20" />
              ) : (
                <PackagePlus className="h-20 w-20 text-primary/20" />
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
                onClick={handleComments}
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
                onClick={handleComments}
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

          {postValuation && postValuation.minAed > 0 && (
            <div data-testid={`row-valuation-${post.id}`}>
              <ValuationBadge
                minAed={postValuation.minAed}
                maxAed={postValuation.maxAed}
                fairAed={postValuation.fairAed}
                confidence={postValuation.confidence}
                reasoning={postValuation.reasoning}
                size="sm"
              />
            </div>
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
  const { gate } = useWaitlist();
  const [, navigate] = useLocation();
  const { t } = useI18n();
  const guarded = (path: string) => () => { if (!gate()) return; navigate(path); };

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
              <h3 className="font-semibold text-sm" data-testid="sidebar-join-title">{t("feed.joinCta")}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {t("app.tagline")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={guarded("/login")} data-testid="sidebar-login">
                {t("nav.login")}
              </Button>
              <Button size="sm" className="flex-1" onClick={guarded("/register")} data-testid="sidebar-register">
                {t("nav.register")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3" data-testid="sidebar-trending-title">{t("feed.trendingCategories")}</h3>
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
              <h3 className="font-semibold text-sm" data-testid="sidebar-suggested-title">{t("feed.activeMembers")}</h3>
              <Link href="/browse" data-testid="sidebar-see-all">
                <span className="text-xs text-primary font-medium underline">{t("feed.seeAll")}</span>
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
          <h3 className="font-semibold text-sm mb-3" data-testid="sidebar-stats-title">{t("feed.platformStats")}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-2 rounded-md bg-muted/50">
              <span className="text-lg font-bold text-primary" data-testid="sidebar-stat-trades">850+</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t("feed.completedBarters")}</p>
            </div>
            <div className="text-center p-2 rounded-md bg-muted/50">
              <span className="text-lg font-bold text-primary" data-testid="sidebar-stat-users">2,500+</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t("feed.activeUsers")}</p>
            </div>
            <div className="text-center p-2 rounded-md bg-muted/50">
              <span className="text-lg font-bold text-primary" data-testid="sidebar-stat-value">AED 12M+</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t("feed.dealValue")}</p>
            </div>
            <div className="text-center p-2 rounded-md bg-muted/50">
              <span className="text-lg font-bold text-primary" data-testid="sidebar-stat-satisfaction">98%</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t("feed.satisfaction")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="px-1">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <Link href="/terms" data-testid="sidebar-link-terms"><span className="underline">{t("nav.terms")}</span></Link>
          {" · "}
          <Link href="/privacy" data-testid="sidebar-link-privacy"><span className="underline">{t("nav.privacy")}</span></Link>
          {" · "}
          <Link href="/legal/barter-rules" data-testid="sidebar-link-barter-rules"><span className="underline">{t("nav.barterRules")}</span></Link>
          {" · "}
          <Link href="/legal/dispute-resolution" data-testid="sidebar-link-disputes"><span className="underline">{t("nav.disputes")}</span></Link>
          {" · "}
          <Link href="/legal/vat" data-testid="sidebar-link-vat"><span className="underline">VAT</span></Link>
          {" · "}
          <Link href="/legal/cookies" data-testid="sidebar-link-cookies"><span className="underline">{t("nav.cookies")}</span></Link>
          {" · "}
          <button type="button" onClick={openCookiePreferences} className="underline" data-testid="sidebar-button-cookie-prefs">{t("nav.cookiePreferences")}</button>
          {" · "}
          <Link href="/legal/acceptable-use" data-testid="sidebar-link-aup"><span className="underline">{t("nav.acceptableUse")}</span></Link>
          {" · "}
          <Link href="/legal/community-standards" data-testid="sidebar-link-community"><span className="underline">{t("nav.communityStandards")}</span></Link>
          {" · "}
          <Link href="/legal/customer-agreement" data-testid="sidebar-link-customer-agreement"><span className="underline">{t("nav.customerAgreement")}</span></Link>
          {" · "}
          <Link href="/help" data-testid="sidebar-link-help"><span className="underline">{t("footer.help")}</span></Link>
          {" · "}
          <Link href="/faq" data-testid="sidebar-link-faq"><span className="underline">{t("footer.faq")}</span></Link>
          {" · "}
          <Link href="/how-it-works" data-testid="sidebar-link-how"><span className="underline">{t("nav.howItWorks")}</span></Link>
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">{t("app.name")} 2026</p>
      </div>
    </div>
  );
}

function SafetyBanner() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("safety_banner_dismissed") === "true";
  });
  const { t } = useI18n();

  if (dismissed) return null;

  return (
    <div className="mx-auto max-w-xl lg:max-w-none mb-3 mx-0 sm:mx-4 lg:mx-0">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
        <ShieldAlert className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">{t("feed.barterSafely")}</p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-blue-700 dark:text-blue-400">
            <li>• {t("feed.safetyTip1")}</li>
            <li>• {t("feed.safetyTip2")}</li>
            <li>• {t("feed.safetyTip3")}</li>
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

// ── "Continue where you left off" — floating reminder, once per session ──────
// Shown as a small dismissible card in the bottom-right corner, with a 4-second
// delay. Suppressed if the user has already dismissed it this session.
const CONTINUE_SESSION_KEY = "bareter_continue_dismissed";

function ContinueWhereLeftOff() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [item, setItem] = useState<{ label: string; sublabel?: string; href: string } | null>(null);

  const { data } = useQuery<{
    verification: { startedAt: string; accountType: string | null } | null;
    draft: { id: string; title: string | null; updatedAt: string | null } | null;
    engagement: { listing: { id: string; title: string }; eventType: string; at: string | null } | null;
  }>({
    queryKey: ["/api/continue"],
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!data) return;
    if (sessionStorage.getItem(CONTINUE_SESSION_KEY)) return;

    let resolved: { label: string; sublabel?: string; href: string } | null = null;
    if (data.engagement) {
      resolved = {
        sublabel: data.engagement.eventType === "message_started" ? "Deal in progress" : "Saved listing",
        label: data.engagement.listing.title,
        href: `/listings/${data.engagement.listing.id}`,
      };
    } else if (data.draft) {
      resolved = {
        sublabel: "Unfinished listing",
        label: data.draft.title || "Untitled draft",
        href: `/create-listing?draft=${data.draft.id}`,
      };
    } else if (data.verification) {
      resolved = {
        label: "Complete your verification",
        href: "/profile?tab=verification",
      };
    }

    if (!resolved) return;
    setItem(resolved);
    const tid = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(tid);
  }, [data]);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(CONTINUE_SESSION_KEY, "1");
  };

  if (!visible || !item) return null;

  return (
    <div
      className="fixed bottom-6 right-4 sm:right-6 z-50 w-72 animate-in slide-in-from-bottom-4 fade-in duration-300"
      data-testid="continue-popup"
    >
      <Card className="shadow-lg border border-bareter-border bg-white dark:bg-card">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-bareter-teal font-semibold mb-0.5">
                {item.sublabel ?? "Continue where you left off"}
              </p>
              <p className="text-sm font-semibold text-bareter-navy dark:text-foreground truncate">
                {item.label}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Dismiss"
              data-testid="button-continue-dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Link href={item.href} className="flex-1" onClick={dismiss}>
              <Button size="sm" variant="bareter" className="w-full text-xs" data-testid="button-continue-action">
                Pick up where I left off →
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Inline Barter Proposals Section ────────────────────────────────
type ProposalWithUser = {
  id: string;
  listingId: string;
  userId: string;
  offerItemName: string;
  offerItemValue: string;
  offerDescription?: string | null;
  images?: string[];
  valuationFairAed?: string | null;
  valuationConfidence?: string | null;
  content: string | null;
  status: string | null;
  counterOfferName?: string | null;
  counterOfferValue?: string | null;
  counterOfferDescription?: string | null;
  counterOfferStatus?: string | null;
  createdAt: string;
  user: { id: string; fullName: string; avatarUrl: string | null };
};

function ListingProposalsSection({ listing, ownerId, showCompose = true }: { listing: ListingWithUser; ownerId: string; showCompose?: boolean }) {
  const { user } = useAuth();
  const { gate: waitlistGate } = useWaitlist();
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [offerName, setOfferName] = useState("");
  const [offerValue, setOfferValue] = useState("");
  const [message, setMessage] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [offerImages, setOfferImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [counterName, setCounterName] = useState("");
  const [counterValue, setCounterValue] = useState("");
  const [counterDesc, setCounterDesc] = useState("");
  const [reviewProposal, setReviewProposal] = useState<{ id: string; otherPartyName: string } | null>(null);

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    try {
      const urls = await Promise.all(Array.from(files).map(async (file) => {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image file`);
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} exceeds 5MB limit`);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "listing");
        const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
        if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Upload failed"); }
        return (await res.json()).url as string;
      }));
      setOfferImages(prev => [...prev, ...urls]);
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message || "Could not upload image", variant: "destructive" });
    } finally {
      setUploadingImages(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const { data: proposals, isLoading } = useQuery<ProposalWithUser[]>({
    queryKey: ["/api/listings", listing.id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/listings/${listing.id}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch proposals");
      return res.json();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/listings/${listing.id}/comments`, {
        offerItemName: offerName.trim(),
        offerItemValue: offerValue,
        content: message.trim() || undefined,
        offerDescription: offerDescription.trim() || undefined,
        images: offerImages,
      });
      return res.json();
    },
    onSuccess: () => {
      setOfferName(""); setOfferValue(""); setMessage("");
      setOfferDescription(""); setOfferImages([]);
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listing.id, "comments"] });
      toast({ title: "Proposal sent!", description: "The owner has been notified." });
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to send proposal", variant: "destructive" }),
  });

  const respondMutation = useMutation({
    mutationFn: async ({ proposalId, status }: { proposalId: string; status: "accepted" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/listings/${listing.id}/proposals/${proposalId}`, { status });
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listing.id, "comments"] });
      if (vars.status === "accepted" && data?.dealId) {
        toast({ title: "Proposal accepted!", description: "Both parties have been notified. Taking you to the deal…" });
        setTimeout(() => navigate(`/deals/${data.dealId}`), 1200);
      } else {
        toast({ title: vars.status === "accepted" ? "Proposal accepted!" : "Proposal declined" });
      }
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to respond", variant: "destructive" }),
  });

  const counterOfferMutation = useMutation({
    mutationFn: async ({ proposalId, name, value, description }: { proposalId: string; name: string; value: string; description: string }) => {
      const res = await apiRequest("POST", `/api/listings/${listing.id}/proposals/${proposalId}/counter`, { name, value, description, images: [] });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listing.id, "comments"] });
      setCounteringId(null); setCounterName(""); setCounterValue(""); setCounterDesc("");
      toast({ title: "Counter-offer sent!" });
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to send counter-offer", variant: "destructive" }),
  });

  const counterRespondMutation = useMutation({
    mutationFn: async ({ proposalId, response }: { proposalId: string; response: "accepted" | "rejected" }) => {
      const res = await apiRequest("POST", `/api/listings/${listing.id}/proposals/${proposalId}/counter-respond`, { response });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", listing.id, "comments"] });
      toast({ title: vars.response === "accepted" ? "Counter-offer accepted!" : "Counter-offer declined" });
      if (vars.response === "accepted") {
        const p = proposals?.find(pr => pr.id === vars.proposalId);
        if (p && user) setReviewProposal({ id: vars.proposalId, otherPartyName: user.id === p.userId ? listing.title : (p.user?.fullName || "Proposer") });
      }
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to respond", variant: "destructive" }),
  });

  const isOwner = user?.id === ownerId;
  const canPropose = !!user && !isOwner;

  const statusBadge = (status: string | null) => {
    if (status === "countered") return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        ↔ Countered
      </span>
    );
    if (status === "accepted") return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        ✓ Accepted
      </span>
    );
    if (status === "rejected") return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
        ✕ Declined
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
        Pending
      </span>
    );
  };

  return (
    <div className="border-t border-bareter-border px-4 py-3 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Barter Proposals {proposals && proposals.length > 0 && `(${proposals.length})`}
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : proposals && proposals.length > 0 ? (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {proposals.map((p) => (
            <div
              key={p.id}
              className={`rounded-lg p-3 border ${
                p.status === "accepted"
                  ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20"
                  : p.status === "rejected"
                  ? "border-red-100 bg-red-50/50 dark:border-red-900 dark:bg-red-950/10 opacity-70"
                  : "border-bareter-border bg-muted/20"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                  <AvatarImage src={p.user?.avatarUrl || undefined} />
                  <AvatarFallback className="text-[10px] bg-bareter-teal text-white">
                    {p.user?.fullName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold">{p.user?.fullName?.split(" ")[0]}</span>
                    <span className="inline-flex items-center gap-1 bg-bareter-teal text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      <ArrowRightLeft className="h-2.5 w-2.5" />
                      {p.offerItemName}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium">
                      AED {Number(p.offerItemValue).toLocaleString()}
                    </span>
                    <ValueMatchBadge
                      offerValue={p.offerItemValue}
                      listingValue={listing.retailValue as string}
                      aiFairValue={p.valuationFairAed}
                      aiConfidence={p.valuationConfidence}
                    />
                    {statusBadge(p.status)}
                  </div>
                  {p.offerDescription && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.offerDescription}</p>
                  )}
                  {p.images && p.images.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {p.images.map((imgUrl, imgIdx) => (
                        <a key={imgIdx} href={imgUrl} target="_blank" rel="noopener noreferrer">
                          <img src={imgUrl} alt={`Offer ${imgIdx + 1}`} className="h-12 w-12 object-cover rounded border hover:opacity-90 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  )}
                  {p.content && (
                    <p className="text-xs text-muted-foreground mt-0.5">{p.content}</p>
                  )}
                </div>
              </div>

              {/* Counter-offer received — proposer responds */}
              {p.status === "countered" && user?.id === p.userId && p.counterOfferStatus === "pending" && (
                <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 p-2.5 space-y-1">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Counter-offer: {p.counterOfferName} — AED {Number(p.counterOfferValue).toLocaleString()}</p>
                  {p.counterOfferDescription && <p className="text-xs text-muted-foreground">{p.counterOfferDescription}</p>}
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => counterRespondMutation.mutate({ proposalId: p.id, response: "accepted" })} className="text-xs font-semibold text-green-700 hover:underline">{t("feed.counterAccept")}</button>
                    <button type="button" onClick={() => counterRespondMutation.mutate({ proposalId: p.id, response: "rejected" })} className="text-xs font-semibold text-red-600 hover:underline">{t("feed.counterDecline")}</button>
                  </div>
                </div>
              )}

              {/* Owner actions: accept / decline / counter */}
              {isOwner && (!p.status || p.status === "pending") && (
                <div className="flex gap-2 mt-2.5 pt-2 border-t border-bareter-border">
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                    onClick={() => respondMutation.mutate({ proposalId: p.id, status: "accepted" })}
                    disabled={respondMutation.isPending}
                  >
                    ✓ {t("feed.counterAccept")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs border-red-300 text-red-600 hover:bg-red-50 gap-1"
                    onClick={() => respondMutation.mutate({ proposalId: p.id, status: "rejected" })}
                    disabled={respondMutation.isPending}
                  >
                    ✕ {t("feed.counterDecline")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-blue-300 text-blue-600 hover:bg-blue-50 gap-1"
                    onClick={() => { setCounteringId(p.id); setCounterName(""); setCounterValue(""); setCounterDesc(""); }}
                  >
                    ↔ Counter
                  </Button>
                </div>
              )}

              {/* Counter-offer form */}
              {isOwner && counteringId === p.id && (
                <div className="mt-2 p-2.5 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 space-y-2">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Propose different terms:</p>
                  <div className="flex gap-2">
                    <input value={counterName} onChange={e => setCounterName(e.target.value)} placeholder="What you offer" className="flex-1 text-xs h-7 px-2 rounded border border-bareter-border bg-white dark:bg-card" />
                    <input type="number" value={counterValue} onChange={e => setCounterValue(e.target.value)} placeholder="AED value" className="w-24 text-xs h-7 px-2 rounded border border-bareter-border bg-white dark:bg-card" />
                  </div>
                  <textarea value={counterDesc} onChange={e => setCounterDesc(e.target.value)} placeholder="Details (optional)" className="w-full text-xs px-2 py-1.5 rounded border border-bareter-border bg-white dark:bg-card resize-none" rows={2} />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setCounteringId(null)} className="text-xs text-muted-foreground hover:underline">{t("feed.counterCancel")}</button>
                    <button type="button" disabled={!counterName || !counterValue || counterOfferMutation.isPending} onClick={() => counterOfferMutation.mutate({ proposalId: p.id, name: counterName, value: counterValue, description: counterDesc })} className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50">Send</button>
                  </div>
                </div>
              )}

              {/* Accepted proposal — link directly to the deal page */}
              {p.status === "accepted" && (
                <div className="mt-2.5 pt-2 border-t border-green-200 dark:border-green-800 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                    onClick={() => (p as any).dealId ? navigate(`/deals/${(p as any).dealId}`) : navigate("/deals")}
                  >
                    🤝 View Deal & Progress
                  </Button>
                  {user && (user.id === p.userId || user.id === ownerId) && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setReviewProposal({ id: p.id, otherPartyName: user.id === p.userId ? listing.title : (p.user?.fullName || "Proposer") })}>
                      ★ Review
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No proposals yet. Be the first to propose a barter!</p>
      )}

      {/* Rejected proposal → Turn into listing nudge (always visible to proposer) */}
      {user && proposals && proposals
        .filter(p => p.userId === user.id && p.status === "rejected")
        .map(p => (
          <div key={`rejected-nudge-${p.id}`} className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Your offer "{p.offerItemName}" was declined.</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">Turn it into a listing so other businesses can find it and propose a barter to you.</p>
            <button
              type="button"
              className="text-xs font-semibold text-bareter-teal hover:underline flex items-center gap-1"
              onClick={() => {
                const params = new URLSearchParams({
                  prefill: "1",
                  title: p.offerItemName,
                  description: p.offerDescription || "",
                  retailValue: p.offerItemValue,
                  images: JSON.stringify(p.images || []),
                });
                window.location.href = `/create-listing?${params.toString()}`;
              }}
            >
              Create a listing with this offer →
            </button>
          </div>
        ))
      }

      {/* Propose form — non-owners only, shown when compose is toggled */}
      {canPropose && showCompose && (
        <div className="pt-2 border-t border-bareter-border space-y-3">
          <p className="text-xs font-semibold text-bareter-navy dark:text-foreground flex items-center gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5 text-bareter-teal" />
            Propose a Barter
          </p>

          {/* Name + value */}
          <div className="flex gap-2">
            <Input
              value={offerName}
              onChange={(e) => setOfferName(e.target.value)}
              placeholder="What are you offering?"
              className="text-sm flex-1 h-9"
            />
            <div className="relative flex-shrink-0 w-28">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">AED</span>
              <Input
                type="number"
                value={offerValue}
                onChange={(e) => setOfferValue(e.target.value)}
                placeholder="Value"
                className="text-sm pl-10 h-9"
                min="1"
              />
            </div>
          </div>

          {/* Description */}
          <Textarea
            value={offerDescription}
            onChange={(e) => setOfferDescription(e.target.value)}
            placeholder="Describe your offer — condition, brand, what's included..."
            className="text-sm resize-none"
            rows={2}
          />

          {/* Image upload — 2 required */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs font-medium flex items-center gap-1">
                <ImageIcon className="h-3.5 w-3.5" />
                Offer Images <span className="text-destructive ml-0.5">*</span>
                <span className="text-muted-foreground font-normal ml-1">({offerImages.length}/2 min)</span>
              </Label>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImages}
                className="text-xs text-bareter-teal hover:underline flex items-center gap-1 disabled:opacity-50"
              >
                {uploadingImages ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Add photos
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleImageUpload(e.target.files)}
              />
            </div>

            {offerImages.length === 0 ? (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImages}
                className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 flex flex-col items-center gap-1.5 text-muted-foreground hover:border-bareter-teal/50 hover:text-bareter-teal transition-colors disabled:opacity-50"
              >
                {uploadingImages ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                <span className="text-xs font-medium">Upload at least 2 photos of your offer</span>
                <span className="text-[11px]">JPG, PNG, WEBP · Max 5MB each</span>
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {offerImages.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-md overflow-hidden border bg-muted group">
                    <img src={url} alt={`Offer ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setOfferImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImages}
                  className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/25 flex items-center justify-center text-muted-foreground hover:border-bareter-teal/50 hover:text-bareter-teal transition-colors disabled:opacity-50"
                >
                  {uploadingImages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
            {offerImages.length > 0 && offerImages.length < 2 && (
              <p className="text-[11px] text-destructive mt-1">Add {2 - offerImages.length} more photo{2 - offerImages.length > 1 ? "s" : ""} to continue</p>
            )}
          </div>

          {/* Message + submit */}
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message (optional)"
              className="text-sm flex-1 h-9"
              onKeyDown={(e) => e.key === "Enter" && offerImages.length >= 2 && (waitlistGate() && submitMutation.mutate())}
            />
            <Button
              size="sm"
              className="h-9 gap-1 bg-bareter-teal hover:bg-bareter-teal/90 text-white shrink-0"
              onClick={() => {
                if (!waitlistGate()) return;
                if (offerImages.length < 2) {
                  toast({ title: "Images required", description: "Please upload at least 2 images of your offer", variant: "destructive" });
                  return;
                }
                submitMutation.mutate();
              }}
              disabled={submitMutation.isPending || !offerName.trim() || !offerValue || offerImages.length < 2}
            >
              {submitMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Propose
            </Button>
          </div>
        </div>
      )}

      {!user && showCompose && (
        <Link href="/login">
          <Button variant="outline" size="sm" className="w-full text-xs">{t("feed.loginToPropose")}</Button>
        </Link>
      )}

      {/* Review modal */}
      {reviewProposal && (
        <ReviewModal
          open={!!reviewProposal}
          onClose={() => setReviewProposal(null)}
          proposalId={reviewProposal.id}
          revieweeName={reviewProposal.otherPartyName}
          listingTitle={listing.title}
        />
      )}
    </div>
  );
}

// ── Instagram-style Listing Feed Card ──────────────────────────────
function ListingFeedCard({ listing }: { listing: ListingWithUser }) {
  const { gate: waitlistGate } = useWaitlist();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [liked, setLiked] = useState(!!(listing as any).isLiked);
  const [likeCount, setLikeCount] = useState(listing.likeCount ?? 0);
  const [showAllWants, setShowAllWants] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showProposals, setShowProposals] = useState(false);

  const isOwnListing = user?.id === listing.userId;
  const { data: followData } = useQuery<{ isFollowing: boolean }>({
    queryKey: ["/api/users", listing.userId, "is-following"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${listing.userId}/is-following`);
      return res.json();
    },
    enabled: !!user && !isOwnListing,
    staleTime: 60_000,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (followData?.isFollowing) {
        await apiRequest("DELETE", `/api/users/${listing.userId}/follow`);
      } else {
        await apiRequest("POST", `/api/users/${listing.userId}/follow`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", listing.userId, "is-following"] });
      toast({ title: followData?.isFollowing ? "Unfollowed" : "Now following" });
    },
  });

  const images = listing.images as string[] | null;
  const exchangeItems = (listing.exchangeItems as Array<{ name: string; isPriority: boolean }> | null) ?? [];
  const wantedCategories = (listing.wantedCategories as string[] | null) ?? [];
  const wants = [...exchangeItems.map((e) => e.name), ...wantedCategories];
  const visibleWants = showAllWants ? wants : wants.slice(0, 3);
  const retailValue = listing.retailValue ? Number(listing.retailValue) : 0;
  const sellerName = (listing as any).user?.fullName || "Bareter Member";
  const description = listing.description || "";
  const shouldTruncate = description.length > 100;
  const displayDesc = expanded || !shouldTruncate ? description : description.slice(0, 100);

  const likeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/listings/${listing.id}/like`);
      return res.json();
    },
    onSuccess: (data) => {
      setLiked(data.liked);
      setLikeCount(data.likeCount);
      queryClient.invalidateQueries({ queryKey: ["/api/listings/liked"] });
    },
    onError: () => toast({ title: "Failed to like", variant: "destructive" }),
  });

  const handleLike = () => {
    if (!waitlistGate()) return;
    likeMutation.mutate();
  };

  const handleContact = (type: "call" | "email" | "message") => {
    if (!waitlistGate()) return;
    const poster = (listing as any).user;
    if (type === "call") {
      if (poster?.phone && poster?.showPhone !== false) {
        window.open(`tel:${poster.phone}`, "_self");
      } else if (poster?.phone) {
        toast({ title: "Phone hidden", description: "They haven't made their number public. Send them a message instead." });
        navigate(`/inbox?userId=${listing.userId}`);
      } else {
        toast({ title: "No phone on file", description: "Opening direct message instead." });
        navigate(`/inbox?userId=${listing.userId}`);
      }
    } else if (type === "email") {
      if (poster?.email && poster?.showEmail !== false) {
        window.open(`mailto:${poster.email}?subject=Barter Inquiry - ${listing.title}`, "_self");
      } else {
        toast({ title: "Email hidden", description: "Opening direct message instead." });
        navigate(`/inbox?userId=${listing.userId}`);
      }
    } else {
      if (poster?.allowDirectMessages === false) {
        toast({ title: "Messaging disabled", description: "This member has disabled direct messages.", variant: "destructive" });
      } else {
        navigate(`/inbox?userId=${listing.userId}`);
      }
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/listings/${listing.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: listing.title, url }); } catch { /* cancelled */ }
    } else {
      setShowShareMenu((p) => !p);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/listings/${listing.id}`);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Error", description: "Failed to copy link", variant: "destructive" });
    }
    setShowShareMenu(false);
  };

  return (
    <div className="bg-white dark:bg-card border border-bareter-border dark:border-border rounded-xl overflow-hidden shadow-sm">
      {/* Header — seller info */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/users/${listing.userId}`}>
          <Avatar className="h-9 w-9">
            <AvatarImage src={(listing as any).user?.avatarUrl || undefined} />
            <AvatarFallback className="bg-bareter-teal text-white text-sm font-bold">
              {sellerName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-bareter-navy dark:text-foreground truncate">{sellerName}</p>
          <p className="text-xs text-bareter-muted">{listing.location || "UAE"}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {user && !isOwnListing && (
            <button
              type="button"
              onClick={() => { if (!waitlistGate()) return; followMutation.mutate(); }}
              disabled={followMutation.isPending}
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                followData?.isFollowing
                  ? "border-bareter-teal text-bareter-teal bg-bareter-teal/10"
                  : "border-bareter-border text-muted-foreground hover:border-bareter-teal hover:text-bareter-teal"
              }`}
            >
              {followData?.isFollowing ? "Following" : "+ Follow"}
            </button>
          )}
          <Badge variant="outline" className="text-[10px] px-2 h-5">
            {(listing.categories as string[])?.[0] ?? listing.type}
          </Badge>
        </div>
      </div>

      {/* Full-width image with price overlay */}
      <Link href={`/listings/${listing.id}`} className="relative block">
        {images?.[0] ? (
          <img
            src={images[0]}
            alt={listing.title}
            className="w-full aspect-[4/3] object-cover hover:opacity-95 transition-opacity"
          />
        ) : (
          <div className="w-full aspect-[4/3] bg-gradient-to-br from-bareter-teal/10 to-bareter-teal/5 flex items-center justify-center">
            <ArrowRightLeft className="h-16 w-16 text-bareter-teal/30" />
          </div>
        )}
        {retailValue > 0 && (
          <div className="absolute bottom-3 right-3">
            <span className="bg-black/60 backdrop-blur-sm text-white text-sm font-semibold px-3 py-1 rounded-lg">
              AED {retailValue.toLocaleString()}
            </span>
          </div>
        )}
      </Link>

      {/* Action row — left: like/comment/share | right: phone/email/dm/bookmark */}
      <div className="px-4 pt-2.5 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleLike} aria-label="Like">
            <Heart className={`h-6 w-6 transition-colors ${liked ? "fill-red-500 text-red-500" : "text-foreground"}`} />
          </button>
          <button
            type="button"
            onClick={() => { if (!waitlistGate()) return; setShowProposals((p) => !p); }}
            aria-label="Proposals"
          >
            <MessageCircle className={`h-6 w-6 transition-colors ${showProposals ? "text-bareter-teal" : "text-foreground"}`} />
          </button>
          <div className="relative">
            <button type="button" onClick={handleShare} aria-label="Share">
              <Share2 className="h-6 w-6 text-foreground" />
            </button>
            {showShareMenu && (
              <div className="absolute top-8 left-0 z-50 bg-background border rounded-md shadow-lg p-1 min-w-[160px]">
                <button onClick={handleCopyLink} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted rounded-sm">
                  <Copy className="h-4 w-4" /> Copy Link
                </button>
                <button
                  onClick={() => { window.open(`https://wa.me/?text=${encodeURIComponent(`${listing.title} - ${window.location.origin}/listings/${listing.id}`)}`, "_blank"); setShowShareMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted rounded-sm"
                >
                  <ExternalLink className="h-4 w-4" /> WhatsApp
                </button>
                <button onClick={() => setShowShareMenu(false)} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted rounded-sm text-muted-foreground">
                  <X className="h-4 w-4" /> Close
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleContact("call")} aria-label="Call">
            <Phone className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleContact("email")} aria-label="Email">
            <Mail className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleContact("message")} aria-label="Message">
            <Send className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={handleLike}
            aria-label="Save to Favorites"
          >
            <Bookmark className={`h-6 w-6 ml-1 transition-colors ${liked ? "fill-bareter-teal text-bareter-teal" : "text-foreground"}`} />
          </button>
        </div>
      </div>

      {/* Like count + title + caption */}
      <div className="px-4 pb-2 space-y-0.5">
        {likeCount > 0 && (
          <p className="text-sm font-semibold text-bareter-navy dark:text-foreground">
            {likeCount.toLocaleString()} {likeCount === 1 ? "like" : "likes"}
          </p>
        )}
        <Link href={`/listings/${listing.id}`}>
          <p className="text-sm font-bold text-bareter-navy dark:text-foreground">{listing.title}</p>
        </Link>
        {description && (
          <p className="text-sm text-foreground leading-snug">
            <span className="font-semibold mr-1">{sellerName.split(" ")[0]}</span>
            {displayDesc}
            {shouldTruncate && !expanded && (
              <button onClick={() => setExpanded(true)} className="text-muted-foreground ml-1">
                ...more
              </button>
            )}
          </p>
        )}
      </div>

      {/* Offering + Willing to Barter For */}
      {(retailValue > 0 || wants.length > 0) && (
        <div className="mx-4 mb-4 mt-1.5 rounded-lg bg-muted/30 p-3 space-y-2.5">
          {retailValue > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                Offering
              </p>
              <span className="inline-flex items-center gap-1.5 bg-green-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                <ArrowRightLeft className="h-3 w-3 flex-shrink-0" />
                {listing.title.length > 28 ? listing.title.slice(0, 28) + "…" : listing.title}
                <span className="opacity-80 ml-0.5">AED {retailValue.toLocaleString()}</span>
              </span>
            </div>
          )}
          {wants.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                Willing to barter for
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visibleWants.map((item, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 border border-bareter-border rounded-full text-xs px-2.5 py-1 text-bareter-navy dark:text-foreground bg-white dark:bg-card"
                  >
                    <Search className="h-3 w-3 text-bareter-muted flex-shrink-0" />
                    {item}
                  </span>
                ))}
                {wants.length > 3 && !showAllWants && (
                  <button
                    type="button"
                    onClick={() => setShowAllWants(true)}
                    className="text-xs font-semibold text-bareter-teal"
                  >
                    +{wants.length - 3} more
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Proposals — inline, directly below "Willing to barter for" */}
          <div className="-mx-3 -mb-3 mt-1">
            <ListingProposalsSection listing={listing} ownerId={listing.userId} showCompose={showProposals} />
          </div>
        </div>
      )}

      {/* Propose a Different Barter CTA — below the box */}
      {(retailValue > 0 || wants.length > 0) && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => { if (!waitlistGate()) return; setShowProposals((p) => !p); }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-bareter-border text-xs font-semibold text-bareter-navy dark:text-foreground hover:bg-white dark:hover:bg-card transition-colors"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-bareter-teal" />
            {showProposals ? "Hide Proposals" : "Propose a Different Barter"}
          </button>
        </div>
      )}
    </div>
  );
}

function newFeedSeed() { return Math.floor(Math.random() * 2147483647); }

export function FeedPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [activeCategory, setActiveCategory] = useState("All");
  const [feedSeed, setFeedSeed] = useState(() => {
    try {
      const stored = sessionStorage.getItem("bareter_feed_seed");
      return stored ? parseInt(stored, 10) : (() => { const s = newFeedSeed(); sessionStorage.setItem("bareter_feed_seed", String(s)); return s; })();
    } catch { return newFeedSeed(); }
  });
  const [refreshedAt, setRefreshedAt] = useState<Date>(() => new Date());

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

  // Listings feed — Instagram-style listing cards
  const listingsParams = new URLSearchParams({ limit: "20", sort: "newest", seed: String(feedSeed) });
  Object.entries(locationParams(activeLocation)).forEach(([k, v]) => listingsParams.set(k, v));
  if (activeCategory !== "All") listingsParams.set("category", activeCategory);

  const { data: feedListings, isLoading: listingsLoading, refetch: refetchListings } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings/feed", activeCategory, activeLocation.country, activeLocation.city, feedSeed],
    queryFn: async () => {
      const res = await fetch(`/api/listings?${listingsParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch listings");
      return res.json();
    },
  });

  const handleRefreshFeed = () => {
    const s = newFeedSeed();
    try { sessionStorage.setItem("bareter_feed_seed", String(s)); } catch {}
    setFeedSeed(s);
    setRefreshedAt(new Date());
  };

  const { data: trendingListings } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings/trending"],
    queryFn: async () => {
      const res = await fetch("/api/listings/trending?limit=10", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Feed is now visible to logged-out visitors (waitlist mode). Every
  // interactive action gates through the waitlist dialog (see FeedCard,
  // CommentsSection, StoriesRow, FeedSidebar). Share/copy-link remain open.
  if (false && !authLoading && !user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 sm:py-20" data-testid="feed-auth-gate">
        <Card>
          <CardContent className="py-12 sm:py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <Heart className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-3" data-testid="text-feed-gate-title">
              Sign in to see the Feed
            </h1>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto" data-testid="text-feed-gate-desc">
              The Bareter Feed is a private space for verified members to share offers, requests, and updates. Sign in to continue, or join the waitlist if you are new.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => navigate("/login")} data-testid="button-feed-gate-login">
                Sign In
              </Button>
              <Button variant="outline" onClick={() => navigate("/register")} data-testid="button-feed-gate-register">
                Join the Waitlist
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-0 sm:px-4 pb-4 sm:pb-8">
      <div className="flex gap-8">
        <div className="flex-1 max-w-xl mx-auto lg:mx-0 lg:max-w-none lg:flex-[3]">
          <StoriesRow />

          {/* ── Trending / Hot listings strip ── */}
          {trendingListings && trendingListings.length > 0 && (
            <div className="mt-3 mb-1" data-testid="trending-strip">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1 px-4 sm:px-0">
                <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
                🔥 Trending This Week
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2 px-4 sm:px-0 snap-x scrollbar-hide">
                {trendingListings.map((l) => (
                  <Link
                    key={l.id}
                    href={`/listings/${l.id}`}
                    className="shrink-0 w-40 snap-start rounded-xl border border-bareter-border bg-white dark:bg-card overflow-hidden hover:shadow-bareter-hover transition-shadow"
                  >
                    {(l.images as string[])?.[0] ? (
                      <img src={(l.images as string[])[0]} alt={l.title} className="w-full h-24 object-cover" />
                    ) : (
                      <div className="w-full h-24 bg-muted/30 flex items-center justify-center">
                        <ArrowRightLeft className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs font-semibold line-clamp-2 text-bareter-navy dark:text-foreground">{l.title}</p>
                      {l.retailValue && <p className="text-xs text-bareter-teal font-bold mt-0.5">AED {Number(l.retailValue).toLocaleString()}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <SafetyBanner />
          <AiMatchCards />
          <CategoryTabs activeCategory={activeCategory} onCategoryChange={setActiveCategory} />

          {/* ── Listings feed — Instagram-style ── */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3 px-0.5">
              <div>
                <h2 className="text-sm font-bold text-bareter-navy dark:text-foreground uppercase tracking-wider">
                  {t("feed.latestListings")}
                </h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Refreshed {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefreshFeed}
                  className="flex items-center gap-1 text-xs font-semibold text-bareter-teal hover:text-bareter-teal/80 transition-colors"
                  title="Refresh listings"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
                <Link href="/browse" className="text-xs font-semibold text-bareter-teal hover:underline">
                  Browse all →
                </Link>
              </div>
            </div>
            {listingsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-80 rounded-xl" />
                ))}
              </div>
            ) : feedListings && feedListings.length > 0 ? (
              <div className="space-y-4">
                {feedListings.slice(0, 10).map((listing, idx) => (
                  <div key={listing.id}>
                    <ListingFeedCard listing={listing} />
                    {/* Inject a social post every 3 listings */}
                    {posts && posts[Math.floor(idx / 3)] && idx % 3 === 2 && (
                      <div className="mt-4">
                        <FeedCard post={posts[Math.floor(idx / 3)]} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Plus className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-semibold mb-1">{t("feed.noListingsYet")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t("feed.beFirst")}</p>
                  {user && (
                    <Link href="/create-listing">
                      <Button variant="bareter" size="sm">{t("nav.createListing")}</Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Social Posts feed ── */}
          {posts && posts.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3 px-0.5">
                <h2 className="text-sm font-bold text-bareter-navy dark:text-foreground uppercase tracking-wider">
                  {t("feed.communityPosts")}
                </h2>
              </div>
              <div className="space-y-4 sm:space-y-6">
                {isLoading ? (
                  [...Array(3)].map((_, i) => <FeedCardSkeleton key={i} />)
                ) : (
                  posts.map((post) => <FeedCard key={post.id} post={post} />)
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0 pt-4 sticky top-16 z-50 self-start h-[calc(100vh-5rem)] overflow-y-auto" data-testid="feed-sidebar">
          <FeedSidebar posts={posts} />
        </aside>
      </div>
      <ContinueWhereLeftOff />
    </div>
  );
}
