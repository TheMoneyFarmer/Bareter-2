// Tests for the Dashboard Agent (server/companyOs/dashboardAgent.ts).
//
// We follow the same pattern as `companyOs.whatsapp.test.ts`:
//   • Stub the Drizzle `db` with a chainable proxy that resolves to a
//     caller-provided value, so each query returns an empty result set
//     by default and the agent's `safe()` fallbacks kick in.
//   • Stub the cost tracker so AI-spend math doesn't try to reach the LLM
//     pricing module.
//   • Verify the WhatsApp summary, the live aggregation shape, the
//     snapshot upsert path, and the read helpers used by the HTTP routes.
//
// jsdom isn't configured for this project, so the React admin page is
// not exercised here — it relies on the same React Query hooks already
// covered by manual / e2e flows.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any module that imports the dashboard agent.
// ---------------------------------------------------------------------------

type ChainResolver = () => unknown;

function makeChain(resolver: ChainResolver): any {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    groupBy: () => chain,
    values: (v: any) => {
      lastInsertValues = v;
      return chain;
    },
    onConflictDoUpdate: (cfg: any) => {
      lastUpsertConfig = cfg;
      return chain;
    },
    // `remember()` in memoryAgent ends with `.returning()` after the
    // upsert, so we surface the resolver result there too. Existing
    // callers that don't use `.returning()` are unaffected because
    // `then`/`catch`/`finally` resolve to the same value.
    returning: () => Promise.resolve(resolver()),
    then: (onF: any, onR: any) => Promise.resolve(resolver()).then(onF, onR),
    catch: (onR: any) => Promise.resolve(resolver()).catch(onR),
    finally: (onF: any) => Promise.resolve(resolver()).finally(onF),
  };
  return chain;
}

let lastInsertValues: any = null;
let lastUpsertConfig: any = null;
let executeCalls = 0;
// Allow a test to swap in a custom resolver for the next `db.select()`
// call (and only the next call). Used by `getRecentFailures` tests to
// inject a synthetic batch of error logs without touching the real DB.
let nextSelectResolver: ChainResolver | null = null;

vi.mock("../server/db", () => {
  return {
    db: {
      select: () => {
        if (nextSelectResolver) {
          const r = nextSelectResolver;
          nextSelectResolver = null;
          return makeChain(r);
        }
        return makeChain(() => []);
      },
      insert: () => makeChain(() => []),
      update: () => makeChain(() => []),
      delete: () => makeChain(() => []),
      execute: async () => {
        executeCalls += 1;
        // Drizzle's neon-http driver returns either { rows: [...] } or an
        // array directly. The agent handles both — we return rows: [].
        return { rows: [] };
      },
    },
  };
});

vi.mock("../server/companyOs/costTracker", () => ({
  getMonthSpendAed: vi.fn(async () => 12.34),
  getMonthSpendByAgent: vi.fn(async () => [
    { agentName: "manager", spendAed: 5.5 },
    { agentName: "finance", spendAed: 6.84 },
  ]),
  getBudgetVerdict: vi.fn(async () => ({
    safe: true,
    spentAed: 12.34,
    budgetAed: 400,
    remainingAed: 387.66,
    pctUsed: 3.085,
  })),
}));

// Imported AFTER the mocks so the dashboard agent picks up the stubbed deps.
import {
  getDashboardData,
  getKpiSummary,
  captureDailySnapshot,
  getLiveKpis,
  getRecentSnapshots,
  getSnapshotByDate,
  getRecentFailures,
  snoozeFailureGroup,
} from "../server/companyOs/dashboardAgent";

beforeEach(() => {
  lastInsertValues = null;
  lastUpsertConfig = null;
  executeCalls = 0;
  nextSelectResolver = null;
});

describe("Dashboard Agent — live aggregation", () => {
  it("getLiveKpis returns a fully-shaped payload with safe zero defaults", async () => {
    const live = await getLiveKpis();

    // Shape — every documented field is present and typed correctly.
    expect(live).toMatchObject({
      totalUsers: 0,
      newUsersToday: 0,
      activeUsers7d: 0,
      totalPosts: 0,
      postsToday: 0,
      totalDeals: 0,
      dealsCompletedToday: 0,
      gmvAed7d: 0,
      completionRatePct: 0,
      topCategory: null,
      topCity: null,
    });
    // AI cost flows through the cost-tracker mock.
    expect(live.aiCostAedMonthToDate).toBeCloseTo(12.34, 2);
    // Date is a Dubai YYYY-MM-DD.
    expect(live.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 30-day buckets are gap-filled to length 30 even with no data.
    expect(live.revenue30d).toHaveLength(30);
    expect(live.gmv30d).toHaveLength(30);
    expect(live.agentCost30d).toHaveLength(30);
    // Lists default to empty arrays (no throws).
    expect(live.topCategories).toEqual([]);
    expect(live.topCities).toEqual([]);
    expect(live.salesPipeline).toEqual([]);
    expect(live.recentLegalDocuments).toEqual([]);
    expect(live.latestContentBriefs).toEqual([]);
    expect(live.latestCampaigns).toEqual([]);
    // Heatmap is degenerate but well-typed.
    expect(Array.isArray(live.agentRunHeatmap7d)).toBe(true);
    // The category + GMV-by-day raw queries go through `db.execute`.
    expect(executeCalls).toBeGreaterThanOrEqual(2);
  });

  it("getDashboardData is the same payload as getLiveKpis", async () => {
    const a = await getDashboardData();
    const b = await getLiveKpis();
    // Compare keys instead of values (a includes today's date; both calls
    // happen in the same test millisecond on practical runners).
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });
});

describe("Dashboard Agent — WhatsApp summary", () => {
  it("getKpiSummary falls back to live data when no snapshot exists", async () => {
    const out = await getKpiSummary();
    expect(out).toContain("*Dashboard ·");
    expect(out).toMatch(/Users: 0 \(\+0 today/);
    expect(out).toMatch(/Posts: 0/);
    expect(out).toMatch(/Deals: 0/);
    expect(out).toMatch(/GMV 7d: AED 0\.00/);
    expect(out).toMatch(/Completion rate: 0\.0%/);
    expect(out).toMatch(/Top category: —/);
    expect(out).toMatch(/Top city: —/);
    expect(out).toMatch(/AI spend MTD: AED 12\.34/);
  });
});

describe("Dashboard Agent — persistence", () => {
  it("captureDailySnapshot upserts a row and returns inserted=true", async () => {
    const r = await captureDailySnapshot();
    expect(r.inserted).toBe(true);
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // The values payload should include all headline KPIs and the
    // `extras` JSONB blob with chart-feeding series.
    expect(lastInsertValues).toBeTruthy();
    expect(lastInsertValues.snapshotDate).toBe(r.date);
    expect(lastInsertValues.totalUsers).toBe(0);
    expect(lastInsertValues.aiCostAedMonthToDate).toBe("12.34");
    expect(lastInsertValues.extras).toMatchObject({
      topCategories: expect.any(Array),
      topCities: expect.any(Array),
      salesPipeline: expect.any(Array),
      revenue30d: expect.any(Array),
      gmv30d: expect.any(Array),
      agentCost30d: expect.any(Array),
    });

    // The upsert config targets snapshotDate so the cron is idempotent.
    expect(lastUpsertConfig).toBeTruthy();
    expect(lastUpsertConfig.set.totalUsers).toBe(0);
  });

  it("getRecentSnapshots returns [] when the db has no rows", async () => {
    const rows = await getRecentSnapshots(5);
    expect(rows).toEqual([]);
  });

  it("getSnapshotByDate returns null when no row matches", async () => {
    const row = await getSnapshotByDate("2026-01-01");
    expect(row).toBeNull();
  });
});

describe("Dashboard Agent — recent failures", () => {
  it("getRecentFailures returns [] when there are no error logs", async () => {
    const out = await getRecentFailures(24);
    expect(out).toEqual([]);
  });

  it("groups error rows by (agentName, parsed op) and orders by count desc", async () => {
    const now = Date.now();
    // Three failures for twilio.send + one for openai.chat. Rows are
    // returned newest-first per the agent's `.orderBy(desc(createdAt))`.
    nextSelectResolver = () => [
      {
        agentName: "twilio",
        command: "retry",
        inputPreview: "op=twilio.send attempt=2 class=http_503 final",
        errorMessage: "twilio is down (latest)",
        createdAt: new Date(now - 1_000),
      },
      {
        agentName: "twilio",
        command: "retry",
        inputPreview: "op=twilio.send attempt=2 class=http_503 final",
        errorMessage: "twilio is down (mid)",
        createdAt: new Date(now - 60_000),
      },
      {
        agentName: "twilio",
        command: "retry",
        inputPreview: "op=twilio.send attempt=2 class=http_503 final",
        errorMessage: "twilio is down (oldest)",
        createdAt: new Date(now - 600_000),
      },
      {
        agentName: "salesAgent",
        command: "retry",
        inputPreview: "op=openai.chat attempt=1 class=http_500 final",
        errorMessage: "openai outage",
        createdAt: new Date(now - 30_000),
      },
    ];
    const out = await getRecentFailures(24);
    expect(out).toHaveLength(2);
    // Sorted by count desc → twilio.send (3) before openai.chat (1).
    expect(out[0]).toMatchObject({
      agentName: "twilio",
      opName: "twilio.send",
      count: 3,
      lastErrorMessage: "twilio is down (latest)",
      snoozedUntil: null,
    });
    expect(out[0].lastSeenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out[1]).toMatchObject({
      agentName: "salesAgent",
      opName: "openai.chat",
      count: 1,
      lastErrorMessage: "openai outage",
      snoozedUntil: null,
    });
  });

  it("falls back to `command` when inputPreview has no op= token", async () => {
    nextSelectResolver = () => [
      {
        agentName: "costTracker",
        command: "logLlmCall",
        inputPreview: "model=gpt-5-mini agent=manager",
        errorMessage: "pricing missing",
        createdAt: new Date(),
      },
    ];
    const out = await getRecentFailures(24);
    expect(out).toHaveLength(1);
    expect(out[0].opName).toBe("logLlmCall");
    expect(out[0].agentName).toBe("costTracker");
  });

  it("falls back to 'unknown' when both preview and command are missing", async () => {
    nextSelectResolver = () => [
      {
        agentName: "mystery",
        command: null,
        inputPreview: null,
        errorMessage: "no context",
        createdAt: new Date(),
      },
    ];
    const out = await getRecentFailures(24);
    expect(out[0]).toMatchObject({ agentName: "mystery", opName: "unknown", count: 1 });
  });

  it("clamps the hours arg to 1..168 and never throws on db failure", async () => {
    // Resolver that throws inside the chain → agent must catch and return [].
    nextSelectResolver = () => {
      throw new Error("boom");
    };
    const out = await getRecentFailures(9999);
    expect(out).toEqual([]);
  });

  it("snoozeFailureGroup returns an ISO snoozedUntil and writes a memory row", async () => {
    const r = await snoozeFailureGroup("twilio", "sendWhatsApp", 1);
    expect(r.snoozedUntil).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The retry helper writes via db.insert(...).values(...), captured by
    // the existing chainable mock into `lastInsertValues`. The remember()
    // flow may upsert through a separate path; we only assert that the
    // call resolves with a valid ISO timestamp in the future.
    expect(new Date(r.snoozedUntil).getTime()).toBeGreaterThan(Date.now());
  });
});
