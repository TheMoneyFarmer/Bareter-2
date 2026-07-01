import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Camera,
  MapPin,
  Shield,
  ArrowLeft,
  Users,
  Package,
  ImageIcon,
  Video,
  Upload,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";
import { API_BASE, assetUrl } from "@/lib/queryClient";
import { ListingCard as BrandListingCard } from "@/components/ListingCard";
import { useSeo } from "@/hooks/use-seo";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

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

function PortfolioMediaCard({ item }: { item: PortfolioItem }) {
  const url = assetUrl(item.mediaUrl);
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
      {item.mediaType === "video" ? (
        <>
          <video
            src={url}
            className="w-full h-full object-cover"
            muted
            preload="metadata"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
            <Video className="h-8 w-8 text-white drop-shadow" />
          </div>
        </>
      ) : (
        <img
          src={url}
          alt={item.caption ?? "Portfolio item"}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )}
      {item.caption && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-[11px] line-clamp-2">{item.caption}</p>
        </div>
      )}
    </div>
  );
}

function CreatorStorefrontSkeleton() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-8">
      <Skeleton className="h-5 w-24" />
      <div className="flex items-start gap-5">
        <Skeleton className="h-20 w-20 rounded-full flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function CreatorStorefrontPage() {
  const { userId } = useParams<{ userId: string }>();
  const { user: loggedInUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useQuery<CreatorStorefrontData | null>({
    queryKey: ["/api/creators", userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/creators/${userId}`, {
        credentials: "include",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load creator profile");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 60_000,
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
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
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creators", userId] });
      toast({ title: "Portfolio item added!" });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = "";
  };

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
        <Link href="/browse" className="text-primary text-sm font-medium hover:underline">
          Browse listings
        </Link>
      </div>
    );
  }

  const { user, portfolio, activeListings, displayName, bio, niche, primaryPlatform, audienceSize, totalCompletedDeals } = data as CreatorStorefrontData;
  const isOwner = !!loggedInUser && loggedInUser.id === data.userId;
  const initials = displayName?.slice(0, 2).toUpperCase() ?? "CR";

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-8">
      {/* Back navigation */}
      <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Browse creators
      </Link>

      {/* Profile header */}
      <Card className="bareter-card">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <Avatar className="h-20 w-20 flex-shrink-0 ring-2 ring-bareter-teal/20">
              <AvatarImage src={assetUrl(user?.avatarUrl)} alt={displayName} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
                {user?.isVerified && (
                  <Shield className="h-5 w-5 text-bareter-teal flex-shrink-0" />
                )}
                <Badge variant="outline" className="gap-1 text-xs border-violet-300 text-violet-700 bg-violet-50">
                  <Camera className="h-3 w-3" />
                  Creator
                </Badge>
              </div>

              {user?.fullName && user.fullName !== displayName && (
                <p className="text-sm text-muted-foreground mb-1">{user.fullName}</p>
              )}

              {(user?.city || user?.country) && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                  <MapPin className="h-3.5 w-3.5" />
                  {[user.city, user.country].filter(Boolean).join(", ")}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mb-3">
                {niche && (
                  <Badge variant="secondary" className="text-xs">{niche}</Badge>
                )}
                {primaryPlatform && (
                  <Badge variant="outline" className="text-xs">{primaryPlatform}</Badge>
                )}
                {audienceSize && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Users className="h-3 w-3" />
                    {audienceSize}
                  </Badge>
                )}
              </div>

              {bio && (
                <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">{bio}</p>
              )}
            </div>
          </div>

          {/* Stats row */}
          {totalCompletedDeals > 0 && (
            <div className="mt-5 pt-5 border-t border-border flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{totalCompletedDeals}</p>
                <p className="text-xs text-muted-foreground">Completed deals</p>
              </div>
              {portfolio.length > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{portfolio.length}</p>
                  <p className="text-xs text-muted-foreground">Portfolio items</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden file input for portfolio upload */}
      {isOwner && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileChange}
        />
      )}

      {/* Portfolio grid */}
      {(portfolio.length > 0 || isOwner) && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
              Portfolio
            </h2>
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                disabled={uploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-portfolio"
              >
                {uploadMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Upload className="h-3.5 w-3.5" />}
                Upload
              </Button>
            )}
          </div>
          {portfolio.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {portfolio.map((item: PortfolioItem) => (
                <PortfolioMediaCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="portfolio-empty-upload-cta"
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">Upload your first portfolio item</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Images and videos supported</p>
            </div>
          )}
        </section>
      )}

      {/* Active listings */}
      {activeListings.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            Active listings
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(activeListings as any[]).map((listing) => (
              <BrandListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </section>
      )}

      {portfolio.length === 0 && activeListings.length === 0 && !isOwner && (
        <div className="text-center py-12 text-muted-foreground">
          <Camera className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No portfolio or listings yet.</p>
        </div>
      )}
    </div>
  );
}
