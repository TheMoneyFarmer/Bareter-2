import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Globe2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { getCountryByCode } from "@shared/schema";

// Bypass is intentionally limited to:
//   - admins / founders (DB-driven)
//   - explicit query param `?bypassGeo=1` (dev/QA escape hatch — no public UI)
// There is no public "continue anyway" affordance; non-AE visitors must join the waitlist.
const BYPASS_KEY = "bareter_bypass_geo";
const ALLOWED_COUNTRY = "AE";

// Routes that must remain reachable even from non-AE IPs so existing users,
// people accepting invites, or visitors reading legal pages aren't locked out.
const EXEMPT_ROUTE_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/terms",
  "/privacy",
  "/help",
  "/faq",
  "/how-it-works",
  "/pricing",
];

interface GeoLookup {
  country: string;
  countryName: string;
  city: string | null;
  source: string;
  cached?: boolean;
}

export function GeoGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { openWith } = useWaitlist();
  const [bypassed, setBypassed] = useState(false);

  // Honour ?bypassGeo=1 and persistent localStorage flag (admins/dev/QA)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("bypassGeo") === "1") {
        localStorage.setItem(BYPASS_KEY, "1");
      }
      if (localStorage.getItem(BYPASS_KEY) === "1") {
        setBypassed(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const isPrivileged = !!(user?.isAdmin || user?.founderBadge);
  const [pathname] = useLocation();
  const isExemptRoute = EXEMPT_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));

  const { data: geo, isError: geoError } = useQuery<GeoLookup>({
    queryKey: ["/api/geo/lookup"],
    enabled: !isPrivileged && !bypassed && !isExemptRoute,
    refetchOnWindowFocus: false,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const allow = useMemo(() => {
    if (isPrivileged) return true;
    if (bypassed) return true;
    if (isExemptRoute) return true;
    // Fail open: if geo lookup errors, allow access rather than spin forever.
    if (geoError) return true;
    if (!geo) return null; // still resolving
    return geo.country === ALLOWED_COUNTRY;
  }, [isPrivileged, bypassed, isExemptRoute, geoError, geo]);

  // While we resolve geo for unauthenticated visitors, hold the render with a soft loader
  // so non-AE visitors can never briefly access the app before the gate decides.
  if (allow === null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" data-testid="geo-gate-loading">
        <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }
  if (allow !== false) return <>{children}</>;

  const detectedCountry =
    geo?.countryName || (geo?.country ? getCountryByCode(geo.country)?.name || geo.country : "your country");

  const onJoinWaitlist = () => {
    openWith({
      country: geo?.country ?? null,
      city: geo?.city ?? null,
      reason: "geo",
    });
  };

  return (
    <div
      className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4 py-12"
      data-testid="geo-gate"
    >
      <Card className="max-w-lg w-full shadow-bareter-card">
        <CardContent className="p-8 text-center space-y-5">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Globe2 className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold" data-testid="geo-gate-title">
              Bareter isn't live in {detectedCountry} yet
            </h1>
            <p className="text-sm text-muted-foreground">
              We're a UAE-first marketplace today, but expanding worldwide. Join the waitlist
              and we'll let you know the moment Bareter launches in your country.
            </p>
          </div>

          <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 text-left">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>
                Detected location: <span className="font-medium text-foreground">
                  {geo?.city ? `${geo.city}, ` : ""}{detectedCountry}
                </span>
              </span>
            </div>
          </div>

          <div className="pt-1">
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={onJoinWaitlist}
              data-testid="button-geo-waitlist"
            >
              <Mail className="h-4 w-4" />
              Join the waitlist
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Already have an account?{" "}
            <a href="/login" className="text-primary underline" data-testid="link-geo-login">
              Sign in
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
