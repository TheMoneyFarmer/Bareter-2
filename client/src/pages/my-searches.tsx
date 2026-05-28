import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ListingWithUser } from "@shared/schema";
import {
  Search,
  Clock,
  X,
  ArrowRight,
  Sparkles,
  Bookmark,
} from "lucide-react";

type SearchHistoryEntry = {
  id: string;
  query: string;
  category: string | null;
  resultCount: number;
  createdAt: string;
};

type SearchHistoryResponse = {
  history: SearchHistoryEntry[];
  recommendations: ListingWithUser[];
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function MySearchesPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SearchHistoryResponse>({
    queryKey: ["/api/search-history"],
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/search-history/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/search-history"] });
    },
    onError: () => {
      toast({ title: "Failed to remove search", variant: "destructive" });
    },
  });

  const runSearch = (query: string) => {
    navigate(`/browse?q=${encodeURIComponent(query)}`);
  };

  if (!user) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-4xl text-center">
        <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">My Searches</h1>
        <p className="text-muted-foreground mb-4">Please log in to see your search history.</p>
        <Link href="/login">
          <Button>Log In</Button>
        </Link>
      </div>
    );
  }

  const history = data?.history ?? [];
  const recommendations = data?.recommendations ?? [];
  const uniqueQueries = Array.from(new Map(history.map((h) => [h.query, h])).values());

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-lg bg-bareter-teal/10 flex items-center justify-center">
          <Bookmark className="h-5 w-5 text-bareter-teal" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-bareter-navy dark:text-foreground">My Searches</h1>
          <p className="text-sm text-muted-foreground">Your recent searches and personalised recommendations</p>
        </div>
      </div>

      {/* Recent Searches */}
      <section className="mb-10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-bareter-muted mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Recent Searches
        </h2>

        {isLoading ? (
          <div className="flex flex-wrap gap-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-full" />
            ))}
          </div>
        ) : uniqueQueries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-bareter-border p-8 text-center">
            <Search className="h-10 w-10 mx-auto mb-3 text-bareter-muted" />
            <p className="text-bareter-navy dark:text-foreground font-medium">No searches yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Start searching from the home page and your history will appear here.
            </p>
            <Link href="/browse" className="mt-4 inline-block">
              <Button variant="bareter" size="sm" className="mt-4 gap-1.5">
                <Search className="h-4 w-4" /> Browse listings
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {uniqueQueries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-1.5 bg-white dark:bg-card border border-bareter-border rounded-full px-3 py-1.5 shadow-sm group"
              >
                <button
                  type="button"
                  onClick={() => runSearch(entry.query)}
                  className="flex items-center gap-1.5 text-sm font-medium text-bareter-navy dark:text-foreground hover:text-bareter-teal transition-colors"
                >
                  <Search className="h-3.5 w-3.5 text-bareter-muted" />
                  {entry.query}
                  {entry.category && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 ms-1">
                      {entry.category}
                    </Badge>
                  )}
                  <span className="text-[10px] text-bareter-muted">{timeAgo(entry.createdAt)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(entry.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-muted text-bareter-muted hover:text-red-500"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-bareter-muted flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-bareter-teal" />
              Recommended for You
            </h2>
            <Link href="/browse" className="text-sm font-semibold text-bareter-teal hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendations.slice(0, 9).map((listing) => {
              const images = listing.images as string[] | null;
              return (
                <Link key={listing.id} href={`/listings/${listing.id}`}>
                  <div className="group bg-white dark:bg-card border border-bareter-border rounded-xl overflow-hidden hover:shadow-bareter-hover transition-shadow cursor-pointer">
                    {images?.[0] ? (
                      <img
                        src={images[0]}
                        alt={listing.title}
                        className="w-full h-40 object-cover group-hover:scale-[1.02] transition-transform"
                      />
                    ) : (
                      <div className="w-full h-40 bg-bareter-off-white flex items-center justify-center">
                        <Search className="h-8 w-8 text-bareter-muted" />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="font-semibold text-bareter-navy dark:text-foreground text-sm line-clamp-1">
                        {listing.title}
                      </p>
                      <p className="text-xs text-bareter-muted mt-0.5">
                        AED {Number(listing.retailValue).toLocaleString()} · {listing.location}
                      </p>
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        {(listing.categories as string[])?.[0] ?? listing.type}
                      </Badge>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
