import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useWaitlist } from "@/lib/waitlist";
import { useQuery } from "@tanstack/react-query";
import {
  Compass,
  Plus,
  Bell,
  User,
  LogIn,
  Rss,
} from "lucide-react";

export function MobileBottomNav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { mode: waitlistMode, open: openWaitlist } = useWaitlist();
  const [location] = useLocation();

  const { data: notifData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!user,
    refetchInterval: 30000,
  });
  const notifUnread = notifData?.count || 0;

  const isActive = (path: string) =>
    location === path || (path !== "/" && location.startsWith(path));

  const profileHref = user ? "/profile" : "/login";
  const profileLabel = user ? t("nav.profile") : t("nav.login");
  const loginIntercept = !user && waitlistMode.enabled;
  const feedActive = isActive("/feed") || (!user && location === "/");

  return (
    <nav
      className="fixed bottom-4 left-3 right-3 z-50 md:hidden"
      data-testid="mobile-bottom-nav"
      aria-label="Primary"
    >
      <div className="relative bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-full shadow-[0_4px_24px_rgba(0,0,0,0.14)] h-[60px] px-1">
        <div className="grid grid-cols-5 h-full">
          {/* Discover */}
          <Link
            href="/feed"
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
              feedActive ? "text-bareter-teal" : "text-bareter-muted dark:text-muted-foreground"
            }`}
            data-testid="mobile-tab-feed"
          >
            <Compass className="h-5 w-5" strokeWidth={feedActive ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Discover</span>
          </Link>

          {/* Browse */}
          <Link
            href="/browse"
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
              isActive("/browse") ? "text-bareter-teal" : "text-bareter-muted dark:text-muted-foreground"
            }`}
            data-testid="mobile-tab-browse"
          >
            <Rss className="h-5 w-5" strokeWidth={isActive("/browse") ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Browse</span>
          </Link>

          {/* Center: Create Listing — teal circle within the pill */}
          {user ? (
            <Link
              href="/create-listing"
              className="flex items-center justify-center"
              data-testid="mobile-tab-create-listing"
              aria-label="List a barter"
            >
              <div className="h-11 w-11 rounded-full bg-bareter-teal hover:bg-bareter-teal-light text-white flex items-center justify-center transition-all active:scale-95 shadow-md">
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </div>
            </Link>
          ) : loginIntercept ? (
            <button
              type="button"
              onClick={openWaitlist}
              className="flex items-center justify-center"
              data-testid="mobile-tab-create-listing"
              aria-label="Join the waitlist to list"
            >
              <div className="h-11 w-11 rounded-full bg-bareter-teal hover:bg-bareter-teal-light text-white flex items-center justify-center transition-all active:scale-95 shadow-md">
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </div>
            </button>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center"
              data-testid="mobile-tab-create-listing"
              aria-label="Sign in to list a barter"
            >
              <div className="h-11 w-11 rounded-full bg-bareter-teal hover:bg-bareter-teal-light text-white flex items-center justify-center transition-all active:scale-95 shadow-md">
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </div>
            </Link>
          )}

          {/* Notifications */}
          {user ? (
            <Link
              href="/notifications"
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
                isActive("/notifications") ? "text-bareter-teal" : "text-bareter-muted dark:text-muted-foreground"
              }`}
              data-testid="mobile-tab-notifications"
            >
              <div className="relative">
                <Bell className="h-5 w-5" strokeWidth={isActive("/notifications") ? 2.5 : 2} />
                {notifUnread > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 bg-destructive text-destructive-foreground text-[9px] rounded-full min-w-[14px] h-[14px] flex items-center justify-center font-bold px-0.5">
                    {notifUnread > 9 ? "9+" : notifUnread}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">Alerts</span>
            </Link>
          ) : (
            <div className="flex items-center justify-center text-bareter-muted/30 dark:text-muted-foreground/30">
              <Bell className="h-5 w-5" />
            </div>
          )}

          {/* Profile / Login */}
          {loginIntercept ? (
            <button
              type="button"
              onClick={openWaitlist}
              className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-bareter-muted dark:text-muted-foreground"
              data-testid="mobile-tab-login"
            >
              <LogIn className="h-5 w-5" />
              <span className="text-[10px] font-medium">Join</span>
            </button>
          ) : (
            <Link
              href={profileHref}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
                isActive(profileHref) ? "text-bareter-teal" : "text-bareter-muted dark:text-muted-foreground"
              }`}
              data-testid={user ? "mobile-tab-profile" : "mobile-tab-login"}
            >
              {user ? (
                <User className="h-5 w-5" strokeWidth={isActive("/profile") ? 2.5 : 2} />
              ) : (
                <LogIn className="h-5 w-5" />
              )}
              <span className="text-[10px] font-medium">{profileLabel}</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
