import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { DealTicker } from "@/components/DealTicker";
import { SuccessStoriesMarquee } from "@/components/SuccessStoriesMarquee";
import { TrendingTiles } from "@/components/TrendingTiles";
import { TrendingDetailedRow } from "@/components/TrendingDetailedRow";
import { useReveal } from "@/hooks/use-reveal";
import { useI18n } from "@/lib/i18n";
import heroHandshakeImg from "@assets/generated_images/hero-handshake.png";
import catCarsImg from "@assets/generated_images/cat-cars.png";
import catRealEstateImg from "@assets/generated_images/cat-real-estate.png";
import catServicesImg from "@assets/generated_images/cat-services.png";
import catElectronicsImg from "@assets/generated_images/cat-electronics.png";
import catHospitalityImg from "@assets/generated_images/cat-hospitality.png";
import catYachtsImg from "@assets/generated_images/cat-yachts.png";
import catFitnessImg from "@assets/generated_images/cat-fitness.png";
import catHomeImg from "@assets/generated_images/cat-home.png";
import { useCountUp } from "@/hooks/use-count-up";
import { useMousePosition } from "@/hooks/use-mouse-position";
import type { ListingWithUser } from "@shared/schema";
import {
  Search,
  ShieldCheck,
  Cpu,
  FileSignature,
  ArrowRight,
  CheckCircle2,
  Users,
} from "lucide-react";

const CATEGORY_GRID: { label: string; emoji: string; image: string; href: string }[] = [
  { label: "Cars",        emoji: "🚗", image: catCarsImg,        href: "/c/automotive" },
  { label: "Real Estate", emoji: "🏢", image: catRealEstateImg,  href: "/c/real-estate" },
  { label: "Services",    emoji: "💼", image: catServicesImg,    href: "/c/services" },
  { label: "Electronics", emoji: "📱", image: catElectronicsImg, href: "/c/technology" },
  { label: "Hospitality", emoji: "🍽", image: catHospitalityImg, href: "/c/hospitality" },
  { label: "Yachts",      emoji: "⛵", image: catYachtsImg,      href: "/c/vehicles/yacht-boat" },
  { label: "Fitness",     emoji: "🏋", image: catFitnessImg,     href: "/c/health-and-wellness" },
  { label: "Home",        emoji: "🏠", image: catHomeImg,        href: "/c/real-estate/house" },
];

type PublicSettings = Record<string, string | null>;
type HowItWorksStep = { n: number; emoji: string; title: string; desc: string };

const DEFAULT_HEADLINE = "Barter what you have for what you need.";
const DEFAULT_TAGLINE = "UAE's AI-powered barter marketplace. No cash. Just value.";
const DEFAULT_STEPS: HowItWorksStep[] = [
  { n: 1, emoji: "📋", title: "List what you have", desc: "Describe your item or service in minutes." },
  { n: 2, emoji: "🤖", title: "Get AI-matched", desc: "Our engine finds the perfect barter partner." },
  { n: 3, emoji: "🤝", title: "Close the deal", desc: "Contract auto-generated, exchange confirmed." },
];

export function LandingPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { mode: waitlistMode, open: openWaitlist, gate: waitlistGate } = useWaitlist();
  const [, navigate] = useLocation();

  const handleCategoryClick = (e: React.MouseEvent, href: string) => {
    if (!waitlistGate()) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    navigate(href);
  };
  const [heroQuery, setHeroQuery] = useState("");
  const [heroCity, setHeroCity] = useState("Dubai");
  const [heroCategory, setHeroCategory] = useState("All");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Live search suggestions — listings + users
  const { data: suggestionListings } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings", { search: heroQuery }],
    queryFn: () =>
      fetch(`/api/listings?search=${encodeURIComponent(heroQuery)}&limit=5`)
        .then((r) => r.json()),
    enabled: heroQuery.trim().length >= 2,
    staleTime: 5000,
  });
  const { data: suggestionUsers } = useQuery<User[]>({
    queryKey: ["/api/users/search", heroQuery],
    queryFn: () =>
      fetch(`/api/users/search?q=${encodeURIComponent(heroQuery)}&limit=3`)
        .then((r) => r.json()),
    enabled: heroQuery.trim().length >= 2,
    staleTime: 5000,
  });
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const headlineParallax = useMousePosition();

  const { data: cmsSettings } = useQuery<PublicSettings>({
    queryKey: ["/api/public/settings"],
    staleTime: 60_000,
  });

  const heroHeadline = cmsSettings?.hero_headline || DEFAULT_HEADLINE;
  const heroTagline = cmsSettings?.hero_tagline || DEFAULT_TAGLINE;
  const heroCta = cmsSettings?.hero_cta || null;
  const heroCtaUrl = cmsSettings?.hero_cta_url || null;
  let howItWorksSteps = DEFAULT_STEPS;
  try {
    if (cmsSettings?.how_it_works_steps) {
      const parsed = JSON.parse(cmsSettings.how_it_works_steps);
      if (Array.isArray(parsed) && parsed.length > 0) howItWorksSteps = parsed;
    }
  } catch {}

  const { data: featuredListings, isLoading: loadingFeatured } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings/featured"],
  });
  const { data: latestListings, isLoading: loadingLatest } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings"],
  });

  const featured =
    (featuredListings && featuredListings.length > 0
      ? featuredListings
      : latestListings || []
    ).slice(0, 4);

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = heroQuery.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (heroCity && heroCity !== "Worldwide") params.set("location", heroCity);
    if (heroCategory && heroCategory !== "All") params.set("category", heroCategory);
    // Save search to history (fire-and-forget, no auth check needed — backend guards)
    if (q.length >= 2) {
      fetch("/api/search-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          query: q,
          category: heroCategory !== "All" ? heroCategory : null,
        }),
      }).catch(() => {});
    }
    navigate(`/browse${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const SEARCH_CATEGORIES = [
    { label: "All",         category: "All" },
    { label: "Cars",        category: "Automotive" },
    { label: "Real Estate", category: "Real Estate" },
    { label: "Services",    category: "Services" },
    { label: "Electronics", category: "Electronics" },
    { label: "Hospitality", category: "Hospitality" },
    { label: "Health",      category: "Health & Wellness" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* ============================ HERO ============================ */}
      <section
        className="relative isolate overflow-hidden bareter-noise"
        data-testid="section-hero"
      >
        {/* Real-life barter photo background — handshake closing a deal */}
        <img
          src={heroHandshakeImg}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-center"
          loading="eager"
        />
        {/* Subtle dark overlay — keeps the office background visible while
            still giving white text enough contrast in the center band. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-black/30"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/4 bottom-0 -z-10 bg-gradient-to-b from-transparent via-bareter-navy-deep/45 to-bareter-navy-deep/60"
        />
        <div className="container relative z-10 mx-auto max-w-7xl px-4 py-20 md:py-28 lg:py-32">
          <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
            <h1
              className="text-hero text-white sm:whitespace-nowrap"
              data-testid="text-hero-headline"
              style={{
                transform: `translate3d(${(headlineParallax.x * 3).toFixed(2)}px, ${(headlineParallax.y * 3).toFixed(2)}px, 0)`,
                transition: "transform 0.15s ease-out",
              }}
            >
              {heroHeadline}
            </h1>
            <p className="hero-tagline mt-4 drop-shadow-sm" data-testid="text-hero-tagline">
              {heroTagline}
            </p>

            {/* Dubizzle-style search block */}
            <div ref={searchRef} className="mt-8 w-full max-w-[760px] relative">
              {/* "Searching in" category tabs */}
              <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
                <span className="text-white/80 text-sm font-medium whitespace-nowrap flex-shrink-0">
                  Searching in
                </span>
                {SEARCH_CATEGORIES.map((cat) => (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => setHeroCategory(cat.category)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                      heroCategory === cat.category
                        ? "bg-bareter-teal text-white shadow-md"
                        : "bg-white/10 text-white border border-white/30 hover:bg-white/20"
                    }`}
                    data-testid={`tab-search-${cat.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Search bar */}
              <form
                onSubmit={(e) => { setShowSuggestions(false); handleHeroSearch(e); }}
                className="flex items-stretch bg-white rounded-lg shadow-bareter-hover overflow-hidden h-14"
                role="search"
                data-testid="form-hero-search"
              >
                <input
                  type="search"
                  value={heroQuery}
                  onChange={(e) => { setHeroQuery(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => heroQuery.length >= 2 && setShowSuggestions(true)}
                  placeholder="Search for anything..."
                  className="flex-1 px-5 bg-transparent text-bareter-navy placeholder:text-gray-400 text-base focus:outline-none"
                  data-testid="input-hero-search"
                  autoComplete="off"
                />
                <div className="flex items-center border-s border-gray-200 px-3">
                  <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <button
                  type="submit"
                  className="px-8 bg-bareter-teal hover:bg-bareter-teal-light text-white font-bold text-base transition-colors active:scale-[0.98]"
                  aria-label="Search"
                  data-testid="button-hero-search"
                >
                  Search
                </button>
              </form>

              {/* Live suggestions dropdown */}
              {showSuggestions && heroQuery.trim().length >= 2 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-lg shadow-bareter-hover border border-bareter-border overflow-hidden z-50">
                  {/* Listing suggestions */}
                  {suggestionListings && suggestionListings.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-bareter-muted">Listings</p>
                      {suggestionListings.slice(0, 5).map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bareter-teal-muted text-start transition-colors"
                          onClick={() => { setShowSuggestions(false); navigate(`/listings/${l.id}`); }}
                        >
                          {(l.images as string[])?.[0] && (
                            <img src={(l.images as string[])[0]} alt="" className="h-9 w-9 rounded-md object-cover flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-bareter-navy truncate">{l.title}</p>
                            <p className="text-xs text-bareter-muted truncate">AED {Number(l.retailValue).toLocaleString()} · {l.location}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* User suggestions */}
                  {Array.isArray(suggestionUsers) && suggestionUsers.length > 0 && (
                    <div className="border-t border-bareter-border">
                      <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-bareter-muted">Members</p>
                      {suggestionUsers.slice(0, 3).map((u: User) => (
                        <button
                          key={u.id}
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bareter-teal-muted text-start transition-colors"
                          onClick={() => { setShowSuggestions(false); navigate(`/users/${u.id}`); }}
                        >
                          <div className="h-9 w-9 rounded-full bg-bareter-teal text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                            {u.fullName?.charAt(0)?.toUpperCase() || "U"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-bareter-navy truncate">{u.fullName}</p>
                            <p className="text-xs text-bareter-muted truncate">{u.businessName || u.location || "Member"}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* View all results */}
                  <div className="border-t border-bareter-border px-4 py-3">
                    <button
                      type="button"
                      className="w-full text-sm font-semibold text-bareter-teal hover:text-bareter-teal-light text-center"
                      onClick={() => { setShowSuggestions(false); handleHeroSearch({ preventDefault: () => {} } as React.FormEvent); }}
                    >
                      Search all results for "{heroQuery}" →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================ DEAL TICKER ============================ */}
      <DealTicker />

      {/* ============================ TRUST BAR ============================ */}
      <TrustBar />

      {/* ============================ TRENDING (mixed posts + listings) ============================ */}
      <section
        className="bg-bareter-off-white dark:bg-background"
        data-testid="section-featured"
      >
        <div className="container mx-auto max-w-7xl px-4 py-14 sm:py-16">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="text-section text-bareter-navy dark:text-foreground">
                {t("landing.trendingNow")}
              </h2>
              <p className="text-caption mt-1">
                {t("landing.exploreCategories")}
              </p>
            </div>
            <Link
              href="/browse"
              className="inline-flex items-center gap-1 text-sm font-semibold text-bareter-teal hover:text-bareter-teal-light"
              data-testid="link-view-all-listings"
            >
              {t("landing.viewAllListings")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {loadingFeatured && loadingLatest ? (
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-sm sm:rounded-md bg-muted/60 animate-pulse" />
              ))}
            </div>
          ) : featured.length === 0 ? (
            <div className="rounded-bareter-card bg-white dark:bg-card border border-bareter-border dark:border-border p-10 text-center">
              <p className="text-card-title text-bareter-navy dark:text-foreground">
                {t("landing.noListingsYet")}
              </p>
              <p className="text-caption mt-1 mb-4">
                {t("landing.postOfferInMinutes")}
              </p>
              <Link href={user ? "/create-listing" : "/register"}>
                <Button variant="bareter">{t("landing.createFirstListing")}</Button>
              </Link>
            </div>
          ) : (() => {
            const all = latestListings ?? [];
            const featuredRow =
              (featuredListings && featuredListings.length > 0
                ? featuredListings
                : all
              ).slice(0, 10);
            const justListedRow = all.slice(0, 10);
            const bigTicketRow = [...all]
              .sort(
                (a, b) =>
                  parseFloat((b.retailValue as string) || "0") -
                  parseFloat((a.retailValue as string) || "0"),
              )
              .slice(0, 10);

            return (
              <div className="space-y-8">
                {featuredRow.length > 0 && (
                  <TrendingDetailedRow listings={featuredRow} max={10} />
                )}
                {justListedRow.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-bareter-navy dark:text-foreground mb-3">
                      {t("landing.justListed")}
                    </h3>
                    <TrendingDetailedRow listings={justListedRow} max={10} />
                  </div>
                )}
                {bigTicketRow.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-bareter-navy dark:text-foreground mb-3">
                      {t("landing.bigTicket")}
                    </h3>
                    <TrendingDetailedRow listings={bigTicketRow} max={10} />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </section>

      {/* ============================ CATEGORY GRID ============================ */}
      <section className="bg-white dark:bg-background" data-testid="section-categories">
        <div className="container mx-auto max-w-7xl px-4 py-14 sm:py-16">
          <h2 className="text-section text-bareter-navy dark:text-foreground mb-6">
            {t("landing.browseByCategory")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {CATEGORY_GRID.map((c) => (
              <a
                key={c.label}
                href={c.href}
                onClick={(e) => handleCategoryClick(e, c.href)}
                className="group relative h-44 sm:h-56 lg:h-[280px] rounded-bareter-card overflow-hidden bareter-card-hover border border-bareter-border dark:border-border bg-bareter-navy-deep cursor-pointer"
                data-testid={`card-category-${c.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <img
                  src={c.image}
                  alt={c.label}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-bareter-navy-deep/85 via-bareter-navy-deep/30 to-transparent transition-opacity group-hover:from-bareter-navy-deep/90" />
                <div className="absolute bottom-4 start-4 text-white">
                  <div className="text-3xl mb-1 drop-shadow">{c.emoji}</div>
                  <div className="text-card-title text-white drop-shadow">{c.label}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ HOW IT WORKS ============================ */}
      <section className="bg-bareter-navy text-white" data-testid="section-how">
        <div className="container mx-auto max-w-7xl px-4 py-16">
          <h2 className="text-section text-white text-center mb-2">{t("landing.howItWorksSimple")}</h2>
          <p className="text-caption text-white/60 text-center mb-12">
            {t("landing.threeSteps")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6 relative">
            {howItWorksSteps.map((s, i, arr) => (
              <div key={s.n} className="relative flex flex-col items-center text-center">
                <div
                  className="h-14 w-14 rounded-full bg-bareter-teal text-white text-xl font-bold flex items-center justify-center mb-4 shadow-bareter-hover"
                  aria-hidden="true"
                >
                  {s.n}
                </div>
                <div className="text-2xl mb-2">{s.emoji}</div>
                <h3 className="text-card-title text-white mb-2">{s.title}</h3>
                <p className="text-caption text-white/60 max-w-xs">{s.desc}</p>
                {i < arr.length - 1 && (
                  <div className="hidden md:block absolute top-7 -end-3 w-6 text-white/30">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ SUCCESS STORIES ============================ */}
      <section className="bg-bareter-off-white dark:bg-background" data-testid="section-stories">
        <div className="container mx-auto max-w-7xl px-4 py-14 sm:py-16">
          <h2 className="text-section text-bareter-navy dark:text-foreground mb-6">
            {t("landing.realBarters")}
          </h2>
        </div>
        <SuccessStoriesMarquee />
        <div className="h-14 sm:h-16" aria-hidden="true" />
      </section>

      {/* ============================ WAITLIST CTA ============================ */}
      {!user && (
        <section
          className="relative isolate overflow-hidden bg-bareter-gradient bareter-noise"
          data-testid="section-waitlist-cta"
        >
          <div className="container relative z-10 mx-auto max-w-3xl px-4 py-16 text-center">
            <h2 className="text-section text-white">
              {t("landing.joinWaitlist")}
            </h2>
            <p className="mt-2 text-bareter-teal-light">United Arab Emirates</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (waitlistMode.enabled) {
                  openWaitlist();
                } else if (heroCtaUrl) {
                  navigate(`${heroCtaUrl}${heroCtaUrl.includes("?") ? "&" : "?"}email=${encodeURIComponent(waitlistEmail)}`);
                } else {
                  navigate(`/register?email=${encodeURIComponent(waitlistEmail)}`);
                }
              }}
              className="mt-6 mx-auto max-w-[480px] flex flex-col sm:flex-row gap-2"
            >
              <input
                type="email"
                required
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                placeholder="you@business.com"
                className="flex-1 h-12 px-5 rounded-full bg-white text-bareter-navy placeholder:text-bareter-muted text-sm focus:outline-none focus:ring-2 focus:ring-bareter-teal-light"
                data-testid="input-waitlist-email"
              />
              <Button
                type="submit"
                variant="bareter"
                className="h-12 px-6 rounded-full"
                data-testid="button-waitlist-submit"
              >
                {heroCta || t("landing.startBartering")}
              </Button>
            </form>
            <p className="mt-3 text-caption text-white/50">
              {t("landing.noSpam")}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================ TRUST BAR (count-up) ============================ */
type TrustStatItem = {
  icon: typeof ShieldCheck;
  label: string;
  desc: string;
  countTo?: number;
  suffix?: string;
};

function TrustBar() {
  const { ref, isVisible } = useReveal<HTMLElement>();
  const { t } = useI18n();
  const { data: counter, isLoading: countLoading } = useQuery<{ count: number }>({
    queryKey: ["/api/waitlist/count"],
    refetchInterval: 10_000,
  });

  const waitlistReady = !countLoading && counter?.count !== undefined;
  const stats: TrustStatItem[] = [
    { icon: Users, label: t("landing.waitlistSignups"), desc: t("landing.joinCommunity"), countTo: waitlistReady ? counter.count : undefined, suffix: "+" },
    { icon: Cpu,           label: t("landing.aiMatchedDeals"),   desc: t("landing.smartBarterEngine") },
    { icon: FileSignature, label: t("landing.autoContracts"),    desc: t("landing.eSignedAgreements") },
    { icon: CheckCircle2,  label: t("landing.zeroPlatformFees"), desc: t("landing.alwaysFree") },
  ];

  return (
    <section
      ref={ref}
      className="bg-white dark:bg-card border-y border-bareter-border dark:border-border"
      data-testid="section-trust"
    >
      <div className="container mx-auto max-w-7xl px-4 py-7">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 sm:gap-y-0 divide-y sm:divide-y-0 sm:divide-x divide-bareter-border dark:divide-border">
          {stats.map((s, i) => (
            <TrustStat key={i} stat={s} active={isVisible} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustStat({
  stat,
  active,
}: {
  stat: TrustStatItem;
  active: boolean;
}) {
  const value = useCountUp(stat.countTo ?? null, 1500, active);
  return (
    <div className="flex flex-col items-center text-center px-3 sm:px-6 py-1">
      <stat.icon className="h-7 w-7 text-bareter-teal mb-2" />
      {value !== null ? (
        <p
          className="text-card-title text-bareter-navy dark:text-foreground tabular-nums"
          data-testid={`stat-trust-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {value.toLocaleString()}
          {stat.suffix ?? ""} {stat.label}
        </p>
      ) : (
        <p className="text-card-title text-bareter-navy dark:text-foreground">{stat.label}</p>
      )}
      <p className="text-caption mt-0.5">{stat.desc}</p>
    </div>
  );
}
