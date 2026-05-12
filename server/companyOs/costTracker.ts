// Per-LLM-call cost tracker for the Company OS / WhatsApp Manager Agent.
//
// Every call routed through the manager records token usage + an AED
// estimate to `company_os_logs`. The monthly budget gate short-circuits
// the free-form path before it ever hits OpenAI when spend reaches 95%
// of the configured AED budget.

import { and, gte, lte, sql, count, inArray } from "drizzle-orm";
import { db } from "../db";
import { agentBudgets, companyOsLogs } from "@shared/schema";

// Replit's AI integration proxy rejects the LiteLLM-style `openai/` prefix
// (returns 400/404 "Model is not supported" / "API deployment for this
// resource does not exist"). Use the bare model name as documented in
// `server/replit_integrations/chat/routes.ts`. If you change this, also
// add a matching entry to MODEL_USD_PER_1K_TOKENS below or estimateCostAed
// will fall back to the gpt-4o-mini blended rate.
export const DEFAULT_MODEL = "gpt-4o-mini";

// Thrown by `chatCompletion`/`jsonCompletion` when the *global* monthly
// AED budget gate fires. Callers (moderation, valuation, etc.) catch
// and fall back to safe defaults; the manager free-form path pre-checks
// and renders a friendly WhatsApp refusal instead of throwing.
export class BudgetExceededError extends Error {
  readonly verdict: BudgetVerdict;
  constructor(verdict: BudgetVerdict) {
    super(
      `Company OS monthly AED budget exceeded: spent ${verdict.spentAed.toFixed(2)} of ${verdict.budgetAed.toFixed(2)} (${(verdict.pctUsed * 100).toFixed(1)}%)`,
    );
    this.name = "BudgetExceededError";
    this.verdict = verdict;
  }
}

// ---------------------------------------------------------------------------
// Per-agent monthly AED caps. Sum (~430) deliberately overshoots the
// 400-default global budget so a single hot agent can flex into the
// headroom of quieter ones — the global gate is still the hard ceiling.
//
// Call sites in the codebase are inconsistent — some use the canonical
// short name (`marketing`, `sales`, `legal`, `finance`) when writing to
// `companyOsLogs.agentName`, others use the `xxxAgent` constant exported
// from each agent module (`marketingAgent`, `salesAgent`, `legalAgent`).
// We register both forms here so a budget override never silently falls
// back to `DEFAULT_AGENT_LIMIT_AED` because of a naming mismatch.
//
// Override per-agent in env via COMPANY_OS_BUDGET_AED_<AGENT>; missing
// agent names fall back to `DEFAULT_AGENT_LIMIT_AED` so new agents
// get a reasonable cap without a code change.
// ---------------------------------------------------------------------------
export const AGENT_LIMITS_AED: Record<string, number> = {
  // Company OS agents
  manager: 60,
  finance: 30,
  financeAgent: 30,
  marketing: 80,
  marketingAgent: 80,
  sales: 80,
  salesAgent: 80,
  legal: 60,
  legalAgent: 60,
  dashboard: 30,
  dashboardAgent: 30,
  memory: 10,
  memoryAgent: 10,
  intelligenceAgent: 40,
  intelligence: 40,
  board: 40,
  boardAgent: 40,
  // Platform agents
  admin: 40,
  adminAgent: 40,
  matching: 40,
  matchingAgent: 40,
  moderation: 40,
  moderationAgent: 40,
  support: 40,
  supportAgent: 40,
  valuation: 40,
  valuationAgent: 40,
  engagement: 40,
  engagementAgent: 40,
};
const DEFAULT_AGENT_LIMIT_AED = 40;

function envOverride(agent: string): number | null {
  const safe = agent.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const raw = process.env[`COMPANY_OS_BUDGET_AED_${safe}`];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Normalise a recorded agent name down to a key our budget table knows.
 * Tries the raw name first, then the `xxxAgent` ↔ short-name pair, so a
 * call site logging "marketing" still picks up the same cap as the call
 * site logging "marketingAgent".
 */
function normalizeAgentKey(agent: string): string {
  if (AGENT_LIMITS_AED[agent] !== undefined) return agent;
  if (agent.endsWith("Agent")) {
    const short = agent.slice(0, -"Agent".length);
    if (AGENT_LIMITS_AED[short] !== undefined) return short;
  } else {
    const suffixed = `${agent}Agent`;
    if (AGENT_LIMITS_AED[suffixed] !== undefined) return suffixed;
  }
  return agent;
}

/**
 * The canonical (preferred) name for each known agent. We prefer the
 * SHORT form ("marketing", "sales", "legal", "finance", "dashboard",
 * "memory", "admin", "matching", "manager", "board") and the suffixed
 * form ONLY for agents whose canonical identity carries the "Agent"
 * suffix in code (currently just `intelligenceAgent`).
 *
 * Exported so the dashboard / WhatsApp `costs` surface can label spend
 * rows under one consistent name even when raw logs were written with
 * different aliases.
 */
export const CANONICAL_AGENT_NAMES = [
  "manager",
  "marketing",
  "sales",
  "legal",
  "finance",
  "dashboard",
  "memory",
  "admin",
  "matching",
  "board",
  "intelligenceAgent",
] as const;

const SHORT_NAMES = new Set<string>(CANONICAL_AGENT_NAMES.filter((n) => !n.endsWith("Agent")));

/**
 * Map a recorded agent name to its canonical identity for reporting.
 * Mirrors `normalizeAgentKey` but biases toward the SHORT form so the
 * budget surface always shows e.g. "marketing" instead of mixing
 * "marketing" and "marketingAgent" rows.
 */
export function canonicalAgentName(agent: string): string {
  const key = normalizeAgentKey(agent);
  if (key.endsWith("Agent")) {
    const short = key.slice(0, -"Agent".length);
    if (SHORT_NAMES.has(short)) return short;
  }
  return key;
}

/**
 * Return EVERY known alias for an agent — i.e. the input itself plus
 * its canonical key plus the short ↔ suffixed counterpart, dedup'd.
 *
 * Used by the spend-aggregation queries so a lookup for any one alias
 * always sums spend across all of them. This is the "alias-safe
 * accounting" guarantee: logs written under `marketing` and
 * `marketingAgent` always count toward the same monthly cap, and a
 * query under either name returns the combined total.
 */
export function aliasesForAgent(agent: string): string[] {
  if (!agent) return [];
  const out = new Set<string>([agent]);
  const canonical = canonicalAgentName(agent);
  out.add(canonical);
  // Always try BOTH the short and suffixed forms regardless of which
  // we started from — fixes the asymmetry where a lookup for the
  // suffixed variant otherwise misses short rows.
  if (canonical.endsWith("Agent")) {
    out.add(canonical.slice(0, -"Agent".length));
  } else {
    out.add(`${canonical}Agent`);
  }
  // Same for the raw input (in case it didn't normalize to anything
  // we recognise — defensively cover both forms).
  if (agent.endsWith("Agent")) {
    out.add(agent.slice(0, -"Agent".length));
  } else {
    out.add(`${agent}Agent`);
  }
  return Array.from(out).filter(Boolean);
}

// In-memory cache of DB-stored per-agent overrides, keyed by canonical
// agent name. Populated lazily on first access and refreshed whenever
// `setAgentBudgetOverride` is called from the admin PATCH route. Falls
// back to the hardcoded `AGENT_LIMITS_AED` map when no row exists.
//
// The cache exists because `getAgentBudgetAed` is called inline by the
// LLM gate on every chat/jsonCompletion call — making it async would
// require touching every wrapper. Refreshes are explicit (PATCH route)
// so a single edit takes effect immediately for all subsequent calls.
const agentBudgetOverrideCache: Map<string, number> = new Map();
let overrideCacheReady = false;
let overrideCacheLoadPromise: Promise<void> | null = null;

async function loadOverrideCache(): Promise<void> {
  try {
    const rows = await db
      .select({
        agentName: agentBudgets.agentName,
        monthlyCapAed: agentBudgets.monthlyCapAed,
      })
      .from(agentBudgets);
    agentBudgetOverrideCache.clear();
    for (const r of rows) {
      const n = Number(r.monthlyCapAed);
      if (Number.isFinite(n) && n > 0) {
        agentBudgetOverrideCache.set(r.agentName, n);
      }
    }
    // Only flip the readiness flag on success — a transient DB read
    // failure must NOT permanently suppress override reads. Subsequent
    // `getAgentBudgetAed` calls will re-trigger the lazy load.
    overrideCacheReady = true;
  } catch (err) {
    console.error("[companyOs] loadOverrideCache failed (will retry on next read):", err);
    // Leave overrideCacheReady = false so the next call retries.
  }
}

/**
 * Seed default `agent_budgets` rows for every canonical agent the
 * platform knows about. Idempotent — `onConflictDoNothing` so existing
 * founder edits are never clobbered. Called once from the server
 * bootstrap so the admin /agent-budgets surface stops showing fake
 * placeholder caps that have no DB row backing them.
 */
export async function seedAgentBudgetDefaults(): Promise<void> {
  const seedAgents = [
    "manager", "finance", "marketing", "sales", "legal", "dashboard",
    "memory", "intelligenceAgent", "board", "admin", "matching",
    "moderation", "support", "valuation", "engagement",
  ];
  try {
    const now = new Date();
    const rows = seedAgents.map((agentName) => ({
      agentName,
      monthlyCapAed: (AGENT_LIMITS_AED[agentName] ?? DEFAULT_AGENT_LIMIT_AED).toFixed(2),
      enabled: true,
      updatedAt: now,
    }));
    await db.insert(agentBudgets).values(rows).onConflictDoNothing();
    // Refresh the in-memory cache so the new rows take effect immediately.
    await loadOverrideCache();
  } catch (err) {
    console.error("[companyOs] seedAgentBudgetDefaults failed:", err);
  }
}

/**
 * Eagerly load the per-agent override cache. Safe to call multiple
 * times — concurrent calls share a single in-flight promise.
 *
 * Called once from the server bootstrap so the LLM gate hits a hot
 * cache on the very first request after a restart.
 */
export function ensureAgentBudgetOverridesLoaded(): Promise<void> {
  if (overrideCacheReady) return Promise.resolve();
  if (!overrideCacheLoadPromise) {
    overrideCacheLoadPromise = loadOverrideCache().finally(() => {
      overrideCacheLoadPromise = null;
    });
  }
  return overrideCacheLoadPromise;
}

/**
 * Persist a per-agent monthly cap override and refresh the in-memory
 * cache so all subsequent `getAgentBudgetAed` calls see the new value
 * immediately. Returns the canonical agent name + applied cap.
 *
 * Called from the admin PATCH route after admin auth + validation.
 */
export async function setAgentBudgetOverride(
  agent: string,
  monthlyCapAed: number,
): Promise<{ agentName: string; monthlyCapAed: number }> {
  if (!Number.isFinite(monthlyCapAed) || monthlyCapAed <= 0) {
    throw new Error("monthlyCapAed must be a positive finite number");
  }
  const canonical = canonicalAgentName(agent);
  await db
    .insert(agentBudgets)
    .values({
      agentName: canonical,
      monthlyCapAed: monthlyCapAed.toFixed(2),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: agentBudgets.agentName,
      set: {
        monthlyCapAed: monthlyCapAed.toFixed(2),
        updatedAt: new Date(),
      },
    });
  agentBudgetOverrideCache.set(canonical, monthlyCapAed);
  overrideCacheReady = true;
  return { agentName: canonical, monthlyCapAed };
}

export function getAgentBudgetAed(agent: string): number {
  const key = normalizeAgentKey(agent);
  const canonical = canonicalAgentName(agent);
  // env > DB override > hardcoded > default. Env wins so an operator
  // can still pin a runaway agent at deploy time even if the DB row
  // says otherwise.
  const envHit = envOverride(agent) ?? envOverride(key);
  if (envHit !== null) return envHit;
  // Trigger a lazy load on first access; until the cache is ready we
  // fall through to the hardcoded map so the LLM gate never blocks
  // on I/O. Subsequent calls (post-bootstrap) hit the hot cache.
  if (!overrideCacheReady) {
    void ensureAgentBudgetOverridesLoaded();
  }
  const dbHit =
    agentBudgetOverrideCache.get(canonical) ?? agentBudgetOverrideCache.get(key);
  if (dbHit !== undefined) return dbHit;
  return AGENT_LIMITS_AED[key] ?? DEFAULT_AGENT_LIMIT_AED;
}

// USD price per 1K tokens, blended (input/output averaged for simplicity).
// Easy to extend by adding rows. We keep the values deliberately
// conservative (round up) so the budget gate fires earlier rather than
// later.
const MODEL_USD_PER_1K_TOKENS: Record<string, number> = {
  "gpt-4o-mini": 0.0006, // ~$0.15/M in + $0.60/M out, blended high
  "gpt-4o": 0.0125,
  "gpt-4.1-mini": 0.0008,
  "gpt-5.1": 0.005, // conservative placeholder until official pricing lands
};

function getUsdToAed(): number {
  const raw = Number(process.env.USD_TO_AED_RATE);
  return Number.isFinite(raw) && raw > 0 ? raw : 3.6725;
}

function getMonthlyBudgetAed(): number {
  const raw = Number(process.env.COMPANY_OS_MONTHLY_BUDGET_AED);
  return Number.isFinite(raw) && raw > 0 ? raw : 400;
}

// Strip the legacy LiteLLM-style `openai/` prefix so historical log
// rows written before the prefix was dropped still resolve to the
// correct rate instead of silently falling back to gpt-4o-mini's
// price.
function normalizeModelName(model: string): string {
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}

export function estimateCostAed(model: string, tokens: number): number {
  const key = normalizeModelName(model);
  const usdPer1k =
    MODEL_USD_PER_1K_TOKENS[key] ?? MODEL_USD_PER_1K_TOKENS[DEFAULT_MODEL];
  const usd = (tokens / 1000) * usdPer1k;
  return Number((usd * getUsdToAed()).toFixed(6));
}

export interface LogLlmCallInput {
  agentName: string;
  command?: string | null;
  inputPreview?: string | null;
  outputPreview?: string | null;
  model?: string;
  tokensUsed: number;
  status?: "ok" | "error" | "blocked_budget";
  errorMessage?: string | null;
}

function preview(s: string | null | undefined, max = 500): string | null {
  if (!s) return null;
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

export async function logLlmCall(input: LogLlmCallInput): Promise<void> {
  const model = input.model ?? DEFAULT_MODEL;
  const costAed = estimateCostAed(model, input.tokensUsed);
  try {
    await db.insert(companyOsLogs).values({
      agentName: input.agentName,
      command: input.command ?? null,
      inputPreview: preview(input.inputPreview),
      outputPreview: preview(input.outputPreview),
      model,
      tokensUsed: input.tokensUsed,
      costAed: costAed.toFixed(6),
      status: input.status ?? "ok",
      errorMessage: input.errorMessage ?? null,
    });
  } catch (err) {
    console.error("[companyOs] logLlmCall failed:", err);
  }
}

export interface BudgetVerdict {
  safe: boolean;
  spentAed: number;
  budgetAed: number;
  remainingAed: number;
  pctUsed: number; // 0..1
}

function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getMonthSpendAed(): Promise<number> {
  try {
    const since = startOfMonthUtc();
    const rows = await db
      .select({
        total: sql<string>`COALESCE(SUM(${companyOsLogs.costAed}), 0)`,
      })
      .from(companyOsLogs)
      .where(gte(companyOsLogs.createdAt, since));
    const raw = rows[0]?.total ?? "0";
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    console.error("[companyOs] getMonthSpendAed failed:", err);
    return 0;
  }
}

export async function getBudgetVerdict(): Promise<BudgetVerdict> {
  const budgetAed = getMonthlyBudgetAed();
  const spentAed = await getMonthSpendAed();
  const pctUsed = budgetAed > 0 ? spentAed / budgetAed : 0;
  const safe = pctUsed < 0.95;
  return {
    safe,
    spentAed: Number(spentAed.toFixed(2)),
    budgetAed,
    remainingAed: Number(Math.max(0, budgetAed - spentAed).toFixed(2)),
    pctUsed,
  };
}

export async function isBudgetSafe(): Promise<boolean> {
  return (await getBudgetVerdict()).safe;
}

// Per-agent cost + call-count breakdown for the current month. Backs the
// per-agent lines in the WhatsApp `costs` command and the
// `/api/company-os/finance` JSON.
export interface AgentSpendRow {
  agentName: string;
  spentAed: number;
  calls: number;
}

export async function getMonthSpendByAgent(): Promise<AgentSpendRow[]> {
  try {
    const since = startOfMonthUtc();
    const rows = await db
      .select({
        agentName: companyOsLogs.agentName,
        total: sql<string>`COALESCE(SUM(${companyOsLogs.costAed}), 0)`,
        c: count(),
      })
      .from(companyOsLogs)
      .where(gte(companyOsLogs.createdAt, since))
      .groupBy(companyOsLogs.agentName);
    return rows
      .map((r) => {
        const n = Number(r.total ?? "0");
        return {
          agentName: r.agentName,
          spentAed: Number((Number.isFinite(n) ? n : 0).toFixed(2)),
          calls: r.c,
        };
      })
      .sort((a, b) => b.spentAed - a.spentAed || a.agentName.localeCompare(b.agentName));
  } catch (err) {
    console.error("[companyOs] getMonthSpendByAgent failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-agent month-to-date spend + safety predicates. Used by the LLM
// wrapper to short-circuit before calling OpenAI when a single agent
// has spent more than its share of the monthly AED budget.
// ---------------------------------------------------------------------------

export interface AgentBudgetVerdict {
  agentName: string;
  spentAed: number;
  budgetAed: number;
  remainingAed: number;
  pctUsed: number; // 0..1
  safe: boolean;
}

/**
 * Return month-to-date spend in AED for a single agent. Always returns a
 * finite number (defaults to 0 on DB failure) — callers can compare
 * directly without null-checking.
 */
export async function getAgentSpendAed(agent: string): Promise<number> {
  if (!agent) return 0;
  try {
    const since = startOfMonthUtc();
    // Normalise the lookup key + match against EVERY known alias so
    // spend never gets split across naming variants — e.g. asking for
    // `marketingAgent` must still pick up rows logged under
    // `marketing`, and vice versa.
    const variants = aliasesForAgent(agent);
    const rows = await db
      .select({
        total: sql<string>`COALESCE(SUM(${companyOsLogs.costAed}), 0)`,
      })
      .from(companyOsLogs)
      .where(
        and(
          gte(companyOsLogs.createdAt, since),
          inArray(companyOsLogs.agentName, variants),
        ),
      );
    const n = Number(rows[0]?.total ?? "0");
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    console.error("[companyOs] getAgentSpendAed failed:", err);
    return 0;
  }
}

/**
 * Combined spend + cap dictionary for every known agent (plus any
 * agents already present in the logs). The Intelligence Agent's
 * dashboard surface uses this to render the per-agent budget bars.
 */
export async function getAllAgentSpendsAed(): Promise<AgentBudgetVerdict[]> {
  // Group by canonical agent name so logs written under aliases (e.g.
  // both `marketing` and `marketingAgent`) show up as a single row in
  // the budget report instead of two near-duplicates.
  const byAgent = await getMonthSpendByAgent();
  const totals = new Map<string, number>();
  for (const row of byAgent) {
    const canonical = canonicalAgentName(row.agentName);
    totals.set(canonical, (totals.get(canonical) ?? 0) + row.spentAed);
  }
  const out: AgentBudgetVerdict[] = [];
  for (const [agent, spent] of Array.from(totals.entries())) {
    const budget = getAgentBudgetAed(agent);
    const pct = budget > 0 ? spent / budget : 0;
    out.push({
      agentName: agent,
      spentAed: Number(spent.toFixed(2)),
      budgetAed: budget,
      remainingAed: Number(Math.max(0, budget - spent).toFixed(2)),
      pctUsed: pct,
      safe: pct < 0.95,
    });
  }
  // Surface configured agents even when they haven't spent anything
  // yet — but only ONE entry per canonical name (so we don't list
  // both `marketing` and `marketingAgent`).
  for (const canonical of CANONICAL_AGENT_NAMES) {
    if (totals.has(canonical)) continue;
    const budget = getAgentBudgetAed(canonical);
    out.push({
      agentName: canonical,
      spentAed: 0,
      budgetAed: budget,
      remainingAed: budget,
      pctUsed: 0,
      safe: true,
    });
  }
  return out.sort((a, b) => b.pctUsed - a.pctUsed || a.agentName.localeCompare(b.agentName));
}

/**
 * `true` when the agent has at least 5% of its monthly cap remaining.
 * Mirrors the global `isBudgetSafe` semantics so call sites can reason
 * about both gates the same way. Returns true on DB failure (fail-open
 * — a transient read error must not silently kill all agent work).
 */
export async function isAgentBudgetSafe(agent: string): Promise<boolean> {
  if (!agent) return true;
  const budget = getAgentBudgetAed(agent);
  if (budget <= 0) return true;
  const spent = await getAgentSpendAed(agent);
  return spent / budget < 0.95;
}

export async function getAgentBudgetVerdict(agent: string): Promise<AgentBudgetVerdict> {
  const budget = getAgentBudgetAed(agent);
  const spent = await getAgentSpendAed(agent);
  const pct = budget > 0 ? spent / budget : 0;
  return {
    agentName: agent,
    spentAed: Number(spent.toFixed(2)),
    budgetAed: budget,
    remainingAed: Number(Math.max(0, budget - spent).toFixed(2)),
    pctUsed: pct,
    safe: pct < 0.95,
  };
}

// Total cost in AED for a custom date range — used by the daily briefing
// and the WhatsApp `costs` command.
export async function getSpendBetween(from: Date, to: Date): Promise<number> {
  try {
    const rows = await db
      .select({
        total: sql<string>`COALESCE(SUM(${companyOsLogs.costAed}), 0)`,
      })
      .from(companyOsLogs)
      .where(and(gte(companyOsLogs.createdAt, from), lte(companyOsLogs.createdAt, to)));
    const n = Number(rows[0]?.total ?? "0");
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    console.error("[companyOs] getSpendBetween failed:", err);
    return 0;
  }
}
