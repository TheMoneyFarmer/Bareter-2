import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth as useUser } from "@/lib/auth";

interface WhatsappSettings {
  optedIn: boolean;
  phone: string | null;
  notifyDealProposals: boolean;
  notifyMessages: boolean;
  notifyMatches: boolean;
}

export function WhatsappSettingsToggle() {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [optedIn, setOptedIn] = useState(false);
  const [notifyProposals, setNotifyProposals] = useState(true);
  const [notifyMsgs, setNotifyMsgs] = useState(true);
  const [notifyMatches, setNotifyMatches] = useState(true);

  const { data, isLoading } = useQuery<WhatsappSettings>({
    queryKey: ["/api/me/whatsapp-settings"],
    enabled: !!user,
  });

  useEffect(() => {
    if (data) {
      setPhone(data.phone ?? "");
      setOptedIn(data.optedIn);
      setNotifyProposals(data.notifyDealProposals);
      setNotifyMsgs(data.notifyMessages);
      setNotifyMatches(data.notifyMatches);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/me/whatsapp-settings", {
        phone: phone || null,
        optedIn,
        notifyDealProposals: notifyProposals,
        notifyMessages: notifyMsgs,
        notifyMatches,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/whatsapp-settings"] });
      toast({ title: "WhatsApp settings saved" });
    },
    onError: () => {
      toast({ title: "Error saving settings", variant: "destructive" });
    },
  });

  if (!user) return null;

  return (
    <Card className="relative overflow-hidden opacity-60 pointer-events-none select-none">
      {/* Coming Soon overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/60 backdrop-blur-[2px]">
        <span className="bg-muted text-muted-foreground text-xs font-semibold px-3 py-1 rounded-full border border-border">
          Coming Soon
        </span>
      </div>

      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-green-600" />
          WhatsApp Notifications
        </CardTitle>
        <CardDescription>Get instant alerts for your trades via WhatsApp.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="font-medium">Enable WhatsApp alerts</Label>
          <Switch checked={false} disabled />
        </div>
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground">Notify me about:</p>
          {["Deal proposals", "New messages", "Trade matches"].map((label) => (
            <div key={label} className="flex items-center justify-between">
              <Label className="text-sm font-normal">{label}</Label>
              <Switch checked={false} disabled />
            </div>
          ))}
        </div>
        <Button className="w-full" size="sm" disabled>
          Save WhatsApp Settings
        </Button>
      </CardContent>
    </Card>
  );
}
