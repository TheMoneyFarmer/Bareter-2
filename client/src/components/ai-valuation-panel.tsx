import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, TrendingUp, RotateCcw, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ValuationAdvice {
  estimatedRange: { min: number; max: number };
  fairValue: number;
  confidence: number;
  reasoning: string;
  tips: string[];
  marketComparison: string;
}

interface Props {
  title: string;
  description: string;
  category?: string;
  condition?: string;
  images?: string[];
  onValuation?: (advice: ValuationAdvice) => void;
  onApplyValue?: (value: number) => void;
}

export default function AiValuationPanel({ title, description, category, condition, images, onValuation, onApplyValue }: Props) {
  const [advice, setAdvice] = useState<ValuationAdvice | null>(null);
  const [applied, setApplied] = useState(false);
  const autoTriggered = useRef(false);

  const valuationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/valuation", {
        title,
        description,
        category,
        condition,
        imageUrls: images?.filter(Boolean),
      });
      return res.json();
    },
    onSuccess: (data: ValuationAdvice) => {
      setAdvice(data);
      setApplied(false);
      onValuation?.(data);
    },
  });

  // Auto-trigger once we have enough content + at least 1 image
  const hasEnoughContent = title.length >= 5 && description.length >= 20;
  const hasImages = (images?.length ?? 0) > 0;
  const canAnalyze = hasEnoughContent && hasImages;

  useEffect(() => {
    if (canAnalyze && !advice && !valuationMutation.isPending && !autoTriggered.current) {
      autoTriggered.current = true;
      valuationMutation.mutate();
    }
  }, [canAnalyze]);

  // Reset auto-trigger flag when images change so new uploads re-fire
  const prevImageCount = useRef(images?.length ?? 0);
  useEffect(() => {
    const currentCount = images?.length ?? 0;
    if (currentCount > prevImageCount.current && advice) {
      // New image added after a result — offer re-analysis but don't auto-fire again
      prevImageCount.current = currentCount;
    } else {
      prevImageCount.current = currentCount;
    }
  }, [images?.length]);

  const handleApply = () => {
    if (advice && onApplyValue) {
      onApplyValue(advice.fairValue);
      setApplied(true);
    }
  };

  const handleRefresh = () => {
    setAdvice(null);
    setApplied(false);
    autoTriggered.current = false;
    valuationMutation.reset();
    valuationMutation.mutate();
  };

  if (!hasEnoughContent) return null;

  const confidencePct = advice ? Math.round(advice.confidence * 100) : 0;
  const confidenceColor =
    confidencePct >= 75 ? "text-green-600 dark:text-green-400" :
    confidencePct >= 50 ? "text-amber-600 dark:text-amber-400" :
    "text-muted-foreground";

  return (
    <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Bareter Value</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
            AI
          </Badge>
        </div>

        {!hasImages && !valuationMutation.isPending && !advice && (
          <span className="text-xs text-muted-foreground">Upload photos to get a value estimate</span>
        )}

        {hasImages && !advice && !valuationMutation.isPending && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => valuationMutation.mutate()}>
            Analyse
          </Button>
        )}

        {valuationMutation.isPending && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analysing…
          </div>
        )}
      </div>

      {/* Error */}
      {valuationMutation.isError && (
        <p className="text-xs text-destructive">
          Could not get estimate — check your connection and try again.
        </p>
      )}

      {/* Results */}
      {advice && (
        <div className="space-y-3 text-sm">
          {/* Value chips */}
          <div className="flex items-stretch gap-2 flex-wrap">
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-center min-w-[90px]">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Fair Value</div>
              <div className="font-bold text-primary text-base" data-testid="text-ai-fair-value">
                AED {advice.fairValue.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg bg-muted/60 border px-3 py-2 text-center min-w-[120px]">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Range</div>
              <div className="font-medium text-xs" data-testid="text-ai-value-range">
                {advice.estimatedRange.min.toLocaleString()} – {advice.estimatedRange.max.toLocaleString()} AED
              </div>
            </div>
            <div className="rounded-lg bg-muted/60 border px-3 py-2 text-center min-w-[70px]">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Confidence</div>
              <div className={`font-semibold text-xs ${confidenceColor}`} data-testid="text-ai-confidence">
                {confidencePct}%
              </div>
            </div>
          </div>

          {/* Reasoning */}
          <p className="text-xs text-muted-foreground leading-relaxed">{advice.reasoning}</p>

          {/* Market comparison */}
          {advice.marketComparison && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-2">
              <TrendingUp className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary" />
              <span>{advice.marketComparison}</span>
            </div>
          )}

          {/* Tips */}
          {advice.tips.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-1 pl-4 list-disc">
              {advice.tips.map((tip, i) => <li key={i}>{tip}</li>)}
            </ul>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {onApplyValue && (
              <Button
                variant={applied ? "secondary" : "default"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleApply}
                data-testid="btn-apply-bareter-value"
              >
                {applied ? (
                  <><CheckCircle className="h-3 w-3" /> Applied</>
                ) : (
                  <>Apply AED {advice.fairValue.toLocaleString()}</>
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground"
              onClick={handleRefresh}
              data-testid="btn-ai-valuation-refresh"
              disabled={valuationMutation.isPending}
            >
              <RotateCcw className="h-3 w-3" />
              Re-analyse
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
