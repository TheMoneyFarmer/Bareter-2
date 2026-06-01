import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { useI18n } from "@/lib/i18n";
import heroHandshakeImg from "@assets/generated_images/hero-handshake.png";
import catCarsImg from "@assets/generated_images/cat-cars.png";
import catRealEstateImg from "@assets/generated_images/cat-real-estate.png";
import catServicesImg from "@assets/generated_images/cat-services.png";
import catElectronicsImg from "@assets/generated_images/cat-electronics.png";
import catHospitalityImg from "@assets/generated_images/cat-hospitality.png";
import catFitnessImg from "@assets/generated_images/cat-fitness.png";
import catHomeImg from "@assets/generated_images/cat-home.png";
import type { ListingWithUser } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowRight, CheckCircle2, Users, Camera, Sparkles, Handshake,
  ArrowLeftRight, FileSignature, LayoutList, MessageSquare,
  ChevronDown, ChevronUp, MapPin, Zap, Clock, Lock, ShieldCheck,
  Star, TrendingUp, Search,
} from "lucide-react";

// ── Intersection-observer stagger hook ───────────────────────────────────────
function useStagger(selector: string, deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(selector));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            items.forEach((item, i) => {
              setTimeout(() => item.classList.add("is-in-view"), i * 80);
            });
            observer.disconnect();
          }
        });
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

// ── Single-element reveal ─────────────────────────────────────────────────────
function useRevealEl() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("is-in-view"); observer.disconnect(); } },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FAQS = [
  { q: "What is Bareter?", a: "Bareter is the UAE's first B2B barter marketplace. Businesses swap products, services, or goods for content — no cash required." },
  { q: "Who can use Bareter?", a: "Any business or individual in the UAE with something to offer — brands, SMEs, freelancers, and verified creators." },
  { q: "Is it really free?", a: "Yes. Listing, matching, and closing deals is completely free. No commissions, no hidden fees, no agencies." },
  { q: "How does brand collabs work?", a: "Post your product or service. Creators apply with their stats. You pick the best fit, agree on deliverables, and a barter contract is auto-generated." },
  { q: "Is it safe?", a: "All deals are documented inside Bareter with legally-scoped barter contracts. Our AI moderates listings and flags suspicious activity before it reaches you." },
];

// ── Listing card ──────────────────────────────────────────────────────────────
function ListingCard({ listing }: { listing: ListingWithUser }) {
  const images = listing.images as string[] | null;
  const cats = listing.categories as string[] | null;
  const wanted = listing.wantedCategories as string[] | null;
  const value = Number(listing.retailValue);
  const city = listing.city || listing.location || listing.country || "UAE";
  return (
    <Link href={`/listings/${listing.id}`}>
      <article className="bareter-stagger-card group bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border shadow-sm hover:shadow-bareter-hover hover:-translate-y-2 transition-all duration-300 overflow-hidden h-full flex flex-col cursor-pointer bareter-card-hover">
        <div className="relative h-44 bg-gradient-to-br from-bareter-teal/8 to-bareter-teal/3 overflow-hidden flex-shrink-0">
          {images?.[0] ? (
            <img src={images[0]} alt={listing.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <ArrowLeftRight className="h-12 w-12 text-bareter-teal/20" />
            </div>
          )}
          {cats?.[0] && (
            <span className="absolute top-3 left-3 bg-white/95 dark:bg-card/95 text-bareter-teal text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm border border-bareter-teal/20">{cats[0]}</span>
          )}
          {listing.user?.isVerified && (
            <span className="absolute top-3 right-3 h-7 w-7 rounded-full bg-bareter-teal flex items-center justify-center shadow-md">
              <ShieldCheck className="h-4 w-4 text-white" />
            </span>
          )}
        </div>
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-bold text-bareter-navy dark:text-foreground text-sm leading-snug line-clamp-2 mb-1.5">{listing.title}</h3>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" /><span className="truncate">{city}</span>
          </div>
          <div className="mt-auto pt-3 border-t border-gray-100 dark:border-border grid grid-cols-2 gap-2 mt-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Listed value</p>
              <p className="text-sm font-bold text-bareter-navy dark:text-foreground">AED {value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Wants</p>
              <p className="text-xs font-semibold text-bareter-teal truncate">{wanted?.[0] || "Open offers"}</p>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

// ── Loading skeleton card ─────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
      <div className="h-44 bareter-shimmer" />
      <div className="p-4 space-y-2.5">
        <div className="h-3 bareter-shimmer rounded-full w-3/4" />
        <div className="h-3 bareter-shimmer rounded-full w-1/2" />
        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
          <div className="h-8 bareter-shimmer rounded-lg" />
          <div className="h-8 bareter-shimmer rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function LandingPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { mode: waitlistMode, open: openWaitlist, gate: waitlistGate } = useWaitlist();
  const [, navigate] = useLocation();
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [heroQuery, setHeroQuery] = useState("");
  const [showSugg, setShowSugg] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSugg(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const { data: suggestionListings } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings", { search: heroQuery }],
    queryFn: () => fetch(`/api/listings?search=${encodeURIComponent(heroQuery)}&limit=5`).then(r => r.json()),
    enabled: heroQuery.trim().length >= 2,
    staleTime: 5000,
  });

  const { data: cmsSettings } = useQuery<Record<string, string | null>>({ queryKey: ["/api/public/settings"], staleTime: 60_000 });
  const heroHeadline = cmsSettings?.hero_headline || "Barter. Collab. Grow.";
  const heroTagline = cmsSettings?.hero_tagline || "UAE's marketplace where businesses swap value — products for services, or products for content.";
  const heroCta = cmsSettings?.hero_cta || null;
  const heroCtaUrl = cmsSettings?.hero_cta_url || null;

  const { data: featuredListings, isLoading: loadingFeatured } = useQuery<ListingWithUser[]>({ queryKey: ["/api/listings/featured"] });
  const { data: latestListings, isLoading: loadingLatest } = useQuery<ListingWithUser[]>({ queryKey: ["/api/listings"] });

  const displayListings = ((featuredListings && featuredListings.length > 0 ? featuredListings : latestListings) || []).slice(0, 8);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = heroQuery.trim();
    if (q.length >= 2) fetch("/api/search-history", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ query: q }) }).catch(() => {});
    navigate(`/browse${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setShowSugg(false);
  };

  // Stagger refs
  const propCardsRef = useStagger(".prop-card", []);
  const featureCardsRef = useStagger(".feat-card", []);
  const listingCardsRef = useStagger(".bareter-stagger-card", [displayListings]);
  const categoryRef = useStagger(".cat-item", []);
  const stepsRef = useStagger(".step-item", []);
  const faqRef = useStagger(".faq-item", [openFaq]);

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-background">

      {/* Global page animations */}
      <style>{`
        /* ── Stagger entrance ── */
        .bareter-stagger-card,
        .prop-card,
        .feat-card,
        .cat-item,
        .step-item,
        .faq-item,
        .reveal-el {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.45s ease, transform 0.45s ease;
        }
        .bareter-stagger-card.is-in-view,
        .prop-card.is-in-view,
        .feat-card.is-in-view,
        .cat-item.is-in-view,
        .step-item.is-in-view,
        .faq-item.is-in-view,
        .reveal-el.is-in-view {
          opacity: 1;
          transform: translateY(0);
        }
        /* ── Float keyframes ── */
        @keyframes floatA { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-12px)} }
        @keyframes floatB { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-8px)} }
        @keyframes floatC { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-14px)} }
        @keyframes floatD { 0%,100%{transform:translateY(0px) rotate(0deg)} 50%{transform:translateY(-10px) rotate(1deg)} }
        .float-a { animation: floatA 4s ease-in-out infinite; }
        .float-b { animation: floatB 5s ease-in-out 1s infinite; }
        .float-c { animation: floatC 4.5s ease-in-out 2s infinite; }
        .float-d { animation: floatD 3.8s ease-in-out 0.5s infinite; }
        /* ── Pulse dot ── */
        @keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }
        .pulse-dot { animation: pulseDot 2s ease-in-out infinite; }
        /* ── Step float (organic stagger) ── */
        @keyframes stepFloat { 0%{transform:translateY(0px)} 100%{transform:translateY(-10px)} }
        /* ── Card shimmer ── */
        .bareter-shimmer {
          background-color: #f1f5f9;
          position: relative;
          overflow: hidden;
        }
        .dark .bareter-shimmer { background-color: rgba(255,255,255,0.04); }
        .bareter-shimmer::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 100%);
          animation: bareter-shimmer 1.4s infinite;
        }
        .dark .bareter-shimmer::after {
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0) 100%);
        }
        /* ── Pill clip-path fill ── */
        .pill-hover {
          position: relative;
          isolation: isolate;
          transition: color 0.25s ease, transform 0.2s ease;
        }
        .pill-hover::before {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--bareter-teal);
          border-radius: inherit;
          clip-path: inset(0 100% 0 0);
          transition: clip-path 0.25s ease;
          z-index: -1;
        }
        .pill-hover:hover { color: white; transform: scale(1.04); }
        .pill-hover:hover::before { clip-path: inset(0 0 0 0); }
        /* ── Proposal card stagger ── */
        .prop-card:nth-child(2) { transition-delay: 0.1s; }
        .prop-card:nth-child(3) { transition-delay: 0.2s; }
        /* ── Feature card stagger ── */
        .feat-card:nth-child(2) { transition-delay: 0.1s; }
        .feat-card:nth-child(3) { transition-delay: 0.2s; }
        /* ── Listing card stagger ── */
        .bareter-stagger-card:nth-child(2) { transition-delay: 0.07s; }
        .bareter-stagger-card:nth-child(3) { transition-delay: 0.14s; }
        .bareter-stagger-card:nth-child(4) { transition-delay: 0.21s; }
        .bareter-stagger-card:nth-child(5) { transition-delay: 0.07s; }
        .bareter-stagger-card:nth-child(6) { transition-delay: 0.14s; }
        .bareter-stagger-card:nth-child(7) { transition-delay: 0.21s; }
        .bareter-stagger-card:nth-child(8) { transition-delay: 0.28s; }
        /* ── Category grid stagger ── */
        .cat-item:nth-child(2) { transition-delay: 0.06s; }
        .cat-item:nth-child(3) { transition-delay: 0.12s; }
        .cat-item:nth-child(4) { transition-delay: 0.18s; }
        .cat-item:nth-child(5) { transition-delay: 0.24s; }
        .cat-item:nth-child(6) { transition-delay: 0.30s; }
        /* ── Step stagger ── */
        .step-item:nth-child(2) { transition-delay: 0.12s; }
        .step-item:nth-child(3) { transition-delay: 0.24s; }
        .step-item:nth-child(4) { transition-delay: 0.36s; }
        /* ── Reduce motion ── */
        @media (prefers-reduced-motion: reduce) {
          .bareter-stagger-card,.prop-card,.feat-card,.cat-item,.step-item,.faq-item,.reveal-el {
            opacity: 1 !important; transform: none !important; transition: none !important;
          }
          .float-a,.float-b,.float-c,.float-d,.pulse-dot { animation: none !important; }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════
          HERO — full-bleed dark navy, split layout
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative isolate overflow-hidden min-h-[calc(100vh-4rem)] bg-bareter-navy flex flex-col" data-testid="section-hero">
        {/* Background image with gradient overlay */}
        <img src={heroHandshakeImg} alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-50" loading="eager" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-bareter-navy/92 via-bareter-navy/78 to-bareter-navy/38" />
        {/* Subtle radial noise overlay */}
        <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-[0.03]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")" }} />

        <div className="container relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-16 md:pt-28 md:pb-20 flex-1">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">

            {/* ── LEFT — primary copy ── */}
            <div className="flex-1 min-w-0 lg:max-w-[520px]">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-bareter-teal/15 border border-bareter-teal/30 mb-6">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-bareter-teal" />
                <span className="text-bareter-teal text-xs font-semibold">UAE's #1 Barter Marketplace</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-white leading-[1.1] tracking-tight mb-6" data-testid="text-hero-headline">
                {heroHeadline}
              </h1>
              <p className="text-lg text-white/65 leading-relaxed mb-10 max-w-md" data-testid="text-hero-tagline">
                {heroTagline}
              </p>

              {/* Search */}
              <div ref={searchRef} className="relative mb-8">
                <form onSubmit={handleSearch} className="flex items-stretch bg-white/12 hover:bg-white/16 focus-within:bg-white border border-white/20 focus-within:border-transparent rounded-xl h-12 overflow-hidden transition-all duration-200 focus-within:shadow-lg">
                  <Search className="h-4 w-4 text-white/60 focus-within:text-bareter-muted self-center ml-4 flex-shrink-0" />
                  <input
                    type="search"
                    value={heroQuery}
                    onChange={e => { setHeroQuery(e.target.value); setShowSugg(true); }}
                    placeholder="Search for anything to barter…"
                    className="flex-1 bg-transparent text-white placeholder:text-white/50 text-sm px-3 focus:outline-none focus:text-bareter-navy focus:placeholder:text-gray-400"
                    autoComplete="off"
                  />
                  <button type="submit" className="px-5 bg-bareter-teal hover:bg-bareter-teal/90 text-white text-sm font-bold transition-colors">
                    Search
                  </button>
                </form>
                {showSugg && heroQuery.trim().length >= 2 && suggestionListings && suggestionListings.length > 0 && (
                  <div className="absolute top-full mt-1.5 left-0 right-0 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50">
                    {suggestionListings.slice(0, 5).map(l => (
                      <button key={l.id} type="button" className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-start transition-colors"
                        onClick={() => { setShowSugg(false); navigate(`/listings/${l.id}`); }}>
                        {(l.images as string[])?.[0] && <img src={(l.images as string[])[0]} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-bareter-navy truncate">{l.title}</p>
                          <p className="text-xs text-muted-foreground">AED {Number(l.retailValue).toLocaleString()}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap gap-3 mb-10">
                <Button size="lg" className="h-12 px-7 bg-bareter-teal hover:bg-bareter-teal/90 text-white font-bold rounded-xl gap-2 shadow-lg active:scale-[0.98]"
                  onClick={() => { if (waitlistGate()) navigate("/browse"); }}>
                  Browse Listings <ArrowRight className="h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" className="h-12 px-7 border-white/25 text-white bg-white/8 hover:bg-white/15 font-semibold rounded-xl active:scale-[0.98]"
                  onClick={() => { if (waitlistGate()) navigate(user ? "/create-listing" : "/register"); }}>
                  List Your Barter
                </Button>
              </div>

              {/* Trust row */}
              <div className="flex items-center gap-4 text-white/50 text-xs">
                {["Free forever", "No commissions", "AI-matched", "E-signed contracts"].map(t => (
                  <span key={t} className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-bareter-teal flex-shrink-0" />{t}
                  </span>
                ))}
              </div>
            </div>

            {/* ── RIGHT — 3 staggered cards, narrow column so hero image stays visible ── */}
            <div ref={propCardsRef} className="hidden lg:flex flex-col gap-3 w-[260px] flex-shrink-0 self-center">
              {[
                { initials: "MA", name: "Mariam A.", offering: "iPhone 14 Pro", value: "AED 2,800", wants: "Freelance Design", category: "Electronics", float: "float-a", shift: "translate-x-4" },
                { initials: "YK", name: "Youssef K.", offering: "10 Yoga Classes", value: "AED 500",  wants: "Meal Prep 4-wk",   category: "Health",      float: "float-b", shift: "-translate-x-2" },
                { initials: "LN", name: "Layla N.",  offering: "Logo Design",    value: "AED 1,200", wants: "Social Media Mgmt", category: "Services",   float: "float-c", shift: "translate-x-6" },
              ].map((card, i) => (
                <div key={i} className={`prop-card ${card.shift} bg-white rounded-2xl p-4 shadow-xl border border-gray-100/60 ${card.float}`}>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em] block mb-2.5">{card.category} · Proposal</span>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-bareter-teal to-bareter-teal/80 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">{card.initials}</div>
                    <div>
                      <p className="font-bold text-bareter-navy text-sm leading-tight">{card.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <ShieldCheck className="h-3 w-3 text-bareter-teal" />
                        <span className="text-[9px] text-bareter-teal font-semibold">Verified</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mb-3">
                    {[{ l: "Offering", v: card.offering }, { l: "Value", v: card.value }, { l: "Wants", v: card.wants }].map(s => (
                      <div key={s.l} className="bg-gray-50 rounded-lg p-1.5">
                        <p className="text-[8px] text-muted-foreground uppercase font-bold">{s.l}</p>
                        <p className="text-[9px] font-bold text-bareter-navy mt-0.5 leading-tight">{s.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <button className="flex-1 py-1.5 rounded-lg border border-gray-200 text-[9px] font-semibold text-muted-foreground hover:bg-gray-50 transition-colors">Decline</button>
                    <button className="flex-1 py-1.5 rounded-lg bg-bareter-teal text-white text-[9px] font-bold hover:bg-bareter-teal/90 transition-colors active:scale-[0.97]">Accept ✓</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stats strip at hero bottom ── */}
        <div className="relative z-10 border-t border-white/10 w-full">
          <div className="container mx-auto max-w-7xl px-6 py-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { value: "500+", label: "Active members" },
                { value: "400+", label: "Listings posted" },
                { value: "100+", label: "Deals closed" },
                { value: "AED 0", label: "Platform commission" },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <p className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">{s.value}</p>
                  <p className="text-white/50 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          PLATFORM MOCKUPS — acquire.com 3-column: List / Negotiate / Deal
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-[#f0f4f8] dark:bg-muted/30 py-24" data-testid="section-platform">
        <div className="container mx-auto max-w-7xl px-6">
          <div className="text-center mb-20">
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">How Bareter works</p>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight leading-[1.15] max-w-2xl mx-auto">
              We make bartering fast, safe, and easy
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start relative">
            {/* Dashed connector (desktop) */}
            <div className="hidden lg:block absolute top-[112px] left-[34%] right-[34%] border-t-2 border-dashed border-bareter-navy/15 z-0" />

            {/* ── Col 1: AI Chat ── */}
            <div className="flex flex-col items-center text-center">
              <div className="w-full bg-white dark:bg-card rounded-3xl shadow-lg overflow-hidden mb-6 border border-gray-100 dark:border-border">
                <div className="bg-bareter-teal px-5 py-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">AI</div>
                  <div className="text-left">
                    <p className="text-white font-semibold text-sm">Bareter AI</p>
                    <div className="flex items-center gap-1.5">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-green-400" />
                      <span className="text-white/70 text-[11px]">Online now</span>
                    </div>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="h-7 w-7 rounded-full bg-bareter-teal/15 flex-shrink-0 flex items-center justify-center text-bareter-teal text-[10px] font-bold">AI</div>
                    <div className="bg-gray-100 dark:bg-muted rounded-2xl rounded-tl-none px-4 py-2.5 max-w-[210px] text-left">
                      <p className="text-bareter-navy dark:text-foreground text-xs leading-relaxed">Your listing is live! Found <strong>3 matching partners</strong> near Dubai.</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-bareter-teal/12 rounded-2xl rounded-tr-none px-4 py-2.5 max-w-[180px] text-right">
                      <p className="text-bareter-teal text-xs font-medium">Show me the matches →</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="h-7 w-7 rounded-full bg-bareter-teal/15 flex-shrink-0 flex items-center justify-center text-bareter-teal text-[10px] font-bold">AI</div>
                    <div className="bg-gray-100 dark:bg-muted rounded-2xl rounded-tl-none px-4 py-2.5 max-w-[210px] text-left">
                      <p className="text-bareter-navy dark:text-foreground text-xs leading-relaxed">Top match: <strong>Khalid Auto Group</strong> — value AED 8,000 ✓</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 border border-gray-200 dark:border-border rounded-xl px-3 py-2">
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-muted rounded-full" />
                    <div className="h-6 w-6 rounded-full bg-bareter-teal flex items-center justify-center flex-shrink-0">
                      <ArrowRight className="h-3 w-3 text-white" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-bareter-teal/10 flex items-center justify-center mb-3">
                <Sparkles className="h-5 w-5 text-bareter-teal" />
              </div>
              <h3 className="text-lg font-extrabold text-bareter-navy dark:text-foreground mb-1.5">List</h3>
              <p className="text-muted-foreground text-sm max-w-[240px] leading-relaxed">Post in 2 minutes. AI finds the best matching partner for your barter.</p>
            </div>

            {/* ── Col 2: Feature pills ── */}
            <div className="flex flex-col items-center text-center">
              <div className="w-full bg-white dark:bg-card rounded-3xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-border">
                <div className="flex items-center justify-center gap-2 mb-6">
                  <span className="text-bareter-navy dark:text-foreground font-extrabold text-xl tracking-tight">Bareter</span>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "AI-powered matching", icon: <Sparkles className="h-4 w-4 text-bareter-teal" /> },
                    { label: "Verified UAE members", icon: <ShieldCheck className="h-4 w-4 text-bareter-teal" /> },
                    { label: "Auto-generated contracts", icon: <FileSignature className="h-4 w-4 text-bareter-teal" /> },
                    { label: "In-app chat & counter-offers", icon: <MessageSquare className="h-4 w-4 text-bareter-teal" /> },
                  ].map(f => (
                    <div key={f.label} className="flex items-center gap-3 bg-gray-50 dark:bg-muted/40 rounded-xl px-4 py-3.5 border border-gray-100 dark:border-border hover:border-bareter-teal/30 transition-colors">
                      {f.icon}
                      <span className="text-sm font-semibold text-bareter-navy dark:text-foreground">{f.label}</span>
                      <CheckCircle2 className="h-4 w-4 text-bareter-teal ml-auto flex-shrink-0" />
                    </div>
                  ))}
                </div>
                <div className="flex justify-center mt-5 gap-2">
                  <div className="h-2.5 w-2.5 rounded-full border-2 border-bareter-navy/25" />
                  <div className="h-2.5 w-2.5 rounded-full bg-bareter-teal" />
                  <div className="h-2.5 w-2.5 rounded-full border-2 border-bareter-navy/25" />
                </div>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-bareter-teal/10 flex items-center justify-center mb-3">
                <Handshake className="h-5 w-5 text-bareter-teal" />
              </div>
              <h3 className="text-lg font-extrabold text-bareter-navy dark:text-foreground mb-1.5">Negotiate</h3>
              <p className="text-muted-foreground text-sm max-w-[240px] leading-relaxed">Chat, counter-offer, and lock in terms — all inside Bareter.</p>
            </div>

            {/* ── Col 3: My Barters list ── */}
            <div className="flex flex-col items-center text-center">
              <div className="w-full bg-white dark:bg-card rounded-3xl shadow-lg overflow-hidden mb-6 border border-gray-100 dark:border-border">
                <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-border flex items-center justify-between">
                  <p className="font-extrabold text-bareter-navy dark:text-foreground text-sm">My Barters</p>
                  <span className="text-[10px] font-semibold text-bareter-teal bg-bareter-teal/10 px-2 py-0.5 rounded-full">3 active</span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-border">
                  {[
                    { type: "Real Estate", title: "Dubai Marina Office", value: "AED 450K", status: "Matched", color: "text-bareter-teal" },
                    { type: "Services", title: "Legal Package Deal", value: "AED 12K", status: "Pending", color: "text-amber-500" },
                    { type: "Automotive", title: "Fleet Service Pack", value: "AED 8K", status: "Completed", color: "text-green-500" },
                  ].map((d, i) => (
                    <div key={i} className="px-5 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-muted/20 transition-colors">
                      <div>
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{d.type}</p>
                        <p className="text-xs font-semibold text-bareter-navy dark:text-foreground mt-0.5">{d.title}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-bareter-navy dark:text-foreground">{d.value}</p>
                        <p className={`text-[10px] font-semibold ${d.color}`}>{d.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4">
                  <button className="w-full py-2.5 rounded-xl bg-bareter-teal text-white text-xs font-bold hover:bg-bareter-teal/90 transition-colors active:scale-[0.98]">
                    Propose a Barter →
                  </button>
                </div>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-bareter-teal/10 flex items-center justify-center mb-3">
                <FileSignature className="h-5 w-5 text-bareter-teal" />
              </div>
              <h3 className="text-lg font-extrabold text-bareter-navy dark:text-foreground mb-1.5">Deal</h3>
              <p className="text-muted-foreground text-sm max-w-[240px] leading-relaxed">Accept the best offer and sign a barter contract — both parties protected.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          THREE WAYS — feature cards with hover lift
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white dark:bg-background py-24" data-testid="section-three-ways">
        <div className="container mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">What you can do</p>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight mb-4">One platform. Three ways to swap.</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">Trade goods, services, or content — without spending a dirham.</p>
          </div>
          <div ref={featureCardsRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: <ArrowLeftRight className="h-6 w-6 text-bareter-teal" />, badge: "Most popular",
                title: "Barter Anything", accent: false,
                desc: "Swap goods, services or skills directly with other UAE businesses. Cars, office space, legal services, hospitality — anything goes.",
                items: ["Goods for goods", "Services for services", "AI-matched partners", "Free, always"],
                href: "/browse", cta: "Browse Barters",
              },
              {
                icon: <Handshake className="h-6 w-6 text-white" />, badge: "B2B",
                title: "Services for Services", accent: true,
                desc: "Two businesses, each with something the other needs. Skip the invoices — swap your expertise and both walk away with exactly what you need.",
                items: ["Legal for marketing", "Design for accounting", "AI-matched by value", "Contract auto-generated"],
                href: "/create-listing", cta: "Post a Service",
              },
              {
                icon: <Camera className="h-6 w-6 text-bareter-teal" />, badge: "Brands & Creators",
                title: "Brand × Creator Deals", accent: false,
                desc: "Brands offer products. Creators deliver authentic TikToks, Reels, and Stories. No cash changes hands — just real value for real content.",
                items: ["Instagram, TikTok, YouTube", "Any follower count welcome", "Verified creators only", "Deals tracked in-app"],
                href: "/browse", cta: "Find Creators",
              },
            ].map((card, i) => (
              <div key={i} className={`feat-card group rounded-2xl border shadow-sm hover:shadow-bareter-hover hover:-translate-y-2 transition-all duration-300 p-8 flex flex-col h-full ${card.accent ? "bg-bareter-navy text-white border-bareter-navy" : "bg-white dark:bg-card border-gray-100 dark:border-border"}`}>
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center mb-5 flex-shrink-0 ${card.accent ? "bg-white/10" : "bg-bareter-teal/8"}`}>
                  {card.icon}
                </div>
                {card.badge && (
                  <span className={`text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full w-fit mb-4 ${card.accent ? "bg-bareter-teal/20 text-bareter-teal" : "bg-bareter-teal/8 text-bareter-teal"}`}>
                    {card.badge}
                  </span>
                )}
                <h3 className={`text-xl font-extrabold mb-3 ${card.accent ? "text-white" : "text-bareter-navy dark:text-foreground"}`}>{card.title}</h3>
                <p className={`text-sm leading-relaxed mb-6 flex-1 ${card.accent ? "text-white/70" : "text-muted-foreground"}`}>{card.desc}</p>
                <ul className="space-y-2 mb-8">
                  {card.items.map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-bareter-teal flex-shrink-0" />
                      <span className={card.accent ? "text-white/80" : "text-muted-foreground"}>{item}</span>
                    </li>
                  ))}
                </ul>
                <Link href={card.href}>
                  <Button className={`w-full gap-2 rounded-xl font-bold active:scale-[0.98] ${card.accent ? "bg-bareter-teal hover:bg-bareter-teal/80 text-white" : "bg-bareter-navy hover:bg-bareter-navy/90 text-white"}`}>
                    {card.cta} <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          LISTINGS GRID — Top Picks
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 dark:bg-muted/20 py-24" data-testid="section-top-barters">
        <div className="container mx-auto max-w-7xl px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
            <div>
              <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-1">Top Picks</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight">Handpicked barters</h2>
              <p className="text-muted-foreground mt-1.5">High-value listings from verified UAE businesses</p>
            </div>
            <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm font-bold text-bareter-teal hover:text-bareter-teal/80 transition-colors whitespace-nowrap">
              View all listings <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div ref={listingCardsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {(loadingFeatured && loadingLatest)
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
              : displayListings.length === 0
              ? (
                <div className="col-span-full py-16 text-center">
                  <p className="text-muted-foreground mb-4">No listings yet — be the first to post.</p>
                  <Link href="/create-listing"><Button variant="bareter" className="gap-2">Create a listing <ArrowRight className="h-4 w-4" /></Button></Link>
                </div>
              )
              : displayListings.map(l => <ListingCard key={l.id} listing={l} />)
            }
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          FOR SELLERS — left copy, right category grid
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white dark:bg-background py-24" data-testid="section-for-sellers">
        <div className="container mx-auto max-w-7xl px-6">
          <div className="flex flex-col lg:flex-row gap-16 lg:gap-24 items-center">
            {/* Left copy */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">List your barter</p>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight mb-5 leading-[1.1]">
                Sell your excess.<br />Get what you actually need.
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-10 max-w-lg">
                Every business has underused assets — office space, surplus stock, professional services. List it on Bareter and get exactly what you need in return.
              </p>
              <div className="space-y-5 mb-10">
                {[
                  { icon: <Clock className="h-5 w-5 text-bareter-teal" />, title: "List in 2 minutes", desc: "Add photos, set a value, describe what you want in return." },
                  { icon: <Zap className="h-5 w-5 text-bareter-teal" />, title: "AI matches you instantly", desc: "Our engine surfaces the most compatible barter partners." },
                  { icon: <Lock className="h-5 w-5 text-bareter-teal" />, title: "Auto-generated contract", desc: "Every deal is documented with a legally-scoped barter contract." },
                ].map(item => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-bareter-teal/8 flex items-center justify-center flex-shrink-0 shadow-sm">{item.icon}</div>
                    <div>
                      <p className="font-bold text-bareter-navy dark:text-foreground text-sm">{item.title}</p>
                      <p className="text-muted-foreground text-sm mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Link href={user ? "/create-listing" : "/register"}>
                  <Button size="lg" className="h-12 bg-bareter-teal hover:bg-bareter-teal/90 text-white px-8 rounded-xl gap-2 font-bold active:scale-[0.98]">
                    List for free <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/browse">
                  <Button size="lg" variant="outline" className="h-12 px-8 rounded-xl font-semibold">View listings</Button>
                </Link>
              </div>
            </div>

            {/* Right: category grid */}
            <div ref={categoryRef} className="w-full lg:w-[480px] flex-shrink-0 grid grid-cols-2 gap-3">
              {[
                { img: catCarsImg,       label: "Cars & Vehicles",    href: "/c/automotive" },
                { img: catRealEstateImg, label: "Real Estate",         href: "/c/real-estate" },
                { img: catServicesImg,   label: "Services",            href: "/c/services" },
                { img: catElectronicsImg,label: "Electronics",         href: "/c/technology" },
                { img: catHospitalityImg,label: "Hospitality",         href: "/c/hospitality" },
                { img: catFitnessImg,    label: "Health & Fitness",    href: "/c/health-and-wellness" },
              ].map(cat => (
                <Link key={cat.label} href={cat.href}>
                  <div className="cat-item group relative overflow-hidden rounded-2xl aspect-[4/3] cursor-pointer shadow-sm hover:shadow-bareter-hover transition-all duration-300 hover:-translate-y-1">
                    <img src={cat.img} alt={cat.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                    <span className="absolute bottom-3 left-3 text-white text-xs font-bold drop-shadow-sm">{cat.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          HOW IT WORKS — organic staggered layout on dark navy
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-bareter-navy overflow-hidden py-24" data-testid="section-how">
        <div className="container mx-auto max-w-6xl px-6">
          <div className="text-center mb-20">
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">From listing to closed deal.</h2>
            <p className="text-white/55 max-w-lg mx-auto text-lg">No cash. No waste. Just value for value — matched by AI and sealed with a contract.</p>
          </div>

          {/* Desktop: organic absolute positioning + SVG connector */}
          <div className="hidden lg:block relative" style={{ height: "380px" }}>
            <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" style={{ overflow: "visible" }}>
              <path d="M 195,118 C 275,118 310,205 390,205" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="8 5" fill="none"/>
              <path d="M 560,205 C 640,205 680,85 760,85" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="8 5" fill="none"/>
              <path d="M 930,85 C 1010,85 1050,235 1130,235" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="8 5" fill="none"/>
              <circle cx="390" cy="205" r="4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
              <circle cx="760" cy="85"  r="4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
              <circle cx="1130" cy="235" r="4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
            </svg>

            <div ref={stepsRef} className="absolute inset-0">
              {[
                { Icon: LayoutList,    title: "List what you have",    desc: "Upload photos, set a value, describe what you want back.",      tag: "2 min",         bg: "bg-bareter-teal",  left: "4%",  top: "55px" },
                { Icon: Sparkles,      title: "AI finds your match",   desc: "Our engine surfaces the most compatible barter partners.",     tag: "Instant match", bg: "bg-violet-500",   left: "27%", top: "145px" },
                { Icon: MessageSquare, title: "Negotiate in-app",      desc: "Chat, counter-offer, and agree on terms inside Bareter.",      tag: "No lawyers",    bg: "bg-amber-500",    left: "52%", top: "25px" },
                { Icon: FileSignature, title: "Sign & exchange",       desc: "Auto-generated contract. Sign on-platform, deal complete.",   tag: "Legally binding",bg: "bg-emerald-500", left: "74%", top: "168px" },
              ].map((step, i) => (
                <div key={step.title} className="step-item absolute flex flex-col items-center text-center" style={{ left: step.left, top: step.top, width: "195px" }}>
                  <div className="relative mb-4">
                    <div className={`h-[68px] w-[68px] rounded-2xl ${step.bg} flex items-center justify-center shadow-xl`}
                      style={{ animation: `stepFloat ${3.5 + i * 0.7}s ease-in-out ${i * 0.5}s infinite alternate` }}>
                      <step.Icon className="h-7 w-7 text-white" />
                    </div>
                    <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-white text-bareter-navy text-[10px] font-extrabold flex items-center justify-center shadow">{i + 1}</span>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1.5 leading-snug">{step.title}</h3>
                  <p className="text-xs text-white/50 leading-relaxed mb-3">{step.desc}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-white border border-white/20">
                    <CheckCircle2 className="h-2.5 w-2.5" />{step.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile: vertical list with dashed connectors */}
          <div className="lg:hidden space-y-7">
            {[
              { Icon: LayoutList,    title: "List what you have",    desc: "Upload photos, set a value, describe what you want back.",    bg: "bg-bareter-teal" },
              { Icon: Sparkles,      title: "AI finds your match",   desc: "Our engine surfaces the most compatible barter partners.",   bg: "bg-violet-500" },
              { Icon: MessageSquare, title: "Negotiate in-app",      desc: "Chat, counter-offer, and agree on terms inside Bareter.",    bg: "bg-amber-500" },
              { Icon: FileSignature, title: "Sign & exchange",       desc: "Auto-generated contract. Sign on-platform, deal complete.", bg: "bg-emerald-500" },
            ].map((step, i) => (
              <div key={step.title} className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className={`h-12 w-12 rounded-2xl ${step.bg} flex items-center justify-center shadow-lg`}>
                    <step.Icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-white text-bareter-navy text-[9px] font-extrabold flex items-center justify-center">{i + 1}</span>
                  {i < 3 && <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-px h-6 border-l-2 border-dashed border-white/20" />}
                </div>
                <div className="pt-1">
                  <h3 className="text-sm font-bold text-white mb-1">{step.title}</h3>
                  <p className="text-xs text-white/50 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="h-12 px-8 bg-bareter-teal hover:bg-bareter-teal/90 text-white font-bold gap-2 rounded-xl shadow-lg active:scale-[0.98]"
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
          FAQ
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 dark:bg-muted/20 py-24" data-testid="section-faq">
        <div className="container mx-auto max-w-2xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">FAQs</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight">Frequently asked questions</h2>
          </div>
          <div ref={faqRef} className="space-y-2">
            {FAQS.map((faq, i) => (
              <div key={i} className="faq-item bg-white dark:bg-card border border-gray-100 dark:border-border rounded-2xl overflow-hidden shadow-sm">
                <button
                  className="w-full flex items-center justify-between px-6 py-5 text-left font-semibold text-bareter-navy dark:text-foreground hover:bg-gray-50 dark:hover:bg-muted/10 transition-colors"
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
          FINAL CTA — teal with radial light overlay
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="relative isolate overflow-hidden bg-bareter-teal py-24" data-testid="section-cta">
        <div className="absolute inset-0 -z-10 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle at 25% 50%, white 0%, transparent 55%), radial-gradient(circle at 75% 50%, white 0%, transparent 55%)" }}
          aria-hidden="true" />
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
            Join the Bareter community
          </h2>
          <p className="text-white/75 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Join the UAE's fastest-growing barter marketplace.
          </p>
          {!user && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (waitlistMode.enabled) { openWaitlist(); }
                else if (heroCtaUrl) { navigate(`${heroCtaUrl}${heroCtaUrl.includes("?") ? "&" : "?"}email=${encodeURIComponent(waitlistEmail)}`); }
                else { navigate(`/register?email=${encodeURIComponent(waitlistEmail)}`); }
              }}
              className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            >
              <input
                type="email" required value={waitlistEmail}
                onChange={e => setWaitlistEmail(e.target.value)}
                placeholder="you@business.com"
                className="flex-1 h-12 px-5 rounded-xl bg-white/15 border border-white/25 text-white placeholder:text-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
                data-testid="input-waitlist-email"
              />
              <Button type="submit" className="h-12 px-8 rounded-xl bg-white text-bareter-teal hover:bg-white/90 font-bold text-sm flex-shrink-0 active:scale-[0.98]" data-testid="button-waitlist-submit">
                {heroCta || t("landing.startBartering")}
              </Button>
            </form>
          )}
          {user && (
            <div className="flex justify-center gap-3 flex-wrap">
              <Link href="/create-listing">
                <Button size="lg" className="h-12 bg-white text-bareter-teal hover:bg-white/90 font-bold px-8 rounded-xl gap-2 active:scale-[0.98]">
                  List a Barter <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/browse">
                <Button size="lg" variant="outline" className="h-12 border-white/30 text-white bg-white/10 hover:bg-white/20 font-semibold px-8 rounded-xl">
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
