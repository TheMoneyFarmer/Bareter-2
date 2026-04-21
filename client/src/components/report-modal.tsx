import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Flag, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ReportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: "listing" | "post" | "deal" | "user";
  targetId: string;
};

const REPORT_REASONS = [
  { value: "scam", label: "Scam / Fraud" },
  { value: "fake_item", label: "Fake or counterfeit item" },
  { value: "misleading_value", label: "Misleading value or description" },
  { value: "spam", label: "Spam or irrelevant content" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

export function ReportModal({ open, onOpenChange, targetType, targetId }: ReportModalProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/reports", { targetType, targetId, reason, notes }),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () => {
      toast({ title: "Could not submit report", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleClose = () => {
    setReason("");
    setNotes("");
    setSubmitted(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Report {targetType}
          </DialogTitle>
          <DialogDescription>
            Help keep Bareter safe. Reports are reviewed by our trust & safety team.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <p className="font-semibold">Report submitted</p>
            <p className="text-sm text-muted-foreground text-center">
              Thank you for helping keep Bareter safe. Our team will review this report.
            </p>
            <Button onClick={handleClose} data-testid="button-close-report">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="report-reason">Reason for report</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger data-testid="select-report-reason" className="mt-1">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="report-notes">Additional details (optional)</Label>
              <Textarea
                id="report-notes"
                data-testid="textarea-report-notes"
                placeholder="Describe what you observed..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleClose} data-testid="button-cancel-report">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => mutation.mutate()}
                disabled={!reason || mutation.isPending}
                data-testid="button-submit-report"
              >
                {mutation.isPending ? "Submitting..." : "Submit Report"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
