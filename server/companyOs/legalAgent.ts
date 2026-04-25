// Legal Agent — UAE-jurisdiction barter contracts, dispute risk, VAT flags.
//
// What this ships:
//   • `buildContractBody` returns a deterministic UAE-jurisdiction barter
//     contract template (DIFC seat + UAE Federal Law No. 5 of 1985) in
//     English. `buildContractBodyArabic` returns the Arabic mirror, and
//     `buildContractBodies` dispatches by language ("en" | "ar" |
//     "bilingual"). Language defaults to "en" for backward compatibility.
//   • `generateContract` renders the contract to PDF via jsPDF, uploads
//     it to private object storage, persists a `legal_documents` row of
//     type `contract` (with `metadata.language` set), and returns the
//     row + a 7-day signed download URL. Arabic / bilingual PDFs embed
//     a Noto Sans Arabic TTF (~190 KB) and reshape the Arabic text to
//     presentation forms with simple bidi reordering so the rendered
//     page reads right-to-left correctly.
//   • `runDisputeRiskSummary` aggregates last-week reports (the only
//     reports/disputes table that actually exists in `shared/schema.ts`),
//     asks the LLM for 3 plain-English risk callouts, and persists a
//     `dispute_summary` row.
//   • `runVatCheck` aggregates `deals.seekerValue + deals.providerValue`
//     per user over the last rolling 12 months, flags everyone over the
//     soft (AED 150k) and hard (AED 187,500) thresholds, and persists a
//     `vat_flag` row.
//   • Each helper has a `handle…Command` wrapper that returns a
//     WhatsApp-shaped string for the Manager Agent to dispatch. The
//     `contract` command accepts an optional trailing `| <lang>` flag
//     (e.g. `contract A | B | x for y | 100 | ar`).
//
// What this DOES NOT do (and why):
//   • No DocuSign / Adobe Sign integration — the contracts are AI-drafted
//     starting points and explicitly disclaim that. The founder uploads
//     the signed PDF separately once both parties have wet-inked it.
//   • No FTA portal auto-filing — UAE FTA registration is a manual
//     e-services flow per user; the agent only flags candidates.
//   • No full Unicode Bidi Algorithm (UAX#9) implementation — we run a
//     run-level reorder over Arabic vs. non-Arabic spans which is
//     sufficient for the contract template (mostly Arabic with embedded
//     party names, dates, and AED figures). Edge cases like nested
//     numerals inside Arabic words are not perfect.

import fs from "node:fs";
import {
  and,
  desc,
  eq,
  gte,
  sql as drizzleSql,
  count,
} from "drizzle-orm";
import { jsPDF } from "jspdf";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ArabicShaper } = require("arabic-persian-reshaper") as {
  ArabicShaper: { convertArabic: (text: string) => string };
};
import { db } from "../db";
import {
  legalDocuments,
  reports,
  deals,
  users,
  type LegalDocument,
} from "@shared/schema";
import { jsonCompletion, type ChatMessage } from "../agents/llm";
import { logLlmCall, DEFAULT_MODEL } from "./costTracker";
import { uploadPrivateBuffer, getSignedDownloadUrl } from "./objectStorageHelpers";
import { dubaiDateString } from "./financeAgent";

const AGENT = "legalAgent";
export const CONTRACT_SIGNED_URL_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

// UAE VAT registration thresholds (per FTA, AED, rolling 12 months).
export const VAT_SOFT_THRESHOLD_AED = 150_000;
export const VAT_HARD_THRESHOLD_AED = 187_500;

const AI_DISCLAIMER =
  "DISCLAIMER: This document was AI-generated. Both parties should consult a UAE-qualified lawyer before signing.";

// ---------------------------------------------------------------------------
// Contract template + PDF
// ---------------------------------------------------------------------------

export type ContractLanguage = "en" | "ar" | "bilingual";
export const CONTRACT_LANGUAGES: ContractLanguage[] = ["en", "ar", "bilingual"];

export interface ContractInput {
  partyA: string;
  partyB: string;
  exchange: string; // free text — e.g. "10 hours photography for 1 week stay"
  valueAed: number;
  date?: string; // YYYY-MM-DD; defaults to today (Asia/Dubai)
  language?: ContractLanguage; // defaults to "en"
}

export interface ContractRenderInput extends ContractInput {
  date: string;
  language?: ContractLanguage;
}

export interface ContractBodies {
  en?: string;
  ar?: string;
}

/**
 * English contract body — UAE-jurisdiction template + AI disclaimer.
 * Kept short on purpose; the whole point of the disclaimer is that this
 * is a starting point, not a finished legal document.
 */
export function buildContractBody(input: ContractRenderInput): string {
  const { partyA, partyB, exchange, valueAed, date } = input;
  const valueStr = `AED ${Number(valueAed).toFixed(2)}`;
  return [
    "BARTER EXCHANGE AGREEMENT",
    "",
    `Date: ${date}`,
    `Jurisdiction: United Arab Emirates`,
    `Governing Law: UAE Federal Law No. (5) of 1985 (the Civil Transactions Law) and applicable UAE federal commercial legislation.`,
    `Seat of Dispute Resolution: Dubai International Financial Centre (DIFC) Courts; failing which, the competent UAE federal courts.`,
    "",
    "PARTIES",
    `Party A: ${partyA}`,
    `Party B: ${partyB}`,
    "",
    "1. SUBJECT OF EXCHANGE",
    `The Parties agree to exchange the following goods and/or services on a non-cash barter basis: ${exchange}.`,
    `The Parties acknowledge that the agreed fair-market value of the exchange, for accounting and tax purposes, is ${valueStr}.`,
    "",
    "2. DELIVERY & PERFORMANCE",
    "Each Party shall perform their respective obligations in good faith, on the timeline agreed between them in writing (including via the Bareter platform messaging system).",
    "Risk of loss for any tangible goods exchanged passes on physical hand-over.",
    "",
    "3. WARRANTIES",
    "Each Party warrants that (a) they have full legal capacity to enter into this Agreement; (b) the goods and/or services they are providing are owned by them or fully licensed; and (c) the exchange does not breach any applicable UAE law or third-party right.",
    "",
    "4. UAE VAT",
    "Where either Party is registered for UAE Value Added Tax (VAT), they shall issue a tax invoice to the other Party in accordance with UAE Federal Decree-Law No. (8) of 2017 and the FTA Executive Regulations, treating the agreed fair-market value above as the consideration.",
    "",
    "5. CONFIDENTIALITY",
    "Information exchanged for the purposes of performing this Agreement that is marked or reasonably understood to be confidential shall not be disclosed to any third party without prior written consent.",
    "",
    "6. DISPUTE RESOLUTION",
    "Any dispute arising out of or in connection with this Agreement, including any question regarding its existence, validity or termination, shall be referred to and finally resolved by the DIFC Courts. The Parties may, by mutual agreement, first attempt to resolve the dispute through mediation administered by a UAE-licensed mediation centre.",
    "",
    "7. FORCE MAJEURE",
    "Neither Party shall be liable for failure to perform where such failure is caused by an event beyond their reasonable control, including (without limitation) acts of government, natural disaster, or interruption of essential utilities.",
    "",
    "8. ENTIRE AGREEMENT",
    "This Agreement constitutes the entire understanding between the Parties on its subject matter and supersedes all prior discussions.",
    "",
    "SIGNATURES",
    `${partyA}: ____________________________   Date: __________`,
    `${partyB}: ____________________________   Date: __________`,
    "",
    AI_DISCLAIMER,
  ].join("\n");
}

const ARABIC_AI_DISCLAIMER =
  "إخلاء مسؤولية: تم إعداد هذا المستند بواسطة الذكاء الاصطناعي. على الطرفين استشارة محامٍ مؤهل في دولة الإمارات قبل التوقيع.";

/**
 * Arabic mirror of `buildContractBody` — same UAE jurisdiction template,
 * translated for use in courts and with local users that prefer Arabic.
 * Note: the body is returned in *logical* (Unicode) order; the renderer
 * is responsible for shaping (initial / medial / final glyph forms) and
 * bidi reordering so the final PDF reads right-to-left.
 */
export function buildContractBodyArabic(input: ContractRenderInput): string {
  const { partyA, partyB, exchange, valueAed, date } = input;
  const valueStr = `AED ${Number(valueAed).toFixed(2)}`;
  return [
    "اتفاقية تبادل مقايضة",
    "",
    `التاريخ: ${date}`,
    "الاختصاص القضائي: دولة الإمارات العربية المتحدة",
    "القانون الحاكم: القانون الاتحادي رقم (5) لسنة 1985 بإصدار قانون المعاملات المدنية لدولة الإمارات العربية المتحدة وما يرتبط به من تشريعات تجارية اتحادية.",
    "مقر تسوية النزاعات: محاكم مركز دبي المالي العالمي (DIFC)؛ وفي حال تعذر ذلك، المحاكم الاتحادية المختصة بدولة الإمارات.",
    "",
    "الأطراف",
    `الطرف الأول: ${partyA}`,
    `الطرف الثاني: ${partyB}`,
    "",
    "1. موضوع التبادل",
    `يتفق الطرفان على تبادل السلع و/أو الخدمات التالية على أساس مقايضة غير نقدية: ${exchange}.`,
    `يقر الطرفان بأن القيمة السوقية العادلة المتفق عليها للتبادل، لأغراض المحاسبة والضرائب، تبلغ ${valueStr}.`,
    "",
    "2. التسليم والتنفيذ",
    "يلتزم كل طرف بتنفيذ التزاماته بحسن نية وفقاً للجدول الزمني المتفق عليه كتابياً (بما في ذلك من خلال نظام المراسلة على منصة بارتر).",
    "ينتقل عبء الهلاك لأي سلع مادية يتم تبادلها إلى الطرف المستلم عند التسليم الفعلي.",
    "",
    "3. الإقرارات والضمانات",
    "يقر كل طرف بأن (أ) لديه الأهلية القانونية الكاملة لإبرام هذه الاتفاقية؛ و(ب) أن السلع و/أو الخدمات التي يقدمها مملوكة له بالكامل أو مرخصة قانونياً؛ و(ج) أن التبادل لا يخالف أي قانون اتحادي بدولة الإمارات أو أي حق لطرف ثالث.",
    "",
    "4. ضريبة القيمة المضافة",
    "في حال كان أي من الطرفين مسجلاً لضريبة القيمة المضافة في دولة الإمارات، فعليه إصدار فاتورة ضريبية للطرف الآخر وفقاً للمرسوم بقانون اتحادي رقم (8) لسنة 2017 واللوائح التنفيذية للهيئة الاتحادية للضرائب، باعتبار القيمة السوقية العادلة المذكورة أعلاه هي المقابل.",
    "",
    "5. السرية",
    "لا يجوز الإفصاح عن المعلومات المتبادلة لأغراض تنفيذ هذه الاتفاقية، التي تكون موسومة بالسرية أو يفهم بشكل معقول أنها سرية، إلى أي طرف ثالث دون موافقة كتابية مسبقة.",
    "",
    "6. تسوية النزاعات",
    "أي نزاع ينشأ عن أو يتعلق بهذه الاتفاقية، بما في ذلك أي مسألة تتعلق بوجودها أو صحتها أو إنهائها، تتم إحالته للفصل النهائي إلى محاكم مركز دبي المالي العالمي. ويجوز للطرفين بالاتفاق المتبادل محاولة تسوية النزاع أولاً عبر الوساطة لدى مركز وساطة مرخص في دولة الإمارات.",
    "",
    "7. القوة القاهرة",
    "لا يتحمل أي طرف المسؤولية عن إخفاقه في التنفيذ متى كان ذلك ناتجاً عن حدث خارج عن إرادته المعقولة، بما في ذلك على سبيل المثال لا الحصر، أعمال الحكومات أو الكوارث الطبيعية أو انقطاع المرافق الأساسية.",
    "",
    "8. مجمل الاتفاقية",
    "تمثل هذه الاتفاقية مجمل التفاهم بين الطرفين بشأن موضوعها، وتحل محل جميع المناقشات والمراسلات السابقة.",
    "",
    "التوقيعات",
    `${partyA}: ____________________________   التاريخ: __________`,
    `${partyB}: ____________________________   التاريخ: __________`,
    "",
    ARABIC_AI_DISCLAIMER,
  ].join("\n");
}

/**
 * Dispatch to one or both bodies based on the requested language. Defaults
 * to English when `language` is unset or unrecognised so existing callers
 * (and the prior single-language tests) keep working unchanged.
 */
export function buildContractBodies(input: ContractRenderInput): ContractBodies {
  const lang: ContractLanguage = input.language ?? "en";
  switch (lang) {
    case "ar":
      return { ar: buildContractBodyArabic(input) };
    case "bilingual":
      return {
        en: buildContractBody(input),
        ar: buildContractBodyArabic(input),
      };
    case "en":
    default:
      return { en: buildContractBody(input) };
  }
}

// ---------------------------------------------------------------------------
// Arabic font + bidi helpers
// ---------------------------------------------------------------------------

const ARABIC_FONT_NAME = "NotoSansArabic";
const ARABIC_FONT_FILE = "NotoSansArabic-Regular.ttf";

let cachedArabicFontBase64: string | null | undefined;

/**
 * Load the Noto Sans Arabic TTF from `node_modules` once per process and
 * cache as base64 for jsPDF's VFS. Returns `null` if the font is not
 * available (e.g. node_modules pruned in some deployment), in which case
 * the renderer falls back to helvetica — Arabic glyphs won't render but
 * the page structure is still produced so the founder can re-generate.
 */
function loadArabicFontBase64(): string | null {
  if (cachedArabicFontBase64 !== undefined) return cachedArabicFontBase64;
  try {
    const fontPath = require.resolve(
      "@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf",
    );
    cachedArabicFontBase64 = fs.readFileSync(fontPath).toString("base64");
    return cachedArabicFontBase64;
  } catch (err) {
    console.warn("[companyOs.legal] Arabic font not available:", err);
    cachedArabicFontBase64 = null;
    return null;
  }
}

function ensureArabicFont(doc: jsPDF): boolean {
  const b64 = loadArabicFontBase64();
  if (!b64) return false;
  try {
    doc.addFileToVFS(ARABIC_FONT_FILE, b64);
    doc.addFont(ARABIC_FONT_FILE, ARABIC_FONT_NAME, "normal");
    return true;
  } catch (err) {
    console.warn("[companyOs.legal] Arabic font registration failed:", err);
    return false;
  }
}

function isArabicChar(code: number): boolean {
  return (
    (code >= 0x0600 && code <= 0x06ff) || // Arabic
    (code >= 0xfb50 && code <= 0xfdff) || // Arabic Presentation Forms-A
    (code >= 0xfe70 && code <= 0xfeff) // Arabic Presentation Forms-B
  );
}

/**
 * Run-level RTL reorder over a *shaped* (presentation-form) Arabic line.
 * Splits into Arabic vs. non-Arabic spans, reverses the order of the
 * spans (so what should appear rightmost is rendered first by jsPDF's
 * left-to-right text engine), and reverses the Arabic spans' character
 * order. Latin / digit spans keep their natural reading order. This is
 * a deliberate simplification of UAX#9 sufficient for our template.
 */
function bidiReorder(shaped: string): string {
  if (!shaped) return shaped;
  type Run = { ar: boolean; text: string };
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (const ch of shaped) {
    const ar = isArabicChar(ch.codePointAt(0) ?? 0);
    if (!cur || cur.ar !== ar) {
      cur = { ar, text: ch };
      runs.push(cur);
    } else {
      cur.text += ch;
    }
  }
  const out: string[] = [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    out.push(r.ar ? Array.from(r.text).reverse().join("") : r.text);
  }
  return out.join("");
}

/**
 * Reshape Arabic Unicode (U+06xx) into Arabic Presentation Forms
 * (U+FExx) so jsPDF — which doesn't itself do letter-form joining —
 * renders connected Arabic letters. Then run our run-level bidi reorder
 * so the final string can be written by jsPDF in left-to-right order
 * but display right-to-left on the page.
 */
function prepareArabicLine(text: string): string {
  return bidiReorder(ArabicShaper.convertArabic(text));
}

const ARABIC_HEADER_TITLES = new Set([
  "اتفاقية تبادل مقايضة",
  "الأطراف",
  "التوقيعات",
]);

function isHeaderLine(rawLine: string, isArabic: boolean): boolean {
  const trimmed = rawLine.trim();
  if (!trimmed) return false;
  // Numbered section start (works in both languages).
  if (/^\d+\.\s+/.test(trimmed)) return true;
  if (isArabic) return ARABIC_HEADER_TITLES.has(trimmed);
  // English: all-caps Latin-only headers (existing behaviour).
  return /^[A-Z0-9 .&]+$/.test(trimmed);
}

function renderEnglishSection(
  doc: jsPDF,
  input: ContractRenderInput,
  body: string,
  startNewPage: boolean,
): void {
  if (startNewPage) doc.addPage();
  const left = 18;
  const right = 192;
  const maxWidth = right - left;
  let y = 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Bareter — Barter Exchange Agreement", left, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${input.partyA}  ⇄  ${input.partyB}`, left, y);
  y += 5;
  doc.text(
    `Value: AED ${Number(input.valueAed).toFixed(2)} · Date: ${input.date}`,
    left,
    y,
  );
  y += 8;

  doc.setFontSize(11);
  for (const rawLine of body.split("\n")) {
    if (y > 275) {
      doc.addPage();
      y = 22;
    }
    if (rawLine.trim().length === 0) {
      y += 3;
      continue;
    }
    doc.setFont("helvetica", isHeaderLine(rawLine, false) ? "bold" : "normal");
    const wrapped = doc.splitTextToSize(rawLine, maxWidth);
    doc.text(wrapped, left, y);
    y += wrapped.length * 5 + 1;
  }
}

function renderArabicSection(
  doc: jsPDF,
  input: ContractRenderInput,
  body: string,
  startNewPage: boolean,
  arabicFontReady: boolean,
): void {
  if (startNewPage) doc.addPage();
  const left = 18;
  const right = 192;
  const maxWidth = right - left;
  let y = 22;

  // Header strip — bilingual title so an English-only reader still knows
  // what they're looking at; helvetica works for the Latin half.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Bareter — اتفاقية تبادل مقايضة", left, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Value: AED ${Number(input.valueAed).toFixed(2)} · Date: ${input.date}`,
    left,
    y,
  );
  y += 7;

  // Switch to the embedded Arabic font for the body. jsPDF's helvetica
  // can't render Arabic glyphs at all, so without the embedded TTF the
  // body would come out as boxes — the early return logs a warning and
  // leaves the section header so the page isn't blank.
  if (!arabicFontReady) {
    doc.text(
      "(Arabic font not available — re-render once node_modules is restored.)",
      left,
      y,
    );
    return;
  }

  doc.setFont(ARABIC_FONT_NAME, "normal");
  doc.setFontSize(12);
  for (const rawLine of body.split("\n")) {
    if (y > 275) {
      doc.addPage();
      y = 22;
      doc.setFont(ARABIC_FONT_NAME, "normal");
      doc.setFontSize(12);
    }
    if (rawLine.trim().length === 0) {
      y += 3;
      continue;
    }
    const isHeader = isHeaderLine(rawLine, true);
    doc.setFontSize(isHeader ? 13 : 12);
    const visual = prepareArabicLine(rawLine);
    const wrapped = doc.splitTextToSize(visual, maxWidth);
    // Right-align the wrapped lines individually so each visual line
    // hugs the right margin of the page.
    for (const line of wrapped as string[]) {
      doc.text(line, right, y, { align: "right" });
      y += 6;
    }
    y += 1;
  }
}

/**
 * Render the contract PDF. `bodies` may carry an English body, an Arabic
 * body, or both (bilingual). For bilingual contracts we render English
 * pages first followed by Arabic pages; this keeps the English signature
 * block on its own pages so a non-Arabic-reading counter-party can still
 * sign without flipping pages.
 */
export function renderContractPdf(
  input: ContractRenderInput,
  bodies: ContractBodies | string,
): Buffer {
  const doc = new jsPDF();
  // Backwards compatibility: a string `bodies` arg is treated as the
  // English body (matches the previous single-language signature).
  const normalised: ContractBodies =
    typeof bodies === "string" ? { en: bodies } : bodies;

  const arabicFontReady = normalised.ar ? ensureArabicFont(doc) : false;

  let needNewPage = false;
  if (normalised.en) {
    renderEnglishSection(doc, input, normalised.en, false);
    needNewPage = true;
  }
  if (normalised.ar) {
    renderArabicSection(
      doc,
      input,
      normalised.ar,
      needNewPage,
      arabicFontReady,
    );
  }

  // If neither body was supplied (shouldn't happen via the public API),
  // produce a 1-line stub so the output isn't a totally empty PDF.
  if (!normalised.en && !normalised.ar) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("(empty contract)", 18, 22);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export interface GeneratedContract {
  document: LegalDocument;
  signedUrl: string | null;
}

function normaliseLanguage(language: ContractLanguage | undefined): ContractLanguage {
  if (language === "ar" || language === "bilingual") return language;
  return "en";
}

function languageTitleSuffix(language: ContractLanguage): string {
  switch (language) {
    case "ar":
      return " [AR]";
    case "bilingual":
      return " [EN+AR]";
    default:
      return "";
  }
}

/**
 * End-to-end: render PDF → upload → insert row → return signed URL.
 * The PDF upload is best-effort; if it fails the row still exists with
 * `objectStorageKey: null` so the founder can re-render later.
 */
export async function generateContract(input: ContractInput): Promise<GeneratedContract> {
  const date = input.date || dubaiDateString();
  const language = normaliseLanguage(input.language);
  const renderInput: ContractRenderInput = {
    partyA: input.partyA.trim().slice(0, 200),
    partyB: input.partyB.trim().slice(0, 200),
    exchange: input.exchange.trim().slice(0, 1000),
    valueAed: Number(input.valueAed),
    date,
    language,
  };
  const bodies = buildContractBodies(renderInput);
  // Persisted body keeps both languages for easy admin review when
  // bilingual; for single-language contracts only that language goes in.
  const persistedBody = [bodies.en, bodies.ar].filter(Boolean).join(
    "\n\n--------------------\n\n",
  );
  const title = `Barter contract: ${renderInput.partyA} ⇄ ${renderInput.partyB} (${date})${languageTitleSuffix(language)}`;

  // Insert the row first so we have a UUID for the storage key.
  const insertedRows = await db
    .insert(legalDocuments)
    .values({
      documentType: "contract",
      title,
      partyA: renderInput.partyA,
      partyB: renderInput.partyB,
      valueAed: renderInput.valueAed.toFixed(2),
      body: persistedBody,
      metadata: { exchange: renderInput.exchange, date, language },
      objectStorageKey: null,
      status: "draft",
    })
    .returning();
  const row = insertedRows[0];
  if (!row) throw new Error("Failed to insert legal_documents row");

  let signedUrl: string | null = null;
  let finalRow: LegalDocument = row;
  try {
    const pdf = renderContractPdf(renderInput, bodies);
    const key = `companyOs/legal/${row.id}.pdf`;
    await uploadPrivateBuffer(key, pdf, "application/pdf");
    signedUrl = await getSignedDownloadUrl(key, CONTRACT_SIGNED_URL_TTL_SEC);
    const updated = await db
      .update(legalDocuments)
      .set({
        objectStorageKey: key,
        status: "generated",
        updatedAt: new Date(),
      })
      .where(eq(legalDocuments.id, row.id))
      .returning();
    finalRow = updated[0] ?? { ...row, objectStorageKey: key, status: "generated" };
  } catch (err) {
    console.error("[companyOs.legal] PDF render/upload failed:", err);
  }

  await logLlmCall({
    agentName: AGENT,
    command: "contract",
    inputPreview: `${renderInput.partyA} ⇄ ${renderInput.partyB} for AED ${renderInput.valueAed} [${language}]`,
    outputPreview: title,
    tokensUsed: 0,
  });

  return { document: finalRow, signedUrl };
}

// ---------------------------------------------------------------------------
// Dispute risk aggregator
// ---------------------------------------------------------------------------

export interface DisputeBreakdown {
  reason: string;
  targetType: string;
  count: number;
}

export interface DisputeRiskSnapshot {
  windowDays: number;
  totalReports: number;
  byReason: { reason: string; count: number }[];
  byTargetType: { targetType: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

/**
 * Aggregate the last `windowDays` of `reports`. Errors degrade to an
 * empty snapshot so the cron job and WhatsApp command don't crash.
 */
export async function gatherDisputeData(windowDays = 7): Promise<DisputeRiskSnapshot> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  try {
    const [byReason, byTarget, byStatus, total] = await Promise.all([
      db
        .select({ reason: reports.reason, c: count() })
        .from(reports)
        .where(gte(reports.createdAt, since))
        .groupBy(reports.reason)
        .orderBy(desc(count())),
      db
        .select({ targetType: reports.targetType, c: count() })
        .from(reports)
        .where(gte(reports.createdAt, since))
        .groupBy(reports.targetType)
        .orderBy(desc(count())),
      db
        .select({ status: reports.status, c: count() })
        .from(reports)
        .where(gte(reports.createdAt, since))
        .groupBy(reports.status)
        .orderBy(desc(count())),
      db
        .select({ c: count() })
        .from(reports)
        .where(gte(reports.createdAt, since)),
    ]);
    return {
      windowDays,
      totalReports: total[0]?.c ?? 0,
      byReason: byReason.map((r) => ({ reason: String(r.reason), count: r.c })),
      byTargetType: byTarget.map((r) => ({ targetType: String(r.targetType), count: r.c })),
      byStatus: byStatus.map((r) => ({ status: String(r.status), count: r.c })),
    };
  } catch (err) {
    console.error("[companyOs.legal] gatherDisputeData failed:", err);
    return {
      windowDays,
      totalReports: 0,
      byReason: [],
      byTargetType: [],
      byStatus: [],
    };
  }
}

const DISPUTE_RISK_SYSTEM_PROMPT = `You are the Legal Agent for Bareter, a UAE barter marketplace.

Read the dispute / report data the founder gives you and produce 3 short, plain-English risk callouts.

Rules:
- Each callout: 1-2 sentences max, written for a non-lawyer founder.
- Reference UAE-specific concerns where relevant (consumer protection, FTA reporting, DIFC dispute escalation).
- Do NOT invent numbers — only refer to what is in the JSON.
- Output strict JSON: { "callouts": [string, string, string] }.`;

export async function generateDisputeCallouts(
  snapshot: DisputeRiskSnapshot,
): Promise<string[]> {
  if (snapshot.totalReports === 0) {
    return [
      "No new reports filed this week — keep monitoring; absence of reports is not absence of risk.",
      "Schedule a quarterly review of the platform's terms of service to stay aligned with UAE consumer-protection updates.",
      "Re-confirm KYC / business-license verification stays current to reduce future scam-report exposure.",
    ];
  }
  const messages: ChatMessage[] = [
    { role: "system", content: DISPUTE_RISK_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Last ${snapshot.windowDays} days of reports (JSON):\n${JSON.stringify(snapshot, null, 2)}`,
    },
  ];
  try {
    const { data } = await jsonCompletion<{ callouts: string[] }>(messages, {
      agentName: AGENT,
      command: "dispute_risk_callouts",
      model: DEFAULT_MODEL,
      temperature: 0.3,
      maxTokens: 400,
      // Per-agent budget breach: hand back an empty callouts array
      // so the caller still falls into its "review the raw counts"
      // copy below instead of throwing.
      agentBudgetJsonFallback: { callouts: [] },
    });
    const callouts = Array.isArray(data?.callouts)
      ? data.callouts.map((c) => String(c).slice(0, 400)).filter(Boolean)
      : [];
    return callouts.slice(0, 3);
  } catch (err) {
    console.error("[companyOs.legal] generateDisputeCallouts failed:", err);
    return [
      "(LLM unavailable — review the raw counts above and follow up on `actioned` reports first.)",
    ];
  }
}

export interface DisputeRiskResult {
  document: LegalDocument | null;
  snapshot: DisputeRiskSnapshot;
  callouts: string[];
}

export async function runDisputeRiskSummary(windowDays = 7): Promise<DisputeRiskResult> {
  const snapshot = await gatherDisputeData(windowDays);
  const callouts = await generateDisputeCallouts(snapshot);
  const date = dubaiDateString();
  const body = formatDisputeSummaryBody(snapshot, callouts);
  let document: LegalDocument | null = null;
  try {
    const inserted = await db
      .insert(legalDocuments)
      .values({
        documentType: "dispute_summary",
        title: `Dispute risk summary · ${date}`,
        partyA: null,
        partyB: null,
        valueAed: null,
        body,
        metadata: { snapshot, callouts },
        objectStorageKey: null,
        status: "generated",
      })
      .returning();
    document = inserted[0] ?? null;
  } catch (err) {
    console.error("[companyOs.legal] persist dispute_summary failed:", err);
  }
  return { document, snapshot, callouts };
}

function formatDisputeSummaryBody(
  snapshot: DisputeRiskSnapshot,
  callouts: string[],
): string {
  const lines: string[] = [
    `Dispute risk summary · last ${snapshot.windowDays} days`,
    `Total reports: ${snapshot.totalReports}`,
    "",
  ];
  if (snapshot.byReason.length) {
    lines.push("By reason:");
    for (const r of snapshot.byReason) lines.push(`  • ${r.reason}: ${r.count}`);
    lines.push("");
  }
  if (snapshot.byTargetType.length) {
    lines.push("By target type:");
    for (const r of snapshot.byTargetType) lines.push(`  • ${r.targetType}: ${r.count}`);
    lines.push("");
  }
  if (snapshot.byStatus.length) {
    lines.push("By status:");
    for (const r of snapshot.byStatus) lines.push(`  • ${r.status}: ${r.count}`);
    lines.push("");
  }
  lines.push("Risk callouts:");
  for (const c of callouts) lines.push(`  - ${c}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// VAT checker
// ---------------------------------------------------------------------------

export interface VatUserRow {
  userId: string;
  email: string | null;
  fullName: string | null;
  totalAed: number;
  dealsCount: number;
  approachingThreshold: boolean; // >= soft, < hard
  overThreshold: boolean; // >= hard
}

export interface VatSnapshot {
  windowDays: number;
  softThresholdAed: number;
  hardThresholdAed: number;
  approachingCount: number;
  overCount: number;
  totalCompletedAed: number;
  totalCompletedDeals: number;
  flagged: VatUserRow[];
}

/**
 * Aggregate completed deal value per user over the last 365 days. We sum
 * the seeker- and provider-side values for any deal each user took part
 * in (each side counts toward that user's individual threshold).
 *
 * Errors degrade to an empty snapshot.
 */
export async function gatherVatData(windowDays = 365): Promise<VatSnapshot> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  try {
    const [perUser, totals] = await Promise.all([
      db.execute<{
        user_id: string;
        email: string | null;
        full_name: string | null;
        total_aed: string;
        deals_count: string;
      }>(drizzleSql`
        WITH per_user AS (
          SELECT seeker_id AS user_id,
                 SUM(seeker_value::numeric) AS total_aed,
                 COUNT(*) AS deals_count
          FROM deals
          WHERE state = 'completed'
            AND created_at >= ${since}
          GROUP BY seeker_id
          UNION ALL
          SELECT provider_id AS user_id,
                 SUM(provider_value::numeric) AS total_aed,
                 COUNT(*) AS deals_count
          FROM deals
          WHERE state = 'completed'
            AND created_at >= ${since}
          GROUP BY provider_id
        ),
        totals AS (
          SELECT user_id,
                 SUM(total_aed) AS total_aed,
                 SUM(deals_count) AS deals_count
          FROM per_user
          GROUP BY user_id
        )
        SELECT t.user_id, u.email, u.full_name,
               t.total_aed::text AS total_aed,
               t.deals_count::text AS deals_count
        FROM totals t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.total_aed >= ${VAT_SOFT_THRESHOLD_AED}
        ORDER BY t.total_aed DESC
        LIMIT 200;
      `),
      db
        .select({
          totalAed: drizzleSql<string>`COALESCE(SUM(${deals.seekerValue}::numeric + ${deals.providerValue}::numeric), 0)`,
          dealsCount: count(),
        })
        .from(deals)
        .where(and(eq(deals.state, "completed"), gte(deals.createdAt, since))),
    ]);

    // drizzle's `db.execute` with neon-http returns `{ rows: [...] }`.
    const rawRows: Array<{
      user_id: string;
      email: string | null;
      full_name: string | null;
      total_aed: string;
      deals_count: string;
    }> = Array.isArray((perUser as unknown as { rows?: unknown[] }).rows)
      ? ((perUser as unknown as { rows: typeof rawRows }).rows ?? [])
      : (perUser as unknown as typeof rawRows);

    const flagged: VatUserRow[] = rawRows.map((r) => {
      const totalAed = Number(r.total_aed) || 0;
      const dealsCount = Number(r.deals_count) || 0;
      const overThreshold = totalAed >= VAT_HARD_THRESHOLD_AED;
      return {
        userId: r.user_id,
        email: r.email,
        fullName: r.full_name,
        totalAed,
        dealsCount,
        overThreshold,
        approachingThreshold: !overThreshold && totalAed >= VAT_SOFT_THRESHOLD_AED,
      };
    });

    return {
      windowDays,
      softThresholdAed: VAT_SOFT_THRESHOLD_AED,
      hardThresholdAed: VAT_HARD_THRESHOLD_AED,
      approachingCount: flagged.filter((f) => f.approachingThreshold).length,
      overCount: flagged.filter((f) => f.overThreshold).length,
      totalCompletedAed: Number(totals[0]?.totalAed ?? 0),
      totalCompletedDeals: totals[0]?.dealsCount ?? 0,
      flagged,
    };
  } catch (err) {
    console.error("[companyOs.legal] gatherVatData failed:", err);
    return {
      windowDays,
      softThresholdAed: VAT_SOFT_THRESHOLD_AED,
      hardThresholdAed: VAT_HARD_THRESHOLD_AED,
      approachingCount: 0,
      overCount: 0,
      totalCompletedAed: 0,
      totalCompletedDeals: 0,
      flagged: [],
    };
  }
}

export interface VatCheckResult {
  document: LegalDocument | null;
  snapshot: VatSnapshot;
}

export async function runVatCheck(): Promise<VatCheckResult> {
  const snapshot = await gatherVatData(365);
  const date = dubaiDateString();
  const body = formatVatBody(snapshot);
  let document: LegalDocument | null = null;
  // Only persist a row when there's something worth flagging — otherwise
  // we'd accumulate an empty `vat_flag` per command call.
  if (snapshot.approachingCount + snapshot.overCount > 0) {
    try {
      const inserted = await db
        .insert(legalDocuments)
        .values({
          documentType: "vat_flag",
          title: `VAT threshold check · ${date}`,
          partyA: null,
          partyB: null,
          valueAed: snapshot.totalCompletedAed.toFixed(2),
          body,
          metadata: { snapshot },
          objectStorageKey: null,
          status: "generated",
        })
        .returning();
      document = inserted[0] ?? null;
    } catch (err) {
      console.error("[companyOs.legal] persist vat_flag failed:", err);
    }
  }
  return { document, snapshot };
}

function formatVatBody(snapshot: VatSnapshot): string {
  const lines: string[] = [
    `UAE VAT threshold check (${snapshot.windowDays}-day rolling window)`,
    `Soft alert: AED ${snapshot.softThresholdAed.toLocaleString()} · Mandatory registration: AED ${snapshot.hardThresholdAed.toLocaleString()}`,
    "",
    `Total completed deal value: AED ${snapshot.totalCompletedAed.toFixed(2)} across ${snapshot.totalCompletedDeals} deals`,
    `Users approaching threshold: ${snapshot.approachingCount}`,
    `Users at/over mandatory threshold: ${snapshot.overCount}`,
    "",
  ];
  if (snapshot.flagged.length === 0) {
    lines.push("No users flagged.");
    return lines.join("\n");
  }
  lines.push("Flagged users:");
  for (const u of snapshot.flagged) {
    const tag = u.overThreshold ? "OVER" : "APPROACHING";
    lines.push(
      `  [${tag}] ${u.fullName ?? u.userId} (${u.email ?? "no email"}): AED ${u.totalAed.toFixed(2)} across ${u.dealsCount} deals`,
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Read helpers — admin router uses these.
// ---------------------------------------------------------------------------

export async function getRecentLegalDocuments(limit = 50): Promise<LegalDocument[]> {
  return db
    .select()
    .from(legalDocuments)
    .orderBy(desc(legalDocuments.createdAt))
    .limit(limit);
}

export async function getLegalDocumentById(id: string): Promise<LegalDocument | null> {
  const rows = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// WhatsApp command surface
// ---------------------------------------------------------------------------

// `contract <partyA> | <partyB> | <exchange> | <valueAed> [| <lang>]`
// where <lang> is one of `en` (default), `ar`, or `bilingual` (also `bi`).
const CONTRACT_RE =
  /^contract\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*([\d.]+)(?:\s*\|\s*([A-Za-z]+))?\s*$/i;

export interface ParsedContractCommand {
  partyA: string;
  partyB: string;
  exchange: string;
  valueAed: number;
  language: ContractLanguage;
}

function parseLanguageFlag(raw: string | undefined): ContractLanguage | null {
  if (!raw) return "en";
  const lower = raw.trim().toLowerCase();
  if (lower === "en" || lower === "english") return "en";
  if (lower === "ar" || lower === "arabic") return "ar";
  if (lower === "bilingual" || lower === "bi" || lower === "both") return "bilingual";
  return null;
}

export function parseContractCommand(text: string): ParsedContractCommand | null {
  const m = text.trim().match(CONTRACT_RE);
  if (!m) return null;
  const partyA = m[1].trim();
  const partyB = m[2].trim();
  const exchange = m[3].trim();
  const value = Number(m[4]);
  const language = parseLanguageFlag(m[5]);
  if (!partyA || !partyB || !exchange) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000_000) return null;
  if (language === null) return null;
  return {
    partyA: partyA.slice(0, 200),
    partyB: partyB.slice(0, 200),
    exchange: exchange.slice(0, 1000),
    valueAed: value,
    language,
  };
}

function languageLabel(language: ContractLanguage): string {
  switch (language) {
    case "ar":
      return "Arabic";
    case "bilingual":
      return "Bilingual (EN + AR)";
    default:
      return "English";
  }
}

export async function handleContractCommand(rawText: string): Promise<string> {
  const parsed = parseContractCommand(rawText);
  if (!parsed) {
    return [
      "Usage: `contract <partyA> | <partyB> | <exchange> | <valueAed> [| <lang>]`",
      "`<lang>` is `en` (default), `ar`, or `bilingual`.",
      "Example: `contract Acme Studios | Palm Hotel | 10 hours photography for 1 week stay | 8500 | ar`",
    ].join("\n");
  }
  try {
    const { document, signedUrl } = await generateContract(parsed);
    const lines: string[] = [
      `📝 *Contract drafted* — ${document.partyA} ⇄ ${document.partyB}`,
      `Value: AED ${Number(document.valueAed ?? 0).toFixed(2)}`,
      `Language: ${languageLabel(parsed.language)}`,
    ];
    if (signedUrl) {
      lines.push(`PDF (7-day signed link): ${signedUrl}`);
    } else {
      lines.push(
        "(PDF upload failed — the contract row is saved; check object storage logs.)",
      );
    }
    lines.push("", "_AI-generated. Both parties should consult a UAE-qualified lawyer before signing._");
    return lines.join("\n");
  } catch (err) {
    console.error("[companyOs.legal] contract command failed:", err);
    return "Couldn't draft that contract — check the server logs.";
  }
}

export async function handleDisputeRiskCommand(rawText: string): Promise<string> {
  void rawText;
  try {
    const { snapshot, callouts } = await runDisputeRiskSummary(7);
    const lines: string[] = [
      `*Dispute risk · last ${snapshot.windowDays} days*`,
      `Total reports: ${snapshot.totalReports}`,
    ];
    if (snapshot.byReason.length > 0) {
      lines.push("");
      lines.push("*By reason*");
      for (const r of snapshot.byReason) lines.push(`• ${r.reason}: ${r.count}`);
    }
    if (snapshot.byStatus.length > 0) {
      lines.push("");
      lines.push("*By status*");
      for (const r of snapshot.byStatus) lines.push(`• ${r.status}: ${r.count}`);
    }
    lines.push("");
    lines.push("*Risk callouts*");
    for (const c of callouts) lines.push(`• ${c}`);
    return lines.join("\n");
  } catch (err) {
    console.error("[companyOs.legal] dispute risk command failed:", err);
    return "Couldn't compile the dispute risk summary — check the server logs.";
  }
}

export async function handleVatCheckCommand(rawText: string): Promise<string> {
  void rawText;
  try {
    const { snapshot } = await runVatCheck();
    const lines: string[] = [
      `*UAE VAT check · last 12 months*`,
      `Soft alert: AED ${snapshot.softThresholdAed.toLocaleString()}`,
      `Mandatory registration: AED ${snapshot.hardThresholdAed.toLocaleString()}`,
      "",
      `Total completed deal value: AED ${snapshot.totalCompletedAed.toFixed(2)} across ${snapshot.totalCompletedDeals} deals`,
      `Users approaching: ${snapshot.approachingCount}`,
      `Users at/over threshold: ${snapshot.overCount}`,
    ];
    if (snapshot.flagged.length > 0) {
      lines.push("");
      lines.push("*Flagged users*");
      for (const u of snapshot.flagged.slice(0, 10)) {
        const tag = u.overThreshold ? "OVER" : "APPROACH";
        lines.push(
          `• [${tag}] ${u.fullName ?? u.userId.slice(0, 8)}: AED ${u.totalAed.toFixed(0)} (${u.dealsCount} deals)`,
        );
      }
      if (snapshot.flagged.length > 10) {
        lines.push(`(+${snapshot.flagged.length - 10} more — see admin dashboard)`);
      }
    } else {
      lines.push("", "_No users flagged this period._");
    }
    return lines.join("\n");
  } catch (err) {
    console.error("[companyOs.legal] vat check command failed:", err);
    return "Couldn't run the VAT check — check the server logs.";
  }
}

// `users` is referenced in the raw SQL above; importing it via the schema
// re-export so the value isn't tree-shaken from typed callers.
void users;
