import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Guards against Express route shadowing.
 *
 * Express matches routes in registration order. A parameterised route such as
 * `/api/listings/:id` therefore swallows every sibling literal route registered
 * AFTER it — the literal word is treated as an `:id` value, the lookup misses,
 * and the endpoint silently 404s with nothing logged.
 *
 * That is exactly what happened in production: nine endpoints (trending,
 * for-you, nearby, liked, bulk, chain-matches, match-score and both proposal
 * views) were dead. The bug is invisible in code review because each handler
 * looks perfectly correct in isolation — only the ORDER is wrong.
 *
 * This test re-derives the shadowing set from the source and fails if any
 * literal route is unreachable, so a newly added `/api/listings/<word>` route
 * placed below `:id` cannot regress silently. Adding one means adding it to
 * RESERVED_LISTING_PATHS in routes.ts as well.
 */

const ROUTE_FILES = [
  "server/routes.ts",
  "server/waitlistRoutes.ts",
  "server/replit_integrations/object_storage/routes.ts",
  "server/replit_integrations/chat/routes.ts",
  "server/replit_integrations/audio/routes.ts",
  "server/replit_integrations/image/routes.ts",
];

interface Route { file: string; line: number; method: string; path: string }

function collectRoutes(): Route[] {
  const routes: Route[] = [];
  for (const rel of ROUTE_FILES) {
    const abs = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(abs)) continue;
    fs.readFileSync(abs, "utf8").split("\n").forEach((ln, i) => {
      const m = ln.match(/app\.(get|post|put|patch|delete)\(\s*"([^"]+)"/);
      if (m) routes.push({ file: rel, line: i + 1, method: m[1], path: m[2] });
    });
  }
  return routes;
}

/** Reserved words the :id handler yields on via next(). */
function reservedListingPaths(): Set<string> {
  const src = fs.readFileSync(path.resolve(process.cwd(), "server/routes.ts"), "utf8");
  const block = src.match(/const RESERVED_LISTING_PATHS = new Set\(\[([\s\S]*?)\]\)/);
  if (!block) return new Set();
  return new Set([...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

function findShadowed(routes: Route[]) {
  const out: { victim: Route; shadower: Route }[] = [];
  for (let i = 0; i < routes.length; i++) {
    const victim = routes[i];
    const segs = victim.path.split("/").filter(Boolean);
    if (segs.some((s) => s.startsWith(":"))) continue; // only literals are victims
    for (let j = 0; j < i; j++) {
      const earlier = routes[j];
      if (earlier.method !== victim.method) continue;
      const es = earlier.path.split("/").filter(Boolean);
      if (es.length !== segs.length) continue;
      if (!es.some((s) => s.startsWith(":"))) continue;
      const matches = es.every((s, k) => s.startsWith(":") || s === segs[k]);
      if (matches) { out.push({ victim, shadower: earlier }); break; }
    }
  }
  return out;
}

describe("Express route shadowing", () => {
  const routes = collectRoutes();

  it("finds routes to analyse", () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it("has no literal route made unreachable by an earlier :param route", () => {
    const reserved = reservedListingPaths();
    const shadowed = findShadowed(routes);

    // A shadowed route is acceptable ONLY when the shadowing handler explicitly
    // yields for that word via next().
    const unreachable = shadowed.filter(({ victim }) => {
      const last = victim.path.split("/").filter(Boolean).pop() ?? "";
      return !reserved.has(last);
    });

    const detail = unreachable
      .map((s) => `  ${s.victim.method.toUpperCase()} ${s.victim.path} (${s.victim.file}:${s.victim.line}) eaten by ${s.shadower.path}:${s.shadower.line}`)
      .join("\n");

    expect(unreachable, `Unreachable routes:\n${detail}`).toHaveLength(0);
  });

  it("keeps RESERVED_LISTING_PATHS in sync with the routes it protects", () => {
    const reserved = reservedListingPaths();
    expect(reserved.size).toBeGreaterThan(0);

    const literalListingWords = routes
      .filter((r) => r.method === "get" && /^\/api\/listings\/[a-z-]+$/i.test(r.path))
      .map((r) => r.path.split("/").pop()!)
      .filter((w) => {
        // Registered before :id, so they were never shadowed and need no entry.
        const idRoute = routes.find((r) => r.path === "/api/listings/:id" && r.method === "get");
        const own = routes.find((r) => r.path === `/api/listings/${w}` && r.method === "get");
        return idRoute && own ? own.line > idRoute.line : false;
      });

    for (const w of literalListingWords) {
      expect(reserved.has(w), `"${w}" is registered after /api/listings/:id but missing from RESERVED_LISTING_PATHS`).toBe(true);
    }
  });
});
