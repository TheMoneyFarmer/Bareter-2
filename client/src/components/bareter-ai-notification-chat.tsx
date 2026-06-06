import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import {
  X,
  Sparkles,
  Handshake,
  MessageSquare,
  Star,
  Package,
  Info,
  ArrowRight,
  Bell,
  CheckCheck,
  Loader2,
  Heart,
  Bookmark,
  UserCheck,
  Shield,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type NotificationWithLink = Notification & { _link?: string };

function notifLink(n: Notification): string {
  if (n.relatedDealId) return `/deals/${n.relatedDealId}`;
  if (n.relatedListingId) return `/listings/${n.relatedListingId}`;
  if ((n as any).relatedPostId) return `/posts/${(n as any).relatedPostId}`;
  return "";
}

function notifIcon(type: string) {
  const cls = "h-3.5 w-3.5 flex-shrink-0";
  switch (type) {
    case "deal_update":
    case "new_proposal":
      return <Handshake className={`${cls} text-blue-400`} />;
    case "message":
      return <MessageSquare className={`${cls} text-violet-400`} />;
    case "rating":
      return <Star className={`${cls} text-yellow-400`} />;
    case "listing":
      return <Package className={`${cls} text-bareter-teal`} />;
    case "like":
    case "heart":
      return <Heart className={`${cls} text-rose-400`} />;
    case "save":
    case "bookmark":
      return <Bookmark className={`${cls} text-amber-400`} />;
    case "follow":
    case "verification":
      return <UserCheck className={`${cls} text-green-400`} />;
    case "security":
    case "account":
      return <Shield className={`${cls} text-slate-400`} />;
    default:
      return <Sparkles className={`${cls} text-bareter-teal`} />;
  }
}

function notifActionLabel(type: string): string | null {
  switch (type) {
    case "deal_update":
    case "new_proposal":
      return "View deal →";
    case "listing":
      return "View listing →";
    case "message":
      return "Open inbox →";
    case "rating":
      return "See rating →";
    default:
      return null;
  }
}

// Deterministic short delay for message stagger animation
function NotifBubble({
  n,
  onNavigate,
  onMarkRead,
  delay,
}: {
  n: NotificationWithLink;
  onNavigate: (link: string) => void;
  onMarkRead: (id: string) => void;
  delay: number;
}) {
  const link = notifLink(n);
  const actionLabel = notifActionLabel(n.type);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const handleAction = () => {
    if (!n.isRead) onMarkRead(n.id);
    if (link) onNavigate(link);
  };

  return (
    <div
      className="flex items-start gap-2 transition-all duration-500"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(8px)" }}
    >
      <div className="h-7 w-7 rounded-full bg-bareter-teal/15 flex-shrink-0 flex items-center justify-center text-bareter-teal text-[10px] font-bold border border-bareter-teal/20 mt-0.5">
        B
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={`rounded-2xl rounded-tl-none px-3.5 py-2.5 text-left cursor-pointer transition-colors ${
            n.isRead
              ? "bg-gray-100 dark:bg-muted hover:bg-gray-150 dark:hover:bg-muted/80"
              : "bg-bareter-teal/10 dark:bg-bareter-teal/15 hover:bg-bareter-teal/15 border border-bareter-teal/20"
          }`}
          onClick={handleAction}
        >
          <div className="flex items-center gap-1.5 mb-1">
            {notifIcon(n.type)}
            <span className="text-[10px] font-bold text-bareter-navy dark:text-foreground/90 uppercase tracking-wide">
              {n.title}
            </span>
            {!n.isRead && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-bareter-teal flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-slate-700 dark:text-foreground/80 leading-relaxed">{n.message}</p>

          {actionLabel && link && (
            <p className="text-[11px] text-bareter-teal font-semibold mt-1.5">{actionLabel}</p>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 ml-1">
          {formatDistanceToNow(new Date(n.createdAt ?? Date.now()), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
      <div className="h-14 w-14 rounded-full bg-bareter-teal/10 flex items-center justify-center mb-3">
        <Bell className="h-6 w-6 text-bareter-teal/50" />
      </div>
      <p className="text-sm font-semibold text-bareter-navy dark:text-foreground mb-1">All caught up!</p>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">
        Bareter will notify you about listing matches, deal updates, messages, and more.
      </p>
    </div>
  );
}

export default function BareterAiNotificationChat() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user && isOpen,
    refetchInterval: isOpen ? 30_000 : false,
    staleTime: 10_000,
  });

  // Also fetch when closed so the badge stays accurate
  const { data: allNotifs = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const unreadCount = allNotifs.filter((n) => !n.isRead).length;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, notifications.length]);

  // Don't render for guests
  if (!user) return null;

  const handleNavigate = (link: string) => {
    navigate(link);
    setIsOpen(false);
  };

  return (
    <>
      {isOpen && (
        <div
          data-testid="bareter-ai-chat-panel"
          className="fixed bottom-20 left-4 md:bottom-6 md:left-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-6rem)] bg-white dark:bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-bareter-teal flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                B
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-white text-sm">Bareter</span>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-white/80 text-[10px]">Online now</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-white/80 hover:text-white hover:bg-white/20 gap-1 px-2"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                >
                  {markAllReadMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3 w-3" />
                  )}
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-4">
            {isLoading ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-bareter-teal/50" />
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {/* Greeting bubble */}
                <div className="flex items-start gap-2">
                  <div className="h-7 w-7 rounded-full bg-bareter-teal/15 flex-shrink-0 flex items-center justify-center text-bareter-teal text-[10px] font-bold border border-bareter-teal/20 mt-0.5">
                    B
                  </div>
                  <div className="bg-gray-100 dark:bg-muted rounded-2xl rounded-tl-none px-3.5 py-2.5 max-w-[85%]">
                    <p className="text-xs text-slate-700 dark:text-foreground/80 leading-relaxed">
                      Here's what's been happening with your account — tap any update to jump right in.
                    </p>
                  </div>
                </div>

                {/* Notification bubbles */}
                {[...notifications].reverse().map((n, i) => (
                  <NotifBubble
                    key={n.id}
                    n={n}
                    onNavigate={handleNavigate}
                    onMarkRead={(id) => markReadMutation.mutate(id)}
                    delay={i * 60}
                  />
                ))}
              </>
            )}
          </div>

          {/* Footer input area */}
          <div className="border-t bg-gray-50 dark:bg-muted/30 px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
            <div className="flex-1 h-9 rounded-xl bg-white dark:bg-background border border-gray-200 dark:border-border flex items-center px-3">
              <span className="text-xs text-muted-foreground">Ask Bareter…</span>
            </div>
            <button
              type="button"
              onClick={() => { navigate("/inbox"); setIsOpen(false); }}
              className="h-9 w-9 rounded-xl bg-bareter-teal hover:bg-bareter-teal/90 flex items-center justify-center flex-shrink-0 transition-colors"
            >
              <Send className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        data-testid="btn-bareter-ai-chat-toggle"
        onClick={() => setIsOpen((o) => !o)}
        className="fixed bottom-20 left-4 md:bottom-6 md:left-6 z-50 w-14 h-14 rounded-full bg-bareter-teal text-white shadow-lg flex items-center justify-center hover:bg-bareter-teal/90 transition-all hover:scale-105 active:scale-95"
        aria-label="Bareter notifications"
        style={{ display: isOpen ? "none" : "flex" }}
      >
        <Sparkles className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}
