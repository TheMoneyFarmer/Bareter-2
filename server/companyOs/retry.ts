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

/**
 * Run `fn` with retry + exponential backoff on transient failures.
 * Re-throws the final error so callers retain full control over
 * graceful degradation. Final failures are recorded to companyOsLogs
 * before re-throwing.
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
        throw err;
      }
      // Exponential: baseMs, 2*baseMs, 4*baseMs, ...
      const delay = baseMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
}
