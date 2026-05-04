import { useQuery } from "@tanstack/react-query";
import { Megaphone, X } from "lucide-react";
import { useState } from "react";

type PublicSettings = Record<string, string | null>;

export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState(false);

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["/api/public/settings"],
    staleTime: 30_000,
  });

  if (dismissed) return null;
  if (!settings) return null;
  if (settings.announcement_banner_enabled !== "true") return null;
  if (!settings.announcement_banner_text) return null;

  return (
    <div
      className="relative bg-bareter-teal text-white text-center text-sm py-2 px-10"
      data-testid="announcement-banner"
    >
      <div className="flex items-center justify-center gap-2">
        <Megaphone className="h-4 w-4 shrink-0" />
        <span>{settings.announcement_banner_text}</span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/20 rounded transition-colors"
        aria-label="Dismiss"
        data-testid="button-dismiss-banner"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
