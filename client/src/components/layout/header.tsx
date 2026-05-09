import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LocationPicker } from "@/components/location-picker";
import { VerifiedBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import { useActiveLocation } from "@/lib/active-location";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCountryByCode } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  Menu,
  Sun,
  Moon,
  Bell,
  User,
  LogOut,
  Settings,
  LayoutDashboard,
  Handshake,
  Search,
  Plus,
  Shield,
  Languages,
  Rss,
  PenSquare,
  MessageSquare,
  Globe,
  MapPin,
  X,
} from "lucide-react";
import type { Notification } from "@shared/schema";

export function Header() {
  const { user, logout } = useAuth();
  const { mode: waitlistMode, open: openWaitlist } = useWaitlist();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const [location, navigate] = useLocation();

  // When the language is toggled from the header, persist the choice to the
  // logged-in user's account so it follows them across devices. We attempt
  // the PATCH unconditionally (rather than gating on the React `user` value,
  // which may briefly lag behind the session cookie right after login) and
  // silently swallow 401 responses for anonymous visitors — they keep using
  // the existing localStorage-only behavior. The session cookie sent by the
  // browser, not the React state, is the source of truth on the server.
  const persistLanguageMutation = useMutation({
    mutationFn: async (lang: "en" | "ar") => {
      try {
        const res = await apiRequest("PATCH", "/api/users/settings", { language: lang });
        return await res.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("401")) return null; // anonymous — expected
        throw err;
      }
    },
    onSuccess: (result) => {
      if (result) queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const toggleLanguage = () => {
    const next = language === "en" ? "ar" : "en";
    setLanguage(next);
    persistLanguageMutation.mutate(next);
  };
  const { toast } = useToast();
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const activeLocation = useActiveLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const updateLocationMutation = useMutation({
    mutationFn: async ({ country, city }: { country: string; city: string }) => {
      await apiRequest("PATCH", "/api/users/profile", { country, city, locationPrompted: true });
    },
    onSuccess: () => {
      toast({ title: "Location updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/matches"] });
    },
  });

  const userCountry = activeLocation.country || user?.country || "AE";
  const userCity = activeLocation.city ?? user?.city ?? null;
  const countryEntry = getCountryByCode(userCountry);
  const locationPillLabel = activeLocation.worldwide
    ? "Worldwide"
    : userCity || countryEntry?.name || "Dubai";

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
  });
  const { data: inboxData } = useQuery<{ count: number }>({
    queryKey: ["/api/inbox-unread-count"],
    enabled: !!user,
    refetchInterval: 30000,
  });

  const unreadCount = notifications?.filter((n) => !n.isRead).length || 0;
  const inboxUnread = inboxData?.count || 0;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/browse?q=${encodeURIComponent(q)}`);
    setMobileSearchOpen(false);
  };

  const isActive = (path: string) => location === path;

  return (
    <header className="sticky top-0 z-50 w-full" data-testid="site-header">
      {/* Main bar — 64px. Lighter brand-teal (teal-light, #22A0A0) instead
          of the deep teal so it feels lighter on the page while still being
          on-brand. Slightly more saturated/opaque on scroll. */}
      <div
        className={`bareter-header-shell bg-bareter-teal text-white ${
          scrolled
            ? "supports-[backdrop-filter]:bg-bareter-teal/90 backdrop-blur-md shadow-[0_4px_16px_rgba(26,114,114,0.25)]"
            : "shadow-[0_2px_8px_rgba(34,160,160,0.15)]"
        }`}
      >
        <div
          className={`bareter-header-transition container mx-auto max-w-7xl px-4 flex items-center gap-3 sm:gap-6 h-16 ${
            scrolled ? "is-scrolled" : ""
          }`}
        >
          {/* LEFT — logo */}
          <Link href="/" className="flex items-center flex-shrink-0" data-testid="link-home">
            <img
              src="/logo-full-white.png"
              alt={t("app.name") || "Bareter"}
              className="h-8 sm:h-9 w-auto"
            />
          </Link>

          {/* CENTER — search pill (desktop) */}
          <form
            onSubmit={handleSearchSubmit}
            className="hidden md:flex flex-1 max-w-[480px] mx-auto h-10 items-center bg-white rounded-full px-4 shadow-sm focus-within:ring-2 focus-within:ring-bareter-teal-light"
            role="search"
          >
            <Search className="h-4 w-4 text-bareter-muted flex-shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search barters in Dubai..."
              className="flex-1 ms-3 me-3 bg-transparent text-bareter-navy placeholder:text-bareter-muted text-sm focus:outline-none"
              data-testid="input-header-search"
            />
            <button
              type="button"
              onClick={() => setLocationPickerOpen(true)}
              className="hidden lg:inline-flex items-center gap-1 ps-3 text-xs font-medium text-bareter-navy border-s border-bareter-border max-w-[140px]"
              data-testid="button-header-location-pill"
              title="Change location"
            >
              <MapPin className="h-3.5 w-3.5 text-bareter-teal flex-shrink-0" />
              <span className="truncate">{locationPillLabel}</span>
            </button>
          </form>

          {/* RIGHT — actions */}
          <div className="flex items-center gap-1 sm:gap-2 ms-auto">
            {/* Mobile: search toggle */}
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-md text-white hover:bg-white/10"
              data-testid="button-mobile-search-toggle"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Desktop: language + theme */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-md text-white hover:bg-white/10"
              data-testid="button-language-toggle"
              aria-label="Toggle language"
            >
              <Languages className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-md text-white hover:bg-white/10"
              data-testid="button-theme-toggle"
              aria-label="Toggle theme"
            >
              {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>

            {/* Feed — first-class destination, visible for all visitors */}
            <Link href="/feed" className="hidden md:inline-flex">
              <Button
                variant="bareter-ghost"
                size="sm"
                className={`h-10 gap-1.5 text-white hover:bg-white/10 ${
                  isActive("/feed") ? "bg-white/10" : ""
                }`}
                data-testid="button-nav-feed"
              >
                <Rss className="h-4 w-4" />
                Feed
              </Button>
            </Link>

            {user ? (
              <>

                {/* List a barter — primary teal CTA */}
                <Link href="/create-listing" className="hidden sm:inline-flex">
                  <Button variant="bareter" size="sm" className="h-10 gap-1.5" data-testid="button-list-trade">
                    <Plus className="h-4 w-4" />
                    List a barter
                  </Button>
                </Link>

                {/* Inbox */}
                <Link href="/inbox">
                  <button
                    type="button"
                    className="relative h-10 w-10 inline-flex items-center justify-center rounded-md text-white hover:bg-white/10"
                    data-testid="button-inbox"
                    aria-label="Inbox"
                  >
                    <MessageSquare className="h-5 w-5" />
                    {inboxUnread > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -end-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px]"
                      >
                        {inboxUnread > 9 ? "9+" : inboxUnread}
                      </Badge>
                    )}
                  </button>
                </Link>

                {/* Notifications */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="relative h-10 w-10 inline-flex items-center justify-center rounded-md text-white hover:bg-white/10"
                      data-testid="button-notifications"
                      aria-label="Notifications"
                    >
                      <Bell className="h-5 w-5" />
                      {unreadCount > 0 && (
                        <Badge
                          variant="destructive"
                          className="absolute -top-1 -end-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px]"
                        >
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </Badge>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <div className="flex items-center justify-between p-3 border-b">
                      <span className="font-semibold">{t("nav.notifications")}</span>
                      {unreadCount > 0 && (
                        <Badge variant="secondary">{unreadCount} {t("nav.new")}</Badge>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications && notifications.length > 0 ? (
                        notifications.slice(0, 5).map((notification) => (
                          <DropdownMenuItem
                            key={notification.id}
                            className={`flex flex-col items-start gap-1 p-3 cursor-pointer ${
                              !notification.isRead ? "bg-accent/50" : ""
                            }`}
                          >
                            <span className="font-medium text-sm">{notification.title}</span>
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {notification.message}
                            </span>
                          </DropdownMenuItem>
                        ))
                      ) : (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          {t("nav.noNotifications")}
                        </div>
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Avatar menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="relative h-10 w-10 rounded-full overflow-visible inline-flex items-center justify-center hover:bg-white/10"
                      data-testid="button-user-menu"
                      aria-label="Account"
                    >
                      <Avatar className="h-9 w-9 ring-2 ring-white/20">
                        <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
                        <AvatarFallback className="bg-bareter-teal text-white text-sm font-semibold">
                          {user.fullName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-0.5 -end-0.5">
                        <VerifiedBadge
                          kycStatus={user.kycStatus}
                          kybStatus={user.kybStatus}
                          accountType={user.accountType}
                          size="md"
                          testId="header-user-verified"
                        />
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="flex items-center gap-3 p-3 border-b">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
                        <AvatarFallback className="bg-bareter-teal text-white">
                          {user.fullName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <FounderBadge show={!!user.founderBadge} />
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-sm truncate">{user.fullName}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </span>
                      </div>
                    </div>
                    <Link href="/profile">
                      <DropdownMenuItem className="cursor-pointer" data-testid="menu-profile">
                        <User className="me-2 h-4 w-4" />
                        {t("nav.profile")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/feed">
                      <DropdownMenuItem className="cursor-pointer" data-testid="menu-feed">
                        <Rss className="me-2 h-4 w-4" />
                        {t("nav.feed")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/browse">
                      <DropdownMenuItem className="cursor-pointer" data-testid="menu-browse">
                        <Search className="me-2 h-4 w-4" />
                        {t("nav.browseMarketplace")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/deals">
                      <DropdownMenuItem className="cursor-pointer" data-testid="menu-deals">
                        <Handshake className="me-2 h-4 w-4" />
                        {t("nav.myDeals")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/dashboard">
                      <DropdownMenuItem className="cursor-pointer" data-testid="menu-dashboard">
                        <LayoutDashboard className="me-2 h-4 w-4" />
                        {t("nav.dashboard")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/settings">
                      <DropdownMenuItem className="cursor-pointer" data-testid="menu-settings">
                        <Settings className="me-2 h-4 w-4" />
                        {t("nav.settings")}
                      </DropdownMenuItem>
                    </Link>
                    {user.isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <Link href="/admin">
                          <DropdownMenuItem className="cursor-pointer" data-testid="menu-admin">
                            <Shield className="me-2 h-4 w-4" />
                            <span className="flex-1">{t("nav.admin")}</span>
                            <Badge variant="destructive" className="ms-2 text-xs">Admin</Badge>
                          </DropdownMenuItem>
                        </Link>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={logout}
                      className="cursor-pointer text-destructive focus:text-destructive"
                      data-testid="menu-logout"
                    >
                      <LogOut className="me-2 h-4 w-4" />
                      {t("nav.logout")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Mobile hamburger */}
                <Sheet>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-md text-white hover:bg-white/10"
                      data-testid="button-mobile-menu"
                      aria-label="Menu"
                    >
                      <Menu className="h-5 w-5" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-72">
                    <nav className="flex flex-col gap-1 mt-8">
                      <Link href="/create-listing">
                        <Button variant="bareter" className="w-full justify-start gap-2 h-11">
                          <Plus className="h-4 w-4" />
                          {t("nav.listABarter")}
                        </Button>
                      </Link>
                      <Link href="/feed">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <Rss className="h-4 w-4" />
                          {t("nav.feed")}
                        </Button>
                      </Link>
                      <div className="h-2" />
                      <Link href="/profile">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <User className="h-4 w-4" />
                          {t("nav.profile")}
                        </Button>
                      </Link>
                      <Link href="/dashboard">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <LayoutDashboard className="h-4 w-4" />
                          {t("nav.dashboard")}
                        </Button>
                      </Link>
                      <Link href="/saved">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <Search className="h-4 w-4" />
                          {t("nav.saved")}
                        </Button>
                      </Link>
                      <Link href="/referrals">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <Plus className="h-4 w-4" />
                          {t("nav.referrals")}
                        </Button>
                      </Link>
                      <Link href="/settings">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <Settings className="h-4 w-4" />
                          {t("nav.settings")}
                        </Button>
                      </Link>
                      {user.isAdmin && (
                        <Link href="/admin">
                          <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                            <Shield className="h-4 w-4" />
                            {t("nav.admin")}
                            <Badge variant="destructive" className="ms-auto text-xs">Admin</Badge>
                          </Button>
                        </Link>
                      )}
                      <div className="border-t my-2" />
                      <div className="flex items-center gap-2 sm:hidden">
                        <Button
                          variant="bareter-ghost"
                          className="flex-1 justify-start gap-2"
                          onClick={toggleLanguage}
                          data-testid="mobile-menu-language"
                        >
                          <Languages className="h-4 w-4" />
                          {language === "en" ? t("nav.switchToArabic") : t("nav.switchToEnglish")}
                        </Button>
                        <Button
                          variant="bareter-ghost"
                          className="flex-1 justify-start gap-2"
                          onClick={toggleTheme}
                          data-testid="mobile-menu-theme"
                        >
                          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                          {theme === "light" ? t("nav.darkMode") : t("nav.lightMode")}
                        </Button>
                      </div>
                      <Button
                        variant="bareter-ghost"
                        className="w-full justify-start gap-2 text-destructive"
                        onClick={logout}
                        data-testid="mobile-menu-logout"
                      >
                        <LogOut className="h-4 w-4" />
                        {t("nav.logout")}
                      </Button>
                    </nav>
                  </SheetContent>
                </Sheet>
              </>
            ) : waitlistMode.enabled ? (
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  size="sm"
                  className="h-10 bg-white text-bareter-teal hover:bg-white/95 font-semibold shadow-sm"
                  onClick={openWaitlist}
                  data-testid="button-join-waitlist"
                >
                  {t("nav.joinWaitlist")}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
                <Link href="/login" className="hidden sm:inline-flex">
                  <Button
                    variant="bareter-ghost"
                    size="sm"
                    className="h-10 text-white hover:bg-white/10"
                    data-testid="button-login"
                  >
                    {t("nav.login")}
                  </Button>
                </Link>
                <Link href="/register">
                  <Button variant="bareter" size="sm" className="h-10" data-testid="button-register">
                    {t("nav.register")}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile expandable search row */}
        {mobileSearchOpen && (
          <div className="md:hidden border-t border-white/15 bg-bareter-teal px-4 py-3">
            <form
              onSubmit={handleSearchSubmit}
              className="flex h-10 items-center bg-white rounded-full px-4"
              role="search"
            >
              <Search className="h-4 w-4 text-bareter-muted flex-shrink-0" />
              <input
                autoFocus
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("nav.searchBarters")}
                className="flex-1 ms-3 bg-transparent text-bareter-navy placeholder:text-bareter-muted text-sm focus:outline-none"
                data-testid="input-header-search-mobile"
              />
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                className="text-bareter-muted ms-2"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </form>
            <button
              type="button"
              onClick={() => setLocationPickerOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/80"
              data-testid="button-mobile-location"
            >
              {activeLocation.worldwide ? <Globe className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
              <span>{locationPillLabel}</span>
            </button>
          </div>
        )}
      </div>

      <LocationPicker
        open={locationPickerOpen}
        onOpenChange={setLocationPickerOpen}
        initialCountry={userCountry}
        initialCity={userCity}
        initialWorldwide={activeLocation.worldwide}
        onWorldwideChange={(ww) => {
          activeLocation.setWorldwide(ww);
          queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
          queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/ai/matches"] });
        }}
        onSave={(country, city) => {
          activeLocation.setLocation(country, city);
          if (user) {
            updateLocationMutation.mutate({ country, city });
          } else {
            queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
          }
        }}
      />
    </header>
  );
}
