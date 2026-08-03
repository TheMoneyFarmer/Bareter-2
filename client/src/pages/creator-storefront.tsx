import { useParams, useLocation, Link } from "wouter";
import { BackButton } from "@/components/BackButton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Camera,
  MapPin,
  Shield,
  Users,
  Play,
  Upload,
  Loader2,
  ArrowLeftRight,
  Clapperboard,
  ImageIcon,
  Plus,
  Trash2,
  Package,
  Star,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { API_BASE, assetUrl, apiRequest } from "@/lib/queryClient";
import { ListingCard as BrandListingCard } from "@/components/ListingCard";
import { useSeo } from "@/hooks/use-seo";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────

interface PortfolioItem {
  id: string;
  mediaUrl: string;
  mediaType: string;
  caption?: string | null;
  createdAt: string;
}

interface CreatorStorefrontData {
  id: string;
  userId: string;
  displayName: string;
  bio?: string | null;
  niche?: string | null;
  primaryPlatform?: string | null;
  audienceSize?: string | null;
  createdAt: string;
  portfolio: PortfolioItem[];
  activeListings: any[];
  totalCompletedDeals: number;
  user: {
    id: string;
    fullName: string;
    avatarUrl?: string | null;
    city?: string | null;
    country?: string | null;
    isVerified?: boolean;
  } | null;
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function CreatorStorefrontSkeleton() {
  return (
    <div className="min-h-screen bg-bareter-off-white dark:bg-background">
      <Skeleton className="w-full h-48 rounded-none" />
      <div className="container mx-auto max-w-4xl px-4">
        <div className="flex items-end gap-4 -mt-12 mb-6">
          <Skeleton className="h-24 w-24 rounded-full ring-4 ring-background flex-shrink-0" />
          <div className="space-y-2 pb-2 flex-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

// ── Portfolio media card ────────────────────────────────────────────────────

function PortfolioMediaCard({
  item,
  isOwner,
  onDelete,
}: {
  item: PortfolioItem;
  isOwner: boolean;
  onDelete: (id: string) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = assetUrl(item.mediaUrl);

  function handleClick() {
    if (item.mediaType !== "video") return;
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play();
      setPlaying(true);
    }
  }

  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-muted group cursor-pointer">
      {item.mediaType === "video" ? (
        <>
          <video
            ref={videoRef}
            src={url}
            className="w-full h-full object-cover"
            preload="metadata"
            playsInline
            loop
            onClick={handleClick}
            onEnded={() => setPlaying(false)}
          />
          {!playing && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors"
              onClick={handleClick}
            >
              <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                <Play className="h-5 w-5 text-white fill-white ml-0.5" />
              </div>
            </div>
          )}
          {/* Reel badge */}
          <span className="absolute top-1.5 start-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold text-white bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
            <Clapperboard className="h-2.5 w-2.5" />
            Reel
          </span>
        </>
      ) : (
        <img
          src={url}
          alt={item.caption ?? "Portfolio item"}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      )}

      {/* Caption on hover */}
      {item.caption && (
        <div className="absolute bottom-0 start-0 end-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-[10px] line-clamp-2">{item.caption}</p>
        </div>
      )}

      {/* Owner delete button */}
      {isOwner && (
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="absolute top-1.5 end-1.5 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Stat pill ──────────────────────────────────────────────────────────────

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/10 text-center">
      <div className="text-white/80">{icon}</div>
      <p className="text-white font-bold text-lg leading-none">{value}</p>
      <p className="text-white/60 text-[10px] uppercase tracking-wider">{label}</p>
    </div>
  );
}

// ── Creator listing barter card ────────────────────────────────────────────

function CreatorBarterCard({ listing }: { listing: any }) {
  const [, navigate] = useLocation();
  const images = (listing.images as string[] | undefined) ?? [];
  const thumb = images[0] ? assetUrl(images[0]) : null;
  const wanted = (listing.wantedCategories as string[] | undefined) ?? [];

  return (
    <div className="bg-white dark:bg-card rounded-xl border border-bareter-border dark:border-border overflow-hidden flex gap-0">
      {/* Thumbnail */}
      <div className="w-28 h-28 flex-shrink-0 bg-muted relative overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={listing.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
        <div>
          <p className="text-sm font-semibold text-bareter-navy dark:text-foreground line-clamp-2 leading-snug">
            {listing.title}
          </p>
          {listing.description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{listing.description}</p>
          )}
        </div>

        <div className="space-y-1.5 mt-2">
          {/* Exchange value */}
          {listing.retailValue && (
            <p className="text-[10px] text-muted-foreground">
              Exchange value: <span className="font-semibold text-foreground">AED {parseFloat(listing.retailValue).toLocaleString()}</span>
            </p>
          )}

          {/* What they want */}
          {wanted.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-muted-foreground">Looking for:</span>
              {wanted.slice(0, 3).map((cat: string) => (
                <span key={cat} className="text-[10px] bg-bareter-teal-muted text-bareter-teal px-1.5 py-0.5 rounded-full font-medium">
                  {cat}
                </span>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate(`/listings/${listing.id}`)}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-bareter-teal hover:underline"
          >
            <ArrowLeftRight className="h-2.5 w-2.5" />
            Propose barter
            <ChevronRight className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function CreatorStorefrontPage() {
  const { userId } = useParams<{ userId: string }>();
  const [, navigate] = useLocation();
  const { user: loggedInUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, isError } = useQuery<CreatorStorefrontData | null>({
    queryKey: ["/api/creators", userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/creators/${userId}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load creator profile");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 60_000,
    retry: false,
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await fetch(`${API_BASE}/api/creators/${userId}/portfolio/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove item");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creators", userId] });
      toast({ title: "Portfolio item removed" });
    },
    onError: () => toast({ title: "Failed to remove item", variant: "destructive" }),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // Client-side video duration check
    if (file.type.startsWith("video/")) {
      try {
        await new Promise<void>((resolve, reject) => {
          const video = document.createElement("video");
          video.preload = "metadata";
          video.onloadedmetadata = () => {
            URL.revokeObjectURL(video.src);
            if (video.duration > 22) {
              reject(new Error(`Video is ${Math.round(video.duration)}s — max 20 seconds allowed.`));
            } else {
              resolve();
            }
          };
          video.onerror = () => reject(new Error("Could not read video file."));
          video.src = URL.createObjectURL(file);
        });
      } catch (err: any) {
        toast({ title: err.message, variant: "destructive" });
        return;
      }
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/creators/${userId}/portfolio`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/creators", userId] });
      toast({ title: file.type.startsWith("video/") ? "Reel added!" : "Photo added!" });
    } catch (err: any) {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  useSeo({
    title: data?.displayName ? `${data.displayName} — Bareter` : "Creator — Bareter",
  });

  if (isLoading) return <CreatorStorefrontSkeleton />;

  if (isError || !data) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
        <Camera className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Creator not found</h1>
        <p className="text-muted-foreground mb-6">This creator profile doesn't exist or has been removed.</p>
        <Link href="/browse" className="text-primary text-sm font-medium hover:underline">Browse listings</Link>
      </div>
    );
  }

  const { user, portfolio, activeListings, displayName, bio, niche, primaryPlatform, audienceSize, totalCompletedDeals } = data;
  const isOwner = !!loggedInUser && loggedInUser.id === data.userId;
  const initials = displayName?.slice(0, 2).toUpperCase() ?? "CR";

  const images = portfolio.filter(p => p.mediaType === "image");
  const reels  = portfolio.filter(p => p.mediaType === "video");
  const imageCount = images.length;
  const canAddImage = imageCount < 5;

  // Split listings: "what I offer" = all creator service listings
  // "what I want" is embedded in wantedCategories on each listing
  const creatorListings = activeListings.filter(l =>
    l.listingType === "creator_service" || l.listingType === "individual_item" || l.isCollab
  );

  return (
    <div className="min-h-screen bg-bareter-off-white dark:bg-background">
      {/* ── ① Cover banner + avatar ─────────────────────────────────────────── */}
      <div className="relative w-full h-48 sm:h-56 overflow-hidden">
        {/* Purple-violet gradient cover — creator identity colour */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900 via-purple-800 to-fuchsia-700" />
        {/* Subtle noise texture overlay */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white to-transparent" />

        <div className="absolute top-4 start-4">
          <BackButton fallback="/creators" label="Creators" variant="overlay" />
        </div>
        {isOwner && (
          <div className="absolute top-4 end-4">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs bg-black/20 border-white/30 text-white hover:bg-black/30 hover:text-white backdrop-blur-sm"
              onClick={() => navigate("/settings?tab=creator")}
            >
              Edit profile
            </Button>
          </div>
        )}

        {/* Stat pills sit at the bottom of the cover */}
        <div className="absolute bottom-4 start-4 end-4 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {primaryPlatform && (
            <StatPill
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="Platform"
              value={primaryPlatform}
            />
          )}
          {audienceSize && (
            <StatPill
              icon={<Users className="h-3.5 w-3.5" />}
              label="Audience"
              value={audienceSize}
            />
          )}
          {niche && (
            <StatPill
              icon={<Star className="h-3.5 w-3.5" />}
              label="Niche"
              value={niche}
            />
          )}
          {totalCompletedDeals > 0 && (
            <StatPill
              icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
              label="Deals done"
              value={totalCompletedDeals}
            />
          )}
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4">
        {/* Avatar + name row */}
        <div className="flex items-end gap-4 -mt-12 mb-5">
          <Avatar className="h-24 w-24 flex-shrink-0 ring-4 ring-background shadow-lg">
            <AvatarImage src={assetUrl(user?.avatarUrl)} alt={displayName} />
            <AvatarFallback className="bg-violet-700 text-white text-2xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="pb-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground leading-tight">{displayName}</h1>
              {user?.isVerified && (
                <Shield className="h-5 w-5 text-bareter-teal flex-shrink-0" />
              )}
              <Badge className="gap-1 text-xs bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800">
                <Camera className="h-3 w-3" />
                Creator
              </Badge>
            </div>
            {(user?.city || user?.country) && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                {[user?.city, user?.country].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Bio */}
        {bio && (
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-6 border-b border-border pb-5">
            {bio}
          </p>
        )}

        {/* ── ② Portfolio / Work section ─────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                My Work
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {imageCount}/5 photos · {reels.length} reel{reels.length !== 1 ? "s" : ""}
              </p>
            </div>
            {isOwner && (
              <div className="flex items-center gap-1.5">
                {(canAddImage || reels.length === 0) && (
                  <p className="text-[10px] text-muted-foreground hidden sm:block">
                    {canAddImage ? `${5 - imageCount} photo slots left` : "Photo slots full"} · Videos ≤ 20s
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Plus className="h-3.5 w-3.5" />}
                  Add
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}
          </div>

          {portfolio.length === 0 ? (
            isOwner ? (
              <div
                className="border-2 border-dashed border-violet-200 dark:border-violet-800 rounded-xl p-10 text-center cursor-pointer hover:border-violet-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex items-center justify-center gap-3 mb-3">
                  <ImageIcon className="h-8 w-8 text-violet-300" />
                  <Clapperboard className="h-8 w-8 text-violet-300" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Add photos or short reels</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Up to 5 photos · Videos max 20 seconds</p>
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No work posted yet.</p>
              </div>
            )
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {portfolio.map(item => (
                <PortfolioMediaCard
                  key={item.id}
                  item={item}
                  isOwner={isOwner}
                  onDelete={id => deleteItemMutation.mutate(id)}
                />
              ))}
              {/* Owner: add slot if space left */}
              {isOwner && (
                <div
                  className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-violet-400 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">
                    Photo or<br />Reel
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── ③ Barter board: What I offer / What I want ─────────────────────── */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-bareter-teal" />
                What I offer · What I'm looking for
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                All exchanges are barter — no cash transactions
              </p>
            </div>
            {isOwner && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => navigate("/create-listing?mode=creator_service")}
              >
                <Plus className="h-3.5 w-3.5" />
                Add service
              </Button>
            )}
          </div>

          {creatorListings.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
              <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No barter offers yet</p>
              {isOwner && (
                <Button
                  size="sm"
                  className="mt-4 gap-1.5 text-xs"
                  onClick={() => navigate("/create-listing?mode=creator_service")}
                >
                  <Plus className="h-3.5 w-3.5" />
                  List your first service
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {creatorListings.map(listing => (
                <CreatorBarterCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
