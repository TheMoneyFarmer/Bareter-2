import { useState } from "react";
import { Link, useParams } from "wouter";
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
} from "lucide-react";
import { VerifiedBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import { SiInstagram, SiLinkedin, SiX } from "react-icons/si";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Listing, Rating, User } from "@shared/schema";
import { ListingCard as BrandListingCard } from "@/components/ListingCard";
import type { ExchangeItem } from "@shared/schema";

interface PublicUserData extends Omit<User, "password"> {
  avgRating: number;
  totalRatings: number;
  ratings: Rating[];
  listings: Listing[];
}

interface CredibilityData {
  credibilityScore: number;
  completionRate: string;
  avgResponseTime: number;
  totalCompletedDeals: number;
  endorsementCount: number;
  ratingAvg: number;
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
  const [endorseSkill, setEndorseSkill] = useState("");
  const [showEndorseInput, setShowEndorseInput] = useState(false);

  const { data: profileData, isLoading } = useQuery<PublicUserData>({
    queryKey: ["/api/users", id],
    enabled: !!currentUser,
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
    <div className="container px-4 py-8 mx-auto max-w-5xl">
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
                </div>
                {profileData.businessName && (
                  <p className="text-muted-foreground flex items-center gap-1" data-testid="text-business-name">
                    <Building2 className="h-4 w-4" />
                    {profileData.businessName}
                  </p>
                )}
              </div>

              {profileData.avgRating > 0 && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="flex items-center gap-1">
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                    <span className="font-bold text-lg">{profileData.avgRating.toFixed(1)}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    ({profileData.totalRatings} {profileData.totalRatings === 1 ? "review" : "reviews"})
                  </span>
                </div>
              )}

              {/* Credibility score badge */}
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
                    <span className="text-xs text-muted-foreground">Credibility</span>
                  </div>
                  <Progress value={credibility.credibilityScore} className="h-1.5" />
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

              {(socialLinks.instagram || socialLinks.linkedin || socialLinks.twitter) && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-center gap-3">
                    {socialLinks.instagram && (
                      <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" data-testid="link-instagram">
                        <SiInstagram className="h-5 w-5" />
                      </a>
                    )}
                    {socialLinks.linkedin && (
                      <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" data-testid="link-linkedin">
                        <SiLinkedin className="h-5 w-5" />
                      </a>
                    )}
                    {socialLinks.twitter && (
                      <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" data-testid="link-twitter">
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
                    <Button className="w-full gap-2" data-testid="button-propose-trade-profile">
                      <Handshake className="h-4 w-4" />
                      Propose a Barter
                    </Button>
                    <Link href={`/inbox?userId=${profileData.id}`}>
                      <Button variant="outline" className="w-full gap-2" data-testid="button-message-user">
                        <MessageCircle className="h-4 w-4" />
                        Send Message
                      </Button>
                    </Link>
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
          {profileData.ratings && profileData.ratings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5" />
                  Reviews ({profileData.totalRatings})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {profileData.ratings.map((rating) => (
                  <div key={rating.id} className="border-b last:border-0 pb-4 last:pb-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < rating.score
                                ? "text-yellow-500 fill-yellow-500"
                                : "text-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {rating.createdAt ? new Date(rating.createdAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                    {rating.review && (
                      <p className="text-sm text-muted-foreground">{rating.review}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

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
                          <video src={item.mediaUrl} className="w-full h-full object-cover" muted />
                        ) : (
                          <img src={item.mediaUrl} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
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
                        <img src={img} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
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
    </div>
  );
}
