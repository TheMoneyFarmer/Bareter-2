import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, XCircle, Info, Loader2 } from "lucide-react";

interface MatchScoreResponse {
  score: number;
  label: "excellent" | "good" | "fair" | "poor";
  message: string;
  suggestion: string | null;
  aedDifference: number;
  currency: "AED";
  a: { id: string; title: string; min: number; max: number; avg: number };
  b: { id: string; title: string; min: number; max: number; avg: number };
}

interface MatchScoreCardProps {
  listingAId: string;
  listingBId: string;
  /** Hide the card entirely when one listing has no stored valuation yet. Defaults to true. */
  hideIfMissing?: boolean;
}

const SCORE_THEME: Record<
  MatchScoreResponse["label"],
  { color: string; bg: string; bar: string; icon: JSX.Element; label: string }
> = {
  excellent: {
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
    bar: "bg-emerald-500",
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
    label: "Excellent match",
  },
  good: {
    color: "text-teal-700 dark:text-teal-300",
    bg: "bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800",
    bar: "bg-teal-500",
    icon: <CheckCircle2 className="h-5 w-5 text-teal-500" />,
    label: "Good match",
  },
  fair: {
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
    bar: "bg-amber-400",
    icon: <AlertCircle className="h-5 w-5 text-amber-500" />,
    label: "Fair match",
  },
  poor: {
    color: "text-red-700 dark:text-red-300",
    bg: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
    bar: "bg-red-400",
    icon: <XCircle className="h-5 w-5 text-red-500" />,
    label: "Poor match",
  },
};

/**
 * Renders an AI-derived fairness score for a barter between two listings.
 * Reads each listing's persisted valuation columns via the server and
 * computes the score deterministically (no LLM call), so it's cheap and
 * safe to drop anywhere two listings are presented as a potential match.
 */
export function MatchScoreCard({
  listingAId,
  listingBId,
  hideIfMissing = true,
}: MatchScoreCardProps) {
  const { data, isLoading, isError, error } = useQuery<MatchScoreResponse>({
    queryKey: ["/api/listings/match-score", listingAId, listingBId],
    queryFn: async () => {
      const res = await fetch(
        `/api/listings/match-score?a=${encodeURIComponent(
          listingAId,
        )}&b=${encodeURIComponent(listingBId)}`,
        { credentials: "include" },
      );
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body?.message || "Missing valuation");
        (err as Error & { code?: string }).code = "MISSING_VALUATION";
        throw err;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json();
    },
    staleTime: 30_000,
    retry: (failureCount, err) => {
      if ((err as Error & { code?: string })?.code === "MISSING_VALUATION") return false;
      return failureCount < 2;
    },
  });

  if (isLoading) {
    return (
      <div
        className="rounded-xl border border-bareter-teal/15 bg-muted/30 p-4 flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="card-match-score-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Calculating match compatibility…
      </div>
    );
  }

  if (isError) {
    const code = (error as Error & { code?: string })?.code;
    if (code === "MISSING_VALUATION") {
      if (hideIfMissing) return null;
      return (
        <div
          className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-muted-foreground dark:bg-zinc-900/40 dark:border-zinc-700"
          data-testid="card-match-score-missing"
        >
          <Info className="inline h-3.5 w-3.5 mr-1 opacity-60" />
          Match score not available — one of the listings hasn't been valued yet.
        </div>
      );
    }
    return null;
  }

  if (!data) return null;
  const theme = SCORE_THEME[data.label];

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${theme.bg}`}
      data-testid="card-match-score"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {theme.icon}
          <span className={`font-semibold text-sm ${theme.color}`}>
            {theme.label}
          </span>
        </div>
        <span
          className={`text-2xl font-bold ${theme.color}`}
          data-testid="text-match-score-percent"
        >
          {data.score}%
        </span>
      </div>

      <div className="h-2 bg-white/70 rounded-full overflow-hidden dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${theme.bar}`}
          style={{ width: `${data.score}%` }}
        />
      </div>

      <p className="text-sm text-foreground/80">{data.message}</p>

      {data.aedDifference > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <span>
            Value gap: AED {data.aedDifference.toLocaleString()} ·{" "}
            <span className="opacity-75">
              {data.a.title.slice(0, 24)} ≈ AED {data.a.avg.toLocaleString()} vs{" "}
              {data.b.title.slice(0, 24)} ≈ AED {data.b.avg.toLocaleString()}
            </span>
          </span>
        </div>
      )}

      {data.suggestion && (
        <div className="bg-white/60 rounded-lg p-3 border border-white/70 dark:bg-white/5 dark:border-white/10">
          <p className="text-xs text-foreground/70">{data.suggestion}</p>
        </div>
      )}
    </div>
  );
}
