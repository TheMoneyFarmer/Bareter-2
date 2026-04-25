import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { SalesLead } from "@shared/schema";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Pencil,
  RefreshCw,
  Save,
  Users,
  X,
} from "lucide-react";

const STATUS_OPTIONS = [
  "new",
  "active",
  "engaged",
  "re_engaged",
  "converted",
  "dormant",
] as const;
type LeadStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  engaged: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  re_engaged: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  converted: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  dormant: "bg-muted text-muted-foreground border-border",
};

interface SalesSummary {
  total: number;
  new: number;
  active: number;
  reEngaged: number;
  avgScore: number;
  newThisWeek: number;
}

interface LeadsResponse {
  count: number;
  summary: SalesSummary;
  leads: SalesLead[];
}

type SortKey =
  | "fullName"
  | "email"
  | "userType"
  | "location"
  | "leadScore"
  | "status"
  | "lastActivityAt";

function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatStatus(s: string): string {
  return s.replace(/_/g, " ");
}

function formatUserType(t: string): string {
  return t.replace(/_/g, " ");
}

export default function SalesDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [sortKey, setSortKey] = useState<SortKey>("leadScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<string>("");

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

  // Keep the queryKey to a single string so the project's default queryFn
  // (which `.join("/")`s the array) hits the right URL. Status filtering
  // is done client-side over a single "all leads" fetch since the cap
  // (500 leads) is well within a single response.
  const leadsQuery = useQuery<LeadsResponse>({
    queryKey: ["/api/company-os/sales/leads?limit=500"],
    enabled: !!user?.isAdmin,
    refetchOnWindowFocus: false,
  });

  const syncMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/company-os/sales/sync");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/company-os/sales/leads?limit=500"],
      });
      toast({
        title: "Sync complete",
        description: "Lead scores and statuses are now up to date.",
      });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: err.message,
      });
    },
  });

  const patchMutation = useMutation<
    unknown,
    Error,
    { id: string; notes?: string | null; status?: LeadStatus }
  >({
    mutationFn: async ({ id, ...patch }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/company-os/sales/leads/${encodeURIComponent(id)}`,
        patch,
      );
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/company-os/sales/leads?limit=500"],
      });
      if (variables.notes !== undefined) {
        setEditingId(null);
        setDraftNotes("");
      }
      toast({
        title: "Lead updated",
        description: variables.status
          ? `Status changed to "${formatStatus(variables.status)}".`
          : "Notes saved.",
      });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message,
      });
    },
  });

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "leadScore" ? "desc" : "asc");
    }
  }

  const filteredSorted = useMemo(() => {
    const all = leadsQuery.data?.leads ?? [];
    const filtered =
      statusFilter === "all" ? all : all.filter((l) => l.status === statusFilter);
    const dirMul = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (sortKey === "lastActivityAt") {
        const at = new Date(av as string | Date).getTime();
        const bt = new Date(bv as string | Date).getTime();
        return (at - bt) * dirMul;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dirMul;
      }
      return String(av).localeCompare(String(bv)) * dirMul;
    });
    return sorted;
  }, [leadsQuery.data, statusFilter, sortKey, sortDir]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-32 w-64" />
      </div>
    );
  }
  if (!user.isAdmin) return null;

  const summary = leadsQuery.data?.summary;

  function SortHeader({ k, label }: { k: SortKey; label: string }) {
    const Icon =
      sortKey !== k ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 text-left text-xs font-medium text-muted-foreground hover-elevate active-elevate-2 rounded px-1 py-0.5 -mx-1"
        data-testid={`button-sort-${k}`}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    );
  }

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
                Sales · Leads
              </h1>
              <p
                className="truncate text-xs text-muted-foreground"
                data-testid="text-page-subtitle"
              >
                Browse, filter, and edit notes on every Sales-Agent lead
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" data-testid="badge-lead-count">
              {leadsQuery.data?.count ?? 0} leads
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => leadsQuery.refetch()}
              disabled={leadsQuery.isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw
                className={`mr-1 h-3 w-3 ${
                  leadsQuery.isFetching ? "animate-spin" : ""
                }`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync"
            >
              <RefreshCw
                className={`mr-1 h-3 w-3 ${
                  syncMutation.isPending ? "animate-spin" : ""
                }`}
              />
              {syncMutation.isPending ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </header>

        {summary && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Total", value: summary.total, testId: "text-summary-total" },
              { label: "New", value: summary.new, testId: "text-summary-new" },
              { label: "Active", value: summary.active, testId: "text-summary-active" },
              {
                label: "Re-engaged",
                value: summary.reEngaged,
                testId: "text-summary-reengaged",
              },
              {
                label: "Avg score",
                value: summary.avgScore,
                testId: "text-summary-avgscore",
              },
              {
                label: "New this week",
                value: summary.newThisWeek,
                testId: "text-summary-newthisweek",
              },
            ].map((s) => (
              <Card key={s.label} data-testid={`card-summary-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </p>
                  <p
                    className="text-xl font-semibold tabular-nums"
                    data-testid={s.testId}
                  >
                    {s.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card data-testid="card-leads">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" /> Leads
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Filter:</span>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as "all" | LeadStatus)}
              >
                <SelectTrigger
                  className="h-8 w-[140px] text-xs"
                  data-testid="select-status-filter"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="option-status-all">
                    All statuses
                  </SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      data-testid={`option-status-${s}`}
                    >
                      {formatStatus(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {leadsQuery.isLoading && (
              <Skeleton className="h-40 w-full" data-testid="skeleton-leads" />
            )}
            {leadsQuery.error && (
              <p
                className="text-xs text-destructive"
                data-testid="text-leads-error"
              >
                Failed to load leads: {(leadsQuery.error as Error).message}
              </p>
            )}
            {!leadsQuery.isLoading && filteredSorted.length === 0 && (
              <p
                className="py-6 text-center text-xs text-muted-foreground"
                data-testid="text-leads-empty"
              >
                {statusFilter === "all"
                  ? 'No leads yet. Click "Sync now" to ingest the first batch.'
                  : `No leads with status "${formatStatus(statusFilter)}".`}
              </p>
            )}
            {filteredSorted.length > 0 && (
              <div className="overflow-x-auto">
                <Table data-testid="table-leads">
                  <TableHeader>
                    <TableRow>
                      <TableHead><SortHeader k="fullName" label="Name" /></TableHead>
                      <TableHead><SortHeader k="email" label="Email" /></TableHead>
                      <TableHead><SortHeader k="userType" label="Type" /></TableHead>
                      <TableHead><SortHeader k="location" label="Location" /></TableHead>
                      <TableHead className="text-right">
                        <SortHeader k="leadScore" label="Score" />
                      </TableHead>
                      <TableHead><SortHeader k="status" label="Status" /></TableHead>
                      <TableHead className="hidden md:table-cell">
                        <SortHeader k="lastActivityAt" label="Last activity" />
                      </TableHead>
                      <TableHead className="min-w-[220px]">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSorted.map((lead) => {
                      const isEditing = editingId === lead.id;
                      return (
                        <TableRow
                          key={lead.id}
                          data-testid={`row-lead-${lead.id}`}
                        >
                          <TableCell
                            className="font-medium"
                            data-testid={`text-lead-name-${lead.id}`}
                          >
                            {lead.fullName}
                          </TableCell>
                          <TableCell
                            className="text-xs text-muted-foreground"
                            data-testid={`text-lead-email-${lead.id}`}
                          >
                            {lead.email}
                          </TableCell>
                          <TableCell
                            className="text-xs"
                            data-testid={`text-lead-type-${lead.id}`}
                          >
                            {formatUserType(lead.userType)}
                          </TableCell>
                          <TableCell
                            className="text-xs"
                            data-testid={`text-lead-location-${lead.id}`}
                          >
                            {lead.location ?? "—"}
                          </TableCell>
                          <TableCell
                            className="text-right font-mono tabular-nums"
                            data-testid={`text-lead-score-${lead.id}`}
                          >
                            {lead.leadScore}
                          </TableCell>
                          <TableCell data-testid={`cell-lead-status-${lead.id}`}>
                            <Select
                              value={lead.status}
                              onValueChange={(v) =>
                                patchMutation.mutate({
                                  id: lead.id,
                                  status: v as LeadStatus,
                                })
                              }
                              disabled={patchMutation.isPending}
                            >
                              <SelectTrigger
                                className={`h-7 w-[130px] border text-xs ${
                                  STATUS_BADGE[lead.status as LeadStatus] ??
                                  STATUS_BADGE.dormant
                                }`}
                                data-testid={`select-lead-status-${lead.id}`}
                              >
                                <SelectValue>
                                  {formatStatus(lead.status)}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((s) => (
                                  <SelectItem
                                    key={s}
                                    value={s}
                                    data-testid={`option-lead-${lead.id}-status-${s}`}
                                  >
                                    {formatStatus(s)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell
                            className="hidden text-xs text-muted-foreground md:table-cell"
                            data-testid={`text-lead-lastactivity-${lead.id}`}
                          >
                            {formatDateTime(lead.lastActivityAt)}
                          </TableCell>
                          <TableCell data-testid={`cell-lead-notes-${lead.id}`}>
                            {isEditing ? (
                              <div className="flex flex-col gap-2">
                                <Textarea
                                  value={draftNotes}
                                  onChange={(e) => setDraftNotes(e.target.value)}
                                  rows={3}
                                  maxLength={4000}
                                  placeholder="Add a note…"
                                  data-testid={`textarea-lead-notes-${lead.id}`}
                                />
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      patchMutation.mutate({
                                        id: lead.id,
                                        notes: draftNotes,
                                      })
                                    }
                                    disabled={patchMutation.isPending}
                                    data-testid={`button-save-notes-${lead.id}`}
                                  >
                                    <Save className="mr-1 h-3 w-3" />
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingId(null);
                                      setDraftNotes("");
                                    }}
                                    data-testid={`button-cancel-notes-${lead.id}`}
                                  >
                                    <X className="mr-1 h-3 w-3" />
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <p
                                  className="whitespace-pre-wrap text-xs text-muted-foreground"
                                  data-testid={`text-lead-notes-${lead.id}`}
                                >
                                  {lead.notes ?? (
                                    <span className="italic opacity-60">
                                      No notes
                                    </span>
                                  )}
                                </p>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 shrink-0"
                                  onClick={() => {
                                    setEditingId(lead.id);
                                    setDraftNotes(lead.notes ?? "");
                                  }}
                                  data-testid={`button-edit-notes-${lead.id}`}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
