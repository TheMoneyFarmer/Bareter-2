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

const SESSION_DISMISS_KEY = "loc_mismatch_dismissed";

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
    if (typeof window !== "undefined" && sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") return;
    const userCountry = (user.country || "AE").toUpperCase();
    if (geo.country && geo.country !== userCountry) {
      setOpen(true);
    }
    // Note: do NOT mark locationPrompted on country match — we still want to
    // prompt the user later if their detected country changes (travel, VPN off, etc.).
  }, [user, geo]);

  const switchMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/users/profile", {
        country: geo!.country,
        city: geo!.city || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Location updated", description: `Now showing barters in ${geo?.countryName}` });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/matches"] });
      setOpen(false);
    },
  });

  const dontAskAgainMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users/me/location-prompted", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setOpen(false);
    },
  });

  const dismissForSession = () => {
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, "1"); } catch {}
    setOpen(false);
  };

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
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dontAskAgainMutation.mutate()}
            disabled={dontAskAgainMutation.isPending}
            data-testid="button-dont-ask-again"
            className="sm:mr-auto"
          >
            Don't ask again
          </Button>
          <Button
            variant="outline"
            onClick={dismissForSession}
            data-testid="button-keep-location"
          >
            No, keep {currentName}
          </Button>
          <Button
            onClick={() => switchMutation.mutate()}
            disabled={switchMutation.isPending}
            data-testid="button-switch-location"
          >
            Yes, switch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
