import { API_BASE } from "@/lib/queryClient";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Instagram, Youtube, Twitter, Users,
  TrendingUp, Sparkles, Camera, Filter, BadgeCheck,
} from "lucide-react";
import { VerifiedBadge } from "@/components/verified-badge";
import type { User } from "@shared/schema";
import type { CreatorProfileJson as CreatorProfile } from "@shared/schema";

type CreatorUser = Pick<User, "id" | "fullName" | "avatarUrl" | "location" | "city" | "country" | "isVerified" | "verificationStatus" | "founderBadge" | "signupType" | "credibilityScore" | "totalCompletedDeals"> & { creatorProfile: CreatorProfile };

const NICHES = ["Fashion", "Beauty", "Tech", "Food", "Travel", "Lifestyle", "Fitness", "Business", "Finance", "Entertainment", "Gaming", "Education"];
const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "X / Twitter" },
  { value: "linkedin", label: "LinkedIn" },
];

function platformIcon(platform: string) {
  if (platform === "instagram") return <Instagram className="h-3.5 w-3.5" />;
  if (platform === "youtube") return <Youtube className="h-3.5 w-3.5" />;
  if (platform === "twitter") return <Twitter className="h-3.5 w-3.5" />;
  return <Camera className="h-3.5 w-3.5" />;
}

function formatFollowers(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function CreatorCard({ creator }: { creator: CreatorUser }) {
  const cp = creator.creatorProfile;
  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Link href={`/creators/${creator.id}`}>
            <Avatar className="h-14 w-14 ring-2 ring-transparent group-hover:ring-primary/20 transition-all cursor-pointer">
              <AvatarImage src={creator.avatarUrl ?? undefined} />
              <AvatarFallback>{creator.fullName?.charAt(0) ?? "C"}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link href={`/creators/${creator.id}`}>
                <span className="font-semibold text-sm hover:text-primary transition-colors cursor-pointer truncate">{creator.fullName}</span>
              </Link>
              {creator.isVerified && <VerifiedBadge size="sm" />}
              {creator.founderBadge && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600">Founder</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
              <span className="capitalize">{platformIcon(cp.primaryPlatform)}</span>
              <span className="capitalize">{cp.primaryPlatform}</span>
              {creator.city && <><span>·</span><span>{creator.city}</span></>}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="text-center">
            <p className="text-base font-bold text-primary">{formatFollowers(cp.followerCount)}</p>
            <p className="text-[10px] text-muted-foreground">Followers</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-primary">{cp.avgEngagementRate?.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">Engagement</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-primary">{creator.totalCompletedDeals ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Deals Done</p>
          </div>
        </div>

        {/* Niches */}
        {cp.contentNiches?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {cp.contentNiches.slice(0, 3).map(n => (
              <Badge key={n} variant="secondary" className="text-[10px] px-1.5 py-0">{n}</Badge>
            ))}
            {cp.contentNiches.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{cp.contentNiches.length - 3}</Badge>
            )}
          </div>
        )}

        <Link href={`/creators/${creator.id}`}>
          <Button variant="outline" size="sm" className="w-full mt-4 text-xs h-8 gap-1.5">
            <Camera className="h-3.5 w-3.5" />
            View Profile
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function CreatorCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex gap-3">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}
        </div>
        <div className="flex gap-1">{[0, 1, 2].map(i => <Skeleton key={i} className="h-5 w-16" />)}</div>
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}

export function CreatorsPage() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [niche, setNiche] = useState("all");
  const [minFollowers, setMinFollowers] = useState("any");

  const minFollowersMap: Record<string, number | undefined> = {
    any: undefined, "1k": 1000, "5k": 5000, "10k": 10000, "50k": 50000, "100k": 100000,
  };

  const { data: creators = [], isLoading } = useQuery<CreatorUser[]>({
    queryKey: ["/api/creators", platform, niche, minFollowers],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (platform !== "all") params.set("platform", platform);
      if (niche !== "all") params.set("niche", niche);
      const min = minFollowersMap[minFollowers];
      if (min) params.set("minFollowers", String(min));
      const res = await fetch(`${API_BASE}/api/creators?${params}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const filtered = search.trim()
    ? creators.filter(c =>
        c.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        c.creatorProfile?.contentNiches?.some(n => n.toLowerCase().includes(search.toLowerCase())) ||
        c.creatorProfile?.instagramHandle?.toLowerCase().includes(search.toLowerCase())
      )
    : creators;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Creator Discovery</h1>
        </div>
        <p className="text-muted-foreground max-w-xl">
          Find content creators to collaborate with. Offer your product or service — get authentic content in return.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { icon: <Users className="h-4 w-4 text-primary" />, value: creators.length + "+", label: "Verified Creators" },
          { icon: <TrendingUp className="h-4 w-4 text-primary" />, value: "Open", label: "To Brand Collabs" },
          { icon: <Camera className="h-4 w-4 text-primary" />, value: "No Fee", label: "Direct Connect" },
        ].map((s, i) => (
          <div key={i} className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
            <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">{s.icon}</div>
            <div>
              <p className="font-bold text-sm">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search creators..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={niche} onValueChange={setNiche}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Niche" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Niches</SelectItem>
            {NICHES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={minFollowers} onValueChange={setMinFollowers}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Min followers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any followers</SelectItem>
            <SelectItem value="1k">1K+</SelectItem>
            <SelectItem value="5k">5K+</SelectItem>
            <SelectItem value="10k">10K+</SelectItem>
            <SelectItem value="50k">50K+</SelectItem>
            <SelectItem value="100k">100K+</SelectItem>
          </SelectContent>
        </Select>
        {(platform !== "all" || niche !== "all" || minFollowers !== "any") && (
          <Button variant="ghost" size="sm" onClick={() => { setPlatform("all"); setNiche("all"); setMinFollowers("any"); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <CreatorCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Camera className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium mb-1">No creators found</p>
          <p className="text-sm">Try adjusting your filters or check back soon as more creators join.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(c => <CreatorCard key={c.id} creator={c} />)}
        </div>
      )}

      {/* CTA for creators */}
      <div className="mt-12 bg-primary/5 border border-primary/20 rounded-xl p-6 text-center">
        <Camera className="h-8 w-8 text-primary mx-auto mb-3" />
        <h3 className="font-bold text-lg mb-2">Are you a content creator?</h3>
        <p className="text-muted-foreground text-sm mb-4 max-w-md mx-auto">
          Join Bareter as a Creator and start getting brand deals — receive products and services in exchange for your content.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/register">
            <Button>Join as Creator</Button>
          </Link>
          <Link href="/settings?tab=creator">
            <Button variant="outline">Set Up Creator Profile</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
