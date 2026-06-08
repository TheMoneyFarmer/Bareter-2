import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { MessageCircle, X } from "lucide-react";

const STORAGE_KEY = "bareter_verify_banner_dismissed";

export function VerificationReminder() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!user) { setVisible(false); return; }

    const phoneVerified = !!(user as any).phoneVerified;
    if (phoneVerified) { setVisible(false); return; }

    const today = new Date().toISOString().slice(0, 10);
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed === today) { setVisible(false); return; }

    // Small delay so it doesn't flash on first paint
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      setVisible(true);
    }, 800);
    mountedRef.current = true;
    return () => { clearTimeout(timer); mountedRef.current = false; };
  }, [user?.id, (user as any)?.phoneVerified]);

  const dismiss = () => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(STORAGE_KEY, today);
    setVisible(false);
  };

  const goVerify = () => {
    dismiss();
    navigate("/profile?tab=verification");
  };

  if (!visible) return null;

  return (
    <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <MessageCircle className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Add your WhatsApp number to post listings and propose barters.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={goVerify}
          className="font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap"
        >
          Verify now
        </button>
        <button
          onClick={dismiss}
          className="p-0.5 rounded hover:bg-white/20 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
