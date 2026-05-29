import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";
import {
  Bell,
  Trash2,
  CheckCheck,
  Handshake,
  MessageSquare,
  Star,
  Package,
  Info,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const TYPE_ICON: Record<string, React.ReactNode> = {
  deal_update: <Handshake className="h-4 w-4 text-blue-500" />,
  new_proposal: <Handshake className="h-4 w-4 text-blue-500" />,
  message: <MessageSquare className="h-4 w-4 text-violet-500" />,
  rating: <Star className="h-4 w-4 text-yellow-500" />,
  listing: <Package className="h-4 w-4 text-bareter-teal" />,
};

function notifIcon(type: string) {
  return TYPE_ICON[type] ?? <Info className="h-4 w-4 text-muted-foreground" />;
}

function notifLink(n: Notification): string {
  if (n.relatedDealId) return `/deals/${n.relatedDealId}`;
  if (n.relatedListingId) return `/listings/${n.relatedListingId}`;
  if ((n as any).relatedPostId) return `/posts/${(n as any).relatedPostId}`;
  return "#";
}

export function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const readAllMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/notifications"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "All notifications cleared" });
    },
    onError: () => toast({ title: "Failed to clear notifications", variant: "destructive" }),
  });

  if (!user) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl text-center">
        <Bell className="h-14 w-14 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Notifications</h1>
        <p className="text-muted-foreground mb-4">Please log in to see your notifications.</p>
        <Link href="/login"><Button>Log In</Button></Link>
      </div>
    );
  }

  const allTypes = Array.from(new Set(notifications.map((n) => n.type)));

  let visible = [...notifications];
  if (filter === "unread") visible = visible.filter((n) => !n.isRead);
  if (typeFilter !== "all") visible = visible.filter((n) => n.type === typeFilter);
  if (sortBy === "oldest") visible = visible.reverse();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Badge className="rounded-full px-2 py-0.5">{unreadCount}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={readAllMutation.isPending}
              onClick={() => readAllMutation.mutate()}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={deleteAllMutation.isPending}
              onClick={() => {
                if (confirm("Clear all notifications?")) deleteAllMutation.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "unread")}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">
              Unread {unreadCount > 0 && <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">{unreadCount}</Badge>}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2 ml-auto items-center">
          {allTypes.length > 1 && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 text-xs w-36 gap-1">
                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {allTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "newest" | "oldest")}>
            <SelectTrigger className="h-8 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-xl border animate-pulse">
              <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-14 text-center">
          <Bell className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="font-semibold text-foreground">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {filter === "unread"
              ? "You're all caught up!"
              : "Notifications about deals, messages and activity will appear here."}
          </p>
          {filter === "unread" && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setFilter("all")}
            >
              View all notifications
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {visible.map((n) => {
            const href = notifLink(n);
            return (
              <div
                key={n.id}
                className={`group relative flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-colors hover:bg-muted/40 ${!n.isRead ? "bg-primary/5 border-primary/20" : "border-transparent"}`}
              >
                {/* Unread dot */}
                {!n.isRead && (
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />
                )}

                {/* Icon */}
                <div className="mt-0.5 h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  {notifIcon(n.type)}
                </div>

                {/* Content — clickable area navigates to related entity */}
                <Link
                  href={href}
                  className="flex-1 min-w-0"
                  onClick={() => {
                    if (!n.isRead) readMutation.mutate(n.id);
                  }}
                >
                  <p className={`text-sm leading-snug ${!n.isRead ? "font-semibold" : "font-medium"}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.createdAt!), { addSuffix: true })}
                  </p>
                </Link>

                {/* Actions */}
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                  {!n.isRead && (
                    <button
                      title="Mark as read"
                      onClick={() => readMutation.mutate(n.id)}
                      className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted"
                    >
                      <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                  <button
                    title="Delete"
                    onClick={() => deleteMutation.mutate(n.id)}
                    className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-destructive/10"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
