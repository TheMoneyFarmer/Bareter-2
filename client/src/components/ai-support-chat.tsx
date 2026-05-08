import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Send,
  Bot,
  User,
  Loader2,
  Headphones,
  ChevronLeft,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Search,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { SupportTicketWithUser, SupportMessageWithSender } from "@shared/schema";

type View = "list" | "thread" | "new" | "lookup";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  in_progress: { label: "In Progress", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  waiting_user: { label: "Awaiting Reply", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  closed: { label: "Closed", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

const CATEGORIES = [
  { value: "account", label: "Account & Login" },
  { value: "listing", label: "Listings" },
  { value: "deal", label: "Deals & Contracts" },
  { value: "verification", label: "Verification (KYC/KYB)" },
  { value: "bug", label: "Bug Report" },
  { value: "other", label: "Other" },
];

function TicketStatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

function TicketList({
  tickets,
  onSelect,
  onNewTicket,
  onLookup,
  isGuest,
}: {
  tickets: SupportTicketWithUser[];
  onSelect: (t: SupportTicketWithUser) => void;
  onNewTicket: () => void;
  onLookup?: () => void;
  isGuest?: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b">
        <span className="font-semibold text-sm">My Tickets</span>
        <Button
          data-testid="btn-support-new-ticket"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={onNewTicket}
        >
          <Plus className="h-3 w-3" />
          New
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center gap-2">
            <Headphones className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No tickets yet</p>
            <p className="text-xs text-muted-foreground">Need help? Open a support ticket.</p>
            <Button
              data-testid="btn-support-open-first-ticket"
              size="sm"
              variant="outline"
              className="mt-1 h-7 text-xs"
              onClick={onNewTicket}
            >
              Open a Ticket
            </Button>
            {isGuest && onLookup && (
              <Button
                data-testid="btn-support-lookup-tickets"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={onLookup}
              >
                <Search className="h-3 w-3 mr-1" />
                Find existing tickets by email
              </Button>
            )}
          </div>
        ) : (
          <div>
            <ul className="divide-y">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  data-testid={`ticket-row-${ticket.id}`}
                  className="p-3 hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => onSelect(ticket)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-medium line-clamp-1 flex-1">{ticket.subject}</span>
                    <TicketStatusBadge status={ticket.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground font-mono">{ticket.ticketNumber}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {ticket.messageCount ?? 0} msg{(ticket.messageCount ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {ticket.lastMessage && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{ticket.lastMessage}</p>
                  )}
                </li>
              ))}
            </ul>
            {isGuest && onLookup && (
              <div className="p-3 border-t">
                <Button
                  data-testid="btn-support-lookup-more"
                  size="sm"
                  variant="ghost"
                  className="w-full h-7 text-xs text-muted-foreground"
                  onClick={onLookup}
                >
                  <Search className="h-3 w-3 mr-1" />
                  Find more tickets by email
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GuestLookupForm({
  onBack,
  onFound,
}: {
  onBack: () => void;
  onFound: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/support/tickets/resume", {
        email: email.trim().toLowerCase(),
        ticketNumber: ticketNumber.trim().toUpperCase(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Not found");
      }
      return res.json() as Promise<{ ticketId: string; ticketNumber: string; subject: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({ title: "Ticket found! Returning to your tickets." });
      onFound();
    },
    onError: () => {
      toast({
        title: "Ticket not found",
        description: "Check the email and ticket number from your confirmation email.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b flex-shrink-0">
        <Button
          data-testid="btn-lookup-back"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">Find My Ticket</span>
      </div>
      <div className="flex-1 p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Enter the email and ticket number from your confirmation email to access your ticket history.
        </p>
        <div>
          <label className="text-xs font-medium mb-1 block">Email address</label>
          <Input
            data-testid="input-lookup-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-xs h-8"
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">Ticket number</label>
          <Input
            data-testid="input-lookup-ticket-number"
            placeholder="TKT-XXXXXXX"
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value.toUpperCase())}
            className="text-xs h-8 font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter" && email.trim() && ticketNumber.trim()) resumeMutation.mutate();
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Your ticket number is in the confirmation email we sent when you opened your ticket (e.g. TKT-1A2B3C4D).
        </p>
      </div>
      <div className="p-3 border-t flex-shrink-0">
        <Button
          data-testid="btn-lookup-submit"
          className="w-full h-8 text-sm"
          disabled={!email.trim() || !ticketNumber.trim() || resumeMutation.isPending}
          onClick={() => resumeMutation.mutate()}
        >
          {resumeMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Find Ticket
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function TicketThread({
  ticket,
  onBack,
}: {
  ticket: SupportTicketWithUser;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<SupportMessageWithSender[]>({
    queryKey: ["/api/support/tickets", ticket.id, "messages"],
    queryFn: () =>
      fetch(`/api/support/tickets/${ticket.id}/messages`, { credentials: "include" }).then((r) =>
        r.json(),
      ),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const replyMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/support/tickets/${ticket.id}/messages`, {
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["/api/support/tickets", ticket.id, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    },
    onError: () => {
      toast({ title: "Failed to send", description: "Please try again.", variant: "destructive" });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/support/tickets/${ticket.id}/escalate`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/support/tickets", ticket.id, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({ title: "Escalated", description: "A human agent will respond shortly." });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/support/tickets/${ticket.id}/close`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      onBack();
      toast({ title: "Ticket closed" });
    },
  });

  const handleSend = () => {
    const msg = reply.trim();
    if (!msg || replyMutation.isPending) return;
    replyMutation.mutate(msg);
  };

  const isClosed = ticket.status === "closed" || ticket.status === "resolved";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b flex-shrink-0">
        <Button
          data-testid="btn-support-back"
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{ticket.subject}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-mono">{ticket.ticketNumber}</span>
            <TicketStatusBadge status={ticket.status} />
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.senderType === "user";
            const isAi = msg.senderType === "ai";
            return (
              <div
                key={msg.id}
                data-testid={`support-msg-${msg.id}`}
                className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : isAi
                      ? "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"
                  }`}
                >
                  {isUser ? (
                    <User className="h-3 w-3" />
                  ) : isAi ? (
                    <Bot className="h-3 w-3" />
                  ) : (
                    <span className="text-[10px] font-bold">A</span>
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-muted text-foreground rounded-tl-none"
                  }`}
                >
                  {!isUser && (
                    <p className="font-semibold text-[10px] mb-0.5 opacity-70">
                      {isAi ? "BarterBot" : (msg.sender?.fullName ?? "Support Agent")}
                    </p>
                  )}
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!isClosed ? (
        <div className="p-3 border-t space-y-2 flex-shrink-0">
          <div className="flex gap-2">
            <Textarea
              data-testid="input-support-reply"
              placeholder="Type your reply…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              className="text-xs min-h-[52px] max-h-[100px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              data-testid="btn-support-send-reply"
              size="icon"
              className="self-end h-9 w-9 flex-shrink-0"
              disabled={!reply.trim() || replyMutation.isPending}
              onClick={handleSend}
            >
              {replyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex gap-2">
            {ticket.aiHandled && !ticket.escalatedAt && (
              <Button
                data-testid="btn-support-escalate"
                variant="outline"
                size="sm"
                className="text-xs h-7 flex-1"
                disabled={escalateMutation.isPending}
                onClick={() => escalateMutation.mutate()}
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Talk to human
              </Button>
            )}
            <Button
              data-testid="btn-support-close-ticket"
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground flex-1"
              disabled={closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Mark resolved
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t text-center flex-shrink-0">
          <p className="text-xs text-muted-foreground">
            This ticket is {ticket.status}.
          </p>
        </div>
      )}
    </div>
  );
}

function NewTicketForm({
  onBack,
  onSuccess,
  isGuest,
}: {
  onBack: () => void;
  onSuccess: () => void;
  isGuest: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [message, setMessage] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  const canSubmit = subject.trim() && message.trim() &&
    (!isGuest || (guestName.trim() && guestEmail.trim()));

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { subject, category, message };
      if (isGuest) {
        body.requesterName = guestName.trim();
        body.requesterEmail = guestEmail.trim().toLowerCase();
      }
      const res = await apiRequest("POST", "/api/support/tickets", body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to create ticket");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({
        title: "Ticket created",
        description: "Our AI assistant will reply shortly.",
      });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: err.message ?? "Failed to create ticket", variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b flex-shrink-0">
        <Button
          data-testid="btn-new-ticket-back"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">New Support Ticket</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isGuest && (
          <div className="bg-muted/40 rounded-lg p-3 space-y-2">
            <p className="text-[11px] text-muted-foreground font-medium">Your contact details</p>
            <div>
              <label className="text-xs font-medium mb-1 block">Your name *</label>
              <Input
                data-testid="input-guest-name"
                placeholder="Full name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="text-xs h-8"
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Email address *</label>
              <Input
                data-testid="input-guest-email"
                type="email"
                placeholder="you@example.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="text-xs h-8"
                maxLength={200}
              />
            </div>
          </div>
        )}
        <div>
          <label className="text-xs font-medium mb-1 block">Category</label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="select-ticket-category" className="text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">Subject</label>
          <Input
            data-testid="input-ticket-subject"
            placeholder="Brief description of your issue"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="text-xs h-8"
            maxLength={200}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">Message</label>
          <Textarea
            data-testid="input-ticket-message"
            placeholder="Describe your issue in detail…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="text-xs min-h-[100px] resize-none"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Our AI assistant will respond immediately. You can request a human agent at any time.
        </p>
      </div>
      <div className="p-3 border-t flex-shrink-0">
        <Button
          data-testid="btn-submit-ticket"
          className="w-full h-8 text-sm gap-1.5"
          disabled={!canSubmit || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit Ticket
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function AiSupportChat() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketWithUser | null>(null);

  const { data: tickets = [] } = useQuery<SupportTicketWithUser[]>({
    queryKey: ["/api/support/tickets"],
    enabled: isOpen,
  });

  const openCount = tickets.filter(
    (t) => t.status !== "closed" && t.status !== "resolved",
  ).length;

  const handleSelectTicket = (t: SupportTicketWithUser) => {
    setSelectedTicket(t);
    setView("thread");
  };

  const handleBack = () => {
    setSelectedTicket(null);
    setView("list");
  };

  return (
    <>
      {isOpen && (
        <div
          data-testid="support-chat-panel"
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-80 h-[480px] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground flex-shrink-0">
            <div className="flex items-center gap-2">
              <Headphones className="h-4 w-4" />
              <span className="font-semibold text-sm">Support</span>
            </div>
            <Button
              data-testid="btn-support-close"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary-foreground hover:bg-white/20"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-hidden">
            {view === "new" ? (
              <NewTicketForm
                onBack={handleBack}
                onSuccess={() => setView("list")}
                isGuest={!user}
              />
            ) : view === "lookup" ? (
              <GuestLookupForm onBack={handleBack} onFound={handleBack} />
            ) : view === "thread" && selectedTicket ? (
              <TicketThread ticket={selectedTicket} onBack={handleBack} />
            ) : (
              <TicketList
                tickets={tickets}
                onSelect={handleSelectTicket}
                onNewTicket={() => setView("new")}
                onLookup={!user ? () => setView("lookup") : undefined}
                isGuest={!user}
              />
            )}
          </div>
        </div>
      )}

      <button
        data-testid="btn-support-toggle"
        onClick={() => setIsOpen((o) => !o)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        aria-label="Support"
        style={{ display: isOpen ? "none" : "flex" }}
      >
        <Headphones className="h-5 w-5" />
        {user && openCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {openCount > 9 ? "9+" : openCount}
          </span>
        )}
      </button>
    </>
  );
}
