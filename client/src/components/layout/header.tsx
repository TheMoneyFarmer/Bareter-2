import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LocationPicker } from "@/components/location-picker";
import { VerifiedBadge } from "@/components/verified-badge";
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
} from "lucide-react";
import type { Notification } from "@shared/schema";

export function Header() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const [location] = useLocation();
  const { toast } = useToast();
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const activeLocation = useActiveLocation();

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
    : userCity
      ? `${userCity}, ${userCountry}`
      : countryEntry?.name || userCountry;

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

  const navItems = [
    { href: "/feed", label: t("nav.browse"), icon: Search },
    { href: "/create-post", label: t("nav.createPost"), icon: PenSquare },
    { href: "/deals", label: t("nav.myDeals"), icon: Handshake },
  ];

  const isActive = (path: string) => location === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-4 px-4 mx-auto max-w-7xl">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Handshake className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">{t("app.name")}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link href="/feed">
              <Button
                variant={isActive("/feed") ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
                data-testid="nav-feed"
              >
                <Rss className="h-4 w-4" />
                {t("nav.feed")}
              </Button>
            </Link>
            <Link href="/browse">
              <Button
                variant={isActive("/browse") ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
                data-testid="nav-browse-marketplace"
              >
                <Search className="h-4 w-4" />
                {t("nav.browseMarketplace")}
              </Button>
            </Link>
            {user && (
              <>
                <Link href="/create-post">
                  <Button
                    variant={isActive("/create-post") ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-2"
                    data-testid="nav-create-post"
                  >
                    <PenSquare className="h-4 w-4" />
                    {t("nav.createPost")}
                  </Button>
                </Link>
                <Link href="/deals">
                  <Button
                    variant={isActive("/deals") ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-2"
                    data-testid="nav-deals"
                  >
                    <Handshake className="h-4 w-4" />
                    {t("nav.myDeals")}
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden sm:flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
              data-testid="button-language-toggle"
            >
              <Languages className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
            >
              {theme === "light" ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
            </Button>
          </div>

          {user && (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex gap-1.5 h-9 max-w-[180px]"
              onClick={() => setLocationPickerOpen(true)}
              data-testid="button-header-location"
              title="Change location"
            >
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="truncate text-xs font-medium">{locationPillLabel}</span>
            </Button>
          )}
          {!user && (
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex gap-1.5 h-9"
              onClick={() => setLocationPickerOpen(true)}
              data-testid="button-header-location-guest"
              title="Browse a country"
            >
              <Globe className="h-4 w-4" />
              <span className="text-xs">{locationPillLabel}</span>
            </Button>
          )}

          {user ? (
            <>
              <Link href="/inbox">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  data-testid="button-inbox"
                >
                  <MessageSquare className="h-5 w-5" />
                  {inboxUnread > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                    >
                      {inboxUnread > 9 ? "9+" : inboxUnread}
                    </Badge>
                  )}
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    data-testid="button-notifications"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                      >
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </Badge>
                    )}
                  </Button>
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-9 w-9 rounded-full"
                    data-testid="button-user-menu"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {user.fullName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <VerifiedBadge
                        kycStatus={user.kycStatus}
                        kybStatus={user.kybStatus}
                        accountType={user.accountType}
                        size="md"
                        testId="header-user-verified"
                      />
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="flex items-center gap-3 p-3 border-b">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {user.fullName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{user.fullName}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </span>
                    </div>
                  </div>
                  <Link href="/profile">
                    <DropdownMenuItem className="cursor-pointer" data-testid="menu-profile">
                      <User className="mr-2 h-4 w-4" />
                      {t("nav.profile")}
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/deals">
                    <DropdownMenuItem className="cursor-pointer" data-testid="menu-deals">
                      <Handshake className="mr-2 h-4 w-4" />
                      {t("nav.myDeals")}
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/dashboard">
                    <DropdownMenuItem className="cursor-pointer" data-testid="menu-dashboard">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      {t("nav.dashboard")}
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/settings">
                    <DropdownMenuItem className="cursor-pointer" data-testid="menu-settings">
                      <Settings className="mr-2 h-4 w-4" />
                      {t("nav.settings")}
                    </DropdownMenuItem>
                  </Link>
                  {user.isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <Link href="/admin">
                        <DropdownMenuItem className="cursor-pointer" data-testid="menu-admin">
                          <Shield className="mr-2 h-4 w-4" />
                          <span className="flex-1">{t("nav.admin")}</span>
                          <Badge variant="destructive" className="ml-2 text-xs">Admin</Badge>
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
                    <LogOut className="mr-2 h-4 w-4" />
                    {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Sheet>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <nav className="flex flex-col gap-2 mt-8">
                    <Link href="/profile">
                      <Button
                        variant={isActive("/profile") ? "secondary" : "ghost"}
                        className="w-full justify-start gap-2"
                      >
                        <User className="h-4 w-4" />
                        {t("nav.profile")}
                      </Button>
                    </Link>
                    <Link href="/dashboard">
                      <Button
                        variant={isActive("/dashboard") ? "secondary" : "ghost"}
                        className="w-full justify-start gap-2"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        {t("nav.dashboard")}
                      </Button>
                    </Link>
                    <Link href="/saved">
                      <Button
                        variant={isActive("/saved") ? "secondary" : "ghost"}
                        className="w-full justify-start gap-2"
                      >
                        <Search className="h-4 w-4" />
                        Saved Items
                      </Button>
                    </Link>
                    <Link href="/referrals">
                      <Button
                        variant={isActive("/referrals") ? "secondary" : "ghost"}
                        className="w-full justify-start gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Referrals
                      </Button>
                    </Link>
                    <Link href="/settings">
                      <Button
                        variant={isActive("/settings") ? "secondary" : "ghost"}
                        className="w-full justify-start gap-2"
                      >
                        <Settings className="h-4 w-4" />
                        {t("nav.settings")}
                      </Button>
                    </Link>
                    {user.isAdmin && (
                      <Link href="/admin">
                        <Button
                          variant={isActive("/admin") ? "secondary" : "ghost"}
                          className="w-full justify-start gap-2"
                        >
                          <Shield className="h-4 w-4" />
                          {t("nav.admin")}
                          <Badge variant="destructive" className="ml-auto text-xs">Admin</Badge>
                        </Button>
                      </Link>
                    )}
                    <div className="border-t my-2" />
                    <div className="flex items-center gap-2 sm:hidden">
                      <Button
                        variant="ghost"
                        className="flex-1 justify-start gap-2"
                        onClick={() => setLanguage(language === "en" ? "ar" : "en")}
                        data-testid="mobile-menu-language"
                      >
                        <Languages className="h-4 w-4" />
                        {language === "en" ? "Arabic" : "English"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="flex-1 justify-start gap-2"
                        onClick={toggleTheme}
                        data-testid="mobile-menu-theme"
                      >
                        {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        {theme === "light" ? "Dark" : "Light"}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
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
          ) : (
            <div className="flex items-center gap-1 sm:gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" data-testid="button-login">
                  {t("nav.login")}
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" data-testid="button-register">{t("nav.register")}</Button>
              </Link>
            </div>
          )}
        </div>
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
