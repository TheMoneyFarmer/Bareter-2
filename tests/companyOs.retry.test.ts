// Unit tests for the self-healing retry helper (Task #67).
//
// Coverage:
//   • `classifyError` — recognises HTTP 408/425/429 + 5xx as retryable,
//     4xx as terminal, network error codes as retryable, AbortError as
//     retryable, plain string-message hints as transient, and unknown
//     errors as terminal.
//   • `withRetry` — succeeds on first try without sleeping; retries
//     transient errors with exponential backoff (1s → 2s → 4s);
//     short-circuits on terminal 4xx (no retries, single attempt);
//     gives up after `retries` attempts; logs final failure to
//     `companyOsLogs` with command="retry" and status="error";
//     re-throws after logging.
//
// All DB writes are captured into a programmable in-memory queue so
// the test runs offline.

import { describe, it, expect, beforeEach, vi, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// DB mock — captures every insert into companyOsLogs so we can assert
// that final failures are surfaced (and successes don't log).
// ---------------------------------------------------------------------------
type AnyRow = Record<string, unknown>;
const inserted: AnyRow[] = [];

vi.mock("../server/db", () => ({
  db: {
    insert: () => ({
      values: (v: AnyRow) => {
        inserted.push({ ...v });
        return { returning: () => Promise.resolve([]) };
      },
    }),
  },
}));

// ---------------------------------------------------------------------------
// memoryAgent mock — `withRetry` consults a per-(agent, op) snooze row
// before paging the founder. The default mock returns `null` (no snooze
// active) so existing paging tests behave as before. Tests that exercise
// the snooze path rewrite `snoozeStore` directly.
// ---------------------------------------------------------------------------
const snoozeStore: Record<string, { value: { untilIso: string; hours: number } } | null> =
  {};
const remembered: Array<{
  agentName: string;
  memoryType: string;
  key: string;
  value: unknown;
}> = [];
vi.mock("../server/companyOs/memoryAgent", () => ({
  recallByKey: vi.fn(async (agentName: string, memoryType: string, key: string) => {
    const m = snoozeStore[`${agentName}|${memoryType}|${key}`];
    return m ?? null;
  }),
  remember: vi.fn(async (entry: {
    agentName: string;
    memoryType: string;
    key: string;
    value: unknown;
  }) => {
    remembered.push(entry);
    snoozeStore[`${entry.agentName}|${entry.memoryType}|${entry.key}`] = {
      value: entry.value as { untilIso: string; hours: number },
    };
    // Mirrors `RememberResult` from server/companyOs/memoryAgent — the
    // snooze writer now propagates `ok: false` as a thrown error so
    // tests must return the same shape as the real helper.
    return { ok: true as const, id: "fake" };
  }),
}));

// ---------------------------------------------------------------------------
// Twilio mock — captures every founder page so we can assert that
// critical-path failures (Task #82) page the founder, non-critical
// failures don't, and dedupe within a 1h window suppresses repeats.
// `pageFounderResponse` lets a single test simulate a transient
// page-send failure to verify the dedupe is NOT recorded on failure.
// ---------------------------------------------------------------------------
const pages: string[] = [];
let pageFounderResponse: boolean | (() => boolean) = true;
vi.mock("../server/companyOs/twilio", () => ({
  pageFounder: vi.fn(async (body: string) => {
    pages.push(body);
    return typeof pageFounderResponse === "function"
      ? pageFounderResponse()
      : pageFounderResponse;
  }),
}));

import {
  withRetry,
  classifyError,
  _resetPageDedupeForTests,
  getFailureGroupSnoozedUntil,
  snoozeFailureGroup,
} from "../server/companyOs/retry";

beforeEach(() => {
  inserted.length = 0;
  pages.length = 0;
  pageFounderResponse = true;
  remembered.length = 0;
  for (const k of Object.keys(snoozeStore)) delete snoozeStore[k];
  _resetPageDedupeForTests();
  vi.useRealTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

// ===========================================================================
// classifyError
// ===========================================================================
describe("classifyError", () => {
  it("classifies HTTP 429 as retryable", () => {
    expect(classifyError({ status: 429 }).retryable).toBe(true);
    expect(classifyError({ statusCode: 429 }).retryable).toBe(true);
  });

  it("classifies HTTP 408 + 425 as retryable", () => {
    expect(classifyError({ status: 408 }).retryable).toBe(true);
    expect(classifyError({ status: 425 }).retryable).toBe(true);
  });

  it("classifies HTTP 5xx as retryable", () => {
    expect(classifyError({ status: 500 }).retryable).toBe(true);
    expect(classifyError({ status: 502 }).retryable).toBe(true);
    expect(classifyError({ status: 503 }).retryable).toBe(true);
    expect(classifyError({ status: 599 }).retryable).toBe(true);
  });

  it("classifies HTTP 4xx (other than 408/425/429) as terminal", () => {
    expect(classifyError({ status: 400 }).retryable).toBe(false);
    expect(classifyError({ status: 401 }).retryable).toBe(false);
    expect(classifyError({ status: 403 }).retryable).toBe(false);
    expect(classifyError({ status: 404 }).retryable).toBe(false);
    expect(classifyError({ status: 422 }).retryable).toBe(false);
  });

  it("classifies network error codes as retryable", () => {
    expect(classifyError({ code: "ECONNRESET" }).retryable).toBe(true);
    expect(classifyError({ code: "ECONNREFUSED" }).retryable).toBe(true);
    expect(classifyError({ code: "ETIMEDOUT" }).retryable).toBe(true);
    expect(classifyError({ code: "ENOTFOUND" }).retryable).toBe(true);
  });

  it("classifies AbortError as retryable", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(classifyError(e).retryable).toBe(true);
  });

  it("walks `cause` chain", () => {
    const inner = Object.assign(new Error("inner"), { code: "ECONNRESET" });
    const outer = Object.assign(new Error("outer"), { cause: inner });
    expect(classifyError(outer).retryable).toBe(true);
  });

  it("classifies fetch-style transient messages as retryable", () => {
    expect(classifyError(new Error("fetch failed")).retryable).toBe(true);
    expect(classifyError(new Error("socket hang up")).retryable).toBe(true);
    expect(classifyError(new Error("Request timeout exceeded")).retryable).toBe(true);
  });

  it("classifies unknown errors as terminal", () => {
    expect(classifyError(new Error("Bad request body")).retryable).toBe(false);
    expect(classifyError({ foo: "bar" }).retryable).toBe(false);
    expect(classifyError(null).retryable).toBe(false);
  });
});

// ===========================================================================
// withRetry — happy path
// ===========================================================================
describe("withRetry — success", () => {
  it("returns the result on the first try without retrying", async () => {
    const fn = vi.fn(async () => 42);
    const out = await withRetry(fn);
    expect(out).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(0);
  });

  it("retries transient failures and eventually returns success", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) {
        const e: any = new Error("rate limited");
        e.status = 429;
        throw e;
      }
      return "ok";
    });
    // baseMs=1 to keep the suite fast.
    const out = await withRetry(fn, { baseMs: 1, agentName: "test", opName: "op" });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    // Each failed (will-retry) attempt must be logged as a warning so
    // the dashboard / WhatsApp `agents` view sees the trail. The two
    // failed attempts here both retry, so both rows are warnings —
    // there is no terminal "error" row because the third call
    // succeeded.
    expect(inserted).toHaveLength(2);
    for (const row of inserted) {
      expect(row.command).toBe("retry");
      expect(row.status).toBe("warning");
      expect(row.agentName).toBe("test");
    }
  });
});

// ===========================================================================
// withRetry — terminal short-circuit
// ===========================================================================
describe("withRetry — terminal failures", () => {
  it("short-circuits on a 4xx without retrying", async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error("bad request");
      e.status = 400;
      throw e;
    });
    await expect(withRetry(fn, { baseMs: 1, agentName: "test", opName: "op" })).rejects.toThrow(
      "bad request",
    );
    expect(fn).toHaveBeenCalledTimes(1);
    // A terminal 4xx short-circuits → exactly one log row, marked
    // as the final error attempt.
    expect(inserted).toHaveLength(1);
    expect(inserted[0].command).toBe("retry");
    expect(inserted[0].status).toBe("error");
    expect(inserted[0].agentName).toBe("test");
    expect(String(inserted[0].errorMessage)).toContain("bad request");
    expect(String(inserted[0].inputPreview)).toMatch(/op=op\s+attempt=1.*final/);
  });

  it("re-throws after exhausting retries on transient failures", async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error("upstream 503");
      e.status = 503;
      throw e;
    });
    await expect(
      withRetry(fn, { retries: 3, baseMs: 1, agentName: "twilio", opName: "send" }),
    ).rejects.toThrow("upstream 503");
    // 3 retries + 1 initial attempt = 4 calls total → 4 log rows
    // (3 warnings, 1 final error).
    expect(fn).toHaveBeenCalledTimes(4);
    expect(inserted).toHaveLength(4);
    const warnings = inserted.filter((r) => r.status === "warning");
    const errors = inserted.filter((r) => r.status === "error");
    expect(warnings).toHaveLength(3);
    expect(errors).toHaveLength(1);
    for (const row of inserted) {
      expect(row.command).toBe("retry");
      expect(row.agentName).toBe("twilio");
    }
    expect(String(errors[0].inputPreview)).toMatch(/op=send\s+attempt=4.*final/);
  });

  it("respects custom `isRetryable` override", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error("transient — but classifier says no");
      return "done";
    });
    // Custom classifier marks everything as retryable.
    const out = await withRetry(fn, {
      baseMs: 1,
      isRetryable: () => true,
    });
    expect(out).toBe("done");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// withRetry — backoff timing
// ===========================================================================
describe("withRetry — exponential backoff", () => {
  it("waits baseMs * 2^(attempt-1) between attempts", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      const e: any = new Error("retry me");
      e.status = 503;
      throw e;
    });
    const promise = withRetry(fn, { retries: 3, baseMs: 1000 }).catch((e) => e);
    // Allow the first attempt to run and schedule its backoff.
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    // Advance 1s → triggers attempt 2
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
    // Advance 2s → triggers attempt 3
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(3);
    // Advance 4s → triggers attempt 4 (the last retry)
    await vi.advanceTimersByTimeAsync(4000);
    expect(calls).toBe(4);
    const err = await promise;
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toContain("retry me");
    vi.useRealTimers();
  });
});

// ===========================================================================
// withRetry — founder paging on critical-path failure (Task #82)
// ===========================================================================
describe("withRetry — founder paging", () => {
  it("pages the founder when a critical agent fails terminally", async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error("twilio is down");
      e.status = 503;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 1,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
      }),
    ).rejects.toThrow("twilio is down");
    expect(pages).toHaveLength(1);
    // Body must include the agent name, op, attempt count, and error.
    const body = pages[0];
    expect(body).toContain("twilio");
    expect(body).toContain("sendWhatsApp");
    expect(body).toContain("attempts: 2");
    expect(body).toContain("twilio is down");
  });

  it("pages on a critical-OP failure even when agentName is generic", async () => {
    // chatCompletion routes every Company OS sub-agent's OpenAI call
    // through opName="openai.chat", so the allow-list keys on the op
    // rather than the agent for OpenAI specifically.
    const fn = vi.fn(async () => {
      const e: any = new Error("openai outage");
      e.status = 500;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "salesAgent",
        opName: "openai.chat",
      }),
    ).rejects.toThrow("openai outage");
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("openai.chat");
    expect(pages[0]).toContain("salesAgent");
  });

  it("does NOT page when the failing agent is not on the allow-list", async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error("dashboard query failed");
      e.status = 500;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "dashboardAgent",
        opName: "render",
      }),
    ).rejects.toThrow("dashboard query failed");
    expect(pages).toHaveLength(0);
    // The failure log row must still be written so the dashboard
    // surfaces the outage even though we didn't page WhatsApp.
    expect(inserted.filter((r) => r.status === "error")).toHaveLength(1);
  });

  it("respects an explicit `paging: \"founder\"` opt-in for non-critical agents", async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error("custom critical");
      e.status = 500;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "marketingAgent",
        opName: "publishPost",
        paging: "founder",
      }),
    ).rejects.toThrow("custom critical");
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("marketingAgent");
  });

  it("respects an explicit `paging: \"none\"` opt-out for critical agents", async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error("twilio down but quiet");
      e.status = 503;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
        paging: "none",
      }),
    ).rejects.toThrow("twilio down but quiet");
    expect(pages).toHaveLength(0);
  });

  it("does NOT page on a successful attempt after retries", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) {
        const e: any = new Error("rate limited");
        e.status = 429;
        throw e;
      }
      return "ok";
    });
    const out = await withRetry(fn, {
      retries: 3,
      baseMs: 1,
      agentName: "twilio",
      opName: "sendWhatsApp",
    });
    expect(out).toBe("ok");
    // No final-error row, no founder page.
    expect(pages).toHaveLength(0);
    expect(inserted.filter((r) => r.status === "error")).toHaveLength(0);
  });

  it("de-duplicates pages per agent+op within the 1h window", async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error("twilio still down");
      e.status = 503;
      throw e;
    });
    // First failure → page sent.
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
      }),
    ).rejects.toThrow();
    // Second failure within the dedupe window → page suppressed.
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
      }),
    ).rejects.toThrow();
    // Third failure within the dedupe window → still suppressed.
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
      }),
    ).rejects.toThrow();
    expect(pages).toHaveLength(1);
    // But every failure still wrote its own error log row so the
    // dashboard sees the full pattern.
    expect(inserted.filter((r) => r.status === "error")).toHaveLength(3);
  });

  it("dedupes per (agent, op) — different ops on the same agent each get their own page", async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error("storage down");
      e.status = 500;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "objectStorage",
        opName: "uploadPrivateBuffer",
      }),
    ).rejects.toThrow();
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "objectStorage",
        opName: "getSignedDownloadUrl",
      }),
    ).rejects.toThrow();
    expect(pages).toHaveLength(2);
  });

  it("does NOT record the dedupe timestamp when the page itself fails to send", async () => {
    // First terminal failure: simulate Twilio rejecting the page (e.g.
    // transient outage). The dedupe must NOT be recorded — otherwise
    // the next failure within the hour would be silently suppressed
    // even though the founder was never actually paged.
    pageFounderResponse = false;
    const fn = vi.fn(async () => {
      const e: any = new Error("twilio is down");
      e.status = 503;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
      }),
    ).rejects.toThrow();
    expect(pages).toHaveLength(1); // attempted once, returned false

    // Second terminal failure: simulate Twilio recovering. Because
    // the previous send failed, the dedupe should NOT have been
    // recorded, so we should attempt to page again immediately.
    pageFounderResponse = true;
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
      }),
    ).rejects.toThrow();
    expect(pages).toHaveLength(2);

    // Third terminal failure: now Twilio accepted the previous send
    // so the dedupe IS recorded — this one should be suppressed.
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
      }),
    ).rejects.toThrow();
    expect(pages).toHaveLength(2);
  });

  it("suppresses the founder page when an active snooze covers the failing (agent, op)", async () => {
    // Pre-seed an active snooze for (twilio, sendWhatsApp) — the
    // dashboard's "Snooze 1h" button writes exactly this row.
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    snoozeStore["retry|failure_snooze|twilio|sendWhatsApp"] = {
      value: { untilIso: future, hours: 1 },
    };
    const fn = vi.fn(async () => {
      const e: any = new Error("twilio is down");
      e.status = 503;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
      }),
    ).rejects.toThrow("twilio is down");
    // Page is suppressed by the snooze, but the failure log row is
    // still written so the dashboard's count keeps climbing.
    expect(pages).toHaveLength(0);
    expect(inserted.filter((r) => r.status === "error")).toHaveLength(1);
  });

  it("pages again once the snooze has expired", async () => {
    // Seed an EXPIRED snooze — the helper must treat it as no-op.
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    snoozeStore["retry|failure_snooze|twilio|sendWhatsApp"] = {
      value: { untilIso: past, hours: 1 },
    };
    const fn = vi.fn(async () => {
      const e: any = new Error("twilio still down");
      e.status = 503;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
      }),
    ).rejects.toThrow();
    expect(pages).toHaveLength(1);
  });

  it("snooze is scoped to the (agent, op) — other ops still page", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    snoozeStore["retry|failure_snooze|twilio|sendWhatsApp"] = {
      value: { untilIso: future, hours: 1 },
    };
    const fn = vi.fn(async () => {
      const e: any = new Error("openai outage");
      e.status = 500;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 0,
        baseMs: 1,
        agentName: "salesAgent",
        opName: "openai.chat",
      }),
    ).rejects.toThrow();
    // Different (agent, op) → not snoozed → page sent.
    expect(pages).toHaveLength(1);
  });

  it("pages on a terminal 4xx short-circuit for a critical agent (no retries)", async () => {
    const fn = vi.fn(async () => {
      const e: any = new Error("invalid recipient");
      e.status = 400;
      throw e;
    });
    await expect(
      withRetry(fn, {
        retries: 3,
        baseMs: 1,
        agentName: "twilio",
        opName: "sendWhatsApp",
      }),
    ).rejects.toThrow("invalid recipient");
    // Single attempt because 400 short-circuits.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("attempts: 1");
  });
});

// ===========================================================================
// snoozeFailureGroup / getFailureGroupSnoozedUntil — exercises the
// admin "Snooze 1h" path directly (separate from withRetry).
// ===========================================================================
describe("snoozeFailureGroup / getFailureGroupSnoozedUntil", () => {
  it("returns null when no snooze row exists for the (agent, op)", async () => {
    const out = await getFailureGroupSnoozedUntil("twilio", "sendWhatsApp");
    expect(out).toBeNull();
  });

  it("snoozeFailureGroup writes a memory row keyed by agent|op", async () => {
    const until = await snoozeFailureGroup("twilio", "sendWhatsApp", 1);
    expect(until.getTime()).toBeGreaterThan(Date.now());
    expect(remembered).toHaveLength(1);
    const row = remembered[0];
    expect(row.agentName).toBe("retry");
    expect(row.memoryType).toBe("failure_snooze");
    expect(row.key).toBe("twilio|sendWhatsApp");
    const v = row.value as { untilIso: string; hours: number };
    expect(v.hours).toBe(1);
    expect(new Date(v.untilIso).getTime()).toBeCloseTo(until.getTime(), -2);
  });

  it("clamps the hours argument to 1..168", async () => {
    await snoozeFailureGroup("a", "b", 0);
    await snoozeFailureGroup("c", "d", 9999);
    expect((remembered[0].value as { hours: number }).hours).toBe(1);
    expect((remembered[1].value as { hours: number }).hours).toBe(168);
  });

  it("getFailureGroupSnoozedUntil returns the expiry for a fresh snooze", async () => {
    await snoozeFailureGroup("twilio", "sendWhatsApp", 1);
    const out = await getFailureGroupSnoozedUntil("twilio", "sendWhatsApp");
    expect(out).not.toBeNull();
    expect(out!.getTime()).toBeGreaterThan(Date.now());
  });

  it("snoozeFailureGroup throws when remember() reports ok=false", async () => {
    // Re-mock remember to simulate a memory write failure (e.g. DB
    // outage). The router relies on this throw to surface a 500 to
    // the founder instead of a misleading "Snoozed" toast.
    const { remember } = await import("../server/companyOs/memoryAgent");
    (remember as any).mockImplementationOnce(async () => ({
      ok: false,
      reason: "db down",
    }));
    await expect(snoozeFailureGroup("twilio", "sendWhatsApp", 1)).rejects.toThrow(
      /failed to persist snooze/,
    );
  });

  it("getFailureGroupSnoozedUntil returns null for an expired snooze", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    snoozeStore["retry|failure_snooze|twilio|sendWhatsApp"] = {
      value: { untilIso: past, hours: 1 },
    };
    const out = await getFailureGroupSnoozedUntil("twilio", "sendWhatsApp");
    expect(out).toBeNull();
  });
});

