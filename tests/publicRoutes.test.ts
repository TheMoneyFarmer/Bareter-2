import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Inventory of routes that are intentionally reachable WITHOUT authentication.
 *
 * 99 of the app's 418 routes have no requireAuth/requireAdmin middleware. Most are
 * legitimately public — auth flows, webhooks, the marketing site, public
 * listings. But "public" was previously an emergent property of whoever wrote
 * the route, verifiable only by reading all 418 by hand.
 *
 * This test pins the set. Adding a route without an auth gate fails CI until it
 * is added here deliberately, which turns "did anyone check this is meant to be
 * public?" from a code-review hope into a build error.
 *
 * If this test fails, do not simply paste the new route in. Ask first whether it
 * should require auth — especially for anything mutating, where the answer is
 * usually yes.
 */

const ROUTE_FILES = [
  "server/routes.ts",
  "server/waitlistRoutes.ts",
  "server/replit_integrations/object_storage/routes.ts",
  "server/replit_integrations/chat/routes.ts",
  "server/replit_integrations/audio/routes.ts",
  "server/replit_integrations/image/routes.ts",
];

/** Reviewed and confirmed safe to expose unauthenticated. */
const APPROVED_PUBLIC = new Set([
  "GET /api/admin/invites/verify/:token",
  "GET /api/auth/apple/status",
  "GET /api/auth/dev-diag",
  "GET /api/auth/google/status",
  "GET /api/auth/me",
  "GET /api/auth/reset-password/validate",
  "GET /api/auth/verify-email",
  "GET /api/blog",
  "GET /api/blog/:slug",
  "GET /api/businesses",
  "GET /api/businesses/:id/storefront",
  "GET /api/config",
  "GET /api/creators",
  "GET /api/creators/:userId",
  "GET /api/deals/recent-completed",
  "GET /api/endorsements/:userId",
  "GET /api/explore/stats",
  "GET /api/health",
  "GET /api/geo/lookup",
  "GET /api/legal",
  "GET /api/legal/:slug",
  "GET /api/listings",
  "GET /api/listings/:id",
  "GET /api/listings/:id/chain-candidates",
  "GET /api/listings/:id/comments",
  "GET /api/listings/:id/similar",
  "GET /api/listings/bulk",
  "GET /api/listings/collabs",
  "GET /api/listings/featured",
  "GET /api/listings/nearby",
  "GET /api/listings/trending",
  "GET /api/market-average",
  "GET /api/portfolio/:userId",
  "GET /api/posts",
  "GET /api/posts/:id",
  "GET /api/posts/:id/comments",
  "GET /api/posts/trending",
  "GET /api/public/help-articles",
  "GET /api/public/settings",
  "GET /api/ratings/user/:userId",
  "GET /api/reminders/unsubscribe",
  "GET /api/sales/track/:token",
  "GET /api/search/autocomplete",
  "GET /api/stats/exchanges/count",
  "GET /api/stories",
  "GET /api/success-stories",
  "GET /api/support/tickets",
  "GET /api/support/tickets/:id",
  "GET /api/support/tickets/:id/messages",
  "GET /api/users/:userId/credibility",
  "GET /api/users/:userId/reviews",
  "GET /api/users/search",
  "GET /api/waitlist/by-code/:code",
  "GET /api/waitlist/count",
  "GET /api/waitlist/mode",
  "GET /api/waitlist/unsubscribe",
  "GET /auth/apple",
  "GET /auth/google",
  "GET /auth/google/callback",
  "GET /go",
  "GET /google:code.html",
  "GET /my-account",
  "GET /my-exchanges",
  "GET /my-listings",
  "GET /ping",
  "GET /robots.txt",
  "GET /sitemap-categories.xml",
  "GET /sitemap-listings-:page.xml",
  "GET /sitemap-listings.xml",
  "GET /sitemap-pages.xml",
  "GET /sitemap-users-:page.xml",
  "GET /sitemap-users.xml",
  "GET /sitemap.xml",
  "GET /verify",
  "POST /api/admin/invites/accept",
  "POST /api/auth/apple/native",
  "POST /api/auth/dev-set-password",
  "POST /api/auth/forgot-password",
  "POST /api/auth/google/native",
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "POST /api/auth/register",
  "POST /api/auth/reset-password",
  "POST /api/client-errors",
  "POST /api/consent",
  "POST /api/feature-waitlist",
  "POST /api/logs/client-error",
  "POST /api/support/quick-ask",
  "POST /api/support/tickets",
  "POST /api/support/tickets/:id/close",
  "POST /api/support/tickets/:id/escalate",
  "POST /api/support/tickets/:id/messages",
  "POST /api/support/tickets/resume",
  "POST /api/translate",
  "POST /api/waitlist",
  "POST /api/webhooks/sanity",
  "POST /auth/apple/callback",
]);

function publicRoutes(): string[] {
  const found: string[] = [];
  for (const rel of ROUTE_FILES) {
    const abs = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, "utf8");
    const rx = /app\.(get|post|put|patch|delete)\(/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(src))) {
      const after = src.slice(m.index + m[0].length, m.index + m[0].length + 500);
      const pm = after.match(/^\s*"([^"]+)"/);
      if (!pm) continue;
      const mw = after.slice(pm[0].length, pm[0].length + 240);
      if (/require(Auth|Admin|SuperAdmin|AuthBlueprint)|requireAuthLocal/.test(mw)) continue;
      found.push(`${m[1].toUpperCase()} ${pm[1]}`);
    }
  }
  return [...new Set(found)].sort();
}

describe("public route inventory", () => {
  it("exposes no unauthenticated route that has not been reviewed", () => {
    const unreviewed = publicRoutes().filter((r) => !APPROVED_PUBLIC.has(r));
    expect(
      unreviewed,
      `New unauthenticated route(s). Should these require auth?\n  ${unreviewed.join("\n  ")}`,
    ).toEqual([]);
  });

  it("flags approved entries that no longer exist, so the list cannot rot", () => {
    const actual = new Set(publicRoutes());
    const stale = [...APPROVED_PUBLIC].filter((r) => !actual.has(r));
    expect(stale, `Remove from APPROVED_PUBLIC:\n  ${stale.join("\n  ")}`).toEqual([]);
  });

  it("keeps the unauthenticated mutating surface small and deliberate", () => {
    const mutating = publicRoutes().filter((r) => /^(POST|PUT|PATCH|DELETE)/.test(r));
    // Auth flows, webhooks, waitlist, support (own token guard), telemetry.
    // A jump here means something that changes state became reachable to anyone.
    expect(mutating.length).toBeLessThanOrEqual(25);
  });
});
