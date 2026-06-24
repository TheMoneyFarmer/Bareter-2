import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Zap, MapPin, Package, ShoppingCart } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { API_BASE } from "@/lib/queryClient";

interface InstantMatch {
  id: string;
  title: string;
  description: string;
  categories: string[];
  retailValue: number;
  type: "offer" | "request";
  userId: string;
  userName: string;
  userEmail: string;
  matchScore: number;
  matchReason: string;
  images: string[];
  country: string;
  city: string;
}

interface InstantMatchSheetProps {
  listingId: string;
}

export function InstantMatchSheet({ listingId }: InstantMatchSheetProps) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  const { data: matches, isLoading } = useQuery<InstantMatch[]>({
    queryKey: ["/api/listings/:id/instant-match", listingId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/listings/${listingId}/instant-match`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!listingId,
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full h-11 gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          Find Matches
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Instant Matches
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          {isLoading && (
            <>
              {[0, 1, 2].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <CardContent className="p-0">
                    <Skeleton className="h-36 w-full rounded-none" />
                    <div className="p-3 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-2/3" />
                      <div className="flex gap-2 pt-1">
                        <Skeleton className="h-8 flex-1" />
                        <Skeleton className="h-8 flex-1" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}

          {!isLoading && (!matches || matches.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Zap className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                No matches found yet — check back as more listings join Bareter
              </p>
            </div>
          )}

          {!isLoading && matches && matches.length > 0 && matches.map((match) => (
            <Card key={match.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                {/* Thumbnail */}
                <div className="relative h-36 w-full bg-muted/30 overflow-hidden">
                  {match.images && match.images.length > 0 ? (
                    <img
                      src={match.images[0]}
                      alt={match.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {match.type === "offer" ? (
                        <Package className="h-12 w-12 text-muted-foreground/30" />
                      ) : (
                        <ShoppingCart className="h-12 w-12 text-muted-foreground/30" />
                      )}
                    </div>
                  )}
                  {/* Match score badge */}
                  <div className="absolute top-2 right-2 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {match.matchScore}% match
                  </div>
                </div>

                <div className="p-3 space-y-1.5">
                  {/* Title + type badge */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="font-semibold text-sm leading-tight flex-1 min-w-0 line-clamp-2">
                      {match.title}
                    </p>
                    <Badge
                      variant={match.type === "offer" ? "default" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {match.type === "offer" ? (
                        <><Package className="h-2.5 w-2.5 mr-1" />Offer</>
                      ) : (
                        <><ShoppingCart className="h-2.5 w-2.5 mr-1" />Request</>
                      )}
                    </Badge>
                  </div>

                  {/* Value */}
                  <p className="text-sm font-bold text-bareter-teal">
                    AED {Number(match.retailValue).toLocaleString()}
                  </p>

                  {/* Location */}
                  {(match.city || match.country) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {[match.city, match.country].filter(Boolean).join(", ")}
                    </div>
                  )}

                  {/* Match reason */}
                  {match.matchReason && (
                    <p className="text-xs text-muted-foreground italic line-clamp-2">
                      {match.matchReason}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                      onClick={() => {
                        setOpen(false);
                        navigate(`/listings/${match.id}`);
                      }}
                    >
                      View Listing
                    </Button>
                    <Button
                      size="sm"
                      variant="bareter"
                      className="flex-1 h-8 text-xs"
                      onClick={() => {
                        setOpen(false);
                        navigate(`/listings/${match.id}`);
                      }}
                    >
                      Propose Trade
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
