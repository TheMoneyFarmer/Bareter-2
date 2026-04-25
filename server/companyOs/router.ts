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
import {
  generateAndStoreBrief,
  getAllBriefs,
  getBriefById,
  getRecentCampaigns,
} from "./marketingAgent";
import { getSignedDownloadUrl } from "./objectStorageHelpers";
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
import { getLeads, getSalesReport, runDailySalesSync } from "./salesAgent";
import {
  generateContract,
  parseContractCommand,
  getRecentLegalDocuments,
  getLegalDocumentById,
  runDisputeRiskSummary,
  runVatCheck,
  CONTRACT_SIGNED_URL_TTL_SEC,
} from "./legalAgent";
import {
  captureDailySnapshot,
  getDashboardData,
  getRecentSnapshots as getRecentKpiSnapshots,
  getSnapshotByDate as getKpiSnapshotByDate,
} from "./dashboardAgent";
import { z } from "zod";

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

  // ---------------------------------------------------------------------------
  // Marketing Agent endpoints (admin-only). Surfaces briefs + campaigns to
  // the existing Admin Dashboard so the founder can see Monday-cron output
  // and trigger ad-hoc briefs without waiting for the next Monday.
  // ---------------------------------------------------------------------------

  router.get("/briefs", opts.requireAdmin, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
      const briefs = await getAllBriefs(limit);
      res.json({ count: briefs.length, briefs });
    } catch (err) {
      console.error("[companyOs] /briefs failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.get("/briefs/:id/pdf", opts.requireAdmin, async (req, res) => {
    try {
      const brief = await getBriefById(String(req.params.id));
      if (!brief) return res.status(404).json({ message: "Brief not found" });
      if (!brief.pdfStorageKey) {
        return res.status(404).json({ message: "Brief has no PDF (generation may have failed)" });
      }
      // Short 1h TTL for the dashboard download — different from the 7d
      // TTL used in WhatsApp messages, since admins are already logged in
      // and don't need a long-lived link.
      const url = await getSignedDownloadUrl(brief.pdfStorageKey, 60 * 60);
      res.json({ url });
    } catch (err) {
      console.error("[companyOs] /briefs/:id/pdf failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.post("/generate-brief", opts.requireAdmin, async (_req, res) => {
    try {
      const brief = await generateAndStoreBrief();
      res.json({ ok: true, brief });
    } catch (err) {
      console.error("[companyOs] /generate-brief failed:", err);
      res.status(500).json({ ok: false, message: "Internal error generating brief" });
    }
  });

  router.get("/campaigns", opts.requireAdmin, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
      const campaigns = await getRecentCampaigns(limit);
      res.json({ count: campaigns.length, campaigns });
    } catch (err) {
      console.error("[companyOs] /campaigns failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Sales Agent endpoints (admin-only). Surfaces leads + ad-hoc sync
  // for the Company OS admin page. Read endpoint supports optional
  // status filter and capped limit.
  // ---------------------------------------------------------------------------

  router.get("/sales/leads", opts.requireAdmin, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 50;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const [leads, summary] = await Promise.all([
        getLeads({ limit, status }),
        getSalesReport(),
      ]);
      res.json({ count: leads.length, summary, leads });
    } catch (err) {
      console.error("[companyOs] /sales/leads failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.post("/sales/sync", opts.requireAdmin, async (_req, res) => {
    try {
      const result = await runDailySalesSync();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[companyOs] /sales/sync failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Legal Agent endpoints (admin-only). UAE-jurisdiction barter contracts,
  // dispute-risk weekly rollup, and UAE VAT registration threshold check.
  // ---------------------------------------------------------------------------

  const contractInputSchema = z.object({
    partyA: z.string().min(1).max(200),
    partyB: z.string().min(1).max(200),
    exchange: z.string().min(1).max(1000),
    valueAed: z.coerce.number().positive().max(1_000_000_000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  router.post("/legal/contract", opts.requireAdmin, async (req, res) => {
    try {
      // Accept either a structured JSON body or a raw `command` string
      // matching the WhatsApp `contract a | b | exchange | value` syntax.
      let parsed: z.infer<typeof contractInputSchema> | null = null;
      if (typeof req.body?.command === "string") {
        const m = parseContractCommand(req.body.command);
        if (!m) {
          return res
            .status(400)
            .json({ ok: false, message: "Invalid contract command format" });
        }
        parsed = { ...m };
      } else {
        const result = contractInputSchema.safeParse(req.body);
        if (!result.success) {
          return res
            .status(400)
            .json({ ok: false, message: result.error.message });
        }
        parsed = result.data;
      }
      const { document, signedUrl } = await generateContract(parsed);
      res.json({ ok: true, document, signedUrl, ttlSec: CONTRACT_SIGNED_URL_TTL_SEC });
    } catch (err) {
      console.error("[companyOs] /legal/contract failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  router.get("/legal/documents", opts.requireAdmin, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
      const documents = await getRecentLegalDocuments(limit);
      res.json({ count: documents.length, documents });
    } catch (err) {
      console.error("[companyOs] /legal/documents failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.get("/legal/documents/:id/pdf", opts.requireAdmin, async (req, res) => {
    try {
      const doc = await getLegalDocumentById(String(req.params.id));
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!doc.objectStorageKey) {
        return res
          .status(404)
          .json({ message: "Document has no PDF (only contracts have PDFs)" });
      }
      // 1h TTL for the dashboard download — admins are already logged in.
      const url = await import("./objectStorageHelpers").then((m) =>
        m.getSignedDownloadUrl(doc.objectStorageKey!, 60 * 60),
      );
      res.json({ url });
    } catch (err) {
      console.error("[companyOs] /legal/documents/:id/pdf failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.get("/legal/dispute-risk", opts.requireAdmin, async (req, res) => {
    try {
      const windowRaw = Number(req.query.windowDays ?? 7);
      const windowDays = Number.isFinite(windowRaw)
        ? Math.max(1, Math.min(90, windowRaw))
        : 7;
      const result = await runDisputeRiskSummary(windowDays);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[companyOs] /legal/dispute-risk failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  router.get("/legal/vat-check", opts.requireAdmin, async (_req, res) => {
    try {
      const result = await runVatCheck();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[companyOs] /legal/vat-check failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Dashboard Agent endpoints (admin-only). Backs /admin/company-os.
  // We reuse the project's `requireAdmin` guard — admin role is the
  // founder gate by convention, and the task brief explicitly asked us
  // to reuse the existing middleware rather than introduce a new one.
  //
  //   • GET /dashboard/live          → live aggregation (polled every 60s).
  //   • GET /dashboard/snapshots     → last N persisted snapshots.
  //   • GET /dashboard/snapshot/:date → single snapshot (date OR date.json).
  //   • POST /dashboard/snapshot     → manual snapshot trigger (debug helper).
  // ---------------------------------------------------------------------------

  router.get("/dashboard/live", opts.requireAdmin, async (_req, res) => {
    try {
      const data = await getDashboardData();
      res.json(data);
    } catch (err) {
      console.error("[companyOs] /dashboard/live failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.get("/dashboard/snapshots", opts.requireAdmin, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 30);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(180, limitRaw)) : 30;
      const snapshots = await getRecentKpiSnapshots(limit);
      res.json({ count: snapshots.length, snapshots });
    } catch (err) {
      console.error("[companyOs] /dashboard/snapshots failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.get("/dashboard/snapshot/:date", opts.requireAdmin, async (req, res) => {
    try {
      // Accept both `2026-04-25` and `2026-04-25.json` so the JSON
      // download button can use a friendly filename.
      const raw = String(req.params.date || "");
      const wantsJsonDownload = raw.endsWith(".json");
      const date = wantsJsonDownload ? raw.slice(0, -5) : raw;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date — expected YYYY-MM-DD" });
      }
      const snap = await getKpiSnapshotByDate(date);
      if (!snap) return res.status(404).json({ message: "Snapshot not found" });
      if (wantsJsonDownload) {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="kpi-snapshot-${date}.json"`,
        );
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.send(JSON.stringify(snap, null, 2));
      }
      res.json(snap);
    } catch (err) {
      console.error("[companyOs] /dashboard/snapshot/:date failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.post("/dashboard/snapshot", opts.requireAdmin, async (_req, res) => {
    try {
      const r = await captureDailySnapshot();
      res.json({ ok: true, ...r });
    } catch (err) {
      console.error("[companyOs] /dashboard/snapshot failed:", err);
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
