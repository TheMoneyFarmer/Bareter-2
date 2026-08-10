// Error tracking.
//
// Until now a production failure produced "Internal Server Error" to the user
// and a line in Replit's log stream that nobody was watching. Nine API endpoints
// were dead for an unknown period and were found by manual probing; a full API
// outage was likewise noticed only by hand. Neither produced an alert.
//
// This wires Sentry in, with one firm rule: it is OPTIONAL. If SENTRY_DSN is
// unset — local dev, CI, a fork — every function here is a no-op and the app
// behaves exactly as before. Monitoring must never be the reason the product
// cannot boot.

import type { Request, Response, NextFunction } from "express";

let sentry: typeof import("@sentry/node") | null = null;
let enabled = false;

/**
 * Initialise error tracking. Safe to call unconditionally.
 *
 * Deliberately best-effort: any failure inside setup is swallowed and logged,
 * because a broken monitoring dependency taking down the API would be a
 * self-inflicted outage of exactly the kind this is meant to detect.
 */
export async function initErrorTracking(): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    console.log("[errors] SENTRY_DSN not set — error tracking disabled (no-op)");
    return;
  }
  try {
    sentry = await import("@sentry/node");
    sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      // Traces cost money and quota; errors are the point here. Opt in via env.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
      // Never ship request bodies or headers — they carry sessions, tokens,
      // password-reset links and KYC data.
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.cookie;
            delete event.request.headers.authorization;
          }
        }
        return event;
      },
    });
    enabled = true;
    console.log(`[errors] Sentry enabled (env=${process.env.NODE_ENV ?? "development"})`);
  } catch (err: any) {
    console.error("[errors] Sentry init failed — continuing without it:", err?.message);
    sentry = null;
    enabled = false;
  }
}

export function errorTrackingEnabled(): boolean {
  return enabled;
}

/** Report an error. No-op when tracking is disabled. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled || !sentry) return;
  try {
    sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* never let reporting throw into a request path */
  }
}

/**
 * Express error middleware. Reports, then delegates.
 *
 * Only 5xx are reported: 4xx are the client being wrong (bad input, missing
 * auth) and would bury real defects in noise.
 */
export function errorTrackingMiddleware() {
  return (err: any, req: Request, _res: Response, next: NextFunction) => {
    const status = err?.status ?? err?.statusCode ?? 500;
    if (status >= 500) {
      captureError(err, {
        method: req.method,
        path: req.path,
        // Identity without content: enough to spot "only affects logged-out
        // users" without shipping anything sensitive.
        authenticated: !!req.session?.userId,
      });
    }
    next(err);
  };
}
