import { useQuery } from "@tanstack/react-query";
import { Megaphone, X } from "lucide-react";
import { useState, useEffect } from "react";

type PublicSettings = Record<string, string | null>;

const DISMISS_KEY = "bareter_banner_dismissed";

export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      return stored ? true : false;
    } catch { return false; }
  });

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["/api/public/settings"],
    staleTime: 30_000,
  });

  const bannerText = settings?.announcement_banner_text || "";
  const bannerEnabled = settings?.announcement_banner_enabled === "true";

  useEffect(() => {
    if (!bannerEnabled || !bannerText) return;
    try {
      const storedText = localStorage.getItem(DISMISS_KEY);
      if (storedText && storedText !== bannerText) {
        localStorage.removeItem(DISMISS_KEY);
        setDismissed(false);
      }
    } catch {}
  }, [bannerText, bannerEnabled]);

  if (dismissed) return null;
  if (!settings) return null;
  if (!bannerEnabled) return null;
  if (!bannerText) return null;

  const bannerLink = settings.announcement_banner_link || null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, bannerText); } catch {}
  };

  const textContent = bannerLink ? (
    <a
      href={bannerLink}
      className="underline underline-offset-2 hover:text-white/90 transition-colors"
      data-testid="link-banner"
    >
      {bannerText}
    </a>
  ) : (
    <span>{bannerText}</span>
  );

  return (
    <div
      className="relative bg-bareter-teal text-white text-center text-sm py-2 px-10"
      data-testid="announcement-banner"
    >
      <div className="flex items-center justify-center gap-2">
        <Megaphone className="h-4 w-4 shrink-0" />
        {textContent}
      </div>
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/20 rounded transition-colors"
        aria-label="Dismiss"
        data-testid="button-dismiss-banner"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
