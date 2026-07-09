import { ChevronLeft } from "lucide-react";
import { useAppNavigation } from "@/hooks/useAppNavigation";

interface BackButtonProps {
  fallback?: string;
  label?: string;
  className?: string;
  variant?: "default" | "overlay";
}

export function BackButton({
  fallback = "/browse",
  label = "Back",
  className,
  variant = "default",
}: BackButtonProps) {
  const { back } = useAppNavigation();

  if (variant === "overlay") {
    return (
      <button
        type="button"
        onClick={() => back(fallback)}
        className={`inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors bg-black/20 hover:bg-black/30 rounded-full px-3 py-1 backdrop-blur-sm ${className ?? ""}`}
      >
        <ChevronLeft className="h-4 w-4" />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => back(fallback)}
      className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors ${className ?? ""}`}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
