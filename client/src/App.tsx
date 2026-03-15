import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n";
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
import { HowItWorksPage } from "@/pages/how-it-works";
import { PricingPage } from "@/pages/pricing";
import { HelpPage } from "@/pages/help";
import { FAQPage } from "@/pages/faq";
import { TermsPage } from "@/pages/terms";
import { PrivacyPage } from "@/pages/privacy";
import OnboardingPage from "@/pages/onboarding";
import { SettingsPage } from "@/pages/settings";
import DashboardPage from "@/pages/dashboard";
import { BrowsePublicPage } from "@/pages/browse-public";
import { UserProfilePage } from "@/pages/user-profile";
import { SavedListingsPage } from "@/pages/saved-listings";
import { ReferralsPage } from "@/pages/referrals";
import { FeedPage } from "@/pages/feed";
import { CreatePostPage } from "@/pages/create-post";
import { InboxPage } from "@/pages/inbox";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/browse" component={BrowsePage} />
      <Route path="/create-listing" component={CreateListingPage} />
      <Route path="/listings/:id" component={ListingDetailPage} />
      <Route path="/deals" component={DealsPage} />
      <Route path="/deals/:id" component={DealDetailPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/how-it-works" component={HowItWorksPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/help" component={HelpPage} />
      <Route path="/faq" component={FAQPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/browse-public" component={BrowsePublicPage} />
      <Route path="/users/:id" component={UserProfilePage} />
      <Route path="/saved" component={SavedListingsPage} />
      <Route path="/referrals" component={ReferralsPage} />
      <Route path="/feed" component={FeedPage} />
      <Route path="/create-post" component={CreatePostPage} />
      <Route path="/inbox" component={InboxPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <TooltipProvider>
              <div className="min-h-screen flex flex-col bg-background">
                <Header />
                <main className="flex-1 pb-20 md:pb-0">
                  <Router />
                </main>
                <div className="hidden md:block">
                  <Footer />
                </div>
                <MobileBottomNav />
              </div>
              <Toaster />
              <WhatsAppButton />
            </TooltipProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
