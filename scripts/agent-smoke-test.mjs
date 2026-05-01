#!/usr/bin/env node
// One-shot smoke test for the Bareter agent stack + Twilio + Resend.
// Run with: node --experimental-vm-modules scripts/agent-smoke-test.mjs
// or:        npx tsx scripts/agent-smoke-test.mjs
//
// What it does:
//   1. Pings each LLM-touching agent with a tiny prompt to confirm
//      the OpenAI proxy + model name + budget gate all work.
//   2. Calls the structural Company OS agents (no LLM needed) to
//      confirm DB queries + storage helpers don't blow up.
//   3. Probes Twilio config + sends one consolidated WhatsApp
//      summary to FOUNDER_WHATSAPP_NUMBER if Twilio is configured.
//   4. Probes Resend connection state.
//
// All results are printed to stdout and (if Twilio is up) shipped
// to the founder phone as a single WhatsApp message.

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} ${name}${detail ? " — " + detail : ""}`);
}

async function safe(name, fn) {
  try {
    const out = await fn();
    record(name, true, typeof out === "string" ? out.slice(0, 80) : "");
    return out;
  } catch (err) {
    record(name, false, (err?.message || String(err)).slice(0, 120));
    return null;
  }
}

console.log("\n═══ Bareter agent smoke test ═══\n");

// --- 1. LLM broker (the actual root cause we just fixed) ---
const { chatCompletion, jsonCompletion } = await import("../server/agents/llm.ts");

await safe("llm.chatCompletion (gpt-4o-mini)", async () => {
  const r = await chatCompletion(
    [{ role: "user", content: "reply with the single word 'pong'" }],
    { agentName: "smoke-test", command: "ping", maxTokens: 8 },
  );
  if (!r.content) throw new Error("empty response");
  return r.content.trim();
});

await safe("llm.jsonCompletion", async () => {
  const r = await jsonCompletion(
    [{ role: "user", content: "respond with {\"ok\":true}" }],
    { agentName: "smoke-test", command: "json-ping", maxTokens: 32 },
  );
  if (!r.data?.ok) throw new Error("json missing ok:true");
  return "ok=true";
});

// --- 2. Per-agent entry points (LLM-touching) ---
await safe("moderationAgent.moderateContent", async () => {
  const { moderateContent } = await import("../server/agents/moderationAgent.ts");
  const v = await moderateContent("listing", {
    title: "Office furniture for trade",
    description: "Used desk and chairs in Dubai, looking to swap for marketing services.",
    value: 1200,
    categories: ["furniture"],
  });
  return `action=${v.action} confidence=${v.confidence}`;
});

await safe("supportAgent.getSupportResponse", async () => {
  const { getSupportResponse } = await import("../server/agents/supportAgent.ts");
  const r = await getSupportResponse("How do I create my first listing on Bareter?");
  return r.response.slice(0, 60);
});

await safe("valuationAgent (via marketingAgent draftPost)", async () => {
  const { draftPost } = await import("../server/companyOs/marketingAgent.ts");
  const text = await draftPost("Why barter beats cash in Q4");
  return text.slice(0, 60);
});

// --- 3. Structural agents (no LLM) ---
await safe("financeAgent.formatFinanceReport(today)", async () => {
  const { formatFinanceReport } = await import("../server/companyOs/financeAgent.ts");
  return (await formatFinanceReport("today")).slice(0, 60);
});

await safe("salesAgent.getSalesReport", async () => {
  const { getSalesReport } = await import("../server/companyOs/salesAgent.ts");
  const r = await getSalesReport();
  return `leads=${r.totalLeads ?? 0}`;
});

await safe("legalAgent.getRecentLegalDocuments", async () => {
  const { getRecentLegalDocuments } = await import("../server/companyOs/legalAgent.ts");
  const r = await getRecentLegalDocuments(3);
  return `n=${r.length}`;
});

// --- 4. Twilio + Resend ---
const { isTwilioConfigured, isFounderConfigured, notifyFounder } =
  await import("../server/companyOs/twilio.ts");
record("twilio.isTwilioConfigured", isTwilioConfigured(), "");
record("twilio.isFounderConfigured", isFounderConfigured(), "");

let resendOk = false;
await safe("resend.isResendReady", async () => {
  const { isResendReady } = await import("../server/resendClient.ts");
  resendOk = await isResendReady();
  if (!resendOk) throw new Error("not connected");
  return "connected";
});

// --- 5. Notify founder with consolidated summary ---
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);

const summary = [
  "🧪 *Bareter agent smoke test*",
  `passed: ${passed}/${results.length}`,
  failed.length
    ? "failures:\n" + failed.map((f) => `• ${f.name}: ${f.detail}`).join("\n")
    : "all green ✅",
  "",
  `twilio: ${isTwilioConfigured() ? "ok" : "not configured"}`,
  `resend: ${resendOk ? "ok" : "not connected"}`,
].join("\n");

console.log("\n--- WhatsApp summary ---\n" + summary + "\n");

if (isTwilioConfigured() && isFounderConfigured()) {
  const sent = await notifyFounder(summary);
  console.log(sent ? "📲 founder pinged" : "📲 founder ping FAILED (Twilio call rejected)");
} else {
  console.log("📲 skipped — Twilio or FOUNDER_WHATSAPP_NUMBER not configured");
}

process.exit(failed.length ? 1 : 0);
