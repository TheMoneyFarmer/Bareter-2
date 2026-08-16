import { useParams, useLocation, Link } from "wouter";
import { BackButton } from "@/components/BackButton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Camera,
  MapPin,
  Shield,
  Users,
  Play,
  Loader2,
  ArrowLeftRight,
  Clapperboard,
  ImageIcon,
  Plus,
  Trash2,
  Package,
  ChevronRight,
  Settings,
  Save,
} from "lucide-react";
import { API_BASE, assetUrl } from "@/lib/queryClient";
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
            muted
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

// ── Stat chip (below cover) ────────────────────────────────────────────────

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 border border-border text-sm">
      <span className="text-bareter-teal">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider leading-none mb-0.5">{label}</p>
        <p className="font-semibold text-foreground text-sm leading-none truncate">{value}</p>
      </div>
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

// ── Platform + niche options ───────────────────────────────────────────────

const PLATFORMS = ["Instagram", "TikTok", "YouTube", "Twitter / X", "LinkedIn", "Snapchat", "Pinterest", "Facebook", "Podcast", "Blog", "Other"];
const NICHES = ["Fashion", "Beauty", "Tech", "Food", "Travel", "Lifestyle", "Fitness", "Business", "Finance", "Entertainment", "Gaming", "Education", "Health", "Parenting", "Sports", "Art", "Music", "Comedy", "News", "Other"];

// ── Inline creator edit sheet ──────────────────────────────────────────────

function CreatorEditSheet({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: any;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [niche, setNiche] = useState(profile.niche ?? "");
  const [platform, setPlatform] = useState(profile.primaryPlatform ?? "");
  const [audienceSize, setAudienceSize] = useState(profile.audienceSize ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDisplayName(profile.displayName ?? "");
    setBio(profile.bio ?? "");
    setNiche(profile.niche ?? "");
    setPlatform(profile.primaryPlatform ?? "");
    setAudienceSize(profile.audienceSize ?? "");
  }, [open, profile.id]);

  async function handleSave() {
    if (!displayName.trim()) return toast({ title: "Display name is required", variant: "destructive" });
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/creators/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim() || undefined,
          niche: niche || undefined,
          primaryPlatform: platform || undefined,
          audienceSize: audienceSize.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Save failed");
      }
      toast({ title: "Profile saved!" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: err.message || "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Edit creator profile
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-5">

            {/* Display name */}
            <div className="space-y-1.5">
              <Label htmlFor="cr-displayname" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Creator name *</Label>
              <Input
                id="cr-displayname"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your creator handle or name"
                maxLength={100}
              />
            </div>

            {/* Bio */}
            <div className="space-y-1.5">
              <Label htmlFor="cr-bio" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bio</Label>
              <Textarea
                id="cr-bio"
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Tell brands and the community what you're about…"
                maxLength={500}
                rows={3}
                className="resize-none text-sm"
              />
              <p className="text-[10px] text-muted-foreground text-right">{bio.length}/500</p>
            </div>

            {/* Platform */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Primary platform</Label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform((cur: string) => cur === p ? "" : p)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      platform === p
                        ? "bg-bareter-teal text-white border-bareter-teal"
                        : "bg-muted text-muted-foreground border-border hover:border-bareter-teal/50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Niche */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Niche / content type</Label>
              <div className="flex flex-wrap gap-1.5">
                {NICHES.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNiche((cur: string) => cur === n ? "" : n)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      niche === n
                        ? "bg-bareter-navy text-white border-bareter-navy"
                        : "bg-muted text-muted-foreground border-border hover:border-bareter-navy/40"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Audience size */}
            <div className="space-y-1.5">
              <Label htmlFor="cr-audience" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audience size</Label>
              <Input
                id="cr-audience"
                value={audienceSize}
                onChange={e => setAudienceSize(e.target.value)}
                placeholder="e.g. 10K–50K, 200K, 1M+"
                maxLength={50}
              />
              <p className="text-[10px] text-muted-foreground">Self-reported — shown on your public profile as a barter signal.</p>
            </div>
          </div>
        </ScrollArea>

        {/* Sticky save footer */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0 bg-background">
          <Button className="w-full gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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
  const [editOpen, setEditOpen] = useState(false);

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

      {/* ── ① Cover banner — brand navy/teal, no content inside ──────────── */}
      <div className="relative w-full h-44 sm:h-56 bg-bareter-navy overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-bareter-navy via-bareter-navy/90 to-bareter-teal/50" />
        <div className="absolute top-4 start-4">
          <BackButton fallback="/creators" label="Creators" variant="overlay" />
        </div>
        {isOwner && (
          <div className="absolute top-4 end-4">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs bg-black/20 border-white/30 text-white hover:bg-black/30 hover:text-white backdrop-blur-sm"
              onClick={() => setEditOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              Edit profile
            </Button>
          </div>
        )}
      </div>

      <div className="container mx-auto max-w-4xl px-4">

        {/* ── Avatar + name — overlaps cover ──────────────────────────────── */}
        <div className="flex items-end gap-4 -mt-10 mb-4">
          <Avatar className="h-20 w-20 flex-shrink-0 ring-4 ring-background shadow-md">
            <AvatarImage src={assetUrl(user?.avatarUrl)} alt={displayName} />
            <AvatarFallback className="bg-bareter-navy text-white text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* ── Name + badges ───────────────────────────────────────────────── */}
        <div className="space-y-2 pb-4 border-b border-border">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground leading-tight">{displayName}</h1>
            {user?.isVerified && (
              <Shield className="h-5 w-5 text-bareter-teal flex-shrink-0" />
            )}
            <Badge variant="outline" className="gap-1 text-xs border-bareter-teal/40 text-bareter-teal bg-bareter-teal/5">
              <Camera className="h-3 w-3" />
              Creator
            </Badge>
          </div>

          {(user?.city || user?.country) && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              {[user?.city, user?.country].filter(Boolean).join(", ")}
            </p>
          )}

          {/* ── Stat chips — horizontal row, never inside cover ────────── */}
          {(primaryPlatform || audienceSize || niche || totalCompletedDeals > 0) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {primaryPlatform && (
                <StatChip icon={<Camera className="h-3.5 w-3.5" />} label="Platform" value={primaryPlatform} />
              )}
              {audienceSize && (
                <StatChip icon={<Users className="h-3.5 w-3.5" />} label="Audience" value={audienceSize} />
              )}
              {niche && (
                <StatChip icon={<ArrowLeftRight className="h-3.5 w-3.5" />} label="Niche" value={niche} />
              )}
              {totalCompletedDeals > 0 && (
                <StatChip icon={<ArrowLeftRight className="h-3.5 w-3.5" />} label="Deals done" value={totalCompletedDeals} />
              )}
            </div>
          )}

          {bio && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl pt-1">
              {bio}
            </p>
          )}
        </div>

        {/* ── ② Portfolio / Work section ─────────────────────────────────────── */}
        <section className="mb-10 mt-6">
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

      {/* ── Inline creator edit sheet ── */}
      <CreatorEditSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        profile={data}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/creators", userId] })}
      />
    </div>
  );
}
