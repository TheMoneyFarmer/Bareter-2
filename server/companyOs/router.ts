// Express router for the Company OS / WhatsApp control plane.
//
// Mounted under /api/company-os. The two webhooks (/whatsapp and
// /stripe-webhook) verify the sender via signatures and are exempted
// from the global origin-CSRF guard via security.ts; the three GET
// endpoints (/status, /finance, /logs) are gated by `requireAdmin`.

import express, { type Request, type Response, type Router, type RequestHandler } from "express";
import type Stripe from "stripe";
import { desc } from "drizzle-orm";
import { db } from "../db";
import { companyOsLogs } from "@shared/schema";
import { handleManagerMessage, composeDailyBriefing } from "./managerAgent";
import {
  handleStripePaymentSucceeded,
  handleStripeChargeRefunded,
  getRecentSnapshots,
  formatFinanceReport,
  getWeeklyRevenue,
  dubaiDateString,
  runDailyFinanceSnapshot,
} from "./financeAgent";
import { getStatusJson } from "./managerAgent";
import {
  sendWhatsApp,
  validateTwilioRequest,
  isFromFounder,
  notifyFounder,
  isFounderConfigured,
  isTwilioConfigured,
} from "./twilio";
import { getStripeWebhookSecret, getStripeClient } from "./stripeClient";
import { getMonthSpendByAgent, getBudgetVerdict } from "./costTracker";

export function createCompanyOsRouter(opts: { requireAdmin: RequestHandler }): Router {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // POST /api/company-os/whatsapp — Twilio inbound webhook.
  //
  // We respond 200 immediately so Twilio doesn't time out (it cuts the
  // connection at 15s) and process the message in the background. Any
  // reply is sent via the Twilio REST API rather than via TwiML so the
  // founder still gets an answer even if message processing took >15s.
  // ---------------------------------------------------------------------------
  router.post("/whatsapp", async (req: Request, res: Response) => {
    try {
      const formParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.body || {})) {
        formParams[k] = String(v ?? "");
      }
      const signature = (req.headers["x-twilio-signature"] as string) ?? "";

      // Reconstruct the absolute URL Twilio used to call us, honoring
      // the Replit edge proxy headers so the signature matches.
      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
      const url = `${proto}://${host}${req.originalUrl}`;

      if (!validateTwilioRequest(signature, url, formParams)) {
        // Always return 200 so Twilio doesn't retry — but log loudly.
        console.warn("[companyOs] Twilio signature check failed for inbound message");
        return res.status(200).send("");
      }

      const from = formParams.From || "";
      const body = formParams.Body || "";

      // Silently 200 anyone who isn't the founder. We don't want to
      // turn the sandbox number into a public chatbot.
      if (!isFromFounder(from)) {
        return res.status(200).send("");
      }

      // 200-then-process pattern — never await the handler before responding.
      res.status(200).send("");

      void (async () => {
        try {
          const reply = await handleManagerMessage(body);
          if (reply) {
            await sendWhatsApp(from, reply);
          }
        } catch (err) {
          console.error("[companyOs] async whatsapp handler failed:", err);
        }
      })();
    } catch (err) {
      console.error("[companyOs] /whatsapp handler error:", err);
      if (!res.headersSent) res.status(200).send("");
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/company-os/stripe-webhook — Stripe webhook.
  //
  // Body parser is `express.raw({ type: "application/json" })` mounted
  // in server/index.ts so `req.body` is a Buffer here. Signature is
  // verified via the Stripe SDK; mismatches return 400 (Stripe retries
  // those). Successful events are handed to the Finance Agent.
  // ---------------------------------------------------------------------------
  router.post("/stripe-webhook", async (req: Request, res: Response) => {
    try {
      const sig = req.headers["stripe-signature"];
      const webhookSecret = await getStripeWebhookSecret();
      const stripe = await getStripeClient();
      if (!stripe || !webhookSecret) {
        console.warn("[companyOs] stripe-webhook: Stripe not configured");
        return res.status(500).json({ message: "Stripe not configured" });
      }
      if (!sig || typeof sig !== "string") {
        return res.status(400).json({ message: "Missing stripe-signature header" });
      }
      const raw = req.body;
      if (!Buffer.isBuffer(raw)) {
        // Body parser misconfiguration — fail loudly so it gets noticed.
        return res.status(400).json({ message: "Stripe webhook body must be raw" });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
      } catch (err) {
        console.warn("[companyOs] Stripe signature verification failed:", err);
        return res.status(400).json({ message: "Invalid signature" });
      }

      // Respond fast, then process — Stripe also enforces ~15s.
      res.status(200).json({ received: true });

      void (async () => {
        try {
          if (event.type === "payment_intent.succeeded") {
            await handleStripePaymentSucceeded(event);
          } else if (event.type === "charge.refunded") {
            await handleStripeChargeRefunded(event);
          } else {
            console.log("[companyOs] stripe-webhook: ignored event", event.type);
          }
        } catch (err) {
          console.error("[companyOs] async stripe handler failed:", err);
        }
      })();
    } catch (err) {
      console.error("[companyOs] /stripe-webhook handler error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Internal error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Admin-only JSON read surface — backs the future Company OS admin UI.
  // ---------------------------------------------------------------------------
  router.get("/status", opts.requireAdmin, async (_req, res) => {
    try {
      res.json(await getStatusJson());
    } catch (err) {
      console.error("[companyOs] /status failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.get("/finance", opts.requireAdmin, async (_req, res) => {
    try {
      const [todayReport, weeklyReport, weekly, recent, aiByAgent, aiBudget] = await Promise.all([
        formatFinanceReport("today"),
        formatFinanceReport("week"),
        getWeeklyRevenue(),
        getRecentSnapshots(14),
        getMonthSpendByAgent(),
        getBudgetVerdict(),
      ]);
      res.json({
        date: dubaiDateString(),
        todayReport,
        weeklyReport,
        weekly,
        recentSnapshots: recent,
        aiSpend: {
          budget: aiBudget,
          byAgent: aiByAgent,
        },
      });
    } catch (err) {
      console.error("[companyOs] /finance failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/company-os/test-briefing — manual trigger for the daily briefing.
  //
  // Sends one briefing to the configured founder WhatsApp number right now,
  // bypassing the 08:00 cron. Admin-gated so it can't be hit anonymously.
  // Use it after publishing to confirm the WhatsApp delivery path works
  // without waiting until tomorrow morning.
  // ---------------------------------------------------------------------------
  router.post("/test-briefing", opts.requireAdmin, async (_req, res) => {
    try {
      if (!isTwilioConfigured()) {
        return res
          .status(400)
          .json({ ok: false, message: "Twilio is not configured (missing TWILIO_* secrets)" });
      }
      if (!isFounderConfigured()) {
        return res
          .status(400)
          .json({ ok: false, message: "FOUNDER_WHATSAPP_NUMBER is not set" });
      }
      try {
        await runDailyFinanceSnapshot();
      } catch (err) {
        console.warn("[companyOs] /test-briefing snapshot refresh failed:", err);
      }
      const body = await composeDailyBriefing();
      const sent = await notifyFounder(`🧪 *Test briefing* (manually triggered)\n\n${body}`);
      res.json({
        ok: sent,
        message: sent
          ? "Briefing sent to founder WhatsApp"
          : "Twilio call failed — check server logs",
      });
    } catch (err) {
      console.error("[companyOs] /test-briefing failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  router.get("/logs", opts.requireAdmin, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 100);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100;
      const rows = await db
        .select()
        .from(companyOsLogs)
        .orderBy(desc(companyOsLogs.createdAt))
        .limit(limit);
      res.json({ count: rows.length, logs: rows });
    } catch (err) {
      console.error("[companyOs] /logs failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  return router;
}
