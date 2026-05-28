import { useState, useEffect, useRef } from "react";
import { trackEvent } from "@/lib/posthog";
import { useI18n } from "@/lib/i18n";
import { Link, useParams, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { MatchScoreCard } from "@/components/MatchScoreCard";
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
  Languages,
} from "lucide-react";
import { VerifiedBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import { ReviewModal } from "@/components/ReviewModal";

const STATE_COLORS: Record<string, { color: string; step: number }> = {
  draft: { color: "bg-gray-500", step: 0 },
  proposed: { color: "bg-blue-500", step: 1 },
  accepted: { color: "bg-green-500", step: 2 },
  active: { color: "bg-green-500", step: 2 },   // legacy alias
  in_progress: { color: "bg-yellow-500", step: 3 },
  delivery_proof: { color: "bg-orange-500", step: 4 },
  completed: { color: "bg-emerald-500", step: 5 },
  cancelled: { color: "bg-red-500", step: -1 },
};

export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, language, isRTL } = useI18n();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeSubject, setDisputeSubject] = useState("");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Per-message translation state. Cache is keyed `${msgId}-${language}` so
  // the same message doesn't cost an extra API call when the user toggles
  // back-and-forth. Display state (which bubbles show translated text) is
  // cleared whenever the active language changes so no stale-language text
  // can remain visible after the user switches EN ↔ AR.
  const msgTranslationCache = useRef<Map<string, string>>(new Map());
  const [translatingMsgIds, setTranslatingMsgIds] = useState<Set<string>>(new Set());
  const [translatedMsgIds, setTranslatedMsgIds] = useState<Set<string>>(new Set());
  const [msgTranslations, setMsgTranslations] = useState<Record<string, string>>({});

  // When the UI language changes, collapse all in-place translations so the
  // user always sees text in the new target language (or the original, if
  // they haven't translated yet in that language).
  useEffect(() => {
    setTranslatedMsgIds(new Set());
    setMsgTranslations({});
  }, [language]);

  const handleTranslateMessage = async (msgId: string, content: string) => {
    const cacheKey = `${msgId}-${language}`;
    // If already showing translated → revert to original.
    if (translatedMsgIds.has(msgId)) {
      setTranslatedMsgIds((prev) => { const s = new Set(prev); s.delete(msgId); return s; });
      return;
    }
    // Return from cache if available.
    if (msgTranslationCache.current.has(cacheKey)) {
      setMsgTranslations((prev) => ({ ...prev, [msgId]: msgTranslationCache.current.get(cacheKey)! }));
      setTranslatedMsgIds((prev) => new Set(prev).add(msgId));
      return;
    }
    setTranslatingMsgIds((prev) => new Set(prev).add(msgId));
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: `TITLE: ${content}`, targetLang: language }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const translated = data.title || content;
      msgTranslationCache.current.set(cacheKey, translated);
      setMsgTranslations((prev) => ({ ...prev, [msgId]: translated }));
      setTranslatedMsgIds((prev) => new Set(prev).add(msgId));
    } catch {
      toast({ title: t("translate.error"), variant: "destructive" });
    } finally {
      setTranslatingMsgIds((prev) => { const s = new Set(prev); s.delete(msgId); return s; });
    }
  };

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
      toast({ title: t("dealDetail.milestoneAdded") });
    },
    onError: () => {
      toast({ title: t("dealDetail.errorTitle"), description: t("dealDetail.failedAddMilestone"), variant: "destructive" });
    },
  });

  const completeMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: string) => {
      const res = await apiRequest("PATCH", `/api/deals/${id}/milestones/${milestoneId}/complete`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", id, "milestones"] });
      toast({ title: t("dealDetail.milestoneCompleted") });
    },
    onError: () => {
      toast({ title: t("dealDetail.errorTitle"), description: t("dealDetail.failedCompleteMilestone"), variant: "destructive" });
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      if (data?.state === "completed") {
        trackEvent("deal_completed", { deal_id: id });
        setShowReviewModal(true);
      }
      toast({
        title: t("dealDetail.dealUpdated"),
        description: t("dealDetail.dealUpdatedDesc"),
      });
    },
    onError: () => {
      toast({
        title: t("dealDetail.updateFailed"),
        description: t("dealDetail.updateFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/deals/${id}/dispute`, { subject: disputeSubject, description: disputeDesc });
      return res.json();
    },
    onSuccess: () => {
      setShowDisputeModal(false);
      setDisputeSubject("");
      setDisputeDesc("");
      toast({ title: "Dispute filed", description: "An admin will review your dispute shortly." });
    },
    onError: (err: any) => toast({ title: "Failed to file dispute", description: err?.message, variant: "destructive" }),
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
        title: t("dealDetail.stayOnPlatform"),
        description: t("dealDetail.offPlatformWarning"),
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
        <h2 className="text-2xl font-bold mb-2">{t("dealDetail.notFound")}</h2>
        <p className="text-muted-foreground mb-4">
          {t("dealDetail.notFoundDesc")}
        </p>
        <Link href="/deals">
          <Button>{t("dealDetail.viewMyDeals")}</Button>
        </Link>
      </div>
    );
  }

  const isSeeker = deal.seekerId === user.id;
  const otherParty = isSeeker ? deal.provider : deal.seeker;
  const config = STATE_COLORS[deal.state] || STATE_COLORS.draft;
  const stateLabel = t(`dealDetail.state.${deal.state}`) || deal.state;
  const steps = [
    t("dealDetail.step.proposed"),
    t("dealDetail.step.accepted"),
    t("dealDetail.step.inProgress"),
    t("dealDetail.step.delivery"),
    t("dealDetail.step.complete"),
  ];
  const myCompleted = isSeeker ? deal.seekerCompleted : deal.providerCompleted;
  const theirCompleted = isSeeker ? deal.providerCompleted : deal.seekerCompleted;

  const canAccept = !isSeeker && deal.state === "proposed";
  const canMarkInProgress = deal.state === "accepted";
  const canUploadProof = deal.state === "in_progress";
  const canMarkComplete = deal.state === "delivery_proof" && !myCompleted;

  return (
    <div className="container px-4 py-8 mx-auto max-w-6xl">
      <Link href="/deals" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className={`h-4 w-4 ${isRTL ? "rotate-180" : ""}`} />
        {t("dealDetail.backToDeals")}
      </Link>

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{t("dealDetail.dealNumber")} #{deal.dealNumber}</h1>
            <Badge variant="outline" className="text-sm">
              <div className={`h-2 w-2 rounded-full ${config.color} me-1`} />
              {stateLabel}
            </Badge>
          </div>
          <p className="text-muted-foreground inline-flex items-center gap-2 flex-wrap">
            <span>{t("dealDetail.barteringWith")} {otherParty?.fullName}</span>
            <FounderBadge show={!!otherParty?.founderBadge} />
          </p>
        </div>

        <div className="flex gap-2">
          {deal.contractPdfUrl && (
            <Button variant="outline" className="gap-2" data-testid="button-download-contract">
              <Download className="h-4 w-4" />
              {t("dealDetail.downloadContract")}
            </Button>
          )}
          {deal.state === "accepted" && (
            <Button variant="outline" className="gap-2" data-testid="button-generate-contract">
              <FileText className="h-4 w-4" />
              {t("dealDetail.generateContract")}
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
            <div className={isRTL ? "scale-x-[-1]" : ""}>
              <Progress value={(config.step / 5) * 100} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Acceptance banner — shown when deal was just accepted */}
      {(deal.state === "accepted" || deal.state === "active") && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-green-800 dark:text-green-300">Deal accepted! 🎉</p>
            <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
              Use the chat below to agree on exchange details, then mark it "In Progress" when you're both ready. Once delivery is confirmed by both sides, the deal completes.
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Chat / Inbox — shown FIRST so it feels like an inbox conversation */}
          <Card className="flex flex-col h-[500px]">
            <CardHeader className="border-b flex-shrink-0">
              <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                <span>{t("dealDetail.chatWith")} {otherParty?.fullName}</span>
                <FounderBadge show={!!otherParty?.founderBadge} />
              </CardTitle>
              <CardDescription>
                {t("dealDetail.discussDetails")} {otherParty?.fullName}
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
                        className={`flex flex-col ${isMe !== isRTL ? "items-end" : "items-start"}`}
                      >
                        <div className={`flex gap-2 max-w-[80%] ${isMe !== isRTL ? "flex-row-reverse" : ""}`}>
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
                            <p className="text-sm" data-testid={`text-message-content-${msg.id}`}>
                              {translatedMsgIds.has(msg.id) && msgTranslations[msg.id]
                                ? msgTranslations[msg.id]
                                : msg.content}
                            </p>
                            <div className={`flex items-center justify-between mt-1 gap-2`}>
                              <p className={`text-xs ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ""}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleTranslateMessage(msg.id, msg.content)}
                                disabled={translatingMsgIds.has(msg.id)}
                                className={`flex items-center gap-0.5 text-[10px] transition-opacity hover:opacity-100 ${
                                  isMe
                                    ? "text-primary-foreground/60 hover:text-primary-foreground/90"
                                    : "text-muted-foreground hover:text-foreground"
                                } disabled:opacity-40`}
                                data-testid={`btn-translate-message-${msg.id}`}
                              >
                                {translatingMsgIds.has(msg.id) ? (
                                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                ) : (
                                  <Languages className="h-2.5 w-2.5" />
                                )}
                                <span>
                                  {translatingMsgIds.has(msg.id)
                                    ? t("translate.loading")
                                    : translatedMsgIds.has(msg.id)
                                    ? t("translate.original")
                                    : t("translate.button")}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                        {hasWarning && (
                          <div
                            className="flex items-start gap-1.5 mt-1 max-w-[80%] rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
                            data-testid={`warning-off-platform-${msg.id}`}
                          >
                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>{t("dealDetail.offPlatformSafety")}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>{t("dealDetail.noMessages")}</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="border-t p-4 flex-shrink-0">
              {user?.phone && (
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => sendMessageMutation.mutate(`📞 My phone number: ${user.phone}`)}
                    disabled={sendMessageMutation.isPending}
                    className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
                  >
                    <Shield className="h-3 w-3" />
                    Share my phone number privately
                  </button>
                </div>
              )}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("dealDetail.typeMessage")}
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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("dealDetail.dealDetails")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    {isSeeker ? t("dealDetail.youOffer") : t("dealDetail.theyOffer")}
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
                    {isSeeker ? t("dealDetail.theyProvide") : t("dealDetail.youProvide")}
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="font-medium mb-2">{deal.providerOffer}</p>
                    <p className="text-xl font-bold text-primary">
                      AED {parseFloat(deal.providerValue as string).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {deal.seekerListingId && deal.providerListingId && (
                <div className="mt-6 pt-6 border-t">
                  <MatchScoreCard
                    listingAId={deal.seekerListingId}
                    listingBId={deal.providerListingId}
                  />
                </div>
              )}

              {deal.timeline && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium mb-2">{t("dealDetail.timeline")}</h4>
                  <p className="text-sm text-muted-foreground">{deal.timeline}</p>
                </div>
              )}

              {deal.deliverables && Array.isArray(deal.deliverables) && deal.deliverables.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    {t("dealDetail.deliverablesChecklist")}
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
                    {(deal.deliverables as Array<{label: string; checked: boolean}>).filter(d => d.checked).length} {t("dealDetail.ofCompleted")}{" "}
                    {(deal.deliverables as Array<{label: string; checked: boolean}>).length} {t("dealDetail.deliverablesAgreed")}
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
                    {t("dealDetail.dealMilestones")}
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
                      {t("dealDetail.addMilestone")}
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
                                <CheckCircle className="h-3 w-3 me-1" />
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
                    <p className="text-sm">{t("dealDetail.noMilestones")}</p>
                    <p className="text-xs mt-1">{t("dealDetail.breakDealIntoSteps")}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("dealDetail.barteringWithTitle")}</CardTitle>
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
              <CardTitle className="text-lg">{t("dealDetail.actions")}</CardTitle>
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
                  {t("dealDetail.acceptBarter")}
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
                  {t("dealDetail.startDelivery")}
                </Button>
              )}

              {canUploadProof && (
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  data-testid="button-upload-proof"
                >
                  <Upload className="h-4 w-4" />
                  {t("dealDetail.uploadProof")}
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
                  {t("dealDetail.markAsComplete")}
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
                  {t("dealDetail.rateExperience")}
                </Button>
              )}

              {deal.state !== "completed" && deal.state !== "cancelled" && deal.state !== "proposed" && (
                <Button
                  variant="outline"
                  className="w-full gap-2 text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950/20"
                  onClick={() => setShowDisputeModal(true)}
                  data-testid="button-raise-dispute"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Raise a Dispute
                </Button>
              )}

              {deal.state !== "completed" && deal.state !== "cancelled" && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full gap-2 text-destructive" data-testid="button-cancel-deal">
                      <XCircle className="h-4 w-4" />
                      {t("dealDetail.cancelDeal")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("dealDetail.cancelDealConfirm")}</DialogTitle>
                      <DialogDescription>
                        {t("dealDetail.cancelDealDesc")}
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline">{t("dealDetail.keepDeal")}</Button>
                      <Button
                        variant="destructive"
                        onClick={() => updateDealMutation.mutate({ state: "cancelled" })}
                      >
                        {t("dealDetail.cancelDeal")}
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
                  {t("dealDetail.completionStatus")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t("dealDetail.you")}</span>
                  {myCompleted ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {t("dealDetail.complete")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {t("dealDetail.pending")}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{otherParty?.fullName}</span>
                  {theirCompleted ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {t("dealDetail.complete")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {t("dealDetail.pending")}
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

      {otherParty && (
        <ReviewModal
          open={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          dealId={deal.id}
          revieweeName={otherParty.fullName}
          listingTitle={`Deal #${deal.dealNumber}`}
        />
      )}

      {/* Dispute Modal */}
      <Dialog open={showDisputeModal} onOpenChange={setShowDisputeModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-5 w-5" />
              Raise a Dispute
            </DialogTitle>
            <DialogDescription>
              Describe the issue. An admin will review your dispute and reach out to both parties within 48 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Subject</label>
              <Input
                placeholder="e.g. Items not delivered as described"
                value={disputeSubject}
                onChange={(e) => setDisputeSubject(e.target.value)}
                maxLength={200}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                placeholder="Explain what happened, what was agreed, and what the issue is..."
                value={disputeDesc}
                onChange={(e) => setDisputeDesc(e.target.value)}
                rows={4}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisputeModal(false)}>Cancel</Button>
            <Button
              variant="default"
              className="bg-orange-600 hover:bg-orange-700"
              onClick={() => disputeMutation.mutate()}
              disabled={disputeSubject.trim().length < 5 || disputeDesc.trim().length < 10 || disputeMutation.isPending}
            >
              {disputeMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Filing…</> : "File Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
