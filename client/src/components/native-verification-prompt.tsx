import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "bareter_verify_prompt_ts";
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export function NativeVerificationPrompt() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;

    const isVerified =
      user.kycStatus === "APPROVED" ||
      user.kybStatus === "APPROVED" ||
      !!(user as any).phoneVerified;
    if (isVerified) return;

    const lastShown = parseInt(localStorage.getItem(STORAGE_KEY) ?? "0", 10);
    if (Date.now() - lastShown < COOLDOWN_MS) return;

    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [user?.id, (user as any)?.phoneVerified, user?.kycStatus, user?.kybStatus]);

  const snooze = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setVisible(false);
  };

  const goVerify = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setVisible(false);
    navigate("/settings?tab=security");
  };

  if (!visible) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/50"
        onClick={snooze}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[9999] bg-background rounded-t-3xl shadow-2xl px-6 pt-5 pb-10"
        style={{ animation: "slideUp 280ms cubic-bezier(0.32,0.72,0,1)" }}
      >
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-muted-foreground/20 mx-auto mb-5" />

        {/* Close */}
        <button
          onClick={snooze}
          className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-muted transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Icon */}
        <div className="w-24 h-24 rounded-full bg-bareter-teal/10 flex items-center justify-center mx-auto mb-5">
          <ShieldCheck className="h-12 w-12 text-bareter-teal" strokeWidth={1.5} />
        </div>

        {/* Title */}
        <h2 className="text-[22px] font-bold text-center text-foreground mb-2">
          Get Verified on Bareter
        </h2>

        {/* Body */}
        <p className="text-center text-muted-foreground text-sm leading-relaxed mb-8 px-2">
          Verification takes under a minute — unlock messaging, propose deals, and earn a verified trust badge.
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl text-base"
            onClick={snooze}
          >
            Maybe Later
          </Button>
          <Button
            className="flex-1 h-12 rounded-xl text-base bg-bareter-teal hover:bg-bareter-teal/90 text-white"
            onClick={goVerify}
          >
            Get Verified
          </Button>
        </div>
      </div>
    </>
  );
}
