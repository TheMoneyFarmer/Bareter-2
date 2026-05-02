import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Send, Bot, User, Loader2, Sparkles, AlertTriangle, LogIn } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const AUTH_INTRO: ChatMessage = {
  role: "assistant",
  content: "Hi! I'm BarterBot, your barter assistant. How can I help you today?",
};

const GUEST_INTRO: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm BarterBot, the Bareter support assistant. I can answer your questions about bartering, listings, contracts, and how the platform works — just sign in (or join the waitlist) to start chatting.",
};

export default function AiSupportChat() {
  const { user } = useAuth();
  const { mode: waitlistMode, open: openWaitlist } = useWaitlist();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    user ? AUTH_INTRO : GUEST_INTRO,
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset chat whenever auth state crosses the login/logout boundary
  // (or switches to a different user). Keeps a logged-out visitor from
  // seeing the previous user's conversation, and avoids cross-account
  // context bleed on the same device.
  const userId = user?.id ?? null;
  // Track the userId that owns the currently displayed conversation, so
  // late-arriving responses from a previous session can be discarded.
  const conversationOwnerRef = useRef<string | null>(userId);
  useEffect(() => {
    conversationOwnerRef.current = userId;
    setMessages([userId ? AUTH_INTRO : GUEST_INTRO]);
    setInput("");
  }, [userId]);

  const sendMutation = useMutation<
    { response: string },
    Error,
    string,
    { requestOwner: string | null }
  >({
    onMutate: async () => {
      // Capture the conversation owner at request time so late-arriving
      // responses can be discarded if the user logged out or switched
      // accounts in the meantime.
      return { requestOwner: conversationOwnerRef.current };
    },
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/ai/support", {
        message,
        history: messages,
      });
      return res.json();
    },
    onSuccess: (data, _variables, context) => {
      if (context?.requestOwner !== conversationOwnerRef.current) return;
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    },
    onError: (_error, _variables, context) => {
      if (context?.requestOwner !== conversationOwnerRef.current) return;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I'm having trouble right now. Please try again." },
      ]);
    },
  });

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || sendMutation.isPending) return;
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    sendMutation.mutate(msg);
  };

  const handleEscalate = () => {
    toast({
      title: "Escalation Requested",
      description: "A human support agent will review your conversation and get back to you soon.",
    });
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "I've escalated your request to our human support team. They'll review our conversation and reach out to you shortly. Is there anything else I can help with in the meantime?" },
    ]);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Position: stack vertically above the WhatsApp FAB (which sits at
  // bottom-20 mobile / md:bottom-6 desktop, h-12 mobile / h-14 desktop).
  // Mobile: 80 + 48 + 12 gap ≈ 144 (bottom-36)
  // Desktop: 24 + 56 + 12 gap ≈ 92  (md:bottom-24)
  if (!isOpen) {
    // Plain <button> (not shadcn <Button>) on purpose: shadcn's baked-in
    // hover-elevate / active-elevate-2 utilities apply
    // `position: relative; z-index: 0;`, which loses to Tailwind `fixed z-50`
    // on specificity but wins on cascade order — leaving the FAB stuck in
    // page flow far below the viewport. This matches the WhatsApp button.
    return (
      <button
        type="button"
        data-testid="btn-ai-support-open"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-36 right-4 md:bottom-24 md:right-6 z-50 h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Contact support"
      >
        <Bot className="h-6 w-6 md:h-7 md:w-7" />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-36 right-4 md:bottom-24 md:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm md:w-96 rounded-lg border bg-background shadow-xl flex flex-col"
      data-testid="panel-ai-support"
    >
      <div className="flex items-center justify-between border-b px-4 py-3 bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <span className="font-semibold text-sm">BarterBot Support</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary-foreground/20 text-primary-foreground">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
            AI Assisted
          </Badge>
        </div>
        <Button
          data-testid="btn-ai-support-close"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-primary-foreground hover:bg-primary/80"
          onClick={() => setIsOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 max-h-80 min-h-[200px]">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div
              data-testid={`chat-message-${msg.role}-${i}`}
              className={`rounded-lg px-3 py-2 text-sm max-w-[75%] ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.content}
            </div>
            {msg.role === "user" && (
              <div className="flex-shrink-0 h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
        {sendMutation.isPending && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="rounded-lg px-3 py-2 text-sm bg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-3 space-y-2">
        {user ? (
          <>
            {messages.length > 3 && (
              <Button
                data-testid="btn-ai-escalate-human"
                variant="outline"
                size="sm"
                className="w-full text-xs h-7"
                onClick={handleEscalate}
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Escalate to Human
              </Button>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Input
                data-testid="input-ai-support-message"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything..."
                className="text-sm"
                disabled={sendMutation.isPending}
              />
              <Button
                data-testid="btn-ai-support-send"
                type="submit"
                size="icon"
                disabled={!input.trim() || sendMutation.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {waitlistMode.enabled ? (
              <Button
                data-testid="btn-ai-support-join-waitlist"
                size="sm"
                className="w-full"
                onClick={() => {
                  setIsOpen(false);
                  openWaitlist();
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Join the waitlist to chat
              </Button>
            ) : (
              <Link href="/login">
                <Button
                  data-testid="btn-ai-support-sign-in"
                  size="sm"
                  className="w-full"
                  onClick={() => setIsOpen(false)}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign in to chat with support
                </Button>
              </Link>
            )}
            <p className="text-[11px] text-muted-foreground text-center">
              Or message us on WhatsApp using the green button below.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
