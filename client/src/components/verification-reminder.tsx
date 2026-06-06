import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const STORAGE_KEY = "bareter_verify_reminder_date";

export function VerificationReminder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const shownRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    const isVerified =
      user.kycStatus === "APPROVED" ||
      user.kybStatus === "APPROVED" ||
      user.isVerified;

    if (isVerified) return;
    if (shownRef.current) return;

    const today = new Date().toISOString().slice(0, 10);
    const lastShown = localStorage.getItem(STORAGE_KEY);
    if (lastShown === today) return;

    shownRef.current = true;
    localStorage.setItem(STORAGE_KEY, today);

    const timer = setTimeout(() => {
      toast({
        title: "Complete your verification",
        description: "Verify your identity to unlock messaging, proposing barters, and more.",
        action: (
          <ToastAction altText="Verify now" onClick={() => navigate("/profile")}>
            Verify now
          </ToastAction>
        ),
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [user?.id]);

  return null;
}
