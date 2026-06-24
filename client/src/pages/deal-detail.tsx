import { useState, useEffect, useRef, useCallback } from "react";
import { SuccessStoryModal } from "@/components/success-story-modal";
import { trackEvent } from "@/lib/posthog";
import { useI18n } from "@/lib/i18n";
import { Link, useParams, useSearch, useLocation } from "wouter";
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
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { RatingModal } from "@/components/RatingModal";
import { MatchScoreCard } from "@/components/MatchScoreCard";
import type { DealWithUsers, MessageWithSender, DealMilestone } from "@shared/schema";
import {
  ArrowLeft,
  Send,
  FileText,
  CheckCircle,
  CheckCircle2,
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
  PenLine,
  RefreshCw,
  ScrollText,
  Trophy,
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

function ShareStoryButton({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setOpen(true)}>
        <Trophy className="h-4 w-4" />
        Share Your Trade Story
      </Button>
      <SuccessStoryModal dealId={dealId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t, language, isRTL } = useI18n();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [message, setMessage] = useState("");
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeSubject, setDisputeSubject] = useState("");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [showContract, setShowContract] = useState(false);
  const [contractScrolled, setContractScrolled] = useState(false);
  const [contractInitials, setContractInitials] = useState("");
  const [contractAgreed, setContractAgreed] = useState(false);
  const contractBodyRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);
  const isInitialMessagesLoad = useRef(true);

  // Per-message translation state. Cache is keyed `${msgId}-${language}` so
  // the same message doesn't cost an extra API call when the user toggles
  // back-and-forth. Display state (which bubbles show translated text) is
  // cleared whenever the active language changes so no stale-language text
  // can remain visible after the user switches EN ↔ AR.
  const msgTranslationCache = useRef<Map<string, string>>(new Map());
  const [translatingMsgIds, setTranslatingMsgIds] = useState<Set<string>>(new Set());
  const [translatedMsgIds, setTranslatedMsgIds] = useState<Set<string>>(new Set());
  const [msgTranslations, setMsgTranslations] = useState<Record<string, string>>({});

  // Redirect unauthenticated users to login so email links work end-to-end.
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/login?redirect=/deals/${id}`, { replace: true });
    }
  }, [authLoading, user, id]);

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
      const res = await fetch(`${API_BASE}/api/translate`, {
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

  // Contract data
  type ContractTerms = { summary: string; partyADeliverables: string[]; partyBDeliverables: string[]; agreedTimeline: string; specialConditions: string[]; terms: string[] };
  type ContractData = { contractContent: string | null; contractGeneratedAt: string | null; seekerSigned: { signedAt: string; initials: string } | null; providerSigned: { signedAt: string; initials: string } | null; currentUserRole: "seeker" | "provider"; dealRef: string; seekerName: string; providerName: string; seekerEmail?: string; providerEmail?: string; seekerCity?: string; providerCity?: string; seekerOffer: string; providerOffer: string; seekerValue: string; providerValue: string };

  const CONTRACT_STATES = ["accepted", "active", "in_progress", "delivery_proof", "completed"];

  const { data: contractData, refetch: refetchContract } = useQuery<ContractData>({
    queryKey: ["/api/deals", id, "contract"],
    queryFn: () => fetch(`${API_BASE}/api/deals/${id}/contract`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id && !!deal && CONTRACT_STATES.includes(deal.state),
    staleTime: 30_000,
  });

  const generateContractMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/deals/${id}/contract/generate`, {});
      return res.json();
    },
    onSuccess: () => {
      refetchContract();
      setContractScrolled(false);
      setContractInitials("");
      setContractAgreed(false);
      toast({ title: "Contract generated", description: "Review and sign below." });
    },
    onError: (err: any) => toast({ title: "Failed to generate contract", description: err?.message, variant: "destructive" }),
  });

  const signContractMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/deals/${id}/contract/sign`, { initials: contractInitials });
      return res.json();
    },
    onSuccess: (data) => {
      refetchContract();
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setContractInitials("");
      setContractAgreed(false);
      if (data.bothSigned) {
        toast({ title: "Contract executed!", description: "Both parties have signed. The agreement is now binding." });
      } else {
        toast({ title: "Signed!", description: "Waiting for the other party to sign." });
      }
    },
    onError: (err: any) => toast({ title: "Failed to sign", description: err?.message, variant: "destructive" }),
  });

  const handleContractScroll = useCallback(() => {
    const el = contractBodyRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 40;
    if (atBottom) setContractScrolled(true);
  }, []);

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

  async function handleProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !deal) return;
    setUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "proof");
      const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData, credentials: "include" });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      const { url } = await uploadRes.json();
      const proofField = isSeeker ? { seekerProofUrl: url } : { providerProofUrl: url };
      // Move to delivery_proof stage when uploading from in_progress
      const stateUpdate = deal.state === "in_progress" ? { state: "delivery_proof" as const } : {};
      await apiRequest("PATCH", `/api/deals/${id}`, { ...proofField, ...stateUpdate });
      queryClient.invalidateQueries({ queryKey: [`/api/deals/${id}`] });
      toast({ title: "Proof uploaded", description: "Your delivery proof has been saved. Both parties must confirm to complete the deal." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setUploadingProof(false);
      if (proofInputRef.current) proofInputRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!messages) return;
    const viewport = chatScrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;
    if (viewport) {
      // On initial load snap instantly; on new messages animate
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: isInitialMessagesLoad.current ? "auto" : "smooth" });
    }
    isInitialMessagesLoad.current = false;
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
  const canUploadProof = deal.state === "in_progress" || deal.state === "delivery_proof";
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

        <div className="flex gap-2 flex-wrap">
          {CONTRACT_STATES.includes(deal.state) && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowContract(true)}
            >
              <ScrollText className="h-4 w-4" />
              {contractData?.seekerSigned && contractData?.providerSigned ? "View Signed Contract" : "Barter Contract"}
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
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-green-800 dark:text-green-300">Deal accepted!</p>
            <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
              Use the chat to finalize exchange details. When you're both ready, click "Start Exchange" to begin.
            </p>
          </div>
        </div>
      )}

      {/* Contract status banner */}
      {CONTRACT_STATES.includes(deal.state) && contractData && (() => {
        const bothSigned = contractData.seekerSigned && contractData.providerSigned;
        const iAmSeeker = contractData.currentUserRole === "seeker";
        const iSigned = iAmSeeker ? !!contractData.seekerSigned : !!contractData.providerSigned;
        const theySigned = iAmSeeker ? !!contractData.providerSigned : !!contractData.seekerSigned;
        if (bothSigned) return (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">Contract fully executed</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">Both parties signed. The barter agreement is legally binding.</p>
            </div>
            <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 flex-shrink-0" onClick={() => setShowContract(true)}>
              <ScrollText className="h-4 w-4 mr-1" /> View
            </Button>
          </div>
        );
        if (!contractData.contractContent) return (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <FileText className="h-6 w-6 text-blue-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-blue-800 dark:text-blue-300">Generate your barter contract</p>
              <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">We'll draft a detailed agreement from your deal and chat. Both parties must sign before starting.</p>
            </div>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0" disabled={generateContractMutation.isPending} onClick={() => generateContractMutation.mutate()}>
              {generateContractMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />} Generate Contract
            </Button>
          </div>
        );
        return (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <PenLine className="h-6 w-6 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                {iSigned ? "Waiting for the other party to sign" : "Your signature is needed"}
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                {iSigned ? `You signed ✓  —  ${theySigned ? "Both signed" : "Waiting on other party"}` : "Open the contract, scroll to the bottom, and enter your initials to sign."}
              </p>
            </div>
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 flex-shrink-0" onClick={() => setShowContract(true)}>
              <PenLine className="h-4 w-4 mr-1" /> {iSigned ? "View Contract" : "Sign Contract"}
            </Button>
          </div>
        );
      })()}

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
            <ScrollArea ref={chatScrollAreaRef} className="flex-1 p-4">
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
                              {/* Translate button — hidden until multi-language release */}
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
              {user && !(user.kycStatus === "APPROVED" || user.kybStatus === "APPROVED" || user.isVerified || !!(user as any).phoneVerified) ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-dashed">
                  <Shield className="h-4 w-4 text-primary flex-shrink-0" />
                  <p className="text-xs text-muted-foreground flex-1">Add your WhatsApp to send messages.</p>
                  <Link href="/settings" className="text-xs font-semibold text-primary hover:underline">Verify now</Link>
                </div>
              ) : (
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
              )}
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
                <>
                  <Button
                    className="w-full gap-2"
                    onClick={() => updateDealMutation.mutate({ state: "accepted" })}
                    disabled={updateDealMutation.isPending}
                    data-testid="button-accept-deal"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {t("dealDetail.acceptBarter")}
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/5"
                        disabled={updateDealMutation.isPending}
                        data-testid="button-decline-deal"
                      >
                        <XCircle className="h-4 w-4" />
                        Decline Offer
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Decline this offer?</DialogTitle>
                        <DialogDescription>
                          The proposer will be notified that their offer was declined. This cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline">Keep It</Button>
                        <Button
                          variant="destructive"
                          onClick={() => updateDealMutation.mutate({ state: "cancelled" })}
                          disabled={updateDealMutation.isPending}
                        >
                          Decline Offer
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
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
                <>
                  <input
                    ref={proofInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    className="hidden"
                    onChange={handleProofUpload}
                  />
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    data-testid="button-upload-proof"
                    disabled={uploadingProof}
                    onClick={() => proofInputRef.current?.click()}
                  >
                    {uploadingProof ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploadingProof ? "Uploading…" : (isSeeker ? deal.seekerProofUrl : deal.providerProofUrl) ? "Replace Proof" : t("dealDetail.uploadProof")}
                  </Button>
                  {(isSeeker ? deal.seekerProofUrl : deal.providerProofUrl) && (
                    <p className="text-xs text-green-600 text-center flex items-center justify-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Your proof uploaded
                    </p>
                  )}
                </>
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
                <>
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    onClick={() => setShowRatingModal(true)}
                    data-testid="button-rate-deal"
                  >
                    <Star className="h-4 w-4" />
                    {t("dealDetail.rateExperience")}
                  </Button>
                  <ShareStoryButton dealId={deal.id} />
                </>
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

              {deal.state !== "completed" && deal.state !== "cancelled" && deal.state !== "proposed" && (
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

      {/* ── Inline Contract Modal ─────────────────────────────────────────── */}
      {showContract && contractData && (() => {
        const terms: ContractTerms | null = contractData.contractContent ? (() => { try { return JSON.parse(contractData.contractContent!); } catch { return null; } })() : null;
        const bothSigned = contractData.seekerSigned && contractData.providerSigned;
        const iAmSeeker = contractData.currentUserRole === "seeker";
        const iSigned = iAmSeeker ? !!contractData.seekerSigned : !!contractData.providerSigned;
        const myInitials = iAmSeeker ? contractData.seekerSigned?.initials : contractData.providerSigned?.initials;
        const mySignDate = iAmSeeker ? contractData.seekerSigned?.signedAt : contractData.providerSigned?.signedAt;
        const theirInitials = iAmSeeker ? contractData.providerSigned?.initials : contractData.seekerSigned?.initials;
        const theirSignDate = iAmSeeker ? contractData.providerSigned?.signedAt : contractData.seekerSigned?.signedAt;
        const theirName = iAmSeeker ? contractData.providerName : contractData.seekerName;
        const myName = iAmSeeker ? contractData.seekerName : contractData.providerName;
        const canSign = !iSigned && !!terms;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden">

              {/* Header */}
              <div className="bg-bareter-teal px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-white font-bold text-lg">Barter Agreement</h2>
                  <p className="text-white/70 text-xs mt-0.5">Ref: {contractData.dealRef} · {contractData.seekerName} ↔ {contractData.providerName}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!bothSigned && !generateContractMutation.isPending && (
                    <button onClick={() => generateContractMutation.mutate()} title="Regenerate" className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => setShowContract(false)} className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Contract body — scrollable */}
              {!terms ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                  {generateContractMutation.isPending ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-bareter-teal" />
                      <p className="text-sm text-muted-foreground">Drafting your personalised contract from the deal details and chat…</p>
                    </>
                  ) : (
                    <>
                      <FileText className="h-12 w-12 text-muted-foreground/30" />
                      <p className="font-medium text-bareter-navy dark:text-foreground">No contract yet</p>
                      <p className="text-sm text-muted-foreground">Generate a personalised agreement based on your deal and chat conversation.</p>
                      <Button className="bg-bareter-teal hover:bg-bareter-teal/90 text-white gap-2" onClick={() => generateContractMutation.mutate()}>
                        <FileText className="h-4 w-4" /> Generate Contract
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div ref={contractBodyRef} onScroll={handleContractScroll} className="flex-1 overflow-y-auto p-6 space-y-5 text-sm text-bareter-navy dark:text-foreground">

                  {/* Date + reference */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-3">
                    <span>Contract Ref: <strong>{contractData.dealRef}</strong></span>
                    <span>Date: {contractData.contractGeneratedAt ? new Date(contractData.contractGeneratedAt).toLocaleDateString("en-AE", { day: "2-digit", month: "long", year: "numeric" }) : new Date().toLocaleDateString("en-AE", { day: "2-digit", month: "long", year: "numeric" })}</span>
                  </div>

                  {/* Summary */}
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-bareter-teal mb-2">Agreement Summary</h3>
                    <p className="leading-relaxed text-foreground/80">{terms.summary}</p>
                  </section>

                  {/* Parties */}
                  <section className="border-t pt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-bareter-teal mb-3">Parties</h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {[
                        { label: "Party A", name: contractData.seekerName, email: contractData.seekerEmail, city: contractData.seekerCity },
                        { label: "Party B", name: contractData.providerName, email: contractData.providerEmail, city: contractData.providerCity },
                      ].map(p => (
                        <div key={p.label} className="bg-gray-50 dark:bg-muted/40 rounded-xl p-3">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{p.label}</p>
                          <p className="font-semibold">{p.name}</p>
                          {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                          {p.city && <p className="text-xs text-muted-foreground">{p.city}</p>}
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Exchange Details */}
                  <section className="border-t pt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-bareter-teal mb-3">Exchange Details</h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">{contractData.seekerName} provides — AED {Number(contractData.seekerValue).toLocaleString()}</p>
                        <ul className="space-y-1">{terms.partyADeliverables.map((d, i) => <li key={i} className="flex items-start gap-1.5"><span className="text-bareter-teal mt-0.5">•</span><span className="leading-snug">{d}</span></li>)}</ul>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">{contractData.providerName} provides — AED {Number(contractData.providerValue).toLocaleString()}</p>
                        <ul className="space-y-1">{terms.partyBDeliverables.map((d, i) => <li key={i} className="flex items-start gap-1.5"><span className="text-bareter-teal mt-0.5">•</span><span className="leading-snug">{d}</span></li>)}</ul>
                      </div>
                    </div>
                  </section>

                  {/* Timeline */}
                  <section className="border-t pt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-bareter-teal mb-2">Agreed Timeline</h3>
                    <p>{terms.agreedTimeline}</p>
                  </section>

                  {/* Special Conditions */}
                  {terms.specialConditions?.length > 0 && (
                    <section className="border-t pt-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-bareter-teal mb-2">Special Conditions</h3>
                      <ul className="space-y-1.5">{terms.specialConditions.map((c, i) => <li key={i} className="flex items-start gap-1.5"><span className="text-bareter-teal mt-0.5">•</span><span>{c}</span></li>)}</ul>
                    </section>
                  )}

                  {/* Terms & Conditions */}
                  <section className="border-t pt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-bareter-teal mb-3">Terms & Conditions</h3>
                    <ol className="space-y-2">{terms.terms.map((t, i) => <li key={i} className="leading-relaxed text-foreground/80">{t}</li>)}</ol>
                  </section>

                  {/* Disclaimer */}
                  <p className="text-[11px] text-muted-foreground bg-gray-50 dark:bg-muted/30 rounded-lg p-3 italic">
                    This agreement was drafted using deal details and chat history. Both parties should consult a UAE-qualified lawyer if required. Signing constitutes acceptance of all terms above.
                  </p>

                  {/* Signature status */}
                  <section className="border-t pt-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-bareter-teal mb-3">Signatures</h3>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {[
                        { name: contractData.seekerName, label: "Party A", signed: contractData.seekerSigned },
                        { name: contractData.providerName, label: "Party B", signed: contractData.providerSigned },
                      ].map(p => (
                        <div key={p.label} className={`rounded-xl border px-4 py-3 ${p.signed ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20" : "border-gray-200 bg-gray-50 dark:border-border dark:bg-muted/30"}`}>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{p.label} — {p.name}</p>
                          {p.signed ? (
                            <>
                              <p className="font-mono font-bold text-lg text-bareter-navy dark:text-foreground">{p.signed.initials}</p>
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">Signed {new Date(p.signed.signedAt).toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" })}</p>
                            </>
                          ) : (
                            <p className="text-[11px] text-muted-foreground italic">Pending signature</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Scroll anchor */}
                  <div id="contract-end" className="h-1" />
                </div>
              )}

              {/* Sign footer — only when contract loaded + not yet signed */}
              {terms && !bothSigned && (
                <div className="border-t bg-gray-50 dark:bg-muted/30 px-6 py-4 flex-shrink-0">
                  {iSigned ? (
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm font-medium">You signed with initials <strong>{myInitials}</strong> on {mySignDate ? new Date(mySignDate).toLocaleDateString("en-AE") : ""}. Waiting for {theirName}.</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {!contractScrolled && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> Scroll to the bottom of the contract to enable signing.
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="contract-agree"
                          checked={contractAgreed}
                          disabled={!contractScrolled}
                          onChange={e => setContractAgreed(e.target.checked)}
                          className="h-4 w-4 accent-bareter-teal disabled:opacity-40"
                        />
                        <label htmlFor="contract-agree" className={`text-xs ${contractScrolled ? "text-foreground cursor-pointer" : "text-muted-foreground"}`}>
                          I have read and agree to all terms in this barter agreement
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Your initials (e.g. TM)"
                          value={contractInitials}
                          onChange={e => setContractInitials(e.target.value.toUpperCase().slice(0, 6))}
                          disabled={!contractScrolled || !contractAgreed}
                          className="max-w-[140px] font-mono uppercase disabled:opacity-40"
                          maxLength={6}
                        />
                        <Button
                          className="bg-bareter-teal hover:bg-bareter-teal/90 text-white gap-2 flex-1"
                          disabled={!contractScrolled || !contractAgreed || contractInitials.trim().length === 0 || signContractMutation.isPending}
                          onClick={() => signContractMutation.mutate()}
                        >
                          {signContractMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                          Sign as {myName}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Both signed — read-only footer */}
              {terms && bothSigned && (
                <div className="border-t px-6 py-4 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm font-semibold">Contract fully executed — both parties signed. This agreement is binding.</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
