// Thin wrapper around the Stripe SDK that pulls credentials from the
// Replit Stripe integration (same pattern as resendClient.ts) — falls
// back to STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET env vars if the
// integration isn't connected.
//
// Used by the Finance Agent (read-only `charges.list`) and the
// /api/company-os/stripe-webhook handler. We never cache the SDK
// instance because Replit-issued tokens can rotate.

import Stripe from "stripe";

interface StripeConnectionSettings {
  account_id?: string;
  secret?: string;
  publishable?: string;
  webhook_secret?: string;
}

interface StripeConnectionItem {
  settings?: StripeConnectionSettings;
}

interface StripeConnectionResponse {
  items?: StripeConnectionItem[];
}

function getReplitToken(): string | null {
  if (process.env.REPL_IDENTITY) return "repl " + process.env.REPL_IDENTITY;
  if (process.env.WEB_REPL_RENEWAL) return "depl " + process.env.WEB_REPL_RENEWAL;
  return null;
}

async function fetchStripeSettings(): Promise<StripeConnectionSettings | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = getReplitToken();
  if (!hostname || !token) return null;

  try {
    const res = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
      {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": token,
        },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as StripeConnectionResponse;
    return data.items?.[0]?.settings ?? null;
  } catch {
    return null;
  }
}

export async function getStripeSecretKey(): Promise<string | null> {
  const fromEnv = process.env.STRIPE_SECRET_KEY;
  if (fromEnv) return fromEnv;
  const settings = await fetchStripeSettings();
  return settings?.secret ?? null;
}

export async function getStripeWebhookSecret(): Promise<string | null> {
  const fromEnv = process.env.STRIPE_WEBHOOK_SECRET;
  if (fromEnv) return fromEnv;
  const settings = await fetchStripeSettings();
  return settings?.webhook_secret ?? null;
}

export async function getStripeClient(): Promise<Stripe | null> {
  const secret = await getStripeSecretKey();
  if (!secret) return null;
  // Pin to the SDK's latest known version so type narrowing matches the
  // installed `stripe` major. Bumping `stripe` will surface here as a typecheck.
  return new Stripe(secret, { apiVersion: "2025-11-17.clover" as Stripe.LatestApiVersion });
}

export async function isStripeConfigured(): Promise<boolean> {
  return Boolean(await getStripeSecretKey());
}
