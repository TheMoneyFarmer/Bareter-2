import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Trophy } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SuccessStoryModalProps {
  dealId: string;
  open: boolean;
  onClose: () => void;
}

export function SuccessStoryModal({ dealId, open, onClose }: SuccessStoryModalProps) {
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/deals/${dealId}/success-story`, { caption, imageUrl: imageUrl || undefined });
    },
    onSuccess: () => {
      toast({ title: "Story shared!", description: "Your success story has been submitted for review." });
      queryClient.invalidateQueries({ queryKey: ["/api/success-stories"] });
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to share your story. Please try again.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <DialogTitle>Share Your Trade Story</DialogTitle>
          </div>
          <DialogDescription>
            Tell the community about your completed barter. Approved stories get featured on Bareter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="story-caption">What did you trade? How did it go?</Label>
            <Textarea
              id="story-caption"
              placeholder="e.g. Traded my photography session for a brand identity design — couldn't have been smoother! Both parties delivered exactly what was promised."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{caption.length}/500</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="story-image">Photo URL (optional)</Label>
            <Input
              id="story-image"
              placeholder="https://..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">A photo of your trade makes your story more engaging.</p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Maybe later</Button>
            <Button
              className="flex-1"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || caption.trim().length < 10}
            >
              {mutation.isPending ? "Sharing..." : "Share Story"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
