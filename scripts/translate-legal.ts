/**
 * One-off: translate the 9 legal documents from English → Arabic
 * and emit `client/src/content/legal.ar.ts`.
 *
 * Run with:
 *   tsx scripts/translate-legal.ts
 */
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import {
  LEGAL_DOCS,
  LEGAL_DOC_INDEX,
  type LegalBlock,
  type LegalDoc,
} from "../client/src/content/legal";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MODEL = process.env.LEGAL_TRANSLATE_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a professional legal translator specialising in UAE legal and commercial Arabic.
Translate the user's English legal text into clear Modern Standard Arabic (Fus'ha) suitable for a UAE consumer-facing legal document.
Rules:
- Preserve meaning exactly. Do not summarise, expand, or add any disclaimer.
- Keep brand names ("Bareter", "Bareter FZ-LLC"), email addresses, URLs, currency codes (AED), and percentages exactly as in the source.
- Keep numeric references (e.g. "Federal Decree-Law No. 45 of 2021", "AED 375,000", "5%") in their original form, only translating the surrounding words.
- Translate UAE place names using their standard Arabic forms (Dubai → دبي, Abu Dhabi → أبوظبي, Sharjah → الشارقة, etc.).
- Do not add HTML, Markdown, or quotation marks unless they exist in the source.
- Return ONLY a JSON object of the form {"translations": ["...", "..."]} where the array has the same length and order as the input array.
- Each output string is the Arabic translation of the corresponding input string.`;

async function translateBatch(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  const userPayload = JSON.stringify({ texts }, null, 2);
  const res = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          "Translate every string in `texts` to Arabic per the rules. Input:\n" +
          userPayload,
      },
    ],
  });
  const raw = res.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as { translations?: string[] };
  if (!parsed.translations || parsed.translations.length !== texts.length) {
    throw new Error(
      `Translation count mismatch: expected ${texts.length}, got ${parsed.translations?.length ?? 0}`,
    );
  }
  return parsed.translations;
}

async function translateDoc(doc: LegalDoc): Promise<LegalDoc> {
  // Flatten every translatable string with addressing info so we can rebuild.
  type Slot =
    | { kind: "block-text"; index: number }
    | { kind: "list-item"; blockIndex: number; itemIndex: number }
    | { kind: "title" }
    | { kind: "subtitle" };

  const slots: Slot[] = [];
  const texts: string[] = [];

  texts.push(doc.title);
  slots.push({ kind: "title" });
  texts.push(doc.subtitle);
  slots.push({ kind: "subtitle" });

  doc.blocks.forEach((b, bi) => {
    if (b.type === "ul") {
      b.items.forEach((it, ii) => {
        texts.push(it);
        slots.push({ kind: "list-item", blockIndex: bi, itemIndex: ii });
      });
    } else {
      texts.push(b.text);
      slots.push({ kind: "block-text", index: bi });
    }
  });

  // Translate in chunks of ~30 strings, in parallel within a document.
  const CHUNK = 30;
  const out: string[] = new Array(texts.length);
  const chunkRanges: { start: number; end: number }[] = [];
  for (let i = 0; i < texts.length; i += CHUNK) {
    chunkRanges.push({ start: i, end: Math.min(i + CHUNK, texts.length) });
  }
  await Promise.all(
    chunkRanges.map(async ({ start, end }) => {
      const t = await translateBatch(texts.slice(start, end));
      for (let k = 0; k < t.length; k++) out[start + k] = t[k];
    }),
  );
  console.log(`  · ${doc.slug}: ${texts.length} strings translated in ${chunkRanges.length} chunks`);

  // Rebuild
  const arBlocks: LegalBlock[] = doc.blocks.map((b) => {
    if (b.type === "ul") return { type: "ul", items: [...b.items] };
    return { ...b };
  });
  let arTitle = doc.title;
  let arSubtitle = doc.subtitle;
  out.forEach((translated, idx) => {
    const slot = slots[idx];
    if (slot.kind === "title") arTitle = translated;
    else if (slot.kind === "subtitle") arSubtitle = translated;
    else if (slot.kind === "block-text") {
      const blk = arBlocks[slot.index];
      if (blk.type !== "ul") (blk as { text: string }).text = translated;
    } else {
      const blk = arBlocks[slot.blockIndex];
      if (blk.type === "ul") blk.items[slot.itemIndex] = translated;
    }
  });

  return { slug: doc.slug, title: arTitle, subtitle: arSubtitle, blocks: arBlocks };
}

async function main() {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY is not set");
  }

  // Translate all 9 documents in parallel.
  const docResults = await Promise.all(
    LEGAL_DOC_INDEX.map(async (meta) => {
      const eng = LEGAL_DOCS[meta.slug];
      if (!eng) return null;
      console.log(`Translating ${meta.slug} (${eng.blocks.length} blocks) …`);
      const ar = await translateDoc(eng);
      return ar;
    }),
  );

  const result: Record<string, LegalDoc> = {};
  const indexAr: { slug: string; title: string; subtitle: string }[] = [];
  for (const ar of docResults) {
    if (!ar) continue;
    result[ar.slug] = ar;
    indexAr.push({ slug: ar.slug, title: ar.title, subtitle: ar.subtitle });
  }

  const lines: string[] = [];
  lines.push("// AUTO-GENERATED by scripts/translate-legal.ts.");
  lines.push("// Source: client/src/content/legal.ts (English).");
  lines.push("// Do not edit by hand — re-run the script when the English text changes.");
  lines.push("");
  lines.push('import type { LegalDoc } from "./legal";');
  lines.push("");
  lines.push(
    "export const LEGAL_DOC_INDEX_AR: { slug: string; title: string; subtitle: string }[] = [",
  );
  for (const m of indexAr) {
    lines.push(
      `  { slug: ${JSON.stringify(m.slug)}, title: ${JSON.stringify(m.title)}, subtitle: ${JSON.stringify(m.subtitle)} },`,
    );
  }
  lines.push("];");
  lines.push("");
  lines.push("export const LEGAL_DOCS_AR: Record<string, LegalDoc> = {");
  for (const slug of Object.keys(result)) {
    const d = result[slug];
    lines.push(`  ${JSON.stringify(slug)}: {`);
    lines.push(`    slug: ${JSON.stringify(d.slug)},`);
    lines.push(`    title: ${JSON.stringify(d.title)},`);
    lines.push(`    subtitle: ${JSON.stringify(d.subtitle)},`);
    lines.push(`    blocks: ${JSON.stringify(d.blocks, null, 0)},`);
    lines.push("  },");
  }
  lines.push("};");
  lines.push("");

  const outPath = path.join("client", "src", "content", "legal.ar.ts");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
