import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MessageCircle, ShieldCheck, Loader2, ArrowRight, RefreshCw } from "lucide-react";

interface PhoneVerificationModalProps {
  open: boolean;
  onVerified: () => void;
  onClose: () => void;
  existingPhone?: string | null;
}

export function PhoneVerificationModal({ open, onVerified, onClose, existingPhone }: PhoneVerificationModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState(existingPhone || "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      toast({ title: "Enter your phone number", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/phone/send-otp", { phone: phone.trim() });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Failed to send code", variant: "destructive" });
        return;
      }
      if (data.dev) setDevCode(data.dev); // show code in dev builds
      setStep("otp");
      toast({ title: "Code sent", description: "Check your WhatsApp for the 6-digit code." });
    } catch {
      toast({ title: "Failed to send code", description: "Please check your number and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (code.trim().length !== 6) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/phone/verify-otp", { code: code.trim() });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Invalid code", variant: "destructive" });
        return;
      }
      // Refresh user data so phoneVerified flag updates everywhere
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Phone verified!", description: "Your WhatsApp number is now confirmed." });
      onVerified();
    } catch {
      toast({ title: "Verification failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setStep("phone"); setCode(""); setDevCode(null); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 text-green-600" />
            </div>
            <DialogTitle className="text-lg">Verify your WhatsApp</DialogTitle>
          </div>
          <DialogDescription>
            {step === "phone"
              ? "We'll send a one-time code to your WhatsApp number to confirm your identity before you can post listings."
              : `We sent a 6-digit code to ${phone}. Enter it below.`}
          </DialogDescription>
        </DialogHeader>

        {step === "phone" ? (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="phone-input">WhatsApp number</Label>
              <Input
                id="phone-input"
                type="tel"
                placeholder="+971 50 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Include country code, e.g. +971 for UAE</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
              <Button className="flex-1 gap-2" onClick={handleSendOtp} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Send code
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="otp-input">Verification code</Label>
              <Input
                id="otp-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                className="text-center text-xl tracking-[0.3em] font-mono"
                autoFocus
              />
              {devCode && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border border-amber-200 dark:border-amber-800">
                  Dev mode — code: <strong>{devCode}</strong>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={reset} disabled={loading}>
                <RefreshCw className="h-3.5 w-3.5" />
                Change number
              </Button>
              <Button className="flex-1 gap-2" onClick={handleVerifyOtp} disabled={loading || code.length !== 6}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
