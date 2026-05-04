import { useQuery } from "@tanstack/react-query";
import { Construction } from "lucide-react";

type PublicSettings = Record<string, string | null>;

const DEFAULT_MESSAGE = "We're performing scheduled maintenance to improve your experience. We'll be back shortly!";

export function MaintenancePage() {
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["/api/public/settings"],
    staleTime: 10_000,
  });

  const message = settings?.maintenance_message || DEFAULT_MESSAGE;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-bareter-teal/5 to-background">
      <div className="text-center px-6 max-w-lg mx-auto">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-bareter-teal/10 mb-6">
          <Construction className="h-10 w-10 text-bareter-teal" />
        </div>
        <h1 className="text-3xl font-bold mb-3" data-testid="text-maintenance-title">
          We'll Be Back Soon
        </h1>
        <p className="text-lg text-muted-foreground mb-8" data-testid="text-maintenance-message">
          {message}
        </p>
        <div className="text-sm text-muted-foreground/60">
          <p className="font-semibold text-bareter-teal text-xl tracking-wide">BARETER</p>
        </div>
      </div>
    </div>
  );
}
