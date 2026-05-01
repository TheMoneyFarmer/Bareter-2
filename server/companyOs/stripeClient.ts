// Stripe integration is intentionally disabled while the platform is
// in its free-launch period. This file is kept as a stub so that:
//
//   • Existing imports (`getStripeClient`, `getStripeWebhookSecret`,
//     `getStripeSecretKey`, `isStripeConfigured`) keep working.
//   • Test files that already `vi.mock("../server/companyOs/stripeClient", …)`
//     continue to resolve.
//
// The real Stripe SDK and the `/api/company-os/stripe-webhook` route
// were removed so the publish flow doesn't demand a Stripe sandbox
// connection. To re-enable Stripe later, restore the SDK import,
// re-add the webhook route, and reinstall `stripe` + the Replit
// connector.

export async function getStripeSecretKey(): Promise<string | null> {
  return null;
}

export async function getStripeWebhookSecret(): Promise<string | null> {
  return null;
}

export async function getStripeClient(): Promise<null> {
  return null;
}

export async function isStripeConfigured(): Promise<boolean> {
  return false;
}
