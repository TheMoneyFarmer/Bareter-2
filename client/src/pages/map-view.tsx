import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MapPin,
  Package,
  ShoppingCart,
  ArrowLeftRight,
  Filter,
  X,
  Crown,
} from "lucide-react";
import { CATEGORIES, type ListingWithUser } from "@shared/schema";
import { assetUrl } from "@/lib/queryClient";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fix Leaflet default marker icon issue with Vite (use bundled images, not CDN)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const UAE_CITIES: Record<string, [number, number]> = {
  "Dubai": [25.2048, 55.2708],
  "Abu Dhabi": [24.4539, 54.3773],
  "Sharjah": [25.3463, 55.4209],
  "Ajman": [25.4052, 55.5136],
  "Ras Al Khaimah": [25.7895, 55.9432],
  "Fujairah": [25.1288, 56.3265],
  "Umm Al Quwain": [25.5647, 55.5552],
  "Al Ain": [24.2000, 55.7333],
  "Home": [25.2048, 55.2708],
};

const UAE_CENTER: [number, number] = [24.4539, 54.3773];

function formatValue(v: string | number) {
  const n = parseFloat(String(v));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}

export function MapViewPage() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [mapType, setMapType] = useState<"all" | "offer" | "request">("all");

  const { data: listings, isLoading } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/listings"],
  });

  const filtered = useMemo(() => {
    return (listings || []).filter((l) => {
      if (mapType !== "all" && l.type !== mapType) return false;
      if (selectedCategories.length > 0) {
        const cats = (l.categories || []) as string[];
        if (!cats.some((c) => selectedCategories.includes(c))) return false;
      }
      return true;
    });
  }, [listings, mapType, selectedCategories]);

  const byCity = useMemo(() => {
    const map: Record<string, ListingWithUser[]> = {};
    filtered.forEach((l) => {
      const city = (l.location || "Dubai").split(",")[0].trim();
      const key = UAE_CITIES[city] ? city : "Dubai";
      if (!map[key]) map[key] = [];
      map[key].push(l);
    });
    return map;
  }, [filtered]);

  const cityListings = selectedCity ? (byCity[selectedCity] || []) : [];

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] pb-20 md:pb-0">
      {/* Filters bar */}
      <div className="flex-shrink-0 bg-background border-b px-4 py-2 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex gap-1.5">
            {(["all", "offer", "request"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMapType(t)}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  mapType === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                data-testid={`map-filter-type-${t}`}
              >
                {t === "offer" && <Package className="h-3 w-3" />}
                {t === "request" && <ShoppingCart className="h-3 w-3" />}
                {t === "all" && <ArrowLeftRight className="h-3 w-3" />}
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1) + "s"}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border" />
          <ScrollArea className="w-auto">
            <div className="flex gap-1.5 pb-0.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategories.includes(cat)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  data-testid={`map-filter-cat-${cat}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </ScrollArea>
          {(selectedCategories.length > 0 || mapType !== "all") && (
            <button
              onClick={() => { setSelectedCategories([]); setMapType("all"); }}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 transition-colors flex-shrink-0"
              data-testid="map-clear-filters"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Map + Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative" data-testid="map-container">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
              <div className="text-center">
                <MapPin className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
          ) : (
            <MapContainer
              center={UAE_CENTER}
              zoom={7}
              style={{ height: "100%", width: "100%" }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {Object.entries(byCity).map(([city, cityL]) => {
                const coords = UAE_CITIES[city];
                if (!coords) return null;
                const isSelected = selectedCity === city;
                const count = cityL.length;
                return (
                  <CircleMarker
                    key={city}
                    center={coords}
                    radius={Math.min(8 + count * 3, 30)}
                    pathOptions={{
                      color: isSelected ? "#0f766e" : "#14b8a6",
                      fillColor: isSelected ? "#0f766e" : "#14b8a6",
                      fillOpacity: 0.8,
                      weight: 2,
                    }}
                    eventHandlers={{
                      click: () => setSelectedCity(isSelected ? null : city),
                    }}
                    data-testid={`map-marker-${city}`}
                  >
                    <Popup>
                      <div className="text-center p-1">
                        <p className="font-semibold text-sm">{city}</p>
                        <p className="text-xs text-gray-600">{count} listing{count !== 1 ? "s" : ""}</p>
                        <button
                          onClick={() => setSelectedCity(city)}
                          className="mt-1 text-xs text-teal-600 hover:underline font-medium"
                        >
                          View listings →
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          )}

          {/* Stats overlay */}
          <div className="absolute bottom-4 left-4 z-[1000] bg-background/95 backdrop-blur-sm rounded-lg border shadow-sm px-3 py-2" data-testid="map-stats">
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-full bg-primary" />
                <span className="text-muted-foreground">City clusters</span>
              </div>
              <div className="text-muted-foreground">
                <span className="font-semibold text-foreground">{filtered.length}</span> listings
              </div>
              {Object.keys(byCity).length > 0 && (
                <div className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{Object.keys(byCity).length}</span> cities
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop sidebar */}
        {selectedCity && cityListings.length > 0 && (
          <div className="hidden md:flex w-80 flex-shrink-0 border-l bg-background flex-col" data-testid="map-sidebar">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" />
                  {selectedCity}
                </h3>
                <p className="text-xs text-muted-foreground">{cityListings.length} listing{cityListings.length !== 1 ? "s" : ""}</p>
              </div>
              <button
                onClick={() => setSelectedCity(null)}
                className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                data-testid="map-sidebar-close"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {cityListings.map((listing) => (
                  <Link key={listing.id} href={`/listings/${listing.id}`}>
                    <Card className="hover-elevate cursor-pointer" data-testid={`map-listing-card-${listing.id}`}>
                      <CardContent className="p-3">
                        <div className="flex gap-2">
                          {listing.images && listing.images[0] ? (
                            <img
                              src={assetUrl(listing.images[0])}
                              alt={listing.title}
                              className="h-14 w-14 rounded-md object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                              <Package className="h-5 w-5 text-muted-foreground/50" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-1 mb-0.5">
                              <p className="text-xs font-medium line-clamp-2 flex-1">{listing.title}</p>
                              {listing.isFeatured && (
                                <Crown className="h-3 w-3 text-yellow-500 flex-shrink-0 mt-0.5" />
                              )}
                            </div>
                            <p className="text-xs font-bold text-primary">
                              AED {formatValue(listing.retailValue as string)}
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              <Badge
                                variant={listing.type === "offer" ? "default" : "secondary"}
                                className="text-[9px] h-4 px-1.5"
                              >
                                {listing.type === "offer" ? "Offer" : "Request"}
                              </Badge>
                              {((listing.categories || []) as string[])[0] && (
                                <span className="text-[9px] text-muted-foreground truncate">
                                  {((listing.categories || []) as string[])[0]}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Mobile bottom sheet for selected city */}
      {selectedCity && cityListings.length > 0 && (
        <div
          className="md:hidden fixed bottom-20 inset-x-0 z-[1000] bg-background rounded-t-2xl border-t shadow-2xl max-h-[55vh] flex flex-col"
          data-testid="map-mobile-sheet"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" />
                {selectedCity}
              </h3>
              <p className="text-xs text-muted-foreground">{cityListings.length} listing{cityListings.length !== 1 ? "s" : ""}</p>
            </div>
            <button
              onClick={() => setSelectedCity(null)}
              className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
              data-testid="map-mobile-sheet-close"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 grid grid-cols-1 gap-2">
              {cityListings.slice(0, 6).map((listing) => (
                <Link key={listing.id} href={`/listings/${listing.id}`}>
                  <div className="flex gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors active:bg-muted" data-testid={`map-mobile-listing-${listing.id}`}>
                    {listing.images && listing.images[0] ? (
                      <img
                        src={assetUrl(listing.images[0])}
                        alt={listing.title}
                        className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium truncate flex-1">{listing.title}</p>
                        {listing.isFeatured && <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />}
                      </div>
                      <p className="text-sm font-bold text-primary mt-0.5">AED {formatValue(listing.retailValue as string)}</p>
                    </div>
                  </div>
                </Link>
              ))}
              {cityListings.length > 6 && (
                <p className="text-xs text-center text-muted-foreground py-1">+{cityListings.length - 6} more listings</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
