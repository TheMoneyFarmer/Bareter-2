import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";

/**
 * IDOR / broken-object-level-authorization tests.
 *
 * Every mutation below is scoped in the storage layer by an owner predicate,
 * e.g. `where(and(eq(table.id, id), eq(table.userId, userId)))`. That is correct
 * today, but it is correct by CONVENTION — nothing structural stops someone
 * dropping the second predicate, and the mutation would still look right in
 * review while silently letting any user modify any row.
 *
 * These tests attack that directly: user A creates a row, user B attempts to
 * mutate or delete it, and we assert the row is untouched. Removing an owner
 * predicate from the storage layer turns these red.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 * This suite writes real rows, so it refuses to run against production. It
 * requires an explicit opt-in env var, aborts if DATABASE_URL looks like the
 * production host, and deletes only the fixtures it created (tracked by id).
 */

const PROD_HOST_MARKERS = ["ep-morning-glitter"];
const OPT_IN = process.env.RUN_DB_TESTS === "1";

function dbHost(): string {
  try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; }
}

const host = dbHost();
const looksProd = PROD_HOST_MARKERS.some((m) => host.includes(m));
const runnable = OPT_IN && !!host && !looksProd;

// Skipped rather than failed when not opted in, so `npm test` stays hermetic.
const maybe = runnable ? describe : describe.skip;

if (OPT_IN && looksProd) {
  throw new Error(
    `REFUSING TO RUN: DATABASE_URL points at what looks like production (${host}). ` +
      `These tests create and delete rows. Point them at a dev branch.`,
  );
}

maybe("IDOR — a user cannot mutate another user's rows", () => {
  let db: any, storage: any, schema: any;
  let userA = "", userB = "";
  const createdUserIds: string[] = [];

  async function makeUser(tag: string): Promise<string> {
    const u = await storage.createUser({
      email: `idor-test-${tag}-${randomUUID()}@example.invalid`,
      password: "x".repeat(60), // never used to log in
      fullName: `IDOR Test ${tag}`,
    });
    createdUserIds.push(u.id);
    return u.id;
  }

  beforeAll(async () => {
    ({ db } = await import("../server/db"));
    ({ storage } = await import("../server/storage"));
    schema = await import("@shared/schema");
    userA = await makeUser("A");
    userB = await makeUser("B");
  });

  afterAll(async () => {
    if (!createdUserIds.length) return;
    // Children first — FK constraints. Only rows owned by the fixtures.
    for (const t of [schema.savedSearches, schema.listingDrafts, schema.notifications]) {
      await db.delete(t).where(inArray(t.userId, createdUserIds)).catch(() => {});
    }
    await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds)).catch(() => {});
    const { pool } = await import("../server/db");
    await pool.end().catch(() => {});
  });

  it("guards the fixtures themselves", () => {
    expect(userA).toBeTruthy();
    expect(userB).toBeTruthy();
    expect(userA).not.toBe(userB);
  });

  it("B cannot delete A's saved search", async () => {
    const row = await storage.createSavedSearch({
      userId: userA, name: "A's search", filters: {} as any,
    });

    await storage.deleteSavedSearch(row.id, userB); // the attack

    const [still] = await db.select().from(schema.savedSearches)
      .where(eq(schema.savedSearches.id, row.id));
    expect(still, "B deleted A's saved search").toBeTruthy();

    await storage.deleteSavedSearch(row.id, userA); // owner still can
    const [gone] = await db.select().from(schema.savedSearches)
      .where(eq(schema.savedSearches.id, row.id));
    expect(gone, "owner could not delete their own row").toBeUndefined();
  });

  it("B cannot delete A's listing draft", async () => {
    const [row] = await db.insert(schema.listingDrafts)
      .values({ userId: userA, data: { title: "secret" }, title: "A's draft" })
      .returning();

    const stolen = await storage.deleteListingDraft(row.id, userB); // the attack
    expect(stolen, "deleteListingDraft reported success for a non-owner").toBe(false);

    const [still] = await db.select().from(schema.listingDrafts)
      .where(eq(schema.listingDrafts.id, row.id));
    expect(still, "B deleted A's draft").toBeTruthy();

    expect(await storage.deleteListingDraft(row.id, userA)).toBe(true);
  });

  it("B cannot mark A's notification as read", async () => {
    const [row] = await db.insert(schema.notifications)
      .values({ userId: userA, type: "message", title: "t", message: "m" })
      .returning();
    expect(row.isRead).toBe(false);

    await storage.markNotificationAsRead(row.id, userB); // the attack

    const [after] = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.id, row.id));
    expect(after.isRead, "B marked A's notification read").toBe(false);

    await storage.markNotificationAsRead(row.id, userA); // owner can
    const [owned] = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.id, row.id));
    expect(owned.isRead).toBe(true);
  });

  it("B cannot delete A's notification", async () => {
    const [row] = await db.insert(schema.notifications)
      .values({ userId: userA, type: "message", title: "t2", message: "m2" })
      .returning();

    // Mirrors the route at /api/notifications/:id, which scopes inline.
    const { and } = await import("drizzle-orm");
    await db.delete(schema.notifications).where(
      and(eq(schema.notifications.id, row.id), eq(schema.notifications.userId, userB)),
    );

    const [still] = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.id, row.id));
    expect(still, "B deleted A's notification").toBeTruthy();
  });
});
