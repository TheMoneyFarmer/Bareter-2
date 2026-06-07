import { useEffect, useState, useRef } from "react";
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
import { getCountryByCode, COUNTRIES, getCitiesForCountry } from "@shared/schema";
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
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  Menu, Bell, User, LogOut, Settings,
  Handshake, Search, Plus, Shield, Languages, MessageSquare, MapPin,
  X, Heart, Bookmark, FileText, ChevronDown, ShieldCheck, Sparkles,
  Clock, ArrowRight, BookOpen, HelpCircle, Compass,
} from "lucide-react";
import type { Notification } from "@shared/schema";
import { usePushNotifications } from "@/hooks/use-push-notifications";

// Extracted so it can be rendered without nesting inside a ternary
function NavLinks({ user }: { user: boolean }) {
  const [currentPath] = useLocation();
  const isMarketplace = currentPath.startsWith("/browse") || currentPath === "/feed" || currentPath === "/discover" || currentPath.startsWith("/listings") || currentPath.startsWith("/c/") || currentPath === "/my-searches" || currentPath === "/saved";
  const px = user ? "px-2.5" : "px-3";
  const base = `${px} py-2 text-sm font-semibold text-white/85 hover:text-white hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap`;
  const listHref = user ? "/create-listing" : "/register";
  // Logged-in: always visible. Logged-out: centred absolute, hidden on marketplace pages where search bar takes centre.
  const navClass = user
    ? "hidden lg:flex items-center flex-shrink-0"
    : `hidden lg:flex items-center absolute left-1/2 -translate-x-1/2 ${isMarketplace ? "invisible pointer-events-none" : ""}`;
  return (
    <nav className={navClass}>
      <Link href="/feed"><button type="button" className={base}>Discover</button></Link>
      <Link href="/browse"><button type="button" className={base}>Browse Listings</button></Link>
      <Link href={listHref}><button type="button" className={base}>List a Barter</button></Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={`flex items-center gap-1 ${base}`}>
            Resources <ChevronDown className="h-3.5 w-3.5 text-white/60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 p-1">
          <Link href="/blog"><DropdownMenuItem className="cursor-pointer gap-2.5 px-4 py-2.5"><BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" /><span>Blog</span></DropdownMenuItem></Link>
          <Link href="/help"><DropdownMenuItem className="cursor-pointer gap-2.5 px-4 py-2.5"><HelpCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" /><span>Help Center</span></DropdownMenuItem></Link>
          <Link href="/how-it-works"><DropdownMenuItem className="cursor-pointer gap-2.5 px-4 py-2.5"><Sparkles className="h-4 w-4 text-muted-foreground flex-shrink-0" /><span>How it works</span></DropdownMenuItem></Link>
          <DropdownMenuSeparator />
          <Link href="/#faq"><DropdownMenuItem className="cursor-pointer gap-2.5 px-4 py-2.5"><MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" /><span>FAQs</span></DropdownMenuItem></Link>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const { mode: waitlistMode, open: openWaitlist } = useWaitlist();
  const { language, setLanguage, t, isRTL } = useI18n();
  const [currentPath, navigate] = useLocation();
  // Show search bar + CategoryNav only on marketplace/browse/discover pages
  const isMarketplace = currentPath.startsWith("/browse") || currentPath === "/feed" || currentPath === "/discover" || currentPath.startsWith("/listings") || currentPath.startsWith("/c/") || currentPath === "/my-searches" || currentPath === "/saved";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const activeLocation = useActiveLocation();

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  // Notifications
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

  // Search suggestions
  const { data: suggestionListings } = useQuery<any[]>({
    queryKey: ["/api/listings", { search: searchQuery }],
    queryFn: () => fetch(`/api/listings?search=${encodeURIComponent(searchQuery)}&limit=4`).then(r => r.json()),
    enabled: searchQuery.trim().length >= 2,
    staleTime: 5000,
  });

  // Search history (shown when focused but no query yet)
  const { data: searchHistory } = useQuery<{ history: { id: string; query: string; createdAt: string }[] }>({
    queryKey: ["/api/search-history"],
    enabled: !!user && searchFocused,
    staleTime: 30_000,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchFocused(false);
    if (q.length >= 2) {
      fetch("/api/search-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: q }),
      }).catch(() => {});
    }
    navigate(`/browse?q=${encodeURIComponent(q)}`);
  };

  const showVerifyBanner = user && !user.isVerified && !bannerDismissed;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  const { state: pushState, subscribe: subscribePush } = usePushNotifications();
  const [pushDismissed, setPushDismissed] = useState(() => {
    try { return localStorage.getItem("bareter_push_dismissed") === "1"; } catch { return false; }
  });
  const showPushBanner = !!user && pushState === "default" && !pushDismissed;
  const dismissPushBanner = () => {
    setPushDismissed(true);
    try { localStorage.setItem("bareter_push_dismissed", "1"); } catch {}
  };

  const showSearchDropdown = searchFocused && (
    (searchQuery.trim().length >= 2 && suggestionListings && suggestionListings.length > 0) ||
    (searchQuery.trim().length < 2 && searchHistory?.history && searchHistory.history.length > 0)
  );

  return (
    <header className="sticky top-0 z-50 w-full" data-testid="site-header">

      {/* ── Push notification banner ── */}
      {showPushBanner && (
        <div className="bg-teal-700 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm">
          <Bell className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs sm:text-sm">Get instant alerts for proposals and counter-offers.</span>
          <button type="button" onClick={() => { subscribePush(); dismissPushBanner(); }}
            className="ms-1 px-3 py-1 border border-white rounded text-xs font-semibold hover:bg-white hover:text-teal-700 transition-colors whitespace-nowrap">
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
            Get verified to boost your credibility and build trust in the community.
          </span>
          <span className="sm:hidden text-xs">Get verified to boost credibility!</span>
          <Link href="/profile?tab=verification">
            <button type="button" className="ms-1 px-3 py-1 border border-white rounded text-xs font-semibold hover:bg-white hover:text-[#1565c0] transition-colors whitespace-nowrap">
              Verify Now
            </button>
          </Link>
          <button type="button" onClick={dismissBanner} className="ms-1 p-1 hover:bg-white/10 rounded" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Main header bar ── */}
      <div className="bg-bareter-teal text-white shadow-[0_2px_8px_rgba(34,160,160,0.20)]">
        <div className="container mx-auto max-w-7xl px-4 flex items-center gap-3 h-16 relative">

          {/* Logo */}
          <Link href="/" className="flex items-center flex-shrink-0" data-testid="link-home">
            <img src="/logo-full-white.png" alt={t("app.name") || "Bareter"} className="h-8 sm:h-9 w-auto" />
          </Link>

          {/* ── Centre nav — always visible for logged-in users; swaps with search for logged-out ── */}
          <NavLinks user={!!user} />

          {/* ── Search bar — logged-in: compact beside nav; logged-out: full-width on marketplace pages ── */}
          <div
            ref={searchRef}
            className={[
              "relative hidden sm:block",
              user
                ? "hidden lg:block flex-none w-52"
                : `flex-1 max-w-xl mx-auto ${!isMarketplace ? "invisible pointer-events-none" : ""}`,
            ].join(" ")}
          >
            <form onSubmit={handleSearch} className="flex items-center h-9 bg-white/15 hover:bg-white/20 focus-within:bg-white rounded-lg transition-colors overflow-hidden border border-white/20 focus-within:border-transparent focus-within:shadow-lg">
              <Search className="h-4 w-4 text-white/70 flex-shrink-0 ms-3 focus-within:text-bareter-muted" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder={t("nav.searchBarters") || "Search listings…"}
                className="flex-1 bg-transparent text-white placeholder:text-white/60 text-sm px-2.5 focus:outline-none focus:text-bareter-navy focus:placeholder:text-gray-400"
                autoComplete="off"
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchQuery(""); setSearchFocused(false); }} className="px-2 text-white/60 hover:text-white flex-shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </form>

            {showSearchDropdown && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50">
                {searchQuery.trim().length < 2 && searchHistory?.history && searchHistory.history.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-4 pt-3 pb-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recent searches</p>
                      <Link href="/my-searches" className="text-[10px] font-semibold text-bareter-teal hover:underline">View all</Link>
                    </div>
                    {searchHistory.history.slice(0, 5).map((item) => (
                      <button key={item.id} type="button"
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-start transition-colors"
                        onClick={() => { setSearchQuery(item.query); navigate(`/browse?q=${encodeURIComponent(item.query)}`); setSearchFocused(false); }}>
                        <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-bareter-navy">{item.query}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ms-auto" />
                      </button>
                    ))}
                  </>
                )}
                {searchQuery.trim().length >= 2 && suggestionListings && suggestionListings.length > 0 && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Listings</p>
                    {suggestionListings.slice(0, 4).map((l: any) => (
                      <button key={l.id} type="button"
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-start transition-colors"
                        onClick={() => { setSearchFocused(false); navigate(`/listings/${l.id}`); }}>
                        {(l.images as string[])?.[0] && (
                          <img src={(l.images as string[])[0]} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-bareter-navy truncate">{l.title}</p>
                          <p className="text-xs text-muted-foreground">AED {Number(l.retailValue).toLocaleString()} · {l.location}</p>
                        </div>
                      </button>
                    ))}
                    <div className="border-t border-gray-100 px-4 py-3">
                      <button type="button" className="w-full text-sm font-semibold text-bareter-teal hover:underline text-center"
                        onClick={() => { setSearchFocused(false); navigate(`/browse?q=${encodeURIComponent(searchQuery.trim())}`); }}>
                        Search all results for &ldquo;{searchQuery}&rdquo; →
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Right section ── */}
          <div className="flex items-center gap-1 flex-shrink-0">

            {user ? (
              <>
                {/* ── Notification bell (icon only) ── */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button"
                      className="relative h-8 w-8 inline-flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                      aria-label="Notifications" data-testid="button-notifications">
                      <Bell className="h-4 w-4" />
                      {unreadCount > 0 && (
                        <span className="absolute top-0.5 right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-96 p-0">
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        <span className="font-semibold text-sm">Notifications</span>
                        {unreadCount > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">{unreadCount}</Badge>}
                      </div>
                      {unreadCount > 0 && (
                        <button type="button" className="text-xs text-primary hover:underline font-medium"
                          onClick={() => apiRequest("PATCH", "/api/notifications/read-all").then(() =>
                            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }))}>
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-[380px] overflow-y-auto divide-y">
                      {notifications && notifications.length > 0 ? (
                        notifications.map((notification) => {
                          const n = notification as any;
                          const actionUrl = n.relatedListingId
                            ? `/listings/${n.relatedListingId}`
                            : n.relatedDealId ? `/deals/${n.relatedDealId}` : null;
                          return (
                            <Link key={notification.id} href={actionUrl || "#"}
                              className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer block ${!notification.isRead ? "bg-accent/40" : ""}`}
                              onClick={() => {
                                if (!notification.isRead) {
                                  apiRequest("PATCH", `/api/notifications/${notification.id}/read`).then(() =>
                                    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }));
                                }
                              }}>
                              <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${!notification.isRead ? "bg-primary" : "bg-transparent"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-tight">{notification.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.message}</p>
                              </div>
                            </Link>
                          );
                        })
                      ) : (
                        <div className="py-10 text-center text-muted-foreground text-sm">
                          <Bell className="h-8 w-8 mx-auto mb-2 opacity-25" />
                          {t("nav.noNotifications")}
                        </div>
                      )}
                    </div>
                    {notifications && notifications.length > 0 && (
                      <div className="border-t px-4 py-2.5 bg-muted/10">
                        <Link href="/notifications" className="text-xs text-center block text-primary hover:underline font-medium">
                          View all notifications
                        </Link>
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* ── User dropdown ── */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button"
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                      data-testid="button-user-menu">
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
                          <AvatarFallback className="bg-white/20 text-white text-sm font-bold">
                            {user.fullName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-0.5 -end-0.5">
                          <VerifiedBadge kycStatus={user.kycStatus} kybStatus={user.kybStatus} accountType={user.accountType} size="md" testId="header-user-verified" />
                        </span>
                      </div>
                      <span className="hidden md:block text-sm font-medium text-white max-w-[80px] truncate">
                        {user.fullName.split(" ")[0]}
                      </span>
                      <ChevronDown className="hidden md:block h-3.5 w-3.5 text-white/60" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-64 p-0">
                    {/* Profile header */}
                    <div className="flex items-center gap-3 p-4 border-b bg-muted/20">
                      <Avatar className="h-11 w-11 flex-shrink-0">
                        <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
                        <AvatarFallback className="bg-bareter-teal text-white font-bold">
                          {user.fullName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm truncate">{user.fullName}</span>
                          <FounderBadge show={!!user.founderBadge} />
                        </div>
                        <span className="text-xs text-muted-foreground truncate block">{user.email}</span>
                      </div>
                    </div>

                    {/* Navigation items — onSelect fires after the menu closes,
                        then navigate() imperatively routes without any event conflicts */}
                    <div className="py-1">
                      <DropdownMenuItem onSelect={() => navigate("/profile")} className="cursor-pointer gap-2.5 px-4 py-2.5" data-testid="menu-profile">
                        <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>Profile</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate("/dashboard")} className="cursor-pointer gap-2.5 px-4 py-2.5">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>My Listings</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate("/profile?tab=drafts")} className="cursor-pointer gap-2.5 px-4 py-2.5">
                        <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>My Drafts</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate("/deals")} className="cursor-pointer gap-2.5 px-4 py-2.5">
                        <Handshake className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>Deals</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate("/saved")} className="cursor-pointer gap-2.5 px-4 py-2.5">
                        <Heart className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>Favorites</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate("/inbox")} className="cursor-pointer gap-2.5 px-4 py-2.5">
                        <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1">Chats</span>
                        {inboxUnread > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">{inboxUnread}</Badge>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate("/browse")} className="cursor-pointer gap-2.5 px-4 py-2.5">
                        <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>Browse Listings</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate("/my-searches")} className="cursor-pointer gap-2.5 px-4 py-2.5">
                        <Bookmark className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>Search History</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate("/creators")} className="cursor-pointer gap-2.5 px-4 py-2.5 opacity-70">
                        <Sparkles className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1">Creators</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-semibold">Soon</Badge>
                      </DropdownMenuItem>
                    </div>

                    <DropdownMenuSeparator />

                    <div className="py-1">
                      <DropdownMenuItem onSelect={() => navigate("/settings")} className="cursor-pointer gap-2.5 px-4 py-2.5">
                        <Settings className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>{t("nav.settings")}</span>
                      </DropdownMenuItem>
                      {user.isAdmin && (
                        <DropdownMenuItem onSelect={() => navigate("/admin")} className="cursor-pointer gap-2.5 px-4 py-2.5" data-testid="menu-admin">
                          <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="flex-1">Admin Panel</span>
                          <Badge variant="destructive" className="text-[10px]">Admin</Badge>
                        </DropdownMenuItem>
                      )}
                    </div>

                    <DropdownMenuSeparator />

                    <div className="py-1">
                      <DropdownMenuItem onClick={logout}
                        className="cursor-pointer gap-2.5 px-4 py-2.5 text-destructive focus:text-destructive"
                        data-testid="menu-logout">
                        <LogOut className="h-4 w-4 flex-shrink-0" />
                        <span>Logout</span>
                      </DropdownMenuItem>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Location dropdown — far right, inline auto-save */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button"
                      className="hidden md:flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
                      data-testid="button-location-pill">
                      <MapPin className="h-3.5 w-3.5 text-white/70" />
                      <span className="max-w-[80px] truncate">{locationPillLabel}</span>
                      <ChevronDown className="h-3 w-3 text-white/60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 p-3" data-testid="dropdown-location">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Your location</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Country</label>
                        <select
                          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-bareter-teal"
                          value={userCountry}
                          onChange={(e) => {
                            const newCountry = e.target.value;
                            updateLocationMutation.mutate({ country: newCountry, city: "" });
                          }}
                        >
                          {COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      {(() => {
                        const cities = getCitiesForCountry(userCountry);
                        return cities.length > 0 ? (
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">City</label>
                            <select
                              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-bareter-teal"
                              value={userCity ?? ""}
                              onChange={(e) => updateLocationMutation.mutate({ country: userCountry, city: e.target.value })}
                            >
                              <option value="">All cities</option>
                              {cities.map((city) => (
                                <option key={city} value={city}>{city}</option>
                              ))}
                            </select>
                          </div>
                        ) : null;
                      })()}
                    </div>
                    <DropdownMenuSeparator className="my-2" />
                    <button
                      type="button"
                      className="w-full text-xs text-center text-bareter-teal hover:underline font-medium py-0.5"
                      onClick={() => updateLocationMutation.mutate({ country: "WORLDWIDE", city: "" })}
                    >
                      🌍 Show worldwide listings
                    </button>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Mobile hamburger */}
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <button type="button"
                      className="lg:hidden h-8 w-8 inline-flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
                      data-testid="button-mobile-menu" aria-label="Menu">
                      <Menu className="h-5 w-5" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side={isRTL ? "left" : "right"} className="w-72 p-0">
                    {/* Mobile user info */}
                    <div className="flex items-center gap-3 p-4 border-b bg-muted/20">
                      <Avatar className="h-11 w-11 flex-shrink-0">
                        <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
                        <AvatarFallback className="bg-bareter-teal text-white font-bold">{user.fullName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{user.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                    {/* Mobile search */}
                    <div className="p-3 border-b">
                      <form onSubmit={(e) => { handleSearch(e); closeMobileMenu(); }} className="flex items-center gap-2 h-10 bg-muted/40 rounded-lg px-3">
                        <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search listings…" className="flex-1 bg-transparent text-sm focus:outline-none" />
                      </form>
                    </div>
                    <nav className="flex flex-col py-2">
                      <Link href="/create-listing" onClick={closeMobileMenu}>
                        <Button variant="bareter" className="mx-3 mb-2 w-[calc(100%-24px)] justify-start gap-2 h-11">
                          <Plus className="h-4 w-4" />{t("nav.listABarter")}
                        </Button>
                      </Link>
                      {[
                        { href: "/feed", icon: <Compass className="h-4 w-4" />, label: "Discover" },
                        { href: "/browse", icon: <Search className="h-4 w-4" />, label: "Browse Listings" },
                        { href: "/profile", icon: <User className="h-4 w-4" />, label: "Profile" },
                        { href: "/dashboard", icon: <FileText className="h-4 w-4" />, label: "My Listings" },
                        { href: "/profile?tab=drafts", icon: <BookOpen className="h-4 w-4" />, label: "My Drafts" },
                        { href: "/deals", icon: <Handshake className="h-4 w-4" />, label: "Deals" },
                        { href: "/saved", icon: <Heart className="h-4 w-4" />, label: "Favorites" },
                        { href: "/inbox", icon: <MessageSquare className="h-4 w-4" />, label: "Chats", badge: inboxUnread },
                        { href: "/my-searches", icon: <Bookmark className="h-4 w-4" />, label: "Search History" },
                      ].map(({ href, icon, label, badge }) => (
                        <Link key={href} href={href} onClick={closeMobileMenu}>
                          <button type="button" className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-start">
                            <span className="text-muted-foreground">{icon}</span>
                            <span className="text-sm font-medium flex-1">{label}</span>
                            {badge ? <Badge variant="destructive" className="text-[10px]">{badge}</Badge> : null}
                          </button>
                        </Link>
                      ))}
                      {/* Creators — coming soon */}
                      <Link href="/creators" onClick={closeMobileMenu}>
                        <button type="button" className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-start opacity-70">
                          <span className="text-muted-foreground"><Sparkles className="h-4 w-4" /></span>
                          <span className="text-sm font-medium flex-1">Creators</span>
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-semibold">Soon</Badge>
                        </button>
                      </Link>
                      {user.isAdmin && (
                        <Link href="/admin" onClick={closeMobileMenu}>
                          <button type="button" className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-start">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium flex-1">Admin Panel</span>
                            <Badge variant="destructive" className="text-[10px]">Admin</Badge>
                          </button>
                        </Link>
                      )}
                      <div className="border-t mx-4 my-2" />
                      <button type="button" onClick={() => { closeMobileMenu(); toggleLanguage(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-start">
                        <Languages className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{language === "en" ? "العربية" : "English"}</span>
                      </button>
                      <div className="border-t mx-4 my-2" />
                      <button type="button" onClick={() => { closeMobileMenu(); logout(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition-colors text-destructive text-start"
                        data-testid="menu-logout">
                        <LogOut className="h-4 w-4" />
                        <span className="text-sm font-medium">Logout</span>
                      </button>
                    </nav>
                  </SheetContent>
                </Sheet>
              </>
            ) : waitlistMode.enabled ? (
              <Button size="sm" className="h-9 bg-white text-bareter-teal hover:bg-white/90 font-bold rounded-lg" onClick={openWaitlist} data-testid="button-join-waitlist">
                {t("nav.joinWaitlist")}
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link href="/login" className="hidden sm:inline-flex">
                  <Button variant="ghost" size="sm" className="h-9 text-white hover:bg-white/10 rounded-lg" data-testid="button-login">
                    {t("nav.login")}
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="h-9 bg-white text-bareter-teal hover:bg-white/90 font-bold rounded-lg" data-testid="button-register">
                    {t("nav.register")}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Category navigation bar — marketplace pages only ── */}
      {isMarketplace && <CategoryNav />}

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
