import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ContentBrief, CampaignPerformance } from "@shared/schema";
import {
  ArrowLeft,
  Download,
  Megaphone,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface BriefsResponse {
  count: number;
  briefs: ContentBrief[];
}

interface CampaignsResponse {
  count: number;
  campaigns: CampaignPerformance[];
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatAed(value: string | number | null | undefined): string {
  return `AED ${toNumber(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

function formatPct(value: string | number | null | undefined): string {
  return `${toNumber(value).toFixed(2)}%`;
}

function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function MarketingDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Founder gate — admin role is reserved for the founder, mirroring the
  // server's `requireAdmin` middleware on /api/company-os/*.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (!user.isAdmin) setLocation("/");
  }, [user, authLoading, setLocation]);

  const briefsQuery = useQuery<BriefsResponse>({
    queryKey: ["/api/company-os/briefs"],
    enabled: !!user?.isAdmin,
    refetchOnWindowFocus: false,
  });

  const campaignsQuery = useQuery<CampaignsResponse>({
    queryKey: ["/api/company-os/campaigns"],
    enabled: !!user?.isAdmin,
    refetchOnWindowFocus: false,
  });

  const generateBriefMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/company-os/generate-brief");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-os/briefs"] });
      toast({
        title: "Brief generated",
        description: "A fresh weekly marketing brief is now available.",
      });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Generate failed",
        description: err.message,
      });
    },
  });

  async function downloadBriefPdf(briefId: string) {
    try {
      const res = await fetch(
        `/api/company-os/briefs/${encodeURIComponent(briefId)}/pdf`,
        { credentials: "include" },
      );
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Download failed",
          description: `HTTP ${res.status}`,
        });
        return;
      }
      const j: { url?: string } = await res.json();
      if (j.url) {
        window.open(j.url, "_blank", "noopener,noreferrer");
      } else {
        toast({
          variant: "destructive",
          title: "Download failed",
          description: "No URL returned",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: (err as Error).message,
      });
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-32 w-64" />
      </div>
    );
  }

  if (!user.isAdmin) return null;

  const briefs = briefsQuery.data?.briefs ?? [];
  const campaigns = campaignsQuery.data?.campaigns ?? [];

  return (
    <div className="min-h-screen overflow-x-hidden bg-background p-4 md:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin/company-os">
              <Button
                variant="ghost"
                size="icon"
                data-testid="link-back-company-os"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1
                className="truncate text-2xl font-semibold"
                data-testid="text-page-title"
              >
                Marketing
              </h1>
              <p
                className="truncate text-xs text-muted-foreground"
                data-testid="text-page-subtitle"
              >
                Weekly briefs, PDFs, and campaign performance
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" data-testid="badge-brief-count">
              {briefsQuery.data?.count ?? 0} briefs
            </Badge>
            <Badge variant="outline" data-testid="badge-campaign-count">
              {campaignsQuery.data?.count ?? 0} campaigns
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                briefsQuery.refetch();
                campaignsQuery.refetch();
              }}
              disabled={
                briefsQuery.isFetching || campaignsQuery.isFetching
              }
              data-testid="button-refresh"
            >
              <RefreshCw
                className={`mr-1 h-3 w-3 ${
                  briefsQuery.isFetching || campaignsQuery.isFetching
                    ? "animate-spin"
                    : ""
                }`}
              />
              Refresh
            </Button>
          </div>
        </header>

        <Card data-testid="card-briefs">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Megaphone className="h-4 w-4" /> Weekly content briefs
            </CardTitle>
            <Button
              size="sm"
              onClick={() => generateBriefMutation.mutate()}
              disabled={generateBriefMutation.isPending}
              data-testid="button-generate-brief"
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {generateBriefMutation.isPending
                ? "Generating…"
                : "Generate brief"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {briefsQuery.isLoading && (
              <Skeleton
                className="h-20 w-full"
                data-testid="skeleton-briefs"
              />
            )}
            {briefsQuery.error && (
              <p
                className="text-xs text-destructive"
                data-testid="text-briefs-error"
              >
                Failed to load briefs: {(briefsQuery.error as Error).message}
              </p>
            )}
            {!briefsQuery.isLoading && briefs.length === 0 && (
              <p
                className="text-xs text-muted-foreground"
                data-testid="text-briefs-empty"
              >
                No briefs yet. Click "Generate brief" or wait for Monday 09:00
                (Asia/Dubai).
              </p>
            )}
            {briefs.map((b) => (
              <div
                key={b.id}
                className="flex flex-col gap-2 rounded-md border border-border p-3 text-xs sm:flex-row sm:items-start sm:justify-between"
                data-testid={`row-brief-${b.id}`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className="font-medium"
                      data-testid={`text-brief-theme-${b.id}`}
                    >
                      {b.theme}
                    </p>
                    <Badge
                      variant="secondary"
                      data-testid={`badge-brief-week-${b.id}`}
                    >
                      Week of {b.weekStart}
                    </Badge>
                  </div>
                  <p
                    className="text-muted-foreground"
                    data-testid={`text-brief-audience-${b.id}`}
                  >
                    {b.audience}
                  </p>
                  {Array.isArray(b.hashtags) && b.hashtags.length > 0 && (
                    <p
                      className="font-mono text-[11px] text-muted-foreground"
                      data-testid={`text-brief-hashtags-${b.id}`}
                    >
                      {b.hashtags.slice(0, 6).join(" ")}
                    </p>
                  )}
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {b.createdAt
                      ? `Created ${formatDateTime(b.createdAt)}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                  <span
                    className="font-mono text-xs text-muted-foreground"
                    data-testid={`text-brief-budget-${b.id}`}
                  >
                    {formatAed(b.suggestedBudgetAed)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!b.pdfStorageKey}
                    onClick={() => downloadBriefPdf(b.id)}
                    data-testid={`button-download-brief-${b.id}`}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card data-testid="card-campaigns">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Megaphone className="h-4 w-4" /> Recent campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            {campaignsQuery.isLoading && (
              <Skeleton
                className="h-20 w-full"
                data-testid="skeleton-campaigns"
              />
            )}
            {campaignsQuery.error && (
              <p
                className="text-xs text-destructive"
                data-testid="text-campaigns-error"
              >
                Failed to load campaigns:{" "}
                {(campaignsQuery.error as Error).message}
              </p>
            )}
            {!campaignsQuery.isLoading && campaigns.length === 0 && (
              <p
                className="text-xs text-muted-foreground"
                data-testid="text-campaigns-empty"
              >
                No campaigns logged yet. Use{" "}
                <span className="font-mono">campaign update</span> on WhatsApp
                to record one.
              </p>
            )}
            {campaigns.length > 0 && (
              <div className="overflow-x-auto">
                <Table data-testid="table-campaigns">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Conv.</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Updated
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c) => (
                      <TableRow
                        key={c.id}
                        data-testid={`row-campaign-${c.id}`}
                      >
                        <TableCell
                          className="font-medium"
                          data-testid={`text-campaign-name-${c.id}`}
                        >
                          {c.campaignName}
                        </TableCell>
                        <TableCell
                          data-testid={`text-campaign-channel-${c.id}`}
                        >
                          {c.channel ?? "—"}
                        </TableCell>
                        <TableCell
                          className="text-right font-mono"
                          data-testid={`text-campaign-ctr-${c.id}`}
                        >
                          {formatPct(c.ctr)}
                        </TableCell>
                        <TableCell
                          className="text-right font-mono"
                          data-testid={`text-campaign-spend-${c.id}`}
                        >
                          {formatAed(c.spendAed)}
                        </TableCell>
                        <TableCell
                          className="text-right font-mono"
                          data-testid={`text-campaign-conv-${c.id}`}
                        >
                          {c.conversions}
                        </TableCell>
                        <TableCell
                          className="hidden text-xs text-muted-foreground sm:table-cell"
                          data-testid={`text-campaign-updated-${c.id}`}
                        >
                          {formatDateTime(c.updatedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
