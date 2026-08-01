import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { initPostHog, capturePageview } from "@/lib/posthog";
import { queryClient } from "./lib/queryClient";
import { useQuery, useQueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { WaitlistProvider } from "@/lib/waitlist";
import { ActionGuardProvider } from "@/lib/action-guard";
import { VerificationReminder } from "@/components/verification-reminder";
import { NativeVerificationPrompt } from "@/components/native-verification-prompt";
import { useNativePush } from "@/hooks/use-native-push";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider, LanguageSync } from "@/lib/i18n";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { CookieConsent } from "@/components/cookie-consent";
import { AnnouncementBanner } from "@/components/announcement-banner";
import AiSupportChat from "@/components/ai-support-chat";
import BareterAiNotificationChat from "@/components/bareter-ai-notification-chat";
import { LocationMismatchBanner } from "@/components/location-mismatch-banner";
import { GeoGate } from "@/components/geo-gate";
import { ErrorBoundary } from "@/components/error-boundary";
import { HandshakeLoader, FullPageLoader } from "@/components/handshake-loader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Route-level code splitting — each page loads only when navigated to
const LandingPage = lazy(() => import("@/pages/landing").then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("@/pages/login").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/register").then((m) => ({ default: m.RegisterPage })));
const ProfilePage = lazy(() => import("@/pages/profile").then((m) => ({ default: m.ProfilePage })));
const BrowsePage = lazy(() => import("@/pages/browse").then((m) => ({ default: m.BrowsePage })));
const CreateListingPage = lazy(() => import("@/pages/create-listing").then((m) => ({ default: m.CreateListingPage })));
const ListingDetailPage = lazy(() => import("@/pages/listing-detail").then((m) => ({ default: m.ListingDetailPage })));
const DealsPage = lazy(() => import("@/pages/deals").then((m) => ({ default: m.DealsPage })));
const DealDetailPage = lazy(() => import("@/pages/deal-detail").then((m) => ({ default: m.DealDetailPage })));
const AdminPage = lazy(() => import("@/pages/admin").then((m) => ({ default: m.AdminPage })));
const AdminAcceptInvitePage = lazy(() => import("@/pages/admin-accept-invite").then((m) => ({ default: m.AdminAcceptInvitePage })));
const CompanyOsDashboard = lazy(() => import("@/pages/admin/CompanyOsDashboard"));
const MarketingDashboard = lazy(() => import("@/pages/admin/MarketingDashboard"));
const SalesDashboard = lazy(() => import("@/pages/admin/SalesDashboard"));
const HowItWorksPage = lazy(() => import("@/pages/how-it-works").then((m) => ({ default: m.HowItWorksPage })));
const PricingPage = lazy(() => import("@/pages/pricing").then((m) => ({ default: m.PricingPage })));
const HelpPage = lazy(() => import("@/pages/help").then((m) => ({ default: m.HelpPage })));
const FAQPage = lazy(() => import("@/pages/faq").then((m) => ({ default: m.FAQPage })));
const BlogPage = lazy(() => import("@/pages/blog").then((m) => ({ default: m.BlogPage })));
const BlogPostPage = lazy(() => import("@/pages/blog-post").then((m) => ({ default: m.BlogPostPage })));
const TermsPage = lazy(() => import("@/pages/terms").then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("@/pages/privacy").then((m) => ({ default: m.PrivacyPage })));
const LegalPage = lazy(() => import("@/pages/legal").then((m) => ({ default: m.LegalPage })));
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
const SettingsPage = lazy(() => import("@/pages/settings").then((m) => ({ default: m.SettingsPage })));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const BrowsePublicPage = lazy(() => import("@/pages/browse-public").then((m) => ({ default: m.BrowsePublicPage })));
const UserProfilePage = lazy(() => import("@/pages/user-profile").then((m) => ({ default: m.UserProfilePage })));
const SavedListingsPage = lazy(() => import("@/pages/saved-listings").then((m) => ({ default: m.SavedListingsPage })));
const MySearchesPage = lazy(() => import("@/pages/my-searches").then((m) => ({ default: m.MySearchesPage })));
const ReferralsPage = lazy(() => import("@/pages/referrals").then((m) => ({ default: m.ReferralsPage })));
const FeedPage = lazy(() => import("@/pages/feed").then((m) => ({ default: m.FeedPage })));
const CreatorsPage = lazy(() => import("@/pages/creators").then((m) => ({ default: m.CreatorsPage })));
const CreatorStorefrontPage = lazy(() => import("@/pages/creator-storefront").then((m) => ({ default: m.CreatorStorefrontPage })));
const BusinessStorefrontPage = lazy(() => import("@/pages/business-storefront").then((m) => ({ default: m.BusinessStorefrontPage })));
const BusinessesDirectoryPage = lazy(() => import("@/pages/businesses-directory").then((m) => ({ default: m.BusinessesDirectoryPage })));
const NotificationsPage = lazy(() => import("@/pages/notifications").then((m) => ({ default: m.NotificationsPage })));
const CreatePostPage = lazy(() => import("@/pages/create-post").then((m) => ({ default: m.CreatePostPage })));
const InboxPage = lazy(() => import("@/pages/inbox").then((m) => ({ default: m.InboxPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password").then((m) => ({ default: m.ResetPasswordPage })));
const MapViewPage = lazy(() => import("@/pages/map-view").then((m) => ({ default: m.MapViewPage })));
const PostDetailPage = lazy(() => import("@/pages/post-detail").then((m) => ({ default: m.PostDetailPage })));
const BulkDealsPage = lazy(() => import("@/pages/bulk-deals").then((m) => ({ default: m.BulkDealsPage })));
const NotFound = lazy(() => import("@/pages/not-found"));
const MaintenancePage = lazy(() => import("@/pages/maintenance").then((m) => ({ default: m.MaintenancePage })));
// Initialise PostHog once at module load (no-ops if VITE_POSTHOG_KEY is absent)
// Tag every event with platform so PostHog can split ios vs web dashboards
initPostHog({ platform: Capacitor.isNativePlatform() ? "ios" : "web" });

const ADMIN_DOMAIN = "admin.bareter.com";
const isAdminSubdomain =
  typeof window !== "undefined" && window.location.hostname === ADMIN_DOMAIN;

// Tell the browser not to auto-restore scroll position between SPA navigations —
// we handle it ourselves in RouteTransition so pages always open at the top.
if (typeof window !== "undefined") {
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
  // Force top on initial page load (guards against bfcache scroll restoration)
  window.scrollTo(0, 0);
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
}

function RouteTransition({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  // Track whether the most recent navigation was a browser back/forward
  // (popstate) so we can preserve the browser's native scroll restoration
  // for those navigations and only force scroll-to-top on forward pushes.
  const popNavRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      popNavRef.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Reset scroll to the top of the page on every NEW (push) route change.
  // Runs synchronously (useLayoutEffect) to prevent the footer flashing into
  // view before the browser paints the new page. We target all possible scroll
  // containers because different browsers/OS combinations honor different ones.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (popNavRef.current) {
      popNavRef.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }, [loc]);

  // Belt-and-suspenders: also reset after first paint (RAF) and after 100ms
  // to catch async-rendered content that can shift the page after mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (popNavRef.current) return;
    if (window.location.hash) return;
    const reset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    };
    const raf = requestAnimationFrame(reset);
    const tid = setTimeout(reset, 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(tid);
    };
  }, [loc]);

  useEffect(() => {
    capturePageview(loc);
  }, [loc]);

  return (
    <div key={loc} className="bareter-route-fade">
      {children}
    </div>
  );
}

// Redirects /admin/* to the admin subdomain when accessed from the main domain.
// In local dev this is a no-op (hostname is localhost, not the admin domain).
function AdminSubdomainRedirect() {
  useEffect(() => {
    if (window.location.hostname !== ADMIN_DOMAIN) {
      window.location.replace(`https://${ADMIN_DOMAIN}/admin`);
    }
  }, []);
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <HandshakeLoader size="md" />
    </div>
  );
}

// Minimal login form rendered on admin.bareter.com when not authenticated.
function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Invalid credentials");
        return;
      }
      const userData = await res.json();
      queryClient.setQueryData(["/api/auth/me"], userData);
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-6 text-center">Admin Access</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-gray-900 text-white text-sm font-semibold rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

// Minimal app rendered when hostname === admin.bareter.com.
// No header, footer, nav, cookie banner, or support chat — just the admin panel.
function AdminApp() {
  const [location] = useLocation();
  const { data: user, isLoading } = useQuery<{ role?: string; isAdmin?: boolean } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const isAdmin = user?.isAdmin === true || user?.role === "admin" || user?.role === "super_admin";

  // Invite acceptance is the only unauthenticated, account-creating page on this
  // subdomain — it requires a valid one-time token, so it bypasses the login/404 gate below.
  if (location.startsWith("/accept-invite")) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <AdminAcceptInvitePage />
      </Suspense>
    );
  }

  if (isLoading) {
    return <FullPageLoader />;
  }

  // Not logged in → show admin login form (not a generic 404, so admin can authenticate here)
  if (!user) {
    return <AdminLoginForm />;
  }

  // Logged in but not admin → show 404 with no hints
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-widest text-gray-400 uppercase mb-2">404</p>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Page not found</h1>
          <p className="text-sm text-gray-500">The page you requested could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<FullPageLoader />}>
      <Switch>
        <Route path="/" component={AdminPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/admin/company-os" component={CompanyOsDashboard} />
        <Route path="/admin/marketing" component={MarketingDashboard} />
        <Route path="/admin/sales" component={SalesDashboard} />
        <Route component={AdminPage} />
      </Switch>
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="h-8 w-48 rounded-lg bareter-shimmer mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-bareter-card border border-bareter-border shadow-bareter-card overflow-hidden">
            <div className="aspect-[16/9] bareter-shimmer" />
            <div className="p-4 space-y-3">
              <div className="h-4 w-3/4 rounded bareter-shimmer" />
              <div className="h-5 w-1/2 rounded bareter-shimmer" />
              <div className="h-3 w-2/3 rounded bareter-shimmer" />
              <div className="h-7 w-full rounded bareter-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// On native the marketing landing page makes no sense — go straight to Browse.
function NativeHomeRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/browse", { replace: true } as any); }, []);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={isNative ? NativeHomeRedirect : LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/browse" component={BrowsePage} />
      <Route path="/c/:category/:subcategory" component={BrowsePage} />
      <Route path="/c/:category" component={BrowsePage} />
      <Route path="/create-listing" component={CreateListingPage} />
      <Route path="/listings/:id" component={ListingDetailPage} />
      <Route path="/deals" component={DealsPage} />
      <Route path="/deals/:id" component={DealDetailPage} />
      {/* Admin routes redirect to admin.bareter.com on main domain */}
      <Route path="/admin" component={AdminSubdomainRedirect} />
      <Route path="/admin/company-os" component={AdminSubdomainRedirect} />
      <Route path="/admin/marketing" component={AdminSubdomainRedirect} />
      <Route path="/admin/sales" component={AdminSubdomainRedirect} />
      <Route path="/how-it-works" component={HowItWorksPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/help" component={HelpPage} />
      <Route path="/faq" component={FAQPage} />
      <Route path="/blog/:slug" component={BlogPostPage} />
      <Route path="/blog" component={BlogPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/legal/:slug" component={LegalPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/browse-public" component={BrowsePublicPage} />
      <Route path="/users/:id" component={UserProfilePage} />
      <Route path="/saved" component={SavedListingsPage} />
      <Route path="/my-searches" component={MySearchesPage} />
      <Route path="/referrals" component={ReferralsPage} />
      <Route path="/feed" component={FeedPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/create-post" component={CreatePostPage} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/map" component={MapViewPage} />
      <Route path="/posts/:id" component={PostDetailPage} />
      <Route path="/creators/:userId" component={CreatorStorefrontPage} />
      <Route path="/creators" component={CreatorsPage} />
      <Route path="/businesses" component={BusinessesDirectoryPage} />
      <Route path="/businesses/:id" component={BusinessStorefrontPage} />
      <Route path="/bulk-deals" component={BulkDealsPage} />
      <Route path="/brand-collabs">{() => <Redirect to="/browse?tab=collabs" />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

// Shows a subtle "starting up" banner only when the server is taking >3s
// to respond (Replit cold start). Disappears automatically once the app loads.
function WarmupBanner() {
  const [show, setShow] = useState(false);
  const { data: config, isLoading } = useQuery<{ maintenanceMode: boolean }>({
    queryKey: ["/api/config"],
    staleTime: 15_000,
    retry: 3,
    retryDelay: 2000,
  });

  useEffect(() => {
    if (!isLoading || config) return;
    const t = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(t);
  }, [isLoading, config]);

  if (!show || !isLoading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-bareter-teal text-white text-sm py-2 px-4 flex items-center justify-center gap-3 shadow-md">
      <HandshakeLoader size="sm" inverted />
      <span>Starting up, please wait a moment…</span>
    </div>
  );
}

function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { data: config } = useQuery<{ maintenanceMode: boolean }>({
    queryKey: ["/api/config"],
    staleTime: 15_000,
  });

  const { data: user } = useQuery<{ role?: string; isAdmin?: boolean } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const isAdmin = user?.isAdmin === true || user?.role === "admin" || user?.role === "super_admin";

  if (config?.maintenanceMode && !isAdmin) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}

// Detects ?kyb_complete=<businessId> added by Didit callback URL, syncs status, invalidates queries.
// Must live inside <AuthProvider> and <QueryClientProvider>.
function KybReturnHandler() {
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bizId = params.get("kyb_complete");
    if (!bizId) return;

    // Strip the param from the URL without re-navigating
    params.delete("kyb_complete");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
    window.history.replaceState(null, "", newUrl);

    toast({ title: "Checking verification status…", description: "Syncing your business verification result." });

    apiRequest("POST", `/api/businesses/${bizId}/kyb/sync`)
      .then((r) => r.json())
      .then((data: { kybStatus?: string; synced?: boolean }) => {
        qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
        qc.invalidateQueries({ queryKey: ["/api/businesses/me"] });
        qc.invalidateQueries({ queryKey: [`/api/businesses/${bizId}`] });
        qc.invalidateQueries({ queryKey: [`/api/businesses/${bizId}/storefront`] });

        if (data.kybStatus === "APPROVED") {
          toast({ title: "Business verified!", description: "Your business is now fully verified. All access granted." });
        } else if (data.kybStatus === "IN_REVIEW" || data.kybStatus === "PENDING_REVIEW") {
          toast({ title: "Under review", description: "Your documents are being reviewed. You'll be notified when complete." });
        } else if (data.kybStatus === "DECLINED" || data.kybStatus === "REJECTED") {
          toast({ title: "Verification not approved", description: "Please try again or contact support.", variant: "destructive" });
        }
      })
      .catch(() => {
        qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
        qc.invalidateQueries({ queryKey: ["/api/businesses/me"] });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// Registers for native push notifications once the user is authenticated.
// Must live inside <AuthProvider> so useAuth() resolves.
function NativePushManager() {
  useNativePush();
  return null;
}

// True on iOS/Android Capacitor builds; false in every browser.
const isNative = Capacitor.isNativePlatform();

// Handles all native-only startup side-effects in one place.
// Runs once on mount; no-ops completely when isNative is false.
function NativeBootstrap() {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isNative) return;

    // Status bar: teal background, light (white) icons
    (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: "#136c68" });
      } catch {}
      // SplashScreen.hide() is called in NativeSplashGate after auth resolves.
    })();

    // Back button + app foreground resume refresh
    let cleanupListeners: (() => void) | undefined;
    (async () => {
      try {
        const { App: CapApp } = await import("@capacitor/app");

        const backHandle = await CapApp.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) window.history.back();
          else CapApp.exitApp();
        });

        let backgroundAt = 0;
        const resumeHandle = await CapApp.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            backgroundAt = Date.now();
          } else if (Date.now() - backgroundAt > 30_000) {
            // App was backgrounded for >30s — refresh live data silently
            qc.invalidateQueries({ queryKey: ["/api/inbox"] });
            qc.invalidateQueries({ queryKey: ["/api/deals"] });
            qc.invalidateQueries({ queryKey: ["/api/listings"] });
          }
        });

        cleanupListeners = () => { backHandle.remove(); resumeHandle.remove(); };
      } catch {}
    })();

    return () => { cleanupListeners?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/**
 * On native: shows a full-screen teal overlay from first render until the
 * /api/auth/me check resolves (max 8 s safety cap so it never blocks forever).
 * The teal web overlay bridges the gap between the native splash hiding and
 * content being ready — so there is never a white or black flash.
 * On web: invisible no-op.
 */
function NativeSplashGate() {
  const [visible, setVisible] = useState(isNative);
  const [fading, setFading] = useState(false);
  const hidden = useRef(false);

  const { isLoading } = useQuery<unknown>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const dismiss = useRef(async () => {
    if (hidden.current) return;
    hidden.current = true;
    // Fade the native OS splash first, then reveal content.
    // Awaiting ensures the native animation completes before we remove the
    // web overlay — no white flash between the two layers.
    try {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      await SplashScreen.hide({ fadeOutDuration: 300 });
    } catch {}
    setFading(true);
    setTimeout(() => setVisible(false), 300);
  });

  // Dismiss once auth check finishes
  useEffect(() => {
    if (!isNative || isLoading) return;
    dismiss.current();
  }, [isLoading]);

  // Safety cap: always dismiss after 5 s even if auth hangs
  useEffect(() => {
    if (!isNative) return;
    const t = setTimeout(() => dismiss.current(), 5000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#136c68",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "32px",
        zIndex: 99999,
        transition: "opacity 350ms ease",
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "36px", fontWeight: 800, letterSpacing: "0.12em", color: "#ffffff", textTransform: "uppercase" as const }}>
        BARETER
      </div>
      <HandshakeLoader size="lg" inverted />
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "rgba(255,255,255,0.55)", letterSpacing: "0.05em" }}>
        Loading…
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NativeBootstrap />
      <NativeSplashGate />
      <WarmupBanner />
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <LanguageSync />
            <KybReturnHandler />
            {isNative && <NativePushManager />}
            <TooltipProvider>
              {/* Admin subdomain — stripped-down shell, no public UI chrome */}
              {isAdminSubdomain ? (
                <ErrorBoundary>
                  <AdminApp />
                  <Toaster />
                </ErrorBoundary>
              ) : (
                /* Main site */
                <WaitlistProvider>
                  <ActionGuardProvider>
                  <ErrorBoundary>
                    <MaintenanceGate>
                      {/* safe-area-top pads content below the native status bar on iPhone notch / Dynamic Island */}
                      <div className={`min-h-screen flex flex-col bg-background${isNative ? " safe-area-top" : ""}`}>
                        {!isNative && <AnnouncementBanner />}
                        <Header />
                        {!isNative && <VerificationReminder />}
                        <main className="flex-1 pb-28 md:pb-0">
                          <RouteTransition>
                            <GeoGate>
                              <Suspense fallback={<PageSkeleton />}>
                                <Router />
                              </Suspense>
                            </GeoGate>
                          </RouteTransition>
                        </main>
                        {!isNative && <Footer />}
                        <MobileBottomNav />
                      </div>
                      <Toaster />
                      <AiSupportChat />
                      <BareterAiNotificationChat />
                      <LocationMismatchBanner />
                      {!isNative && <CookieConsent />}
                      {isNative && <NativeVerificationPrompt />}
                    </MaintenanceGate>
                  </ErrorBoundary>
                  </ActionGuardProvider>
                </WaitlistProvider>
              )}
            </TooltipProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
