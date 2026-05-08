import { getIntegrationCredential, isIntegrationConfigured } from "./credentials";

export async function isGmailConfigured(): Promise<boolean> {
  return isIntegrationConfigured(["google_access_token"]);
}

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  receivedAt: string;
  isReply: boolean;
}

async function getValidAccessToken(): Promise<string | null> {
  const accessToken = await getIntegrationCredential("google_access_token");
  if (!accessToken) return null;

  const refreshToken = await getIntegrationCredential("google_refresh_token");
  const clientId = await getIntegrationCredential("google_client_id");
  const clientSecret = await getIntegrationCredential("google_client_secret");

  if (refreshToken && clientId && clientSecret) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { access_token?: string };
        if (data.access_token) return data.access_token;
      }
    } catch { /* fall through */ }
  }

  return accessToken;
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function fetchRecentGmailReplies(
  query = "in:inbox subject:Bareter",
  maxResults = 20,
): Promise<GmailMessage[]> {
  const token = await getValidAccessToken();
  if (!token) return [];

  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!listRes.ok) {
      console.error(`[Gmail] List messages failed (${listRes.status})`);
      return [];
    }
    const listData = await listRes.json() as { messages?: { id: string }[] };
    if (!listData.messages?.length) return [];

    const messages: GmailMessage[] = [];
    for (const { id } of listData.messages.slice(0, maxResults)) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!msgRes.ok) continue;
        const msg = await msgRes.json() as {
          id: string;
          snippet?: string;
          payload?: { headers?: { name: string; value: string }[] };
          internalDate?: string;
        };
        const headers = msg.payload?.headers ?? [];
        const subject = getHeader(headers, "subject");
        const from = getHeader(headers, "from");
        const date = getHeader(headers, "date");
        messages.push({
          id: msg.id,
          subject,
          from,
          snippet: msg.snippet ?? "",
          receivedAt: date || (msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : ""),
          isReply: subject.toLowerCase().startsWith("re:"),
        });
      } catch { /* skip individual message errors */ }
    }
    return messages;
  } catch (err) {
    console.error("[Gmail] fetchRecentGmailReplies error:", err);
    return [];
  }
}
