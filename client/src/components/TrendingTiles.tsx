import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Heart, Package, TrendingUp, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ListingWithUser, PostWithUser, User } from "@shared/schema";

type TileUser = Pick<User, "id" | "fullName"> & Partial<Pick<User, "username" | "avatarUrl">>;

interface TrendingTilesProps {
  title?: string;
  maxTiles?: number;
  listings?: ListingWithUser[];
  className?: string;
}

type Tile =
  | { kind: "post"; id: string; cover: string | null; title: string; href: string; user: TileUser; likes: number }
  | { kind: "listing"; id: string; cover: string | null; title: string; href: string; user: TileUser; value: number };

export function TrendingTiles({
  title = "Trending now",
  maxTiles = 9,
  listings,
  className = "",
}: TrendingTilesProps) {
  const { data: trendingPosts } = useQuery<PostWithUser[]>({
    queryKey: ["/api/posts/trending"],
  });
  const { data: fallbackListings } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings"],
    enabled: !listings,
  });

  const sourceListings = listings ?? fallbackListings ?? [];

  const tilesPosts: Tile[] = (trendingPosts ?? []).slice(0, 6).map((p) => ({
    kind: "post",
    id: p.id,
    cover: p.mediaUrls?.[0] || null,
    title: p.title || p.caption || "Untitled post",
    href: `/feed#post-${p.id}`,
    user: p.user,
    likes: p.likeCount || 0,
  }));
  const tilesListings: Tile[] = sourceListings.slice(0, 6).map((l) => ({
    kind: "listing",
    id: l.id,
    cover: (l.images as string[] | undefined)?.[0] || null,
    title: l.title,
    href: `/listings/${l.id}`,
    user: l.user,
    value: parseFloat(l.retailValue as string) || 0,
  }));

  const interleaved: Tile[] = [];
  const max = Math.max(tilesPosts.length, tilesListings.length);
  for (let i = 0; i < max; i++) {
    if (tilesPosts[i]) interleaved.push(tilesPosts[i]);
    if (tilesListings[i]) interleaved.push(tilesListings[i]);
  }
  const tiles = interleaved.slice(0, maxTiles);
  if (tiles.length === 0) return null;

  return (
    <section className={className}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2
          className="text-lg font-semibold text-bareter-navy dark:text-foreground"
          data-testid="text-trending-title"
        >
          {title}
        </h2>
      </div>
      <div className="grid grid-cols-3 gap-1 sm:gap-2" data-testid="grid-browse-trending">
        {tiles.map((t) => (
          <Link key={`${t.kind}-${t.id}`} href={t.href}>
            <div
              className="relative aspect-square overflow-hidden bg-muted group rounded-sm sm:rounded-md cursor-pointer"
              data-testid={`tile-trending-${t.kind}-${t.id}`}
            >
              {t.cover ? (
                <img
                  src={t.cover}
                  alt={t.title}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                  {t.kind === "post" ? (
                    <Zap className="h-8 w-8 text-primary/40" />
                  ) : (
                    <Package className="h-8 w-8 text-primary/40" />
                  )}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
                <p className="text-white text-[11px] sm:text-xs font-medium line-clamp-1">{t.title}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-white/80 truncate">{t.user?.fullName ?? ""}</span>
                  {t.kind === "post" ? (
                    <span className="text-[10px] text-white/90 inline-flex items-center gap-0.5">
                      <Heart className="h-2.5 w-2.5" />
                      {t.likes}
                    </span>
                  ) : t.value > 0 ? (
                    <span className="text-[10px] text-white/90 font-medium">
                      AED {Math.round(t.value).toLocaleString()}
                    </span>
                  ) : null}
                </div>
              </div>
              <Badge
                variant="secondary"
                className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0 h-4 bg-black/50 text-white border-0 backdrop-blur-sm"
              >
                {t.kind === "post" ? "Post" : "Listing"}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
