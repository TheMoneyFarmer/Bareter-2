import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { useI18n } from "@/lib/i18n";
import heroHandshakeImg from "@assets/generated_images/hero-handshake.png";
import type { ListingWithUser } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowRight, CheckCircle2, Camera, Sparkles, Handshake,
  ArrowLeftRight, FileSignature, LayoutList, MessageSquare,
  ChevronDown, ChevronUp, MapPin, ShieldCheck, Search,
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
          } else {
            items.forEach((item) => item.classList.remove("is-in-view"));
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
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-in-view");
        } else {
          el.classList.remove("is-in-view");
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FAQS = [
  { q: "What is Bareter?", a: "Bareter is the UAE's first smart barter marketplace. Businesses and individuals swap products, services, or goods for content — no cash required." },
  { q: "Who can use Bareter?", a: "Any business or individual in the UAE with something to offer — brands, SMEs, freelancers, and verified creators." },
  { q: "Is it really free?", a: "Yes. Listing, matching, and closing deals is completely free. No commissions, no hidden fees, no agencies." },
  { q: "How does brand collabs work?", a: "Post your product or service. Creators apply with their stats. You pick the best fit, agree on deliverables, and a barter contract is auto-generated." },
  { q: "Is it safe?", a: "All deals are documented inside Bareter with legally-scoped barter contracts. We review listings and flag suspicious activity before it reaches you." },
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
        <div className="relative h-32 sm:h-40 lg:h-44 bg-gradient-to-br from-bareter-teal/8 to-bareter-teal/3 overflow-hidden flex-shrink-0">
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
        <div className="p-3 sm:p-4 flex flex-col flex-1">
          <h3 className="font-bold text-bareter-navy dark:text-foreground text-xs sm:text-sm leading-snug line-clamp-2 mb-1">{listing.title}</h3>
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
      <div className="h-32 sm:h-40 lg:h-44 bareter-shimmer" />
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

// ── Hero two-column scroll carousel ──────────────────────────────────────────
const CARD_H    = 290;
const CARD_GAP  = 52;
const CARD_STEP = CARD_H + CARD_GAP; // 342 px per step

const CARD_BASE =
  "hc-tile rounded-2xl border border-white/30 bg-white/75 backdrop-blur-sm shadow-[0_8px_28px_rgba(0,0,0,0.25)] pointer-events-none select-none";

function ChatDealCard() {
  return (
    <div className={`${CARD_BASE} p-4`} style={{ height: CARD_H }}>
      <div className="flex items-center gap-2.5 mb-3 pb-3 border-b border-slate-100">
        <div className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
          style={{ background: "linear-gradient(135deg,#2AA0A0,#1a7a7a)" }}>FA</div>
        <div>
          <p className="text-[11px] font-semibold text-slate-800">Fatima A. · Barter Chat</p>
          <p className="text-[9px] text-slate-400">Abu Dhabi · Active now</p>
        </div>
        <div className="ms-auto h-2 w-2 rounded-full bg-green-400" />
      </div>
      <div className="space-y-2 mb-3">
        <div className="flex">
          <div className="bg-slate-100 rounded-2xl rounded-tl-none px-3 py-2 max-w-[90%]">
            <p className="text-[10px] text-slate-700 leading-snug">Interested in your baby stroller — I have a kids' bicycle, same value?</p>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-bareter-teal/12 rounded-2xl rounded-tr-none px-3 py-2 max-w-[85%]">
            <p className="text-[10px] text-bareter-teal font-medium leading-snug">Stroller is AED 650, bike worth AED 600 — add AED 50 and it's yours 🤝</p>
          </div>
        </div>
        <div className="flex">
          <div className="bg-slate-100 rounded-2xl rounded-tl-none px-3 py-2 max-w-[80%]">
            <p className="text-[10px] text-slate-700 leading-snug">Deal! When can we meet?</p>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="bg-bareter-teal rounded-2xl rounded-tr-none px-3 py-2 max-w-[70%]">
            <p className="text-[10px] text-white font-semibold">Contract being generated →</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-bareter-teal/8 rounded-xl px-3 py-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-bareter-teal flex-shrink-0" />
        <span className="text-[10px] text-bareter-teal font-semibold">Ready to e-sign barter contract</span>
      </div>
    </div>
  );
}

function CreateListingCard() {
  return (
    <div className={`${CARD_BASE} p-4`} style={{ height: CARD_H }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-bareter-teal/12 flex items-center justify-center flex-shrink-0">
          <LayoutList className="h-4 w-4 text-bareter-teal" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-800">New Barter Listing</p>
          <p className="text-[9px] text-slate-400">Step 2 of 3 — Details</p>
        </div>
        <span className="ms-auto text-[9px] text-bareter-teal font-bold">66%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden">
        <div className="h-full w-2/3 bg-bareter-teal rounded-full" />
      </div>
      <div className="space-y-2.5">
        {[
          { label: "What you're offering", val: "10 Arabic Tutoring Sessions", accent: false },
          { label: "Retail value (AED)", val: "800", accent: false },
          { label: "What you want in return", val: "English tutoring (same level)", accent: true },
        ].map(({ label, val, accent }) => (
          <div key={label}>
            <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold mb-1">{label}</p>
            <div className={`rounded-xl px-3 py-2 border ${accent ? "bg-bareter-teal/8 border-bareter-teal/20" : "bg-slate-50 border-slate-200"}`}>
              <p className={`text-[11px] font-semibold ${accent ? "text-bareter-teal" : "text-slate-700"}`}>{val}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 py-2.5 rounded-xl bg-bareter-teal text-center">
        <span className="text-[11px] text-white font-bold">Publish Listing →</span>
      </div>
    </div>
  );
}

function DeviceSwapCard() {
  return (
    <div className={`${CARD_BASE} p-4`} style={{ height: CARD_H }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
        <div className="h-7 w-7 rounded-lg bg-bareter-teal/12 flex items-center justify-center flex-shrink-0">
          <ArrowLeftRight className="h-3.5 w-3.5 text-bareter-teal" />
        </div>
        <p className="text-[11px] font-bold text-slate-800">Tech Barter Deal</p>
        <span className="ms-auto text-[9px] bg-amber-50 border border-amber-200 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold">In Progress</span>
      </div>

      {/* Items */}
      <div className="flex items-center gap-2 mb-3.5">
        <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center">
          <span className="text-2xl block mb-1 leading-none">🧹</span>
          <p className="text-[9px] font-bold text-slate-700">Home Cleaning (4 hrs)</p>
          <p className="text-[9px] text-bareter-teal font-semibold mt-0.5">AED 200</p>
        </div>
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          <ArrowLeftRight className="h-4 w-4 text-bareter-teal/70" />
          <p className="text-[8px] text-slate-400">swap</p>
        </div>
        <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center">
          <span className="text-2xl block mb-1 leading-none">🍕</span>
          <p className="text-[9px] font-bold text-slate-700">Catering (10 pax)</p>
          <p className="text-[9px] text-bareter-teal font-semibold mt-0.5">AED 220</p>
        </div>
      </div>

      {/* Profiles */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-2.5 flex items-center gap-2">
          <div className="h-9 w-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-extrabold shadow-sm"
            style={{ background: "linear-gradient(135deg, #2AA0A0, #1a7a7a)" }}>
            NH
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-800 truncate">Nour Al Hashimi</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck className="h-2.5 w-2.5 text-bareter-teal flex-shrink-0" />
              <p className="text-[8px] text-slate-400">Dubai · Verified</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-2.5 flex items-center gap-2">
          <div className="h-9 w-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-extrabold shadow-sm"
            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
            KR
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-800 truncate">Khalid Al Rashidi</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck className="h-2.5 w-2.5 text-bareter-teal flex-shrink-0" />
              <p className="text-[8px] text-slate-400">Sharjah · Verified</p>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[8px] text-slate-400 text-center">Awaiting e-signature · Contract auto-generated</p>
    </div>
  );
}

function BrandCollabCard() {
  return (
    <div className={`${CARD_BASE} p-4`} style={{ height: CARD_H }}>
      <div className="flex items-center gap-2 mb-3">
        <Camera className="h-4 w-4 text-bareter-teal" />
        <p className="text-[11px] font-bold text-slate-800">Brand × Creator Deal</p>
        <span className="ms-auto text-[9px] bg-green-50 border border-green-200 text-green-600 px-2 py-0.5 rounded-full font-semibold">Active</span>
      </div>
      <div className="bg-bareter-teal/8 rounded-xl p-3 mb-2.5">
        <p className="text-[9px] text-slate-500 mb-1">Brand is offering</p>
        <p className="text-sm font-bold text-slate-800">Iftar Dinner for 4 — Emirati Restaurant</p>
        <p className="text-[9px] text-bareter-teal font-semibold mt-0.5">Value: AED 350 · Al Fanar Dubai</p>
      </div>
      <div className="bg-slate-50 rounded-xl p-3 mb-3">
        <p className="text-[9px] text-slate-500 mb-1">Creator must deliver</p>
        <p className="text-[10px] font-semibold text-slate-700">2× TikTok videos + 3 Stories</p>
        <p className="text-[9px] text-slate-400 mt-0.5">Min. 5K followers · Food / Lifestyle</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          {[
            { i: "LK", c: "from-pink-400 to-rose-500" },
            { i: "NA", c: "from-violet-400 to-purple-600" },
            { i: "FM", c: "from-bareter-teal to-teal-600" },
          ].map(({ i, c }) => (
            <div key={i} className={`h-6 w-6 rounded-full border-2 border-white flex items-center justify-center bg-gradient-to-br ${c}`}>
              <span className="text-[7px] text-white font-bold">{i}</span>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-slate-500 flex-1">18 creators applied</p>
        <span className="text-[9px] text-bareter-teal font-semibold">Select →</span>
      </div>
    </div>
  );
}

function BarterItemCard() {
  return (
    <div className={`${CARD_BASE} p-4`} style={{ height: CARD_H }}>
      {/* Image section */}
      <div className="h-28 -mx-4 -mt-4 mb-4 bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center relative rounded-t-2xl overflow-hidden">
        <div className="h-14 w-14 rounded-2xl bg-slate-200/70 flex items-center justify-center">
          <span className="text-3xl leading-none">🛵</span>
        </div>
        <span className="absolute top-2.5 left-2.5 bg-white/95 text-[9px] font-bold text-bareter-teal px-2 py-0.5 rounded-full border border-bareter-teal/20">Automotive</span>
        <span className="absolute top-2.5 right-2.5 h-6 w-6 rounded-full bg-bareter-teal flex items-center justify-center shadow-sm">
          <ShieldCheck className="h-3 w-3 text-white" />
        </span>
      </div>
      <h3 className="text-sm font-bold text-slate-800 mb-1">Honda PCX Scooter 2022</h3>
      <p className="text-[9px] text-slate-400 mb-3 flex items-center gap-1">
        <MapPin className="h-2.5 w-2.5 flex-shrink-0" /> Deira, Dubai · Good condition
      </p>
      <div className="flex items-end justify-between border-t border-slate-100 pt-3">
        <div>
          <p className="text-[8px] text-slate-400 uppercase tracking-wide font-semibold">Listed value</p>
          <p className="text-base font-bold text-bareter-teal">AED 3,200</p>
        </div>
        <div className="text-right">
          <p className="text-[8px] text-slate-400 uppercase tracking-wide font-semibold">Wants</p>
          <p className="text-[10px] font-semibold text-slate-700">Car tyres / service</p>
        </div>
      </div>
    </div>
  );
}

function DealClosedCard() {
  return (
    <div className={`${CARD_BASE} p-4`} style={{ height: CARD_H }}>
      <div className="text-center mb-3">
        <div className="h-12 w-12 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center mx-auto mb-2">
          <CheckCircle2 className="h-6 w-6 text-green-500" />
        </div>
        <p className="text-sm font-bold text-slate-800">Deal Closed! 🎉</p>
        <p className="text-[9px] text-slate-400">Contract e-signed by both parties</p>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { l: "Hessa N.", v: "Gym Membership (3 mo)", a: "AED 750" },
          { l: "Omar F.",  v: "Meal Prep (4 weeks)",   a: "AED 720" },
        ].map(p => (
          <div key={p.l} className="bg-slate-50 rounded-xl p-2.5">
            <p className="text-[8px] text-slate-400 font-semibold">{p.l}</p>
            <p className="text-[9px] font-semibold text-slate-700 mt-0.5">{p.v}</p>
            <p className="text-[10px] font-bold text-bareter-teal">{p.a}</p>
          </div>
        ))}
      </div>
      <div className="bg-bareter-teal/8 rounded-xl px-3 py-2.5 mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] text-slate-600 font-medium">Barter contract</span>
          <span className="text-[8px] text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded-full border border-green-100">E-signed ✓</span>
        </div>
        <div className="h-1.5 bg-bareter-teal/15 rounded-full overflow-hidden">
          <div className="h-full w-full bg-bareter-teal/50 rounded-full" />
        </div>
      </div>
      <p className="text-[9px] text-slate-400 text-center">Completed 2 hrs ago · Dubai, UAE 📍</p>
    </div>
  );
}

function AnalyticsCard() {
  return (
    <div className={`${CARD_BASE} p-4`} style={{ height: CARD_H }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-bold text-slate-800">My Barters</p>
          <p className="text-[9px] text-slate-400">Last 30 days</p>
        </div>
        <span className="text-[9px] text-bareter-teal bg-bareter-teal/10 px-2 py-1 rounded-full font-semibold">+34% ↑</span>
      </div>
      <div className="flex items-end gap-1.5 h-20 mb-3">
        {[35, 55, 40, 72, 48, 88, 62].map((h, i) => (
          <div key={i} className="flex-1 rounded" style={{ height: `${h}%`, background: i === 5 ? "rgba(34,160,160,0.58)" : "rgba(0,0,0,0.07)" }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { v: "8",       l: "Deals closed" },
          { v: "AED 6.2K", l: "Total value" },
          { v: "4.9★",    l: "Avg. rating"  },
        ].map(s => (
          <div key={s.l} className="text-center bg-slate-50 rounded-xl py-2.5">
            <p className="text-xs font-bold text-bareter-teal leading-tight">{s.v}</p>
            <p className="text-[8px] text-slate-400 leading-tight mt-0.5">{s.l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function VerifiedMemberCard() {
  return (
    <div className={`${CARD_BASE} p-4`} style={{ height: CARD_H }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-shrink-0">
          <div className="h-12 w-12 rounded-full bg-bareter-teal/12 flex items-center justify-center">
            <span className="text-bareter-teal text-sm font-bold">KM</span>
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-bareter-teal flex items-center justify-center border-2 border-white">
            <ShieldCheck className="h-2.5 w-2.5 text-white" />
          </span>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">Khalid Al-Mansoori</p>
          <p className="text-[10px] text-bareter-teal font-semibold">Verified Business · Dubai</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[["22", "Deals"], ["AED 140K", "Volume"], ["4.9★", "Rating"]].map(([v, l]) => (
          <div key={l} className="text-center bg-slate-50 rounded-xl py-2.5">
            <p className="text-[10px] font-bold text-slate-800 leading-tight">{v}</p>
            <p className="text-[8px] text-slate-400">{l}</p>
          </div>
        ))}
      </div>
      <div className="space-y-1.5 mb-3">
        {[["Sector", "Automotive Services"], ["Open to", "Marketing & Media"]].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
            <span className="text-[9px] text-slate-500">{k}</span>
            <span className="text-[9px] font-semibold text-slate-700">{v}</span>
          </div>
        ))}
      </div>
      <div className="w-full py-2.5 rounded-xl bg-bareter-teal text-center">
        <span className="text-[11px] text-white font-bold">Propose a Barter →</span>
      </div>
    </div>
  );
}

// 2 tiles per column, 4-step cycle, JS-driven 5 s scroll, left then right (+30 ms)
type HCPhase = "idle" | "exit" | "enter";

const LEFT_STEPS  = [
  <><ChatDealCard /><DeviceSwapCard /></>,
  <><CreateListingCard /><AnalyticsCard /></>,
  <><BrandCollabCard /><VerifiedMemberCard /></>,
  <><BarterItemCard /><DealClosedCard /></>,
] as const;

const RIGHT_STEPS = [
  <><BarterItemCard /><DealClosedCard /></>,
  <><BrandCollabCard /><ChatDealCard /></>,
  <><CreateListingCard /><DeviceSwapCard /></>,
  <><AnalyticsCard /><VerifiedMemberCard /></>,
] as const;

function HeroCarousel() {
  const [step, setStep]     = useState(0);       // 0, 1, 2 or 3
  const [phaseL, setPhaseL] = useState<HCPhase>("idle");
  const [phaseR, setPhaseR] = useState<HCPhase>("idle");

  useEffect(() => {
    const cycle = () => {
      setPhaseL("exit");
      setTimeout(() => setPhaseR("exit"), 30);
      setTimeout(() => {
        setStep(s => (s + 1) % 4);
        setPhaseL("enter");
      }, 1950);
      setTimeout(() => setPhaseR("enter"), 1980);
      setTimeout(() => setPhaseL("idle"), 3900);
      setTimeout(() => setPhaseR("idle"), 3930);
    };

    const timer = setInterval(cycle, 5000);
    return () => clearInterval(timer);
  }, []);

  const cls = (p: HCPhase) =>
    p === "exit" ? "hc-col-exit" : p === "enter" ? "hc-col-enter" : "";

  const PeekCard = () => (
    <div className={`${CARD_BASE} p-3.5 flex-shrink-0`} style={{ height: CARD_H }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-full bg-bareter-teal/20 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2 bg-slate-200 rounded-full w-3/4" />
          <div className="h-1.5 bg-slate-100 rounded-full w-1/2" />
        </div>
        <div className="h-4 w-12 rounded-full bg-emerald-100 border border-emerald-200" />
      </div>
      <div className="space-y-1.5 mb-3">
        <div className="h-1.5 bg-slate-100 rounded-full w-full" />
        <div className="h-1.5 bg-slate-100 rounded-full w-10/12" />
        <div className="h-1.5 bg-slate-100 rounded-full w-3/4" />
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <div className="h-16 rounded-xl bg-slate-50 border border-slate-100 p-2">
          <div className="h-2 bg-slate-200 rounded-full w-3/4 mb-1.5" />
          <div className="h-2.5 bg-bareter-teal/20 rounded-full w-1/2" />
        </div>
        <div className="h-16 rounded-xl bg-slate-50 border border-slate-100 p-2">
          <div className="h-2 bg-slate-200 rounded-full w-3/4 mb-1.5" />
          <div className="h-2.5 bg-bareter-teal/20 rounded-full w-1/2" />
        </div>
      </div>
      <div className="flex items-center gap-2 bg-bareter-teal/8 rounded-xl px-3 py-2">
        <div className="h-3 w-3 rounded-full bg-bareter-teal/40 flex-shrink-0" />
        <div className="h-2 bg-bareter-teal/25 rounded-full flex-1" />
      </div>
    </div>
  );

  // Reel approach: each column is an overflow-hidden clipping window.
  // The strip (peek + c1 + c2 + peek) shifts up by STRIP_OFF so only PEEK px of the
  // top peek card is visible below the gradient. No absolute-inside-flex overlap possible.
  const PEEK      = 64;
  const STRIP_OFF = -(CARD_H - PEEK); // -226px

  const peekCard = (
    <div aria-hidden="true" className="flex-shrink-0 opacity-60 pointer-events-none">
      <PeekCard />
    </div>
  );

  // Fade gradient blended inside each overflow-hidden column so clipping is exact.
  // h-24 at top blends the 64px peek card; h-56 at bottom covers the peek card AND
  // the stats-strip overlap (carousel extends to hero bottom which includes the strip).
  const colFades = (
    <>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-24 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, #1C2D4A 0%, transparent 100%)" }} />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-56 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to top, #1C2D4A 0%, transparent 100%)" }} />
    </>
  );

  return (
    <div className="hc-inner relative flex w-full h-full pt-6" style={{ gap: "18px" }}>

      {/* ── Left column ── */}
      <div className="flex-1 overflow-hidden relative">
        <div style={{ transform: `translateY(${STRIP_OFF}px)` }}>
          <div className={`relative flex flex-col ${cls(phaseL)}`} style={{ gap: CARD_GAP }}>
            {peekCard}
            {LEFT_STEPS[step]}
            <div aria-hidden="true" className="hc-connector absolute left-1/2 -translate-x-1/2"
              style={{ top: CARD_H, height: CARD_GAP }} />
            <div aria-hidden="true" className="hc-connector absolute left-1/2 -translate-x-1/2"
              style={{ top: CARD_H * 2 + CARD_GAP, height: CARD_GAP }} />
            <div aria-hidden="true" className="hc-connector absolute left-1/2 -translate-x-1/2"
              style={{ top: CARD_H * 3 + CARD_GAP * 2, height: CARD_GAP }} />
            {peekCard}
          </div>
        </div>
        {colFades}
      </div>

      {/* ── Right column (80px lower than left) ── */}
      <div className="flex-1 overflow-hidden relative">
        <div style={{ transform: `translateY(${STRIP_OFF + 80}px)` }}>
          <div className={`relative flex flex-col ${cls(phaseR)}`} style={{ gap: CARD_GAP }}>
            {peekCard}
            {RIGHT_STEPS[step]}
            <div aria-hidden="true" className="hc-connector absolute left-1/2 -translate-x-1/2"
              style={{ top: CARD_H, height: CARD_GAP }} />
            <div aria-hidden="true" className="hc-connector absolute left-1/2 -translate-x-1/2"
              style={{ top: CARD_H * 2 + CARD_GAP, height: CARD_GAP }} />
            <div aria-hidden="true" className="hc-connector absolute left-1/2 -translate-x-1/2"
              style={{ top: CARD_H * 3 + CARD_GAP * 2, height: CARD_GAP }} />
            {peekCard}
          </div>
        </div>
        {colFades}
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

  // Redirect logged-in users away from the marketing landing page
  useEffect(() => {
    if (user) navigate("/feed");
  }, [user, navigate]);

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
  const heroTagline = cmsSettings?.hero_tagline || "UAE's AI-powered barter marketplace. No cash. Just value.";
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
  const stepsRef = useStagger(".step-item", []);
  const faqRef = useStagger(".faq-item", [openFaq]);

  // Scroll-direction-aware heading reveal
  const scrollDirRef = useRef<"down" | "up">("down");
  const lastScrollY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      scrollDirRef.current = y > lastScrollY.current ? "down" : "up";
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) {
          el.style.setProperty("--reveal-from", scrollDirRef.current === "up" ? "-36px" : "36px");
          void el.getBoundingClientRect();
          el.classList.add("is-in-view");
        } else {
          el.classList.remove("is-in-view");
        }
      }),
      { threshold: 0.12 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

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
        /* ── Scroll-direction heading reveal ── */
        [data-reveal] {
          opacity: 0;
          transform: translateY(var(--reveal-from, 36px));
          transition: opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1);
        }
        [data-reveal].is-in-view {
          opacity: 1;
          transform: translateY(0);
        }
        /* ── Hero card evaporation + scroll ── */
        @keyframes hcColExit  { from{transform:translateY(0)}    to{transform:translateY(-342px)} }
        @keyframes hcColEnter { from{transform:translateY(342px)} to{transform:translateY(0)} }
        @keyframes hcTileEvap {
          0%   { opacity: 1;    transform: translateY(0px);   filter: blur(0px); }
          40%  { opacity: 0.55; transform: translateY(-7px);  filter: blur(3px); }
          100% { opacity: 0;    transform: translateY(-20px); filter: blur(9px); }
        }
        @keyframes hcTileAppear {
          0%   { opacity: 0;    transform: translateY(18px); filter: blur(8px); }
          55%  { opacity: 0.85; transform: translateY(-2px); filter: blur(0.5px); }
          100% { opacity: 1;    transform: translateY(0px);  filter: blur(0px); }
        }
        /* Column scrolls while tiles evaporate/materialize individually */
        .hc-col-exit  { animation: hcColExit   1.9s ease-in-out                    forwards; }
        .hc-col-enter { animation: hcColEnter  1.9s cubic-bezier(0.22,1,0.36,1)    forwards; }
        /* Each tile animates for 0.9 s — stagger = 0.95 s so tile 2 starts after tile 1 finishes */
        .hc-col-exit  .hc-tile { animation: hcTileEvap   0.9s ease-out                    forwards; }
        .hc-col-exit  .hc-tile:nth-child(1) { animation-delay: 0ms; }
        .hc-col-exit  .hc-tile:nth-child(2) { animation-delay: 950ms; }
        .hc-col-enter .hc-tile { animation: hcTileAppear 0.9s cubic-bezier(0.22,1,0.36,1) forwards; }
        .hc-col-enter .hc-tile:nth-child(1) { animation-delay: 0ms; }
        .hc-col-enter .hc-tile:nth-child(2) { animation-delay: 950ms; }
        /* ── Carousel scale — grows on bigger screens so cards fill hero height ── */
        @media (min-width: 1280px) {
          .hc-inner { transform: scale(1.12); transform-origin: top right; }
        }
        @media (min-width: 1536px) {
          .hc-inner { transform: scale(1.3); transform-origin: top right; }
        }
        /* ── Platform section inner-item entrance ── */
        @keyframes itemFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* chat bubbles — reveal after prop-card enters view */
        .prop-card .chat-msg { opacity: 0; }
        .prop-card.is-in-view .chat-msg { animation: itemFadeUp 0.42s cubic-bezier(0.16,1,0.3,1) both; }
        .prop-card.is-in-view .chat-msg:nth-child(1) { animation-delay: 0.25s; }
        .prop-card.is-in-view .chat-msg:nth-child(2) { animation-delay: 0.75s; }
        .prop-card.is-in-view .chat-msg:nth-child(3) { animation-delay: 1.30s; }
        .prop-card.is-in-view .chat-msg:nth-child(4) { animation-delay: 1.70s; }
        /* typing indicator */
        .prop-card .chat-typing { opacity: 0; }
        .prop-card.is-in-view .chat-typing { animation: itemFadeUp 0.3s ease both; animation-delay: 0.95s; }
        @keyframes typingDots { 0%,80%,100%{transform:scale(0.6);opacity:.4} 40%{transform:scale(1);opacity:1} }
        .typing-dot { display:inline-block; width:5px; height:5px; border-radius:50%; background:currentColor; margin:0 1.5px; animation: typingDots 1.1s ease-in-out infinite; }
        .typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .typing-dot:nth-child(3) { animation-delay: 0.30s; }
        /* feature pills */
        .prop-card .feat-pill { opacity: 0; }
        .prop-card.is-in-view .feat-pill { animation: itemFadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .prop-card.is-in-view .feat-pill:nth-child(1) { animation-delay: 0.20s; }
        .prop-card.is-in-view .feat-pill:nth-child(2) { animation-delay: 0.40s; }
        .prop-card.is-in-view .feat-pill:nth-child(3) { animation-delay: 0.60s; }
        .prop-card.is-in-view .feat-pill:nth-child(4) { animation-delay: 0.80s; }
        /* barter rows */
        .prop-card .barter-row { opacity: 0; }
        .prop-card.is-in-view .barter-row { animation: itemFadeUp 0.38s cubic-bezier(0.16,1,0.3,1) both; }
        .prop-card.is-in-view .barter-row:nth-child(1) { animation-delay: 0.20s; }
        .prop-card.is-in-view .barter-row:nth-child(2) { animation-delay: 0.42s; }
        .prop-card.is-in-view .barter-row:nth-child(3) { animation-delay: 0.64s; }
        /* ── Hero carousel — per-breakpoint scale ── */
        /* tablet (md 768-1023): compact */
        @media (min-width: 768px) and (max-width: 1023px) {
          .hc-inner { transform: scale(0.72); transform-origin: top right; }
        }
        /* laptop (lg 1024-1279): slightly smaller than desktop */
        @media (min-width: 1024px) and (max-width: 1279px) {
          .hc-inner { transform: scale(0.90); transform-origin: top right; }
        }
        /* ── Carousel connector: ball rolling through a tube ── */
        @keyframes ballRoll {
          0%   { background-position: center -24px, center; }
          100% { background-position: center calc(100% + 24px), center; }
        }
        .hc-connector {
          width: 3px;
          border-radius: 2px;
          /* Layer 1: glowing ball  |  Layer 2: semi-transparent tube track */
          background-image:
            radial-gradient(ellipse 10px 18px at center, #fffde7 0%, rgba(255,255,255,0.85) 45%, transparent 100%),
            linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.08) 100%);
          background-size: 10px 24px, 100% 100%;
          background-repeat: no-repeat, no-repeat;
          background-position: center -24px, center;
          box-shadow: 0 0 6px rgba(255,255,220,0.25);
          animation: ballRoll 1.3s cubic-bezier(0.45,0,0.55,1) infinite;
          pointer-events: none;
        }
        /* ── Reduce motion ── */
        @media (prefers-reduced-motion: reduce) {
          .bareter-stagger-card,.prop-card,.feat-card,.cat-item,.step-item,.faq-item,.reveal-el,[data-reveal] {
            opacity: 1 !important; transform: none !important; transition: none !important;
          }
          .float-a,.float-b,.float-c,.float-d,.pulse-dot { animation: none !important; }
          .hc-col-exit .hc-tile, .hc-col-enter .hc-tile { animation: none !important; opacity: 1 !important; }
          .hc-connector { animation: none !important; }
          .prop-card .chat-msg, .prop-card .chat-typing, .prop-card .feat-pill, .prop-card .barter-row {
            opacity: 1 !important; animation: none !important;
          }
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

        <div className="relative z-10 w-full px-5 sm:px-10 md:px-14 lg:px-16 xl:px-20 2xl:px-24 flex-1 flex flex-col justify-start pt-8 pb-6 sm:pt-12 sm:pb-8 md:justify-center md:py-14">

            {/* ── LEFT — primary copy (carousel is absolute, so left copy owns the flex row) ── */}
            <div className="min-w-0 w-full max-w-[92vw] sm:max-w-[480px] md:max-w-[400px] lg:max-w-[480px] xl:max-w-[620px] 2xl:max-w-[720px]">
              <h1 className="text-3xl sm:text-4xl md:text-[2.8rem] lg:text-[3.2rem] xl:text-[4.5rem] 2xl:text-[5.5rem] font-extrabold text-white leading-[1.18] lg:leading-[1.13] xl:leading-[1.08] 2xl:leading-[1.06] tracking-tight mb-4 sm:mb-5 lg:mb-6" data-testid="text-hero-headline">
                {heroHeadline}
              </h1>
              <p className="text-sm sm:text-base lg:text-lg xl:text-xl font-semibold text-white mb-6 sm:mb-8 lg:mb-10" data-testid="text-hero-tagline" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.45)" }}>
                {heroTagline}
              </p>

              {/* Search */}
              <div ref={searchRef} className="relative mb-6 sm:mb-8">
                <form onSubmit={handleSearch} className="flex items-stretch bg-white border border-gray-200 rounded-xl h-12 xl:h-14 overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-200">
                  <Search className="h-4 w-4 text-bareter-navy/40 self-center ml-4 flex-shrink-0" />
                  <input
                    type="search"
                    value={heroQuery}
                    onChange={e => { setHeroQuery(e.target.value); setShowSugg(true); }}
                    placeholder="Search for anything to barter…"
                    className="flex-1 bg-transparent text-bareter-navy placeholder:text-bareter-navy/40 text-sm px-3 focus:outline-none"
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
              <div className="flex gap-2 sm:gap-3 mb-8 sm:mb-10">
                <Button size="lg" className="flex-1 h-10 sm:h-12 xl:h-14 px-3 sm:px-7 xl:px-9 text-sm sm:text-base xl:text-lg bg-bareter-teal hover:bg-bareter-teal/90 text-white font-bold rounded-xl gap-1.5 sm:gap-2 shadow-lg active:scale-[0.98]"
                  onClick={() => { if (waitlistGate()) navigate("/browse"); }}>
                  Browse Listings <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                <Button size="lg" className="flex-1 h-10 sm:h-12 xl:h-14 px-3 sm:px-7 xl:px-9 text-sm sm:text-base xl:text-lg bg-white/15 hover:bg-white/25 text-white border border-white/25 font-semibold rounded-xl active:scale-[0.98]"
                  onClick={() => { if (waitlistGate()) navigate(user ? "/create-listing" : "/register"); }}>
                  List Your Barter
                </Button>
              </div>

              {/* Trust row */}
              <div className="flex items-center gap-4 text-white/50 text-xs">
                {[""].map(t => (
                  <span key={t} className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-bareter-teal flex-shrink-0" />{t}
                  </span>
                ))}
              </div>
            </div>

        </div>

        {/* ── Carousel glow — teal wash + concentrated blobs around the cards ── */}
        {/* Background teal wash on right side (z-[2], behind everything) */}
        <div aria-hidden="true" className="hidden md:block absolute right-0 top-0 bottom-0 z-[2] w-[55%] pointer-events-none"
          style={{ background: "linear-gradient(to left, rgba(42,160,160,0.18) 0%, rgba(42,160,160,0.06) 50%, transparent 100%)" }} />
        {/* Concentrated glow blobs (z-[4], behind cards but in front of wash) */}
        <div aria-hidden="true" className="hidden md:block absolute right-0 top-0 bottom-0 z-[4] w-[480px] lg:w-[580px] xl:w-[720px] pointer-events-none">
          {/* Top-right bright teal spot */}
          <div className="absolute right-4 top-10 w-56 lg:w-72 xl:w-96 h-56 lg:h-72 xl:h-96 opacity-70 blur-xl" style={{ background: "radial-gradient(ellipse,rgba(42,160,160,0.9) 0%,transparent 60%)" }} />
          {/* Centre white shimmer */}
          <div className="absolute right-24 top-1/3 w-40 lg:w-56 xl:w-72 h-40 lg:h-56 xl:h-72 opacity-55 blur-xl" style={{ background: "radial-gradient(ellipse,rgba(180,240,240,0.7) 0%,transparent 60%)" }} />
          {/* Bottom-right teal spot */}
          <div className="absolute right-2 bottom-8 w-52 lg:w-64 xl:w-80 h-52 lg:h-64 xl:h-80 opacity-65 blur-xl" style={{ background: "radial-gradient(ellipse,rgba(42,160,160,0.85) 0%,transparent 60%)" }} />
          {/* Left-edge bleed so glow wraps around card edges */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-24 lg:w-32 h-96 opacity-40 blur-2xl" style={{ background: "radial-gradient(ellipse,rgba(42,160,160,0.6) 0%,transparent 70%)" }} />
        </div>

        {/* ── Carousel — absolute right, full hero height; section overflow:hidden clips it ── */}
        <div className="hidden md:flex absolute right-0 top-0 bottom-0 z-[5] w-[310px] lg:w-[440px] xl:w-[520px] 2xl:w-[620px]">
          <HeroCarousel />
        </div>

        {/* ── Stats strip at hero bottom ── */}
        <div className="relative z-[7] border-t border-white/10 w-full bg-bareter-navy/95">
          <div className="container mx-auto max-w-4xl px-5 sm:px-10 py-4 sm:py-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
              {[
                { value: "500+", label: "Active members" },
                { value: "400+", label: "Listings posted" },
                { value: "100+", label: "Deals closed" },
                { value: "$100k+", label: "In deal value" },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-tight">{s.value}</p>
                  <p className="text-white/50 text-[11px] sm:text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          PLATFORM MOCKUPS — acquire.com 3-column: List / Negotiate / Deal
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-[#f0f4f8] dark:bg-muted/30 py-12 sm:py-16 lg:py-24" data-testid="section-platform">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14 lg:mb-20" data-reveal>
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">How Bareter works</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight leading-[1.15] max-w-2xl mx-auto">
              Bartering fast, safe, and easy
            </h2>
          </div>

          <div ref={propCardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 items-stretch relative">
            {/* Dashed connector (desktop) */}
            <div className="hidden lg:block absolute top-[112px] left-[34%] right-[34%] border-t-2 border-dashed border-bareter-navy/15 z-0" />

            {/* ── Col 1: AI Chat ── */}
            <div className="prop-card flex flex-col items-center text-center">
              <div className="w-full bg-white dark:bg-card rounded-3xl shadow-lg overflow-hidden mb-6 border border-gray-100 dark:border-border flex-1 flex flex-col">
                <div className="bg-bareter-teal px-5 py-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">B</div>
                  <div className="text-left">
                    <p className="text-white font-semibold text-sm">BarterBot</p>
                    <div className="flex items-center gap-1.5">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-green-400" />
                      <span className="text-white/70 text-[11px]">Online now</span>
                    </div>
                  </div>
                </div>
                <div className="p-5 space-y-3 flex-1">
                  {/* message 1 */}
                  <div className="chat-msg flex items-start gap-2">
                    <div className="h-7 w-7 rounded-full bg-bareter-teal/15 flex-shrink-0 flex items-center justify-center text-bareter-teal text-[10px] font-bold">B</div>
                    <div className="bg-gray-100 dark:bg-muted rounded-2xl rounded-tl-none px-4 py-2.5 max-w-[210px] text-left">
                      <p className="text-bareter-navy dark:text-foreground text-xs leading-relaxed">Your listing is live! Found <strong>3 matching partners</strong> near Dubai.</p>
                    </div>
                  </div>
                  {/* message 2 — user reply */}
                  <div className="chat-msg flex justify-end">
                    <div className="bg-bareter-teal/12 rounded-2xl rounded-tr-none px-4 py-2.5 max-w-[180px] text-right">
                      <p className="text-bareter-teal text-xs font-medium">Show me the matches →</p>
                    </div>
                  </div>
                  {/* typing indicator */}
                  <div className="chat-typing flex items-start gap-2">
                    <div className="h-7 w-7 rounded-full bg-bareter-teal/15 flex-shrink-0 flex items-center justify-center text-bareter-teal text-[10px] font-bold">B</div>
                    <div className="bg-gray-100 dark:bg-muted rounded-2xl rounded-tl-none px-4 py-3 text-bareter-teal/70 flex items-center gap-0.5">
                      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                    </div>
                  </div>
                  {/* message 3 — AI reply */}
                  <div className="chat-msg flex items-start gap-2">
                    <div className="h-7 w-7 rounded-full bg-bareter-teal/15 flex-shrink-0 flex items-center justify-center text-bareter-teal text-[10px] font-bold">B</div>
                    <div className="bg-gray-100 dark:bg-muted rounded-2xl rounded-tl-none px-4 py-2.5 max-w-[210px] text-left">
                      <p className="text-bareter-navy dark:text-foreground text-xs leading-relaxed">Top match: <strong>Khalid Auto Group</strong> — value AED 8,000 ✓</p>
                    </div>
                  </div>
                  {/* message 4 — input bar */}
                  <div className="chat-msg flex items-center gap-2 mt-2 border border-gray-200 dark:border-border rounded-xl px-3 py-2">
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
              <p className="text-muted-foreground text-sm max-w-[240px] leading-relaxed">Post in 2 minutes. We find the best matching partner for your barter.</p>
            </div>

            {/* ── Col 2: Feature pills ── */}
            <div className="prop-card flex flex-col items-center text-center">
              <div className="w-full bg-white dark:bg-card rounded-3xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-border flex-1">
                <div className="flex items-center justify-center gap-2 mb-6">
                  <span className="text-bareter-navy dark:text-foreground font-extrabold text-xl tracking-tight">Bareter</span>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Smart matching", icon: <Sparkles className="h-4 w-4 text-bareter-teal" /> },
                    { label: "Verified UAE members", icon: <ShieldCheck className="h-4 w-4 text-bareter-teal" /> },
                    { label: "Auto-generated contracts", icon: <FileSignature className="h-4 w-4 text-bareter-teal" /> },
                    { label: "In-app chat & counter-offers", icon: <MessageSquare className="h-4 w-4 text-bareter-teal" /> },
                  ].map(f => (
                    <div key={f.label} className="feat-pill flex items-center gap-3 bg-gray-50 dark:bg-muted/40 rounded-xl px-4 py-3.5 border border-gray-100 dark:border-border hover:border-bareter-teal/30 transition-colors">
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
              <p className="text-muted-foreground text-sm max-w-[240px] leading-relaxed">Chat, counter-offer, and lock in terms all inside Bareter.</p>
            </div>

            {/* ── Col 3: My Barters list ── */}
            <div className="prop-card flex flex-col items-center text-center">
              <div className="w-full bg-white dark:bg-card rounded-3xl shadow-lg overflow-hidden mb-6 border border-gray-100 dark:border-border flex-1 flex flex-col">
                <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-border flex items-center justify-between">
                  <p className="font-extrabold text-bareter-navy dark:text-foreground text-sm">My Barters</p>
                  <span className="text-[10px] font-semibold text-bareter-teal bg-bareter-teal/10 px-2 py-0.5 rounded-full">3 active</span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-border flex-1">
                  {[
                    { type: "Real Estate", title: "Dubai Marina Office", value: "AED 450K", status: "Matched", color: "text-bareter-teal" },
                    { type: "Services", title: "Legal Package Deal", value: "AED 12K", status: "Pending", color: "text-amber-500" },
                    { type: "Automotive", title: "Fleet Service Pack", value: "AED 8K", status: "Completed", color: "text-green-500" },
                  ].map((d, i) => (
                    <div key={i} className="barter-row px-5 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-muted/20 transition-colors">
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
              <p className="text-muted-foreground text-sm max-w-[240px] leading-relaxed">Accept the best offer and sign a barter contract both parties protected.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          THREE WAYS — feature cards with hover lift
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white dark:bg-background py-12 sm:py-16 lg:py-24" data-testid="section-three-ways">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12 lg:mb-16" data-reveal>
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">What you can do</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight mb-3 sm:mb-4">One platform. Three ways to swap.</h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">Exchange goods, services, or content without spending a dirham.</p>
          </div>
          <div ref={featureCardsRef} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 sm:gap-6">
            {[
              {
                icon: <ArrowLeftRight className="h-6 w-6 text-bareter-teal" />, badge: "Most popular",
                title: "Barter Anything", accent: false,
                desc: "Swap goods, services or skills directly. Cars, office space, legal services, hospitality anything goes.",
                items: ["Goods for goods", "Services for services", "Matched partners", "Free, always"],
                href: "/browse", cta: "Browse Barters",
              },
              {
                icon: <Handshake className="h-6 w-6 text-white" />, badge: "",
                title: "Services for Services", accent: true,
                desc: "Two people each with something the other needs. Skip the invoices swap your expertise and both walk away with exactly what you need.",
                items: ["Legal for marketing", "Design for accounting", "Matched by value", "Contract auto-generated"],
                href: "/create-listing", cta: "Post a Service",
              },
              {
                icon: <Camera className="h-6 w-6 text-bareter-teal" />, badge: "Brands & Creators",
                title: "Brand × Creator Deals", accent: false,
                desc: "Brands offer products. Creators deliver authentic TikToks, Reels, and Stories. No cash changes hands just real value for real content.",
                items: ["Instagram, TikTok, YouTube", "Any follower count welcome", "Verified creators only", "Deals tracked in-app"],
                href: "/browse", cta: "Coming Soon",
              },
            ].map((card, i) => (
              <div key={i} className={`feat-card group rounded-2xl border shadow-sm hover:shadow-bareter-hover hover:-translate-y-2 transition-all duration-300 p-5 sm:p-6 lg:p-8 flex flex-col h-full ${card.accent ? "bg-bareter-navy text-white border-bareter-navy" : "bg-white dark:bg-card border-gray-100 dark:border-border"}`}>
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
      <section className="bg-gray-50 dark:bg-muted/20 py-12 sm:py-16 lg:py-24" data-testid="section-top-barters">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 mb-8 sm:mb-10 lg:mb-12">
            <div data-reveal>
              <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-1">Top Picks</p>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight">Handpicked barters</h2>
              <p className="text-muted-foreground mt-1.5"></p>
            </div>
            <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm font-bold text-bareter-teal hover:text-bareter-teal/80 transition-colors whitespace-nowrap">
              View all listings <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div ref={listingCardsRef} className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
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
          HOW IT WORKS — organic staggered layout on dark navy
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="bg-bareter-navy overflow-hidden py-12 sm:py-16 lg:py-24" data-testid="section-how">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14 lg:mb-20" data-reveal>
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-3 sm:mb-4">From listing to closed deal.</h2>
            <p className="text-white/55 max-w-lg mx-auto text-base sm:text-lg">No cash. No waste. Just value for value. Matched and sealed with a contract.</p>
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
                { Icon: LayoutList,    title: "List what you have",    desc: "Upload photos, set a value, describe what you want back.",      tag: "2 min",         bg: "bg-bareter-teal",   left: "4%",  top: "55px" },
                { Icon: Sparkles,      title: "Instantly matched",      desc: "Our engine surfaces the most compatible barter partners.",     tag: "Instant match", bg: "bg-teal-600",       left: "27%", top: "145px" },
                { Icon: MessageSquare, title: "Negotiate in-app",      desc: "Chat, counter-offer, and agree on terms inside Bareter.",      tag: "No lawyers",    bg: "bg-bareter-teal",   left: "52%", top: "25px" },
                { Icon: FileSignature, title: "Sign & exchange",       desc: "Auto-generated contract. Sign on-platform, deal complete.",   tag: "Legally binding",bg: "bg-teal-700",       left: "74%", top: "168px" },
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

          {/* Tablet: 2x2 grid */}
          <div className="hidden md:grid lg:hidden grid-cols-2 gap-6 mb-6">
            {[
              { Icon: LayoutList,    title: "List what you have",    desc: "Upload photos, set a value, describe what you want back.",    bg: "bg-bareter-teal",   tag: "2 min" },
              { Icon: Sparkles,      title: "Instantly matched",      desc: "Our engine surfaces the most compatible barter partners.",   bg: "bg-teal-600",       tag: "Instant match" },
              { Icon: MessageSquare, title: "Negotiate in-app",      desc: "Chat, counter-offer, and agree on terms inside Bareter.",    bg: "bg-bareter-teal",   tag: "No lawyers" },
              { Icon: FileSignature, title: "Sign & exchange",       desc: "Auto-generated contract. Sign on-platform, deal complete.", bg: "bg-teal-700",       tag: "Legally binding" },
            ].map((step, i) => (
              <div key={step.title} className="flex flex-col items-center text-center p-6 rounded-2xl bg-white/5 border border-white/10">
                <div className="relative mb-4">
                  <div className={`h-14 w-14 rounded-2xl ${step.bg} flex items-center justify-center shadow-lg`}>
                    <step.Icon className="h-6 w-6 text-white" />
                  </div>
                  <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-white text-bareter-navy text-[10px] font-extrabold flex items-center justify-center shadow">{i + 1}</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1.5">{step.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed mb-2">{step.desc}</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-white border border-white/20">
                  <CheckCircle2 className="h-2.5 w-2.5" />{step.tag}
                </span>
              </div>
            ))}
          </div>

          {/* Mobile: vertical list with dashed connectors */}
          <div className="md:hidden space-y-7">
            {[
              { Icon: LayoutList,    title: "List what you have",    desc: "Upload photos, set a value, describe what you want back.",    bg: "bg-bareter-teal" },
              { Icon: Sparkles,      title: "Instantly matched",      desc: "Our engine surfaces the most compatible barter partners.",   bg: "bg-teal-600" },
              { Icon: MessageSquare, title: "Negotiate in-app",      desc: "Chat, counter-offer, and agree on terms inside Bareter.",    bg: "bg-bareter-teal" },
              { Icon: FileSignature, title: "Sign & exchange",       desc: "Auto-generated contract. Sign on-platform, deal complete.", bg: "bg-teal-700" },
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

          <div className="mt-10 sm:mt-14 lg:mt-16 flex flex-col sm:flex-row items-center justify-center gap-3">
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
      <section className="bg-gray-50 dark:bg-muted/20 py-12 sm:py-16 lg:py-24" data-testid="section-faq">
        <div className="container mx-auto max-w-2xl px-4 sm:px-6">
          <div className="text-center mb-8 sm:mb-10 lg:mb-14" data-reveal>
            <p className="text-xs font-bold text-bareter-teal uppercase tracking-widest mb-3">FAQs</p>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-bareter-navy dark:text-foreground tracking-tight">Frequently asked questions</h2>
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
      <section className="relative isolate overflow-hidden bg-bareter-teal py-12 sm:py-16 lg:py-24" data-testid="section-cta">
        <div className="absolute inset-0 -z-10 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(circle at 25% 50%, white 0%, transparent 55%), radial-gradient(circle at 75% 50%, white 0%, transparent 55%)" }}
          aria-hidden="true" />
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-3 sm:mb-4">
            Join the Bareter community
          </h2>
          <p className="text-white/75 text-base sm:text-lg mb-8 sm:mb-10 max-w-xl mx-auto leading-relaxed">
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
