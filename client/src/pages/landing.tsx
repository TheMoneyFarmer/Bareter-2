import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { DealTicker } from "@/components/DealTicker";
import { SuccessStoriesMarquee } from "@/components/SuccessStoriesMarquee";
import { TrendingTiles } from "@/components/TrendingTiles";
import { TrendingDetailedRow } from "@/components/TrendingDetailedRow";
import { useReveal } from "@/hooks/use-reveal";
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
  MapPin,
  ShieldCheck,
  Cpu,
  FileSignature,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const HERO_CATEGORY_PILLS: { emoji: string; label: string; href: string }[] = [
  { emoji: "🚗", label: "Cars", href: "/browse?category=Automotive" },
  { emoji: "🏢", label: "Real Estate", href: "/browse?category=Real%20Estate" },
  { emoji: "💼", label: "Services", href: "/browse?category=Services" },
  { emoji: "📱", label: "Electronics", href: "/browse?category=Technology" },
  { emoji: "🍽", label: "Hospitality", href: "/browse?category=Hospitality" },
  { emoji: "⛵", label: "Yachts", href: "/browse?category=Yachts" },
  { emoji: "🏋", label: "Fitness", href: "/browse?category=Health%20%26%20Wellness" },
  { emoji: "🏠", label: "Home", href: "/browse?category=Home" },
];

const CATEGORY_GRID: { label: string; emoji: string; image: string; href: string }[] = [
  { label: "Cars",        emoji: "🚗", image: catCarsImg,        href: "/browse?category=Automotive" },
  { label: "Real Estate", emoji: "🏢", image: catRealEstateImg,  href: "/browse?category=Real%20Estate" },
  { label: "Services",    emoji: "💼", image: catServicesImg,    href: "/browse?category=Services" },
  { label: "Electronics", emoji: "📱", image: catElectronicsImg, href: "/browse?category=Technology" },
  { label: "Hospitality", emoji: "🍽", image: catHospitalityImg, href: "/browse?category=Hospitality" },
  { label: "Yachts",      emoji: "⛵", image: catYachtsImg,      href: "/browse?category=Yachts" },
  { label: "Fitness",     emoji: "🏋", image: catFitnessImg,     href: "/browse?category=Health%20%26%20Wellness" },
  { label: "Home",        emoji: "🏠", image: catHomeImg,        href: "/browse?category=Home" },
];

export function LandingPage() {
  const { user } = useAuth();
  const { mode: waitlistMode, open: openWaitlist } = useWaitlist();
  const [, navigate] = useLocation();
  const [heroQuery, setHeroQuery] = useState("");
  const [heroCity, setHeroCity] = useState("Dubai");
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const headlineParallax = useMousePosition();

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
    const params = new URLSearchParams();
    if (heroQuery.trim()) params.set("q", heroQuery.trim());
    if (heroCity && heroCity !== "Worldwide") params.set("location", heroCity);
    navigate(`/browse${params.toString() ? `?${params.toString()}` : ""}`);
  };

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
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
            <h1
              className="text-hero text-white"
              data-testid="text-hero-headline"
              style={{
                transform: `translate3d(${(headlineParallax.x * 3).toFixed(2)}px, ${(headlineParallax.y * 3).toFixed(2)}px, 0)`,
                transition: "transform 0.15s ease-out",
              }}
            >
              Barter what you have for what you need.
            </h1>
            <p className="mt-3 text-base sm:text-lg text-white/90 drop-shadow-sm max-w-2xl">
              UAE's AI-powered barter marketplace. No cash. Just value.
            </p>

            {/* Hero search pill */}
            <form
              onSubmit={handleHeroSearch}
              className="mt-8 w-full max-w-[560px] h-[52px] flex items-stretch bg-white rounded-full shadow-bareter-hover overflow-hidden"
              role="search"
              data-testid="form-hero-search"
            >
              <label className="flex items-center gap-1.5 px-4 text-sm font-medium text-bareter-navy border-e border-bareter-border">
                <MapPin className="h-4 w-4 text-bareter-teal" aria-hidden="true" />
                <select
                  value={heroCity}
                  onChange={(e) => setHeroCity(e.target.value)}
                  className="bg-transparent focus:outline-none cursor-pointer"
                  data-testid="select-hero-city"
                >
                  <option>Dubai</option>
                  <option>Abu Dhabi</option>
                  <option>Sharjah</option>
                  <option>Ajman</option>
                  <option>RAK</option>
                  <option>Fujairah</option>
                  <option>Worldwide</option>
                </select>
              </label>
              <input
                type="search"
                value={heroQuery}
                onChange={(e) => setHeroQuery(e.target.value)}
                placeholder="Search barters..."
                className="flex-1 px-4 bg-transparent text-bareter-navy placeholder:text-bareter-muted text-sm focus:outline-none"
                data-testid="input-hero-search"
              />
              <button
                type="submit"
                className="px-5 bg-bareter-teal hover:bg-bareter-teal-light text-white inline-flex items-center justify-center transition-colors active:scale-[0.98]"
                aria-label="Search"
                data-testid="button-hero-search"
              >
                <Search className="h-5 w-5" />
              </button>
            </form>

            {/* Hero category pills */}
            <div className="mt-6 w-full overflow-x-auto scrollbar-hide -mx-4 px-4">
              <div className="flex items-center gap-2 justify-start sm:justify-center min-w-min">
                {HERO_CATEGORY_PILLS.map((p) => (
                  <Link key={p.label} href={p.href}>
                    <button
                      type="button"
                      className="bareter-pill-fill px-4 py-2 text-sm font-medium text-white bg-white/10 border border-white/30 rounded-full whitespace-nowrap"
                      data-testid={`pill-hero-${p.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <span className="me-1.5">{p.emoji}</span>
                      {p.label}
                    </button>
                  </Link>
                ))}
              </div>
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
                Trending barters now 🔥
              </h2>
              <p className="text-caption mt-1">
                AI-curated deals based on your preferences
              </p>
            </div>
            <Link
              href="/browse"
              className="inline-flex items-center gap-1 text-sm font-semibold text-bareter-teal hover:text-bareter-teal-light"
              data-testid="link-view-all-listings"
            >
              View all listings <ArrowRight className="h-4 w-4" />
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
                No barters yet — be the first to list something
              </p>
              <p className="text-caption mt-1 mb-4">
                Post your offer in minutes and get matched by our AI.
              </p>
              <Link href={user ? "/create-listing" : "/register"}>
                <Button variant="bareter">Create the first listing</Button>
              </Link>
            </div>
          ) : (
            <TrendingDetailedRow listings={latestListings} max={8} />
          )}
        </div>
      </section>

      {/* ============================ CATEGORY GRID ============================ */}
      <section className="bg-white dark:bg-background" data-testid="section-categories">
        <div className="container mx-auto max-w-7xl px-4 py-14 sm:py-16">
          <h2 className="text-section text-bareter-navy dark:text-foreground mb-6">
            Browse by category
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {CATEGORY_GRID.map((c) => (
              <Link
                key={c.label}
                href={c.href}
                className="group relative h-44 sm:h-56 lg:h-[280px] rounded-bareter-card overflow-hidden bareter-card-hover border border-bareter-border dark:border-border bg-bareter-navy-deep"
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
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ HOW IT WORKS ============================ */}
      <section className="bg-bareter-navy text-white" data-testid="section-how">
        <div className="container mx-auto max-w-7xl px-4 py-16">
          <h2 className="text-section text-white text-center mb-2">How it works</h2>
          <p className="text-caption text-white/60 text-center mb-12">
            Three simple steps from listing to closed deal
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6 relative">
            {[
              { n: 1, emoji: "📋", title: "List what you have",   desc: "Describe your item or service in minutes." },
              { n: 2, emoji: "🤖", title: "Get AI-matched",       desc: "Our engine finds the perfect barter partner." },
              { n: 3, emoji: "🤝", title: "Close the deal",       desc: "Contract auto-generated, exchange confirmed." },
            ].map((s, i, arr) => (
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
            Real barters. Real value.
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
                          Join the waitlist
            </h2>
            <p className="mt-2 text-bareter-teal-light">United Arab Emirates</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (waitlistMode.enabled) {
                  openWaitlist();
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
                Get early access
              </Button>
            </form>
            <p className="mt-3 text-caption text-white/50">
              No spam. Launch notification only.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================ TRUST BAR (count-up) ============================ */
const TRUST_STATS: {
  icon: typeof ShieldCheck;
  label: string;
  desc: string;
  countTo?: number;
  suffix?: string;
}[] = [
  { icon: ShieldCheck,   label: "Verified Users",    desc: "KYC + KYB checks",      countTo: 500, suffix: "+" },
  { icon: Cpu,           label: "AI-Matched Deals",  desc: "Smart barter engine",    countTo: 1200, suffix: "+" },
  { icon: FileSignature, label: "Auto Contracts",    desc: "E-signed agreements" },
  { icon: CheckCircle2,  label: "🇦🇪 UAE Compliant", desc: "VAT-ready receipts"   },
];

function TrustBar() {
  const { ref, isVisible } = useReveal<HTMLElement>();
  return (
    <section
      ref={ref}
      className="bg-white dark:bg-card border-y border-bareter-border dark:border-border"
      data-testid="section-trust"
    >
      <div className="container mx-auto max-w-7xl px-4 py-7">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 sm:gap-y-0 divide-y sm:divide-y-0 sm:divide-x divide-bareter-border dark:divide-border">
          {TRUST_STATS.map((t, i) => (
            <TrustStat key={i} stat={t} active={isVisible} />
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
  stat: (typeof TRUST_STATS)[number];
  active: boolean;
}) {
  const value = useCountUp(stat.countTo ?? 0, 1500, active);
  return (
    <div className="flex flex-col items-center text-center px-3 sm:px-6 py-1">
      <stat.icon className="h-7 w-7 text-bareter-teal mb-2" />
      {stat.countTo ? (
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
