import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { initPostHog, capturePageview } from "@/lib/posthog";
import { queryClient } from "./lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { WaitlistProvider } from "@/lib/waitlist";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider, LanguageSync } from "@/lib/i18n";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { CookieConsent } from "@/components/cookie-consent";
import { AnnouncementBanner } from "@/components/announcement-banner";
import AiSupportChat from "@/components/ai-support-chat";
import { LocationMismatchBanner } from "@/components/location-mismatch-banner";
import { GeoGate } from "@/components/geo-gate";
import { ErrorBoundary } from "@/components/error-boundary";

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
const NotificationsPage = lazy(() => import("@/pages/notifications").then((m) => ({ default: m.NotificationsPage })));
const CreatePostPage = lazy(() => import("@/pages/create-post").then((m) => ({ default: m.CreatePostPage })));
const InboxPage = lazy(() => import("@/pages/inbox").then((m) => ({ default: m.InboxPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password").then((m) => ({ default: m.ResetPasswordPage })));
const MapViewPage = lazy(() => import("@/pages/map-view").then((m) => ({ default: m.MapViewPage })));
const PostDetailPage = lazy(() => import("@/pages/post-detail").then((m) => ({ default: m.PostDetailPage })));
const NotFound = lazy(() => import("@/pages/not-found"));
const MaintenancePage = lazy(() => import("@/pages/maintenance").then((m) => ({ default: m.MaintenancePage })));

// Initialise PostHog once at module load (no-ops if VITE_POSTHOG_KEY is absent)
initPostHog();

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
      <div className="h-8 w-8 rounded-full border-2 border-bareter-teal border-t-transparent animate-spin" />
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
  const { data: user, isLoading } = useQuery<{ role?: string; isAdmin?: boolean } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const isAdmin = user?.isAdmin === true || user?.role === "admin" || user?.role === "super_admin";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" />
      </div>
    );
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
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" /></div>}>
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
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
      <Route component={NotFound} />
    </Switch>
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

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "bareter-query-cache-v1",
  throttleTime: 2000,
});

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 10,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0] as string;
            return (
              typeof key === "string" &&
              (key.startsWith("/api/listings") || key === "/api/trending" || key === "/api/feed")
            );
          },
        },
      }}
    >
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <LanguageSync />
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
                  <ErrorBoundary>
                    <MaintenanceGate>
                      <div className="min-h-screen flex flex-col bg-background">
                        <AnnouncementBanner />
                        <Header />
                        <main className="flex-1 pb-20 md:pb-0">
                          <RouteTransition>
                            <GeoGate>
                              <Suspense fallback={<div className="flex items-center justify-center min-h-[40vh]"><div className="h-8 w-8 rounded-full border-2 border-bareter-teal border-t-transparent animate-spin" /></div>}>
                                <Router />
                              </Suspense>
                            </GeoGate>
                          </RouteTransition>
                        </main>
                        <Footer />
                        <MobileBottomNav />
                      </div>
                      <Toaster />
                      <AiSupportChat />
                      <LocationMismatchBanner />
                      <CookieConsent />
                    </MaintenanceGate>
                  </ErrorBoundary>
                </WaitlistProvider>
              )}
            </TooltipProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

export default App;
