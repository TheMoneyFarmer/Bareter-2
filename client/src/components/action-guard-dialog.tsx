import { useLocation } from "wouter";
import { Shield, LogIn, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { BlockReason } from "@/lib/action-guard";

interface Props {
  blockReason: BlockReason;
  onClose: () => void;
}

export function ActionGuardDialog({ blockReason, onClose }: Props) {
  const [, navigate] = useLocation();

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  if (!blockReason) return null;

  if (blockReason === "login") {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="text-center items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-bareter-teal/10 flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-bareter-teal" />
            </div>
            <DialogTitle>Sign up or log in</DialogTitle>
            <DialogDescription>
              Create a free account to message, propose barters, like, and save listings.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            <Button className="w-full" onClick={() => go("/register")}>
              Create free account
            </Button>
            <Button variant="outline" className="w-full" onClick={() => go("/login")}>
              <LogIn className="h-4 w-4 mr-2" />
              Log in
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="text-center items-center gap-2">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle>Verify your identity to continue</DialogTitle>
          <DialogDescription>
            You need to verify your identity before you can message, propose barters, comment, or create listings.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-2">
          <Button className="w-full" onClick={() => go("/profile")}>
            Verify now
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
