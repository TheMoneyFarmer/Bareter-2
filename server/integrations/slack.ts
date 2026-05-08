import { getIntegrationCredential, isIntegrationConfigured } from "./credentials";

export async function isSlackConfigured(): Promise<boolean> {
  return isIntegrationConfigured(["slack_webhook_url"]);
}

export async function postSlackMessage(
  text: string,
  opts?: { channel?: string; username?: string; iconEmoji?: string },
): Promise<boolean> {
  const webhookUrl = await getIntegrationCredential("slack_webhook_url");
  if (!webhookUrl) return false;

  try {
    const payload: Record<string, unknown> = { text };
    if (opts?.channel) payload.channel = opts.channel;
    if (opts?.username) payload.username = opts.username;
    if (opts?.iconEmoji) payload.icon_emoji = opts.iconEmoji;

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Slack] Webhook POST failed (${res.status}):`, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Slack] postSlackMessage error:", err);
    return false;
  }
}

export async function postSlackAlert(
  title: string,
  body: string,
  level: "info" | "warning" | "critical" = "info",
): Promise<boolean> {
  const emoji = level === "critical" ? ":rotating_light:" : level === "warning" ? ":warning:" : ":information_source:";
  const text = `${emoji} *${title}*\n${body}`;
  return postSlackMessage(text, { username: "Bareter Alerts", iconEmoji: emoji });
}

export async function postSlackSupportEscalation(opts: {
  ticketNumber: string;
  subject: string;
  userName: string;
  userEmail: string;
}): Promise<boolean> {
  const text = `:escalation: *Support Escalation — ${opts.ticketNumber}*\n*Subject:* ${opts.subject}\n*User:* ${opts.userName} (${opts.userEmail})\nA user has requested human support.`;
  return postSlackMessage(text, { username: "Bareter Support", iconEmoji: ":headphones:" });
}
