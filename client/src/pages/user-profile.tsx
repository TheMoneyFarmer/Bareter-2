import { useState } from "react";
import { useSeo } from "@/hooks/use-seo";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  MapPin,
  Shield,
  ShieldCheck,
  Star,
  Package,
  ShoppingCart,
  Calendar,
  Globe,
  Phone,
  Mail,
  Building2,
  Briefcase,
  ArrowLeft,
  ArrowLeftRight,
  Handshake,
  MessageCircle,
  Award,
  ThumbsUp,
  CheckCircle,
  Clock,
  TrendingUp,
  ImageIcon,
  Plus,
  X,
  Zap,
  ChevronRight,
  UserPlus,
  UserMinus,
  UserX,
  Flag,
} from "lucide-react";
import { ReportModal } from "@/components/report-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VerifiedBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import { ReputationBadge } from "@/components/ReputationBadge";
import { StarRating } from "@/components/StarRating";
import { SiInstagram, SiLinkedin, SiX, SiTiktok, SiYoutube, SiSnapchat } from "react-icons/si";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, assetUrl } from "@/lib/queryClient";
import type { Listing, Rating, User } from "@shared/schema";
import { ListingCard as BrandListingCard } from "@/components/ListingCard";
import type { ExchangeItem } from "@shared/schema";

interface PublicUserData extends Omit<User, "password"> {
  avgRating: number;
  totalRatings: number;
  ratings: Rating[];
  listings: Listing[];
}

interface CredibilityBreakdownItem { points: number; max: number; label: string; }
interface CredibilityData {
  credibilityScore: number;
  completionRate: string;
  avgResponseTime: number;
  totalCompletedDeals: number;
  endorsementCount: number;
  ratingAvg: number;
  breakdown?: {
    deals: CredibilityBreakdownItem;
    verified: CredibilityBreakdownItem;
    rating: CredibilityBreakdownItem;
    endorsements: CredibilityBreakdownItem;
  };
}

interface EndorsementItem {
  id: string;
  skill: string;
  fromUserId: string;
  fromUser?: { fullName: string; avatarUrl?: string };
}

interface PortfolioItem {
  id: string;
  title: string;
  description?: string;
  mediaUrl: string;
  mediaType: string;
  category?: string;
}

interface NewReview {
  id: string;
  rating: number;
  comment: string | null;
  tags: string[];
  createdAt: string;
  reviewer: { id: string; fullName: string; avatarUrl: string | null };
}

function ensureHttps(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function credibilityLabel(score: number) {
  if (score >= 80) return { label: "Excellent", color: "text-green-600 dark:text-green-400" };
  if (score >= 60) return { label: "Good", color: "text-blue-600 dark:text-blue-400" };
  if (score >= 40) return { label: "Fair", color: "text-yellow-600 dark:text-yellow-400" };
  return { label: "New", color: "text-muted-foreground" };
}

function formatResponseTime(minutes: number) {
  if (!minutes || minutes === 0) return null;
  if (minutes < 60) return `~${minutes}m`;
  if (minutes < 1440) return `~${Math.round(minutes / 60)}h`;
  return `~${Math.round(minutes / 1440)}d`;
}

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [endorseSkill, setEndorseSkill] = useState("");
  const [showEndorseInput, setShowEndorseInput] = useState(false);
  const [showProposeDialog, setShowProposeDialog] = useState(false);
  const [showReportUser, setShowReportUser] = useState(false);

  const { data: profileData, isLoading } = useQuery<PublicUserData>({
    queryKey: ["/api/users", id],
    enabled: !!currentUser,
    staleTime: 0,
  });

  const { data: credibility } = useQuery<CredibilityData>({
    queryKey: ["/api/users", id, "credibility"],
    enabled: !!id,
  });

  const { data: endorsements } = useQuery<EndorsementItem[]>({
    queryKey: ["/api/endorsements", id],
    enabled: !!id,
  });

  const { data: portfolioItems } = useQuery<PortfolioItem[]>({
    queryKey: ["/api/portfolio", id],
    enabled: !!id,
  });

  const { data: reviewsData } = useQuery<{ reviews: NewReview[]; avgRating: number; reviewCount: number }>({
    queryKey: ["/api/users", id, "reviews"],
    enabled: !!id,
  });

  // Activity stats — only shown on own profile
  const { data: activityStats } = useQuery<{
    activeListings: number; totalViews: number; totalLikes: number;
    totalProposals: number; topListing: { id: string; title: string; viewCount: number } | null;
  }>({
    queryKey: ["/api/users/me/listing-activity"],
    enabled: !!currentUser && currentUser.id === id,
    staleTime: 60_000,
  });

  const profileName = profileData?.businessName || profileData?.fullName || "Business";
  useSeo({
    title: `${profileName} — Bareter`,
    description: `View ${profileName}'s barter listings and profile on Bareter — UAE's cashless B2B marketplace.`,
    canonical: `${window.location.origin}/profile/${id}`,
  });

  const endorseMutation = useMutation({
    mutationFn: async (skill: string) => {
      const res = await apiRequest("POST", "/api/endorsements", { toUserId: id, skill });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/endorsements", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", id, "credibility"] });
      setEndorseSkill("");
      setShowEndorseInput(false);
      toast({ title: "Endorsed!", description: "Your endorsement has been added." });
    },
    onError: () => {
      toast({ title: "Already endorsed", description: "You've already endorsed this skill.", variant: "destructive" });
    },
  });

  const { data: followData, refetch: refetchFollow } = useQuery<{ isFollowing: boolean }>({
    queryKey: ["/api/users", id, "is-following"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${id}/is-following`);
      return res.json();
    },
    enabled: !!currentUser && !!id,
  });

  const { data: blockData, refetch: refetchBlock } = useQuery<{ isBlocked: boolean }>({
    queryKey: ["/api/users", id, "is-blocked"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${id}/is-blocked`);
      return res.json();
    },
    enabled: !!currentUser && !!id,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (followData?.isFollowing) {
        await apiRequest("DELETE", `/api/users/${id}/follow`);
      } else {
        await apiRequest("POST", `/api/users/${id}/follow`);
      }
    },
    onSuccess: () => {
      refetchFollow();
      const msg = followData?.isFollowing ? "Unfollowed" : "Following";
      toast({ title: msg });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (blockData?.isBlocked) {
        await apiRequest("DELETE", `/api/users/${id}/block`);
      } else {
        await apiRequest("POST", `/api/users/${id}/block`);
      }
    },
    onSuccess: () => {
      refetchBlock();
      refetchFollow();
      const msg = blockData?.isBlocked ? "User unblocked" : "User blocked";
      toast({ title: msg });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  if (!currentUser) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-md text-center">
        <h2 className="text-2xl font-bold mb-2" data-testid="text-signin-required">Sign in to view profiles</h2>
        <p className="text-muted-foreground mb-6">
          Create an account or sign in to view user profiles on Bareter.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/login">
            <Button variant="outline" data-testid="button-login-cta">Sign In</Button>
          </Link>
          <Link href="/register">
            <Button data-testid="button-register-cta">Get Started</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container px-4 py-8 mx-auto max-w-5xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Skeleton className="h-80" />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold mb-2">User not found</h2>
        <p className="text-muted-foreground mb-4">
          This profile may have been removed or doesn't exist.
        </p>
        <Link href="/browse">
          <Button data-testid="button-back-browse">Browse Listings</Button>
        </Link>
      </div>
    );
  }

  const memberSince = profileData.createdAt
    ? new Date(profileData.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "N/A";

  const lastActiveLabel = (() => {
    const ts = (profileData as any).lastActiveAt;
    if (!ts) return null;
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 5) return "Active now";
    if (mins < 60) return `Active ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Active ${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "Active yesterday";
    if (days < 7) return `Active ${days}d ago`;
    return null;
  })();

  const socialLinks = (profileData.socialLinks as Record<string, string>) || {};
  const whatIOffer = (profileData.whatIOffer as Array<{ name: string; value: number; description?: string }>) || [];
  const whatINeed = (profileData.whatINeed as Array<{ name: string; value: number; description?: string }>) || [];
  const isOwnProfile = currentUser?.id === profileData.id;

  const endorsementsBySkill = (endorsements || []).reduce<Record<string, EndorsementItem[]>>((acc, e) => {
    if (!acc[e.skill]) acc[e.skill] = [];
    acc[e.skill].push(e);
    return acc;
  }, {});

  const hasPortfolio = (portfolioItems && portfolioItems.length > 0) ||
    ((profileData.portfolioImages as string[] | null)?.length ?? 0) > 0;

  const completionRatePct = parseFloat(credibility?.completionRate || "0");
  const responseTimeStr = formatResponseTime(credibility?.avgResponseTime || 0);
  const { label: credLabel, color: credColor } = credibilityLabel(credibility?.credibilityScore || 0);

  return (
    <div className="container px-4 py-8 mx-auto max-w-5xl bareter-slide-in">
      <Link href="/browse" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to listings
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center mb-6">
                <Avatar className="h-24 w-24 mb-4">
                  <AvatarImage src={profileData.avatarUrl || undefined} />
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                    {profileData.fullName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-2 mb-1 flex-wrap justify-center">
                  <h1 className="text-xl font-bold" data-testid="text-profile-name">{profileData.fullName}</h1>
                  <VerifiedBadge isVerified={profileData.isVerified} kycStatus={profileData.kycStatus} kybStatus={profileData.kybStatus} accountType={profileData.accountType} size="md" />
                  <FounderBadge show={!!profileData.founderBadge} size="md" />
                  <ReputationBadge completedDeals={credibility?.totalCompletedDeals ?? 0} avgRating={reviewsData?.avgRating ?? 0} />
                </div>
                {profileData.businessName && (
                  <p className="text-muted-foreground flex items-center gap-1" data-testid="text-business-name">
                    <Building2 className="h-4 w-4" />
                    {profileData.businessName}
                  </p>
                )}
              </div>

              {(reviewsData?.avgRating ?? 0) > 0 && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <StarRating value={Math.round(reviewsData!.avgRating)} readonly size="sm" />
                  <span className="font-bold">{reviewsData!.avgRating.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">
                    ({reviewsData!.reviewCount} {reviewsData!.reviewCount === 1 ? "review" : "reviews"})
                  </span>
                </div>
              )}

              {/* Credibility score with breakdown */}
              {credibility && credibility.credibilityScore > 0 && (
                <div className="mb-4" data-testid="credibility-badge">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Award className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold" data-testid="text-credibility-score">
                        {credibility.credibilityScore}/100
                      </span>
                      <span className={`text-xs font-medium ${credColor}`}>{credLabel}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Trust Score</span>
                  </div>
                  <Progress value={credibility.credibilityScore} className="h-1.5 mb-2" />
                  {credibility.breakdown && (
                    <div className="space-y-1">
                      {Object.values(credibility.breakdown).map((item) => (
                        <div key={item.label} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-28 flex-shrink-0 truncate">{item.label}</span>
                          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/60 transition-all"
                              style={{ width: `${Math.round((item.points / item.max) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-medium text-muted-foreground w-8 text-right">{item.points}/{item.max}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Separator className="my-4" />

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                <div>
                  <div className="text-lg font-bold text-primary">{credibility?.totalCompletedDeals || 0}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">Deals done</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{endorsements?.length || 0}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">Endorsements</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{profileData.listings?.length || 0}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">Listings</div>
                </div>
              </div>

              {/* Response time + completion rate */}
              {(responseTimeStr || completionRatePct > 0) && (
                <div className="space-y-2 mb-4">
                  {responseTimeStr && (
                    <div className="flex items-center gap-2 text-sm" data-testid="stat-response-time">
                      <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">Responds</span>
                      <span className="font-medium ml-auto">{responseTimeStr}</span>
                    </div>
                  )}
                  {completionRatePct > 0 && (
                    <div className="flex items-center gap-2 text-sm" data-testid="stat-completion-rate">
                      <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">Completion</span>
                      <span className="font-medium ml-auto">{completionRatePct}%</span>
                    </div>
                  )}
                </div>
              )}

              {/* Activity insights — own profile only */}
              {isOwnProfile && activityStats && (
                <div className="mb-4 rounded-xl border bg-gradient-to-br from-bareter-teal/5 to-background p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Your Listing Insights</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-base font-bold text-bareter-teal">{activityStats.totalViews.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground">Total Views</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-bareter-teal">{activityStats.totalLikes}</div>
                      <div className="text-[10px] text-muted-foreground">Likes</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-bareter-teal">{activityStats.totalProposals}</div>
                      <div className="text-[10px] text-muted-foreground">Proposals</div>
                    </div>
                  </div>
                  {activityStats.topListing && (
                    <div className="text-[11px] text-muted-foreground pt-1 border-t">
                      Top listing: <span className="font-semibold text-foreground">{activityStats.topListing.title}</span> · {activityStats.topListing.viewCount} views
                    </div>
                  )}
                </div>
              )}

              {/* Verification tier ladder */}
              {(() => {
                const isKYB = profileData.kybStatus === "APPROVED";
                const isKYC = profileData.kycStatus === "APPROVED";
                const isPhone = !!(profileData as any).phoneVerified;
                const isEmail = !!(profileData as any).emailVerified;
                const tiers = [
                  { done: isEmail || isPhone, label: "Basic", desc: "Email or phone verified", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800" },
                  { done: isPhone, label: "Trusted", desc: "WhatsApp verified", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" },
                  { done: isKYC, label: "Verified", desc: "Identity verified", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800" },
                  { done: isKYB, label: "Business", desc: "Business verified", color: "text-bareter-teal dark:text-bareter-teal", bg: "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800" },
                ];
                const highest = [...tiers].reverse().find(t => t.done);
                if (!highest) return null;
                return (
                  <div className={`mb-4 rounded-lg border px-3 py-2 flex items-center gap-2 ${highest.bg}`}>
                    <ShieldCheck className={`h-4 w-4 flex-shrink-0 ${highest.color}`} />
                    <div>
                      <span className={`text-xs font-bold ${highest.color}`}>{highest.label}</span>
                      <span className="text-[11px] text-muted-foreground ms-1.5">{highest.desc}</span>
                    </div>
                    <div className="ms-auto flex items-center gap-1">
                      {tiers.map((t) => (
                        <div key={t.label} className={`h-1.5 w-5 rounded-full ${t.done ? "bg-current" : "bg-muted"} ${t.color}`} />
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-3 text-sm">
                {profileData.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span data-testid="text-location">{profileData.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span>Member since {memberSince}</span>
                </div>
                {lastActiveLabel && !isOwnProfile && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4 flex-shrink-0" />
                    <span>{lastActiveLabel}</span>
                  </div>
                )}
                {profileData.showEmail && profileData.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{profileData.email}</span>
                  </div>
                )}
                {profileData.showPhone && profileData.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span>{profileData.phone}</span>
                  </div>
                )}
                {profileData.website && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="h-4 w-4 flex-shrink-0" />
                    <a href={profileData.website} target="_blank" rel="noopener noreferrer" className="truncate hover:text-primary">
                      {profileData.website.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}
              </div>

              {(socialLinks.instagram || socialLinks.linkedin || socialLinks.twitter || socialLinks.tiktok || socialLinks.youtube || socialLinks.snapchat) && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-center gap-4 flex-wrap">
                    {socialLinks.instagram && (
                      <a href={ensureHttps(socialLinks.instagram)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors" data-testid="link-instagram" title="Instagram">
                        <SiInstagram className="h-5 w-5" />
                      </a>
                    )}
                    {socialLinks.tiktok && (
                      <a href={ensureHttps(socialLinks.tiktok)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-tiktok" title="TikTok">
                        <SiTiktok className="h-5 w-5" />
                      </a>
                    )}
                    {socialLinks.youtube && (
                      <a href={ensureHttps(socialLinks.youtube)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-red-500 transition-colors" data-testid="link-youtube" title="YouTube">
                        <SiYoutube className="h-5 w-5" />
                      </a>
                    )}
                    {socialLinks.snapchat && (
                      <a href={ensureHttps(socialLinks.snapchat)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-yellow-400 transition-colors" data-testid="link-snapchat" title="Snapchat">
                        <SiSnapchat className="h-5 w-5" />
                      </a>
                    )}
                    {socialLinks.linkedin && (
                      <a href={ensureHttps(socialLinks.linkedin)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-blue-600 transition-colors" data-testid="link-linkedin" title="LinkedIn">
                        <SiLinkedin className="h-5 w-5" />
                      </a>
                    )}
                    {socialLinks.twitter && (
                      <a href={ensureHttps(socialLinks.twitter)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-twitter" title="X / Twitter">
                        <SiX className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                </>
              )}

              {!isOwnProfile && currentUser && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <Button
                      className="w-full gap-2"
                      onClick={() => setShowProposeDialog(true)}
                      data-testid="button-propose-trade-profile"
                      disabled={!profileData.listings || profileData.listings.length === 0}
                    >
                      <Handshake className="h-4 w-4" />
                      Propose a Barter
                    </Button>
                    {(!profileData.listings || profileData.listings.length === 0) && (
                      <p className="text-xs text-center text-muted-foreground">This user has no active listings to propose on</p>
                    )}
                    <Link href={`/inbox?userId=${profileData.id}`}>
                      <Button variant="outline" className="w-full gap-2" data-testid="button-message-user">
                        <MessageCircle className="h-4 w-4" />
                        Send Message
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => followMutation.mutate()}
                      disabled={followMutation.isPending}
                      data-testid="button-follow-user"
                    >
                      {followData?.isFollowing ? (
                        <><UserMinus className="h-4 w-4" />Unfollow</>
                      ) : (
                        <><UserPlus className="h-4 w-4" />Follow</>
                      )}
                    </Button>
                    <Separator className="my-1" />
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 gap-1.5 text-muted-foreground hover:text-destructive"
                        onClick={() => setShowReportUser(true)}
                        data-testid="button-report-user"
                      >
                        <Flag className="h-3.5 w-3.5" />
                        Report
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`flex-1 gap-1.5 ${blockData?.isBlocked ? "text-destructive hover:text-destructive/80" : "text-muted-foreground hover:text-destructive"}`}
                        onClick={() => blockMutation.mutate()}
                        disabled={blockMutation.isPending}
                        data-testid="button-block-user"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        {blockData?.isBlocked ? "Unblock" : "Block"}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {!currentUser && (
                <>
                  <Separator className="my-4" />
                  <Link href="/login">
                    <Button className="w-full gap-2" data-testid="button-login-to-trade">
                      <Handshake className="h-4 w-4" />
                      Sign in to Barter
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right main column */}
        <div className="lg:col-span-2 space-y-6">
          {profileData.bio && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  About
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-line leading-relaxed" data-testid="text-bio">
                  {profileData.bio}
                </p>
              </CardContent>
            </Card>
          )}

          {(whatIOffer.length > 0 || whatINeed.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              {whatIOffer.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-green-600 dark:text-green-400">
                      <Package className="h-4 w-4" />
                      What They Offer
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {whatIOffer.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-2">
                          <span className="text-sm">{item.name}</span>
                          <Badge variant="outline" className="text-xs">
                            AED {item.value.toLocaleString()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {whatINeed.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <ShoppingCart className="h-4 w-4" />
                      What They Need
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {whatINeed.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-2">
                          <span className="text-sm">{item.name}</span>
                          <Badge variant="outline" className="text-xs">
                            AED {item.value.toLocaleString()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Endorsements section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ThumbsUp className="h-5 w-5" />
                  Skill Endorsements
                  {endorsements && endorsements.length > 0 && (
                    <Badge variant="secondary">{endorsements.length}</Badge>
                  )}
                </CardTitle>
                {!isOwnProfile && currentUser && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setShowEndorseInput(!showEndorseInput)}
                    data-testid="button-endorse-toggle"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Endorse
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Endorse input */}
              {showEndorseInput && (
                <div className="flex gap-2 p-3 rounded-lg bg-muted/50 border" data-testid="endorse-input-form">
                  <Input
                    placeholder="e.g. Web Design, Logistics, Catering..."
                    value={endorseSkill}
                    onChange={(e) => setEndorseSkill(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && endorseSkill.trim()) {
                        endorseMutation.mutate(endorseSkill.trim());
                      }
                    }}
                    className="flex-1"
                    data-testid="input-endorse-skill"
                  />
                  <Button
                    size="sm"
                    disabled={!endorseSkill.trim() || endorseMutation.isPending}
                    onClick={() => endorseSkill.trim() && endorseMutation.mutate(endorseSkill.trim())}
                    data-testid="button-endorse-submit"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowEndorseInput(false); setEndorseSkill(""); }}
                    data-testid="button-endorse-cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Quick-endorse existing skills */}
              {!isOwnProfile && currentUser && Object.keys(endorsementsBySkill).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(endorsementsBySkill).map(([skill, list]) => {
                    const alreadyEndorsed = list.some(e => e.fromUserId === currentUser.id);
                    return (
                      <button
                        key={skill}
                        onClick={() => !alreadyEndorsed && endorseMutation.mutate(skill)}
                        disabled={alreadyEndorsed || endorseMutation.isPending}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors ${
                          alreadyEndorsed
                            ? "bg-primary/10 border-primary/30 text-primary cursor-default"
                            : "bg-background border-border hover:bg-muted cursor-pointer"
                        }`}
                        data-testid={`quick-endorse-${skill}`}
                      >
                        <ThumbsUp className="h-3 w-3" />
                        {skill}
                        <span className="font-semibold">{list.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Endorsements grouped by skill */}
              {Object.keys(endorsementsBySkill).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(endorsementsBySkill).map(([skill, list]) => (
                    <div key={skill} className="p-3 rounded-md bg-muted/50" data-testid={`endorsement-skill-${skill}`}>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">{skill}</span>
                        </div>
                        <Badge variant="secondary">{list.length} endorsement{list.length !== 1 ? "s" : ""}</Badge>
                      </div>
                      <div className="flex -space-x-2">
                        {list.slice(0, 6).map((e) => (
                          <Avatar key={e.id} className="h-7 w-7 border-2 border-background">
                            <AvatarImage src={e.fromUser?.avatarUrl || undefined} />
                            <AvatarFallback className="text-[8px]">{e.fromUser?.fullName?.charAt(0) || "U"}</AvatarFallback>
                          </Avatar>
                        ))}
                        {list.length > 6 && (
                          <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium">
                            +{list.length - 6}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <ThumbsUp className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No endorsements yet</p>
                  {!isOwnProfile && currentUser && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Be the first to endorse a skill
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reviews */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Star className="h-5 w-5" />
                Reviews {reviewsData?.reviewCount ? `(${reviewsData.reviewCount})` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!reviewsData || reviewsData.reviews.length === 0 ? (
                <div className="text-center py-6">
                  <Star className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No reviews yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviewsData.reviews.map((review) => (
                    <div key={review.id} className="border-b last:border-0 pb-4 last:pb-0">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage src={review.reviewer.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-xs">{review.reviewer.fullName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-semibold">{review.reviewer.fullName}</span>
                            <StarRating value={review.rating} readonly size="sm" />
                            <span className="text-xs text-muted-foreground">
                              {new Date(review.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          {review.comment && (
                            <p className="text-sm text-muted-foreground">{review.comment}</p>
                          )}
                          {review.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {review.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 h-4">{tag}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Portfolio gallery */}
          {hasPortfolio && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Portfolio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {portfolioItems && portfolioItems.length > 0
                    ? portfolioItems.map((item) => (
                      <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted group" data-testid={`portfolio-item-${item.id}`}>
                        {item.mediaType === "video" ? (
                          <video src={assetUrl(item.mediaUrl)} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                        ) : (
                          <img src={assetUrl(item.mediaUrl)} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-white text-xs font-medium truncate">{item.title}</p>
                          {item.category && (
                            <Badge variant="secondary" className="text-[10px] mt-0.5">{item.category}</Badge>
                          )}
                        </div>
                      </div>
                    ))
                    : (profileData.portfolioImages as string[] || []).map((img, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden bg-muted group" data-testid={`portfolio-legacy-${i}`}>
                        <img src={assetUrl(img)} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      </div>
                    ))
                  }
                </div>
              </CardContent>
            </Card>
          )}

          {/* Active listings */}
          {profileData.listings && profileData.listings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5" />
                  Active Listings ({profileData.listings.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
                  {profileData.listings.map((listing) => {
                    const userForCard: User = { ...profileData, password: "" };
                    return (
                      <BrandListingCard
                        key={listing.id}
                        listing={{ ...listing, user: userForCard }}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {(!profileData.listings || profileData.listings.length === 0) && (
            <Card>
              <CardContent className="py-10 text-center">
                <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-medium mb-1">No active listings</h3>
                <p className="text-sm text-muted-foreground">
                  This user hasn't posted any listings yet.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ReportModal
        open={showReportUser}
        onOpenChange={setShowReportUser}
        targetType="user"
        targetId={profileData.id}
      />

      {/* Propose a Barter — pick which of their listings to propose on */}
      <Dialog open={showProposeDialog} onOpenChange={setShowProposeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Propose a Barter</DialogTitle>
            <p className="text-sm text-muted-foreground">Choose which listing of {profileData?.fullName?.split(" ")[0] || "theirs"} you'd like to barter on</p>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(profileData?.listings || []).map((listing) => (
              <button
                key={listing.id}
                onClick={() => { setShowProposeDialog(false); navigate(`/listings/${listing.id}`); }}
                className="w-full text-left flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                {listing.images?.[0] ? (
                  <img src={assetUrl(listing.images[0] as string)} alt={listing.title} className="h-12 w-12 rounded-md object-cover flex-shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{listing.title}</p>
                  <p className="text-xs text-muted-foreground">AED {parseFloat(listing.retailValue as string || "0").toLocaleString()}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
