import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORIES, LOCATIONS, type ListingWithUser } from "@shared/schema";
import {
  Search,
  Filter,
  MapPin,
  Tag,
  ArrowUpDown,
  Shield,
  Package,
  ShoppingCart,
  Eye,
  Sparkles,
  X,
  ArrowLeftRight,
  Star,
} from "lucide-react";
import type { ExchangeItem } from "@shared/schema";

export function BrowsePage() {
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [valueRange, setValueRange] = useState([0, 100000]);
  const [sortBy, setSortBy] = useState<string>("newest");

  const { data: listings, isLoading } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings"],
  });

  const filteredListings = listings?.filter((listing) => {
    if (search) {
      const searchLower = search.toLowerCase();
      if (
        !listing.title.toLowerCase().includes(searchLower) &&
        !listing.description.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }
    if (selectedType !== "all" && listing.type !== selectedType) return false;
    if (selectedCategories.length > 0) {
      const hasCategory = (listing.categories || []).some((c) =>
        selectedCategories.includes(c)
      );
      if (!hasCategory) return false;
    }
    if (selectedLocation !== "all" && listing.location !== selectedLocation) return false;
    if (verifiedOnly && !listing.user?.isVerified) return false;
    const value = parseFloat(listing.retailValue as string);
    if (value < valueRange[0] || value > valueRange[1]) return false;
    return true;
  });

  const sortedListings = [...(filteredListings || [])].sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case "oldest":
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      case "value-high":
        return parseFloat(b.retailValue as string) - parseFloat(a.retailValue as string);
      case "value-low":
        return parseFloat(a.retailValue as string) - parseFloat(b.retailValue as string);
      case "popular":
        return (b.viewCount || 0) - (a.viewCount || 0);
      default:
        return 0;
    }
  });

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedType("all");
    setSelectedCategories([]);
    setSelectedLocation("all");
    setVerifiedOnly(false);
    setValueRange([0, 100000]);
  };

  const hasActiveFilters =
    search ||
    selectedType !== "all" ||
    selectedCategories.length > 0 ||
    selectedLocation !== "all" ||
    verifiedOnly ||
    valueRange[0] > 0 ||
    valueRange[1] < 100000;

  const FilterContent = () => (
    <div className="space-y-6">
      <div>
        <h4 className="font-medium mb-3">Type</h4>
        <div className="flex gap-2">
          <Button
            variant={selectedType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedType("all")}
            data-testid="filter-type-all"
          >
            All
          </Button>
          <Button
            variant={selectedType === "offer" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedType("offer")}
            className="gap-1"
            data-testid="filter-type-offer"
          >
            <Package className="h-3 w-3" />
            Offers
          </Button>
          <Button
            variant={selectedType === "request" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedType("request")}
            className="gap-1"
            data-testid="filter-type-request"
          >
            <ShoppingCart className="h-3 w-3" />
            Requests
          </Button>
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-3">Categories</h4>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Badge
              key={category}
              variant={selectedCategories.includes(category) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleCategory(category)}
              data-testid={`filter-category-${category.toLowerCase()}`}
            >
              {category}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-3">Location</h4>
        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
          <SelectTrigger data-testid="filter-location">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {LOCATIONS.map((location) => (
              <SelectItem key={location} value={location}>
                {location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <h4 className="font-medium mb-3">Value Range (AED)</h4>
        <div className="px-2">
          <Slider
            value={valueRange}
            onValueChange={setValueRange}
            max={100000}
            step={1000}
            className="mb-2"
            data-testid="filter-value-range"
          />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>AED {valueRange[0].toLocaleString()}</span>
            <span>AED {valueRange[1].toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="verified"
          checked={verifiedOnly}
          onCheckedChange={(checked) => setVerifiedOnly(checked as boolean)}
          data-testid="filter-verified"
        />
        <label htmlFor="verified" className="text-sm font-medium cursor-pointer flex items-center gap-1">
          <Shield className="h-4 w-4 text-primary" />
          Verified users only
        </label>
      </div>

      {hasActiveFilters && (
        <Button variant="outline" onClick={clearFilters} className="w-full" data-testid="button-clear-filters">
          <X className="h-4 w-4 mr-2" />
          Clear All Filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="container px-4 py-8 mx-auto max-w-7xl">
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search listings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]" data-testid="select-sort">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="value-high">Highest Value</SelectItem>
              <SelectItem value="value-low">Lowest Value</SelectItem>
              <SelectItem value="popular">Most Popular</SelectItem>
            </SelectContent>
          </Select>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="md:hidden" data-testid="button-filters-mobile">
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2">
                    {selectedCategories.length + (verifiedOnly ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <SheetHeader className="mb-6">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <FilterContent />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="flex gap-8">
        <aside className="hidden md:block w-64 flex-shrink-0">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </h3>
              <FilterContent />
            </CardContent>
          </Card>
        </aside>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-6">
            <p className="text-muted-foreground">
              {isLoading ? (
                "Loading..."
              ) : (
                <>
                  <span className="font-medium text-foreground">{sortedListings.length}</span> listings found
                </>
              )}
            </p>
            <Link href="/create-listing">
              <Button className="gap-2" data-testid="button-create-listing">
                <Sparkles className="h-4 w-4" />
                Create Listing
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-0">
                    <Skeleton className="h-48 rounded-t-lg" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : sortedListings.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No listings found</h3>
                <p className="text-muted-foreground mb-4">
                  Try adjusting your filters or search terms
                </p>
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedListings.map((listing) => (
                <Link key={listing.id} href={`/listings/${listing.id}`}>
                  <Card className="h-full hover-elevate cursor-pointer overflow-hidden" data-testid={`card-listing-${listing.id}`}>
                    <CardContent className="p-0">
                      {listing.images && listing.images.length > 0 ? (
                        <div className="relative h-48 bg-muted">
                          <img
                            src={listing.images[0]}
                            alt={listing.title}
                            className="w-full h-full object-cover"
                          />
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
                      ) : (
                        <div className="relative h-48 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                          {listing.type === "offer" ? (
                            <Package className="h-16 w-16 text-primary/30" />
                          ) : (
                            <ShoppingCart className="h-16 w-16 text-primary/30" />
                          )}
                          <Badge
                            variant={listing.type === "offer" ? "default" : "secondary"}
                            className="absolute top-3 left-3"
                          >
                            {listing.type === "offer" ? "Offer" : "Request"}
                          </Badge>
                        </div>
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold line-clamp-1 mb-1">{listing.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {listing.description}
                        </p>
                        
                        {((listing as any).exchangeItems?.length > 0 || (listing as any).wantedCategories?.length > 0) && (
                          <div className="mb-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
                            <div className="flex items-center gap-1 text-xs text-primary mb-1.5">
                              <ArrowLeftRight className="h-3 w-3" />
                              <span className="font-medium">Wants in exchange:</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {((listing as any).exchangeItems as ExchangeItem[] || [])
                                .filter((item: ExchangeItem) => item.isPriority)
                                .slice(0, 2)
                                .map((item: ExchangeItem) => (
                                  <Badge key={item.name} variant="default" className="text-[10px] px-1.5 py-0 gap-0.5">
                                    <Star className="h-2 w-2 fill-current" />
                                    {item.name}
                                  </Badge>
                                ))}
                              {((listing as any).exchangeItems as ExchangeItem[] || [])
                                .filter((item: ExchangeItem) => !item.isPriority)
                                .slice(0, 2)
                                .map((item: ExchangeItem) => (
                                  <Badge key={item.name} variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {item.name}
                                  </Badge>
                                ))}
                              {((listing as any).wantedCategories as string[] || []).slice(0, 2).map((cat: string) => (
                                <Badge key={cat} variant="outline" className="text-[10px] px-1.5 py-0">
                                  {cat}
                                </Badge>
                              ))}
                              {(((listing as any).exchangeItems?.length || 0) + ((listing as any).wantedCategories?.length || 0)) > 4 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{((listing as any).exchangeItems?.length || 0) + ((listing as any).wantedCategories?.length || 0) - 4} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold text-primary">
                            AED {parseFloat(listing.retailValue as string).toLocaleString()}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Eye className="h-3 w-3" />
                            {listing.viewCount || 0}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="p-4 pt-0 border-t">
                      <div className="flex items-center gap-2 w-full">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={listing.user?.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {listing.user?.fullName?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium truncate">
                              {listing.user?.fullName}
                            </span>
                            {listing.user?.isVerified && (
                              <Shield className="h-3 w-3 text-primary flex-shrink-0" />
                            )}
                          </div>
                          {listing.location && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{listing.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
