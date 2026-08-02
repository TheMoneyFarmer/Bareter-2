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

// Keepalive ping every 4 minutes — prevents Neon free tier from cold-starting
// on user requests (free tier suspends compute after ~5 min of inactivity).
setInterval(() => {
  pool.query("SELECT 1").catch(() => {});
}, 4 * 60 * 1000);

export const db = drizzle({ client: pool, schema });
