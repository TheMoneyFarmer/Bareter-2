import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";

interface RatingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  toUserId: string;
  toUserName: string;
}

export function RatingModal({
  open,
  onOpenChange,
  dealId,
  toUserId,
  toUserName,
}: RatingModalProps) {
  const { toast } = useToast();
  const [score, setScore] = useState(0);
  const [hoveredScore, setHoveredScore] = useState(0);
  const [review, setReview] = useState("");

  const ratingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ratings", {
        dealId,
        toUserId,
        score,
        review: review.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Rating Submitted",
        description: "Thank you for your feedback!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/deals", dealId] });
      queryClient.invalidateQueries({ queryKey: ["/api/ratings/user", toUserId] });
      onOpenChange(false);
      setScore(0);
      setReview("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit rating",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (score === 0) {
      toast({
        title: "Select a rating",
        description: "Please select at least 1 star",
        variant: "destructive",
      });
      return;
    }
    ratingMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate Your Experience</DialogTitle>
          <DialogDescription>
            How was your trading experience with {toUserName}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setScore(value)}
                onMouseEnter={() => setHoveredScore(value)}
                onMouseLeave={() => setHoveredScore(0)}
                className="p-1 transition-transform hover:scale-110"
                data-testid={`star-${value}`}
              >
                <Star
                  className={`w-10 h-10 transition-colors ${
                    value <= (hoveredScore || score)
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground"
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="text-center text-sm text-muted-foreground">
            {score === 1 && "Poor"}
            {score === 2 && "Fair"}
            {score === 3 && "Good"}
            {score === 4 && "Very Good"}
            {score === 5 && "Excellent"}
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder="Write a review (optional)..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={4}
              data-testid="input-review"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={ratingMutation.isPending || score === 0}
            data-testid="button-submit-rating"
          >
            {ratingMutation.isPending ? "Submitting..." : "Submit Rating"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
