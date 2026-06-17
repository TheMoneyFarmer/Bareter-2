import Anthropic from "@anthropic-ai/sdk";
import { logLlmCall, getBudgetVerdict, getAgentBudgetVerdict } from "../companyOs/costTracker";
import { db } from "../db";
import { agentInteractions } from "@shared/schema";

export interface ValuationAdvice {
  estimatedRange: { min: number; max: number };
  fairValue: number;
  confidence: number;
  reasoning: string;
  tips: string[];
  marketComparison: string;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const VALUATION_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are the Bareter Value engine — an expert appraiser for a worldwide B2B barter marketplace.
Your job is to give an honest, realistic barter valuation of ANY item. This valuation is a SUGGESTION — users can set their own price and override it. Your role is to anchor trades to real secondary-market value so neither party gets a bad deal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — PHYSICAL CONDITION (images first, always)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Examine every image carefully BEFORE reading the text. Determine the true condition:

📱 ELECTRONICS & GADGETS (phones, laptops, tablets, cameras, consoles, TVs)
• Cracked / shattered / broken screen → DAMAGED
• Screen lines, dead pixels, discoloration → DAMAGED
• Broken casing, bent frame, missing parts → DAMAGED
• Deep scratches, heavy scuffs, dents → FAIR
• Minor surface scratches, light wear → GOOD
• No visible damage, all accessories present → LIKE NEW
• Sealed box or verifiable proof of purchase showing new → BRAND NEW

🚗 AUTOMOTIVE (cars, SUVs, bikes, boats)
• Accident damage, bent panels, deployed airbags → DAMAGED
• Rust, deep dents, cracked bumpers, broken lights → FAIR
• Multiple paint scratches, worn interior, bald tyres → FAIR
• Minor scratches, small stone chips → GOOD
• Showroom / dealer condition, very low mileage → LIKE NEW
• Never registered / brand new from dealer → BRAND NEW

🏠 REAL ESTATE & PROPERTY
• Structural cracks, water damage, mould visible → NEEDS RENOVATION
• Dated finishes, worn flooring, old fixtures → FAIR
• Modern finishes, well maintained → GOOD
• Brand new / off-plan / never lived in → BRAND NEW

👗 FASHION & APPAREL (clothing, shoes, bags, watches, jewellery)
• Visible tears, holes, heavy staining, broken hardware → DAMAGED
• Noticeable stains, pilling, fading, worn soles → FAIR
• Minor wear, slight creasing → GOOD
• No tags but clearly unworn, no signs of use → LIKE NEW
• Original tags attached, sealed, receipts present → BRAND NEW

🛋️ FURNITURE & HOME (sofas, beds, tables, appliances)
• Structural damage, broken frame/legs, large tears → DAMAGED
• Heavy staining, deep scratches, significant wear → FAIR
• Minor scratches, light wear → GOOD
• No damage, looks unused → LIKE NEW
• Still in original packaging → BRAND NEW

⚠️ UNIVERSAL RULES (all categories):
- Images ALWAYS override the seller's stated condition
- NEVER classify as Brand New or Like New if images show ANY significant damage or wear
- If images show wear that contradicts the stated condition, downgrade at least one tier
- Be conservative: when in doubt, choose the worse condition
- BRAND NEW requires clear image evidence (sealed packaging, tags, or new-condition proof) — do not award it on seller's word alone

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — PRICE RESEARCH (secondary market first)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Always anchor to SECONDARY MARKET prices first — what this exact item actually sells for used in the UAE today.

Primary research sources (in order of priority):
1. Dubizzle.com UAE — actual used listings for the same item, same condition
2. Facebook Marketplace UAE — recent sold/asking prices for used items
3. Cartlow.com UAE — certified refurbished prices
4. Cars24 UAE / Dubicars.com — for vehicles
5. The Luxury Closet / Vestiaire Collective — for luxury fashion & watches
6. Bayut.com / Property Finder UAE — for real estate

Secondary (brand new reference only — to establish baseline):
• Noon.com UAE, Amazon.ae, Sharaf DG, Virgin Megastore, official brand stores

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — BARTER VALUE CALCULATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use these percentage ranges applied to the BRAND NEW retail price (Noon/Amazon.ae):

| Condition        | Barter value (% of brand new price) |
|------------------|--------------------------------------|
| Brand New        | 80–85%  (only if images confirm it)  |
| Like New         | 70–76%                               |
| Good             | 60–67%                               |
| Fair             | 45–55%                               |
| Damaged          | 25–42%                               |
| Damaged (parts)  | 10–22%                               |

Cross-check: the calculated range must also be consistent with actual secondary-market asking prices from Dubizzle / Facebook Marketplace for the same item and condition. If secondary-market data suggests a lower range, use the lower figure — do not exceed what the item realistically trades for.

DO NOT apply any "barter premium" above market value. Barter value should reflect what the item is actually worth to exchange, not an inflated asking price.

For property and vehicles: factor in year, location, specs, mileage/sqft in addition to these percentages.
For luxury watches and fine jewellery: use The Luxury Closet / Vestiaire resale prices as the primary benchmark instead of retail.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Respond ONLY with valid JSON — no markdown, no text outside JSON:
{
  "detectedCondition": "Brand New | Like New | Good | Fair | Damaged | Needs Renovation | Needs Repair",
  "estimatedRange": {"min": number, "max": number},
  "fairValue": number,
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentences referencing exactly what you saw in the images AND/OR text. Name specific damage or features observed. State the brand new retail price you used as the baseline.",
  "tips": ["actionable tip to increase value or trade appeal", "tip 2"],
  "marketComparison": "one sentence citing the secondary-market price range (Dubizzle/Facebook Marketplace) for this exact item in this condition"
}

Currency: AED (UAE Dirham) unless geo says otherwise.`;

// ── Image fetching ───────────────────────────────────────────────────────────
async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.split(";")[0].trim();

    if (!mimeType.startsWith("image/")) return null;

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mimeType };
  } catch {
    return null;
  }
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function getValuation(
  title: string,
  description: string,
  category?: string,
  condition?: string,
  userId?: string,
  geo?: { country?: string | null; city?: string | null },
  imageUrls?: string[],
): Promise<ValuationAdvice> {
  const fallback: ValuationAdvice = {
    estimatedRange: { min: 0, max: 0 },
    fairValue: 0,
    confidence: 0.1,
    reasoning: "Bareter Value paused — monthly budget reached.",
    tips: [],
    marketComparison: "",
  };

  const verdict = await getBudgetVerdict();
  if (!verdict.safe) {
    await logLlmCall({ agentName: "valuation", command: null, inputPreview: title, model: VALUATION_MODEL, tokensUsed: 0, status: "blocked_budget", errorMessage: "global_budget" });
    return fallback;
  }
  const agentVerdict = await getAgentBudgetVerdict("valuation");
  if (!agentVerdict.safe) {
    await logLlmCall({ agentName: "valuation", command: null, inputPreview: title, model: VALUATION_MODEL, tokensUsed: 0, status: "blocked_budget", errorMessage: "agent_budget" });
    return fallback;
  }

  const localeNote = geo?.country
    ? `Market: ${[geo.city, geo.country].filter(Boolean).join(", ")}`
    : "Market: UAE (Dubai)";

  const textPrompt = [
    localeNote,
    `Title: ${title}`,
    `Description: ${description}`,
    category ? `Category: ${category}` : null,
    condition ? `Stated condition: ${condition}` : null,
    imageUrls?.length
      ? `${imageUrls.length} image(s) attached — analyse them for physical condition before reading the text.`
      : "No images provided — base valuation on text only and lower confidence accordingly.",
  ].filter(Boolean).join("\n");

  let base64Images: Array<{ base64: string; mimeType: string }> = [];
  if (imageUrls && imageUrls.length > 0) {
    const results = await Promise.all(imageUrls.slice(0, 4).map(fetchImageAsBase64));
    base64Images = results.filter((r): r is { base64: string; mimeType: string } => r !== null);
    console.log(`[valuation] fetched ${base64Images.length}/${imageUrls.length} images for vision analysis`);
  }

  const hasImages = base64Images.length > 0;

  try {
    type AnthropicImageBlock = {
      type: "image";
      source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };
    };
    type AnthropicTextBlock = { type: "text"; text: string };
    type AnthropicContentBlock = AnthropicImageBlock | AnthropicTextBlock;

    const userContent: AnthropicContentBlock[] = hasImages
      ? [
          { type: "text", text: "Analyse the images first for physical condition, then value this item:\n\n" + textPrompt },
          ...base64Images.map(({ base64, mimeType }) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: (mimeType.startsWith("image/") ? mimeType : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: base64,
            },
          })),
          { type: "text", text: "Respond ONLY with valid JSON matching the schema in the system prompt." },
        ]
      : [
          { type: "text", text: textPrompt + "\n\nNo images available. Set confidence below 0.6. Respond ONLY with valid JSON." },
        ];

    const response = await anthropic.messages.create({
      model: VALUATION_MODEL,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      temperature: hasImages ? 0.2 : 0.3,
      max_tokens: 600,
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    const tokensUsed = (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0);

    await logLlmCall({
      agentName: "valuation",
      command: hasImages ? `vision(${base64Images.length}img)` : "text-only",
      inputPreview: title,
      model: VALUATION_MODEL,
      tokensUsed,
      status: "ok",
    });

    if (userId) {
      db.insert(agentInteractions).values({
        userId,
        agentType: "valuation",
        userMessage: `Bareter Value: ${title}`,
        agentResponse: raw,
        tokensUsed,
      }).catch(() => {});
    }

    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const data = JSON.parse(cleaned) as ValuationAdvice & { detectedCondition?: string };

    return {
      estimatedRange: data.estimatedRange || { min: 0, max: 0 },
      fairValue: data.fairValue || 0,
      confidence: Math.min(1, Math.max(0, data.confidence || 0.5)),
      reasoning: data.reasoning || "Unable to determine",
      tips: data.tips || [],
      marketComparison: data.marketComparison || "",
    };
  } catch (error) {
    console.error("Bareter Value agent error:", error);
    await logLlmCall({
      agentName: "valuation",
      command: null,
      inputPreview: title,
      model: VALUATION_MODEL,
      tokensUsed: 0,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      estimatedRange: { min: 0, max: 0 },
      fairValue: 0,
      confidence: 0,
      reasoning: "Bareter Value temporarily unavailable",
      tips: [],
      marketComparison: "",
    };
  }
}
