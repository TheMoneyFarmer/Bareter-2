import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, Settings2, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface IntegrationStatus {
  service: string;
  configured: boolean;
  configuredAt?: string | null;
  fields: { key: string; label: string; placeholder: string; sensitive: boolean }[];
}

const INTEGRATIONS_CONFIG: {
  service: string;
  label: string;
  description: string;
  docsUrl: string;
  usedBy: string[];
  fields: { key: string; label: string; placeholder: string; sensitive: boolean }[];
}[] = [
  {
    service: "notion",
    label: "Notion",
    description: "Connect your Notion workspace to let the support agent read KB articles as context, and marketing agent push weekly summaries.",
    docsUrl: "https://developers.notion.com/docs/authorization",
    usedBy: ["Support agent (KB context)", "Marketing agent (summaries)"],
    fields: [
      { key: "notion_token", label: "Integration Token", placeholder: "secret_...", sensitive: true },
      { key: "notion_database_id", label: "KB Database ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", sensitive: false },
    ],
  },
  {
    service: "slack",
    label: "Slack",
    description: "Post critical alerts, support escalations, and weekly marketing briefs to a Slack channel via an incoming webhook.",
    docsUrl: "https://api.slack.com/messaging/webhooks",
    usedBy: ["Intelligence agent (alerts)", "Support escalation", "Marketing agent (briefs)"],
    fields: [
      { key: "slack_webhook_url", label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/...", sensitive: true },
    ],
  },
  {
    service: "google",
    label: "Google (Drive & Gmail)",
    description: "Upload contract PDFs and marketing briefs to a Google Drive folder. Optionally read Gmail replies to track email engagement.",
    docsUrl: "https://developers.google.com/identity/protocols/oauth2",
    usedBy: ["Legal agent (contract PDFs)", "Marketing agent (brief PDFs)", "Dashboard agent (Gmail replies)"],
    fields: [
      { key: "google_client_id", label: "OAuth Client ID", placeholder: "xxxxxx.apps.googleusercontent.com", sensitive: false },
      { key: "google_client_secret", label: "OAuth Client Secret", placeholder: "GOCSPX-...", sensitive: true },
      { key: "google_access_token", label: "Access Token", placeholder: "ya29...", sensitive: true },
      { key: "google_refresh_token", label: "Refresh Token", placeholder: "1//...", sensitive: true },
      { key: "google_drive_folder_id", label: "Drive Folder ID", placeholder: "1BxiMVs0XRA...", sensitive: false },
    ],
  },
];

function StatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
      <CheckCircle2 className="h-3 w-3" />Connected
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1 text-muted-foreground">
      <XCircle className="h-3 w-3" />Not connected
    </Badge>
  );
}

export function AdminIntegrationsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const { data: statuses = [], isLoading } = useQuery<IntegrationStatus[]>({
    queryKey: ["/api/admin/integrations"],
    queryFn: () => fetch("/api/admin/integrations", { credentials: "include" }).then((r) => r.json()),
  });

  const configureMutation = useMutation({
    mutationFn: async ({ service, fields }: { service: string; fields: Record<string, string> }) => {
      const res = await apiRequest("POST", `/api/admin/integrations/${service}`, { fields });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Failed to save");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/integrations"] });
      setConfiguring(null);
      setFieldValues({});
      toast({ title: "Integration saved", description: "Credentials stored securely." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (service: string) => {
      const res = await apiRequest("DELETE", `/api/admin/integrations/${service}`);
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/integrations"] });
      toast({ title: "Integration disconnected" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    },
  });

  const openConfigure = (service: string) => {
    setFieldValues({});
    setConfiguring(service);
  };

  const activeConfig = INTEGRATIONS_CONFIG.find((c) => c.service === configuring);

  const getStatus = (service: string): IntegrationStatus | undefined =>
    statuses.find((s) => s.service === service);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">External Integrations</h3>
        <p className="text-sm text-muted-foreground">
          Connect Bareter agents to your team's tools. All credentials are encrypted at rest and never sent to the browser.
        </p>
      </div>

      <div className="grid gap-4">
        {INTEGRATIONS_CONFIG.map((config) => {
          const status = getStatus(config.service);
          const isConnected = status?.configured ?? false;

          return (
            <Card key={config.service} data-testid={`integration-card-${config.service}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <CardTitle className="text-base">{config.label}</CardTitle>
                      <StatusBadge configured={isConnected} />
                    </div>
                    <CardDescription className="text-xs leading-relaxed">
                      {config.description}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={config.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      data-testid={`link-integration-docs-${config.service}`}
                    >
                      Docs <ExternalLink className="h-3 w-3" />
                    </a>
                    {isConnected && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => disconnectMutation.mutate(config.service)}
                        disabled={disconnectMutation.isPending}
                        data-testid={`btn-integration-disconnect-${config.service}`}
                      >
                        Disconnect
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={isConnected ? "outline" : "default"}
                      className="h-7 text-xs gap-1.5"
                      onClick={() => openConfigure(config.service)}
                      data-testid={`btn-integration-configure-${config.service}`}
                    >
                      <Settings2 className="h-3 w-3" />
                      {isConnected ? "Reconfigure" : "Configure"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <div className="flex flex-wrap gap-1">
                  {config.usedBy.map((use) => (
                    <span
                      key={use}
                      className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground"
                    >
                      {use}
                    </span>
                  ))}
                </div>
                {isConnected && status?.configuredAt && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Last updated: {new Date(status.configuredAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!configuring} onOpenChange={(o) => { if (!o) { setConfiguring(null); setFieldValues({}); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure {activeConfig?.label}</DialogTitle>
            <DialogDescription>
              Enter your credentials below. They will be encrypted and stored securely — never visible again once saved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {activeConfig?.fields.map((f) => (
              <div key={f.key}>
                <Label htmlFor={`field-${f.key}`} className="text-xs font-medium">
                  {f.label}
                </Label>
                <Input
                  id={`field-${f.key}`}
                  data-testid={`input-integration-${f.key}`}
                  type={f.sensitive ? "password" : "text"}
                  placeholder={f.placeholder}
                  value={fieldValues[f.key] ?? ""}
                  onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="mt-1 text-xs h-8 font-mono"
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Leave a field blank to keep the existing stored value.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setConfiguring(null); setFieldValues({}); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={configureMutation.isPending}
              onClick={() => {
                if (!configuring) return;
                configureMutation.mutate({ service: configuring, fields: fieldValues });
              }}
              data-testid="btn-integration-save"
            >
              {configureMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save credentials"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
