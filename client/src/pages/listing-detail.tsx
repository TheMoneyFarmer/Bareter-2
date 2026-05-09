import { useState, useEffect, useRef } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trackEvent } from "@/lib/posthog";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ListingWithUser, Listing, ListingCommentWithUser } from "@shared/schema";
import {
  MapPin,
  Package,
  ShoppingCart,
  Shield,
  Star,
  Eye,
  Calendar,
  Tag,
  Handshake,
  ArrowLeft,
  Loader2,
  MessageSquare,
  ExternalLink,
  ArrowLeftRight,
  ArrowRightLeft,
  Sparkles,
  CheckCircle,
  ClipboardList,
  Heart,
  Send,
  AlertTriangle,
  Flag,
  Zap,
  Award,
  Play,
  Info,
  Languages,
} from "lucide-react";
import type { ServiceTier } from "@shared/schema";
import { VerifiedBadge } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import type { ExchangeItem } from "@shared/schema";
import { getDeliverablesForCategories, type DeliverableItem } from "@shared/deliverables";
import { ShareMenu } from "@/components/share-menu";
import { ReportModal } from "@/components/report-modal";
import { timeAgo, formatValue } from "@/lib/utils";

const _listingTranslationCache = new Map<string, { title: string; description: string }>();

export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { gate } = useWaitlist();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const [proposeOpen, setProposeOpen] = useState(searchParams.get("propose") === "true");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [counterOffer, setCounterOffer] = useState("");
  const [counterValue, setCounterValue] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>([]);
  const [inquirySent, setInquirySent] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<{ title: string; description: string } | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const translationCacheRef = _listingTranslationCache;

  const { data: listing, isLoading } = useQuery<ListingWithUser>({
    queryKey: ["/api/listings", id],
  });

  const { data: myListings } = useQuery<Listing[]>({
    queryKey: ["/api/listings/user", user?.id],
    enabled: !!user,
  });

  const viewedRef = useRef(false);
  useEffect(() => {
    if (listing && !viewedRef.current) {
      viewedRef.current = true;
      trackEvent("listing_viewed", {
        listing_id: listing.id,
        listing_category: (listing.categories as string[] | undefined)?.[0],
        listing_value: listing.retailValue ? parseFloat(String(listing.retailValue)) : undefined,
      });
    }
  }, [listing]);

  useEffect(() => {
    if (proposeOpen && listing?.categories) {
      const items = getDeliverablesForCategories(listing.categories as string[]);
      setDeliverables(items);
    }
  }, [proposeOpen, listing]);

  const toggleDeliverable = (index: number) => {
    setDeliverables(prev => prev.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item
    ));
  };

  const handleTranslateListing = async () => {
    if (!listing) return;
    if (showTranslated) { setShowTranslated(false); return; }
    const cacheKey = `${listing.id}-${language}`;
    if (translationCacheRef.has(cacheKey)) {
      setTranslation(translationCacheRef.get(cacheKey)!);
      setShowTranslated(true);
      return;
    }
    setTranslating(true);
    try {
      const targetLang = language;
      const textToTranslate = `TITLE: ${listing.title}\nDESCRIPTION: ${listing.description || ""}`;
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: textToTranslate, targetLang }),
      });
      if (!res.ok) throw new Error("Translation failed");
      const data = await res.json();
      const translated = {
        title: data.title || listing.title,
        description: data.description || (listing.description || ""),
      };
      translationCacheRef.set(cacheKey, translated);
      setTranslation(translated);
      setShowTranslated(true);
    } catch {
      toast({ title: t("translate.error"), variant: "destructive" });
    } finally {
      setTranslating(false);
    }
  };

  const proposeTradeMutation = useMutation({
    mutationFn: async (data: {
      providerListingId: string;
      seekerOffer: string;
      seekerValue: string;
      deliverables: DeliverableItem[];
    }) => {
      const res = await apiRequest("POST", "/api/deals", {
        providerListingId: data.providerListingId,
        seekerOffer: data.seekerOffer,
        seekerValue: data.seekerValue,
        deliverables: data.deliverables,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      trackEvent("barter_proposed", { deal_id: data.id });
      toast({
        title: t("listingDetail.barterProposed"),
        description: t("listingDetail.barterProposedDesc"),
      });
      navigate(`/deals/${data.id}`);
    },
    onError: (error: any) => {
      toast({
        title: t("listingDetail.failedToPropose"),
        description: error.message || t("common.somethingWentWrong"),
        variant: "destructive",
      });
    },
  });

  const [commentOfferName, setCommentOfferName] = useState("");
  const [commentOfferValue, setCommentOfferValue] = useState("");
  const [commentMessage, setCommentMessage] = useState("");

  const { data: listingComments } = useQuery<ListingCommentWithUser[]>({
    queryKey: ["/api/listings", id, "comments"],
    enabled: !!id,
  });

  const listingLikeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/listings/${id}/like`);
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/listings", id] });
      const previous = queryClient.getQueryData<any>(["/api/listings", id]);
      if (previous) {
        queryClient.setQueryData(["/api/listings", id], {
          ...previous,
          isLiked: !previous.isLiked,
          likeCount: previous.isLiked ? Math.max(0, (previous.likeCount || 0) - 1) : (previous.likeCount || 0) + 1,
        });
      }
      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["/api/listings", id], context.previous);
      toast({ title: t("common.error"), description: error.message || t("common.couldNotUpdateLike"), variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id] });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: { content: string | null; offerItemName: string; offerItemValue: string }) => {
      const res = await apiRequest("POST", `/api/listings/${id}/comments`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id, "comments"] });
      setCommentOfferName("");
      setCommentOfferValue("");
      setCommentMessage("");
      toast({ title: t("listingDetail.proposalPosted"), description: t("listingDetail.proposalPostedDesc") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const handleSubmitComment = () => {
    if (!commentOfferName || !commentOfferValue) return;
    createCommentMutation.mutate({
      content: commentMessage || null,
      offerItemName: commentOfferName,
      offerItemValue: commentOfferValue,
    });
  };

  const quickInquiryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/inquiries", {
        toUserId: listing?.userId,
        listingId: listing?.id,
        message: "Is this still available?",
      });
      return res.json();
    },
    onSuccess: () => {
      setInquirySent(true);
      toast({ title: t("listingDetail.inquirySent"), description: t("listingDetail.sellerNotified") });
    },
    onError: () => {
      toast({ title: t("listingDetail.couldNotSend"), description: t("listingDetail.pleaseRetry"), variant: "destructive" });
    },
  });

  const conditionConfig: Record<string, { label: string; color: string }> = {
    new: { label: t("listingDetail.conditionNew"), color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    like_new: { label: t("listingDetail.conditionLikeNew"), color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    excellent: { label: t("listingDetail.conditionExcellent"), color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    good: { label: t("listingDetail.conditionGood"), color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    fair: { label: t("listingDetail.conditionFair"), color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
    refurbished: { label: t("listingDetail.conditionRefurbished"), color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  };

  const tierConfig: Record<string, { icon: string; color: string; bg: string; border: string }> = {
    bronze: { icon: "🥉", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20", border: "border-orange-200 dark:border-orange-800" },
    silver: { icon: "🥈", color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-900/20", border: "border-slate-200 dark:border-slate-700" },
    gold: { icon: "🥇", color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/20", border: "border-yellow-200 dark:border-yellow-800" },
  };

  const handleProposeTrade = () => {
    if (!listing || !counterOffer || !counterValue) return;
    proposeTradeMutation.mutate({
      providerListingId: listing.id,
      seekerOffer: counterOffer,
      seekerValue: counterValue,
      deliverables,
    });
  };

  if (isLoading) {
    return (
      <div className="bg-bareter-off-white dark:bg-background min-h-screen">
        <div className="container px-4 py-8 mx-auto max-w-7xl">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
            <div className="space-y-6">
              <Skeleton className="aspect-video rounded-bareter-card" />
              <Skeleton className="h-32 rounded-bareter-card" />
            </div>
            <div>
              <Skeleton className="h-64 rounded-bareter-card" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold mb-2">{t("listingDetail.listingNotFound")}</h2>
        <p className="text-muted-foreground mb-4">
          {t("listingDetail.listingNotFoundDesc")}
        </p>
        <Link href="/browse">
          <Button>{t("listingDetail.browseListings")}</Button>
        </Link>
      </div>
    );
  }

  const isOwnListing = user?.id === listing.userId;
  const createdDate = listing.createdAt ? new Date(listing.createdAt).toLocaleDateString() : "N/A";

  return (
    <div className="bg-bareter-off-white dark:bg-background min-h-screen pb-24 lg:pb-8">
      <div className="container px-4 py-6 mx-auto max-w-7xl">
      <nav aria-label="Breadcrumb" className="text-caption mb-4 flex items-center gap-1.5 flex-wrap">
        <Link href="/" className="hover:text-bareter-teal">{t("listingDetail.home")}</Link>
        <span>›</span>
        <Link href="/browse" className="hover:text-bareter-teal">{t("listingDetail.listings")}</Link>
        {(listing.categories || [])[0] && (
          <>
            <span>›</span>
            <span className="text-bareter-navy dark:text-foreground">{(listing.categories || [])[0]}</span>
          </>
        )}
        {listing.location && (
          <>
            <span>›</span>
            <span className="text-bareter-navy dark:text-foreground">{listing.location}</span>
          </>
        )}
      </nav>

      <Link href="/browse" className="inline-flex items-center gap-2 text-bareter-muted hover:text-bareter-teal mb-4 text-sm">
        <ArrowLeft className="h-4 w-4" />
        {t("listingDetail.backToListings")}
      </Link>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-6 min-w-0">
          <button
            type="button"
            onClick={() => listing.images && listing.images.length > 0 && setLightboxIndex(0)}
            className="group relative block w-full rounded-bareter-card overflow-hidden bg-bareter-off-white dark:bg-muted aspect-video shadow-bareter-card cursor-zoom-in disabled:cursor-default"
            disabled={!listing.images || listing.images.length === 0}
            data-testid="button-open-lightbox"
            aria-label="Open image gallery"
          >
            {listing.images && listing.images.length > 0 ? (
              <img
                src={listing.images[0]}
                alt={listing.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                {listing.type === "offer" ? (
                  <Package className="h-24 w-24 text-primary/30" />
                ) : (
                  <ShoppingCart className="h-24 w-24 text-primary/30" />
                )}
              </div>
            )}
            <Badge
              variant={listing.type === "offer" ? "default" : "secondary"}
              className="absolute top-4 start-4"
            >
              {listing.type === "offer" ? (
                <><Package className="h-3 w-3 me-1" /> {t("listingDetail.offer")}</>
              ) : (
                <><ShoppingCart className="h-3 w-3 me-1" /> {t("listingDetail.request")}</>
              )}
            </Badge>
          </button>

          {listing.images && listing.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" data-testid="strip-thumbnails">
              {listing.images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="relative h-20 w-20 flex-shrink-0 rounded-md overflow-hidden border border-bareter-border dark:border-border hover:border-bareter-teal transition-colors"
                  data-testid={`button-thumbnail-${i}`}
                  aria-label={`Open image ${i + 1}`}
                >
                  <img src={img} alt={`${listing.title} ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Video embed */}
          {(listing as any).videoUrl && (
            <div className="rounded-bareter-card overflow-hidden border border-bareter-border dark:border-border" data-testid="listing-video">
              <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-bareter-border dark:border-border">
                <Play className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{t("listingDetail.video")}</span>
              </div>
              <div className="aspect-video">
                <video
                  src={(listing as any).videoUrl}
                  controls
                  className="w-full h-full object-cover"
                  preload="metadata"
                />
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-card rounded-bareter-card border border-bareter-border dark:border-border shadow-bareter-card p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-bareter-navy dark:text-foreground" data-testid="text-listing-title">
                  {showTranslated && translation ? translation.title : listing.title}
                </h1>
                <button
                  type="button"
                  onClick={handleTranslateListing}
                  disabled={translating}
                  className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                  data-testid="button-translate-listing"
                >
                  {translating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Languages className="h-3 w-3" />
                  )}
                  {showTranslated ? t("translate.original") : translating ? t("translate.loading") : t("translate.button")}
                </button>
              </div>
              <div className="flex gap-2">
                {user && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={listingLikeMutation.isPending}
                    onClick={() => listingLikeMutation.mutate()}
                    data-testid="button-header-like"
                  >
                    <Heart className={`h-5 w-5 ${listing.isLiked ? "fill-destructive text-destructive" : ""}`} />
                  </Button>
                )}
                <ShareMenu
                  url={window.location.href}
                  title={listing.title}
                  size="icon"
                  variant="ghost"
                  data-testid="button-header-share"
                />
                {(!user || listing.userId !== user.id) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (!gate()) return;
                      if (!user) { navigate("/login"); return; }
                      setShowReport(true);
                    }}
                    data-testid="button-report-listing"
                    title="Report this listing"
                  >
                    <Flag className="h-5 w-5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
              {listing.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {listing.location}
                </div>
              )}
              <div className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {listing.viewCount || 0} {t("listingDetail.views")}
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {t("listingDetail.listed")} {createdDate}
              </div>
              {(listing as any).condition && conditionConfig[(listing as any).condition] && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${conditionConfig[(listing as any).condition].color}`}
                  data-testid="badge-condition"
                >
                  <Info className="h-3 w-3" />
                  {conditionConfig[(listing as any).condition].label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <div className="text-3xl md:text-4xl font-bold text-bareter-teal" data-testid="text-listing-detail-price">
                AED {parseFloat(listing.retailValue as string).toLocaleString()}
              </div>
              {(listing as any).valueFlagged && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">{t("listingDetail.valueMayBeOutside")}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {(listing.categories || []).map((category) => (
                <Badge key={category} variant="secondary">
                  {category}
                </Badge>
              ))}
            </div>

            <Separator className="my-6" />

            <div>
              <h3 className="font-semibold mb-3">{t("listingDetail.description")}</h3>
              <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                {showTranslated && translation ? translation.description : listing.description}
              </p>
            </div>

            {(listing.tags || []).length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  {t("listingDetail.tags")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(listing.tags || []).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Service tiers (Bronze / Silver / Gold) */}
            {(listing as any).serviceTiers && ((listing as any).serviceTiers as ServiceTier[]).length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  {t("listingDetail.servicePackages")}
                </h3>
                <div className="grid sm:grid-cols-3 gap-3" data-testid="service-tiers">
                  {((listing as any).serviceTiers as ServiceTier[]).map((tier, idx) => {
                    const key = tier.name.toLowerCase();
                    const cfg = tierConfig[key] || tierConfig.bronze;
                    return (
                      <div
                        key={idx}
                        className={`rounded-lg border p-4 ${cfg.bg} ${cfg.border}`}
                        data-testid={`tier-${key}`}
                      >
                        <div className={`text-sm font-bold mb-1 flex items-center gap-1 ${cfg.color}`}>
                          <span>{cfg.icon}</span>
                          {tier.name}
                        </div>
                        <div className="text-lg font-bold mb-2">
                          AED {tier.value.toLocaleString()}
                        </div>
                        {tier.description && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{tier.description}</p>
                        )}
                        {tier.deliverables.length > 0 && (
                          <ul className="space-y-1">
                            {tier.deliverables.map((d, di) => (
                              <li key={di} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" />
                                {d}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(((listing as any).exchangeItems?.length > 0) || ((listing as any).wantedCategories?.length > 0)) && (
              <div className="mt-6">
                <Separator className="mb-6" />
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ArrowLeftRight className="h-5 w-5 text-primary" />
                      {t("listingDetail.whatIWantInExchange")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {((listing as any).exchangeItems as ExchangeItem[] || []).filter((item: ExchangeItem) => item.isPriority).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5 text-primary">
                          <Star className="h-4 w-4 fill-current" />
                          {t("listingDetail.priorityItems")}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {((listing as any).exchangeItems as ExchangeItem[] || [])
                            .filter((item: ExchangeItem) => item.isPriority)
                            .map((item: ExchangeItem) => (
                              <Badge key={item.name} className="gap-1">
                                <Star className="h-3 w-3 fill-current" />
                                {item.name}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}

                    {((listing as any).exchangeItems as ExchangeItem[] || []).filter((item: ExchangeItem) => !item.isPriority).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5 text-muted-foreground">
                          <Sparkles className="h-4 w-4" />
                          {t("listingDetail.alsoOpenTo")}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {((listing as any).exchangeItems as ExchangeItem[] || [])
                            .filter((item: ExchangeItem) => !item.isPriority)
                            .map((item: ExchangeItem) => (
                              <Badge key={item.name} variant="secondary">
                                {item.name}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}

                    {((listing as any).wantedCategories as string[] || []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 text-muted-foreground">{t("listingDetail.preferredCategories")}</h4>
                        <div className="flex flex-wrap gap-2">
                          {((listing as any).wantedCategories as string[] || []).map((category: string) => (
                            <Badge key={category} variant="outline">
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {(listing as any).openToOffers && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>{t("listingDetail.openToOtherOffers")}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 py-3 border-t border-b" data-testid="listing-engagement-bar">
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                disabled={listingLikeMutation.isPending}
                onClick={() => listingLikeMutation.mutate()}
                data-testid="button-like-listing"
              >
                <Heart className={`h-4 w-4 ${listing.isLiked ? "fill-destructive text-destructive" : ""}`} />
                <span>{listing.likeCount || 0} {t("listingDetail.likes")}</span>
              </Button>
            )}
            {!user && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Heart className="h-4 w-4" />
                <span>{listing.likeCount || 0} {t("listingDetail.likes")}</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span>{listing.commentCount || 0} {t("listingDetail.proposals")}</span>
            </div>
            <ShareMenu
              url={window.location.href}
              title={listing.title}
              showLabel
              data-testid="button-share-listing"
            />
          </div>

          <Card id="comments" data-testid="listing-comments-section">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                {t("listingDetail.barterProposals")} ({listingComments?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {listingComments && listingComments.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {listingComments.map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/40" data-testid={`comment-${comment.id}`}>
                      <Link href={`/users/${comment.userId}`}>
                        <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                          <AvatarImage src={comment.user?.avatarUrl || undefined} />
                          <AvatarFallback className="text-[10px]">{comment.user?.fullName?.charAt(0) || "U"}</AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link href={`/users/${comment.userId}`}>
                            <span className="text-sm font-semibold hover:underline">{comment.user?.fullName?.split(" ")[0]}</span>
                          </Link>
                          <VerifiedBadge isVerified={comment.user?.isVerified} kycStatus={comment.user?.kycStatus} kybStatus={comment.user?.kybStatus} accountType={comment.user?.accountType} size="xs" testId="badge-verified" />
                          <FounderBadge show={!!comment.user?.founderBadge} />
                          <Badge variant="default" className="text-[10px] gap-0.5 bg-green-600 text-white no-default-hover-elevate no-default-active-elevate">
                            <ArrowRightLeft className="h-2.5 w-2.5" />
                            {comment.offerItemName}
                          </Badge>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            AED {formatValue(comment.offerItemValue)}
                          </span>
                        </div>
                        {comment.content && (
                          <p className="text-sm text-muted-foreground mt-0.5">{comment.content}</p>
                        )}
                        <span className="text-[10px] text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("listingDetail.noProposals")}</p>
              )}

              {!user && (
                <div className="pt-2 border-t text-center">
                  <Link href="/login" className="text-sm text-primary hover:underline">{t("listingDetail.signInToPropose")}</Link>
                </div>
              )}

              {user && !isOwnListing && (user.kycStatus !== "APPROVED" && user.kybStatus !== "APPROVED") && (
                <div className="pt-2 border-t" data-testid="proposal-verify-prompt">
                  <p className="text-xs text-muted-foreground text-center py-2">
                    <Shield className="h-3.5 w-3.5 inline me-1 text-primary" />
                    <Link href="/profile" className="text-primary hover:underline">{t("listingDetail.verifyIdentity")}</Link> {t("listingDetail.verifyToPropose")}
                  </p>
                </div>
              )}

              {user && !isOwnListing && (user.kycStatus === "APPROVED" || user.kybStatus === "APPROVED") && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium">{t("listingDetail.proposeWhatYouOffer")}</p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={commentOfferName}
                      onChange={(e) => setCommentOfferName(e.target.value)}
                      placeholder={t("listingDetail.whatAreYouOffering")}
                      className="text-sm flex-1"
                      data-testid="input-comment-offer-name"
                    />
                    <div className="relative flex-shrink-0 w-32">
                      <span className="absolute start-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">AED</span>
                      <Input
                        type="number"
                        value={commentOfferValue}
                        onChange={(e) => setCommentOfferValue(e.target.value)}
                        placeholder="Value"
                        className="text-sm ps-10"
                        min="1"
                        data-testid="input-comment-offer-value"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={commentMessage}
                      onChange={(e) => setCommentMessage(e.target.value)}
                      placeholder={t("listingDetail.addMessage")}
                      className="text-sm flex-1"
                      onKeyDown={(e) => e.key === "Enter" && handleSubmitComment()}
                      data-testid="input-comment-message"
                    />
                    <Button
                      size="sm"
                      onClick={handleSubmitComment}
                      disabled={createCommentMutation.isPending || !commentOfferName.trim() || !commentOfferValue}
                      className="gap-1"
                      data-testid="button-submit-comment"
                    >
                      {createCommentMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      {t("listingDetail.propose")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Price + primary CTA card */}
          {!isOwnListing && (
            <Card className="rounded-bareter-card border-bareter-border shadow-bareter-card">
              <CardContent className="p-5 space-y-3">
                <div className="text-3xl md:text-4xl font-bold text-bareter-teal">
                  AED {parseFloat(listing.retailValue as string).toLocaleString()}
                </div>
                {listing.location && (
                  <div className="inline-flex items-center gap-1 text-sm text-bareter-muted">
                    <MapPin className="h-4 w-4 text-bareter-teal" />
                    {listing.location}
                  </div>
                )}
                {user ? (
                  <Button
                    variant="bareter"
                    className="bareter-cta-pulse w-full h-[52px] gap-2 text-base"
                    onClick={() => setProposeOpen(true)}
                    data-testid="button-propose-trade-sticky"
                  >
                    <Handshake className="h-5 w-5" />
                    {t("listingDetail.proposeBarter")}
                  </Button>
                ) : (
                  <Link href="/login">
                    <Button variant="bareter" className="w-full h-[52px] gap-2 text-base">
                      <Handshake className="h-5 w-5" />
                      {t("listingDetail.signInToBarter")}
                    </Button>
                  </Link>
                )}
                <Link href={`/users/${listing.userId}`}>
                  <Button variant="bareter-outline" className="w-full h-11 gap-2">
                    <MessageSquare className="h-4 w-4" />
                    {t("listingDetail.messageSellerBtn")}
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="w-full h-11 gap-2"
                  onClick={() => quickInquiryMutation.mutate()}
                  disabled={inquirySent || quickInquiryMutation.isPending}
                  data-testid="button-quick-inquiry"
                >
                  {quickInquiryMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : inquirySent ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  {inquirySent ? t("listingDetail.inquirySent") : t("listingDetail.isStillAvailable")}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-bareter-card border-bareter-border shadow-bareter-card">
            <CardHeader>
              <CardTitle className="text-lg text-bareter-navy dark:text-foreground">{listing.type === "offer" ? t("listingDetail.aboutTheSeller") : t("listingDetail.aboutTheBuyer")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={listing.user?.avatarUrl || undefined} />
                  <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                    {listing.user?.fullName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold">{listing.user?.fullName}</span>
                    <VerifiedBadge isVerified={listing.user?.isVerified} kycStatus={listing.user?.kycStatus} kybStatus={listing.user?.kybStatus} accountType={listing.user?.accountType} size="xs" testId="badge-verified" />
                    <FounderBadge show={!!listing.user?.founderBadge} />
                  </div>
                  {listing.user?.businessName && (
                    <p className="text-sm text-muted-foreground">{listing.user.businessName}</p>
                  )}
                </div>
              </div>

              {listing.user?.bio && (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                  {listing.user.bio}
                </p>
              )}

              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  <span className="font-medium">4.8</span>
                </div>
                <span className="text-sm text-muted-foreground">(24 {t("listingDetail.reviews")})</span>
              </div>

              <Link href={`/users/${listing.userId}`}>
                <Button variant="outline" className="w-full gap-2" data-testid="button-view-profile">
                  {t("listingDetail.viewFullProfile")}
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {!isOwnListing && user && (
            <Dialog open={proposeOpen} onOpenChange={setProposeOpen}>
              <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>{t("listingDetail.proposeBarter")}</DialogTitle>
                  <DialogDescription>
                    {t("listingDetail.tellWhatYouCanOffer").replace("{name}", listing.user?.fullName || "")}
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 pe-4">
                  <div className="space-y-4 py-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">{t("listingDetail.theyAreOffering")}</p>
                      <p className="font-medium">{listing.title}</p>
                      <p className="text-sm text-primary font-bold">
                        AED {parseFloat(listing.retailValue as string).toLocaleString()}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="counter-offer">{t("listingDetail.yourCounterOffer")}</Label>
                      <Textarea
                        id="counter-offer"
                        placeholder={t("listingDetail.counterOfferPlaceholder")}
                        value={counterOffer}
                        onChange={(e) => setCounterOffer(e.target.value)}
                        className="min-h-[100px] resize-none"
                        data-testid="textarea-counter-offer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="counter-value">{t("listingDetail.estimatedValue")}</Label>
                      <div className="relative">
                        <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          AED
                        </span>
                        <Input
                          id="counter-value"
                          type="number"
                          placeholder="0.00"
                          value={counterValue}
                          onChange={(e) => setCounterValue(e.target.value)}
                          className="ps-14"
                          data-testid="input-counter-value"
                        />
                      </div>
                    </div>

                    {deliverables.length > 0 && (
                      <div className="space-y-3" data-testid="deliverables-checklist">
                        <Separator />
                        <div>
                          <Label className="flex items-center gap-2 mb-1">
                            <ClipboardList className="h-4 w-4 text-primary" />
                            {t("listingDetail.deliverablesChecklist")}
                          </Label>
                          <p className="text-xs text-muted-foreground mb-3">
                            {t("listingDetail.suggestedDeliverables")}
                          </p>
                        </div>
                        <div className="space-y-2.5 rounded-lg border p-3">
                          {deliverables.map((item, index) => (
                            <div key={index} className="flex items-start gap-2.5">
                              <Checkbox
                                id={`deliverable-${index}`}
                                checked={item.checked}
                                onCheckedChange={() => toggleDeliverable(index)}
                                data-testid={`checkbox-deliverable-${index}`}
                              />
                              <label
                                htmlFor={`deliverable-${index}`}
                                className={`text-sm leading-tight cursor-pointer ${
                                  item.checked ? "text-foreground" : "text-muted-foreground line-through"
                                }`}
                              >
                                {item.label}
                              </label>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {deliverables.filter(d => d.checked).length} {t("common.of")} {deliverables.length} {t("listingDetail.itemsSelected")}
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
                {counterValue && listing && (parseFloat(listing.retailValue as string) + parseFloat(counterValue)) > 5000 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 mx-6 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t("listingDetail.highValueBarter")}</p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        {t("listingDetail.highValueWarning")}
                      </p>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setProposeOpen(false)}>
                    {t("listingDetail.cancel")}
                  </Button>
                  <Button
                    onClick={handleProposeTrade}
                    disabled={!counterOffer || !counterValue || proposeTradeMutation.isPending}
                    data-testid="button-submit-proposal"
                  >
                    {proposeTradeMutation.isPending ? (
                      <>
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        {t("listingDetail.sending")}
                      </>
                    ) : (
                      <>
                        <MessageSquare className="me-2 h-4 w-4" />
                        {t("listingDetail.sendProposal")}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {isOwnListing && (
            <Card className="rounded-bareter-card border-bareter-border shadow-bareter-card">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-bareter-muted">{t("listingDetail.thisIsYourListing")}</p>
                <Button variant="bareter-outline" className="mt-2 w-full" data-testid="button-edit-listing">
                  {t("listingDetail.editListing")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ReportModal
        open={showReport}
        onOpenChange={setShowReport}
        targetType="listing"
        targetId={listing?.id ?? 0}
      />
      </div>

      {/* Mobile sticky bottom CTA — Propose a Barter */}
      {!isOwnListing && (
        <div className="lg:hidden fixed bottom-[60px] inset-x-0 z-40 bg-white dark:bg-card border-t border-bareter-border dark:border-border p-3 shadow-[0_-4px_12px_rgba(15,25,35,0.08)]">
          {user ? (
            <Button
              variant="bareter"
              className="w-full h-14 text-base gap-2"
              onClick={() => setProposeOpen(true)}
              data-testid="button-propose-trade-mobile"
            >
              <Handshake className="h-5 w-5" />
              {t("listingDetail.proposeBarter")} · AED {parseFloat(listing.retailValue as string).toLocaleString()}
            </Button>
          ) : (
            <Link href="/login">
              <Button variant="bareter" className="w-full h-14 text-base gap-2">
                <Handshake className="h-5 w-5" />
                {t("listingDetail.signInToBarter")}
              </Button>
            </Link>
          )}
        </div>
      )}

      {listing.images && listing.images.length > 0 && (
        <Dialog open={lightboxIndex !== null} onOpenChange={(o) => !o && setLightboxIndex(null)}>
          <DialogContent className="max-w-4xl p-0 bg-bareter-navy-deep border-none">
            <DialogHeader className="sr-only">
              <DialogTitle>{listing.title}</DialogTitle>
              <DialogDescription>Listing image gallery</DialogDescription>
            </DialogHeader>
            {lightboxIndex !== null && (
              <div className="relative">
                <img
                  src={listing.images[lightboxIndex]}
                  alt={`${listing.title} ${lightboxIndex + 1} ${t("common.of")} ${listing.images.length}`}
                  className="w-full max-h-[85vh] object-contain"
                  data-testid="img-lightbox"
                />
                {listing.images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setLightboxIndex((i) => (i! - 1 + listing.images!.length) % listing.images!.length)}
                      className="absolute start-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center transition-colors"
                      data-testid="button-lightbox-prev"
                      aria-label="Previous image"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLightboxIndex((i) => (i! + 1) % listing.images!.length)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center transition-colors"
                      data-testid="button-lightbox-next"
                      aria-label="Next image"
                    >
                      <ArrowLeft className="h-5 w-5 rotate-180" />
                    </button>
                    <div className="absolute bottom-3 inset-x-0 mx-auto w-fit px-3 py-1 rounded-full bg-bareter-navy-deep/60 text-white text-xs">
                      {lightboxIndex + 1} / {listing.images.length}
                    </div>
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
