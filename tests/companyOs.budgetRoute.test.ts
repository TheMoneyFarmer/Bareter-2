// Route-level test for PATCH /api/company-os/alerts/budgets/:agent.
//
// Verifies admin gate, payload validation, persistence (via the
// mocked db), and response shape. Runs without Postgres.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

interface DbState {
  upserts: Array<{ agentName: string; monthlyCapAed: string }>;
  selectRows: Array<{ agentName: string; monthlyCapAed: string }>;
}
const dbState: DbState = { upserts: [], selectRows: [] };

vi.mock("../server/db", () => {
  const selectChain: any = { from: () => Promise.resolve(dbState.selectRows) };
  const insertChain: any = {
    values: (v: any) => {
      dbState.upserts.push({
        agentName: v.agentName,
        monthlyCapAed: String(v.monthlyCapAed),
      });
      return insertChain;
    },
    onConflictDoUpdate: () => Promise.resolve(),
  };
  return {
    db: {
      select: () => selectChain,
      insert: () => insertChain,
    },
  };
});

// The router pulls in a lot of unrelated agent code paths. We only
// care about the budgets PATCH here; mock everything else away.
vi.mock("../server/companyOs/dashboardAgent", () => ({
  collectLiveKpis: vi.fn(),
  upsertDailySnapshot: vi.fn(),
  getRecentSnapshots: vi.fn(),
  getRecentDisputeSummaries: vi.fn(async () => []),
  getDisputeSummaryById: vi.fn(),
}));
vi.mock("../server/companyOs/legalAgent", () => ({}));
vi.mock("../server/companyOs/marketingAgent", () => ({
  generateMarketingBrief: vi.fn(),
  listRecentBriefs: vi.fn(async () => []),
  getBriefById: vi.fn(),
  recordCampaignMetric: vi.fn(),
  listRecentCampaignMetrics: vi.fn(async () => []),
}));
vi.mock("../server/companyOs/salesAgent", () => ({
  runReEngagementCampaign: vi.fn(),
  runReEngagementForLead: vi.fn(),
  listSalesLeads: vi.fn(async () => []),
  getSalesLead: vi.fn(),
  updateSalesLeadStatus: vi.fn(),
  updateSalesLeadNotes: vi.fn(),
}));
vi.mock("../server/companyOs/intelligenceAgent", () => ({}));
vi.mock("../server/companyOs/socialPublishers", () => ({}));

beforeEach(() => {
  dbState.upserts = [];
  dbState.selectRows = [];
});

async function buildApp(opts: { admin: boolean }) {
  const { createCompanyOsRouter } = await import("../server/companyOs/router");
  const app = express();
  app.use(express.json());
  app.use(
    "/api/company-os",
    createCompanyOsRouter({
      requireAdmin: (_req, res, next) => {
        if (opts.admin) return next();
        res.status(401).json({ message: "Unauthorized" });
      },
    }),
  );
  return app;
}

describe("PATCH /api/company-os/alerts/budgets/:agent", () => {
  it("rejects non-admin callers with 401", async () => {
    const app = await buildApp({ admin: false });
    const res = await request(app)
      .patch("/api/company-os/alerts/budgets/marketing")
      .send({ monthlyCapAed: 100 });
    expect(res.status).toBe(401);
    expect(dbState.upserts).toHaveLength(0);
  });

  it("rejects negative caps with 400", async () => {
    const app = await buildApp({ admin: true });
    const res = await request(app)
      .patch("/api/company-os/alerts/budgets/marketing")
      .send({ monthlyCapAed: -5 });
    expect(res.status).toBe(400);
    expect(dbState.upserts).toHaveLength(0);
  });

  it("rejects caps above 5000 with 400", async () => {
    const app = await buildApp({ admin: true });
    const res = await request(app)
      .patch("/api/company-os/alerts/budgets/marketing")
      .send({ monthlyCapAed: 5001 });
    expect(res.status).toBe(400);
    expect(dbState.upserts).toHaveLength(0);
  });

  it("rejects non-numeric caps with 400", async () => {
    const app = await buildApp({ admin: true });
    const res = await request(app)
      .patch("/api/company-os/alerts/budgets/marketing")
      .send({ monthlyCapAed: "lots" });
    expect(res.status).toBe(400);
    expect(dbState.upserts).toHaveLength(0);
  });

  it("persists a valid cap and returns the canonical name + amount", async () => {
    const app = await buildApp({ admin: true });
    const res = await request(app)
      .patch("/api/company-os/alerts/budgets/marketingAgent")
      .send({ monthlyCapAed: 250 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.agentName).toBe("marketing");
    expect(res.body.monthlyCapAed).toBe(250);
    expect(dbState.upserts).toHaveLength(1);
    expect(dbState.upserts[0].agentName).toBe("marketing");
    expect(Number(dbState.upserts[0].monthlyCapAed)).toBe(250);
  });
});
