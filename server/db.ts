import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

// Use WebSocket for Node.js environments (required by @neondatabase/serverless)
neonConfig.webSocketConstructor = ws;

// Strip parameters that are not supported by the Neon serverless WebSocket
// driver. `channel_binding=require` is a TLS feature used by standard libpq
// and pgBouncer pooler URLs, but the Neon WS proxy doesn't negotiate it —
// leaving it in causes every pool.query() to throw an auth error, which the
// session middleware propagates as 500 on every request.
function sanitizeConnectionString(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return url;
  }
}

export const pool = new Pool({
  connectionString: sanitizeConnectionString(process.env.DATABASE_URL),
});

// Log pool-level errors so a broken DB connection is visible in Replit logs
// rather than silently causing every request to return 500.
(pool as any).on?.("error", (err: Error) => {
  console.error("[DB] Pool error:", err.message);
});

// Keepalive ping. This was written for the Neon FREE tier, where compute was
// free and a cold start was the only cost worth avoiding — so pinging every
// 4 minutes (under the ~5 min autosuspend threshold) was strictly a win.
//
// On a PAID plan that calculus inverts: compute is billed per hour, and this
// timer guarantees the compute NEVER suspends. Worse, it is pure waste by
// construction — it only has any effect when there is no real traffic, which
// is exactly when you want the compute to scale to zero. Real user requests
// keep the compute warm on their own; the ping only ever pays to keep an
// otherwise-idle database awake.
//
// Off by default. Set DB_KEEPALIVE=1 to restore the old behaviour if cold
// starts on the first request after an idle period become a problem.
if (process.env.DB_KEEPALIVE === "1") {
  console.log("[DB] Keepalive enabled — compute will not autosuspend (billed continuously)");
  setInterval(() => {
    pool.query("SELECT 1").catch(() => {});
  }, 4 * 60 * 1000).unref?.();
}

export const db = drizzle({ client: pool, schema });
