import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, ArrowRight, Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { assetUrl } from "@/lib/queryClient";
import { useActiveLocation, locationParams } from "@/lib/active-location";

interface MatchItem {
  listingId: string;
  score: number;
  reason: string;
  listing?: {
    id: string;
    title: string;
    retailValue: string;
    categories: string[];
    location: string;
    images: string[];
    user?: { fullName: string; avatarUrl: string | null };
  };
}

export default function AiMatchCards() {
  const { user } = useAuth();
  const activeLocation = useActiveLocation();

  // Check if the user has any listings — that's what the AI matches against.
  // No listings = nothing to match on = don't show the section at all.
  const { data: myListings } = useQuery<{ id: string }[]>({
    queryKey: ["/api/listings", { userId: user?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/listings?userId=${user!.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const hasActivity = Array.isArray(myListings) && myListings.length > 0;

  const matchParams = new URLSearchParams(locationParams(activeLocation));
  const matchQs = matchParams.toString();

  const { data: matches, isLoading } = useQuery<MatchItem[]>({
    queryKey: ["/api/ai/matches", { country: activeLocation.country, city: activeLocation.city, worldwide: activeLocation.worldwide }],
    queryFn: async () => {
      const res = await fetch(`/api/ai/matches${matchQs ? `?${matchQs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch matches");
      return res.json();
    },
    // Only fire once we know the user has listings to match against
    enabled: !!user && hasActivity,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  // Not logged in or no listings yet — show nothing
  if (!user || !hasActivity) return null;

  // Loaded but no matches found — show nothing
  if (!isLoading && (!matches || matches.length === 0)) return null;

  return (
    <div className="space-y-3" data-testid="section-ai-matches">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold text-sm">For You</h3>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
          <Sparkles className="h-2.5 w-2.5 mr-0.5" />
          Matched
        </Badge>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="min-w-[240px] flex-shrink-0">
                <CardContent className="p-3 space-y-2">
                  <Skeleton className="h-24 w-full rounded" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))
          : matches?.slice(0, 5).map((match) => (
              <Link key={match.listingId} href={`/listings/${match.listingId}`}>
                <Card
                  className="min-w-[240px] flex-shrink-0 cursor-pointer hover:shadow-md transition-shadow"
                  data-testid={`card-ai-match-${match.listingId}`}
                >
                  <CardContent className="p-3 space-y-2">
                    {match.listing?.images?.[0] ? (
                      <div className="h-24 w-full rounded overflow-hidden bg-muted">
                        <img
                          src={assetUrl(match.listing.images[0])}
                          alt={match.listing?.title || "Match"}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-24 w-full rounded bg-muted flex items-center justify-center">
                        <Sparkles className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm line-clamp-1" data-testid={`text-match-title-${match.listingId}`}>
                        {match.listing?.title || "Listing"}
                      </p>
                      {match.listing?.retailValue && (
                        <p className="text-xs text-muted-foreground">
                          AED {parseFloat(match.listing.retailValue).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                      <span className="text-xs font-medium">{Math.round(match.score * 100)}% match</span>
                    </div>
                    <div className="flex items-start gap-1 bg-primary/5 rounded px-2 py-1.5">
                      <Sparkles className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] text-muted-foreground line-clamp-2" data-testid={`text-match-reason-${match.listingId}`}>
                        {match.reason}
                      </p>
                    </div>
                    <div className="flex items-center justify-end">
                      <span className="text-xs text-primary flex items-center gap-1">
                        View <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
      </div>
    </div>
  );
}
