import { useEffect, useLayoutEffect, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { initPostHog, capturePageview } from "@/lib/posthog";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { WaitlistProvider } from "@/lib/waitlist";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider, LanguageSync } from "@/lib/i18n";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { LandingPage } from "@/pages/landing";
import { LoginPage } from "@/pages/login";
import { RegisterPage } from "@/pages/register";
import { ProfilePage } from "@/pages/profile";
import { BrowsePage } from "@/pages/browse";
import { CreateListingPage } from "@/pages/create-listing";
import { ListingDetailPage } from "@/pages/listing-detail";
import { DealsPage } from "@/pages/deals";
import { DealDetailPage } from "@/pages/deal-detail";
import { AdminPage } from "@/pages/admin";
import CompanyOsDashboard from "@/pages/admin/CompanyOsDashboard";
import MarketingDashboard from "@/pages/admin/MarketingDashboard";
import SalesDashboard from "@/pages/admin/SalesDashboard";
import { HowItWorksPage } from "@/pages/how-it-works";
import { PricingPage } from "@/pages/pricing";
import { HelpPage } from "@/pages/help";
import { FAQPage } from "@/pages/faq";
import { BlogPage } from "@/pages/blog";
import { BlogPostPage } from "@/pages/blog-post";
import { TermsPage } from "@/pages/terms";
import { PrivacyPage } from "@/pages/privacy";
import { LegalPage } from "@/pages/legal";
import { CookieConsent } from "@/components/cookie-consent";
import { AnnouncementBanner } from "@/components/announcement-banner";
import OnboardingPage from "@/pages/onboarding";
import { SettingsPage } from "@/pages/settings";
import DashboardPage from "@/pages/dashboard";
import { BrowsePublicPage } from "@/pages/browse-public";
import { UserProfilePage } from "@/pages/user-profile";
import { SavedListingsPage } from "@/pages/saved-listings";
import { MySearchesPage } from "@/pages/my-searches";
import { ReferralsPage } from "@/pages/referrals";
import { FeedPage } from "@/pages/feed";
import { CreatePostPage } from "@/pages/create-post";
import { InboxPage } from "@/pages/inbox";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { ResetPasswordPage } from "@/pages/reset-password";
import { MapViewPage } from "@/pages/map-view";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import AiSupportChat from "@/components/ai-support-chat";
import { LocationMismatchBanner } from "@/components/location-mismatch-banner";
import { GeoGate } from "@/components/geo-gate";
import NotFound from "@/pages/not-found";
import { MaintenancePage } from "@/pages/maintenance";
import { ErrorBoundary } from "@/components/error-boundary";

// Initialise PostHog once at module load (no-ops if VITE_POSTHOG_KEY is absent)
initPostHog();

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

  // Reset scroll to the top of the page on every NEW (push) route change so
  // users always start at the page header — but skip on back/forward so the
  // browser's native scroll restoration works, and skip when the URL has a
  // hash (e.g. /feed#post-123) so deep-link anchors keep default behavior.
  // useLayoutEffect instead of useEffect so the scroll happens BEFORE the
  // browser paints — prevents the footer from flashing into view first.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (popNavRef.current) {
      popNavRef.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
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
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/company-os" component={CompanyOsDashboard} />
      <Route path="/admin/marketing" component={MarketingDashboard} />
      <Route path="/admin/sales" component={SalesDashboard} />
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
      <Route path="/create-post" component={CreatePostPage} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/map" component={MapViewPage} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <LanguageSync />
            <TooltipProvider>
              <WaitlistProvider>
                <ErrorBoundary>
                  <MaintenanceGate>
                    <div className="min-h-screen flex flex-col bg-background">
                      <AnnouncementBanner />
                      <Header />
                      <main className="flex-1 pb-20 md:pb-0">
                        <RouteTransition>
                          <GeoGate>
                            <Router />
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
            </TooltipProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
