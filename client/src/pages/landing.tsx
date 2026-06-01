import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { DealTicker } from "@/components/DealTicker";
import { SuccessStoriesMarquee } from "@/components/SuccessStoriesMarquee";
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
  Star,
  ChevronDown,
  ChevronUp,
  MapPin,
  Zap,
  Clock,
  Lock,
} from "lucide-react";

// ── Acquire-style animated listing card ──────────────────────────────────────
function BarterCard({ listing }: { listing: ListingWithUser }) {
  const images = listing.images as string[] | null;
  const categories = listing.categories as string[] | null;
  const wantedCategories = listing.wantedCategories as string[] | null;
  const value = Number(listing.retailValue);
  const city = listing.city || listing.location || listing.country || "UAE";

  return (
    <Link href={`/listings/${listing.id}`}>
      <div className="group bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 overflow-hidden h-full flex flex-col cursor-pointer">
        {/* Image header */}
        <div className="relative h-44 bg-gradient-to-br from-bareter-teal/8 to-bareter-teal/3 overflow-hidden flex-shrink-0">
          {images?.[0] ? (
            <img
              src={images[0]}
              alt={listing.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <ArrowLeftRight className="h-14 w-14 text-bareter-teal/20" />
            </div>
          )}
          {/* Category badge */}
          {categories?.[0] && (
            <span className="absolute top-3 left-3 bg-white/95 dark:bg-card/95 text-bareter-teal text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm border border-bareter-teal/20">
              {categories[0]}
            </span>
          )}
          {/* Verified */}
          {listing.user?.isVerified && (
            <span className="absolute top-3 right-3 h-7 w-7 rounded-full bg-bareter-teal flex items-center justify-center shadow-md">
              <ShieldCheck className="h-4 w-4 text-white" />
            </span>
          )}
        </div>

        {/* Card body */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-bold text-bareter-navy dark:text-foreground text-sm leading-snug line-clamp-2 mb-1.5">
            {listing.title}
          </h3>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{city}</span>
          </div>

          {/* Metrics */}
          <div className="mt-auto pt-4 border-t border-gray-100 dark:border-border grid grid-cols-2 gap-3 mt-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Listed value</p>
              <p className="text-sm font-bold text-bareter-navy dark:text-foreground">
                AED {value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Wants</p>
              <p className="text-xs font-semibold text-bareter-teal truncate">
                {wantedCategories?.[0] || "Open offers"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Acquire-style value prop card ────────────────────────────────────────────
function ValueCard({
  icon, badge, title, desc, items, href, cta, accent = false,
}: {
  icon: React.ReactNode;
  badge?: string;
  title: string;
  desc: string;
  items: string[];
  href: string;
  cta: string;
  accent?: boolean;
}) {
  return (
    <div className={`group rounded-2xl border shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 p-8 flex flex-col h-full ${accent ? "bg-bareter-navy text-white border-bareter-navy" : "bg-white dark:bg-card border-gray-100 dark:border-border"}`}>
      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center mb-5 ${accent ? "bg-white/10" : "bg-bareter-teal/8"}`}>
        {icon}
      </div>
      {badge && (
        <span className={`text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full w-fit mb-4 ${accent ? "bg-bareter-teal/20 text-bareter-teal-light" : "bg-bareter-teal/8 text-bareter-teal"}`}>
          {badge}
        </span>
      )}
      <h3 className={`text-xl font-bold mb-3 ${accent ? "text-white" : "text-bareter-navy dark:text-foreground"}`}>{title}</h3>
      <p className={`text-sm leading-relaxed mb-6 flex-1 ${accent ? "text-white/70" : "text-muted-foreground"}`}>{desc}</p>
      <ul className="space-y-2 mb-8">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${accent ? "text-bareter-teal" : "text-bareter-teal"}`} />
            <span className={accent ? "text-white/80" : "text-muted-foreground"}>{item}</span>
          </li>
        ))}
      </ul>
      <Link href={href}>
        <Button className={`w-full gap-2 ${accent ? "bg-bareter-teal hover:bg-bareter-teal/80 text-white" : "bg-bareter-navy hover:bg-bareter-navy/90 text-white"}`}>
          {cta} <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FAQS = [
  { q: "What is Bareter?", a: "Bareter is the UAE's barter marketplace. Businesses swap goods, services or products for content — no cash changes hands." },
  { q: "Who can use Bareter?", a: "Any business or individual in the UAE with something to offer — brands, SMEs, freelancers, and verified creators." },
  { q: "Is it really free?", a: "Yes. Listing, matching, and closing deals is completely free. No commissions, no hidden fees, no agencies." },
  { q: "How does a brand collab work?", a: "Post your product or service. Creators apply with their stats and pitch. You choose the best fit, agree on deliverables, and a contract is auto-generated inside Bareter." },
  { q: "Is it safe?", a: "All deals are documented with legally-scoped barter contracts. Our AI moderates listings and flags suspicious activity before it reaches you." },
];

const TESTIMONIALS = [
  { name: "Khalid Al Mansoori", title: "CEO, Dubai Auto Group", quote: "Closed three brand collabs in one week. Cheaper and more effective than any agency we've ever worked with.", initials: "KA" },
  { name: "Sara Al Hashimi", title: "Marketing Director, Luxury Hotels UAE", quote: "We exchanged hotel stays for authentic TikTok content. The quality was incredible and it cost us nothing but a room.", initials: "SA" },
  { name: "Layla Karimi", title: "Fashion Creator, 80K followers", quote: "Finally a platform where I can find real brand deals without cold DMs. Got gifted three outfits this month alone.", initials: "LK" },
  { name: "Ahmed Al Rashidi", title: "Founder, Dubai Tech Agency", quote: "We traded our SaaS licence for office space. Both sides walked away happy — this is the future of business.", initials: "AR" },
  { name: "Nour Khalil", title: "Chef & Food Creator", quote: "Bareter connected me with a kitchen equipment brand. I created content for them and got AED 3,000 in gear.", initials: "NK" },
];

const STATIC_CREATORS = [
  { name: "Aisha Rahman", platform: "Instagram", followers: "48K", rating: 4.7, avatarUrl: null },
  { name: "Omar Al Farsi", platform: "TikTok", followers: "23K", rating: 4.9, avatarUrl: null },
  { name: "Fatima Zahra", platform: "YouTube", followers: "56K", rating: 4.5, avatarUrl: null },
  { name: "Youssef Benali", platform: "Instagram", followers: "14K", rating: 4.9, avatarUrl: null },
];

type PublicSettings = Record<string, string | null>;
type HowItWorksStep = { n: number; emoji: string; title: string; desc: string };
const DEFAULT_HEADLINE = "Barter. Collab. Grow.";
const DEFAULT_TAGLINE = "UAE's marketplace where businesses swap value — products for services, or products for content.";
const DEFAULT_STEPS: HowItWorksStep[] = [
  { n: 1, emoji: "📋", title: "List what you have", desc: "Describe your item or service in minutes." },
  { n: 2, emoji: "🤖", title: "Get AI-matched", desc: "Our engine finds the perfect barter partner." },
  { n: 3, emoji: "🤝", title: "Close the deal", desc: "Contract auto-generated, exchange confirmed." },
];

const SEARCH_CATEGORIES = [
  { label: "All", category: "All" },
  { label: "Cars", category: "Automotive" },
  { label: "Real Estate", category: "Real Estate" },
  { label: "Services", category: "Services" },
  { label: "Electronics", category: "Electronics" },
  { label: "Hospitality", category: "Hospitality" },
  { label: "Health", category: "Health & Wellness" },
];

// ── Main component ────────────────────────────────────────────────────────────
export function LandingPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { mode: waitlistMode, open: openWaitlist, gate: waitlistGate } = useWaitlist();
  const [, navigate] = useLocation();
  const [heroQuery, setHeroQuery] = useState("");
  const [heroCategory, setHeroCategory] = useState("All");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const headlineParallax = useMousePosition();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: suggestionListings } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings", { search: heroQuery }],
    queryFn: () => fetch(`/api/listings?search=${encodeURIComponent(heroQuery)}&limit=5`).then(r => r.json()),
    enabled: heroQuery.trim().length >= 2,
    staleTime: 5000,
  });
  const { data: suggestionUsers } = useQuery<User[]>({
    queryKey: ["/api/users/search", heroQuery],
    queryFn: () => fetch(`/api/users/search?q=${encodeURIComponent(heroQuery)}&limit=3`).then(r => r.json()),
    enabled: heroQuery.trim().length >= 2,
    staleTime: 5000,
  });

  const { data: cmsSettings } = useQuery<PublicSettings>({ queryKey: ["/api/public/settings"], staleTime: 60_000 });
  const heroHeadline = cmsSettings?.hero_headline || DEFAULT_HEADLINE;
  const heroTagline = cmsSettings?.hero_tagline || DEFAULT_TAGLINE;
  const heroCta = cmsSettings?.hero_cta || null;
  const heroCtaUrl = cmsSettings?.hero_cta_url || null;

  const { data: featuredListings, isLoading: loadingFeatured } = useQuery<ListingWithUser[]>({ queryKey: ["/api/listings/featured"] });
  const { data: featuredCreators = [] } = useQuery<any[]>({
    queryKey: ["/api/creators", "landing"],
    queryFn: async () => { const res = await fetch("/api/creators"); if (!res.ok) return []; return (await res.json()).slice(0, 4); },
    staleTime: 120_000,
  });
  const { data: latestListings } = useQuery<ListingWithUser[]>({ queryKey: ["/api/listings"] });

  const displayListings = (
    featuredListings && featuredListings.length > 0 ? featuredListings : latestListings ?? []
  ).slice(0, 8);

  const creators = featuredCreators.length > 0
    ? featuredCreators.map((c: any) => ({
        name: c.fullName, platform: c.creatorProfile?.primaryPlatform ?? "Instagram",
        followers: c.creatorProfile?.followerCount >= 1_000_000 ? `${(c.creatorProfile.followerCount / 1_000_000).toFixed(1)}M`
          : c.creatorProfile?.followerCount >= 1_000 ? `${(c.creatorProfile.followerCount / 1_000).toFixed(0)}K` : "—",
        rating: 4.7, avatarUrl: c.avatarUrl,
      }))
    : STATIC_CREATORS;

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = heroQuery.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (heroCategory && heroCategory !== "All") params.set("category", heroCategory);
    if (q.length >= 2) fetch("/api/search-history", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ query: q, category: heroCategory !== "All" ? heroCategory : null }) }).catch(() => {});
    navigate(`/browse${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-background">

      {/* ══════════════════════════════════════════════════════════════════════
          HERO — dark image background, large headline, search, CTAs
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative isolate overflow-hidden" data-testid="section-hero">
        <img src={heroHandshakeImg} alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover object-center" loading="eager" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-bareter-navy/70 via-bareter-navy/60 to-bareter-navy/80" />

        <div className="container relative z-10 mx-auto max-w-6xl px-4 pt-24 pb-28 md:pt-32 md:pb-36">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto">

            {/* Headline */}
            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-[1.08] tracking-tight mb-6"
              data-testid="text-hero-headline"
              style={{ transform: `translate3d(${(headlineParallax.x * 2).toFixed(2)}px, ${(headlineParallax.y * 2).toFixed(2)}px, 0)`, transition: "transform 0.15s ease-out" }}
            >
              {heroHeadline}
            </h1>

            {/* Subheadline */}
            <p className="text-xl text-white/75 max-w-2xl mx-auto leading-relaxed mb-10" data-testid="text-hero-tagline">
              {heroTagline}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Button size="lg" className="h-13 px-8 bg-bareter-teal hover:bg-bareter-teal/90 text-white font-bold text-base gap-2 rounded-xl shadow-lg"
                onClick={() => { if (waitlistGate()) navigate("/browse"); }}>
                Browse Listings <ArrowRight className="h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="h-13 px-8 border-white/30 text-white bg-white/10 hover:bg-white/20 font-semibold text-base rounded-xl gap-2"
                onClick={() => { if (waitlistGate()) navigate(user ? "/create-listing" : "/register"); }}>
                List Your Barter
              </Button>
            </div>

          </div>
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════════════════════
          THREE WAYS — acquire.com animated feature cards
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 dark:bg-muted/20 py-20" data-testid="section-three-ways">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">What you can do</p>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight mb-4">
              One platform. Three ways to swap.
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Trade goods, services, or content — without spending a dirham.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ValueCard
              icon={<ArrowLeftRight className="h-6 w-6 text-bareter-teal" />}
              badge="Most popular"
              title="Barter Anything"
              desc="Swap your goods, services or skills directly with other UAE businesses. Cars, office space, legal services, hospitality — anything goes."
              items={["Goods for goods", "Services for services", "Mixed — goods for services", "AI-matched partners", "Free, always"]}
              href="/browse"
              cta="Browse Barters"
            />
            <ValueCard
              icon={<Camera className="h-6 w-6 text-bareter-teal" />}
              badge="For brands"
              title="Brand Collabs"
              desc="Post your product or service. Verified creators apply with their pitch. Pick the best fit and receive authentic content in return."
              items={["Creators apply to you", "No agency fees", "Choose the best fit", "Contract auto-generated", "Instagram, TikTok, YouTube"]}
              href="/create-listing"
              cta="Post a Collab"
              accent
            />
            <ValueCard
              icon={<Sparkles className="h-6 w-6 text-bareter-teal" />}
              badge="For creators"
              title="Creator Deals"
              desc="You have followers. Brands have products. Get real products and services in exchange for authentic content on your platform."
              items={["Any niche, any follower count", "Browse brand listings", "Apply with your pitch", "Real products, not exposure", "Deals tracked in-app"]}
              href="/register"
              cta="Join as Creator"
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          TOP BARTERS — acquire.com "Top Picks" style animated listing grid
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white dark:bg-background py-20" data-testid="section-top-barters">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-1">Top Picks</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight">
                Handpicked barters
              </h2>
              <p className="text-muted-foreground mt-1.5">High-value listings from verified UAE businesses</p>
            </div>
            <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm font-bold text-bareter-teal hover:text-bareter-teal/80 transition-colors whitespace-nowrap">
              View all listings <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {loadingFeatured ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-gray-100 dark:bg-muted animate-pulse h-64" />
              ))}
            </div>
          ) : displayListings.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-border p-16 text-center">
              <ArrowLeftRight className="h-12 w-12 text-gray-300 dark:text-muted-foreground mx-auto mb-4" />
              <p className="font-bold text-bareter-navy dark:text-foreground text-lg mb-2">No listings yet</p>
              <p className="text-muted-foreground mb-6">Be the first to post a barter listing.</p>
              <Link href={user ? "/create-listing" : "/register"}>
                <Button className="bg-bareter-teal hover:bg-bareter-teal/90 text-white px-8 rounded-xl">Create the first listing</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {displayListings.map((listing) => (
                  <BarterCard key={listing.id} listing={listing} />
                ))}
              </div>
              <div className="text-center mt-12">
                <Link href="/browse">
                  <Button size="lg" className="bg-bareter-navy hover:bg-bareter-navy/90 text-white px-10 rounded-xl gap-2 font-bold">
                    Browse all listings <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          FOR SELLERS — left text, right visual (acquire.com pattern)
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 dark:bg-muted/20 py-20" data-testid="section-for-sellers">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="flex flex-col lg:flex-row gap-14 lg:gap-20 items-center">
            {/* Left — copy */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">List your barter</p>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight mb-5 leading-[1.1]">
                Sell your excess.<br />Get what you actually need.
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8 max-w-lg">
                Every business has underused assets — office space, surplus stock, professional services, equipment. List it on Bareter and get what you need in return. No cash required.
              </p>
              <div className="space-y-4 mb-10">
                {[
                  { icon: <Clock className="h-5 w-5 text-bareter-teal" />, title: "List in 2 minutes", desc: "Add photos, set a value, describe what you want in return." },
                  { icon: <Zap className="h-5 w-5 text-bareter-teal" />, title: "AI matches you instantly", desc: "Our engine surfaces the most compatible barter partners." },
                  { icon: <Lock className="h-5 w-5 text-bareter-teal" />, title: "Auto-generated contract", desc: "Every deal is documented with a legally-scoped barter contract." },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-bareter-teal/8 flex items-center justify-center flex-shrink-0">{item.icon}</div>
                    <div>
                      <p className="font-bold text-bareter-navy dark:text-foreground text-sm">{item.title}</p>
                      <p className="text-muted-foreground text-sm mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Link href={user ? "/create-listing" : "/register"}>
                  <Button size="lg" className="bg-bareter-teal hover:bg-bareter-teal/90 text-white px-8 rounded-xl gap-2 font-bold">
                    List for free <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/browse">
                  <Button size="lg" variant="outline" className="px-8 rounded-xl font-semibold">
                    View listings
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right — category grid visual */}
            <div className="w-full lg:w-[480px] flex-shrink-0">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { img: catCarsImg, label: "Cars & Vehicles" },
                  { img: catRealEstateImg, label: "Real Estate" },
                  { img: catServicesImg, label: "Services" },
                  { img: catElectronicsImg, label: "Electronics" },
                  { img: catHospitalityImg, label: "Hospitality" },
                  { img: catFitnessImg, label: "Health & Fitness" },
                ].map((cat) => (
                  <Link key={cat.label} href={`/browse?category=${encodeURIComponent(cat.label)}`}>
                    <div className="group relative overflow-hidden rounded-2xl aspect-[4/3] cursor-pointer">
                      <img src={cat.img} alt={cat.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <span className="absolute bottom-3 left-3 text-white text-xs font-bold">{cat.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          FOR BUYERS — right text, left visual (acquire.com pattern, flipped)
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white dark:bg-background py-20" data-testid="section-for-buyers">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="flex flex-col lg:flex-row-reverse gap-14 lg:gap-20 items-center">
            {/* Right — copy */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">Find what you need</p>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight mb-5 leading-[1.1]">
                Get 500k+ dirhams in value.<br />Without spending cash.
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8 max-w-lg">
                Browse verified UAE businesses offering their best assets. Propose a barter with what you have. Our AI finds the perfect match so every deal is fair.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-10">
                {[
                  { n: "500+", label: "Active listings" },
                  { n: "300+", label: "Deals closed" },
                  { n: "AED 0", label: "Commission" },
                  { n: "100%", label: "Verified members" },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 dark:bg-muted/30 rounded-2xl p-5 border border-gray-100 dark:border-border">
                    <p className="text-2xl font-extrabold text-bareter-navy dark:text-foreground">{s.n}</p>
                    <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
              <Link href="/browse">
                <Button size="lg" className="bg-bareter-teal hover:bg-bareter-teal/90 text-white px-8 rounded-xl gap-2 font-bold">
                  Browse listings <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Left — creator cards visual */}
            <div className="w-full lg:w-[420px] flex-shrink-0 space-y-3">
              <p className="text-sm font-bold text-bareter-navy dark:text-foreground mb-4">Creators available now</p>
              {creators.map((c, i) => (
                <div key={i} className="group flex items-center gap-4 p-4 bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
                  <Avatar className="h-11 w-11 flex-shrink-0">
                    <AvatarImage src={(c as any).avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-bareter-teal text-white font-bold">{c.name?.[0] ?? "C"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-bareter-navy dark:text-foreground text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{c.platform} · {c.followers} followers</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                    <span className="text-xs font-bold text-bareter-navy dark:text-foreground">{c.rating}</span>
                  </div>
                </div>
              ))}
              <Link href="/creators">
                <div className="flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 border-dashed border-bareter-teal/30 text-bareter-teal text-sm font-bold hover:bg-bareter-teal/5 transition-colors cursor-pointer">
                  <Users className="h-4 w-4" /> View all creators
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          HOW IT WORKS — acquire-style 4-step flow
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-bareter-navy overflow-hidden py-20" data-testid="section-how">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
              From listing to closed deal.
            </h2>
            <p className="text-white/55 max-w-lg mx-auto text-lg">
              No cash. No waste. Just value for value — matched by AI and sealed with a contract.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 relative">
            <div className="absolute top-9 left-[13%] right-[13%] h-px hidden lg:block"
              style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.15) 20%, rgba(255,255,255,0.15) 80%, transparent)" }} aria-hidden="true" />

            {([
              { Icon: LayoutList, title: "List what you have", desc: "Upload photos, set a value, describe what you want back. Done in 2 minutes.", tag: "2 min to list" },
              { Icon: Sparkles, title: "AI finds your match", desc: "Our engine scans thousands of listings and surfaces the most compatible partners.", tag: "Instant matching" },
              { Icon: MessageSquare, title: "Negotiate in-app", desc: "Chat, counter-offer, and agree on terms — all inside Bareter.", tag: "No lawyers needed" },
              { Icon: FileSignature, title: "Sign & exchange", desc: "Auto-generated barter contract. Sign on-platform and complete the exchange.", tag: "Legally binding" },
            ] as const).map((step, i) => (
              <div key={step.title} className="relative flex flex-col items-center text-center group">
                <div className="relative mb-5 z-10">
                  <div className="h-[72px] w-[72px] rounded-2xl bg-bareter-teal group-hover:bg-bareter-teal/80 transition-all duration-300 flex items-center justify-center shadow-lg">
                    <step.Icon className="h-7 w-7 text-white" />
                  </div>
                  <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white text-bareter-navy text-[11px] font-extrabold flex items-center justify-center shadow-md">{i + 1}</span>
                </div>
                <h3 className="text-base font-bold text-white mb-2 leading-snug">{step.title}</h3>
                <p className="text-sm text-white/55 leading-relaxed mb-4 max-w-[200px]">{step.desc}</p>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1 rounded-full bg-white/10 text-white border border-white/20">
                  <CheckCircle2 className="h-3 w-3" />{step.tag}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="h-12 px-8 bg-bareter-teal hover:bg-bareter-teal/90 text-white font-bold gap-2 rounded-xl shadow-lg"
              onClick={() => { if (waitlistGate()) navigate(user ? "/create-listing" : "/register"); }}>
              Start Bartering <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="ghost" className="h-12 px-6 text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
              onClick={() => navigate("/browse")}>
              Browse listings
            </Button>
          </div>
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════════════════════
          FAQ — accordion
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 dark:bg-muted/20 py-20" data-testid="section-faq">
        <div className="container mx-auto max-w-2xl px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">FAQs</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight">
              Frequently asked questions
            </h2>
          </div>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <div key={i} className="bg-white dark:bg-card border border-gray-100 dark:border-border rounded-2xl overflow-hidden">
                <button className="w-full flex items-center justify-between px-6 py-5 text-left font-semibold text-bareter-navy dark:text-foreground hover:bg-gray-50 dark:hover:bg-muted/10 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{faq.q}</span>
                  {openFaq === i
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-gray-100 dark:border-border pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          FINAL CTA — acquire.com "Join 500k+" style
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative isolate overflow-hidden bg-bareter-teal py-24" data-testid="section-cta">
        <div className="absolute inset-0 -z-10 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 0%, transparent 60%), radial-gradient(circle at 70% 50%, white 0%, transparent 60%)" }} aria-hidden="true" />
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
            Join the Bareter community
          </h2>
          <p className="text-white/75 text-lg mb-10 max-w-xl mx-auto">
            Join the UAE's fastest-growing barter marketplace.
          </p>
          {!user && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (waitlistMode.enabled) { openWaitlist(); }
                else if (heroCtaUrl) { navigate(`${heroCtaUrl}${heroCtaUrl.includes("?") ? "&" : "?"}email=${encodeURIComponent(waitlistEmail)}`); }
                else { navigate(`/register?email=${encodeURIComponent(waitlistEmail)}`); }
              }}
              className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-6"
            >
              <input type="email" required value={waitlistEmail} onChange={(e) => setWaitlistEmail(e.target.value)}
                placeholder="you@business.com"
                className="flex-1 h-13 px-5 rounded-xl bg-white/15 border border-white/25 text-white placeholder:text-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
                data-testid="input-waitlist-email" />
              <Button type="submit" className="h-13 px-8 rounded-xl bg-white text-bareter-teal hover:bg-white/90 font-bold text-sm" data-testid="button-waitlist-submit">
                {heroCta || t("landing.startBartering")}
              </Button>
            </form>
          )}
          {user && (
            <div className="flex justify-center gap-3">
              <Link href="/create-listing">
                <Button size="lg" className="bg-white text-bareter-teal hover:bg-white/90 font-bold px-8 rounded-xl gap-2">
                  List a Barter <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/browse">
                <Button size="lg" variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20 font-semibold px-8 rounded-xl">
                  Browse listings
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}

// ── Acquire-style stats bar ───────────────────────────────────────────────────
function AcquireStatsBar() {
  const { ref, isVisible } = useReveal<HTMLElement>();
  const { data: counter } = useQuery<{ count: number }>({ queryKey: ["/api/waitlist/count"], refetchInterval: 10_000 });
  const signups = useCountUp(counter?.count ?? null, 1500, isVisible);

  const stats = [
    { value: signups !== null ? `${signups.toLocaleString()}+` : "400+", label: "Waitlist signups", icon: <Users className="h-5 w-5 text-bareter-teal" /> },
    { value: "AED 0", label: "Commission — free forever", icon: <CheckCircle2 className="h-5 w-5 text-bareter-teal" /> },
    { value: "AI-powered", label: "Instant barter matching", icon: <Cpu className="h-5 w-5 text-bareter-teal" /> },
    { value: "E-signed", label: "Auto-generated contracts", icon: <FileSignature className="h-5 w-5 text-bareter-teal" /> },
  ];

  return (
    <section ref={ref} className="bg-white dark:bg-card border-b border-gray-100 dark:border-border" data-testid="section-trust">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 dark:bg-border rounded-2xl overflow-hidden">
          {stats.map((s, i) => (
            <div key={i} className="bg-white dark:bg-card flex flex-col sm:flex-row items-center sm:items-start gap-3 px-6 py-5">
              <div className="flex-shrink-0 mt-0.5">{s.icon}</div>
              <div className="text-center sm:text-left">
                <p className="text-lg sm:text-xl font-extrabold text-bareter-navy dark:text-foreground leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
