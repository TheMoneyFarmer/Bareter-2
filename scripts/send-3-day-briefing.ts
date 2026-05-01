// Sends 3 simulated "daily briefing" WhatsApps to the founder (D-2, D-1, today)
// using the same composer the 08:00 cron uses, and emails today's briefing to
// FOUNDER_EMAIL so both channels can be verified end-to-end.

import { composeStatusBriefing } from "../server/companyOs/managerAgent.ts";
import { notifyFounder, isTwilioConfigured, isFounderConfigured }
  from "../server/companyOs/twilio.ts";
import { getUncachableResendClient } from "../server/resendClient.ts";

function dubaiDateString(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

const founderName = process.env.FOUNDER_NAME || "Founder";
const briefing = await composeStatusBriefing();

const days = [
  { offset: -2, label: dubaiDateString(-2) },
  { offset: -1, label: dubaiDateString(-1) },
  { offset:  0, label: dubaiDateString( 0) },
];

console.log("\n═══ Sending 3-day briefing test ═══\n");

if (!isTwilioConfigured() || !isFounderConfigured()) {
  console.log("✗ Twilio or FOUNDER_WHATSAPP_NUMBER not configured — aborting");
  process.exit(1);
}

for (const d of days) {
  const body = [
    `Good morning ${founderName}! Daily briefing for ${d.label}.`,
    "",
    "(simulated backfill — sent now to verify the cron payload)",
    "",
    briefing,
  ].join("\n");
  const ok = await notifyFounder(body);
  console.log(`📲 ${d.label}: ${ok ? "sent" : "FAILED"}`);
  // Twilio rate limits + readability — small spacing between messages
  await new Promise((r) => setTimeout(r, 1500));
}

// Bonus: email today's briefing so the new Resend wiring is also verified.
const founderEmail = process.env.FOUNDER_EMAIL?.trim();
if (founderEmail) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const r = await client.emails.send({
      from: `Bareter Company OS <${fromEmail}>`,
      to: founderEmail,
      subject: `Bareter daily briefing — ${days[2].label}`,
      text:
        `Good morning ${founderName}! Daily briefing for ${days[2].label}.\n\n` +
        "(simulated backfill — sent now to verify the email channel)\n\n" +
        briefing,
    });
    if (r.error) {
      console.log(`✉️  email FAILED: ${JSON.stringify(r.error)}`);
    } else {
      console.log(`✉️  email sent → ${founderEmail} (id ${r.data?.id})`);
    }
  } catch (err) {
    console.log(`✉️  email FAILED: ${err?.message || err}`);
  }
} else {
  console.log("✉️  email skipped — FOUNDER_EMAIL not set");
}

console.log("\nDone. Check your phone (3 WhatsApps) and inbox (1 email).");
