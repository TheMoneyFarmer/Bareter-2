import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { hapticSuccess } from "@/hooks/use-haptics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { DealWithUsers, Listing, ListingComment, User } from "@shared/schema";
import { useLocation } from "wouter";
import { useEffect } from "react";
import {
  Handshake,
  ArrowRight,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  FileText,
  MessageSquare,
  Calendar,
  ArrowRightLeft,
  Bell,
  MoreVertical,
  Send,
  RefreshCw,
} from "lucide-react";

type ProposalWithListing = ListingComment & {
  listing?: Listing & { user?: User };
  proposer?: User;
};

const STATE_ICONS: Record<string, { color: string; icon: any }> = {
  draft: { color: "bg-gray-500", icon: FileText },
  proposed: { color: "bg-blue-500", icon: Clock },
  accepted: { color: "bg-green-500", icon: CheckCircle },
  active: { color: "bg-green-500", icon: CheckCircle },
  in_progress: { color: "bg-yellow-500", icon: Package },
  delivery_proof: { color: "bg-orange-500", icon: FileText },
  completed: { color: "bg-emerald-500", icon: CheckCircle },
  cancelled: { color: "bg-red-500", icon: XCircle },
};

function dealBanner(state: string, isSeeker: boolean, otherName: string) {
  if (state === "proposed" && !isSeeker) {
    return { bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800", text: `⚡ Action needed: accept or decline ${otherName}'s proposal`, cta: "Review & Respond" };
  }
  if (state === "proposed" && isSeeker) {
    return { bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800", text: `⏳ Waiting for ${otherName} to respond to your offer`, cta: "View Deal" };
  }
  if (state === "accepted" || state === "active") {
    return { bg: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800", text: "✅ Deal accepted! Chat to coordinate the exchange, then mark it In Progress.", cta: "Open Chat & Complete Deal" };
  }
  if (state === "in_progress") {
    return { bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800", text: "📦 In progress — coordinate delivery with the other party.", cta: "Open Chat" };
  }
  if (state === "delivery_proof") {
    return { bg: "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800", text: "🔍 Delivery confirmation pending — both parties must confirm.", cta: "Confirm Delivery" };
  }
  return null;
}

function DealCard({ deal, userId }: { deal: DealWithUsers; userId: string }) {
  const { t } = useI18n();
  const isSeeker = deal.seekerId === userId;
  const otherParty = isSeeker ? deal.provider : deal.seeker;
  const myOffer = isSeeker ? deal.seekerOffer : deal.providerOffer;
  const myValue = isSeeker ? deal.seekerValue : deal.providerValue;
  const theirOffer = isSeeker ? deal.providerOffer : deal.seekerOffer;
  const theirValue = isSeeker ? deal.providerValue : deal.seekerValue;
  const config = STATE_ICONS[deal.state] || STATE_ICONS.draft;
  const stateLabel = t(`dealDetail.state.${deal.state}`) || deal.state;
  const banner = dealBanner(deal.state, isSeeker, otherParty?.fullName || "them");

  return (
    <Link href={`/deals/${deal.id}`}>
      <Card className="hover-elevate cursor-pointer overflow-hidden" data-testid={`card-deal-${deal.id}`}>
        {banner && (
          <div className={`border-b px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-3 ${banner.bg}`}>
            <span className="flex-1">{banner.text}</span>
            <span className="text-primary font-semibold text-xs shrink-0 flex items-center gap-1">
              {banner.cta} <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        )}
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12 flex-shrink-0">
              <AvatarImage src={otherParty?.avatarUrl || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {otherParty?.fullName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold truncate">{otherParty?.fullName}</span>
                <Badge variant="outline" className="text-xs shrink-0">
                  <div className={`h-2 w-2 rounded-full ${config.color} mr-1`} />
                  {stateLabel}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Deal #{deal.dealNumber}
              </p>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {isSeeker ? t("deals.youOffer") : t("deals.youProvide")}
                  </p>
                  <p className="font-medium line-clamp-1">{myOffer}</p>
                  <p className="text-primary font-bold">
                    AED {parseFloat(myValue as string).toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {isSeeker ? t("deals.theyProvide") : t("deals.theyOffer")}
                  </p>
                  <p className="font-medium line-clamp-1">{theirOffer}</p>
                  <p className="text-primary font-bold">
                    AED {parseFloat(theirValue as string).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {deal.createdAt ? new Date(deal.createdAt).toLocaleDateString() : "N/A"}
                </div>
                <Button variant="default" size="sm" className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90">
                  <MessageSquare className="h-3 w-3" />
                  Open Chat
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function DealsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/me/pending-proposals"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/me/outgoing-proposals"] });
  }, [queryClient]);

  const { isRefreshing: isPullRefreshing } = usePullToRefresh(handlePullRefresh);

  // Email links land here — redirect to login with returnTo so the user comes
  // back to this page after signing in instead of landing on a blank auth wall.
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/login?redirect=/deals`, { replace: true });
    }
  }, [authLoading, user]);

  const { data: deals, isLoading } = useQuery<DealWithUsers[]>({
    queryKey: ["/api/deals"],
    enabled: !!user,
  });

  const { data: pendingProposals, isLoading: proposalsLoading } = useQuery<ProposalWithListing[]>({
    queryKey: ["/api/me/pending-proposals"],
    enabled: !!user,
  });

  const { data: outgoingProposals, isLoading: outgoingLoading } = useQuery<ProposalWithListing[]>({
    queryKey: ["/api/me/outgoing-proposals"],
    enabled: !!user,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ listingId, proposalId, status }: { listingId: string; proposalId: string; status: "accepted" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/listings/${listingId}/proposals/${proposalId}`, { status });
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/pending-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      if (vars.status === "accepted" && data?.dealId) {
        void hapticSuccess();
        toast({ title: "Proposal accepted! 🎉", description: "Both parties notified. Opening deal chat…" });
        setTimeout(() => navigate(`/deals/${data.dealId}`), 1000);
      } else if (vars.status === "accepted") {
        void hapticSuccess();
        toast({ title: "Proposal accepted! 🎉" });
      } else {
        toast({ title: "Proposal declined" });
      }
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to respond", variant: "destructive" }),
  });

  const activeDeals = deals?.filter((d) => !["completed", "cancelled"].includes(d.state)) || [];
  const completedDeals = deals?.filter((d) => d.state === "completed") || [];
  const cancelledDeals = deals?.filter((d) => d.state === "cancelled") || [];

  if (!user) return null;

  return (
    <>
    {Capacitor.isNativePlatform() && isPullRefreshing && (
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-background rounded-full shadow-md p-2.5">
        <RefreshCw className="h-5 w-5 animate-spin text-bareter-teal" />
      </div>
    )}
    <div className="container px-4 py-8 mx-auto max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t("deals.title")}</h1>
          <p className="text-muted-foreground">
            {t("deals.manageDeals")}
          </p>
        </div>
        <Link href="/browse">
          <Button className="gap-2" data-testid="button-find-trades">
            <Handshake className="h-4 w-4" />
            {t("deals.findBarters")}
          </Button>
        </Link>
      </div>

      {/* Incoming Proposals — all barter offers received on your listings */}
      {(proposalsLoading || (pendingProposals && pendingProposals.length > 0)) && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Incoming Proposals</h2>
            {pendingProposals && (() => {
              const pendingCount = pendingProposals.filter((p) => !p.status || p.status === "pending").length;
              return pendingCount > 0 ? (
                <Badge variant="destructive" className="text-xs">{pendingCount} pending</Badge>
              ) : null;
            })()}
          </div>
          {proposalsLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {pendingProposals!.map((p) => {
                const status = p.status || "pending";
                const isPending = status === "pending";
                const isAccepted = status === "accepted";
                const cardBg = isAccepted
                  ? "border-green-200 bg-green-50/40 dark:border-green-800 dark:bg-green-950/20"
                  : status === "rejected"
                  ? "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20"
                  : "border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20";
                const statusBadge = isAccepted
                  ? <Badge className="text-[10px] bg-green-600 hover:bg-green-600">Accepted</Badge>
                  : status === "rejected"
                  ? <Badge className="text-[10px] bg-red-600 hover:bg-red-600">Declined</Badge>
                  : <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500">Pending</Badge>;

                return (
                  <Card key={p.id} className={cardBg}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarImage src={(p.proposer as any)?.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary text-white text-sm">
                            {(p.proposer as any)?.fullName?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{(p.proposer as any)?.fullName || "Someone"}</span>
                            <span className="inline-flex items-center gap-1 bg-primary text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
                              <ArrowRightLeft className="h-3 w-3" />
                              {p.offerItemName}
                            </span>
                            <span className="text-sm font-bold text-primary">AED {Number(p.offerItemValue).toLocaleString()}</span>
                            {statusBadge}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            On: <span className="font-medium text-foreground">{(p.listing as any)?.title || "your listing"}</span>
                          </p>
                          {p.offerDescription && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.offerDescription}</p>
                          )}
                          <div className="flex gap-2 mt-3 items-center">
                            {isPending && (
                              <>
                                <Button
                                  size="sm"
                                  className="h-8 px-4 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                                  onClick={() => respondMutation.mutate({ listingId: p.listingId, proposalId: p.id, status: "accepted" })}
                                  disabled={respondMutation.isPending}
                                >
                                  ✓ Accept & Start Deal
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-4 text-xs border-red-300 text-red-600 hover:bg-red-50 gap-1"
                                  onClick={() => respondMutation.mutate({ listingId: p.listingId, proposalId: p.id, status: "rejected" })}
                                  disabled={respondMutation.isPending}
                                >
                                  ✕ Decline
                                </Button>
                              </>
                            )}
                            {isAccepted && (p as any).dealId && (
                              <Link href={`/deals/${(p as any).dealId}`}>
                                <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1">
                                  <MessageSquare className="h-3 w-3" /> Open Deal Chat
                                </Button>
                              </Link>
                            )}
                            <Link href={`/listings/${p.listingId}`} className={isPending ? "ml-auto" : ""}>
                              <Button size="sm" variant="ghost" className="h-8 text-xs">
                                View Listing →
                              </Button>
                            </Link>
                            {/* Options menu — always allows changing status */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 ml-auto">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {status !== "accepted" && (
                                  <DropdownMenuItem
                                    className="text-green-700 focus:text-green-700 cursor-pointer"
                                    onClick={() => respondMutation.mutate({ listingId: p.listingId, proposalId: p.id, status: "accepted" })}
                                    disabled={respondMutation.isPending}
                                  >
                                    ✓ Accept proposal
                                  </DropdownMenuItem>
                                )}
                                {status !== "rejected" && (
                                  <DropdownMenuItem
                                    className="text-red-700 focus:text-red-700 cursor-pointer"
                                    onClick={() => respondMutation.mutate({ listingId: p.listingId, proposalId: p.id, status: "rejected" })}
                                    disabled={respondMutation.isPending}
                                  >
                                    ✕ Decline proposal
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Outgoing Proposals — offers you submitted on other listings */}
      {(outgoingLoading || (outgoingProposals && outgoingProposals.length > 0)) && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Send className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">My Proposals Sent</h2>
            {outgoingProposals && outgoingProposals.length > 0 && (
              <Badge variant="outline" className="text-xs">{outgoingProposals.length}</Badge>
            )}
          </div>
          {outgoingLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {outgoingProposals!.map((p) => {
                const status = p.status || "pending";
                const isAccepted = status === "accepted";
                const cardBg = isAccepted
                  ? "border-green-200 bg-green-50/40 dark:border-green-800 dark:bg-green-950/20"
                  : status === "rejected"
                  ? "border-red-100 bg-red-50/20 dark:border-red-900 dark:bg-red-950/10"
                  : "border-border";
                const statusBadge = isAccepted
                  ? <Badge className="text-[10px] bg-green-600 hover:bg-green-600">Accepted ✓</Badge>
                  : status === "rejected"
                  ? <Badge className="text-[10px] bg-red-600 hover:bg-red-600">Declined</Badge>
                  : <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500">Awaiting response</Badge>;

                const listing = (p as any).listing;
                const owner = listing?.user;

                return (
                  <Card key={p.id} className={cardBg}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarImage src={owner?.avatarUrl || undefined} />
                          <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                            {owner?.fullName?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{listing?.title || "Unknown listing"}</span>
                            {statusBadge}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Owner: <span className="font-medium text-foreground">{owner?.fullName || "Unknown"}</span>
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[11px] font-semibold px-2 py-0.5 rounded-full">
                              <ArrowRightLeft className="h-3 w-3" />
                              Your offer: {p.offerItemName}
                            </span>
                            <span className="text-sm font-bold text-primary">AED {Number(p.offerItemValue).toLocaleString()}</span>
                          </div>
                          {p.offerDescription && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{p.offerDescription}</p>
                          )}
                          <div className="flex gap-2 mt-3 items-center">
                            {isAccepted && (p as any).dealId && (
                              <Link href={`/deals/${(p as any).dealId}`}>
                                <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1">
                                  <MessageSquare className="h-3 w-3" /> Open Deal Chat
                                </Button>
                              </Link>
                            )}
                            <Link href={`/listings/${p.listingId}`} className="ml-auto">
                              <Button size="sm" variant="ghost" className="h-8 text-xs">
                                View Listing →
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Tabs defaultValue="active" className="space-y-6">
        <TabsList>
          <TabsTrigger value="active" className="gap-2" data-testid="tab-active-deals">
            <Clock className="h-4 w-4" />
            {t("deals.active")} ({activeDeals.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2" data-testid="tab-completed-deals">
            <CheckCircle className="h-4 w-4" />
            {t("deals.completed")} ({completedDeals.length})
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="gap-2" data-testid="tab-cancelled-deals">
            <XCircle className="h-4 w-4" />
            {t("deals.cancelled")} ({cancelledDeals.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : activeDeals.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Handshake className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("deals.noActiveDeals")}</h3>
                <p className="text-muted-foreground mb-4">
                  {t("deals.browseAndPropose")}
                </p>
                <Link href="/browse">
                  <Button>{t("listing.browseListings")}</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {activeDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} userId={user.id} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedDeals.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("deals.noCompletedDeals")}</h3>
                <p className="text-muted-foreground">
                  {t("deals.completedWillAppear")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {completedDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} userId={user.id} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cancelled">
          {cancelledDeals.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <XCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("deals.noCancelledDeals")}</h3>
                <p className="text-muted-foreground">
                  {t("deals.cancelledWillAppear")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {cancelledDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} userId={user.id} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
}
