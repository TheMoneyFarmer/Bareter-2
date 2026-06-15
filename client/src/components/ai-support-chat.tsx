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
  ChevronRight,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Search,
  Home as HomeIcon,
  MessageCircle,
  BookOpen,
  Sparkles,
  Mail,
  Phone,
  MessageSquare,
  UserPlus,
  FileText,
  CreditCard,
  Shield,
  HelpCircle,
  Paperclip,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  HELP_CATEGORIES,
  searchHelpContent,
  type HelpCategory,
  type HelpArticle,
  type HelpIconName,
} from "@/lib/help-content";
import type { SupportTicketWithUser, SupportMessageWithSender } from "@shared/schema";

type Tab = "home" | "messages" | "help";
type SubView = "list" | "thread" | "new" | "lookup" | "identity" | "article";
type GuestIdentity = { name: string; email: string };

const HELP_ICON_MAP: Record<HelpIconName, typeof UserPlus> = {
  "user-plus": UserPlus,
  "file-text": FileText,
  "message-square": MessageSquare,
  "credit-card": CreditCard,
  shield: Shield,
  "help-circle": HelpCircle,
};

type PublicSettings = Record<string, string | null>;

// Attachment helpers
type Attachment = { name: string; url: string; isImage: boolean };
const ATTACHMENT_PREFIX = "📎 ";
const ATTACH_RE = /📎 \[([^\]]+)\]\(([^)]+)\)/g;

function formatAttachmentsForContent(attachments: Attachment[]): string {
  return attachments.map(a => `📎 [${a.name}](${a.url})`).join("\n");
}

function parseMessageContent(content: string): { text: string; attachments: { name: string; url: string; isImage: boolean }[] } {
  const attachments: { name: string; url: string; isImage: boolean }[] = [];
  let match;
  ATTACH_RE.lastIndex = 0;
  while ((match = ATTACH_RE.exec(content)) !== null) {
    const [, name, url] = match;
    attachments.push({ name, url, isImage: /\.(jpe?g|png|gif|webp)$/i.test(url) });
  }
  const text = content.replace(ATTACH_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text, attachments };
}

async function uploadSupportFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", "support");
  const res = await fetch("/api/upload", { method: "POST", credentials: "include", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? "Upload failed");
  }
  const data = await res.json();
  return data.url as string;
}

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
  prefillEmail,
}: {
  onBack: () => void;
  onFound: () => void;
  prefillEmail?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState(prefillEmail ?? "");
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      toast({ title: "Escalated", description: "A support representative will respond shortly." });
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        files.map(async (f) => {
          const url = await uploadSupportFile(f);
          return { name: f.name, url, isImage: f.type.startsWith("image/") };
        })
      );
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      toast({ title: err?.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSend = () => {
    const msg = reply.trim();
    const attachStr = attachments.length ? formatAttachmentsForContent(attachments) : "";
    const fullContent = [msg, attachStr].filter(Boolean).join("\n\n");
    if (!fullContent || replyMutation.isPending) return;
    replyMutation.mutate(fullContent);
    setAttachments([]);
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
                  {(() => {
                    const { text, attachments: msgAttachments } = parseMessageContent(msg.content);
                    return (
                      <>
                        {text && <span className="whitespace-pre-wrap">{text}</span>}
                        {msgAttachments.length > 0 && (
                          <div className={`${text ? "mt-2" : ""} space-y-1.5`}>
                            {msgAttachments.map((a, ai) =>
                              a.isImage ? (
                                <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer">
                                  <img src={a.url} alt={a.name} className="max-w-[180px] rounded-md border object-cover" />
                                </a>
                              ) : (
                                <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] underline underline-offset-2 opacity-90 hover:opacity-100">
                                  <FileText className="h-3 w-3 flex-shrink-0" />{a.name}
                                </a>
                              )
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })
        )}
      </div>

      {!isClosed ? (
        <div className="p-3 border-t space-y-2 flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div key={i} className="relative group">
                  {a.isImage ? (
                    <img src={a.url} alt={a.name} className="h-14 w-14 object-cover rounded-md border" />
                  ) : (
                    <div className="h-14 w-14 flex flex-col items-center justify-center rounded-md border bg-muted text-center px-1">
                      <FileText className="h-5 w-5 text-muted-foreground mb-0.5" />
                      <span className="text-[9px] text-muted-foreground leading-tight truncate w-full text-center">{a.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 flex-shrink-0 self-end"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              title="Attach image or document"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
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
              disabled={(!reply.trim() && !attachments.length) || replyMutation.isPending || uploading}
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
                Talk to a support representative
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

function GuestIdentityForm({
  onIdentified,
}: {
  onIdentified: (identity: GuestIdentity) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const canContinue = name.trim().length > 0 && email.trim().includes("@");

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">Welcome to Support</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Before we get started, please tell us who you are so we can keep track of your tickets.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <label className="text-xs font-medium mb-1 block">Your name *</label>
          <Input
            data-testid="input-identity-name"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xs h-8"
            maxLength={100}
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">Email address *</label>
          <Input
            data-testid="input-identity-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-xs h-8"
            maxLength={200}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canContinue)
                onIdentified({ name: name.trim(), email: email.trim().toLowerCase() });
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          We'll send your ticket confirmation and updates to this email.
        </p>
      </div>
      <div className="p-3 border-t flex-shrink-0 space-y-2">
        <Button
          data-testid="btn-identity-continue"
          className="w-full h-8 text-sm"
          disabled={!canContinue}
          onClick={() =>
            onIdentified({ name: name.trim(), email: email.trim().toLowerCase() })
          }
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

function NewTicketForm({
  onBack,
  onSuccess,
  isGuest,
  prefillName,
  prefillEmail,
}: {
  onBack: () => void;
  onSuccess: () => void;
  isGuest: boolean;
  prefillName?: string;
  prefillEmail?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [message, setMessage] = useState("");
  const [guestName, setGuestName] = useState(prefillName ?? "");
  const [guestEmail, setGuestEmail] = useState(prefillEmail ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        files.map(async (f) => {
          const url = await uploadSupportFile(f);
          return { name: f.name, url, isImage: f.type.startsWith("image/") };
        })
      );
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      toast({ title: err?.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const canSubmit = subject.trim() && (message.trim() || attachments.length > 0) &&
    (!isGuest || (guestName.trim() && guestEmail.trim()));

  const createMutation = useMutation({
    mutationFn: async () => {
      const attachStr = attachments.length ? formatAttachmentsForContent(attachments) : "";
      const fullMessage = [message.trim(), attachStr].filter(Boolean).join("\n\n");
      const body: Record<string, string> = { subject, category, message: fullMessage };
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
        description: "BarterBot will reply shortly.",
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
            {prefillName ? (
              <p className="text-xs font-medium">{guestName} · {guestEmail}</p>
            ) : (
              <>
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
              </>
            )}
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
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((a, i) => (
                <div key={i} className="relative group">
                  {a.isImage ? (
                    <img src={a.url} alt={a.name} className="h-14 w-14 object-cover rounded-md border" />
                  ) : (
                    <div className="h-14 w-14 flex flex-col items-center justify-center rounded-md border bg-muted px-1">
                      <FileText className="h-5 w-5 text-muted-foreground mb-0.5" />
                      <span className="text-[9px] text-muted-foreground leading-tight truncate w-full text-center">{a.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            {uploading ? "Uploading…" : "Attach images or documents"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          BarterBot will respond immediately. You can request a support representative at any time.
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

function HomeTab({
  user,
  tickets,
  supportEmail,
  supportPhone,
  onAskQuestion,
  onOpenTicket,
  onGoMessages,
  onGoHelp,
  onSelectTicket,
}: {
  user: ReturnType<typeof useAuth>["user"];
  tickets: SupportTicketWithUser[];
  supportEmail?: string | null;
  supportPhone?: string | null;
  onAskQuestion: (question: string) => void;
  onOpenTicket: () => void;
  onGoMessages: () => void;
  onGoHelp: () => void;
  onSelectTicket: (t: SupportTicketWithUser) => void;
}) {
  const [draft, setDraft] = useState("");
  const firstName = (user?.fullName || user?.email || "").trim().split(/\s+/)[0] || "there";
  const recentOpen = tickets
    .filter((t) => t.status !== "closed" && t.status !== "resolved")
    .slice(0, 2);
  const waLink =
    supportPhone && supportPhone.replace(/\D/g, "").length >= 6
      ? `https://wa.me/${supportPhone.replace(/\D/g, "")}`
      : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 pt-5 pb-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <p className="text-xs text-muted-foreground font-medium">Bareter Support</p>
        <h2 className="text-2xl font-bold mt-1" data-testid="text-support-greeting">
          Hi {firstName} <span className="inline-block">👋</span>
        </h2>
        <h3 className="text-2xl font-bold text-muted-foreground/80">How can we help?</h3>
      </div>

      <div className="px-3 pt-3 pb-2 space-y-2">
        {/* Quick ask card */}
        <div className="border rounded-xl p-3 bg-background hover-elevate">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Ask a question</span>
          </div>
          <div className="flex gap-2">
            <Input
              data-testid="input-support-quick-ask"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim().length >= 3) {
                  onAskQuestion(draft.trim());
                  setDraft("");
                }
              }}
              placeholder="Type your question…"
              className="h-8 text-xs"
            />
            <Button
              data-testid="btn-support-quick-ask"
              size="sm"
              className="h-8 px-3"
              disabled={draft.trim().length < 3}
              onClick={() => {
                onAskQuestion(draft.trim());
                setDraft("");
              }}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Get an instant answer from BarterBot.
          </p>
        </div>

        {/* Recent open tickets */}
        {recentOpen.length > 0 && (
          <div className="border rounded-xl bg-background overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-xs font-semibold">Your recent conversations</span>
              <Button
                data-testid="btn-support-home-see-all"
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={onGoMessages}
              >
                See all
                <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </div>
            <ul className="divide-y">
              {recentOpen.map((t) => (
                <li
                  key={t.id}
                  data-testid={`home-ticket-${t.id}`}
                  className="px-3 py-2 hover:bg-muted/40 cursor-pointer"
                  onClick={() => onSelectTicket(t)}
                >
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <span className="text-xs font-medium line-clamp-1 flex-1">{t.subject}</span>
                    <TicketStatusBadge status={t.status} />
                  </div>
                  {t.lastMessage && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{t.lastMessage}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action cards */}
        <button
          type="button"
          data-testid="btn-support-home-new-ticket"
          onClick={onOpenTicket}
          className="w-full border rounded-xl p-3 bg-background flex items-center justify-between hover-elevate text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold">Send us a message</div>
              <div className="text-[11px] text-muted-foreground">Open a support ticket</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        <button
          type="button"
          data-testid="btn-support-home-help"
          onClick={onGoHelp}
          className="w-full border rounded-xl p-3 bg-background flex items-center justify-between hover-elevate text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold">Browse Help Center</div>
              <div className="text-[11px] text-muted-foreground">Guides, FAQs, VAT &amp; more</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-support-whatsapp"
            className="w-full border rounded-xl p-3 bg-background flex items-center justify-between hover-elevate"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <Phone className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <div className="text-sm font-semibold">Chat on WhatsApp</div>
                <div className="text-[11px] text-muted-foreground">{supportPhone}</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
        )}

        {supportEmail && (
          <a
            href={`mailto:${supportEmail}`}
            data-testid="link-support-email"
            className="w-full border rounded-xl p-3 bg-background flex items-center justify-between hover-elevate"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Mail className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-semibold">Email us</div>
                <div className="text-[11px] text-muted-foreground">{supportEmail}</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
        )}
      </div>
    </div>
  );
}

function HelpTab({
  onBack,
  onOpenArticle,
}: {
  onBack: () => void;
  onOpenArticle: (cat: HelpCategory, art: HelpArticle) => void;
}) {
  const [query, setQuery] = useState("");
  const results = query.trim() ? searchHelpContent(query) : [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-4 pb-3 border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex-shrink-0">
        <h2 className="text-lg font-bold mb-2">Help Center</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            data-testid="input-support-help-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for help"
            className="h-9 pl-8 text-sm bg-background"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {query.trim() ? (
          results.length === 0 ? (
            <div className="text-center py-8">
              <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium">No results for "{query}"</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try different keywords or send us a message.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {results.map(({ category, article }) => (
                <li key={`${category.slug}-${article.title}`}>
                  <button
                    type="button"
                    data-testid={`help-result-${category.slug}-${article.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    onClick={() => onOpenArticle(category, article)}
                    className="w-full text-left border rounded-lg p-3 hover-elevate"
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">
                      {category.title}
                    </div>
                    <div className="text-sm font-medium line-clamp-1">{article.title}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {article.body}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            <p className="text-xs text-muted-foreground px-1">Browse by topic</p>
            <ul className="space-y-2">
              {HELP_CATEGORIES.map((cat) => {
                const Icon = HELP_ICON_MAP[cat.icon];
                return (
                  <li key={cat.slug}>
                    <details className="group border rounded-lg overflow-hidden">
                      <summary
                        data-testid={`help-category-${cat.slug}`}
                        className="flex items-center gap-3 p-3 cursor-pointer hover-elevate list-none"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold">{cat.title}</div>
                          <div className="text-[11px] text-muted-foreground line-clamp-1">
                            {cat.description}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                      </summary>
                      <ul className="border-t divide-y">
                        {cat.articles.map((art) => (
                          <li key={art.title}>
                            <button
                              type="button"
                              data-testid={`help-article-${cat.slug}-${art.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                              onClick={() => onOpenArticle(cat, art)}
                              className="w-full text-left px-3 py-2 hover-elevate text-xs"
                            >
                              {art.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/help"
              data-testid="link-support-full-help"
              className="block text-center text-xs text-primary font-medium pt-2 pb-1 hover:underline"
            >
              Open full Help Center →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function ArticleView({
  category,
  article,
  onBack,
  onAskMore,
}: {
  category: HelpCategory;
  article: HelpArticle;
  onBack: () => void;
  onAskMore: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0">
        <Button
          data-testid="btn-support-article-back"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground line-clamp-1">{category.title}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="text-base font-semibold mb-2" data-testid="text-support-article-title">
          {article.title}
        </h2>
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
          {article.body}
        </p>
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2">Still need help?</p>
          <Button
            data-testid="btn-support-article-ask"
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-1"
            onClick={onAskMore}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Send us a message
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuickAskResult({
  question,
  answer,
  isLoading,
  onBack,
  onEscalate,
}: {
  question: string;
  answer: string;
  isLoading: boolean;
  onBack: () => void;
  onEscalate: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0">
        <Button
          data-testid="btn-support-quickask-back"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-semibold">BarterBot</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="flex justify-end">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%] text-sm">
            {question}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%] text-sm whitespace-pre-line">
            {isLoading ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </span>
            ) : (
              answer || "Sorry — I couldn't find an answer right now."
            )}
          </div>
        </div>
        {!isLoading && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">Was this helpful?</p>
            <Button
              data-testid="btn-support-quickask-escalate"
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1"
              onClick={onEscalate}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              No — open a support ticket
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AiSupportChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [subView, setSubView] = useState<SubView | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketWithUser | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<{
    category: HelpCategory;
    article: HelpArticle;
  } | null>(null);
  const [guestIdentity, setGuestIdentityState] = useState<GuestIdentity | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("bareter:supportGuestIdentity");
      return raw ? (JSON.parse(raw) as GuestIdentity) : null;
    } catch {
      return null;
    }
  });
  const setGuestIdentity = (identity: GuestIdentity | null) => {
    setGuestIdentityState(identity);
    try {
      if (identity) {
        localStorage.setItem("bareter:supportGuestIdentity", JSON.stringify(identity));
      } else {
        localStorage.removeItem("bareter:supportGuestIdentity");
      }
    } catch {
      /* ignore quota / privacy mode */
    }
  };
  const [quickAsk, setQuickAsk] = useState<{ question: string; answer: string } | null>(null);

  const { data: tickets = [] } = useQuery<SupportTicketWithUser[]>({
    queryKey: ["/api/support/tickets"],
    enabled: isOpen && (!user ? guestIdentity !== null : true),
  });

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["/api/public/settings"],
    staleTime: 60_000,
  });

  const supportEmail = settings?.support_email || settings?.contact_email || null;
  const supportPhone = settings?.support_phone || null;

  const openCount = tickets.filter(
    (t) => t.status !== "closed" && t.status !== "resolved",
  ).length;

  const quickAskMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/support/quick-ask", { message });
      return (await res.json()) as { response: string };
    },
    onSuccess: (data, message) => {
      setQuickAsk({ question: message, answer: data.response });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't get an answer",
        description: err?.message ?? "Please try again or open a support ticket.",
        variant: "destructive",
      });
      setQuickAsk(null);
    },
  });

  const handleSelectTicket = (t: SupportTicketWithUser) => {
    setSelectedTicket(t);
    setSubView("thread");
    setTab("messages");
  };

  const handleNewTicket = () => {
    setSubView("new");
    setTab("messages");
  };

  const handleSubBack = () => {
    setSelectedTicket(null);
    setSubView(null);
  };

  const handleAskQuestion = (q: string) => {
    setQuickAsk({ question: q, answer: "" });
    quickAskMutation.mutate(q);
  };

  // Subview rendering (overlays the active tab)
  const renderSubView = () => {
    if (!subView) return null;
    if (subView === "new") {
      return (
        <NewTicketForm
          onBack={handleSubBack}
          onSuccess={() => {
            setSubView(null);
            setTab("messages");
          }}
          isGuest={!user}
          prefillName={guestIdentity?.name}
          prefillEmail={guestIdentity?.email}
        />
      );
    }
    if (subView === "lookup") {
      return (
        <GuestLookupForm
          onBack={handleSubBack}
          onFound={handleSubBack}
          prefillEmail={guestIdentity?.email}
        />
      );
    }
    if (subView === "thread" && selectedTicket) {
      return <TicketThread ticket={selectedTicket} onBack={handleSubBack} />;
    }
    if (subView === "article" && selectedArticle) {
      return (
        <ArticleView
          category={selectedArticle.category}
          article={selectedArticle.article}
          onBack={() => {
            setSelectedArticle(null);
            setSubView(null);
          }}
          onAskMore={() => {
            setSelectedArticle(null);
            handleNewTicket();
          }}
        />
      );
    }
    return null;
  };

  const renderTab = () => {
    if (tab === "home") {
      if (quickAsk) {
        return (
          <QuickAskResult
            question={quickAsk.question}
            answer={quickAsk.answer}
            isLoading={quickAskMutation.isPending}
            onBack={() => setQuickAsk(null)}
            onEscalate={() => {
              setQuickAsk(null);
              handleNewTicket();
            }}
          />
        );
      }
      return (
        <HomeTab
          user={user}
          tickets={tickets}
          supportEmail={supportEmail}
          supportPhone={supportPhone}
          onAskQuestion={handleAskQuestion}
          onOpenTicket={handleNewTicket}
          onGoMessages={() => setTab("messages")}
          onGoHelp={() => setTab("help")}
          onSelectTicket={handleSelectTicket}
        />
      );
    }
    if (tab === "messages") {
      return (
        <TicketList
          tickets={tickets}
          onSelect={handleSelectTicket}
          onNewTicket={handleNewTicket}
          onLookup={!user ? () => setSubView("lookup") : undefined}
          isGuest={!user}
        />
      );
    }
    return (
      <HelpTab
        onBack={() => setTab("home")}
        onOpenArticle={(category, article) => {
          setSelectedArticle({ category, article });
          setSubView("article");
        }}
      />
    );
  };

  const showTabBar = !subView;
  const guestNeedsIdentity = !user && !guestIdentity && tab === "messages";

  return (
    <>
      {isOpen && (
        <div
          data-testid="support-chat-panel"
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-6rem)] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-1.5">
                <div className="w-7 h-7 rounded-full bg-white/20 border-2 border-primary flex items-center justify-center text-[10px] font-bold">
                  B
                </div>
                <div className="w-7 h-7 rounded-full bg-white/30 border-2 border-primary flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-semibold text-sm">Bareter</span>
                <span className="text-[10px] opacity-80">Usually replies within an hour</span>
              </div>
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

          {/* Body */}
          <div className="flex-1 overflow-hidden">
            {subView ? (
              renderSubView()
            ) : guestNeedsIdentity ? (
              <GuestIdentityForm
                onIdentified={(identity) => {
                  setGuestIdentity(identity);
                }}
              />
            ) : (
              renderTab()
            )}
          </div>

          {/* Bottom tab bar */}
          {showTabBar && (
            <div className="flex items-stretch border-t bg-background flex-shrink-0">
              {(
                [
                  { id: "home" as const, label: "Home", icon: HomeIcon, badge: 0 },
                  {
                    id: "messages" as const,
                    label: "Messages",
                    icon: MessageCircle,
                    badge: openCount,
                  },
                  { id: "help" as const, label: "Help", icon: BookOpen, badge: 0 },
                ]
              ).map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`tab-support-${t.id}`}
                    onClick={() => {
                      setTab(t.id);
                      setQuickAsk(null);
                    }}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors relative ${
                      active
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="relative">
                      <Icon className="h-5 w-5" />
                      {t.badge > 0 && (
                        <span
                          data-testid={`badge-tab-${t.id}`}
                          className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center"
                        >
                          {t.badge > 9 ? "9+" : t.badge}
                        </span>
                      )}
                    </div>
                    <span>{t.label}</span>
                    {active && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button
        data-testid="btn-support-toggle"
        onClick={() => setIsOpen((o) => !o)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all hover:scale-105"
        aria-label="Support"
        style={{ display: isOpen ? "none" : "flex" }}
      >
        <MessageCircle className="h-6 w-6" />
        {user && openCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-background">
            {openCount > 9 ? "9+" : openCount}
          </span>
        )}
      </button>
    </>
  );
}
