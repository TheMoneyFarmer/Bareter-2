// One-shot Resend send test using whatever credentials the app resolves
// (RESEND_API_KEY/RESEND_FROM_EMAIL secrets, or the Replit connector if set).
import { getUncachableResendClient, invalidateResendReadyCache } from "../server/resendClient.ts";

invalidateResendReadyCache();

const { client, fromEmail } = await getUncachableResendClient();
const to = process.env.FOUNDER_EMAIL?.trim() || "thando@bareter.com";

console.log("from:", fromEmail);
console.log("to:  ", to);

const r = await client.emails.send({
  from: `Bareter <${fromEmail}>`,
  to,
  subject: "Bareter · Resend reconnect smoke test",
  text:
    "If you're reading this, the new Resend API key is wired up and transactional email is flowing again.\n\n" +
    "— Bareter Company OS",
});

if (r.error) {
  console.error("SEND FAILED:", JSON.stringify(r.error, null, 2));
  process.exit(1);
}
console.log("send ok, message id:", r.data?.id);
