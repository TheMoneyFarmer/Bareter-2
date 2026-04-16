import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Send, Bot, User, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function AiSupportChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I'm BarterBot, your trading assistant. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/ai/support", {
        message,
        history: messages,
      });
      return res.json();
    },
    onSuccess: (data: { response: string }) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    },
    onError: () => {
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

  if (!user) return null;

  if (!isOpen) {
    return (
      <Button
        data-testid="btn-ai-support-open"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90 md:bottom-6"
        size="icon"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 w-80 rounded-lg border bg-background shadow-xl flex flex-col md:bottom-6 md:w-96">
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
      </div>
    </div>
  );
}
