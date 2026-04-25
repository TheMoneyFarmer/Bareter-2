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
import crypto from "node:crypto";
import {
  and,
  desc,
  eq,
  gte,
  or,
  sql as drizzleSql,
  count,
} from "drizzle-orm";
import { jsPDF } from "jspdf";
import { createRequire } from "node:module";
// `arabic-persian-reshaper` ships only a CommonJS build, so we need a
// CJS require shim — the file otherwise runs in ESM mode under tsx.
const cjsRequire = createRequire(import.meta.url);
const { ArabicShaper } = cjsRequire("arabic-persian-reshaper") as {
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
 * Optional signature block carried into the body builders / PDF renderer.
 * When set on a side, the corresponding `____________________________`
 * placeholder is replaced with the signer's typed name and the date the
 * acceptance was recorded — this is what gets persisted as the signed
 * PDF revision once both parties have e-signed.
 */
export interface ContractSignatureSide {
  name: string;
  date: string; // YYYY-MM-DD
}

export interface ContractSignatures {
  partyA?: ContractSignatureSide;
  partyB?: ContractSignatureSide;
}

const SIGNATURE_PLACEHOLDER = "____________________________";
const SIGNATURE_DATE_PLACEHOLDER = "__________";

function formatSignatureLine(
  partyLabel: string,
  side: ContractSignatureSide | undefined,
  dateLabel: string,
): string {
  if (!side) {
    return `${partyLabel}: ${SIGNATURE_PLACEHOLDER}   ${dateLabel}: ${SIGNATURE_DATE_PLACEHOLDER}`;
  }
  // The "(e-signed via Bareter)" marker is what makes the signed PDF
  // legible as a non-wet-ink record at a glance — both for the founder
  // skimming it on WhatsApp and for a UAE court asked to validate the
  // electronic acceptance later.
  return `${partyLabel}: ${side.name}   ${dateLabel}: ${side.date}   (e-signed via Bareter)`;
}

/**
 * English contract body — UAE-jurisdiction template + AI disclaimer.
 * Kept short on purpose; the whole point of the disclaimer is that this
 * is a starting point, not a finished legal document.
 */
export function buildContractBody(
  input: ContractRenderInput,
  signatures?: ContractSignatures,
): string {
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
    formatSignatureLine(partyA, signatures?.partyA, "Date"),
    formatSignatureLine(partyB, signatures?.partyB, "Date"),
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
export function buildContractBodyArabic(
  input: ContractRenderInput,
  signatures?: ContractSignatures,
): string {
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
    formatSignatureLine(partyA, signatures?.partyA, "التاريخ"),
    formatSignatureLine(partyB, signatures?.partyB, "التاريخ"),
    "",
    ARABIC_AI_DISCLAIMER,
  ].join("\n");
}

/**
 * Dispatch to one or both bodies based on the requested language. Defaults
 * to English when `language` is unset or unrecognised so existing callers
 * (and the prior single-language tests) keep working unchanged.
 */
export function buildContractBodies(
  input: ContractRenderInput,
  signatures?: ContractSignatures,
): ContractBodies {
  const lang: ContractLanguage = input.language ?? "en";
  switch (lang) {
    case "ar":
      return { ar: buildContractBodyArabic(input, signatures) };
    case "bilingual":
      return {
        en: buildContractBody(input, signatures),
        ar: buildContractBodyArabic(input, signatures),
      };
    case "en":
    default:
      return { en: buildContractBody(input, signatures) };
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
  // Per-party public signing URLs ("/contract/sign/<token>"). Always
  // returned even if the PDF upload failed — the founder can still
  // share these with the parties to record acceptance, then re-render
  // the PDF later with `contract …` once storage is back.
  signingUrls: { partyA: string; partyB: string };
}

/**
 * Generate a fresh, URL-safe e-signature token. We use 24 random bytes
 * (192 bits, base64url-encoded → 32 chars) which is overkill for a
 * 7-day signing link but cheap enough that there's no reason to skimp.
 */
export function newSignatureToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Server-trusted base URL for outbound signature links. Identical
 * fallback chain to salesAgent.reEngagementBaseUrl so we never trust
 * request-level headers and never accidentally point counter-parties
 * at an attacker-controlled host.
 */
export function signingBaseUrl(): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;
  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (devDomain) return `https://${devDomain}`;
  return "https://bareter.com";
}

export function buildSigningUrl(token: string, baseUrl?: string): string {
  const base = (baseUrl ?? signingBaseUrl()).replace(/\/+$/, "");
  return `${base}/contract/sign/${encodeURIComponent(token)}`;
}

export function buildSigningUrlsForRow(
  row: Pick<LegalDocument, "signatureTokenA" | "signatureTokenB">,
  baseUrl?: string,
): { partyA: string; partyB: string } {
  return {
    partyA: row.signatureTokenA ? buildSigningUrl(row.signatureTokenA, baseUrl) : "",
    partyB: row.signatureTokenB ? buildSigningUrl(row.signatureTokenB, baseUrl) : "",
  };
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

  // Mint per-party signature tokens up-front so the row carries them
  // even if the PDF upload later fails. The unique-index on each
  // column protects us against the (vanishingly unlikely) collision.
  const signatureTokenA = newSignatureToken();
  const signatureTokenB = newSignatureToken();

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
      signatureTokenA,
      signatureTokenB,
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
    // Lifecycle: draft → sent. The contract is now in the field with
    // both parties expected to confirm acceptance via their signing
    // links (or via a `sign <token>` WhatsApp reply by the founder).
    const updated = await db
      .update(legalDocuments)
      .set({
        objectStorageKey: key,
        status: "sent",
        updatedAt: new Date(),
      })
      .where(eq(legalDocuments.id, row.id))
      .returning();
    finalRow = updated[0] ?? { ...row, objectStorageKey: key, status: "sent" };
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

  // Build URLs from the freshly minted tokens (not from `finalRow`):
  // we're authoritative about what we just inserted, and partial
  // RETURNING clauses or test mocks may strip the token columns.
  const signingUrls = buildSigningUrlsForRow({
    signatureTokenA,
    signatureTokenB,
  });
  return { document: finalRow, signedUrl, signingUrls };
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
  pdf: Buffer | null;
  pdfStorageKey: string | null;
  /** Daily totals for the trend chart (oldest → newest). */
  dailyTotals: DisputeDailyTotal[];
}

/** Number of days of history to plot in the "reports over time" chart. */
export const DISPUTE_TREND_WINDOW_DAYS = 28;

export interface DisputeDailyTotal {
  /** ISO date (YYYY-MM-DD) in UTC. */
  date: string;
  count: number;
}

/**
 * Fetch report counts grouped by UTC day for the last `days` days.
 * Returns one entry per day (zero-filled) so the trend chart always
 * has a continuous x-axis even on quiet weeks. Errors degrade to an
 * empty (zero-filled) series so the cron job can keep going.
 */
export async function gatherDisputeDailyTotals(
  days = DISPUTE_TREND_WINDOW_DAYS,
): Promise<DisputeDailyTotal[]> {
  // Anchor to UTC midnight today so the bucket window always includes
  // today (and the prior `days - 1` UTC days). Starting from Date.now()
  // minus `days` days would silently drop today from the chart.
  const now = new Date();
  const todayUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const startUtcMidnight = todayUtcMidnight - (days - 1) * 24 * 60 * 60 * 1000;
  const since = new Date(startUtcMidnight);
  const buckets = new Map<string, number>();
  // Pre-seed all days so the chart is never sparse / jagged.
  for (let i = 0; i < days; i++) {
    const d = new Date(startUtcMidnight + i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  try {
    const rows = await db
      .select({
        day: drizzleSql<string>`to_char(date_trunc('day', ${reports.createdAt}), 'YYYY-MM-DD')`,
        c: count(),
      })
      .from(reports)
      .where(gte(reports.createdAt, since))
      .groupBy(drizzleSql`date_trunc('day', ${reports.createdAt})`);
    for (const r of rows) {
      const k = String(r.day);
      if (buckets.has(k)) buckets.set(k, r.c);
    }
  } catch (err) {
    console.error("[companyOs.legal] gatherDisputeDailyTotals failed:", err);
    // Fall through with zero-filled buckets.
  }
  return Array.from(buckets.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Dispute risk PDF — bar charts of by-reason / by-status, plus a daily
// time-series, drawn directly with jsPDF primitives so we don't pull in a
// heavy chart library just for the Friday rollup.
// ---------------------------------------------------------------------------

interface ChartBar {
  label: string;
  value: number;
}

function drawBarChart(
  doc: jsPDF,
  bars: ChartBar[],
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    /** When true, labels are rotated and we leave more room beneath. */
    timeSeries?: boolean;
  },
): number {
  const { x, y, width, height, title } = opts;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, x, y);
  const plotTop = y + 4;
  const plotBottom = y + height;
  const plotHeight = plotBottom - plotTop;

  if (bars.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("(no data this window)", x, plotTop + 8);
    return plotBottom + 6;
  }

  const max = Math.max(1, ...bars.map((b) => b.value));
  const gap = 2;
  const labelHeight = opts.timeSeries ? 10 : 6;
  const availableHeight = plotHeight - labelHeight;
  const barWidth = Math.max(1, (width - gap * (bars.length - 1)) / bars.length);

  // Axis baseline.
  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  doc.line(x, plotBottom - labelHeight, x + width, plotBottom - labelHeight);

  doc.setFillColor(19, 108, 104); // Bareter teal.
  doc.setDrawColor(19, 108, 104);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(opts.timeSeries ? 6 : 8);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const bx = x + i * (barWidth + gap);
    const bh = (b.value / max) * availableHeight;
    const by = plotBottom - labelHeight - bh;
    doc.rect(bx, by, barWidth, bh, "F");
    // Value above bar (only when there's room and it's not zero).
    if (b.value > 0 && !opts.timeSeries) {
      doc.setTextColor(60);
      doc.text(String(b.value), bx + barWidth / 2, by - 1, { align: "center" });
    }
    // X-axis label.
    doc.setTextColor(80);
    if (opts.timeSeries) {
      // Show only month-day to keep labels short.
      const short = b.label.length >= 10 ? b.label.slice(5) : b.label;
      doc.text(short, bx + barWidth / 2, plotBottom - labelHeight + 5, {
        align: "center",
      });
    } else {
      const truncated = b.label.length > 14 ? `${b.label.slice(0, 13)}…` : b.label;
      doc.text(truncated, bx + barWidth / 2, plotBottom - labelHeight + 4, {
        align: "center",
      });
    }
  }
  doc.setTextColor(0);
  return plotBottom + 6;
}

/**
 * Render the weekly dispute-risk PDF: header, totals, three charts
 * (over time, by reason, by status), and the LLM-authored callouts.
 * Drawn entirely with jsPDF primitives so we don't add a chart dep
 * just for the Friday email.
 */
export function renderDisputeRiskPdf(
  snapshot: DisputeRiskSnapshot,
  callouts: string[],
  dailyTotals: DisputeDailyTotal[],
  generatedOnDubaiDate: string,
): Buffer {
  const doc = new jsPDF();
  const left = 18;
  const right = 192;
  const width = right - left;
  let y = 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Bareter — Weekly dispute-risk report", left, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(
    `Generated ${generatedOnDubaiDate} (Asia/Dubai) · last ${snapshot.windowDays} days`,
    left,
    y,
  );
  y += 6;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Total reports: ${snapshot.totalReports}`, left, y);
  y += 8;

  // Time-series chart: daily totals over the trend window.
  y = drawBarChart(
    doc,
    dailyTotals.map((d) => ({ label: d.date, value: d.count })),
    {
      x: left,
      y,
      width,
      height: 40,
      title: `Reports per day · last ${dailyTotals.length} days`,
      timeSeries: true,
    },
  );
  y += 4;

  // By-reason bar chart (current window).
  y = drawBarChart(
    doc,
    snapshot.byReason.slice(0, 12).map((r) => ({ label: r.reason, value: r.count })),
    {
      x: left,
      y,
      width,
      height: 40,
      title: "By reason · current window",
    },
  );
  y += 2;

  // By-status bar chart (current window).
  y = drawBarChart(
    doc,
    snapshot.byStatus.slice(0, 8).map((s) => ({ label: s.status, value: s.count })),
    {
      x: left,
      y,
      width,
      height: 40,
      title: "By status · current window",
    },
  );
  y += 4;

  // Callouts — LLM-authored or hand-crafted fallbacks.
  if (y > 250) {
    doc.addPage();
    y = 22;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Risk callouts", left, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  for (const c of callouts) {
    if (y > 275) {
      doc.addPage();
      y = 22;
    }
    const lines = doc.splitTextToSize(`• ${c}`, width);
    doc.text(lines, left, y);
    y += lines.length * 5 + 2;
  }

  // Footer disclaimer mirrors the contract template's tone.
  if (y > 270) {
    doc.addPage();
    y = 22;
  }
  y += 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120);
  const disclaimerLines = doc.splitTextToSize(
    "Risk callouts above are AI-generated as a starting point for the founder's review. Treat as guidance, not legal advice.",
    width,
  );
  doc.text(disclaimerLines, left, y);
  doc.setTextColor(0);

  return Buffer.from(doc.output("arraybuffer"));
}

export async function runDisputeRiskSummary(windowDays = 7): Promise<DisputeRiskResult> {
  const snapshot = await gatherDisputeData(windowDays);
  const callouts = await generateDisputeCallouts(snapshot);
  const dailyTotals = await gatherDisputeDailyTotals(DISPUTE_TREND_WINDOW_DAYS);
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
        metadata: { snapshot, callouts, dailyTotals },
        objectStorageKey: null,
        status: "generated",
      })
      .returning();
    document = inserted[0] ?? null;
  } catch (err) {
    console.error("[companyOs.legal] persist dispute_summary failed:", err);
  }

  // Best-effort PDF render + upload. If either step fails the row is
  // already persisted with text body + metadata so the founder still
  // gets the WhatsApp rollup; we just skip the email attachment.
  let pdf: Buffer | null = null;
  let pdfStorageKey: string | null = null;
  try {
    pdf = renderDisputeRiskPdf(snapshot, callouts, dailyTotals, date);
    if (document) {
      const key = `companyOs/legal/dispute-summaries/${document.id}.pdf`;
      try {
        await uploadPrivateBuffer(key, pdf, "application/pdf");
        pdfStorageKey = key;
        const updated = await db
          .update(legalDocuments)
          .set({ objectStorageKey: key, updatedAt: new Date() })
          .where(eq(legalDocuments.id, document.id))
          .returning();
        document = updated[0] ?? { ...document, objectStorageKey: key };
      } catch (err) {
        console.error(
          "[companyOs.legal] dispute_summary PDF upload failed:",
          err,
        );
      }
    }
  } catch (err) {
    console.error("[companyOs.legal] dispute_summary PDF render failed:", err);
  }

  return { document, snapshot, callouts, pdf, pdfStorageKey, dailyTotals };
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
// E-signature flow
// ---------------------------------------------------------------------------

export type ContractParty = "partyA" | "partyB";

export interface ContractByTokenResult {
  document: LegalDocument;
  party: ContractParty;
}

/**
 * Look up a contract by either party's signature token. Returns null if
 * no row matches — callers should treat that as a 404 to avoid leaking
 * which tokens exist via timing differences.
 */
export async function getContractByToken(
  token: string,
): Promise<ContractByTokenResult | null> {
  if (!token) return null;
  const rows = await db
    .select()
    .from(legalDocuments)
    .where(
      or(
        eq(legalDocuments.signatureTokenA, token),
        eq(legalDocuments.signatureTokenB, token),
      ),
    )
    .limit(1);
  const doc = rows[0];
  if (!doc) return null;
  // Only contracts have signature tokens — defensive guard against the
  // (impossible-by-data-model) case of a non-contract row matching.
  if (doc.documentType !== "contract") return null;
  const party: ContractParty =
    doc.signatureTokenA === token ? "partyA" : "partyB";
  return { document: doc, party };
}

export type SignContractError =
  | "not_found"
  | "already_signed"
  | "wrong_status"
  | "missing_name";

export interface SignContractResult {
  ok: true;
  document: LegalDocument;
  party: ContractParty;
  bothSigned: boolean;
  signedPdfKey: string | null;
  signedPdfUrl: string | null;
}
export interface SignContractFailure {
  ok: false;
  error: SignContractError;
  document?: LegalDocument;
  party?: ContractParty;
}

/**
 * Record a single party's e-signature. Idempotent at the per-party
 * level: signing twice as the same party returns `already_signed`.
 *
 * Once both parties have signed, we re-render the contract with the
 * signature placeholders filled in, upload it as `<id>-signed.pdf`,
 * and flip the row to `status: 'active'` with `signedObjectStorageKey`
 * pointing at the new revision.
 */
export async function signContract(opts: {
  token: string;
  signerName: string;
  signerIp?: string | null;
}): Promise<SignContractResult | SignContractFailure> {
  const lookup = await getContractByToken(opts.token);
  if (!lookup) return { ok: false, error: "not_found" };
  const { document, party } = lookup;

  const cleanName = (opts.signerName ?? "").trim().slice(0, 200);
  if (!cleanName) {
    return { ok: false, error: "missing_name", document, party };
  }

  // Lifecycle guard. The signature flow is only meaningful between
  // 'sent' (waiting for both) and 'signed' (one party in, waiting for
  // the other). 'draft' shouldn't be sign-able because the PDF upload
  // hasn't completed yet; 'active' means both parties already signed.
  if (
    document.status !== "sent" &&
    document.status !== "signed" &&
    // Allow the legacy "generated" value during the lifecycle migration
    // window — old rows in the DB pre-date the rename to "sent".
    document.status !== "generated"
  ) {
    return { ok: false, error: "wrong_status", document, party };
  }

  if (party === "partyA" && document.partyASignedAt) {
    return { ok: false, error: "already_signed", document, party };
  }
  if (party === "partyB" && document.partyBSignedAt) {
    return { ok: false, error: "already_signed", document, party };
  }

  const signerIp = (opts.signerIp ?? "").toString().slice(0, 64) || null;
  const now = new Date();

  // Per-party update only — set the signature columns and bump status
  // to "signed" optimistically. The "active" decision is made *after*
  // the write returns, based on the actual row state, so two parties
  // signing simultaneously can't both walk away thinking the other
  // half wasn't done yet (see finalize block below).
  const update: Partial<LegalDocument> = {
    status: "signed",
    updatedAt: now,
  };
  if (party === "partyA") {
    update.partyASignedAt = now;
    update.partyASignedName = cleanName;
    update.partyASignedIp = signerIp;
  } else {
    update.partyBSignedAt = now;
    update.partyBSignedName = cleanName;
    update.partyBSignedIp = signerIp;
  }

  const updated = await db
    .update(legalDocuments)
    .set(update)
    .where(eq(legalDocuments.id, document.id))
    .returning();
  let row = updated[0] ?? ({ ...document, ...update } as LegalDocument);

  // Race-safe both-signed detection: read from the row that came back
  // from the DB rather than the pre-update snapshot. If party A and
  // party B sign almost simultaneously, both updates run, both rows
  // come back with both timestamps populated, and both branches will
  // correctly try to finalize to "active" (the conditional WHERE on
  // the finalize update makes the second one a no-op).
  const bothSigned = !!row.partyASignedAt && !!row.partyBSignedAt;

  let signedPdfKey: string | null = null;
  let signedPdfUrl: string | null = null;
  if (bothSigned) {
    try {
      // Re-render the contract with the signatures filled in and
      // upload as a separate "<id>-signed.pdf" key so the original
      // unsigned draft is still available for diffing if needed.
      const meta = (row.metadata ?? {}) as {
        exchange?: string;
        date?: string;
        language?: ContractLanguage;
      };
      const renderInput: ContractRenderInput = {
        partyA: row.partyA ?? "Party A",
        partyB: row.partyB ?? "Party B",
        exchange: meta.exchange ?? "",
        valueAed: Number(row.valueAed ?? 0),
        date: meta.date ?? dubaiDateString(),
        language: normaliseLanguage(meta.language),
      };
      const signatures: ContractSignatures = {
        partyA: {
          name: row.partyASignedName ?? "Party A",
          date: dubaiDateString(row.partyASignedAt ?? now),
        },
        partyB: {
          name: row.partyBSignedName ?? "Party B",
          date: dubaiDateString(row.partyBSignedAt ?? now),
        },
      };
      const bodies = buildContractBodies(renderInput, signatures);
      const pdf = renderContractPdf(renderInput, bodies);
      signedPdfKey = `companyOs/legal/${row.id}-signed.pdf`;
      await uploadPrivateBuffer(signedPdfKey, pdf, "application/pdf");
      signedPdfUrl = await getSignedDownloadUrl(
        signedPdfKey,
        CONTRACT_SIGNED_URL_TTL_SEC,
      );
      const patched = await db
        .update(legalDocuments)
        .set({
          status: "active",
          signedObjectStorageKey: signedPdfKey,
          updatedAt: new Date(),
        })
        .where(eq(legalDocuments.id, row.id))
        .returning();
      row =
        patched[0] ??
        ({ ...row, status: "active", signedObjectStorageKey: signedPdfKey } as LegalDocument);
    } catch (err) {
      console.error(
        "[companyOs.legal] signed PDF render/upload failed:",
        err,
      );
      // Lifecycle still flips to 'active' — we don't want the inability
      // to render the signed revision to block the contract from being
      // marked as both-parties-accepted. The founder can re-render via
      // the admin endpoint later.
      const patched = await db
        .update(legalDocuments)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(legalDocuments.id, row.id))
        .returning();
      row = patched[0] ?? ({ ...row, status: "active" } as LegalDocument);
    }
  }

  await logLlmCall({
    agentName: AGENT,
    command: "contract_sign",
    inputPreview: `${row.partyA} ⇄ ${row.partyB} (${party})`,
    outputPreview: bothSigned ? "active" : "signed",
    tokensUsed: 0,
  });

  return {
    ok: true,
    document: row,
    party,
    bothSigned,
    signedPdfKey,
    signedPdfUrl,
  };
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
    const { document, signedUrl, signingUrls } = await generateContract(parsed);
    const lines: string[] = [
      `📝 *Contract drafted* — ${document.partyA} ⇄ ${document.partyB}`,
      `Value: AED ${Number(document.valueAed ?? 0).toFixed(2)}`,
      `Language: ${languageLabel(parsed.language)}`,
      `Status: ${document.status}`,
    ];
    if (signedUrl) {
      lines.push(`PDF (7-day signed link): ${signedUrl}`);
    } else {
      lines.push(
        "(PDF upload failed — the contract row is saved; check object storage logs.)",
      );
    }
    // Per-party e-signing — share each link with the matching party
    // (or reply `sign <token> <your name>` from this chat to record
    // acceptance yourself when the founder is one of the parties).
    lines.push(
      "",
      "*E-sign links* — share each with the matching party:",
      `• ${document.partyA}: ${signingUrls.partyA}`,
      `• ${document.partyB}: ${signingUrls.partyB}`,
      "Or reply `sign <token> <your name>` to record acceptance from WhatsApp.",
    );
    lines.push(
      "",
      "_AI-generated. Both parties should consult a UAE-qualified lawyer before signing._",
    );
    return lines.join("\n");
  } catch (err) {
    console.error("[companyOs.legal] contract command failed:", err);
    return "Couldn't draft that contract — check the server logs.";
  }
}

// `sign <token> <signer name>` — founder-side WhatsApp shortcut for
// recording acceptance against a contract without opening the web link.
// The token is whatever was issued in the `contract` reply; signer name
// is free text (typically the party's representative). Anyone with the
// token can sign — this matches the link's security model (knowledge of
// the token == capability), and the WhatsApp sender check upstream
// ensures only the founder can use this command.
const SIGN_RE = /^sign\s+(\S+)(?:\s+(.+))?$/i;

export interface ParsedSignCommand {
  token: string;
  signerName: string;
}

export function parseSignCommand(text: string): ParsedSignCommand | null {
  const m = text.trim().match(SIGN_RE);
  if (!m) return null;
  const token = (m[1] ?? "").trim();
  const signerName = (m[2] ?? "").trim();
  if (!token || !signerName) return null;
  return { token, signerName: signerName.slice(0, 200) };
}

export async function handleSignCommand(rawText: string): Promise<string> {
  const parsed = parseSignCommand(rawText);
  if (!parsed) {
    return [
      "Usage: `sign <token> <signer name>`",
      "The token is the `…/contract/sign/<token>` value from the `contract` reply.",
      "Example: `sign abc123XYZ Acme Studios`",
    ].join("\n");
  }
  try {
    const result = await signContract({
      token: parsed.token,
      signerName: parsed.signerName,
      signerIp: "whatsapp",
    });
    if (!result.ok) {
      switch (result.error) {
        case "not_found":
          return "Couldn't find a contract for that token. Double-check it from the `contract` reply.";
        case "already_signed":
          return `That party has already signed (${result.party === "partyA" ? result.document?.partyA : result.document?.partyB}).`;
        case "wrong_status":
          return `Contract status is *${result.document?.status}* — can't accept new signatures.`;
        case "missing_name":
          return "Add the signer's name after the token.";
      }
    }
    const partyLabel =
      result.party === "partyA"
        ? (result.document.partyA ?? "Party A")
        : (result.document.partyB ?? "Party B");
    const lines: string[] = [
      `✅ *Signed* — ${partyLabel} (${parsed.signerName})`,
      `Status: ${result.document.status}`,
    ];
    if (result.bothSigned) {
      lines.push("Both parties have signed — contract is now *active*.");
      if (result.signedPdfUrl) {
        lines.push(`Signed PDF (7-day link): ${result.signedPdfUrl}`);
      } else {
        lines.push(
          "(Signed PDF upload failed — check object storage logs; the row is still marked active.)",
        );
      }
    } else {
      const otherParty: ContractParty = result.party === "partyA" ? "partyB" : "partyA";
      const otherToken =
        otherParty === "partyA"
          ? result.document.signatureTokenA
          : result.document.signatureTokenB;
      const otherLabel =
        otherParty === "partyA"
          ? (result.document.partyA ?? "Party A")
          : (result.document.partyB ?? "Party B");
      lines.push(
        `Waiting on ${otherLabel} — share: ${otherToken ? buildSigningUrl(otherToken) : "(no link available)"}`,
      );
    }
    return lines.join("\n");
  } catch (err) {
    console.error("[companyOs.legal] sign command failed:", err);
    return "Couldn't record that signature — check the server logs.";
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
