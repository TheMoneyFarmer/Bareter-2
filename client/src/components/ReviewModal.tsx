import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "./StarRating";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";

const REVIEW_TAGS = [
  "Fast communicator",
  "Fair value",
  "Reliable",
  "Professional",
  "Flexible",
  "Highly recommended",
];

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  proposalId?: string;
  dealId?: string;
  revieweeName: string;
  listingTitle: string;
}

export function ReviewModal({ open, onClose, proposalId, dealId, revieweeName, listingTitle }: ReviewModalProps) {
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const endpoint = dealId
    ? `/api/deals/${dealId}/review`
    : `/api/proposals/${proposalId}/review`;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", endpoint, { rating, comment, tags });
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to submit review", variant: "destructive" }),
  });

  const toggleTag = (tag: string) => {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg font-semibold">Review submitted!</p>
            <p className="text-sm text-muted-foreground">Thanks for helping build trust on Bareter.</p>
            <Button onClick={onClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Review {revieweeName}</DialogTitle>
              <p className="text-sm text-muted-foreground">Deal: {listingTitle}</p>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <p className="text-sm font-medium mb-2">How was your experience?</p>
                <StarRating value={rating} onChange={setRating} size="lg" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {REVIEW_TAGS.map((tag) => (
                  <Badge
                    key={tag}
                    variant={tags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <Textarea
                placeholder="Share details about your deal experience (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={onClose}>Skip</Button>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={rating === 0 || mutation.isPending}
                >
                  {mutation.isPending ? "Submitting…" : "Submit Review"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
