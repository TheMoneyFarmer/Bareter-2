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
  getRecentMarketingPosts,
  listPendingPublishDrafts,
  handleConfirmPublishSend,
  handleConfirmPublishSkip,
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
import {
  getLeads,
  getSalesReport,
  runDailySalesSync,
  runReEngagementForLead,
  updateLead,
} from "./salesAgent";
import {
  generateContract,
  parseContractCommand,
  getRecentLegalDocuments,
  getLegalDocumentById,
  getRecentDisputeSummaries,
  getDisputeSummaryById,
  getContractByToken,
  signContract,
  buildSigningUrlsForRow,
  runDisputeRiskSummary,
  runVatCheck,
  CONTRACT_SIGNED_URL_TTL_SEC,
} from "./legalAgent";
import {
  captureDailySnapshot,
  getDashboardData,
  getRecentSnapshots as getRecentKpiSnapshots,
  getSnapshotByDate as getKpiSnapshotByDate,
  getRecentFailures,
  snoozeFailureGroup,
} from "./dashboardAgent";
import { listMemories, deleteMemoryById } from "./memoryAgent";
import {
  getRecentAlerts,
  acknowledgeAlert,
  snoozeAlerts,
  runIntelligenceSweep,
  getAlertsSnoozedUntil,
} from "./intelligenceAgent";
import { getAllAgentSpendsAed, setAgentBudgetOverride } from "./costTracker";
import {
  generateMonthlyReport,
  getRecentReports,
  getReportByMonth,
  parseReportMonth,
  BOARD_REPORT_SIGNED_URL_TTL_SEC,
} from "./boardReportAgent";
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
          const reply = await handleManagerMessage(body, from);
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

  // Recent published posts (success + failure rows). Used by the admin
  // dashboard to debug delivery failures and confirm what went out.
  router.get("/marketing-posts", opts.requireAdmin, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
      const posts = await getRecentMarketingPosts(limit);
      res.json({ count: posts.length, posts });
    } catch (err) {
      console.error("[companyOs] /marketing-posts failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Pending publish-post drafts (Task #112). Surfaces the WhatsApp
  // confirmation queue (Task #86) so the founder can see + act on parked
  // drafts from the admin dashboard when WhatsApp is unreliable.
  // ---------------------------------------------------------------------------

  router.get("/marketing/pending-publish", opts.requireAdmin, async (_req, res) => {
    try {
      const drafts = await listPendingPublishDrafts();
      res.json({ count: drafts.length, drafts });
    } catch (err) {
      console.error("[companyOs] /marketing/pending-publish failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.post(
    "/marketing/pending-publish/:senderId/send",
    opts.requireAdmin,
    async (req, res) => {
      try {
        // Express decodes path params, so an encoded `+971...` arrives
        // as `+971...` — exactly the form `pendingPublishKey` expects
        // (it strips a leading `whatsapp:` prefix if present).
        const senderId = String(req.params.senderId || "");
        if (!senderId) return res.status(400).json({ message: "senderId required" });
        const reply = await handleConfirmPublishSend(senderId);
        res.json({ ok: true, reply });
      } catch (err) {
        console.error("[companyOs] /marketing/pending-publish/:id/send failed:", err);
        res.status(500).json({ ok: false, message: "Internal error" });
      }
    },
  );

  router.post(
    "/marketing/pending-publish/:senderId/skip",
    opts.requireAdmin,
    async (req, res) => {
      try {
        const senderId = String(req.params.senderId || "");
        if (!senderId) return res.status(400).json({ message: "senderId required" });
        const reply = await handleConfirmPublishSkip(senderId);
        res.json({ ok: true, reply });
      } catch (err) {
        console.error("[companyOs] /marketing/pending-publish/:id/skip failed:", err);
        res.status(500).json({ ok: false, message: "Internal error" });
      }
    },
  );

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

  // Edit the freeform `notes` and/or override the lifecycle `status` for a
  // single lead from the admin page. Anything else (score, email, …) is
  // owned by the agent and intentionally not exposed here.
  const leadStatusEnum = z.enum([
    "new",
    "active",
    "engaged",
    "re_engaged",
    "converted",
    "dormant",
  ]);
  const leadPatchSchema = z
    .object({
      notes: z.string().max(4000).nullable().optional(),
      status: leadStatusEnum.optional(),
    })
    .refine((v) => v.notes !== undefined || v.status !== undefined, {
      message: "Provide at least one of: notes, status",
    });

  router.patch("/sales/leads/:id", opts.requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      if (!id) return res.status(400).json({ ok: false, message: "Missing id" });
      const parsed = leadPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid body" });
      }
      const updated = await updateLead(id, parsed.data);
      if (!updated) return res.status(404).json({ ok: false, message: "Lead not found" });
      res.json({ ok: true, lead: updated });
    } catch (err) {
      console.error("[companyOs] PATCH /sales/leads/:id failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  // POST /sales/leads/:id/re-engage — founder-driven, single-lead trigger
  // for the same draft+send+record-event pipeline used by the daily cron
  // campaign. The optional `force` flag bypasses the 14-day cooldown so
  // the founder can re-send to a recently-emailed lead after fixing a
  // bug or chasing a new conversation.
  const reEngageBodySchema = z
    .object({ force: z.boolean().optional() })
    .partial()
    .optional();

  router.post(
    "/sales/leads/:id/re-engage",
    opts.requireAdmin,
    async (req, res) => {
      try {
        const id = String(req.params.id || "");
        if (!id) {
          return res.status(400).json({ ok: false, message: "Missing id" });
        }
        const parsed = reEngageBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({
            ok: false,
            message: parsed.error.issues[0]?.message ?? "Invalid body",
          });
        }
        const force = !!parsed.data?.force;
        const result = await runReEngagementForLead(id, { force });
        if (result.ok) {
          return res.json({
            ok: true,
            status: result.status,
            draftSource: result.draftSource,
            reEngagementSentAt: result.reEngagementSentAt,
          });
        }
        const httpStatus =
          result.status === "skipped_not_found"
            ? 404
            : result.status === "skipped_send_failed"
              ? 502
              : 409;
        return res.status(httpStatus).json({
          ok: false,
          status: result.status,
          message: result.message,
        });
      } catch (err) {
        console.error("[companyOs] POST /sales/leads/:id/re-engage failed:", err);
        res.status(500).json({ ok: false, message: "Internal error" });
      }
    },
  );

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
    language: z.enum(["en", "ar", "bilingual"]).optional(),
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
      const { document, signedUrl, signingUrls } = await generateContract(parsed);
      res.json({
        ok: true,
        document,
        signedUrl,
        signingUrls,
        ttlSec: CONTRACT_SIGNED_URL_TTL_SEC,
      });
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

  router.get("/legal/dispute-summaries", opts.requireAdmin, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 12);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 12;
      const summaries = await getRecentDisputeSummaries(limit);
      res.json({
        count: summaries.length,
        summaries: summaries.map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
          hasPdf: Boolean(s.objectStorageKey),
        })),
      });
    } catch (err) {
      console.error("[companyOs] /legal/dispute-summaries failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.get("/legal/dispute-summaries/:id/pdf", opts.requireAdmin, async (req, res) => {
    try {
      const doc = await getDisputeSummaryById(String(req.params.id));
      if (!doc) return res.status(404).json({ message: "Dispute summary not found" });
      if (!doc.objectStorageKey) {
        return res
          .status(404)
          .json({ message: "Dispute summary has no PDF (generation may have failed)" });
      }
      // 1h TTL for the dashboard download — admins are already logged in
      // and don't need a long-lived link.
      const url = await getSignedDownloadUrl(doc.objectStorageKey, 60 * 60);
      res.json({ url });
    } catch (err) {
      console.error("[companyOs] /legal/dispute-summaries/:id/pdf failed:", err);
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

  // ---------------------------------------------------------------------------
  // Recent agent failures (admin dashboard panel).
  //   • GET  /dashboard/failures[?hours=24]
  //       Returns `{ count, hours, groups: [{ agentName, opName, count,
  //       lastErrorMessage, lastSeenAt, snoozedUntil }, …] }`.
  //   • POST /dashboard/failures/snooze
  //       Body `{ agentName, opName, hours? }` — writes a memory row the
  //       retry helper consults to skip paging the founder for that
  //       group until the snooze expires. `hours` defaults to 1 and is
  //       clamped 1–168 by the underlying helper.
  // ---------------------------------------------------------------------------
  router.get("/dashboard/failures", opts.requireAdmin, async (req, res) => {
    try {
      const hoursRaw = Number(req.query.hours ?? 24);
      const hours = Number.isFinite(hoursRaw) ? Math.max(1, Math.min(168, hoursRaw)) : 24;
      const groups = await getRecentFailures(hours);
      res.json({ count: groups.length, hours, groups });
    } catch (err) {
      console.error("[companyOs] /dashboard/failures failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.post("/dashboard/failures/snooze", opts.requireAdmin, async (req, res) => {
    try {
      const agentName = String(req.body?.agentName ?? "").trim();
      const opName = String(req.body?.opName ?? "").trim();
      if (!agentName || !opName) {
        return res
          .status(400)
          .json({ ok: false, message: "agentName and opName are required" });
      }
      const hoursRaw = Number(req.body?.hours ?? 1);
      const hours = Number.isFinite(hoursRaw) ? Math.max(1, Math.min(168, hoursRaw)) : 1;
      const r = await snoozeFailureGroup(agentName, opName, hours);
      res.json({ ok: true, agentName, opName, hours, ...r });
    } catch (err) {
      console.error("[companyOs] /dashboard/failures/snooze failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Memory Agent — admin surface. Founder-only via requireAdmin.
  //   • GET    /memory[?agent=&type=&limit=]  — list rows, hot rows first.
  //   • DELETE /memory/:id                    — delete one memory by PK.
  // The list never throws (returns [] on DB failure); the delete returns
  // 404 when nothing matched so dashboards can render the right toast.
  // ---------------------------------------------------------------------------
  router.get("/memory", opts.requireAdmin, async (req, res) => {
    try {
      const agent = typeof req.query.agent === "string" ? req.query.agent : undefined;
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const limitRaw = Number(req.query.limit ?? 100);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100;
      const rows = await listMemories({ agent, type, limit });
      res.json({ count: rows.length, memories: rows });
    } catch (err) {
      console.error("[companyOs] /memory failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.delete("/memory/:id", opts.requireAdmin, async (req, res) => {
    try {
      const ok = await deleteMemoryById(String(req.params.id || ""));
      if (!ok) return res.status(404).json({ ok: false, message: "Not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[companyOs] DELETE /memory/:id failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Intelligence Agent — anomaly alerts. Founder-only via requireAdmin.
  //   • GET  /alerts[?status=open|acked|all&limit=]  — list rows.
  //   • POST /alerts/:id/ack                         — mark one acknowledged.
  //   • POST /alerts/snooze                          — 24h non-critical snooze.
  //   • POST /alerts/sweep                           — manual sweep trigger.
  //   • GET  /alerts/budgets                         — per-agent AED caps + MTD spend.
  // The list never throws (returns [] on DB failure); ack returns 404 when
  // the alert prefix doesn't match any open row so dashboards can render
  // the right toast.
  // ---------------------------------------------------------------------------
  router.get("/alerts", opts.requireAdmin, async (req, res) => {
    try {
      const statusRaw = String(req.query.status ?? "open");
      const allowedStatuses = ["open", "acked", "all"] as const;
      type AlertStatus = typeof allowedStatuses[number];
      const status: AlertStatus = (allowedStatuses as readonly string[]).includes(statusRaw)
        ? (statusRaw as AlertStatus)
        : "open";
      const limitRaw = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
      const [alerts, snoozedUntil] = await Promise.all([
        getRecentAlerts({ status, limit }),
        getAlertsSnoozedUntil(),
      ]);
      res.json({
        count: alerts.length,
        snoozedUntil: snoozedUntil ? snoozedUntil.toISOString() : null,
        alerts,
      });
    } catch (err) {
      console.error("[companyOs] /alerts failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  router.post("/alerts/:id/ack", opts.requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const ack = await acknowledgeAlert(id);
      if (!ack) return res.status(404).json({ ok: false, message: "No open alert matched" });
      res.json({ ok: true, alert: ack });
    } catch (err) {
      console.error("[companyOs] POST /alerts/:id/ack failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  router.post("/alerts/snooze", opts.requireAdmin, async (req, res) => {
    try {
      const hoursRaw = Number(req.body?.hours ?? 24);
      const hours = Number.isFinite(hoursRaw) ? Math.max(1, Math.min(168, hoursRaw)) : 24;
      const until = await snoozeAlerts(hours);
      res.json({ ok: true, snoozedUntil: until.toISOString() });
    } catch (err) {
      console.error("[companyOs] /alerts/snooze failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  router.post("/alerts/sweep", opts.requireAdmin, async (_req, res) => {
    try {
      const result = await runIntelligenceSweep();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[companyOs] /alerts/sweep failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  router.get("/alerts/budgets", opts.requireAdmin, async (_req, res) => {
    try {
      const verdicts = await getAllAgentSpendsAed();
      res.json({ count: verdicts.length, verdicts });
    } catch (err) {
      console.error("[companyOs] /alerts/budgets failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  // Persist a per-agent monthly cap override and refresh the in-memory
  // cache used by the LLM gate. Body shape: `{ monthlyCapAed: number }`
  // — a positive finite number, capped at 5,000 AED so a typo can't
  // silently disable the per-agent gate. Returns the canonical agent
  // name + applied cap so the client can re-render under the same
  // identity it already shows.
  router.patch("/alerts/budgets/:agent", opts.requireAdmin, async (req, res) => {
    try {
      const agent = String(req.params.agent || "").trim();
      if (!agent) return res.status(400).json({ message: "Agent name required" });
      const raw = Number(req.body?.monthlyCapAed);
      if (!Number.isFinite(raw) || raw <= 0) {
        return res.status(400).json({ message: "monthlyCapAed must be a positive number" });
      }
      if (raw > 5000) {
        return res
          .status(400)
          .json({ message: "monthlyCapAed must be 5000 AED or less" });
      }
      const result = await setAgentBudgetOverride(agent, raw);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[companyOs] PATCH /alerts/budgets/:agent failed:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Board Report Agent — admin surface. Founder-only via requireAdmin.
  //   • GET    /board-reports                 — last 12 months, newest first.
  //   • POST   /board-reports/generate        — trigger now (?month=YYYY-MM).
  //   • GET    /board-reports/:month/pdf      — signed download URL.
  // The list never throws (returns [] on DB failure); the PDF endpoint
  // returns 404 when no row matches so the dashboard can render the
  // right toast.
  // ---------------------------------------------------------------------------
  router.get("/board-reports", opts.requireAdmin, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit ?? 12);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(120, limitRaw)) : 12;
      const rows = await getRecentReports(limit);
      res.json({ count: rows.length, reports: rows });
    } catch (err) {
      console.error("[companyOs] /board-reports failed:", err);
      res.status(500).json({ count: 0, reports: [], message: "Internal error" });
    }
  });

  router.post("/board-reports/generate", opts.requireAdmin, async (req, res) => {
    try {
      const monthRaw = (req.query.month as string | undefined) ?? (req.body?.month as string | undefined);
      if (monthRaw) {
        try {
          parseReportMonth(monthRaw);
        } catch (err) {
          return res.status(400).json({ ok: false, message: (err as Error).message });
        }
      }
      const result = await generateMonthlyReport(monthRaw);
      res.json({
        ok: true,
        report: result.report,
        signedUrl: result.signedUrl,
        truncated: result.truncated,
      });
    } catch (err) {
      console.error("[companyOs] /board-reports/generate failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  router.get("/board-reports/:month/pdf", opts.requireAdmin, async (req, res) => {
    try {
      const month = String(req.params.month || "");
      try {
        parseReportMonth(month);
      } catch (err) {
        return res.status(400).json({ ok: false, message: (err as Error).message });
      }
      const row = await getReportByMonth(month);
      if (!row || !row.objectStorageKey) {
        return res.status(404).json({ ok: false, message: "Not found" });
      }
      const url = await getSignedDownloadUrl(row.objectStorageKey, BOARD_REPORT_SIGNED_URL_TTL_SEC);
      res.json({ ok: true, signedUrl: url, expiresInSec: BOARD_REPORT_SIGNED_URL_TTL_SEC });
    } catch (err) {
      console.error("[companyOs] /board-reports/:month/pdf failed:", err);
      res.status(500).json({ ok: false, message: "Internal error" });
    }
  });

  return router;
}
