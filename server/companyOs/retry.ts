// Self-healing retry helper for the Company OS.
//
// `withRetry(fn, opts)` runs `fn` and retries on transient failures
// (HTTP 429, HTTP 5xx, network errors) with exponential backoff
// (1s → 2s → 4s by default). Terminal errors (4xx other than 429)
// short-circuit on the first attempt — there's no point hammering
// the API with a known-bad request.
//
// Failures are NEVER swallowed silently:
//   • Every failed attempt logs to the console AND writes a row to
//     `companyOsLogs` with `command: "retry"` and the original error
//     in `errorMessage`. Intermediate (will-retry) attempts use
//     `status: "warning"` so the dashboard doesn't paint them as
//     terminal failures, while the FINAL attempt uses `status:
//     "error"` so they bubble up in error-only filters.
//   • The same final-failure row appears whether we exhausted the
//     retry budget on a transient class or short-circuited on a
//     terminal error (4xx other than 408/425/429) on attempt 1, so
//     the founder can see retry-driven failures alongside other
//     agent activity in the dashboard / `agents` WhatsApp command.
//   • For critical paths (Twilio outbound, OpenAI completions,
//     Object Storage uploads), final failures ALSO page the founder
//     on WhatsApp so production outages aren't invisible until
//     someone opens the dashboard. Pages are de-duplicated per
//     agent+op within a 1-hour window so a flapping API can't spam
//     the founder. Callers can opt-in explicitly via
//     `paging: "founder"` or opt-out via `paging: "none"`.
//
// This is the architectural rule the spec calls out: "the retry
// helper must NEVER swallow errors silently". The helper still
// re-throws after logging so the caller can decide whether to
// degrade gracefully (e.g. notifyFounder returning false) or bubble
// up.

import { db } from "../db";
import { companyOsLogs } from "@shared/schema";

export interface WithRetryOptions {
  /** Total attempts = retries + 1. Default: 3 retries (4 total attempts). */
  retries?: number;
  /** Base delay in ms — doubled each retry. Default 1000ms. */
  baseMs?: number;
  /**
   * Agent name recorded on the final-failure log row. Defaults to
   * "retry" so unattributed failures still appear in the logs.
   */
  agentName?: string;
  /**
   * Short label for what we were doing (e.g. "twilio.send",
   * "openai.chat"). Recorded as the input preview on the failure
   * log row.
   */
  opName?: string;
  /**
   * Optional override for the retry classifier. Use sparingly —
   * the default classifier already covers HTTP 429, 5xx, and the
   * usual node fetch network errors.
   */
  isRetryable?: (err: unknown) => boolean;
  /**
   * Page-the-founder behaviour on terminal failure (after retries
   * are exhausted or a terminal 4xx short-circuits attempt 1):
   *   • `"founder"` — always page the founder on WhatsApp.
   *   • `"none"`    — never page, even if the agent is on the
   *                    critical-path allow-list.
   *   • `"auto"` (default) — page only if `agentName` or `opName`
   *                    is on the critical-path allow-list (Twilio
   *                    outbound, OpenAI completions, Object Storage
   *                    uploads).
   * Pages are de-duplicated per (agentName, opName) within a 1-hour
   * window so a flapping upstream can't spam the founder.
   */
  paging?: "founder" | "none" | "auto";
}

export interface RetryClassification {
  retryable: boolean;
  reason: string;
}

const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/**
 * Best-effort error classifier. Mirrors what the OpenAI / Twilio
 * SDKs throw, plus standard node fetch / undici error shapes.
 */
export function classifyError(err: unknown): RetryClassification {
  if (err == null) return { retryable: false, reason: "null_error" };
  // Object-shaped errors with a numeric `status` (OpenAI, Twilio,
  // Stripe, fetch Response, etc).
  const anyErr = err as { status?: unknown; statusCode?: unknown; code?: unknown; cause?: unknown; name?: unknown };
  const rawStatus = anyErr.status ?? anyErr.statusCode;
  const status = typeof rawStatus === "number" ? rawStatus : Number(rawStatus);
  if (Number.isFinite(status)) {
    if (status === 408 || status === 425 || status === 429) {
      return { retryable: true, reason: `http_${status}` };
    }
    if (status >= 500 && status < 600) {
      return { retryable: true, reason: `http_${status}` };
    }
    if (status >= 400 && status < 500) {
      return { retryable: false, reason: `http_${status}` };
    }
  }
  const code = typeof anyErr.code === "string" ? anyErr.code : null;
  if (code && NETWORK_ERROR_CODES.has(code)) {
    return { retryable: true, reason: `network_${code}` };
  }
  // `cause` chain — fetch wraps the underlying socket error here.
  if (anyErr.cause && anyErr.cause !== err) {
    return classifyError(anyErr.cause);
  }
  // AbortError from fetch timeouts.
  if (typeof anyErr.name === "string" && anyErr.name === "AbortError") {
    return { retryable: true, reason: "abort" };
  }
  // Plain `Error` with a message hinting at network trouble.
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (
      m.includes("timeout") ||
      m.includes("socket hang up") ||
      m.includes("network") ||
      m.includes("fetch failed")
    ) {
      return { retryable: true, reason: "transient_message" };
    }
  }
  return { retryable: false, reason: "unknown" };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Persist a single retry attempt to companyOsLogs. Intermediate
 * (will-retry) attempts use status="warning"; the final attempt —
 * whether exhausted-transient or short-circuit-terminal — uses
 * status="error". Logging failures are themselves swallowed (with a
 * console line) so we never let an observability outage kill the
 * caller.
 */
async function logAttempt(
  agentName: string,
  opName: string,
  err: unknown,
  attempt: number,
  classification: RetryClassification,
  isFinal: boolean,
): Promise<void> {
  const message = describeError(err);
  try {
    await db.insert(companyOsLogs).values({
      agentName,
      command: "retry",
      inputPreview: `op=${opName} attempt=${attempt} class=${classification.reason}${isFinal ? " final" : ""}`,
      outputPreview: null,
      model: null,
      tokensUsed: 0,
      costAed: "0",
      status: isFinal ? "error" : "warning",
      errorMessage: message.slice(0, 1000),
    });
  } catch (logErr) {
    console.error("[companyOs.retry] logAttempt failed:", logErr);
  }
}

/**
 * Sleep without keeping the event loop alive longer than necessary.
 * Tests can fake-time this via `vi.useFakeTimers()` because we use
 * the global `setTimeout`.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Founder paging on terminal failure (critical-path allow-list)
// ---------------------------------------------------------------------------

/**
 * Agents whose terminal failures warrant an immediate WhatsApp page
 * to the founder. Anything not in this set (and not in
 * `CRITICAL_OPS`) only writes the failure log row.
 */
const CRITICAL_AGENTS = new Set<string>(["twilio", "objectStorage"]);

/**
 * Op names whose terminal failures warrant an immediate page —
 * useful when the agentName varies (e.g. every Company OS sub-agent
 * routes its OpenAI calls through `chatCompletion`, but they all
 * share `opName: "openai.chat"`).
 */
const CRITICAL_OPS = new Set<string>(["openai.chat"]);

const PAGE_DEDUPE_MS = 60 * 60 * 1000; // 1 hour

/**
 * In-memory dedupe map: `${agentName}|${opName}` → last-page epoch
 * ms. A flapping API can otherwise spam the founder if every retry
 * cycle fails terminally; we send at most one page per agent+op per
 * `PAGE_DEDUPE_MS` window. Memory grows with the unique
 * (agent, op) cardinality, which is bounded by the allow-list above.
 */
const pageDedupe = new Map<string, number>();

/**
 * Reset hook for tests. Not exported in the public API surface
 * (callers shouldn't rely on it) but available so unit tests can
 * isolate the dedupe state across cases.
 */
export function _resetPageDedupeForTests(): void {
  pageDedupe.clear();
}

function shouldPage(
  paging: WithRetryOptions["paging"],
  agentName: string,
  opName: string,
): boolean {
  if (paging === "none") return false;
  if (paging === "founder") return true;
  // "auto" / undefined → consult allow-lists.
  return CRITICAL_AGENTS.has(agentName) || CRITICAL_OPS.has(opName);
}

/**
 * True iff a page for `(agentName, opName)` was sent within the
 * dedupe window. Read-only — the timestamp is only recorded after
 * a successful `pageFounder` call (see below) so a transient page
 * failure doesn't suppress the next retry's page for a full hour.
 */
function wasPagedRecently(
  agentName: string,
  opName: string,
  now: number = Date.now(),
): boolean {
  const key = `${agentName}|${opName}`;
  const last = pageDedupe.get(key) ?? 0;
  return now - last < PAGE_DEDUPE_MS;
}

function markPaged(
  agentName: string,
  opName: string,
  now: number = Date.now(),
): void {
  pageDedupe.set(`${agentName}|${opName}`, now);
}

/**
 * Best-effort founder page on terminal failure. Uses a dynamic
 * import of `./twilio` to avoid the circular import (twilio.ts
 * already imports `withRetry` from this module). Failures here are
 * caught and console-logged so they can never bring down the
 * caller — the failure log row was already written by the time we
 * get here. Returns true iff Twilio accepted the page so the caller
 * can decide whether to record the dedupe timestamp.
 */
async function pageFounderOnFinalFailure(
  agentName: string,
  opName: string,
  attempt: number,
  err: unknown,
): Promise<boolean> {
  try {
    const mod = await import("./twilio");
    const body = [
      `🚨 Agent failure`,
      `agent: ${agentName}`,
      `op: ${opName}`,
      `attempts: ${attempt}`,
      `error: ${describeError(err).slice(0, 500)}`,
    ].join("\n");
    return await mod.pageFounder(body);
  } catch (pageErr) {
    console.error("[companyOs.retry] pageFounderOnFinalFailure failed:", pageErr);
    return false;
  }
}

/**
 * Run `fn` with retry + exponential backoff on transient failures.
 * Re-throws the final error so callers retain full control over
 * graceful degradation. Final failures are recorded to companyOsLogs
 * before re-throwing, and (for critical-path agents/ops) page the
 * founder on WhatsApp with a 1-hour dedupe window per agent+op.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOptions = {},
): Promise<T> {
  const retries = Math.max(0, opts.retries ?? 3);
  const baseMs = Math.max(0, opts.baseMs ?? 1000);
  const agentName = opts.agentName || "retry";
  const opName = opts.opName || "op";
  const classify = opts.isRetryable
    ? (e: unknown) => ({ retryable: opts.isRetryable!(e), reason: "custom" })
    : classifyError;

  let attempt = 0;
  // Total attempts = retries + 1.
  for (;;) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      const classification = classify(err);
      const remaining = retries - (attempt - 1);
      const canRetry = classification.retryable && remaining > 0;
      console.warn(
        `[companyOs.retry] ${agentName}/${opName} attempt ${attempt} failed (${classification.reason}): ${describeError(err)}${canRetry ? " — retrying" : ""}`,
      );
      // Per-attempt persistence — final failures use status=error,
      // intermediate (will-retry) attempts use status=warning so the
      // dashboard can filter out the noise without losing the trail.
      await logAttempt(agentName, opName, err, attempt, classification, !canRetry);
      if (!canRetry) {
        // Critical-path failure → page the founder on WhatsApp,
        // de-duplicated per agent+op within a 1-hour window so a
        // flapping upstream can't spam them. Best-effort: any page
        // failure is swallowed (the log row already captured the
        // outage). The dedupe timestamp is only recorded on a
        // SUCCESSFUL page so a transient page-send failure doesn't
        // suppress alerts for a full hour.
        if (shouldPage(opts.paging, agentName, opName)) {
          if (!wasPagedRecently(agentName, opName)) {
            const sent = await pageFounderOnFinalFailure(
              agentName,
              opName,
              attempt,
              err,
            );
            if (sent) markPaged(agentName, opName);
          } else {
            console.log(
              `[companyOs.retry] page suppressed for ${agentName}/${opName} (within 1h dedupe window)`,
            );
          }
        }
        throw err;
      }
      // Exponential: baseMs, 2*baseMs, 4*baseMs, ...
      const delay = baseMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
}
