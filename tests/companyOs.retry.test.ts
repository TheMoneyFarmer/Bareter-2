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

import { withRetry, classifyError } from "../server/companyOs/retry";

beforeEach(() => {
  inserted.length = 0;
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
