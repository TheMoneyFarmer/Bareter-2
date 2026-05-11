import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useWaitlist } from "@/lib/waitlist";
import { useQuery } from "@tanstack/react-query";
import {
  Compass,
  Plus,
  MessageSquare,
  User,
  LogIn,
  Rss,
} from "lucide-react";

export function MobileBottomNav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { mode: waitlistMode, open: openWaitlist } = useWaitlist();
  const [location] = useLocation();

  const { data: inboxData } = useQuery<{ count: number }>({
    queryKey: ["/api/inbox-unread-count"],
    enabled: !!user,
    refetchInterval: 30000,
  });
  const inboxUnread = inboxData?.count || 0;

  const isActive = (path: string) =>
    location === path || (path !== "/" && location.startsWith(path));

  const profileHref = user ? "/profile" : "/login";
  const profileLabel = user ? t("nav.profile") : t("nav.login");
  const loginIntercept = !user && waitlistMode.enabled;
  const feedActive = isActive("/feed") || (!user && location === "/");

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 md:hidden"
      data-testid="mobile-bottom-nav"
      aria-label="Primary"
    >
      <div className="relative bg-white dark:bg-card border-t border-bareter-border dark:border-border h-[60px] safe-area-bottom shadow-[0_-2px_8px_rgba(15,25,35,0.08)]">
        <div className="grid grid-cols-5 h-full">
          {/* Browse — social feed of latest barters */}
          <Link
            href="/feed"
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
              feedActive
                ? "text-bareter-teal"
                : "text-bareter-muted dark:text-muted-foreground"
            }`}
            data-testid="mobile-tab-feed"
          >
            <Rss className="h-5 w-5" strokeWidth={feedActive ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Browse</span>
          </Link>

          {/* Discover — rich category hub with featured + AI matches */}
          <Link
            href="/browse"
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
              isActive("/browse")
                ? "text-bareter-teal"
                : "text-bareter-muted dark:text-muted-foreground"
            }`}
            data-testid="mobile-tab-browse"
          >
            <Compass className="h-5 w-5" strokeWidth={isActive("/browse") ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Discover</span>
          </Link>

          {/* List (FAB placeholder slot — keeps grid balanced) */}
          <div className="flex items-end justify-center" />

          {/* Messages */}
          {user ? (
            <Link
              href="/inbox"
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${
                isActive("/inbox")
                  ? "text-bareter-teal"
                  : "text-bareter-muted dark:text-muted-foreground"
              }`}
              data-testid="mobile-tab-inbox"
            >
              <div className="relative">
                <MessageSquare
                  className="h-5 w-5"
                  strokeWidth={isActive("/inbox") ? 2.5 : 2}
                />
                {inboxUnread > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 bg-destructive text-destructive-foreground text-[9px] rounded-full min-w-[14px] h-[14px] flex items-center justify-center font-bold px-0.5">
                    {inboxUnread > 9 ? "9+" : inboxUnread}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">Messages</span>
            </Link>
          ) : (
            <div className="flex items-center justify-center text-bareter-muted/30 dark:text-muted-foreground/30">
              <MessageSquare className="h-5 w-5" />
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
                isActive(profileHref)
                  ? "text-bareter-teal"
                  : "text-bareter-muted dark:text-muted-foreground"
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

        {/* Elevated +List FAB — center, sits above the bar */}
        {user ? (
          <Link
            href="/create-listing"
            className="absolute inset-x-0 mx-auto -top-6 h-14 w-14 rounded-full bg-bareter-teal hover:bg-bareter-teal-light text-white shadow-bareter-hover flex items-center justify-center transition-colors active:scale-95"
            data-testid="mobile-tab-create-listing"
            aria-label="List a barter"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </Link>
        ) : loginIntercept ? (
          <button
            type="button"
            onClick={openWaitlist}
            className="absolute inset-x-0 mx-auto -top-6 h-14 w-14 rounded-full bg-bareter-teal hover:bg-bareter-teal-light text-white shadow-bareter-hover flex items-center justify-center transition-colors active:scale-95"
            data-testid="mobile-tab-create-listing"
            aria-label="Join the waitlist to list"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </button>
        ) : (
          <Link
            href="/login"
            className="absolute inset-x-0 mx-auto -top-6 h-14 w-14 rounded-full bg-bareter-teal hover:bg-bareter-teal-light text-white shadow-bareter-hover flex items-center justify-center transition-colors active:scale-95"
            data-testid="mobile-tab-create-listing"
            aria-label="Sign in to list a barter"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </Link>
        )}
      </div>
    </nav>
  );
}
