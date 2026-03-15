import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck, Send, MessageSquare, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";

type ConversationEntry = {
  id: string;
  otherUserId: string;
  message: string;
  createdAt: string;
  unreadCount: number;
  isRead: boolean;
  fromUserId: string;
  toUserId: string;
  otherUser: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    isVerified: boolean;
  } | null;
};

type ThreadMessage = {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  listingId?: string | null;
};

type ThreadData = {
  messages: ThreadMessage[];
  otherUser: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    isVerified: boolean;
  } | null;
};

export function InboxPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const initialUserId = new URLSearchParams(window.location.search).get("userId");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId);
  const [newMessage, setNewMessage] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "thread">(initialUserId ? "thread" : "list");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading } = useQuery<ConversationEntry[]>({
    queryKey: ["/api/inbox"],
    refetchInterval: 30000,
  });

  const { data: thread } = useQuery<ThreadData>({
    queryKey: ["/api/inbox", selectedUserId],
    enabled: !!selectedUserId,
    refetchInterval: 15000,
  });

  const sendMutation = useMutation({
    mutationFn: (msg: string) =>
      apiRequest("POST", `/api/inbox/${selectedUserId}`, { message: msg }),
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/inbox", selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages]);

  const handleSelectConversation = (userId: string) => {
    setSelectedUserId(userId);
    setMobileView("thread");
    queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
  };

  const handleSend = () => {
    if (!newMessage.trim() || !selectedUserId) return;
    sendMutation.mutate(newMessage.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please log in to view your inbox.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          Inbox
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Direct messages with other users</p>
      </div>

      <div className="border rounded-xl overflow-hidden bg-card min-h-[600px] flex">
        {/* Conversation List */}
        <div className={`w-full md:w-80 md:flex flex-col border-r ${mobileView === "thread" ? "hidden" : "flex"}`}>
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Conversations</h2>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 bg-muted rounded w-24" />
                      <div className="h-3 bg-muted rounded w-40" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No conversations yet</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.otherUserId}
                  data-testid={`conversation-${conv.otherUserId}`}
                  onClick={() => handleSelectConversation(conv.otherUserId)}
                  className={`w-full p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left border-b ${
                    selectedUserId === conv.otherUserId ? "bg-muted" : ""
                  }`}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={conv.otherUser?.avatarUrl || undefined} />
                      <AvatarFallback>
                        {conv.otherUser?.fullName?.[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className={`text-sm truncate ${conv.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>
                        {conv.otherUser?.fullName || "Unknown User"}
                      </span>
                      {conv.otherUser?.isVerified && (
                        <ShieldCheck className="h-3 w-3 text-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className={`text-xs truncate ${conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {conv.fromUserId === user.id ? "You: " : ""}{conv.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(conv.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Thread View */}
        <div className={`flex-1 flex flex-col ${mobileView === "list" ? "hidden md:flex" : "flex"}`}>
          {!selectedUserId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Select a conversation to read</p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b flex items-center gap-3">
                <button
                  onClick={() => setMobileView("list")}
                  className="md:hidden p-1"
                  data-testid="button-back-inbox"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Avatar className="h-9 w-9">
                  <AvatarImage src={thread?.otherUser?.avatarUrl || undefined} />
                  <AvatarFallback>{thread?.otherUser?.fullName?.[0]?.toUpperCase() || "?"}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-sm">{thread?.otherUser?.fullName || "Loading..."}</span>
                    {thread?.otherUser?.isVerified && <ShieldCheck className="h-3 w-3 text-primary" />}
                  </div>
                </div>
                <div className="ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/users/${selectedUserId}`)}
                    data-testid="button-view-profile"
                  >
                    View Profile
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {!thread?.messages?.length ? (
                  <div className="text-center text-muted-foreground py-8">
                    <p className="text-sm">No messages yet. Say hello!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {thread.messages.map((msg) => {
                      const isMe = msg.fromUserId === user.id;
                      return (
                        <div
                          key={msg.id}
                          data-testid={`message-${msg.id}`}
                          className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-xs md:max-w-md rounded-2xl px-4 py-2 text-sm ${
                              isMe
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted rounded-bl-sm"
                            }`}
                          >
                            <p>{msg.message}</p>
                            <p className={`text-xs mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                              {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Reply Input */}
              <div className="p-4 border-t flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  data-testid="input-message"
                  className="flex-1"
                />
                <Button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sendMutation.isPending}
                  data-testid="button-send-message"
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
