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
    then: (onF: any, onR: any) => Promise.resolve(resolver()).then(onF, onR),
    catch: (onR: any) => Promise.resolve(resolver()).catch(onR),
    finally: (onF: any) => Promise.resolve(resolver()).finally(onF),
  };
  return chain;
}

let lastInsertValues: any = null;
let lastUpsertConfig: any = null;
let executeCalls = 0;

vi.mock("../server/db", () => {
  return {
    db: {
      select: () => makeChain(() => []),
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
} from "../server/companyOs/dashboardAgent";

beforeEach(() => {
  lastInsertValues = null;
  lastUpsertConfig = null;
  executeCalls = 0;
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
