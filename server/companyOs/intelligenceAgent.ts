// Intelligence Agent — heuristic anomaly watcher for the Company OS.
//
// Every detector is a cheap (LIMIT-bounded) SQL aggregate that returns
// either `null` (nothing notable) or a structured alert. The sweep runs
// each detector, inserts new alerts via `onConflictDoNothing` against a
// (alertType, dayKey) unique index — same-day repeats are silent —
// and pings the founder over WhatsApp once per *newly* inserted alert.
//
// Architectural rules:
//   • All detector reads are wrapped in `safe()` so a single broken
//     query can't kill the sweep.
//   • Optional natural-language alert wording is applied via
//     `maybePolishBody()` — it calls `chatCompletion({ agentName:
//     "intelligenceAgent" })` only when `isAgentBudgetSafe(
//     'intelligenceAgent')` is true; otherwise we keep the static body.
//   • Snooze is a single global flag stored as an `agentMemory` row
//     under `intelligenceAgent` / `preference` / `alerts_snoozed_until`.
//     Critical alerts ignore the snooze; warnings + info honour it.

import { and, desc, eq, gte, lt, sql, count, isNull, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  proactiveAlerts,
  reports,
  deals,
  users,
  financeSnapshots,
  listings,
  type ProactiveAlert,
} from "@shared/schema";
import { notifyFounder } from "./twilio";
import { logLlmCall, isAgentBudgetSafe, getBudgetVerdict } from "./costTracker";
import { recallByKey, remember } from "./memoryAgent";
import { chatCompletion } from "../agents/llm";
import { sendCriticalAlertEmail } from "../emailService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = "info" | "warning" | "critical";

export interface DetectorResult {
  alertType: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  dataJson: Record<string, unknown>;
}

export interface SweepResult {
  ranAt: string;
  detectorsRun: number;
  newAlerts: ProactiveAlert[];
  /** Total alerts that reached the founder via *any* channel (WhatsApp or email fallback). */
  notified: number;
  /** Critical alerts that fell back to the founder email after WhatsApp returned false. */
  notifiedViaEmail: number;
  /** Critical alerts where both WhatsApp and the email fallback failed (or email was unconfigured). */
  notifyFailures: number;
  skippedSnoozed: number;
  errors: string[];
}

const SNOOZE_AGENT = "intelligenceAgent";
const SNOOZE_TYPE = "preference";
const SNOOZE_KEY = "alerts_snoozed_until";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safe<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.warn(`[companyOs.intelligence] ${label} failed:`, err);
    return fallback;
  }
}

function utcDayKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400 * 1000);
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Snooze (24h, non-critical only)
// ---------------------------------------------------------------------------

export async function snoozeAlerts(hours = 24): Promise<Date> {
  const until = new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);
  await remember({
    agentName: SNOOZE_AGENT,
    memoryType: SNOOZE_TYPE,
    key: SNOOZE_KEY,
    value: { untilIso: until.toISOString(), hours },
    confidence: 1,
  });
  return until;
}

export async function getAlertsSnoozedUntil(): Promise<Date | null> {
  const m = await recallByKey(SNOOZE_AGENT, SNOOZE_TYPE, SNOOZE_KEY);
  if (!m || !m.value) return null;
  const v = m.value as { untilIso?: string };
  if (!v.untilIso) return null;
  const d = new Date(v.untilIso);
  if (Number.isNaN(d.getTime())) return null;
  return d > new Date() ? d : null;
}

export async function isAlertsSnoozed(): Promise<boolean> {
  return (await getAlertsSnoozedUntil()) !== null;
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/**
 * Sum revenue from `finance_snapshots` between two YYYY-MM-DD bounds,
 * inclusive. Returns 0 on missing data so the WoW comparison stays
 * defined — the calling detector treats "no data" as not actionable.
 */
async function sumRevenueWindow(startDate: string, endDate: string): Promise<number> {
  const rows = await db
    .select({
      total: sql<string>`COALESCE(SUM(${financeSnapshots.totalRevenueAed}), 0)`,
    })
    .from(financeSnapshots)
    .where(
      and(
        gte(financeSnapshots.snapshotDate, startDate),
        sql`${financeSnapshots.snapshotDate} <= ${endDate}`,
      ),
    );
  return asNumber(rows[0]?.total);
}

function dateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function detectRevenueDropWoW(): Promise<DetectorResult | null> {
  const today = new Date();
  const last7End = dateString(today);
  const last7Start = dateString(new Date(today.getTime() - 6 * 86400 * 1000));
  const prev7End = dateString(new Date(today.getTime() - 7 * 86400 * 1000));
  const prev7Start = dateString(new Date(today.getTime() - 13 * 86400 * 1000));

  const [last, prev] = await Promise.all([
    safe(sumRevenueWindow(last7Start, last7End), 0, "revenueDrop.last"),
    safe(sumRevenueWindow(prev7Start, prev7End), 0, "revenueDrop.prev"),
  ]);

  // Need a non-trivial baseline before we can flag a drop, otherwise we'd
  // alert on a free-launch period turning into another free-launch period.
  if (prev <= 5) return null;
  const dropPct = (prev - last) / prev;
  if (dropPct < 0.3) return null;

  return {
    alertType: "revenue_drop_wow",
    severity: "critical",
    title: "Revenue dropped sharply week-over-week",
    body: `Last 7d revenue is AED ${last.toFixed(2)} vs AED ${prev.toFixed(2)} the prior 7 days — a ${(dropPct * 100).toFixed(1)}% drop.`,
    dataJson: {
      last7Aed: Number(last.toFixed(2)),
      prev7Aed: Number(prev.toFixed(2)),
      dropPct: Number(dropPct.toFixed(4)),
      last7Window: { start: last7Start, end: last7End },
      prev7Window: { start: prev7Start, end: prev7End },
    },
  };
}

export async function detectDisputeSpikeWoW(): Promise<DetectorResult | null> {
  const last7 = daysAgo(7);
  const prev14 = daysAgo(14);

  const [lastRows, prevRows] = await Promise.all([
    safe(
      db
        .select({ c: count() })
        .from(reports)
        .where(gte(reports.createdAt, last7)),
      [{ c: 0 }],
      "disputeSpike.last",
    ),
    safe(
      db
        .select({ c: count() })
        .from(reports)
        .where(and(gte(reports.createdAt, prev14), lt(reports.createdAt, last7))),
      [{ c: 0 }],
      "disputeSpike.prev",
    ),
  ]);
  const last = asNumber(lastRows[0]?.c);
  const prev = asNumber(prevRows[0]?.c);

  // Need ≥3 disputes prior week to declare a "spike"; below that we'd
  // be triggering on noise (1 → 3 is a 200% jump but isn't a spike).
  if (prev < 3) return null;
  const spikePct = (last - prev) / prev;
  if (spikePct < 2.0) return null; // 200%

  return {
    alertType: "dispute_spike_wow",
    severity: "critical",
    title: "Dispute volume spiked week-over-week",
    body: `${last} reports filed in the last 7 days vs ${prev} the prior 7 — a ${(spikePct * 100).toFixed(0)}% spike. Investigate via \`dispute risk\`.`,
    dataJson: {
      last7Reports: last,
      prev7Reports: prev,
      spikePct: Number(spikePct.toFixed(4)),
    },
  };
}

export async function detectAiBurnRate(): Promise<DetectorResult | null> {
  const verdict = await safe(
    getBudgetVerdict(),
    null as null | { spentAed: number; budgetAed: number },
    "aiBurn.verdict",
  );
  if (!verdict || verdict.budgetAed <= 0) return null;

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // Need at least 3 days of data to project, otherwise the run-rate is
  // meaningless (one heavy minute on day 1 would scream "150%").
  if (dayOfMonth < 3) return null;

  const projected = (verdict.spentAed / dayOfMonth) * daysInMonth;
  const projectionPct = projected / verdict.budgetAed;
  if (projectionPct < 1.1) return null;

  return {
    alertType: "ai_burn_projection",
    severity: "warning",
    title: "AI spend is projected to exceed monthly budget",
    body: `Run-rate projects AED ${projected.toFixed(2)} by month-end vs AED ${verdict.budgetAed.toFixed(2)} budget (${(projectionPct * 100).toFixed(0)}% of cap). Day ${dayOfMonth}/${daysInMonth} · MTD AED ${verdict.spentAed.toFixed(2)}.`,
    dataJson: {
      mtdSpentAed: Number(verdict.spentAed.toFixed(2)),
      projectedAed: Number(projected.toFixed(2)),
      budgetAed: Number(verdict.budgetAed.toFixed(2)),
      projectionPct: Number(projectionPct.toFixed(4)),
      dayOfMonth,
      daysInMonth,
    },
  };
}

interface CategoryShareRow {
  name: string;
  c: number;
}

async function topCategoryShare(since: Date | null = null): Promise<{ name: string; share: number; count: number; total: number } | null> {
  // We unnest `listings.categories` (jsonb array) and count tags per
  // category. Optional `since` filters by createdAt for "the last 7 days"
  // window vs "the prior 7 days" comparison.
  let result;
  if (since) {
    result = await db.execute(
      sql`SELECT cat AS name, COUNT(*)::int AS c
        FROM ${listings}, jsonb_array_elements_text(${listings.categories}) AS cat
        WHERE ${listings.createdAt} >= ${since}
        GROUP BY cat
        ORDER BY c DESC
        LIMIT 10`,
    );
  } else {
    result = await db.execute(
      sql`SELECT cat AS name, COUNT(*)::int AS c
        FROM ${listings}, jsonb_array_elements_text(${listings.categories}) AS cat
        WHERE ${listings.isActive} = true
        GROUP BY cat
        ORDER BY c DESC
        LIMIT 10`,
    );
  }
  const rawRows = result as unknown as { rows?: CategoryShareRow[] } | CategoryShareRow[];
  const rows: CategoryShareRow[] = Array.isArray(rawRows)
    ? rawRows
    : (rawRows.rows ?? []);
  if (rows.length === 0) return null;
  const total = rows.reduce((acc, r) => acc + asNumber(r.c), 0);
  if (total <= 0) return null;
  const top = rows[0];
  const cnt = asNumber(top.c);
  return { name: String(top.name ?? ""), share: cnt / total, count: cnt, total };
}

export async function detectHotCategory(): Promise<DetectorResult | null> {
  const last7 = daysAgo(7);
  const prev14 = daysAgo(14);

  const [last, prev] = await Promise.all([
    safe(topCategoryShare(last7), null, "hotCategory.last"),
    safe(
      db.execute(
        sql`SELECT cat AS name, COUNT(*)::int AS c
          FROM ${listings}, jsonb_array_elements_text(${listings.categories}) AS cat
          WHERE ${listings.createdAt} >= ${prev14} AND ${listings.createdAt} < ${last7}
          GROUP BY cat
          ORDER BY c DESC
          LIMIT 10`,
      ).then((r) => {
        const raw = r as unknown as { rows?: CategoryShareRow[] } | CategoryShareRow[];
        const rows = Array.isArray(raw) ? raw : (raw.rows ?? []);
        if (rows.length === 0) return null;
        const total = rows.reduce((acc, x) => acc + asNumber(x.c), 0);
        if (total <= 0) return null;
        // Build a name→share map so we can look up `last.name` regardless
        // of whether it was the *previous* week's #1.
        const map = new Map<string, number>();
        for (const x of rows) map.set(String(x.name ?? ""), asNumber(x.c) / total);
        return map;
      }),
      null,
      "hotCategory.prev",
    ),
  ]);

  if (!last) return null;
  // Need a baseline week's worth of data; otherwise we'd alert on the
  // first listing in any new category.
  if (last.total < 5) return null;
  const prevShare = prev?.get(last.name) ?? 0;
  const delta = last.share - prevShare;
  if (delta < 0.25) return null;

  return {
    alertType: "hot_category",
    severity: "info",
    title: `🔥 ${last.name || "(uncategorised)"} is heating up`,
    body: `${last.name || "(uncategorised)"} now makes up ${(last.share * 100).toFixed(0)}% of new listings (was ${(prevShare * 100).toFixed(0)}% prior week, +${(delta * 100).toFixed(0)} pts). Worth a marketing push.`,
    dataJson: {
      category: last.name,
      lastShare: Number(last.share.toFixed(4)),
      prevShare: Number(prevShare.toFixed(4)),
      deltaPts: Number((delta * 100).toFixed(2)),
      lastListingsTotal: last.total,
    },
  };
}

export async function detectZeroDeals48h(): Promise<DetectorResult | null> {
  const since48h = daysAgo(2);
  const since7d = daysAgo(7);

  const [dealsRows, activeRows] = await Promise.all([
    safe(
      db
        .select({ c: count() })
        .from(deals)
        .where(and(eq(deals.state, "completed"), gte(deals.updatedAt, since48h))),
      [{ c: 0 }],
      "zeroDeals.dealsCount",
    ),
    safe(
      db
        .select({ c: count() })
        .from(users)
        .where(gte(users.lastActiveAt, since7d)),
      [{ c: 0 }],
      "zeroDeals.activeCount",
    ),
  ]);

  const completed48h = asNumber(dealsRows[0]?.c);
  const active7d = asNumber(activeRows[0]?.c);
  if (completed48h > 0) return null;
  if (active7d <= 100) return null;

  return {
    alertType: "zero_deals_48h",
    severity: "warning",
    title: "Zero completed deals in the last 48 hours",
    body: `No completed deals in 48h despite ${active7d} active users in the last 7 days. Worth checking the deal funnel.`,
    dataJson: {
      completedDeals48h: completed48h,
      activeUsers7d: active7d,
    },
  };
}

const DETECTORS: Array<() => Promise<DetectorResult | null>> = [
  detectRevenueDropWoW,
  detectDisputeSpikeWoW,
  detectAiBurnRate,
  detectHotCategory,
  detectZeroDeals48h,
];

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

function severityIcon(s: AlertSeverity): string {
  if (s === "critical") return "🚨";
  if (s === "warning") return "⚠️";
  return "ℹ️";
}

function shortId(id: string): string {
  return (id || "").slice(0, 8);
}

export function formatAlertForWhatsApp(alert: ProactiveAlert): string {
  return [
    `${severityIcon(alert.severity as AlertSeverity)} *${alert.title}*`,
    alert.body,
    "",
    `id: ${shortId(alert.id)} · type: ${alert.alertType}`,
    `Ack with \`ack ${shortId(alert.id)}\``,
  ].join("\n");
}

/**
 * Optionally rewrite a detector's static body into a tighter, more
 * conversational sentence — but only when the per-agent budget for the
 * Intelligence Agent is safe (so a runaway agent can't burn through
 * the cap polishing alerts). On any failure (cap breached, network,
 * malformed response) we return the original detector unchanged so
 * the sweep still pages the founder.
 */
async function maybePolishBody(detector: DetectorResult): Promise<DetectorResult> {
  try {
    const safe = await isAgentBudgetSafe("intelligenceAgent");
    if (!safe) return detector;
    const { content } = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You re-word ops alerts for the Bareter founder. Keep the SAME numbers and SAME meaning. Output one or two short sentences (≤ 240 chars). No markdown, no preamble.",
        },
        {
          role: "user",
          content: `Re-word this alert body:\n\n${detector.body}`,
        },
      ],
      {
        agentName: "intelligenceAgent",
        command: `polish:${detector.alertType}`,
        temperature: 0.3,
        maxTokens: 160,
      },
    );
    const cleaned = (content || "").trim();
    // Guardrails: skip the polish if the LLM returned the budget
    // fallback, an empty string, or something suspiciously long.
    if (!cleaned) return detector;
    if (cleaned.startsWith("_(AI budget for ")) return detector;
    if (cleaned.length > 400) return detector;
    return { ...detector, body: cleaned };
  } catch (err) {
    console.warn("[companyOs.intelligence] maybePolishBody failed:", err);
    return detector;
  }
}

/**
 * Insert a single alert if no row already exists for (alertType, dayKey).
 * Returns the inserted row, or null if a duplicate already existed.
 */
async function insertIfNew(detector: DetectorResult): Promise<ProactiveAlert | null> {
  const dayKey = utcDayKey();
  try {
    const inserted = await db
      .insert(proactiveAlerts)
      .values({
        alertType: detector.alertType,
        severity: detector.severity,
        title: detector.title,
        body: detector.body,
        dataJson: detector.dataJson,
        dayKey,
      })
      .onConflictDoNothing({ target: [proactiveAlerts.alertType, proactiveAlerts.dayKey] })
      .returning();
    return inserted[0] ?? null;
  } catch (err) {
    console.error("[companyOs.intelligence] insertIfNew failed:", err);
    return null;
  }
}

export async function runIntelligenceSweep(): Promise<SweepResult> {
  const ranAt = new Date().toISOString();
  const result: SweepResult = {
    ranAt,
    detectorsRun: 0,
    newAlerts: [],
    notified: 0,
    notifiedViaEmail: 0,
    notifyFailures: 0,
    skippedSnoozed: 0,
    errors: [],
  };

  const snoozedUntil = await getAlertsSnoozedUntil();

  for (const detector of DETECTORS) {
    result.detectorsRun += 1;
    let detected: DetectorResult | null = null;
    try {
      detected = await detector();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${detector.name}: ${msg}`);
      console.error(`[companyOs.intelligence] detector ${detector.name} threw:`, err);
      continue;
    }
    if (!detected) continue;

    // Optional natural-language polish on the detector's static body —
    // gated on the per-agent budget. If the cap is breached we skip the
    // LLM call entirely and use the static body. Failures (network,
    // OpenAI hiccups) also fall through silently.
    detected = await maybePolishBody(detected);

    const inserted = await insertIfNew(detected);
    if (!inserted) continue; // dedupe: same (type, day) already alerted

    result.newAlerts.push(inserted);

    // Critical alerts always notify; warnings + info honour the snooze.
    const isCritical = inserted.severity === "critical";
    if (snoozedUntil && !isCritical) {
      result.skippedSnoozed += 1;
      continue;
    }
    const sent = await notifyFounder(formatAlertForWhatsApp(inserted)).catch((err) => {
      console.error("[companyOs.intelligence] notifyFounder failed:", err);
      return false;
    });
    if (sent) {
      result.notified += 1;
      console.log(
        `[companyOs.intelligence] alert ${shortId(inserted.id)} (${inserted.alertType}) notifiedVia=whatsapp`,
      );
      continue;
    }

    // WhatsApp failed. For *critical* alerts, fall back to email so the
    // founder is paged via at least one channel — warnings + info stay
    // WhatsApp-only because they're already noisy and the dashboard
    // surface catches them.
    if (!isCritical) {
      result.notifyFailures += 1;
      console.warn(
        `[companyOs.intelligence] alert ${shortId(inserted.id)} (${inserted.alertType}) notifiedVia=none (non-critical, no email fallback)`,
      );
      continue;
    }

    const founderEmail = process.env.FOUNDER_EMAIL?.trim();
    if (!founderEmail) {
      result.notifyFailures += 1;
      console.warn(
        `[companyOs.intelligence] alert ${shortId(inserted.id)} (${inserted.alertType}) notifiedVia=none (FOUNDER_EMAIL not set)`,
      );
      continue;
    }

    const emailed = await sendCriticalAlertEmail(founderEmail, {
      title: inserted.title,
      body: inserted.body,
      alertType: inserted.alertType,
      alertId: inserted.id,
    }).catch((err) => {
      console.error(
        "[companyOs.intelligence] sendCriticalAlertEmail failed:",
        err,
      );
      return false;
    });
    if (emailed) {
      result.notified += 1;
      result.notifiedViaEmail += 1;
      console.log(
        `[companyOs.intelligence] alert ${shortId(inserted.id)} (${inserted.alertType}) notifiedVia=email (whatsapp fallback)`,
      );
    } else {
      result.notifyFailures += 1;
      console.error(
        `[companyOs.intelligence] alert ${shortId(inserted.id)} (${inserted.alertType}) notifiedVia=none (whatsapp + email both failed)`,
      );
    }
  }

  // Audit row so the OS log surface shows when the watcher last ran.
  await logLlmCall({
    agentName: "intelligenceAgent",
    command: "sweep",
    inputPreview: `detectors=${result.detectorsRun} snoozed=${snoozedUntil ? snoozedUntil.toISOString() : "no"}`,
    outputPreview: `new=${result.newAlerts.length} notified=${result.notified} viaEmail=${result.notifiedViaEmail} failed=${result.notifyFailures} skipped=${result.skippedSnoozed} errors=${result.errors.length}`,
    tokensUsed: 0,
    status: result.errors.length === 0 ? "ok" : "error",
    errorMessage: result.errors.length === 0 ? null : result.errors.join("; "),
  });

  return result;
}

// ---------------------------------------------------------------------------
// Read / ack helpers — used by the WhatsApp commands and HTTP routes
// ---------------------------------------------------------------------------

export interface ListAlertsOpts {
  /** "open" (default) returns only un-acked rows; "all" returns everything; "acked" returns only acked. */
  status?: "open" | "all" | "acked";
  limit?: number;
}

export async function getRecentAlerts(opts: ListAlertsOpts = {}): Promise<ProactiveAlert[]> {
  const cap = Math.max(1, Math.min(200, opts.limit ?? 50));
  const status = opts.status ?? "open";
  try {
    const baseQuery = db
      .select()
      .from(proactiveAlerts)
      .$dynamic();
    const filtered =
      status === "all"
        ? baseQuery
        : status === "acked"
          ? baseQuery.where(sql`${proactiveAlerts.acknowledgedAt} IS NOT NULL`)
          : baseQuery.where(isNull(proactiveAlerts.acknowledgedAt));
    return await filtered.orderBy(desc(proactiveAlerts.createdAt)).limit(cap);
  } catch (err) {
    console.warn("[companyOs.intelligence] getRecentAlerts failed:", err);
    return [];
  }
}

/**
 * Acknowledge an alert by full UUID or by the 8-char short-id used in
 * WhatsApp messages. Returns the updated row, or null if no match.
 */
export async function acknowledgeAlert(idOrPrefix: string): Promise<ProactiveAlert | null> {
  const cleaned = (idOrPrefix || "").trim();
  if (!cleaned) return null;
  try {
    const where = cleaned.length >= 32
      ? eq(proactiveAlerts.id, cleaned)
      : sql`${proactiveAlerts.id} LIKE ${cleaned + "%"}`;

    // Match candidate rows first so we don't accidentally ack a previously
    // acked alert with the same prefix.
    const candidates = await db
      .select({ id: proactiveAlerts.id, ack: proactiveAlerts.acknowledgedAt })
      .from(proactiveAlerts)
      .where(where)
      .limit(2);
    const open = candidates.filter((r) => r.ack === null);
    if (open.length === 0) return null;
    if (open.length > 1) {
      // Ambiguous prefix — caller should retry with more characters.
      console.warn("[companyOs.intelligence] acknowledgeAlert ambiguous prefix:", cleaned);
      return null;
    }
    const updated = await db
      .update(proactiveAlerts)
      .set({ acknowledgedAt: new Date() })
      .where(eq(proactiveAlerts.id, open[0].id))
      .returning();
    return updated[0] ?? null;
  } catch (err) {
    console.error("[companyOs.intelligence] acknowledgeAlert failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// WhatsApp surface — formatting + command parsers (called from managerAgent).
// ---------------------------------------------------------------------------

export async function formatAlertsListForWhatsApp(): Promise<string> {
  const open = await getRecentAlerts({ status: "open", limit: 10 });
  const lines: string[] = ["*Active alerts*"];
  if (open.length === 0) {
    const snoozed = await getAlertsSnoozedUntil();
    lines.push("No open alerts.");
    if (snoozed) {
      lines.push(`(non-critical alerts snoozed until ${snoozed.toISOString()})`);
    }
    return lines.join("\n");
  }
  for (const a of open) {
    lines.push("");
    lines.push(`${severityIcon(a.severity as AlertSeverity)} *${a.title}*  · id ${shortId(a.id)}`);
    lines.push(a.body);
  }
  lines.push("");
  lines.push("_Ack:_ `ack <id-prefix>`  ·  _Snooze non-critical 24h:_ `quiet alerts`");
  return lines.join("\n");
}

export function parseAckCommand(text: string): string | null {
  const m = (text || "").trim().match(/^ack\s+([0-9a-fA-F-]{4,})$/);
  if (!m) return null;
  return m[1];
}

/**
 * Used by `getRecentAlerts({ status: 'open' })` callers that want to
 * resolve an opaque prefix to one of the open alerts. Exposed for
 * tests + the HTTP `POST /alerts/:id/ack` route.
 */
export async function resolveOpenAlertByPrefix(prefix: string): Promise<ProactiveAlert | null> {
  const cleaned = (prefix || "").trim();
  if (!cleaned) return null;
  try {
    const rows = await db
      .select()
      .from(proactiveAlerts)
      .where(
        and(
          isNull(proactiveAlerts.acknowledgedAt),
          cleaned.length >= 32
            ? eq(proactiveAlerts.id, cleaned)
            : sql`${proactiveAlerts.id} LIKE ${cleaned + "%"}`,
        ),
      )
      .limit(2);
    if (rows.length === 1) return rows[0];
    return null;
  } catch (err) {
    console.warn("[companyOs.intelligence] resolveOpenAlertByPrefix failed:", err);
    return null;
  }
}

// Re-exported for the WhatsApp `quiet alerts` flow + tests.
export { isAgentBudgetSafe };

// `inArray` re-exported keeps imports tidy if a caller needs it.
export const _internal = { inArray };
