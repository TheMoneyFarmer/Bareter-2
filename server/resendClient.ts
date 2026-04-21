// Resend integration (Replit blueprint: resend)
import { Resend } from "resend";

interface ResendConnectionSettings {
  api_key?: string;
  from_email?: string;
}

interface ResendConnectionItem {
  settings?: ResendConnectionSettings;
}

interface ResendConnectionResponse {
  items?: ResendConnectionItem[];
}

let cachedSettings: ResendConnectionSettings | null = null;

function getReplitToken(): string | null {
  if (process.env.REPL_IDENTITY) return "repl " + process.env.REPL_IDENTITY;
  if (process.env.WEB_REPL_RENEWAL) return "depl " + process.env.WEB_REPL_RENEWAL;
  return null;
}

async function fetchResendSettings(): Promise<ResendConnectionSettings | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = getReplitToken();
  if (!hostname || !xReplitToken) return null;

  try {
    const res = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
      {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as ResendConnectionResponse;
    const settings = data.items?.[0]?.settings;
    if (!settings || !settings.api_key) return null;
    return settings;
  } catch {
    return null;
  }
}

async function getCredentials(): Promise<ResendConnectionSettings> {
  const settings = await fetchResendSettings();
  if (!settings) {
    throw new Error("Resend not connected");
  }
  cachedSettings = settings;
  return settings;
}

// WARNING: Never cache the Resend client itself — tokens expire. Always call this fresh.
export async function getUncachableResendClient(): Promise<{
  client: Resend;
  fromEmail: string | undefined;
}> {
  const settings = await getCredentials();
  return {
    client: new Resend(settings.api_key!),
    fromEmail: settings.from_email,
  };
}

// Lightweight readiness probe with short-lived cache so /api/config doesn't
// hammer the connectors API. Cache TTL is intentionally short so the UI flips
// quickly when Resend is (dis)connected.
let readyCache: { ready: boolean; expiresAt: number } | null = null;
const READY_TTL_MS = 60_000;

export async function isResendReady(): Promise<boolean> {
  const now = Date.now();
  if (readyCache && readyCache.expiresAt > now) return readyCache.ready;

  const settings = await fetchResendSettings();
  const ready = Boolean(settings?.api_key);
  if (ready) cachedSettings = settings;
  readyCache = { ready, expiresAt: now + READY_TTL_MS };
  return ready;
}

export function invalidateResendReadyCache(): void {
  readyCache = null;
}
