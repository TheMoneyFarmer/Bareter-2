import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Share2, Link2 } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";

interface ShareMenuProps {
  url: string;
  title?: string;
  size?: "sm" | "default" | "icon";
  variant?: "ghost" | "outline" | "default";
  showLabel?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function ShareMenu({
  url,
  title = "",
  size = "sm",
  variant = "ghost",
  showLabel = false,
  className,
  "data-testid": testId,
}: ShareMenuProps) {
  const { toast } = useToast();

  // ── Native share sheet (iOS / Android) ──────────────────────────────────
  if (Capacitor.isNativePlatform()) {
    const handleNativeShare = async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const { Share } = await import("@capacitor/share");
        await Share.share({
          title: title || "Bareter Listing",
          text: title ? `${title} on Bareter` : "Check out this listing on Bareter",
          url,
          dialogTitle: "Share listing",
        });
      } catch {
        // User dismissed the share sheet — not an error
      }
    };

    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleNativeShare}
        data-testid={testId}
      >
        <Share2 className="h-3.5 w-3.5" />
        {showLabel && <span className="ml-1">Share</span>}
      </Button>
    );
  }

  // ── Web fallback: dropdown with copy-link + WhatsApp ────────────────────
  const handleCopyLink = () => {
    navigator.clipboard.writeText(url)
      .then(() => toast({ title: "Link copied", description: "Link copied to clipboard." }))
      .catch(() => toast({ title: "Error", description: "Could not copy link", variant: "destructive" }));
  };

  const handleWhatsApp = () => {
    const text = title ? `${title} - ${url}` : url;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          data-testid={testId}
        >
          <Share2 className="h-3.5 w-3.5" />
          {showLabel && <span className="ml-1">Share</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        <DropdownMenuItem onClick={handleCopyLink} data-testid="share-copy-link">
          <Link2 className="h-4 w-4 mr-2" />
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleWhatsApp} data-testid="share-whatsapp">
          <SiWhatsapp className="h-4 w-4 mr-2" />
          Share on WhatsApp
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
