import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CategoryNav } from "./CategoryNav";
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
  MessageSquare,
  MapPin,
  X,
  Heart,
  Bookmark,
  FileText,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import type { Notification } from "@shared/schema";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function Header() {
  const { user, logout } = useAuth();
  const { mode: waitlistMode, open: openWaitlist } = useWaitlist();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t, isRTL } = useI18n();
  const [location, navigate] = useLocation();

  const persistLanguageMutation = useMutation({
    mutationFn: async (lang: "en" | "ar") => {
      try {
        const res = await apiRequest("PATCH", "/api/users/settings", { language: lang });
        return await res.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("401")) return null;
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
  const activeLocation = useActiveLocation();

  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try { return localStorage.getItem("bareter_verify_banner_dismissed") === "1"; } catch { return false; }
  });
  const dismissBanner = () => {
    setBannerDismissed(true);
    try { localStorage.setItem("bareter_verify_banner_dismissed", "1"); } catch {}
  };

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

  const showVerifyBanner = user && !user.isVerified && !bannerDismissed;

  const { state: pushState, subscribe: subscribePush } = usePushNotifications();
  const [pushDismissed, setPushDismissed] = useState(() => {
    try { return localStorage.getItem("bareter_push_dismissed") === "1"; } catch { return false; }
  });
  const showPushBanner = !!user && pushState === "default" && !pushDismissed;
  const dismissPushBanner = () => {
    setPushDismissed(true);
    try { localStorage.setItem("bareter_push_dismissed", "1"); } catch {}
  };

  const navItemClass =
    "relative flex flex-col items-center gap-0.5 px-3 py-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer";
  const navLabelClass = "text-[11px] font-medium leading-none whitespace-nowrap";

  return (
    <header className="sticky top-0 z-50 w-full" data-testid="site-header">

      {/* ── Push notification opt-in banner ── */}
      {showPushBanner && (
        <div className="bg-teal-700 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm">
          <Bell className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs sm:text-sm">Get instant alerts when you receive a proposal or counter-offer.</span>
          <button
            type="button"
            onClick={() => { subscribePush(); dismissPushBanner(); }}
            className="ms-1 px-3 py-1 border border-white rounded text-xs font-semibold hover:bg-white hover:text-teal-700 transition-colors whitespace-nowrap"
          >
            Enable
          </button>
          <button type="button" onClick={dismissPushBanner} className="ms-1 p-1 hover:bg-white/10 rounded" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Verification banner ── */}
      {showVerifyBanner && (
        <div className="bg-[#1565c0] text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
          <ShieldCheck className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span className="hidden sm:block text-center leading-snug">
            Join us in building a safer community. Get verified to boost your credibility and assist us in creating trust amongst our users!
          </span>
          <span className="sm:hidden text-center leading-snug text-xs">Get verified to boost your credibility!</span>
          <Link href="/settings">
            <button
              type="button"
              className="ms-1 px-3 py-1 border border-white rounded text-xs font-semibold hover:bg-white hover:text-[#1565c0] transition-colors whitespace-nowrap"
            >
              Verify Now
            </button>
          </Link>
          <button
            type="button"
            onClick={dismissBanner}
            className="ms-1 p-1 hover:bg-white/10 rounded"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Main teal header bar ── */}
      <div className="bg-bareter-teal text-white shadow-[0_2px_8px_rgba(34,160,160,0.20)]">
        <div className="container mx-auto max-w-7xl px-4 flex items-center gap-2 sm:gap-3 h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center flex-shrink-0" data-testid="link-home">
            <img
              src="/logo-full-white.png"
              alt={t("app.name") || "Bareter"}
              className="h-8 sm:h-9 w-auto"
            />
          </Link>

          {/* Location pill */}
          <button
            type="button"
            onClick={() => setLocationPickerOpen(true)}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-white/10 rounded-md transition-colors whitespace-nowrap flex-shrink-0"
            data-testid="button-location-pill"
          >
            <MapPin className="h-4 w-4 text-white/70" aria-hidden="true" />
            <span className="max-w-[100px] truncate">{locationPillLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-white/60" />
          </button>

          {/* ── CENTER nav (logged-in, desktop) ── */}
          {user && (
            <div className="hidden lg:flex items-center gap-0.5 mx-auto">

              {/* Feed */}
              <Link href="/feed" className={navItemClass} data-testid="button-nav-feed">
                <Rss className="h-5 w-5" />
                <span className={navLabelClass}>Feed</span>
              </Link>

              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={navItemClass} data-testid="button-notifications">
                    <Bell className="h-5 w-5" />
                    <span className={navLabelClass}>Notifications</span>
                    {unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-0.5 right-1.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px]"
                      >
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </Badge>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-96 p-0">
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4" />
                      <span className="font-semibold text-sm">{t("nav.notifications")}</span>
                      {unreadCount > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">{unreadCount}</Badge>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline font-medium"
                        onClick={(e) => {
                          e.preventDefault();
                          apiRequest("PATCH", "/api/notifications/read-all").then(() =>
                            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })
                          );
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-[420px] overflow-y-auto divide-y">
                    {notifications && notifications.length > 0 ? (
                      notifications.map((notification) => {
                        const n = notification as any;
                        const actionUrl = n.relatedListingId
                          ? `/listings/${n.relatedListingId}`
                          : n.relatedDealId
                          ? `/deals/${n.relatedDealId}`
                          : null;
                        const actionLabel = n.relatedListingId ? "Review Proposal →" : "View Deal →";
                        return (
                          <Link
                            key={notification.id}
                            href={actionUrl || "#"}
                            className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer block ${!notification.isRead ? "bg-accent/40" : ""}`}
                            onClick={() => {
                              if (!notification.isRead) {
                                apiRequest("PATCH", `/api/notifications/${notification.id}/read`).then(() =>
                                  queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })
                                );
                              }
                            }}
                          >
                            <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${!notification.isRead ? "bg-primary" : "bg-transparent"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-tight">{notification.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.message}</p>
                              {actionUrl && (
                                <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-1.5">
                                  {actionLabel}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })
                    ) : (
                      <div className="py-10 text-center text-muted-foreground text-sm">
                        <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        {t("nav.noNotifications")}
                      </div>
                    )}
                  </div>
                  {notifications && notifications.length > 0 && (
                    <div className="border-t px-4 py-2.5 bg-muted/20">
                      <Link href="/notifications" className="text-xs text-center block text-primary hover:underline font-medium">
                        View all notifications
                      </Link>
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* My Searches */}
              <Link href="/my-searches" className={navItemClass} data-testid="button-nav-searches">
                <Bookmark className="h-5 w-5" />
                <span className={navLabelClass}>My Searches</span>
              </Link>

              {/* Favorites — liked listings */}
              <Link href="/saved" className={navItemClass} data-testid="button-nav-favorites">
                <Heart className="h-5 w-5" />
                <span className={navLabelClass}>Favorites</span>
              </Link>

              {/* Chats — direct messages / inbox */}
              <Link href="/inbox" className={navItemClass} data-testid="button-inbox">
                <MessageSquare className="h-5 w-5" />
                <span className={navLabelClass}>Chats</span>
                {inboxUnread > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-0.5 right-1.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px]"
                  >
                    {inboxUnread > 9 ? "9+" : inboxUnread}
                  </Badge>
                )}
              </Link>

              {/* My Listings → dashboard */}
              <Link href="/dashboard" className={navItemClass} data-testid="button-nav-my-listings">
                <FileText className="h-5 w-5" />
                <span className={navLabelClass}>My Listings</span>
              </Link>

              {/* Deals — active/completed/pending */}
              <Link href="/deals" className={navItemClass} data-testid="button-nav-deals">
                <Handshake className="h-5 w-5" />
                <span className={navLabelClass}>Deals</span>
              </Link>
            </div>
          )}

          {/* ── RIGHT section ── */}
          <div className={`${user ? "" : "ms-auto"} flex items-center gap-1.5`}>

            {/* Language + theme */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10"
              aria-label={language === "en" ? t("nav.switchToArabic") : t("nav.switchToEnglish")}
            >
              <Languages className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10"
              aria-label="Toggle theme"
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Mobile search toggle */}
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              className="lg:hidden h-8 w-8 inline-flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>

            {user ? (
              <>
                {/* Avatar + name dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
                      data-testid="button-user-menu"
                    >
                      <div className="relative">
                        <Avatar className="h-8 w-8 ring-2 ring-bareter-teal/20">
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
                      </div>
                      <span className="hidden md:block text-sm font-medium text-white max-w-[90px] truncate">
                        {user.fullName.split(" ")[0]}
                      </span>
                      <ChevronDown className="hidden md:block h-3.5 w-3.5 text-white/60" />
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
                        <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                      </div>
                    </div>
                    <Link href="/profile">
                      <DropdownMenuItem className="cursor-pointer" data-testid="menu-profile">
                        <User className="me-2 h-4 w-4" />{t("nav.profile")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/feed">
                      <DropdownMenuItem className="cursor-pointer">
                        <Rss className="me-2 h-4 w-4" />{t("nav.feed")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/browse">
                      <DropdownMenuItem className="cursor-pointer">
                        <Search className="me-2 h-4 w-4" />{t("nav.browseMarketplace")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/deals">
                      <DropdownMenuItem className="cursor-pointer">
                        <Handshake className="me-2 h-4 w-4" />{t("nav.myDeals")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/dashboard">
                      <DropdownMenuItem className="cursor-pointer">
                        <LayoutDashboard className="me-2 h-4 w-4" />{t("nav.dashboard")}
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/settings">
                      <DropdownMenuItem className="cursor-pointer">
                        <Settings className="me-2 h-4 w-4" />{t("nav.settings")}
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
                      <LogOut className="me-2 h-4 w-4" />{t("nav.logout")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* List a Barter — Bareter teal CTA */}
                <Link href="/create-listing" className="hidden sm:inline-flex">
                  <Button
                    variant="bareter"
                    size="sm"
                    className="h-10 gap-1.5 whitespace-nowrap"
                    data-testid="button-list-trade"
                  >
                    <Plus className="h-4 w-4" />
                    List a Barter
                  </Button>
                </Link>

                {/* Mobile hamburger */}
                <Sheet>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      className="lg:hidden h-8 w-8 inline-flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10"
                      data-testid="button-mobile-menu"
                      aria-label="Menu"
                    >
                      <Menu className="h-5 w-5" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side={isRTL ? "left" : "right"} className="w-72">
                    <nav className="flex flex-col gap-1 mt-8">
                      <Link href="/create-listing">
                        <Button variant="bareter" className="w-full justify-start gap-2 h-11">
                          <Plus className="h-4 w-4" />
                          {t("nav.listABarter")}
                        </Button>
                      </Link>
                      <Link href="/feed">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <Rss className="h-4 w-4" />{t("nav.feed")}
                        </Button>
                      </Link>
                      <div className="h-2" />
                      <Link href="/profile">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <User className="h-4 w-4" />{t("nav.profile")}
                        </Button>
                      </Link>
                      <Link href="/dashboard">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <LayoutDashboard className="h-4 w-4" />{t("nav.dashboard")}
                        </Button>
                      </Link>
                      <Link href="/inbox">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <MessageSquare className="h-4 w-4" />Chats
                          {inboxUnread > 0 && <Badge variant="destructive" className="ms-auto text-xs">{inboxUnread}</Badge>}
                        </Button>
                      </Link>
                      <Link href="/deals">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <Handshake className="h-4 w-4" />Deals
                        </Button>
                      </Link>
                      <Link href="/saved">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <Heart className="h-4 w-4" />Favorites
                        </Button>
                      </Link>
                      <Link href="/settings">
                        <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                          <Settings className="h-4 w-4" />{t("nav.settings")}
                        </Button>
                      </Link>
                      {user.isAdmin && (
                        <Link href="/admin">
                          <Button variant="bareter-ghost" className="w-full justify-start gap-2 h-11">
                            <Shield className="h-4 w-4" />{t("nav.admin")}
                            <Badge variant="destructive" className="ms-auto text-xs">Admin</Badge>
                          </Button>
                        </Link>
                      )}
                      <div className="border-t my-2" />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="bareter-ghost"
                          className="flex-1 justify-start gap-2"
                          onClick={toggleLanguage}
                        >
                          <Languages className="h-4 w-4" />
                          {language === "en" ? t("nav.switchToArabic") : t("nav.switchToEnglish")}
                        </Button>
                        <Button
                          variant="bareter-ghost"
                          className="flex-1 justify-start gap-2"
                          onClick={toggleTheme}
                        >
                          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                          {theme === "light" ? t("nav.darkMode") : t("nav.lightMode")}
                        </Button>
                      </div>
                      <Button
                        variant="bareter-ghost"
                        className="w-full justify-start gap-2 text-destructive"
                        onClick={logout}
                      >
                        <LogOut className="h-4 w-4" />{t("nav.logout")}
                      </Button>
                    </nav>
                  </SheetContent>
                </Sheet>
              </>
            ) : waitlistMode.enabled ? (
              <div className="flex items-center gap-1.5">
                <Link href="/login" className="hidden sm:inline-flex">
                  <Button
                    variant="bareter-ghost"
                    size="sm"
                    className="h-10 text-white/80 hover:text-white hover:bg-white/10"
                    data-testid="button-login"
                  >
                    {t("nav.login")}
                  </Button>
                </Link>
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
              <div className="flex items-center gap-1.5">
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
                  <Button
                    variant="bareter"
                    size="sm"
                    className="h-10"
                    data-testid="button-register"
                  >
                    {t("nav.register")}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile expandable search row */}
        {mobileSearchOpen && (
          <div className="lg:hidden border-t border-white/15 bg-bareter-teal px-4 py-3">
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
          </div>
        )}
      </div>

      {/* ── Category navigation bar — Dubizzle-style hover dropdowns ── */}
      <CategoryNav />

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
