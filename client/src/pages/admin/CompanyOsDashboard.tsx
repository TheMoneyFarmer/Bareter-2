import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertTriangle,
  ArrowLeft,
  BellOff,
  Check,
  Download,
  RefreshCw,
  TrendingUp,
  Users,
  ShoppingCart,
  Wallet,
  FileText,
  Megaphone,
  Bot,
  ClipboardList,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  LineChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Mirrors `LiveKpis` from `server/companyOs/dashboardAgent.ts`. Kept as
// a frontend-local type so the admin bundle doesn't drag the server
// schema into the client tree.
interface LiveKpis {
  date: string;
  totalUsers: number;
  newUsersToday: number;
  activeUsers7d: number;
  totalPosts: number;
  postsToday: number;
  totalDeals: number;
  dealsCompletedToday: number;
  gmvAed7d: number;
  completionRatePct: number;
  topCategory: string | null;
  topCity: string | null;
  aiCostAedMonthToDate: number;
  revenue30d: { date: string; totalAed: number; count: number }[];
  gmv30d: { date: string; gmvAed: number; deals: number }[];
  agentCost30d: { date: string; agents: Record<string, number> }[];
  agentRunHeatmap7d: { hour: number; day: number; count: number }[];
  salesPipeline: { status: string; count: number }[];
  topCategories: { name: string; count: number }[];
  topCities: { name: string; count: number }[];
  recentLegalDocuments: {
    id: string;
    title: string;
    documentType: string;
    createdAt: string | null;
  }[];
  latestContentBriefs: {
    id: string;
    weekStart: string;
    theme: string;
    suggestedBudgetAed: number;
  }[];
  latestCampaigns: {
    id: string;
    campaignName: string;
    channel: string | null;
    ctr: number;
    spendAed: number;
    conversions: number;
  }[];
}

interface BoardReport {
  id: string;
  reportMonth: string;
  objectStorageKey: string;
  summaryText: string;
  pdfSizeBytes: number;
  createdAt: string | null;
}

interface BoardReportsResponse {
  count: number;
  reports: BoardReport[];
}

interface SnapshotsResponse {
  count: number;
  snapshots: Array<{
    snapshotDate: string;
    totalUsers: number;
    totalDeals: number;
    gmvAed7d: string | number;
    aiCostAedMonthToDate: string | number;
  }>;
}

// Mirrors `ProactiveAlert` from `shared/schema.ts` — kept local to keep
// the admin bundle from pulling in the server schema.
interface ProactiveAlertRow {
  id: string;
  alertType: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  dataJson?: Record<string, unknown> | null;
  dayKey: string;
  acknowledgedAt: string | null;
  createdAt: string | null;
}

interface AlertsResponse {
  count: number;
  snoozedUntil: string | null;
  alerts: ProactiveAlertRow[];
}

// Mirrors `AgentBudgetVerdict` from `server/companyOs/costTracker.ts`.
// The dashboard renders one progress bar per row; colour thresholds
// (green < 80%, amber 80–95%, red ≥ 95%) are duplicated client-side
// so the visual cue doesn't depend on the server-side `safe` flag,
// which only flips at 95%.
interface AgentBudgetVerdict {
  agentName: string;
  spentAed: number;
  budgetAed: number;
  remainingAed: number;
  pctUsed: number;
  safe: boolean;
}

interface AgentBudgetsResponse {
  count: number;
  verdicts: AgentBudgetVerdict[];
}

const PIE_COLORS = [
  "hsl(var(--primary))",
  "#0ea5e9",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#22c55e",
  "#64748b",
];

function formatAed(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `AED ${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function shortDate(iso: string): string {
  // "2026-04-25" → "Apr 25". Saves horizontal space on dense charts.
  const [, m, d] = iso.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mi = Math.max(1, Math.min(12, Number(m))) - 1;
  return `${months[mi]} ${d}`;
}

function StatCard(props: {
  testId: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card data-testid={props.testId} className="hover-elevate">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            {props.icon}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{props.label}</p>
            <p className="truncate text-xl font-semibold">{props.value}</p>
            {props.hint && (
              <p className="truncate text-xs text-muted-foreground">{props.hint}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard(props: {
  title: string;
  testId: string;
  children: React.ReactElement;
  headerExtra?: React.ReactNode;
}) {
  return (
    <Card data-testid={props.testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">{props.title}</CardTitle>
        {props.headerExtra}
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {props.children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default function CompanyOsDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Founder gate — admin role is reserved for the founder, mirroring the
  // server's `requireAdmin` middleware on /api/company-os/dashboard/*.
  // We separate "still loading auth" from "loaded but not allowed" so
  // unauthenticated users get redirected to /login instead of staring
  // at a skeleton.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (!user.isAdmin) setLocation("/");
  }, [user, authLoading, setLocation]);

  // Live KPIs — refetched every 60s via React Query's built-in interval.
  // Keeping the queryKey to a single string lets the default queryFn in
  // queryClient.ts (`fetch(queryKey.join("/"))`) hit the right URL.
  const liveQuery = useQuery<LiveKpis>({
    queryKey: ["/api/company-os/dashboard/live"],
    enabled: !!user?.isAdmin,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  // Snapshot history — refreshed on the same cadence so the snapshot
  // count + chronological scaffolding stay in sync with the cron writes.
  const snapshotsQuery = useQuery<SnapshotsResponse>({
    queryKey: ["/api/company-os/dashboard/snapshots"],
    enabled: !!user?.isAdmin,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  // Open alerts feed — surfaces the Intelligence Agent's anomaly findings
  // directly on the dashboard so the founder doesn't need to chase the
  // WhatsApp thread to triage. Polled at the same 60s cadence as the
  // KPIs so freshly-fired alerts appear without a manual refresh.
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Server defaults to status=open, so a flat URL keyed query works with
  // the project's default queryFn (which joins queryKey segments with "/").
  const alertsQuery = useQuery<AlertsResponse>({
    queryKey: ["/api/company-os/alerts"],
    enabled: !!user?.isAdmin,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  // Per-agent monthly budget verdicts — refreshed on the same 60s
  // cadence as the rest of the dashboard so the founder sees an agent
  // creep toward its cap before throttling kicks in. Server already
  // returns the canonical agent name, so no client-side dedupe needed.
  const budgetsQuery = useQuery<AgentBudgetsResponse>({
    queryKey: ["/api/company-os/alerts/budgets"],
    enabled: !!user?.isAdmin,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  // Board reports — last 12 months of generated PDFs. Refreshed on the
  // KPI cadence so a fresh cron run shows up without a manual reload.
  const boardReportsQuery = useQuery<BoardReportsResponse>({
    queryKey: ["/api/company-os/board-reports"],
    enabled: !!user?.isAdmin,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const generateBoardReportMutation = useMutation<unknown, Error, string | undefined>({
    mutationFn: async (month) => {
      const url = month
        ? `/api/company-os/board-reports/generate?month=${encodeURIComponent(month)}`
        : `/api/company-os/board-reports/generate`;
      const res = await apiRequest("POST", url);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-os/board-reports"] });
      toast({ title: "Board report generated" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Generate failed",
        description: err.message,
      });
    },
  });

  async function downloadBoardReport(month: string) {
    try {
      const res = await fetch(
        `/api/company-os/board-reports/${encodeURIComponent(month)}/pdf`,
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
      const j: { signedUrl?: string } = await res.json();
      if (j.signedUrl) {
        window.open(j.signedUrl, "_blank", "noopener,noreferrer");
      } else {
        toast({ variant: "destructive", title: "Download failed", description: "No URL returned" });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: (err as Error).message,
      });
    }
  }

  const ackMutation = useMutation<unknown, Error, string>({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/company-os/alerts/${alertId}/ack`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/company-os/alerts"],
      });
      toast({ title: "Alert acknowledged" });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Acknowledge failed",
        description: err.message,
      });
    },
  });

  const snoozeMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/company-os/alerts/snooze`, {
        hours: 24,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/company-os/alerts"],
      });
      toast({ title: "Alerts snoozed for 24h", description: "Critical alerts will still page you." });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Snooze failed",
        description: err.message,
      });
    },
  });

  const live = liveQuery.data;
  const isLoading = liveQuery.isLoading;
  const isFetching =
    liveQuery.isFetching ||
    snapshotsQuery.isFetching ||
    alertsQuery.isFetching ||
    budgetsQuery.isFetching ||
    boardReportsQuery.isFetching;
  const boardReports = boardReportsQuery.data?.reports ?? [];
  const error = liveQuery.error ?? snapshotsQuery.error;
  const openAlerts = alertsQuery.data?.alerts ?? [];
  const snoozedUntilDate = alertsQuery.data?.snoozedUntil
    ? new Date(alertsQuery.data.snoozedUntil)
    : null;
  const snoozeActive =
    !!snoozedUntilDate && snoozedUntilDate.getTime() > Date.now();

  // Chart series come straight from the live aggregation — no client-side
  // re-bucketing needed. Memoised so chart re-renders are cheap. The
  // revenue line is sourced from `revenue30d` (Stripe-backed finance
  // snapshots), while GMV bars come from `gmv30d` (sum of completed
  // deals' seeker+provider value) — distinct metrics by design.
  const revenueSeries = useMemo(
    () =>
      (live?.revenue30d ?? []).map((d) => ({
        date: d.date,
        label: shortDate(d.date),
        revenue: Number(d.totalAed) || 0,
        count: d.count,
      })),
    [live?.revenue30d],
  );

  const gmvSeries = useMemo(
    () =>
      (live?.gmv30d ?? []).map((d) => ({
        date: d.date,
        label: shortDate(d.date),
        gmv: Number(d.gmvAed) || 0,
        deals: d.deals,
      })),
    [live?.gmv30d],
  );

  const agentNames = useMemo(() => {
    const set = new Set<string>();
    for (const row of live?.agentCost30d ?? [])
      for (const k of Object.keys(row.agents ?? {})) set.add(k);
    return Array.from(set).sort();
  }, [live?.agentCost30d]);

  const agentSpendSeries = useMemo(
    () =>
      (live?.agentCost30d ?? []).map((row) => {
        const out: Record<string, number | string> = {
          date: row.date,
          label: shortDate(row.date),
        };
        for (const a of agentNames) out[a] = Number(row.agents?.[a] ?? 0);
        return out;
      }),
    [live?.agentCost30d, agentNames],
  );

  const heatmapData = useMemo(
    () =>
      (live?.agentRunHeatmap7d ?? [])
        .slice()
        .sort((a, b) => a.day - b.day || a.hour - b.hour)
        .map((r) => ({
          slot: `D${r.day} ${String(r.hour).padStart(2, "0")}h`,
          count: r.count,
        })),
    [live?.agentRunHeatmap7d],
  );

  const funnelData = useMemo(() => {
    // Map raw sales-lead statuses onto the canonical funnel order.
    // Unknown statuses are rolled into "New" so the chart still renders
    // the full pipeline shape.
    const order = ["new", "contacted", "qualified", "converted"];
    const counts: Record<string, number> = {
      new: 0,
      contacted: 0,
      qualified: 0,
      converted: 0,
    };
    for (const row of live?.salesPipeline ?? []) {
      const k = String(row.status ?? "").toLowerCase();
      if (k in counts) counts[k] += row.count;
      else counts.new += row.count;
    }
    return order.map((k, i) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1),
      value: counts[k],
      fill: PIE_COLORS[i],
    }));
  }, [live?.salesPipeline]);

  // Sort budgets by pct used (highest first) so the founder's eye lands
  // on the agents closest to throttling. Server returns the canonical
  // agent name, so no client-side dedupe needed.
  const budgetVerdicts = useMemo(() => {
    const verdicts = budgetsQuery.data?.verdicts ?? [];
    return verdicts
      .slice()
      .sort((a, b) => b.pctUsed - a.pctUsed);
  }, [budgetsQuery.data?.verdicts]);

  const topCategoriesData = useMemo(
    () =>
      (live?.topCategories ?? []).map((c, i) => ({
        name: c.name,
        value: Number(c.count) || 0,
        fill: PIE_COLORS[i % PIE_COLORS.length],
      })),
    [live?.topCategories],
  );

  // Synthesise a JSON download using whichever payload is freshest. We
  // prefer today's persisted snapshot (so historical downloads are
  // identical to the cron output); on miss, fall back to the live blob.
  function downloadJson() {
    const today = (live?.date ?? new Date().toISOString().slice(0, 10));
    const url = `/api/company-os/dashboard/snapshot/${today}.json`;
    fetch(url, { credentials: "include" })
      .then((r) => {
        if (r.ok) {
          window.location.href = url;
          return;
        }
        downloadFallback(today);
      })
      .catch(() => downloadFallback(today));
  }

  function downloadFallback(today: string) {
    const blob = new Blob(
      [
        JSON.stringify(
          { live: live ?? null, snapshots: snapshotsQuery.data?.snapshots ?? [] },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kpi-live-${today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-32 w-64" />
      </div>
    );
  }

  if (!user.isAdmin) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="icon" data-testid="link-back-admin">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-page-title">
                Company OS Dashboard
              </h1>
              <p className="text-xs text-muted-foreground" data-testid="text-as-of">
                {live?.date
                  ? `Dubai ${live.date} · last refreshed ${new Date().toLocaleTimeString()}`
                  : "Loading…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" data-testid="badge-snapshots">
              {snapshotsQuery.data?.count ?? 0} snapshots
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                liveQuery.refetch();
                snapshotsQuery.refetch();
                alertsQuery.refetch();
                budgetsQuery.refetch();
                boardReportsQuery.refetch();
              }}
              disabled={isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={downloadJson}
              data-testid="button-download-json"
            >
              <Download className="mr-2 h-4 w-4" />
              Download JSON
            </Button>
          </div>
        </header>

        {error && (
          <Card data-testid="card-error">
            <CardContent className="p-4 text-sm text-destructive">
              Failed to load dashboard: {String((error as Error).message ?? error)}
            </CardContent>
          </Card>
        )}

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <StatCard
            testId="stat-users"
            icon={<Users className="h-5 w-5" />}
            label="Users"
            value={isLoading ? "…" : String(live?.totalUsers ?? 0)}
            hint={
              live
                ? `+${live.newUsersToday} today · ${live.activeUsers7d} active 7d`
                : undefined
            }
          />
          <StatCard
            testId="stat-posts"
            icon={<ShoppingCart className="h-5 w-5" />}
            label="Posts"
            value={isLoading ? "…" : String(live?.totalPosts ?? 0)}
            hint={live ? `+${live.postsToday} today` : undefined}
          />
          <StatCard
            testId="stat-completed-deals"
            icon={<TrendingUp className="h-5 w-5" />}
            label="Deals (today)"
            value={isLoading ? "…" : String(live?.dealsCompletedToday ?? 0)}
            hint={live ? `${live.totalDeals} all-time` : undefined}
          />
          <StatCard
            testId="stat-gmv"
            icon={<Wallet className="h-5 w-5" />}
            label="GMV (7d)"
            value={isLoading ? "…" : formatAed(live?.gmvAed7d)}
            hint={
              live ? `${live.completionRatePct.toFixed(1)}% completion` : undefined
            }
          />
          <StatCard
            testId="stat-ai-spend"
            icon={<Bot className="h-5 w-5" />}
            label="AI spend (MTD)"
            value={isLoading ? "…" : formatAed(live?.aiCostAedMonthToDate)}
          />
          <StatCard
            testId="stat-top-category"
            icon={<Megaphone className="h-5 w-5" />}
            label="Top category"
            value={isLoading ? "…" : live?.topCategory ?? "—"}
            hint={live ? `Top city: ${live.topCity ?? "—"}` : undefined}
          />
        </div>

        {/* Intelligence Agent — open anomaly alerts. Only renders when
            there are open rows (or while loading) so a quiet system
            doesn't waste vertical space on the dashboard. */}
        {(alertsQuery.isLoading || openAlerts.length > 0) && (
          <Card data-testid="card-alerts">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Open alerts
                  <Badge
                    variant="secondary"
                    data-testid="badge-alerts-count"
                  >
                    {openAlerts.length}
                  </Badge>
                  {snoozeActive && snoozedUntilDate && (
                    <Badge
                      variant="outline"
                      className="gap-1"
                      data-testid="badge-alerts-snoozed"
                    >
                      <BellOff className="h-3 w-3" />
                      snoozed until {snoozedUntilDate.toLocaleTimeString()}
                    </Badge>
                  )}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => snoozeMutation.mutate()}
                  disabled={snoozeMutation.isPending || snoozeActive}
                  data-testid="button-snooze-alerts"
                >
                  <BellOff className="mr-2 h-4 w-4" />
                  Snooze 24h
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {alertsQuery.isLoading && (
                <Skeleton className="h-16 w-full" data-testid="skeleton-alerts" />
              )}
              {!alertsQuery.isLoading && openAlerts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No open alerts.
                </p>
              )}
              {openAlerts.map((alert) => {
                const sev = alert.severity;
                const sevColor =
                  sev === "critical"
                    ? "destructive"
                    : sev === "warning"
                      ? "default"
                      : "secondary";
                return (
                  <div
                    key={alert.id}
                    className="flex items-start justify-between gap-3 rounded-md border p-3 hover-elevate"
                    data-testid={`row-alert-${alert.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={sevColor as "destructive" | "default" | "secondary"}
                          data-testid={`badge-alert-severity-${alert.id}`}
                        >
                          {sev}
                        </Badge>
                        <span
                          className="truncate text-sm font-medium"
                          data-testid={`text-alert-title-${alert.id}`}
                        >
                          {alert.title}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {alert.alertType} · {alert.id.slice(0, 8)}
                        </span>
                      </div>
                      <p
                        className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground"
                        data-testid={`text-alert-body-${alert.id}`}
                      >
                        {alert.body}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => ackMutation.mutate(alert.id)}
                      disabled={
                        ackMutation.isPending &&
                        ackMutation.variables === alert.id
                      }
                      data-testid={`button-ack-alert-${alert.id}`}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Ack
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Charts */}
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard title="Daily revenue (AED, 30d)" testId="chart-revenue">
            <LineChart data={revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartCard>

          <ChartCard title="Daily GMV (AED, 30d)" testId="chart-gmv">
            <BarChart data={gmvSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="gmv" fill="hsl(var(--primary))" />
            </BarChart>
          </ChartCard>

          <ChartCard title="Agent cost (AED, stacked, 30d)" testId="chart-agent-spend">
            <AreaChart data={agentSpendSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              {agentNames.map((a, i) => (
                <Area
                  key={a}
                  type="monotone"
                  dataKey={a}
                  stackId="1"
                  stroke={PIE_COLORS[i % PIE_COLORS.length]}
                  fill={PIE_COLORS[i % PIE_COLORS.length]}
                  fillOpacity={0.5}
                />
              ))}
            </AreaChart>
          </ChartCard>

          <ChartCard title="Agent run heatmap (last 7 days)" testId="chart-agent-runs">
            <BarChart data={heatmapData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="slot" tick={{ fontSize: 10 }} interval={0} angle={-60} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" />
            </BarChart>
          </ChartCard>

          <ChartCard
            title="Sales pipeline"
            testId="chart-pipeline"
            headerExtra={
              <Link href="/admin/sales">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  data-testid="link-sales-leads"
                >
                  View leads
                </Button>
              </Link>
            }
          >
            <FunnelChart>
              <Tooltip />
              <Funnel dataKey="value" data={funnelData} isAnimationActive>
                <LabelList
                  position="right"
                  fill="hsl(var(--foreground))"
                  stroke="none"
                  dataKey="name"
                />
              </Funnel>
            </FunnelChart>
          </ChartCard>

          <Card data-testid="card-agent-budgets">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Wallet className="h-4 w-4" /> Per-agent AI spend (this month)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {budgetsQuery.isLoading && (
                <Skeleton className="h-16 w-full" data-testid="skeleton-agent-budgets" />
              )}
              {!budgetsQuery.isLoading && budgetVerdicts.length === 0 && (
                <p className="text-xs text-muted-foreground" data-testid="text-agent-budgets-empty">
                  No agent spend recorded yet this month.
                </p>
              )}
              {budgetVerdicts.map((v) => {
                // pctUsed is a fraction (0–1+) per the server contract; clamp the
                // visual bar to 100% so an over-cap agent still renders cleanly.
                const pctRaw = Number.isFinite(v.pctUsed) ? v.pctUsed : 0;
                const pctDisplay = Math.round(pctRaw * 100);
                const barWidth = Math.min(100, Math.max(0, pctRaw * 100));
                // Mirror the colour thresholds called out in the task brief:
                // green < 80%, amber 80–95%, red ≥ 95%. We use Tailwind tokens
                // that already adapt for dark mode via the design system.
                const barColor =
                  pctRaw >= 0.95
                    ? "bg-destructive"
                    : pctRaw >= 0.8
                      ? "bg-amber-500"
                      : "bg-emerald-500";
                return (
                  <div
                    key={v.agentName}
                    className="space-y-1"
                    data-testid={`row-agent-budget-${v.agentName}`}
                  >
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span
                        className="truncate font-medium"
                        data-testid={`text-agent-budget-name-${v.agentName}`}
                      >
                        {v.agentName}
                      </span>
                      <span
                        className="shrink-0 font-mono text-muted-foreground"
                        data-testid={`text-agent-budget-amount-${v.agentName}`}
                      >
                        {formatAed(v.spentAed)} / {formatAed(v.budgetAed)}
                        <span className="ml-2 font-semibold text-foreground">
                          {pctDisplay}%
                        </span>
                      </span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={Math.min(100, Math.max(0, pctDisplay))}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${v.agentName} budget usage`}
                    >
                      <div
                        className={`h-full ${barColor} transition-all`}
                        style={{ width: `${barWidth}%` }}
                        data-testid={`bar-agent-budget-${v.agentName}`}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <ChartCard title="Top categories" testId="chart-top-categories">
            <PieChart>
              <Tooltip />
              <Pie
                data={topCategoriesData}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label
              >
                {topCategoriesData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartCard>
        </div>

        {/* Board reports — last 12 months of generated PDFs. The signed
            URL is fetched on demand (not preloaded) so the dashboard
            doesn't ship 12 short-lived URLs that may expire before the
            user clicks. */}
        <Card data-testid="card-board-reports">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ClipboardList className="h-4 w-4" /> Board reports (last 12 months)
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateBoardReportMutation.mutate(undefined)}
              disabled={generateBoardReportMutation.isPending}
              data-testid="button-generate-board-report"
            >
              {generateBoardReportMutation.isPending ? "Generating…" : "Generate last month"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {boardReportsQuery.isLoading && (
              <Skeleton className="h-16 w-full" />
            )}
            {!boardReportsQuery.isLoading && boardReports.length === 0 && (
              <p className="text-xs text-muted-foreground" data-testid="text-board-reports-empty">
                No board reports yet. Click "Generate last month" or wait for the 1st of next month.
              </p>
            )}
            {boardReports.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-xs"
                data-testid={`row-board-report-${r.reportMonth}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium" data-testid={`text-board-report-month-${r.reportMonth}`}>
                    {r.reportMonth}
                  </p>
                  <p className="line-clamp-2 text-muted-foreground">
                    {(r.summaryText ?? "").slice(0, 220)}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {(r.pdfSizeBytes / 1024).toFixed(0)} KB ·{" "}
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadBoardReport(r.reportMonth)}
                  data-testid={`button-download-board-report-${r.reportMonth}`}
                >
                  <Download className="mr-1 h-3 w-3" />
                  PDF
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Side surfaces — legal docs, briefs, campaigns */}
        <div className="grid gap-3 md:grid-cols-3">
          <Card data-testid="card-legal">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4" /> Recent legal documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(live?.recentLegalDocuments ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No documents yet.</p>
              )}
              {(live?.recentLegalDocuments ?? []).map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-start justify-between gap-2 text-xs"
                  data-testid={`row-legal-${doc.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{doc.title}</p>
                    <p className="text-muted-foreground">{doc.documentType}</p>
                  </div>
                  <span className="shrink-0 text-muted-foreground">
                    {doc.createdAt
                      ? new Date(doc.createdAt).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card data-testid="card-briefs">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Megaphone className="h-4 w-4" /> Latest content briefs
              </CardTitle>
              <Link href="/admin/marketing">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  data-testid="link-marketing-briefs"
                >
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {(live?.latestContentBriefs ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No briefs yet.</p>
              )}
              {(live?.latestContentBriefs ?? []).map((b) => (
                <div
                  key={b.id}
                  className="flex items-start justify-between gap-2 text-xs"
                  data-testid={`row-brief-${b.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.theme}</p>
                    <p className="text-muted-foreground">Week of {b.weekStart}</p>
                  </div>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {formatAed(b.suggestedBudgetAed)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card data-testid="card-campaigns">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Bot className="h-4 w-4" /> Latest campaigns
              </CardTitle>
              <Link href="/admin/marketing">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  data-testid="link-marketing-campaigns"
                >
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {(live?.latestCampaigns ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No campaigns yet.</p>
              )}
              {(live?.latestCampaigns ?? []).map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-2 text-xs"
                  data-testid={`row-campaign-${c.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.campaignName}</p>
                    <p className="text-muted-foreground">
                      {c.channel ?? "—"} · CTR {c.ctr.toFixed(2)}% · {c.conversions} conv
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {formatAed(c.spendAed)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
