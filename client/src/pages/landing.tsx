import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { DealTicker } from "@/components/DealTicker";
import { SuccessStoriesMarquee } from "@/components/SuccessStoriesMarquee";
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
  Play,
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
  RefreshCw,
  Star,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const COLLAGE_IMAGES = [catHospitalityImg, catServicesImg, catElectronicsImg, catCarsImg, catRealEstateImg, catFitnessImg];

const FAQS = [
  { q: "What is Bareter?", a: "Bareter is the UAE's first B2B barter marketplace and creator collab platform. Businesses swap products or services for content, services, or other products — no cash changes hands." },
  { q: "Who can use Bareter?", a: "Any business or individual in the UAE with something to offer. Brands, SMEs, freelancers, and creators with 2,000+ followers are all welcome." },
  { q: "Is it really free?", a: "Yes. Listing, matching, and closing deals is free. No commissions, no hidden fees, no agencies." },
  { q: "How does the brand collab work?", a: "Post your product or service. Creators apply with their stats and pitch. You choose the best fit, agree on deliverables inside Bareter, and a contract is auto-generated." },
  { q: "Is it safe?", a: "All deals are documented inside Bareter with legally-scoped barter contracts. Our AI moderates listings and flags suspicious activity before it reaches you." },
];

const TESTIMONIALS = [
  { name: "Khalid Al Mansoori", title: "CEO, Dubai Auto Group", quote: "We traded a fleet service package for office fit-out work. No cash changed hands and both businesses got exactly what they needed.", initials: "KA" },
  { name: "Sara Al Hashimi", title: "Marketing Director, Luxury Hotels UAE", quote: "We exchanged hotel stays for professional photography. The quality was incredible and it cost us nothing but a room.", initials: "SA" },
  { name: "Layla Karimi", title: "Fashion Creator, 80K followers", quote: "Finally a platform where I can find real brand deals without cold DMs. Got gifted three outfits this month alone.", initials: "LK" },
];

type PublicSettings = Record<string, string | null>;
type HowItWorksStep = { n: number; emoji: string; title: string; desc: string };
const DEFAULT_HEADLINE = "Trade what you have for what you need.";
const DEFAULT_TAGLINE = "UAE's barter marketplace. No cash. No waste. Just pure exchange.";
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
  const { data: latestListings, isLoading: loadingLatest } = useQuery<ListingWithUser[]>({ queryKey: ["/api/listings"] });

  const featured = ((featuredListings && featuredListings.length > 0 ? featuredListings : latestListings || [])).slice(0, 4);

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = heroQuery.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (heroCategory && heroCategory !== "All") params.set("category", heroCategory);
    if (q.length >= 2) fetch("/api/search-history", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ query: q, category: heroCategory !== "All" ? heroCategory : null }) }).catch(() => {});
    navigate(`/browse${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const SEARCH_CATEGORIES = [
    { label: "All", category: "All" },
    { label: "Cars", category: "Automotive" },
    { label: "Real Estate", category: "Real Estate" },
    { label: "Services", category: "Services" },
    { label: "Electronics", category: "Electronics" },
    { label: "Hospitality", category: "Hospitality" },
    { label: "Health", category: "Health & Wellness" },
  ];

  const galleryImages = (latestListings?.filter(l => (l.images as string[])?.[0]).slice(0, 8).map(l => (l.images as string[])[0]) ?? []);
  const displayGallery = galleryImages.length >= 4 ? galleryImages : [catHospitalityImg, catCarsImg, catServicesImg, catElectronicsImg, catYachtsImg, catFitnessImg, catHomeImg, catRealEstateImg];

  return (
    <div className="flex flex-col min-h-screen">

      {/* ═══════════════════════════════════════════════════════════════════
          HERO — unchanged from original
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative isolate overflow-hidden bareter-noise" data-testid="section-hero">
        <img src={heroHandshakeImg} alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover object-center" loading="eager" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-black/30" />
        <div aria-hidden="true" className="absolute inset-x-0 top-1/4 bottom-0 -z-10 bg-gradient-to-b from-transparent via-bareter-navy-deep/45 to-bareter-navy-deep/60" />
        <div className="container relative z-10 mx-auto max-w-7xl px-4 py-20 md:py-28 lg:py-32">
          <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
            <h1
              className="text-hero text-white sm:whitespace-nowrap"
              data-testid="text-hero-headline"
              style={{ transform: `translate3d(${(headlineParallax.x * 3).toFixed(2)}px, ${(headlineParallax.y * 3).toFixed(2)}px, 0)`, transition: "transform 0.15s ease-out" }}
            >
              {heroHeadline}
            </h1>
            <p className="hero-tagline mt-4 drop-shadow-sm" data-testid="text-hero-tagline">{heroTagline}</p>

            <div ref={searchRef} className="mt-8 w-full max-w-[760px] relative">
              <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
                <span className="text-white/80 text-sm font-medium whitespace-nowrap flex-shrink-0">Searching in</span>
                {SEARCH_CATEGORIES.map((cat) => (
                  <button key={cat.label} type="button" onClick={() => setHeroCategory(cat.category)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${heroCategory === cat.category ? "bg-bareter-teal text-white shadow-md" : "bg-white/10 text-white border border-white/30 hover:bg-white/20"}`}
                    data-testid={`tab-search-${cat.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >{cat.label}</button>
                ))}
              </div>
              <form onSubmit={(e) => { setShowSuggestions(false); handleHeroSearch(e); }} className="flex items-stretch bg-white rounded-lg shadow-bareter-hover overflow-hidden h-14" role="search" data-testid="form-hero-search">
                <input type="search" value={heroQuery} onChange={(e) => { setHeroQuery(e.target.value); setShowSuggestions(true); }} onFocus={() => heroQuery.length >= 2 && setShowSuggestions(true)} placeholder="Search for anything..." className="flex-1 px-5 bg-transparent text-bareter-navy placeholder:text-gray-400 text-base focus:outline-none" data-testid="input-hero-search" autoComplete="off" />
                <div className="flex items-center border-s border-gray-200 px-3"><Search className="h-5 w-5 text-gray-400" aria-hidden="true" /></div>
                <button type="submit" className="px-8 bg-bareter-teal hover:bg-bareter-teal-light text-white font-bold text-base transition-colors active:scale-[0.98]" aria-label="Search" data-testid="button-hero-search">Search</button>
              </form>

              {showSuggestions && heroQuery.trim().length >= 2 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-lg shadow-bareter-hover border border-bareter-border overflow-hidden z-50">
                  {suggestionListings && suggestionListings.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-bareter-muted">Listings</p>
                      {suggestionListings.slice(0, 5).map((l) => (
                        <button key={l.id} type="button" className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bareter-teal-muted text-start transition-colors" onClick={() => { setShowSuggestions(false); navigate(`/listings/${l.id}`); }}>
                          {(l.images as string[])?.[0] && <img src={(l.images as string[])[0]} alt="" className="h-9 w-9 rounded-md object-cover flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-bareter-navy truncate">{l.title}</p>
                            <p className="text-xs text-bareter-muted truncate">AED {Number(l.retailValue).toLocaleString()} · {l.location}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {Array.isArray(suggestionUsers) && suggestionUsers.length > 0 && (
                    <div className="border-t border-bareter-border">
                      <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-bareter-muted">Members</p>
                      {suggestionUsers.slice(0, 3).map((u: User) => (
                        <button key={u.id} type="button" className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bareter-teal-muted text-start transition-colors" onClick={() => { setShowSuggestions(false); navigate(`/users/${u.id}`); }}>
                          <div className="h-9 w-9 rounded-full bg-bareter-teal text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">{u.fullName?.charAt(0)?.toUpperCase() || "U"}</div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-bareter-navy truncate">{u.fullName}</p>
                            <p className="text-xs text-bareter-muted truncate">{u.businessName || u.location || "Member"}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-bareter-border px-4 py-3">
                    <button type="button" className="w-full text-sm font-semibold text-bareter-teal hover:text-bareter-teal-light text-center" onClick={() => { setShowSuggestions(false); handleHeroSearch({ preventDefault: () => {} } as React.FormEvent); }}>
                      Search all results for "{heroQuery}" →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Deal ticker */}
      <DealTicker />

      {/* Collab/creator sections removed — restore from git history (commit 271f170) when ready */}

      {/* ═══════════════════════════════════════════════════════════════════
          TRENDING / LISTINGS
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-white dark:bg-background" data-testid="section-featured">
        <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-section text-bareter-navy dark:text-foreground">{t("landing.trendingNow")}</h2>
              <p className="text-caption mt-1">{t("landing.exploreCategories")}</p>
            </div>
            <Link href="/browse" className="inline-flex items-center gap-1 text-sm font-semibold text-bareter-teal hover:text-bareter-teal-light" data-testid="link-view-all-listings">
              {t("landing.viewAllListings")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {loadingFeatured && loadingLatest ? (
            <div className="grid grid-cols-3 gap-1 sm:gap-2">{Array.from({ length: 9 }).map((_, i) => (<div key={i} className="aspect-square rounded-sm sm:rounded-md bg-muted/60 animate-pulse" />))}</div>
          ) : featured.length === 0 ? (
            <div className="rounded-bareter-card bg-white dark:bg-card border border-bareter-border dark:border-border p-10 text-center">
              <p className="text-card-title text-bareter-navy dark:text-foreground">{t("landing.noListingsYet")}</p>
              <p className="text-caption mt-1 mb-4">{t("landing.postOfferInMinutes")}</p>
              <Link href={user ? "/create-listing" : "/register"}><Button variant="bareter">{t("landing.createFirstListing")}</Button></Link>
            </div>
          ) : (() => {
            const all = latestListings ?? [];
            const featuredRow = (featuredListings && featuredListings.length > 0 ? featuredListings : all).slice(0, 10);
            const justListedRow = all.slice(0, 10);
            return (
              <div className="space-y-8">
                {featuredRow.length > 0 && <TrendingDetailedRow listings={featuredRow} max={10} />}
                {justListedRow.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-bareter-navy dark:text-foreground mb-3">{t("landing.justListed")}</h3>
                    <TrendingDetailedRow listings={justListedRow} max={10} />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          NEW: SOCIAL PROOF BAND
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-bareter-navy dark:bg-bareter-navy py-16" data-testid="section-social-proof">
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Brands: 10,000+ Creators are waiting in our app
          </h2>
          <p className="text-white/60 text-base leading-relaxed mb-8 max-w-2xl mx-auto">
            Create UGC without an agency or commitment. Our user-friendly platform enables you to generate high-quality content without the need for agencies or long-term contracts. Content creators apply directly through our app. All you have to do is pick your favourites.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button variant="bareter" size="lg" className="gap-2 rounded-full px-8" onClick={() => { if (waitlistGate()) navigate(user ? "/create-listing" : "/register"); }}>
              Start for free <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="gap-2 rounded-full px-8 border-white/30 text-white hover:bg-white/10" onClick={() => navigate("/browse")}>
              Browse creators
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          NEW: MINIMAL EFFORT, MAXIMUM EFFECT
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-bareter-off-white dark:bg-background py-16" data-testid="section-minimal-effort">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="text-section text-bareter-navy dark:text-foreground text-center mb-12">
            Minimal effort, maximum effect
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: <Users className="h-7 w-7 text-bareter-teal" />, title: "Over 10,000 verified creators", desc: "Our trusted creators deliver authentic content that reaches the right audience." },
              { icon: <Handshake className="h-7 w-7 text-bareter-teal" />, title: "Collab in a snap", desc: "Creators apply to your deal. You decide who represents your brand." },
              { icon: <RefreshCw className="h-7 w-7 text-bareter-teal" />, title: "Stop paying, start Bartering", desc: "Use your own product or service as currency and maximise your return on investment." },
              { icon: <Sparkles className="h-7 w-7 text-bareter-teal" />, title: "Authentic Brand Impact", desc: "Achieve real growth through content created by real people with genuine reach." },
            ].map((card) => (
              <div key={card.title} className="bg-white dark:bg-card rounded-2xl border border-bareter-border dark:border-border p-6 shadow-sm">
                <div className="mb-4">{card.icon}</div>
                <h3 className="text-base font-bold text-bareter-navy dark:text-foreground mb-2">{card.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          NEW: AUTHENTIC CONTENT GALLERY
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-white dark:bg-background py-16" data-testid="section-gallery">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-10">
            <h2 className="text-section text-bareter-navy dark:text-foreground mb-2">
              Authentic content made for you ✨
            </h2>
            <p className="text-caption max-w-xl mx-auto">
              Whether you run a restaurant, hotel, car dealership or brand, Bareter connects you with the right creators to help you reach new customers.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {displayGallery.slice(0, 8).map((img, i) => (
              <div key={i} className={`relative overflow-hidden rounded-2xl ${i === 0 ? "sm:row-span-2" : ""}`} style={{ height: i === 0 ? "auto" : "160px", minHeight: i === 0 ? "330px" : "160px" }}>
                <img src={img} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                {i === 1 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center shadow"><Play className="h-4 w-4 fill-bareter-navy ml-0.5" /></div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Button variant="outline" className="border-bareter-teal text-bareter-teal hover:bg-bareter-teal/5 rounded-full px-8" onClick={() => navigate("/browse")}>
              Browse all listings
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          NEW: TESTIMONIALS
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-bareter-off-white dark:bg-background py-16" data-testid="section-testimonials">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="text-section text-bareter-navy dark:text-foreground text-center mb-10">What our partners say</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white dark:bg-card rounded-2xl border border-bareter-border dark:border-border p-6 shadow-sm">
                <div className="flex items-center gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 text-yellow-400 fill-yellow-400" />)}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-bareter-teal flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{t.initials}</div>
                  <div>
                    <p className="text-sm font-bold text-bareter-navy dark:text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.title}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SUCCESS STORIES MARQUEE — original
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-white dark:bg-background border-y border-bareter-border dark:border-border" data-testid="section-stories">
        <div className="container mx-auto max-w-7xl px-4 pt-5 pb-2">
          <p className="text-xs font-bold uppercase tracking-wider text-bareter-muted mb-3">{t("landing.realBarters")}</p>
        </div>
        <SuccessStoriesMarquee />
        <div className="h-4" aria-hidden="true" />
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          NEW: FAQ
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-bareter-off-white dark:bg-background py-16" data-testid="section-faq">
        <div className="container mx-auto max-w-2xl px-4">
          <h2 className="text-section text-bareter-navy dark:text-foreground text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <div key={i} className="bg-white dark:bg-card border border-bareter-border dark:border-border rounded-2xl overflow-hidden">
                <button className="w-full flex items-center justify-between px-6 py-4 text-left font-semibold text-bareter-navy dark:text-foreground hover:bg-bareter-off-white dark:hover:bg-muted/10 transition-colors" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{faq.q}</span>
                  {openFaq === i ? <ChevronUp className="h-4 w-4 text-bareter-muted flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-bareter-muted flex-shrink-0" />}
                </button>
                {openFaq === i && <div className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-bareter-border dark:border-border">{faq.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          WAITLIST CTA — original
      ═══════════════════════════════════════════════════════════════════ */}
      {!user && (
        <section className="relative isolate overflow-hidden bg-bareter-gradient bareter-noise" data-testid="section-waitlist-cta">
          <div className="container relative z-10 mx-auto max-w-3xl px-4 py-16 text-center">
            <h2 className="text-section text-white">{t("landing.joinWaitlist")}</h2>
            <p className="mt-2 text-bareter-teal-light">United Arab Emirates</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (waitlistMode.enabled) { openWaitlist(); }
                else if (heroCtaUrl) { navigate(`${heroCtaUrl}${heroCtaUrl.includes("?") ? "&" : "?"}email=${encodeURIComponent(waitlistEmail)}`); }
                else { navigate(`/register?email=${encodeURIComponent(waitlistEmail)}`); }
              }}
              className="mt-6 mx-auto max-w-[480px] flex flex-col sm:flex-row gap-2"
            >
              <input type="email" required value={waitlistEmail} onChange={(e) => setWaitlistEmail(e.target.value)} placeholder="you@business.com" className="flex-1 h-12 px-5 rounded-full bg-white text-bareter-navy placeholder:text-bareter-muted text-sm focus:outline-none focus:ring-2 focus:ring-bareter-teal-light" data-testid="input-waitlist-email" />
              <Button type="submit" variant="bareter" className="h-12 px-6 rounded-full" data-testid="button-waitlist-submit">
                {heroCta || t("landing.startBartering")}
              </Button>
            </form>
            <p className="mt-3 text-caption text-white/50">{t("landing.noSpam")}</p>
          </div>
        </section>
      )}
    </div>
  );
}

type TrustStatItem = { icon: typeof ShieldCheck; label: string; desc: string; countTo?: number; suffix?: string };
function TrustBar() {
  const { ref, isVisible } = useReveal<HTMLElement>();
  const { t } = useI18n();
  const { data: counter, isLoading: countLoading } = useQuery<{ count: number }>({ queryKey: ["/api/waitlist/count"], refetchInterval: 10_000 });
  const waitlistReady = !countLoading && counter?.count !== undefined;
  const stats: TrustStatItem[] = [
    { icon: Users, label: t("landing.waitlistSignups"), desc: t("landing.joinCommunity"), countTo: waitlistReady ? counter.count : undefined, suffix: "+" },
    { icon: Cpu, label: t("landing.aiMatchedDeals"), desc: t("landing.smartBarterEngine") },
    { icon: FileSignature, label: t("landing.autoContracts"), desc: t("landing.eSignedAgreements") },
    { icon: CheckCircle2, label: t("landing.zeroPlatformFees"), desc: t("landing.alwaysFree") },
  ];
  return (
    <section ref={ref} className="bg-white dark:bg-card border-y border-bareter-border dark:border-border" data-testid="section-trust">
      <div className="container mx-auto max-w-7xl px-4 py-7">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 sm:gap-y-0 divide-y sm:divide-y-0 sm:divide-x divide-bareter-border dark:divide-border">
          {stats.map((s, i) => <TrustStat key={i} stat={s} active={isVisible} />)}
        </div>
      </div>
    </section>
  );
}
function TrustStat({ stat, active }: { stat: TrustStatItem; active: boolean }) {
  const value = useCountUp(stat.countTo ?? null, 1500, active);
  return (
    <div className="flex flex-col items-center text-center px-3 sm:px-6 py-1">
      <stat.icon className="h-7 w-7 text-bareter-teal mb-2" />
      {value !== null ? (
        <p className="text-card-title text-bareter-navy dark:text-foreground tabular-nums" data-testid={`stat-trust-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>{value.toLocaleString()}{stat.suffix ?? ""} {stat.label}</p>
      ) : (
        <p className="text-card-title text-bareter-navy dark:text-foreground">{stat.label}</p>
      )}
      <p className="text-caption mt-0.5">{stat.desc}</p>
    </div>
  );
}
