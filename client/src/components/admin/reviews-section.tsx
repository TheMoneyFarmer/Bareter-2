import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MessageSquare, TrendingUp } from "lucide-react";
import { StarRating } from "@/components/StarRating";

type AdminReview = {
  id: string;
  rating: number;
  comment: string | null;
  tags: string[];
  createdAt: string;
  reviewer: { id: string; fullName: string; avatarUrl: string | null };
  reviewee: { id: string; fullName: string; avatarUrl: string | null };
  listingId: string | null;
};

type AdminRating = {
  id: string;
  score: number;
  review: string | null;
  dealId: string;
  createdAt: string;
  from: { id: string; fullName: string };
  to: { id: string; fullName: string };
};

function timeAgo(date: string) {
  const d = new Date(date);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function AdminReviewsSection() {
  const [activeTab, setActiveTab] = useState<"reviews" | "ratings">("reviews");

  const { data, isLoading } = useQuery<{ reviews: AdminReview[]; stats: { total: number; avgRating: number; byRating: Record<number, number> } }>({
    queryKey: ["/api/admin/reviews"],
    queryFn: async () => {
      const res = await fetch("/api/admin/reviews", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load reviews");
      return res.json();
    },
  });

  const { data: ratingsData, isLoading: ratingsLoading } = useQuery<{ ratings: AdminRating[]; stats: { total: number; avgScore: number; byScore: Record<number, number> } }>({
    queryKey: ["/api/admin/ratings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ratings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ratings");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const { reviews = [], stats } = data ?? {};
  const { ratings: ratingsList = [], stats: ratingStats } = ratingsData ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Reviews & Ratings</h2>
        <p className="text-muted-foreground">All platform reviews, written feedback, and deal satisfaction scores</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b">
        <button
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === "reviews" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("reviews")}
        >
          Written Reviews ({stats?.total ?? 0})
        </button>
        <button
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === "ratings" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("ratings")}
        >
          Deal Ratings ({ratingStats?.total ?? 0})
        </button>
      </div>

      {activeTab === "ratings" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Ratings</p><p className="text-2xl font-bold">{ratingStats?.total ?? 0}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Avg Score</p><div className="flex items-center gap-2 mt-1"><p className="text-2xl font-bold">{ratingStats?.avgScore?.toFixed(1) ?? "—"}</p><Star className="h-5 w-5 text-amber-400 fill-amber-400" /></div></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">5-Star Deals</p><p className="text-2xl font-bold">{ratingStats?.byScore?.[5] ?? 0}</p></CardContent></Card>
          </div>
          {ratingStats?.byScore && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Score Distribution</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[5, 4, 3, 2, 1].map((s) => {
                  const count = ratingStats.byScore[s] ?? 0;
                  const pct = ratingStats.total > 0 ? Math.round((count / ratingStats.total) * 100) : 0;
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className="text-xs w-6 text-right font-medium">{s}★</span>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div className="bg-amber-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8">{pct}%</span>
                      <span className="text-xs text-muted-foreground w-6">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Star className="h-4 w-4" /> All Deal Ratings</CardTitle></CardHeader>
            <CardContent className="divide-y">
              {ratingsLoading ? <Skeleton className="h-20" /> : ratingsList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No ratings yet</p>
              ) : (
                ratingsList.map((r) => (
                  <div key={r.id} className="py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{r.from.fullName}</span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span className="text-sm font-semibold">{r.to.fullName}</span>
                        <StarRating value={r.score} readonly size="sm" />
                        <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                      </div>
                      {r.review && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{r.review}</p>}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "reviews" && (<>
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Reviews</p>
            <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Platform Avg Rating</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold">{stats?.avgRating?.toFixed(1) ?? "—"}</p>
              <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">5-Star Reviews</p>
            <p className="text-2xl font-bold">{stats?.byRating?.[5] ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Rating distribution */}
      {stats?.byRating && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Rating Distribution</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.byRating[star] ?? 0;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-3">
                  <span className="text-xs w-6 text-right font-medium">{star}★</span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-amber-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-8">{pct}%</span>
                  <span className="text-xs text-muted-foreground w-6">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Reviews list */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" /> All Reviews</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No reviews yet</p>
          ) : (
            reviews.map((r) => (
              <div key={r.id} className="py-3 flex items-start gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={r.reviewer.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-xs">{r.reviewer.fullName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{r.reviewer.fullName}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="text-sm font-semibold">{r.reviewee.fullName}</span>
                    <StarRating value={r.rating} readonly size="sm" />
                    <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{r.comment}</p>}
                  {r.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.tags.map(t => <Badge key={t} variant="outline" className="text-[10px] px-1.5 h-4">{t}</Badge>)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      </>)}
    </div>
  );
}
