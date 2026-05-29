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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ShieldCheck,
  Cpu,
  FileSignature,
  ArrowRight,
  CheckCircle2,
  Users,
  Camera,
  Sparkles,
  Handshake,
  ArrowLeftRight,
  TrendingUp,
  LayoutList,
  MessageSquare,
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

  const { data: featuredCreators = [] } = useQuery<any[]>({
    queryKey: ["/api/creators", "landing"],
    queryFn: async () => {
      const res = await fetch("/api/creators");
      if (!res.ok) return [];
      const all = await res.json();
      return all.slice(0, 4);
    },
    staleTime: 120_000,
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

      {/* ============================ THREE WAYS ============================ */}
      <section className="bg-white dark:bg-background" data-testid="section-three-ways">
        <div className="container mx-auto max-w-7xl px-4 py-12 sm:py-16">
          <div className="text-center mb-10">
            <h2 className="text-section text-bareter-navy dark:text-foreground">One platform. Three ways to swap value.</h2>
            <p className="text-caption mt-2 max-w-xl mx-auto">Whether you're swapping a phone for software, running a brand, or creating content — Bareter has a place for you.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1 — Personal Barter (teal accent, most prominent) */}
            <div className="rounded-2xl border-2 border-bareter-teal/40 bg-gradient-to-br from-bareter-teal/8 to-transparent p-6 flex flex-col">
              <div className="h-12 w-12 rounded-xl bg-bareter-teal/15 flex items-center justify-center mb-4 flex-shrink-0">
                <ArrowLeftRight className="h-6 w-6 text-bareter-teal" />
              </div>
              <h3 className="text-xl font-bold text-bareter-navy dark:text-foreground mb-2">Barter Anything</h3>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                Swap your goods, services or skills for exactly what you need. No cash, no fees, no middleman.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-6">
                {["📱 Phone","🚲 Bike","🏢 Office Space","💻 Software","👔 Suit","👟 Shoes","📷 Camera","🚗 Car","🎨 Design","🍽️ Catering"].map(item => (
                  <span key={item} className="text-xs px-2.5 py-1 rounded-full bg-bareter-teal/10 text-bareter-teal font-medium">{item}</span>
                ))}
              </div>
              <Link href="/browse" className="mt-auto">
                <Button variant="bareter" className="w-full gap-2">
                  Browse Listings <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Card 2 — Brand Collabs */}
            <div className="rounded-2xl border border-bareter-border dark:border-border bg-white dark:bg-card shadow-sm p-6 flex flex-col">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 flex-shrink-0">
                <Camera className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-bareter-navy dark:text-foreground mb-2">Brand Collabs</h3>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                You're a brand. Offer your product or service. Get creator-made content back. No cash changes hands.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
                {["Post your collab listing free","Creators apply with stats + pitch","You choose, deal auto-managed"].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-bareter-teal flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/create-listing">
                <Button variant="outline" className="w-full gap-2 border-primary text-primary hover:bg-primary/5">
                  Post a Brand Collab <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Card 3 — Creator Deals */}
            <div className="rounded-2xl border border-bareter-border dark:border-border bg-white dark:bg-card shadow-sm p-6 flex flex-col">
              <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-4 flex-shrink-0">
                <Sparkles className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-bareter-navy dark:text-foreground mb-2">Creator Deals</h3>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                You have followers. Brands have products. Get real value in exchange for authentic content on your platform.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6 flex-1">
                {["Any niche, any follower count","Instagram, TikTok, YouTube + more","Real products, not just exposure"].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-bareter-teal flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register">
                <Button variant="outline" className="w-full gap-2 border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10">
                  Join as Creator <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ TRENDING (mixed posts + listings) ============================ */}
      <section
        className="bg-bareter-off-white dark:bg-background"
        data-testid="section-featured"
      >
        <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
          <div className="flex items-end justify-between gap-4 mb-4">
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

                {/* ── For Brands inline panel ── */}
                <div className="rounded-2xl bg-white dark:bg-card border border-bareter-border dark:border-border overflow-hidden">
                  <div className="flex flex-col lg:flex-row gap-0">
                    {/* Left — explainer + steps */}
                    <div className="flex-1 p-6 lg:p-8">
                      <Badge variant="outline" className="mb-3 text-xs border-primary/40 text-primary bg-primary/5">For Brands</Badge>
                      <h3 className="text-xl font-bold text-bareter-navy dark:text-foreground mb-2">
                        Turn your product into content — without paying cash.
                      </h3>
                      <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-lg">
                        Stop paying influencer agencies thousands per campaign. Post a collab listing, let creators come to you, pick the best fit, and receive content for your brand — all managed inside Bareter.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                        {[
                          { n: "01", icon: <Camera className="h-4 w-4" />, title: "Post your collab", desc: "Add product + content brief" },
                          { n: "02", icon: <Users className="h-4 w-4" />, title: "Creators apply", desc: "See pitches + follower stats" },
                          { n: "03", icon: <Handshake className="h-4 w-4" />, title: "You choose", desc: "Pick the best creator" },
                          { n: "04", icon: <TrendingUp className="h-4 w-4" />, title: "Content live", desc: "Deal closed in Bareter" },
                        ].map(step => (
                          <div key={step.n} className="rounded-xl bg-bareter-off-white dark:bg-background border border-bareter-border dark:border-border p-3 text-center">
                            <div className="h-8 w-8 rounded-full bg-bareter-teal/10 flex items-center justify-center mx-auto mb-2 text-bareter-teal">
                              {step.icon}
                            </div>
                            <p className="text-[10px] font-bold text-bareter-teal mb-0.5">{step.n}</p>
                            <p className="text-xs font-semibold text-bareter-navy dark:text-foreground">{step.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{step.desc}</p>
                          </div>
                        ))}
                      </div>
                      <Link href="/create-listing">
                        <Button variant="bareter" className="gap-2">
                          Post a Brand Collab — Free <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                    {/* Right — live creator cards */}
                    <div className="w-full lg:w-72 flex-shrink-0 bg-bareter-off-white dark:bg-muted/20 border-t lg:border-t-0 lg:border-l border-bareter-border dark:border-border p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-bareter-navy dark:text-foreground">Creators available now</p>
                        <Link href="/creators" className="text-xs text-bareter-teal hover:underline font-medium">See all →</Link>
                      </div>
                      {featuredCreators.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-bareter-border p-5 text-center">
                          <Sparkles className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1.5" />
                          <p className="text-xs text-muted-foreground">Creators joining daily</p>
                          <Link href="/creators" className="text-xs text-primary hover:underline mt-1 inline-block">Browse creators →</Link>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {featuredCreators.map((c: any) => {
                            const cp = c.creatorProfile;
                            const followers = cp?.followerCount >= 1_000_000
                              ? `${(cp.followerCount / 1_000_000).toFixed(1)}M`
                              : cp?.followerCount >= 1_000
                              ? `${(cp.followerCount / 1_000).toFixed(0)}K`
                              : cp?.followerCount ?? "—";
                            return (
                              <Link key={c.id} href={`/users/${c.id}`}>
                                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-card border border-bareter-border dark:border-border hover:border-bareter-teal/40 transition-colors cursor-pointer">
                                  <Avatar className="h-8 w-8 flex-shrink-0">
                                    <AvatarImage src={c.avatarUrl ?? undefined} />
                                    <AvatarFallback className="bg-bareter-teal text-white text-xs font-semibold">{c.fullName?.charAt(0) ?? "C"}</AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-bareter-navy dark:text-foreground truncate">{c.fullName}</p>
                                    <p className="text-[11px] text-muted-foreground capitalize">{cp?.primaryPlatform} · {followers}</p>
                                  </div>
                                  {cp?.contentNiches?.[0] && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex-shrink-0">{cp.contentNiches[0]}</Badge>
                                  )}
                                </div>
                              </Link>
                            );
                          })}
                          <Link href="/creators">
                            <div className="flex items-center justify-center gap-1 p-2 rounded-xl border border-dashed border-bareter-teal/40 text-bareter-teal text-xs font-medium hover:bg-bareter-teal/5 transition-colors cursor-pointer">
                              <Users className="h-3.5 w-3.5" />
                              View all creators
                            </div>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {justListedRow.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-bareter-navy dark:text-foreground mb-3">
                      {t("landing.justListed")}
                    </h3>
                    <TrendingDetailedRow listings={justListedRow} max={10} />
                  </div>
                )}

                {/* ── For Creators inline panel ── */}
                <div className="rounded-2xl bg-bareter-navy dark:bg-bareter-navy overflow-hidden">
                  <div className="flex flex-col lg:flex-row gap-0">
                    {/* Left — headline + CTAs */}
                    <div className="flex-1 p-6 lg:p-8">
                      <Badge className="mb-3 text-xs bg-bareter-teal/20 text-bareter-teal border-bareter-teal/30">For Creators</Badge>
                      <h3 className="text-xl font-bold text-white mb-2">
                        Get brand products & services — just for creating content.
                      </h3>
                      <p className="text-sm text-white/60 mb-6 leading-relaxed max-w-lg">
                        No more chasing brand deals via DMs. Set up your creator profile once, browse collab opportunities from real brands, apply, and get products or services in return for your content.
                      </p>
                      <p className="text-xs text-white/40 mb-5">Open to creators with 2,000+ followers on any platform.</p>
                      <div className="flex flex-wrap gap-3">
                        <Link href="/register">
                          <Button variant="bareter" className="gap-2 h-10">
                            <Sparkles className="h-4 w-4" />
                            Join as Creator — Free
                          </Button>
                        </Link>
                        <Link href="/browse">
                          <Button variant="outline" className="gap-2 h-10 border-white/30 text-white hover:bg-white/10">
                            <Camera className="h-4 w-4" />
                            Browse Brand Collabs
                          </Button>
                        </Link>
                      </div>
                    </div>
                    {/* Right — 3 steps */}
                    <div className="w-full lg:w-[420px] flex-shrink-0 p-6 lg:p-8 border-t lg:border-t-0 lg:border-l border-white/10">
                      <div className="space-y-3">
                        {[
                          { n: "①", title: "Set up your creator profile", desc: "Add your platform, follower count, engagement rate and content niches. Takes 2 minutes.", icon: <Users className="h-4 w-4" /> },
                          { n: "②", title: "Browse brand collab listings", desc: "Filter by niche, product value and platform. See exactly what the brand wants from you.", icon: <Camera className="h-4 w-4" /> },
                          { n: "③", title: "Apply with your pitch", desc: "Send your handle and a short pitch. If the brand picks you — deal is locked in Bareter. You create, they deliver.", icon: <TrendingUp className="h-4 w-4" /> },
                        ].map(step => (
                          <div key={step.n} className="flex items-start gap-3 p-3 rounded-xl bg-white/8 border border-white/10">
                            <div className="h-8 w-8 rounded-full bg-bareter-teal/20 flex items-center justify-center flex-shrink-0 text-bareter-teal mt-0.5">
                              {step.icon}
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-bareter-teal mb-0.5">{step.n}</p>
                              <p className="text-xs font-semibold text-white mb-0.5">{step.title}</p>
                              <p className="text-[11px] text-white/50 leading-relaxed">{step.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        {["Fashion","Beauty","Tech","Food","Travel","Fitness","Business","Gaming","Education","Lifestyle"].map(n => (
                          <span key={n} className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">{n}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

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

      {/* ============================ HOW IT WORKS ============================ */}
      <section className="bg-bareter-navy overflow-hidden" data-testid="section-how">
        <div className="container mx-auto max-w-6xl px-4 py-20">

          {/* Header */}
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-bareter-teal mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              From listing to closed deal.
            </h2>
            <p className="text-white/55 max-w-lg mx-auto text-base leading-relaxed">
              No cash changes hands. Just value for value — matched by AI and sealed with a contract.
            </p>
          </div>

          {/* Steps grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 relative">

            {/* Desktop connecting line */}
            <div
              className="absolute top-9 left-[13%] right-[13%] h-px hidden lg:block"
              style={{ background: "linear-gradient(to right, transparent, rgba(34,160,160,0.35) 20%, rgba(34,160,160,0.35) 80%, transparent)" }}
              aria-hidden="true"
            />

            {([
              {
                Icon: LayoutList,
                title: "List what you have",
                desc: "Upload photos, set a value, and describe what you're looking for in return. Done in 2 minutes.",
                tag: "2 min to list",
              },
              {
                Icon: Sparkles,
                title: "AI finds your match",
                desc: "Our engine scans the marketplace and surfaces the most compatible barter partners automatically.",
                tag: "Instant matching",
              },
              {
                Icon: MessageSquare,
                title: "Negotiate in-app",
                desc: "Chat directly, make counter-offers, and agree on terms — all inside Bareter, no back-and-forth emails.",
                tag: "No lawyers needed",
              },
              {
                Icon: FileSignature,
                title: "Sign & exchange",
                desc: "A barter contract is auto-generated for both parties. Sign it on-platform and complete the exchange.",
                tag: "Legally binding",
              },
            ] as const).map((step, i) => (
              <div
                key={step.title}
                className="relative flex flex-col items-center text-center group"
              >
                {/* Icon card */}
                <div className="relative mb-5 z-10">
                  <div className="h-[72px] w-[72px] rounded-2xl bg-white/5 border border-white/10 group-hover:border-bareter-teal/50 group-hover:bg-bareter-teal/10 transition-all duration-300 flex items-center justify-center shadow-lg">
                    <step.Icon className="h-7 w-7 text-bareter-teal" aria-hidden="true" />
                  </div>
                  {/* Step number badge */}
                  <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-bareter-teal text-white text-[11px] font-bold flex items-center justify-center shadow-md">
                    {i + 1}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white mb-2 leading-snug">{step.title}</h3>
                <p className="text-sm text-white/55 leading-relaxed mb-4 max-w-[220px]">{step.desc}</p>

                {/* Benefit pill */}
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1 rounded-full bg-bareter-teal/20 text-white border border-bareter-teal/40">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  {step.tag}
                </span>

                {/* Mobile connector arrow */}
                {i < 3 && (
                  <div className="lg:hidden mt-5 mb-1 text-white/25" aria-hidden="true">
                    <ArrowRight className="h-4 w-4 mx-auto rotate-90 sm:rotate-0" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              className="h-12 px-8 bg-bareter-teal hover:bg-bareter-teal/90 text-white font-semibold gap-2 shadow-lg"
              onClick={() => waitlistGate() && navigate("/create-listing")}
            >
              Start Bartering
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-12 px-6 text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => navigate("/browse")}
            >
              Browse listings
            </Button>
          </div>

        </div>
      </section>

      {/* ============================ TRUST BAR ============================ */}
      <TrustBar />

      {/* ============================ SUCCESS STORIES ============================ */}
      <section className="bg-bareter-off-white dark:bg-background border-y border-bareter-border dark:border-border" data-testid="section-stories">
        <div className="container mx-auto max-w-7xl px-4 pt-5 pb-2">
          <p className="text-xs font-bold uppercase tracking-wider text-bareter-muted mb-3">
            {t("landing.realBarters")}
          </p>
        </div>
        <SuccessStoriesMarquee />
        <div className="h-4" aria-hidden="true" />
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
