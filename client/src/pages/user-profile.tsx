import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MapPin,
  Shield,
  Star,
  Package,
  ShoppingCart,
  Eye,
  Calendar,
  Globe,
  Phone,
  Mail,
  Building2,
  Briefcase,
  ArrowLeft,
  ArrowLeftRight,
  ExternalLink,
  Handshake,
  MessageCircle,
} from "lucide-react";
import { VerifiedBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import { SiInstagram, SiLinkedin, SiX } from "react-icons/si";
import { useAuth } from "@/lib/auth";
import type { Listing, Rating, User } from "@shared/schema";
import type { ExchangeItem } from "@shared/schema";

interface PublicUserData extends Omit<User, "password"> {
  avgRating: number;
  totalRatings: number;
  ratings: Rating[];
  listings: Listing[];
}

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();

  const { data: profileData, isLoading } = useQuery<PublicUserData>({
    queryKey: ["/api/users", id],
    enabled: !!currentUser,
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

  return (
    <div className="container px-4 py-8 mx-auto max-w-5xl">
      <Link href="/browse" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to listings
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
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
                <div className="flex items-center gap-2 mb-1">
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

              <Separator className="my-4" />

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
                      Propose a Trade
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
                      Sign in to Trade
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>

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
                  {profileData.listings.map((listing) => (
                    <Link key={listing.id} href={`/listings/${listing.id}`}>
                      <Card className="h-full hover-elevate cursor-pointer overflow-hidden" data-testid={`card-user-listing-${listing.id}`}>
                        <CardContent className="p-0">
                          <div className="relative h-32 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                            {listing.type === "offer" ? (
                              <Package className="h-10 w-10 text-primary/30" />
                            ) : (
                              <ShoppingCart className="h-10 w-10 text-primary/30" />
                            )}
                            <Badge
                              variant={listing.type === "offer" ? "default" : "secondary"}
                              className="absolute top-2 left-2"
                            >
                              {listing.type === "offer" ? "Offer" : "Request"}
                            </Badge>
                          </div>
                          <div className="p-3">
                            <h4 className="font-medium text-sm line-clamp-1 mb-1">{listing.title}</h4>
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{listing.description}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-primary">
                                AED {parseFloat(listing.retailValue as string).toLocaleString()}
                              </span>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Eye className="h-3 w-3" />
                                {listing.viewCount || 0}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
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

          {profileData.portfolioImages && (profileData.portfolioImages as string[]).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Portfolio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {(profileData.portfolioImages as string[]).map((img, i) => (
                    <div key={i} className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img src={img} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
