import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  MapPin,
  Package,
  ShoppingCart,
  Eye,
  Shield,
  ArrowLeftRight,
  Star,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface StaticListing {
  id: string;
  type: "offer" | "request";
  title: string;
  description: string;
  categories: string[];
  retailValue: string;
  location: string;
  tags: string[];
  viewCount: number;
  exchangeItems: { name: string; isPriority: boolean }[];
  wantedCategories: string[];
  openToOffers: boolean;
  user: {
    fullName: string;
    businessName: string | null;
    isVerified: boolean;
    initials: string;
  };
}

const STATIC_LISTINGS: StaticListing[] = [
  {
    id: "demo-1",
    type: "offer",
    title: "5 Nights Luxury Suite at Marina Bay Hotel",
    description: "Premium luxury suite accommodation in our 5-star Marina Bay Hotel. Includes breakfast, spa access, and airport transfers. Perfect for hosting VIP clients or a luxurious getaway.",
    categories: ["Hospitality", "Events"],
    retailValue: "15000",
    location: "Dubai",
    tags: ["luxury", "hotel", "accommodation", "spa"],
    viewCount: 234,
    exchangeItems: [
      { name: "Social Media Content", isPriority: true },
      { name: "Photography", isPriority: true },
      { name: "Video Production", isPriority: false },
    ],
    wantedCategories: ["Marketing", "Photography"],
    openToOffers: true,
    user: {
      fullName: "Layla Al-Farsi",
      businessName: "The Azure Resort & Spa",
      isVerified: true,
      initials: "LA",
    },
  },
  {
    id: "demo-2",
    type: "offer",
    title: "Full Brand Identity & Rebrand Package",
    description: "Complete brand identity design including logo, typography, color palette, brand guidelines, business cards, and social media kit. 10+ years experience with premium brands.",
    categories: ["Design", "Marketing"],
    retailValue: "15000",
    location: "Dubai",
    tags: ["branding", "design", "logo", "identity"],
    viewCount: 189,
    exchangeItems: [
      { name: "SaaS Tools", isPriority: true },
      { name: "Software Licenses", isPriority: false },
    ],
    wantedCategories: ["Technology", "SaaS"],
    openToOffers: true,
    user: {
      fullName: "Zara Ahmed",
      businessName: "Zara Design Studio",
      isVerified: true,
      initials: "ZA",
    },
  },
  {
    id: "demo-3",
    type: "offer",
    title: "Professional Food Photography Package",
    description: "Complete food photography session including styling, editing, and delivery. Perfect for restaurants, cafes, and food brands looking for stunning menu and social media visuals.",
    categories: ["Photography", "Food"],
    retailValue: "4000",
    location: "Dubai",
    tags: ["food", "photography", "restaurant", "menu"],
    viewCount: 156,
    exchangeItems: [
      { name: "Dining Credits", isPriority: true },
      { name: "Catering Services", isPriority: false },
    ],
    wantedCategories: ["Food", "Hospitality"],
    openToOffers: false,
    user: {
      fullName: "Nina Chen",
      businessName: "NinaChen Studios",
      isVerified: true,
      initials: "NC",
    },
  },
  {
    id: "demo-4",
    type: "offer",
    title: "12-Month Enterprise SaaS License",
    description: "Full enterprise license for our cloud-based project management and CRM platform. Includes unlimited users, premium support, custom integrations, and dedicated account manager.",
    categories: ["SaaS", "Technology"],
    retailValue: "15000",
    location: "Abu Dhabi",
    tags: ["software", "saas", "enterprise", "crm"],
    viewCount: 142,
    exchangeItems: [
      { name: "Full Rebrand", isPriority: true },
      { name: "UI/UX Design", isPriority: true },
      { name: "Marketing Services", isPriority: false },
    ],
    wantedCategories: ["Design", "Marketing"],
    openToOffers: true,
    user: {
      fullName: "James Mitchell",
      businessName: "CloudFlow Technologies",
      isVerified: true,
      initials: "JM",
    },
  },
  {
    id: "demo-5",
    type: "offer",
    title: "2 Custom Bespoke Suits with Fittings",
    description: "Two handcrafted bespoke suits using premium Italian fabrics. Includes personal fitting sessions, custom monogramming, and complimentary alterations for one year.",
    categories: ["Fashion"],
    retailValue: "10000",
    location: "Dubai",
    tags: ["fashion", "suits", "bespoke", "luxury", "tailoring"],
    viewCount: 198,
    exchangeItems: [
      { name: "Model Services", isPriority: true },
      { name: "Photography", isPriority: false },
    ],
    wantedCategories: ["Modeling", "Photography"],
    openToOffers: true,
    user: {
      fullName: "Marco Bellini",
      businessName: "Bellini Bespoke Tailoring",
      isVerified: true,
      initials: "MB",
    },
  },
  {
    id: "demo-6",
    type: "request",
    title: "Looking for Digital Ad Campaign Management",
    description: "Seeking an experienced digital marketing agency to run Google Ads and Meta campaigns for our dental clinic. Budget of AED 5,000/month. Can offer dental treatments in exchange.",
    categories: ["Marketing", "Health & Wellness"],
    retailValue: "5000",
    location: "Dubai",
    tags: ["marketing", "ads", "google", "meta", "dental"],
    viewCount: 87,
    exchangeItems: [
      { name: "Teeth Whitening", isPriority: true },
      { name: "Dental Cleaning", isPriority: false },
      { name: "Smile Makeover Consultation", isPriority: false },
    ],
    wantedCategories: ["Marketing"],
    openToOffers: false,
    user: {
      fullName: "Dr. Amira Hassan",
      businessName: "Pearl Smile Dental Clinic",
      isVerified: true,
      initials: "AH",
    },
  },
  {
    id: "demo-7",
    type: "offer",
    title: "Premium Fine Dining Experience for 10 Guests",
    description: "An exclusive 7-course tasting menu dining experience at our award-winning restaurant. Includes wine pairing, private dining area, and personalized service. Perfect for client entertainment.",
    categories: ["Food", "Hospitality"],
    retailValue: "8000",
    location: "Dubai",
    tags: ["dining", "restaurant", "fine dining", "catering"],
    viewCount: 112,
    exchangeItems: [
      { name: "Food Photography", isPriority: true },
      { name: "Menu Design", isPriority: true },
      { name: "Interior Photography", isPriority: false },
    ],
    wantedCategories: ["Photography", "Design"],
    openToOffers: true,
    user: {
      fullName: "Chef Khalid Al-Rashid",
      businessName: "Saffron & Sage Restaurant",
      isVerified: true,
      initials: "KR",
    },
  },
  {
    id: "demo-8",
    type: "offer",
    title: "Social Media Ad Campaign & Strategy Package",
    description: "Complete digital marketing package including social media strategy, content calendar, paid ad campaign setup and management across Google, Meta, and TikTok for 3 months.",
    categories: ["Marketing", "Technology"],
    retailValue: "8000",
    location: "Dubai",
    tags: ["marketing", "social media", "ads", "strategy"],
    viewCount: 167,
    exchangeItems: [
      { name: "Health Services", isPriority: true },
      { name: "Wellness Treatments", isPriority: false },
    ],
    wantedCategories: ["Health & Wellness"],
    openToOffers: true,
    user: {
      fullName: "Ryan Thompson",
      businessName: "Spark Digital Marketing",
      isVerified: true,
      initials: "RT",
    },
  },
];

export function BrowsePublicPage() {
  const [search, setSearch] = useState("");

  const filteredListings = STATIC_LISTINGS.filter((listing) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      listing.title.toLowerCase().includes(s) ||
      listing.description.toLowerCase().includes(s) ||
      listing.categories.some((c) => c.toLowerCase().includes(s)) ||
      listing.user.fullName.toLowerCase().includes(s) ||
      (listing.user.businessName || "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="container px-4 py-8 mx-auto max-w-7xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-3" data-testid="text-browse-title">
          Browse the Marketplace
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
          Discover what UAE businesses are offering and looking for. Sign up to start trading.
        </p>
        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search listings, categories, or businesses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-public"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{filteredListings.length}</span> listings available
        </p>
        <Link href="/register">
          <Button className="gap-2" data-testid="button-join-to-trade">
            <Sparkles className="h-4 w-4" />
            Join to Start Trading
          </Button>
        </Link>
      </div>

      {filteredListings.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-2">No listings match your search</h3>
            <p className="text-muted-foreground mb-4">
              Try different keywords or clear your search
            </p>
            <Button variant="outline" onClick={() => setSearch("")} data-testid="button-clear-search">
              Clear Search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredListings.map((listing) => (
            <Card key={listing.id} className="h-full hover-elevate cursor-pointer overflow-hidden" data-testid={`card-listing-${listing.id}`}>
              <Link href="/register">
                <CardContent className="p-0">
                  <div className="relative h-44 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                    {listing.type === "offer" ? (
                      <Package className="h-14 w-14 text-primary/30" />
                    ) : (
                      <ShoppingCart className="h-14 w-14 text-primary/30" />
                    )}
                    <Badge
                      variant={listing.type === "offer" ? "default" : "secondary"}
                      className="absolute top-3 left-3"
                    >
                      {listing.type === "offer" ? (
                        <><Package className="h-3 w-3 mr-1" /> Offer</>
                      ) : (
                        <><ShoppingCart className="h-3 w-3 mr-1" /> Request</>
                      )}
                    </Badge>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold line-clamp-1 mb-1">{listing.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {listing.description}
                    </p>

                    {(listing.exchangeItems.length > 0 || listing.wantedCategories.length > 0) && (
                      <div className="mb-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
                        <div className="flex items-center gap-1 text-xs text-primary mb-1.5">
                          <ArrowLeftRight className="h-3 w-3" />
                          <span className="font-medium">Wants in exchange:</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {listing.exchangeItems
                            .filter((item) => item.isPriority)
                            .slice(0, 2)
                            .map((item) => (
                              <Badge key={item.name} variant="default" className="text-[10px] px-1.5 py-0 gap-0.5">
                                <Star className="h-2 w-2 fill-current" />
                                {item.name}
                              </Badge>
                            ))}
                          {listing.exchangeItems
                            .filter((item) => !item.isPriority)
                            .slice(0, 1)
                            .map((item) => (
                              <Badge key={item.name} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {item.name}
                              </Badge>
                            ))}
                          {(listing.exchangeItems.length + listing.wantedCategories.length) > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{listing.exchangeItems.length + listing.wantedCategories.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-primary">
                        AED {parseFloat(listing.retailValue).toLocaleString()}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        {listing.viewCount}
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-0 border-t">
                  <div className="flex items-center gap-2 w-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {listing.user.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium truncate">
                          {listing.user.fullName}
                        </span>
                        {listing.user.isVerified && (
                          <Shield className="h-3 w-3 text-primary flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{listing.location}</span>
                      </div>
                    </div>
                  </div>
                </CardFooter>
              </Link>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-12 text-center">
        <Card>
          <CardContent className="py-10">
            <h2 className="text-2xl font-bold mb-3">Ready to Start Trading?</h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Create your free account to browse all listings, contact sellers, and propose trades with verified UAE businesses.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href="/register">
                <Button size="lg" className="gap-2" data-testid="button-create-account">
                  Create Free Account
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button size="lg" variant="outline" data-testid="button-learn-more">
                  Learn How It Works
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
