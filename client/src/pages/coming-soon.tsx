import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Camera, Star, Lock, Bell, CheckCircle2, ArrowLeft } from "lucide-react";

type Variant = "creators" | "brand-collabs";

const CONFIG: Record<Variant, {
  badge: string;
  headline: string;
  sub: string;
  accent: string;
  features: { icon: React.ReactNode; title: string; desc: string }[];
  cta: string;
  placeholder: string;
}> = {
  creators: {
    badge: "Creators Hub",
    headline: "Where UAE creators get paid in products, not promises.",
    sub: "Browse brand deals, receive gifted products, and sign barter contracts — all in one place. No cold DMs. No agencies. Just real collabs.",
    accent: "bg-violet-500",
    features: [
      { icon: <Star className="h-5 w-5 text-violet-500" />, title: "Curated brand deals", desc: "Brands post offers. You apply with your stats and pitch in seconds." },
      { icon: <Camera className="h-5 w-5 text-violet-500" />, title: "Gifted products & experiences", desc: "Hotel stays, fashion, gadgets — delivered before you create a single post." },
      { icon: <Lock className="h-5 w-5 text-violet-500" />, title: "Barter contracts, auto-generated", desc: "Every deal is documented. No verbal promises, no ambiguity." },
    ],
    cta: "Notify me when Creators Hub launches",
    placeholder: "your@email.com",
  },
  "brand-collabs": {
    badge: "Brand Collabs",
    headline: "Reach UAE audiences through authentic creator content.",
    sub: "Post your product or service, receive applications from verified UAE creators, and close deals on barter contracts zero fees, zero cash required.",
    accent: "bg-bareter-teal",
    features: [
      { icon: <Sparkles className="h-5 w-5 text-bareter-teal" />, title: "Smart-matched creators", desc: "Our engine surfaces creators whose audience matches your brand perfectly." },
      { icon: <Camera className="h-5 w-5 text-bareter-teal" />, title: "TikTok, Reels & Stories", desc: "Authentic content from creators who actually use your product." },
      { icon: <Lock className="h-5 w-5 text-bareter-teal" />, title: "Zero-commission contracts", desc: "Auto-generated barter agreements. Both parties sign on-platform." },
    ],
    cta: "Get early brand access",
    placeholder: "brand@company.com",
  },
};

function ComingSoonPage({ variant }: { variant: Variant }) {
  const c = CONFIG[variant];
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    // Fire-and-forget to waitlist endpoint
    fetch("/api/feature-waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), feature: variant }),
    }).catch(() => {});
    setSubmitted(true);
  };

  const isCreators = variant === "creators";
  const glowColor = isCreators ? "#8b5cf6" : "#2AA0A0";

  return (
    <div className="min-h-screen bg-bareter-navy flex flex-col overflow-hidden">
      {/* Dot-grid texture */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
      {/* Top radial glow */}
      <div aria-hidden="true" className="pointer-events-none fixed top-[-200px] left-1/2 -translate-x-1/2 w-[1100px] h-[700px] rounded-full opacity-25"
        style={{ background: `radial-gradient(ellipse, ${glowColor} 0%, transparent 65%)` }} />
      {/* Bottom accent line */}
      <div aria-hidden="true" className="pointer-events-none fixed bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${glowColor}80, transparent)` }} />

      <div className="relative z-10 flex flex-col flex-1 container mx-auto max-w-5xl px-6 py-14">

        {/* Top bar — logo + back */}
        <div className="flex items-center justify-between mb-20">
          <Link href="/">
            <img src="/logo-full-white.png" alt="Bareter" className="h-8 w-auto opacity-90" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </Link>
          <Link href="/">
            <button type="button" className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm font-medium transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          </Link>
        </div>

        {/* Badge */}
        <div className="flex items-center gap-2 mb-7">
          <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-white ${c.accent}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            {c.badge} · Coming Soon
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-white leading-[1.08] tracking-tight mb-5 max-w-3xl">
          {c.headline}
        </h1>
        <p className="text-white/55 text-lg leading-relaxed mb-14 max-w-2xl">
          {c.sub}
        </p>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-14">
          {c.features.map((f, i) => (
            <div key={i} className="rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-sm p-5 hover:border-white/15 hover:bg-white/[0.07] transition-all duration-200">
              <div className="h-10 w-10 rounded-xl bg-white/8 flex items-center justify-center mb-4 border border-white/8">
                {f.icon}
              </div>
              <p className="text-white font-bold text-sm mb-1.5">{f.title}</p>
              <p className="text-white/45 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Email capture */}
        <div className="max-w-md">
          {submitted ? (
            <div className="flex items-center gap-3 bg-white/8 border border-white/15 rounded-2xl px-5 py-4">
              <CheckCircle2 className="h-5 w-5 text-bareter-teal flex-shrink-0" />
              <div>
                <p className="text-white font-semibold text-sm">You're on the list!</p>
                <p className="text-white/50 text-xs mt-0.5">We'll email you the moment this goes live.</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-white/70 text-sm font-semibold mb-3 flex items-center gap-2">
                <Bell className="h-4 w-4 text-white/40" /> {c.cta}
              </p>
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={c.placeholder}
                  className="flex-1 h-12 px-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/35 text-sm focus:outline-none focus:ring-2 focus:ring-bareter-teal/50 focus:border-transparent"
                />
                <Button
                  type="submit"
                  className="h-12 px-6 bg-bareter-teal hover:bg-bareter-teal/90 text-white font-bold rounded-xl gap-2 whitespace-nowrap flex-shrink-0"
                >
                  Notify me <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
              <p className="text-white/30 text-xs mt-3"></p>
            </>
          )}
        </div>

        {/* Footer nudge */}
        <div className="mt-auto pt-20 border-t border-white/8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-white/35 text-sm">While you wait — browse live barter listings</p>
          <Link href="/browse">
            <Button variant="outline" className="border-white/20 text-white bg-white/5 hover:bg-white/10 rounded-xl gap-2 text-sm">
              Browse listings <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CreatorsComingSoonPage() {
  return <ComingSoonPage variant="creators" />;
}

export function BrandCollabsComingSoonPage() {
  return <ComingSoonPage variant="brand-collabs" />;
}
