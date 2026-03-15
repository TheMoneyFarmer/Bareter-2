import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  Rss,
  Compass,
  PlusSquare,
  Handshake,
  User,
  LogIn,
  MessageSquare,
} from "lucide-react";

export function MobileBottomNav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [location] = useLocation();

  const { data: inboxData } = useQuery<{ count: number }>({
    queryKey: ["/api/inbox-unread-count"],
    enabled: !!user,
    refetchInterval: 30000,
  });
  const inboxUnread = inboxData?.count || 0;

  const isActive = (path: string) => location === path;

  const tabs = [
    { href: "/feed", label: t("nav.feed"), icon: Rss, requiresAuth: false, id: "feed" },
    { href: "/browse", label: t("nav.browse"), icon: Compass, requiresAuth: false, id: "browse" },
    { href: "/create-post", label: t("nav.createPost"), icon: PlusSquare, requiresAuth: true, id: "create-post" },
    { href: "/inbox", label: "Inbox", icon: MessageSquare, requiresAuth: true, id: "inbox", badge: inboxUnread },
    { href: user ? "/profile" : "/login", label: user ? t("nav.profile") : t("nav.login"), icon: user ? User : LogIn, requiresAuth: false, id: user ? "profile" : "login" },
  ];

  const visibleTabs = tabs.filter((tab) => !tab.requiresAuth || user);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      data-testid="mobile-bottom-nav"
    >
      <div className="flex items-center justify-around h-14 px-1 safe-area-bottom">
        {visibleTabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[3.5rem] py-1 px-2 ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid={`mobile-tab-${tab.id}`}
            >
              <div className="relative">
                <tab.icon className={`h-5 w-5 ${active ? "stroke-[2.5px]" : ""}`} />
                {"badge" in tab && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-tight truncate">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
