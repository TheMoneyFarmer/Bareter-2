// Memory Agent — shared cross-agent memory for the Company OS.
//
// Every other agent can:
//   • `remember()` after a meaningful output (campaign won, lead converted,
//     dispute pattern, KPI the founder asked about, …),
//   • `recall(agent)` / `recallByKey(agent, type, key)` to read what's
//     been learned,
//   • `buildAgentContext(agent)` to drop a compact ≤800-char block into
//     the system prompt of the next LLM call so future replies see prior
//     learnings.
//
// Architectural rules from the task brief:
//   • Reads MUST never throw — empty/failed queries return [] or "".
//   • Writes MUST never block the agent's main response — callers wrap
//     `remember()` with `void Promise.resolve(remember(…)).catch(…)` so
//     the seeding error path is logged but the user still gets a reply.
//   • Memory `value` is JSON-stringified and rejected if > 4 KB; this is
//     enforced at the helper, not at the column, so the DB stays free of
//     CHECK constraints that complicate `db:push`.

import { and, desc, eq, sql as drizzleSql } from "drizzle-orm";
import { db } from "../db";
import { agentMemory, type AgentMemory } from "@shared/schema";

const VALUE_MAX_BYTES = 4096; // 4 KB hard cap on the JSON-stringified value
const CONTEXT_MAX_CHARS = 800; // budget cap for buildAgentContext output
const DEFAULT_RECALL_LIMIT = 20;
const CONTEXT_RECALL_LIMIT = 10;

// ---------------------------------------------------------------------------
// remember() — upsert one memory row.
// ---------------------------------------------------------------------------

export interface RememberInput {
  agentName: string;
  memoryType: string;
  key: string;
  value: unknown;
  /** 0..1 — how much to trust the new value. Defaults to 0.7. */
  confidence?: number;
}

export interface RememberResult {
  ok: boolean;
  id?: string;
  reason?: string;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function sanitizeKey(s: string): string {
  return String(s ?? "").trim().slice(0, 200);
}

/**
 * Upsert a memory row. On conflict (same agent + type + key) the value is
 * replaced and the confidence is updated as a 50/50 weighted average of
 * the existing and incoming values, so confidence trends toward the
 * latest signal without losing all history.
 *
 * Returns `{ ok: false, reason }` instead of throwing on validation
 * failures — callers seed memories from `void Promise` and shouldn't
 * crash the user-facing response on a bad value.
 */
export async function remember(input: RememberInput): Promise<RememberResult> {
  const agentName = sanitizeKey(input.agentName);
  const memoryType = sanitizeKey(input.memoryType);
  const key = sanitizeKey(input.key);
  if (!agentName || !memoryType || !key) {
    return { ok: false, reason: "agentName, memoryType and key are required" };
  }

  let json: string;
  try {
    json = JSON.stringify(input.value ?? null);
  } catch {
    return { ok: false, reason: "value is not JSON-serialisable" };
  }
  if (Buffer.byteLength(json, "utf8") > VALUE_MAX_BYTES) {
    return { ok: false, reason: `value exceeds ${VALUE_MAX_BYTES} byte cap` };
  }

  const incoming = clamp01(input.confidence ?? 0.7);
  const valueParsed = JSON.parse(json) as unknown;

  try {
    const inserted = await db
      .insert(agentMemory)
      .values({
        agentName,
        memoryType,
        key,
        value: valueParsed,
        confidence: incoming.toFixed(3),
      })
      .onConflictDoUpdate({
        target: [agentMemory.agentName, agentMemory.memoryType, agentMemory.key],
        set: {
          value: valueParsed,
          // Weighted average toward the new signal (50/50) so memories
          // adapt without overwriting history wholesale.
          confidence: drizzleSql`((${agentMemory.confidence}::numeric + ${incoming}) / 2)::numeric(4,3)`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: agentMemory.id });
    return { ok: true, id: inserted[0]?.id };
  } catch (err) {
    console.error("[companyOs.memory] remember upsert failed:", err);
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Reads — never throw.
// ---------------------------------------------------------------------------

/**
 * Recall up to `limit` memories for an agent, optionally filtered by
 * `memoryType`. Ordered by usageCount DESC then updatedAt DESC so the
 * most-relied-on entries lead. Returns `[]` on any failure.
 */
export async function recall(
  agent: string,
  type?: string,
  limit = DEFAULT_RECALL_LIMIT,
): Promise<AgentMemory[]> {
  const agentName = sanitizeKey(agent);
  if (!agentName) return [];
  const cap = Math.max(1, Math.min(200, limit));
  try {
    const where = type
      ? and(eq(agentMemory.agentName, agentName), eq(agentMemory.memoryType, sanitizeKey(type)))
      : eq(agentMemory.agentName, agentName);
    const rows = await db
      .select()
      .from(agentMemory)
      .where(where)
      .orderBy(desc(agentMemory.usageCount), desc(agentMemory.updatedAt))
      .limit(cap);
    return rows;
  } catch (err) {
    console.warn("[companyOs.memory] recall failed:", err);
    return [];
  }
}

/**
 * Look up a single memory by its (agent, type, key) tuple. Returns
 * `null` on any failure.
 */
export async function recallByKey(
  agent: string,
  type: string,
  key: string,
): Promise<AgentMemory | null> {
  const agentName = sanitizeKey(agent);
  const memoryType = sanitizeKey(type);
  const k = sanitizeKey(key);
  if (!agentName || !memoryType || !k) return null;
  try {
    const rows = await db
      .select()
      .from(agentMemory)
      .where(
        and(
          eq(agentMemory.agentName, agentName),
          eq(agentMemory.memoryType, memoryType),
          eq(agentMemory.key, k),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    console.warn("[companyOs.memory] recallByKey failed:", err);
    return null;
  }
}

/**
 * Fire-and-forget bump of a memory's usageCount + lastUsedAt. Errors are
 * logged and swallowed — never block the calling agent.
 */
export async function incrementUsage(id: string): Promise<void> {
  if (!id) return;
  try {
    await db
      .update(agentMemory)
      .set({
        usageCount: drizzleSql`${agentMemory.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(agentMemory.id, id));
  } catch (err) {
    console.warn("[companyOs.memory] incrementUsage failed:", err);
  }
}

// ---------------------------------------------------------------------------
// buildAgentContext() — compact text block for system prompts.
// ---------------------------------------------------------------------------

function previewValue(value: unknown): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return (s ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * Render an agent's top memories into a ≤800-char text block ready to
 * prefix to a system prompt. Returns "" when there are no memories or
 * the read fails — never throws.
 *
 * Side effect: bumps `usageCount` on each memory included in the
 * returned block (fire-and-forget) so `recall()` ordering reflects
 * actual demand, not just write cadence.
 */
export async function buildAgentContext(agent: string): Promise<string> {
  const memories = await recall(agent, undefined, CONTEXT_RECALL_LIMIT);
  if (memories.length === 0) return "";

  const header = `Prior learnings for ${sanitizeKey(agent)} agent (use to inform replies, never invent new facts):`;
  const lines: string[] = [header];
  const usedIds: string[] = [];
  let totalChars = header.length;

  for (const m of memories) {
    const line = `- [${m.memoryType}] ${m.key}: ${previewValue(m.value)} (conf=${Number(m.confidence).toFixed(2)}, used=${m.usageCount})`;
    if (totalChars + line.length + 1 > CONTEXT_MAX_CHARS) break;
    lines.push(line);
    usedIds.push(m.id);
    totalChars += line.length + 1;
  }

  if (usedIds.length > 0) {
    // Fire-and-forget — don't block the LLM call on a usage bump.
    void Promise.allSettled(usedIds.map((id) => incrementUsage(id))).catch(() => {});
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// WhatsApp surface — `memory` and `forget <agent> <key>` commands.
// ---------------------------------------------------------------------------

interface MemorySummaryRow {
  agentName: string;
  total: number;
  topKeys: { key: string; usageCount: number }[];
}

/**
 * Compose the `memory` WhatsApp command body — per-agent total + the 3
 * most-used keys. Always returns a usable string, even on DB failure.
 */
export async function getMemorySummary(): Promise<string> {
  let perAgent: MemorySummaryRow[] = [];
  try {
    const rows = await db
      .select()
      .from(agentMemory)
      .orderBy(desc(agentMemory.usageCount), desc(agentMemory.updatedAt));
    const groups = new Map<string, AgentMemory[]>();
    for (const r of rows) {
      const list = groups.get(r.agentName) ?? [];
      list.push(r);
      groups.set(r.agentName, list);
    }
    perAgent = Array.from(groups.entries())
      .map(([agentName, list]) => ({
        agentName,
        total: list.length,
        topKeys: list
          .slice(0, 3)
          .map((m) => ({ key: m.key, usageCount: m.usageCount })),
      }))
      .sort((a, b) => a.agentName.localeCompare(b.agentName));
  } catch (err) {
    console.warn("[companyOs.memory] getMemorySummary read failed:", err);
  }

  const lines: string[] = ["*Agent memory*"];
  if (perAgent.length === 0) {
    lines.push("No memories stored yet.");
    return lines.join("\n");
  }
  for (const a of perAgent) {
    lines.push(`• *${a.agentName}* — ${a.total} ${a.total === 1 ? "entry" : "entries"}`);
    for (const k of a.topKeys) {
      lines.push(`   · ${k.key} (used ${k.usageCount})`);
    }
  }
  lines.push("", "_Forget one:_ `forget <agent> <key>`");
  return lines.join("\n");
}

/**
 * Parse `forget <agent> <key>` (key may contain spaces — everything
 * after the agent name is treated as the key).
 */
export function parseForgetCommand(text: string): { agent: string; key: string } | null {
  const m = (text || "").trim().match(/^forget\s+(\S+)\s+(.+)$/i);
  if (!m) return null;
  const agent = sanitizeKey(m[1]);
  const key = sanitizeKey(m[2]);
  if (!agent || !key) return null;
  return { agent, key };
}

/**
 * Delete every memory matching `(agent, key)` regardless of memoryType.
 * Returns the number of rows deleted (0 when nothing matched).
 */
export async function forgetMemory(agent: string, key: string): Promise<number> {
  const agentName = sanitizeKey(agent);
  const k = sanitizeKey(key);
  if (!agentName || !k) return 0;
  try {
    const deleted = await db
      .delete(agentMemory)
      .where(and(eq(agentMemory.agentName, agentName), eq(agentMemory.key, k)))
      .returning({ id: agentMemory.id });
    return deleted.length;
  } catch (err) {
    console.error("[companyOs.memory] forgetMemory failed:", err);
    return 0;
  }
}

/**
 * Delete a single memory by primary key. Used by `DELETE /memory/:id`.
 * Returns true when a row was removed.
 */
export async function deleteMemoryById(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const deleted = await db
      .delete(agentMemory)
      .where(eq(agentMemory.id, id))
      .returning({ id: agentMemory.id });
    return deleted.length > 0;
  } catch (err) {
    console.error("[companyOs.memory] deleteMemoryById failed:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Convenience — list memories for the admin GET /memory route.
// ---------------------------------------------------------------------------

export interface ListMemoriesOpts {
  agent?: string;
  type?: string;
  limit?: number;
}

export async function listMemories(opts: ListMemoriesOpts = {}): Promise<AgentMemory[]> {
  const cap = Math.max(1, Math.min(500, opts.limit ?? 100));
  try {
    const filters: ReturnType<typeof eq>[] = [];
    if (opts.agent) filters.push(eq(agentMemory.agentName, sanitizeKey(opts.agent)));
    if (opts.type) filters.push(eq(agentMemory.memoryType, sanitizeKey(opts.type)));
    const baseQuery = db.select().from(agentMemory).$dynamic();
    const filtered = filters.length ? baseQuery.where(and(...filters)) : baseQuery;
    const rows = await filtered
      .orderBy(desc(agentMemory.usageCount), desc(agentMemory.updatedAt))
      .limit(cap);
    return rows;
  } catch (err) {
    console.warn("[companyOs.memory] listMemories failed:", err);
    return [];
  }
}

/**
 * Helper used by every other agent so they don't have to re-import the
 * `void Promise` boilerplate. Fire-and-forget; logs but never throws.
 *
 * We defer to `setImmediate` so the underlying Drizzle chain methods
 * (`db.insert(...).values(...)...`) don't run until the calling agent
 * function has returned. Without this, the memory write would interleave
 * with the agent's main DB writes and observers (tests + log filters)
 * couldn't tell which row belongs to which insert.
 */
export function rememberInBackground(input: RememberInput): void {
  setImmediate(() => {
    void remember(input).catch((err) => {
      console.warn("[companyOs.memory] background remember rejected:", err);
    });
  });
}
