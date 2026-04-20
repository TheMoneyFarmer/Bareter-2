import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getCountryByCode } from "@shared/schema";
import { Globe2 } from "lucide-react";

interface GeoLookup {
  country: string;
  countryName: string;
  city: string | null;
  source: string;
}

export function LocationMismatchBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: geo } = useQuery<GeoLookup>({
    queryKey: ["/api/geo/lookup"],
    enabled: !!user && !user.locationPrompted,
    staleTime: 1000 * 60 * 60,
  });

  useEffect(() => {
    if (!user || user.locationPrompted) return;
    if (!geo) return;
    const userCountry = (user.country || "AE").toUpperCase();
    if (geo.country && geo.country !== userCountry) {
      setOpen(true);
    } else {
      // Mark prompted silently if it matches
      apiRequest("POST", "/api/users/me/location-prompted", {})
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }))
        .catch(() => {});
    }
  }, [user, geo]);

  const switchMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/users/profile", {
        country: geo!.country,
        city: geo!.city || undefined,
        locationPrompted: true,
      });
    },
    onSuccess: () => {
      toast({ title: "Location updated", description: `Now showing barters in ${geo?.countryName}` });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setOpen(false);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users/me/location-prompted", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setOpen(false);
    },
  });

  if (!geo || !user) return null;

  const currentName = getCountryByCode(user.country || "AE")?.name || "your country";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-location-mismatch">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-primary" /> You seem to be in {geo.countryName}
          </DialogTitle>
          <DialogDescription>
            Your account is set to <strong>{currentName}</strong>. Want to switch to{" "}
            <strong>{geo.countryName}</strong> to discover local barters?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
            data-testid="button-keep-location"
          >
            Keep {currentName}
          </Button>
          <Button
            onClick={() => switchMutation.mutate()}
            disabled={switchMutation.isPending}
            data-testid="button-switch-location"
          >
            Switch to {geo.countryName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
