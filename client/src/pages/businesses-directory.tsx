import { useSeo } from "@/hooks/use-seo";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { assetUrl, API_BASE } from "@/lib/queryClient";
import { Building2, MapPin, CheckCircle, Star } from "lucide-react";

interface BizEntry {
  id: string;
  companyName: string;
  category: string | null;
  kybStatus: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  description: string | null;
  location: string | null;
  isFeatured: boolean;
  createdAt: string | null;
}

function BizCard({ biz }: { biz: BizEntry }) {
  return (
    <Link href={`/businesses/${biz.id}`} className="group block" data-testid={`biz-dir-card-${biz.id}`}>
      <article className="bg-white dark:bg-card rounded-xl border border-bareter-border dark:border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col">
        {/* Cover */}
        <div className="h-24 bg-gradient-to-br from-bareter-teal/20 to-bareter-navy/10 relative overflow-hidden flex-shrink-0">
          {biz.coverImageUrl && (
            <img src={assetUrl(biz.coverImageUrl)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          )}
          {biz.isFeatured && (
            <span className="absolute top-2 end-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white bg-bareter-gold/90 shadow-sm">
              <Star className="h-2.5 w-2.5" />
              Featured
            </span>
          )}
        </div>

        {/* Logo + info */}
        <div className="p-4 flex flex-col flex-1 gap-2">
          <div className="flex items-start gap-3">
            {biz.logoUrl ? (
              <img
                src={assetUrl(biz.logoUrl)}
                alt={biz.companyName}
                className="h-10 w-10 rounded-full object-cover ring-2 ring-bareter-teal/20 flex-shrink-0 -mt-7 bg-white shadow"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-bareter-teal/10 flex items-center justify-center flex-shrink-0 -mt-7 ring-2 ring-background shadow">
                <Building2 className="h-5 w-5 text-bareter-teal" />
              </div>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="text-sm font-semibold text-bareter-navy dark:text-foreground line-clamp-1">{biz.companyName}</h3>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {biz.kybStatus === "verified" && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                    <CheckCircle className="h-3 w-3" />
                    Verified
                  </span>
                )}
                {biz.category && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{biz.category}</Badge>
                )}
              </div>
            </div>
          </div>

          {biz.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{biz.description}</p>
          )}

          {biz.location && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-auto">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{biz.location}</span>
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

export function BusinessesDirectoryPage() {
  const { user } = useAuth();

  useSeo({
    title: "Businesses — Bareter",
    description: "Discover verified businesses on Bareter — UAE's cashless B2B marketplace. Browse products and wholesale deals available for barter.",
    canonical: `${window.location.origin}/businesses`,
  });

  const { data: businesses, isLoading } = useQuery<BizEntry[]>({
    queryKey: ["/api/businesses"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/businesses`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
    enabled: !!user,
  });

  const featured = (businesses ?? []).filter(b => b.isFeatured);
  const all = businesses ?? [];

  return (
    <div className="bg-bareter-off-white dark:bg-background min-h-screen pb-16">
      <div className="container px-4 py-8 mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-bareter-navy dark:text-foreground flex items-center gap-3">
            <Building2 className="h-8 w-8 text-bareter-teal" />
            Businesses
          </h1>
          <p className="text-muted-foreground mt-1">
            Browse verified businesses offering products and wholesale deals for barter.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-xl border border-bareter-border overflow-hidden bg-white dark:bg-card">
                <Skeleton className="h-24 w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : all.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold text-bareter-navy dark:text-foreground mb-2">No businesses yet</h2>
            <p className="text-muted-foreground text-sm">
              Be the first — create a business profile and start bartering.
            </p>
            <Link href="/settings">
              <button type="button" className="mt-4 px-4 py-2 rounded-lg bg-bareter-teal text-white text-sm font-semibold hover:bg-bareter-teal/90 transition-colors">
                Create Business Profile
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Featured row */}
            {featured.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground flex items-center gap-2 mb-4">
                  <Star className="h-5 w-5 text-bareter-gold" />
                  Featured Businesses
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {featured.map(biz => <BizCard key={biz.id} biz={biz} />)}
                </div>
              </section>
            )}

            {/* All businesses */}
            <section>
              {featured.length > 0 && (
                <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground mb-4">All Businesses</h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="grid-businesses-directory">
                {all.map(biz => <BizCard key={biz.id} biz={biz} />)}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
