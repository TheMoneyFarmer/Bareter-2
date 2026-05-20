import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, TrendingUp, AlertTriangle, UserCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  category: string;
  condition?: string;
  declaredValue?: number;
  /**
   * Fires every time the AI returns a fresh valuation. Lets the parent
   * form (e.g. create-listing) capture the result so it can be persisted
   * onto the listing record at submit time.
   */
  onValuation?: (advice: ValuationAdvice) => void;
}

const HIGH_VALUE_THRESHOLD = 50000;

export default function AiValuationPanel({ title, description, category, condition, declaredValue, onValuation }: Props) {
  const [advice, setAdvice] = useState<ValuationAdvice | null>(null);
  const { toast } = useToast();
  const autoTriggered = useRef(false);

  const valuationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/valuation", {
        title,
        description,
        category,
        condition,
        declaredValue,
      });
      return res.json();
    },
    onSuccess: (data: ValuationAdvice) => {
      setAdvice(data);
      onValuation?.(data);
    },
  });

  const canRequest = title.length >= 3 && description.length >= 10 && category;

  useEffect(() => {
    if (
      canRequest &&
      declaredValue &&
      declaredValue >= HIGH_VALUE_THRESHOLD &&
      !advice &&
      !valuationMutation.isPending &&
      !autoTriggered.current
    ) {
      autoTriggered.current = true;
      valuationMutation.mutate();
      toast({
        title: "High-Value Item Detected",
        description: `Items over AED ${HIGH_VALUE_THRESHOLD.toLocaleString()} are automatically analyzed by our AI valuation agent.`,
      });
    }
  }, [declaredValue, canRequest]);

  const handleEscalate = () => {
    toast({
      title: "Valuation Review Requested",
      description: "A human expert will review the valuation for this item and get back to you.",
    });
  };

  if (!canRequest) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span>AI Valuation Assistant</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
            AI Assisted
          </Badge>
        </div>
        {!advice && (
          <Button
            data-testid="btn-ai-valuation"
            variant="outline"
            size="sm"
            onClick={() => valuationMutation.mutate()}
            disabled={valuationMutation.isPending}
          >
            {valuationMutation.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Analyzing...
              </>
            ) : (
              "Get AI Estimate"
            )}
          </Button>
        )}
      </div>

      {advice && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="rounded-md bg-green-500/10 px-3 py-2 text-center">
              <div className="text-xs text-muted-foreground">Fair Value</div>
              <div className="font-bold text-green-600 dark:text-green-400" data-testid="text-ai-fair-value">
                AED {advice.fairValue.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md bg-blue-500/10 px-3 py-2 text-center">
              <div className="text-xs text-muted-foreground">Range</div>
              <div className="font-semibold text-blue-600 dark:text-blue-400" data-testid="text-ai-value-range">
                {advice.estimatedRange.min.toLocaleString()} - {advice.estimatedRange.max.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md bg-muted px-3 py-2 text-center">
              <div className="text-xs text-muted-foreground">Confidence</div>
              <div className="font-semibold" data-testid="text-ai-confidence">{Math.round(advice.confidence * 100)}%</div>
            </div>
          </div>

          <p className="text-muted-foreground">{advice.reasoning}</p>

          {advice.marketComparison && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <TrendingUp className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{advice.marketComparison}</span>
            </div>
          )}

          {advice.tips.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                Tips
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 pl-4 list-disc">
                {advice.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              data-testid="btn-ai-valuation-refresh"
              onClick={() => {
                setAdvice(null);
                autoTriggered.current = false;
                valuationMutation.reset();
              }}
            >
              Refresh estimate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              data-testid="btn-ai-valuation-escalate"
              onClick={handleEscalate}
            >
              <UserCheck className="h-3 w-3 mr-1" />
              Escalate to Human
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
