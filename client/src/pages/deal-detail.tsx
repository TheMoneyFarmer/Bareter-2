import { useState, useEffect, useRef } from "react";
import { Link, useParams, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RatingModal } from "@/components/RatingModal";
import type { DealWithUsers, MessageWithSender, DealMilestone } from "@shared/schema";
import {
  ArrowLeft,
  Send,
  FileText,
  CheckCircle,
  Clock,
  Package,
  Upload,
  Download,
  XCircle,
  Shield,
  Loader2,
  AlertTriangle,
  Star,
  Plus,
  Flag,
  CircleDot,
} from "lucide-react";
import { VerifiedBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";

const stateConfig: Record<string, { label: string; color: string; step: number }> = {
  draft: { label: "Draft", color: "bg-gray-500", step: 0 },
  proposed: { label: "Proposed", color: "bg-blue-500", step: 1 },
  accepted: { label: "Accepted", color: "bg-green-500", step: 2 },
  in_progress: { label: "In Progress", color: "bg-yellow-500", step: 3 },
  delivery_proof: { label: "Awaiting Proof", color: "bg-orange-500", step: 4 },
  completed: { label: "Completed", color: "bg-emerald-500", step: 5 },
  cancelled: { label: "Cancelled", color: "bg-red-500", step: -1 },
};

const steps = ["Proposed", "Accepted", "In Progress", "Delivery", "Complete"];

export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: deal, isLoading } = useQuery<DealWithUsers>({
    queryKey: ["/api/deals", id],
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/deals", id, "messages"],
    refetchInterval: 5000,
  });

  const { data: milestones } = useQuery<DealMilestone[]>({
    queryKey: ["/api/deals", id, "milestones"],
    enabled: !!id,
  });

  const createMilestoneMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", `/api/deals/${id}/milestones`, {
        title,
        sortOrder: (milestones?.length || 0),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", id, "milestones"] });
      setNewMilestoneTitle("");
      setShowAddMilestone(false);
      toast({ title: "Milestone added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add milestone", variant: "destructive" });
    },
  });

  const completeMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: string) => {
      const res = await apiRequest("PATCH", `/api/deals/${id}/milestones/${milestoneId}/complete`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", id, "milestones"] });
      toast({ title: "Milestone completed!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to complete milestone", variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/deals/${id}/messages`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", id, "messages"] });
      setMessage("");
    },
  });

  const updateDealMutation = useMutation({
    mutationFn: async (data: { state?: string; seekerCompleted?: boolean; providerCompleted?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/deals/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({
        title: "Deal updated",
        description: "The deal status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Could not update the deal. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const OFF_PLATFORM_RE = /whatsapp|telegram|phone|transfer|outside|signal|wechat|direct\s*pay/i;

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    if (OFF_PLATFORM_RE.test(message.trim())) {
      toast({
        title: "Stay safe — keep barters on Bareter",
        description: "Your message may contain references to external platforms. Bartering outside the app removes your buyer & seller protections.",
        variant: "destructive",
      });
    }
    sendMessageMutation.mutate(message.trim());
  };

  if (isLoading) {
    return (
      <div className="container px-4 py-8 mx-auto max-w-6xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Skeleton className="h-96" />
          </div>
          <div>
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!deal || !user) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold mb-2">Deal not found</h2>
        <p className="text-muted-foreground mb-4">
          This deal may have been removed or you don't have access.
        </p>
        <Link href="/deals">
          <Button>View My Deals</Button>
        </Link>
      </div>
    );
  }

  const isSeeker = deal.seekerId === user.id;
  const otherParty = isSeeker ? deal.provider : deal.seeker;
  const config = stateConfig[deal.state] || stateConfig.draft;
  const myCompleted = isSeeker ? deal.seekerCompleted : deal.providerCompleted;
  const theirCompleted = isSeeker ? deal.providerCompleted : deal.seekerCompleted;

  const canAccept = !isSeeker && deal.state === "proposed";
  const canMarkInProgress = deal.state === "accepted";
  const canUploadProof = deal.state === "in_progress";
  const canMarkComplete = deal.state === "delivery_proof" && !myCompleted;

  return (
    <div className="container px-4 py-8 mx-auto max-w-6xl">
      <Link href="/deals" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to deals
      </Link>

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">Deal #{deal.dealNumber}</h1>
            <Badge variant="outline" className="text-sm">
              <div className={`h-2 w-2 rounded-full ${config.color} mr-1`} />
              {config.label}
            </Badge>
          </div>
          <p className="text-muted-foreground inline-flex items-center gap-2 flex-wrap">
            <span>Bartering with {otherParty?.fullName}</span>
            <FounderBadge show={!!otherParty?.founderBadge} />
          </p>
        </div>

        <div className="flex gap-2">
          {deal.contractPdfUrl && (
            <Button variant="outline" className="gap-2" data-testid="button-download-contract">
              <Download className="h-4 w-4" />
              Download Contract
            </Button>
          )}
          {deal.state === "accepted" && (
            <Button variant="outline" className="gap-2" data-testid="button-generate-contract">
              <FileText className="h-4 w-4" />
              Generate Contract
            </Button>
          )}
        </div>
      </div>

      {deal.state !== "cancelled" && (
        <Card className="mb-6">
          <CardContent className="py-6">
            <div className="flex justify-between items-center mb-4">
              {steps.map((step, index) => (
                <div key={step} className="flex flex-col items-center flex-1">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium ${
                      config.step > index
                        ? "bg-primary text-primary-foreground"
                        : config.step === index
                        ? "bg-primary/20 text-primary border-2 border-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {config.step > index ? <CheckCircle className="h-4 w-4" /> : index + 1}
                  </div>
                  <span className="text-xs mt-2 text-center">{step}</span>
                </div>
              ))}
            </div>
            <Progress value={(config.step / 5) * 100} className="h-2" />
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Deal Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    {isSeeker ? "You Offer" : "They Offer"}
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="font-medium mb-2">{deal.seekerOffer}</p>
                    <p className="text-xl font-bold text-primary">
                      AED {parseFloat(deal.seekerValue as string).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    {isSeeker ? "They Provide" : "You Provide"}
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="font-medium mb-2">{deal.providerOffer}</p>
                    <p className="text-xl font-bold text-primary">
                      AED {parseFloat(deal.providerValue as string).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {deal.timeline && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium mb-2">Timeline</h4>
                  <p className="text-sm text-muted-foreground">{deal.timeline}</p>
                </div>
              )}

              {deal.deliverables && Array.isArray(deal.deliverables) && deal.deliverables.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    Deliverables Checklist
                  </h4>
                  <div className="space-y-2">
                    {(deal.deliverables as Array<{label: string; checked: boolean}>).map((item, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        {item.checked ? (
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                        )}
                        <span className={item.checked ? "text-foreground" : "text-muted-foreground line-through"}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {(deal.deliverables as Array<{label: string; checked: boolean}>).filter(d => d.checked).length} of{" "}
                    {(deal.deliverables as Array<{label: string; checked: boolean}>).length} deliverables agreed
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Milestones section */}
          {(milestones && milestones.length > 0 || deal.state === "in_progress" || deal.state === "accepted") && (
            <Card data-testid="milestones-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Flag className="h-5 w-5 text-primary" />
                    Deal Milestones
                  </CardTitle>
                  {deal.state !== "completed" && deal.state !== "cancelled" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => setShowAddMilestone(!showAddMilestone)}
                      data-testid="button-add-milestone"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Milestone
                    </Button>
                  )}
                </div>

                {milestones && milestones.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{milestones.filter(m => m.isCompleted).length} of {milestones.length} completed</span>
                      <span className="font-medium text-foreground">
                        {Math.round((milestones.filter(m => m.isCompleted).length / milestones.length) * 100)}%
                      </span>
                    </div>
                    <Progress
                      value={(milestones.filter(m => m.isCompleted).length / milestones.length) * 100}
                      className="h-2"
                      data-testid="milestones-progress"
                    />
                  </div>
                )}
              </CardHeader>

              <CardContent className="pt-0 space-y-2">
                {/* Add milestone form */}
                {showAddMilestone && (
                  <div className="flex gap-2 mb-3 p-3 rounded-lg bg-muted/50 border" data-testid="add-milestone-form">
                    <Input
                      placeholder="e.g. Deliver design files..."
                      value={newMilestoneTitle}
                      onChange={(e) => setNewMilestoneTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newMilestoneTitle.trim()) {
                          createMilestoneMutation.mutate(newMilestoneTitle.trim());
                        }
                        if (e.key === "Escape") setShowAddMilestone(false);
                      }}
                      className="text-sm h-8"
                      autoFocus
                      data-testid="input-milestone-title"
                    />
                    <Button
                      size="sm"
                      className="h-8 px-3"
                      onClick={() => {
                        if (newMilestoneTitle.trim()) {
                          createMilestoneMutation.mutate(newMilestoneTitle.trim());
                        }
                      }}
                      disabled={!newMilestoneTitle.trim() || createMilestoneMutation.isPending}
                      data-testid="button-save-milestone"
                    >
                      {createMilestoneMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                )}

                {/* Milestone list */}
                {milestones && milestones.length > 0 ? (
                  <div className="space-y-1.5">
                    {[...milestones].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((m, idx) => (
                      <div
                        key={m.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                          m.isCompleted
                            ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                            : "bg-background hover:bg-muted/40"
                        }`}
                        data-testid={`milestone-row-${m.id}`}
                      >
                        <div className="flex-shrink-0">
                          {m.isCompleted ? (
                            <CheckCircle className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <CircleDot className="h-5 w-5 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${m.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                            {m.title}
                          </p>
                          {m.isCompleted && m.completedAt && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                              Completed {new Date(m.completedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        {!m.isCompleted && deal.state !== "completed" && deal.state !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex-shrink-0"
                            onClick={() => completeMilestoneMutation.mutate(m.id)}
                            disabled={completeMilestoneMutation.isPending}
                            data-testid={`button-complete-milestone-${m.id}`}
                          >
                            {completeMilestoneMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Done
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : !showAddMilestone ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Flag className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No milestones yet</p>
                    <p className="text-xs mt-1">Break this deal into trackable steps</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Card className="flex flex-col h-[500px]">
            <CardHeader className="border-b flex-shrink-0">
              <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                <span>Chat with {otherParty?.fullName}</span>
                <FounderBadge show={!!otherParty?.founderBadge} />
              </CardTitle>
              <CardDescription>
                Discuss the deal details with {otherParty?.fullName}
              </CardDescription>
            </CardHeader>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messagesLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : messages && messages.length > 0 ? (
                  messages.map((msg) => {
                    const isMe = msg.senderId === user.id;
                    const hasWarning = msg.isOffPlatform || !!msg.warning;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                      >
                        <div className={`flex gap-2 max-w-[80%] ${isMe ? "flex-row-reverse" : ""}`}>
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarImage src={msg.sender?.avatarUrl || undefined} />
                            <AvatarFallback className="text-xs">
                              {msg.sender?.fullName?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={`rounded-lg px-4 py-2 ${
                              isMe
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <div className={`flex items-center gap-1 mb-0.5 text-xs font-semibold ${isMe ? "text-primary-foreground/90" : "text-foreground"}`}>
                              <span>{isMe ? "You" : msg.sender?.fullName}</span>
                              <FounderBadge show={!!msg.sender?.founderBadge} />
                            </div>
                            <p className="text-sm">{msg.content}</p>
                            <p className={`text-xs mt-1 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ""}
                            </p>
                          </div>
                        </div>
                        {hasWarning && (
                          <div
                            className="flex items-start gap-1.5 mt-1 max-w-[80%] rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
                            data-testid={`warning-off-platform-${msg.id}`}
                          >
                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>For your safety, keep all negotiations on Bareter. Deals made off-platform are not covered by our dispute protection.</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="border-t p-4 flex-shrink-0">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message..."
                  disabled={sendMessageMutation.isPending}
                  data-testid="input-message"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!message.trim() || sendMessageMutation.isPending}
                  data-testid="button-send-message"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bartering With</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={otherParty?.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {otherParty?.fullName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold">{otherParty?.fullName}</span>
                    <VerifiedBadge isVerified={otherParty?.isVerified} kycStatus={otherParty?.kycStatus} kybStatus={otherParty?.kybStatus} accountType={otherParty?.accountType} size="xs" testId="badge-verified" />
                    <FounderBadge show={!!otherParty?.founderBadge} size="md" />
                  </div>
                  {otherParty?.businessName && (
                    <p className="text-sm text-muted-foreground">{otherParty.businessName}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canAccept && (
                <Button
                  className="w-full gap-2"
                  onClick={() => updateDealMutation.mutate({ state: "accepted" })}
                  disabled={updateDealMutation.isPending}
                  data-testid="button-accept-deal"
                >
                  <CheckCircle className="h-4 w-4" />
                  Accept Barter
                </Button>
              )}

              {canMarkInProgress && (
                <Button
                  className="w-full gap-2"
                  onClick={() => updateDealMutation.mutate({ state: "in_progress" })}
                  disabled={updateDealMutation.isPending}
                  data-testid="button-start-deal"
                >
                  <Package className="h-4 w-4" />
                  Start Delivery
                </Button>
              )}

              {canUploadProof && (
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  data-testid="button-upload-proof"
                >
                  <Upload className="h-4 w-4" />
                  Upload Proof
                </Button>
              )}

              {canMarkComplete && (
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    if (isSeeker) {
                      updateDealMutation.mutate({ seekerCompleted: true });
                    } else {
                      updateDealMutation.mutate({ providerCompleted: true });
                    }
                  }}
                  disabled={updateDealMutation.isPending}
                  data-testid="button-mark-complete"
                >
                  <CheckCircle className="h-4 w-4" />
                  Mark as Complete
                </Button>
              )}

              {deal.state === "completed" && (
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => setShowRatingModal(true)}
                  data-testid="button-rate-deal"
                >
                  <Star className="h-4 w-4" />
                  Rate Your Experience
                </Button>
              )}

              {deal.state !== "completed" && deal.state !== "cancelled" && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full gap-2 text-destructive" data-testid="button-cancel-deal">
                      <XCircle className="h-4 w-4" />
                      Cancel Deal
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cancel this deal?</DialogTitle>
                      <DialogDescription>
                        This action cannot be undone. Both parties will be notified.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline">Keep Deal</Button>
                      <Button
                        variant="destructive"
                        onClick={() => updateDealMutation.mutate({ state: "cancelled" })}
                      >
                        Cancel Deal
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>

          {deal.state === "delivery_proof" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Completion Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">You</span>
                  {myCompleted ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Complete
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      Pending
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{otherParty?.fullName}</span>
                  {theirCompleted ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Complete
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      Pending
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {otherParty && (
        <RatingModal
          open={showRatingModal}
          onOpenChange={setShowRatingModal}
          dealId={deal.id}
          toUserId={otherParty.id}
          toUserName={otherParty.fullName}
        />
      )}
    </div>
  );
}
