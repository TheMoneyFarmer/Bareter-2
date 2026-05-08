import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bot,
  User,
  Headphones,
  Send,
  Loader2,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SupportTicketWithUser, SupportMessageWithSender } from "@shared/schema";

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_user", label: "Waiting on User" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  waiting_user: "bg-purple-100 text-purple-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

function TicketDetailDialog({
  ticket,
  open,
  onClose,
}: {
  ticket: SupportTicketWithUser;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [statusUpdate, setStatusUpdate] = useState(ticket.status);
  const [priorityUpdate, setPriorityUpdate] = useState(ticket.priority);
  const [isInternal, setIsInternal] = useState(false);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<
    SupportMessageWithSender[]
  >({
    queryKey: ["/api/admin/support/tickets", ticket.id, "messages"],
    queryFn: () =>
      fetch(`/api/admin/support/tickets/${ticket.id}/messages`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: open,
    refetchInterval: 15000,
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/support/tickets/${ticket.id}/messages`,
        { content: reply.trim(), isInternal },
      );
      return res.json();
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({
        queryKey: ["/api/admin/support/tickets", ticket.id, "messages"],
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/support/stats"] });
      toast({ title: isInternal ? "Internal note saved" : "Reply sent" });
    },
    onError: () => {
      toast({ title: "Failed to send", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "PATCH",
        `/api/admin/support/tickets/${ticket.id}`,
        {
          status: statusUpdate,
          priority: priorityUpdate,
          internalNote: internalNote || undefined,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/support/stats"] });
      toast({ title: "Ticket updated" });
    },
    onError: () => {
      toast({ title: "Failed to update ticket", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <DialogTitle className="text-base">{ticket.subject}</DialogTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">
              {ticket.ticketNumber}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[ticket.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {ticket.status}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${PRIORITY_COLORS[ticket.priority] ?? "bg-gray-100 text-gray-600"}`}
            >
              {ticket.priority}
            </span>
            {ticket.escalatedAt && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-700">
                <AlertTriangle className="h-3 w-3" />
                Escalated
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            From:{" "}
            <span className="font-medium">
              {ticket.user?.fullName}
            </span>{" "}
            &lt;{ticket.user?.email}&gt;
          </p>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 flex flex-col overflow-hidden border-r">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {messagesLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isUser = msg.senderType === "user";
                    const isAi = msg.senderType === "ai";
                    const isAdmin = msg.senderType === "admin";
                    return (
                      <div
                        key={msg.id}
                        data-testid={`admin-support-msg-${msg.id}`}
                        className={`flex gap-2 ${isUser ? "flex-row" : "flex-row-reverse"}`}
                      >
                        <div
                          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                            isUser
                              ? "bg-gray-200 text-gray-700"
                              : isAi
                              ? "bg-teal-100 text-teal-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {isUser ? (
                            <User className="h-3.5 w-3.5" />
                          ) : isAi ? (
                            <Bot className="h-3.5 w-3.5" />
                          ) : (
                            "A"
                          )}
                        </div>
                        <div className="max-w-[75%]">
                          {msg.isInternal && (
                            <p className="text-[10px] text-amber-600 font-medium mb-0.5">
                              Internal note
                            </p>
                          )}
                          <div
                            className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                              isUser
                                ? "bg-muted text-foreground rounded-tl-none"
                                : msg.isInternal
                                ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-tr-none"
                                : "bg-primary text-primary-foreground rounded-tr-none"
                            }`}
                          >
                            <p className="font-semibold text-[10px] mb-0.5 opacity-70">
                              {isUser
                                ? ticket.user?.fullName
                                : isAi
                                ? "BarterBot"
                                : (msg.sender?.fullName ?? "Admin")}
                            </p>
                            <span className="whitespace-pre-wrap">{msg.content}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t flex-shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                  <input
                    data-testid="checkbox-internal-note"
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="rounded"
                  />
                  Internal note only
                </label>
              </div>
              <div className="flex gap-2">
                <Textarea
                  data-testid="input-admin-support-reply"
                  placeholder={
                    isInternal ? "Add internal note…" : "Reply to user…"
                  }
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  className={`text-xs min-h-[56px] resize-none ${isInternal ? "border-amber-300 bg-amber-50/30" : ""}`}
                />
                <Button
                  data-testid="btn-admin-support-send"
                  size="icon"
                  className="self-end h-9 w-9 flex-shrink-0"
                  disabled={!reply.trim() || replyMutation.isPending}
                  onClick={() => replyMutation.mutate()}
                >
                  {replyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Right panel: ticket management */}
          <div className="w-48 flex-shrink-0 p-3 space-y-4 overflow-y-auto">
            <div>
              <p className="text-xs font-semibold mb-1">Status</p>
              <Select value={statusUpdate} onValueChange={setStatusUpdate}>
                <SelectTrigger
                  data-testid="select-admin-ticket-status"
                  className="text-xs h-7"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1">Priority</p>
              <Select value={priorityUpdate} onValueChange={setPriorityUpdate}>
                <SelectTrigger
                  data-testid="select-admin-ticket-priority"
                  className="text-xs h-7"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value} className="text-xs">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1">Internal Note</p>
              <Textarea
                data-testid="input-admin-internal-note"
                placeholder="Add note…"
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                className="text-xs min-h-[60px] resize-none"
              />
            </div>
            <Button
              data-testid="btn-admin-ticket-update"
              size="sm"
              className="w-full h-7 text-xs"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Save Changes
            </Button>
            <div className="border-t pt-3 space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground">Category</p>
              <p className="text-xs capitalize">{ticket.category}</p>
              <p className="text-[11px] font-semibold text-muted-foreground mt-2">
                AI Handled
              </p>
              <p className="text-xs">{ticket.aiHandled ? "Yes" : "No"}</p>
              {ticket.escalatedAt && (
                <>
                  <p className="text-[11px] font-semibold text-muted-foreground mt-2">
                    Escalated
                  </p>
                  <p className="text-xs text-red-600">
                    {new Date(ticket.escalatedAt).toLocaleDateString()}
                  </p>
                </>
              )}
              <p className="text-[11px] font-semibold text-muted-foreground mt-2">
                Created
              </p>
              <p className="text-xs">
                {ticket.createdAt
                  ? new Date(ticket.createdAt).toLocaleDateString()
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminSupportSection() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketWithUser | null>(null);
  const [search, setSearch] = useState("");

  const { data: tickets = [], isLoading, refetch } = useQuery<SupportTicketWithUser[]>({
    queryKey: ["/api/admin/support/tickets", statusFilter, priorityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      return fetch(`/api/admin/support/tickets?${params}`, {
        credentials: "include",
      }).then((r) => r.json());
    },
  });

  const { data: stats } = useQuery<{
    open: number;
    in_progress: number;
    waiting_user: number;
    resolved: number;
    closed: number;
    total: number;
  }>({
    queryKey: ["/api/admin/support/stats"],
    queryFn: () =>
      fetch("/api/admin/support/stats", { credentials: "include" }).then((r) =>
        r.json(),
      ),
  });

  const filtered = tickets.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.ticketNumber.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.user?.email?.toLowerCase().includes(q) ||
      t.user?.fullName?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Support Tickets</h2>
        <p className="text-muted-foreground">Manage customer support requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Open", value: stats?.open ?? 0, color: "text-blue-600" },
          { label: "In Progress", value: stats?.in_progress ?? 0, color: "text-yellow-600" },
          { label: "Awaiting Reply", value: stats?.waiting_user ?? 0, color: "text-purple-600" },
          { label: "Resolved", value: stats?.resolved ?? 0, color: "text-green-600" },
          { label: "Total", value: stats?.total ?? 0, color: "text-foreground" },
        ].map((s) => (
          <Card key={s.label} data-testid={`support-stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          data-testid="input-support-search"
          placeholder="Search tickets, users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm w-56"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            data-testid="select-support-status-filter"
            className="h-8 text-sm w-40"
          >
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger
            data-testid="select-support-priority-filter"
            className="h-8 text-sm w-40"
          >
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          data-testid="btn-support-refresh"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Ticket table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <Headphones className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-muted-foreground">No support tickets found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Ticket</TableHead>
                  <TableHead className="text-xs">Subject</TableHead>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Priority</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">Messages</TableHead>
                  <TableHead className="text-xs">Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    data-testid={`admin-ticket-row-${ticket.id}`}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelectedTicket(ticket)}
                  >
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {ticket.ticketNumber}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        {ticket.escalatedAt && (
                          <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                        )}
                        <span className="truncate font-medium">{ticket.subject}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>
                        <p className="font-medium">{ticket.user?.fullName}</p>
                        <p className="text-muted-foreground text-[11px]">
                          {ticket.user?.email}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[ticket.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {ticket.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${PRIORITY_COLORS[ticket.priority] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {ticket.priority}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">
                      {ticket.category}
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <div className="flex items-center justify-center gap-1">
                        <MessageSquare className="h-3 w-3 text-muted-foreground" />
                        {ticket.messageCount ?? 0}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ticket.lastActivityAt
                        ? new Date(ticket.lastActivityAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedTicket && (
        <TicketDetailDialog
          ticket={selectedTicket}
          open={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
