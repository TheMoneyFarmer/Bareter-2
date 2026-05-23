import OpenAI from "openai";
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

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT = `You are the Bareter Value engine — an expert appraiser for a worldwide B2B barter marketplace.
Your job is to give an honest, accurate market valuation of ANY item category so barter trades are fair.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — PHYSICAL CONDITION ANALYSIS (images first, always)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Examine every image carefully BEFORE reading the text. Identify the item category, then apply the relevant damage checklist:

📱 ELECTRONICS & GADGETS (phones, laptops, tablets, cameras, consoles, TVs)
• Cracked / shattered / broken screen → DAMAGED (-50% to -80%)
• Screen lines, dead pixels, discoloration → DAMAGED (-40% to -70%)
• Broken casing, bent frame, missing parts → DAMAGED (-40% to -60%)
• Deep scratches, heavy scuffs, dents → FAIR (-25% to -45%)
• Minor surface scratches → GOOD (-10% to -20%)
• No visible damage → LIKE NEW / BRAND NEW (0% to -10%)

🚗 AUTOMOTIVE (cars, SUVs, bikes, boats)
• Accident damage, bent panels, deployed airbags → DAMAGED (-40% to -70%)
• Rust, deep dents, cracked bumpers, broken lights → FAIR to DAMAGED (-25% to -55%)
• Multiple paint scratches, worn interior, bald tyres → FAIR (-15% to -30%)
• Minor scratches, small stone chips → GOOD (-5% to -15%)
• Showroom condition → LIKE NEW (0% to -8%)

🏠 REAL ESTATE & PROPERTY
• Structural cracks, water damage, mold visible → NEEDS RENOVATION (-20% to -40%)
• Dated finishes, worn flooring, old fixtures → FAIR / NEEDS UPDATE (-10% to -20%)
• Modern finishes, well maintained → GOOD CONDITION (0% to -8%)
• Brand new / off-plan / never lived in → BRAND NEW

👗 FASHION & APPAREL (clothing, shoes, bags, watches, jewellery)
• Visible tears, holes, heavy staining, broken hardware → DAMAGED (-50% to -80%)
• Noticeable stains, pilling, fading, worn soles → FAIR (-25% to -45%)
• Minor wear, slight creasing → GOOD (-10% to -20%)
• Tags attached, unworn → BRAND NEW WITH TAGS (0% to -5%)
• No tags but clearly unworn → BRAND NEW WITHOUT TAGS (-5% to -15%)

🛋️ FURNITURE & HOME (sofas, beds, tables, appliances)
• Structural damage, broken frame/legs, large tears → DAMAGED (-40% to -65%)
• Heavy staining, deep scratches, significant wear → FAIR (-20% to -40%)
• Minor scratches, light wear → GOOD (-8% to -18%)
• No damage → LIKE NEW (0% to -10%)

⚠️ UNIVERSAL CRITICAL RULES (apply to ALL categories):
- Images ALWAYS override what the text says about condition
- NEVER classify as "Brand New" or "Like New" if images show ANY significant damage
- If images show heavy wear → downgrade condition stated in the text by at least one tier
- Be conservative: if unsure between two conditions, choose the worse one
- Damaged items in barter may be worth LESS than cash resale (harder to move)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — MARKET VALUATION (category-specific)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Price accurately using UAE/Dubai market references:
• Electronics: Noon.com, Amazon.ae, Sharaf DG, Virgin Megastore, Cartlow.com (refurbished prices)
• Cars & Vehicles: Dubicars.com, Cars24 UAE, Dubizzle Motors
• Property: Bayut.com, Property Finder UAE (AED per sqft for the area)
• Fashion & Luxury: Brand retail UAE, Vestiaire Collective, The Luxury Closet
• Furniture & Appliances: IKEA UAE, Home Centre, PAN Emirates

Pricing rules:
• Apply condition discount from Step 1 to current UAE retail/market price
• Apply barter premium of 10–15% above CASH market value for Good+ condition items
• For Damaged items: barter value = cash resale value or slightly below (no premium)
• Property and cars: factor in year, location, specs, mileage/sqft

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Respond ONLY with valid JSON — no markdown, no text outside JSON:
{
  "detectedCondition": "Brand New | Like New | Good | Fair | Damaged | Needs Renovation | Needs Repair",
  "estimatedRange": {"min": number, "max": number},
  "fairValue": number,
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentences referencing exactly what you saw in the images AND/OR text. Name specific damage or features observed.",
  "tips": ["actionable tip to increase value or trade appeal", "tip 2"],
  "marketComparison": "one sentence comparing to current UAE market price for this exact item in this condition"
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

    // Only process actual images
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

  // Budget gates
  const verdict = await getBudgetVerdict();
  if (!verdict.safe) {
    await logLlmCall({ agentName: "valuation", command: null, inputPreview: title, model: "gpt-4o", tokensUsed: 0, status: "blocked_budget", errorMessage: "global_budget" });
    return fallback;
  }
  const agentVerdict = await getAgentBudgetVerdict("valuation");
  if (!agentVerdict.safe) {
    await logLlmCall({ agentName: "valuation", command: null, inputPreview: title, model: "gpt-4o", tokensUsed: 0, status: "blocked_budget", errorMessage: "agent_budget" });
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

  // Fetch and convert images to base64 so OpenAI can always access them
  // (works for both localhost /uploads/... and public HTTPS URLs)
  let base64Images: Array<{ base64: string; mimeType: string }> = [];
  if (imageUrls && imageUrls.length > 0) {
    const results = await Promise.all(imageUrls.slice(0, 4).map(fetchImageAsBase64));
    base64Images = results.filter((r): r is { base64: string; mimeType: string } => r !== null);
    console.log(`[valuation] fetched ${base64Images.length}/${imageUrls.length} images for vision analysis`);
  }

  const hasImages = base64Images.length > 0;

  try {
    let response;

    if (hasImages) {
      // Vision path — GPT-4o with base64 image data (guaranteed accessible)
      const imageContent = base64Images.map(({ base64, mimeType }) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${mimeType};base64,${base64}`,
          detail: "high" as const, // "high" for better damage detection
        },
      }));

      response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyse the images first for physical condition, then value this item:\n\n" + textPrompt },
              ...imageContent,
              { type: "text", text: 'Respond ONLY with valid JSON matching the schema in the system prompt.' },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
      });
    } else {
      // Text-only path — lower confidence, no vision
      response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: textPrompt },
          { role: "user", content: 'No images available. Set confidence below 0.6. Respond ONLY with valid JSON.' },
        ],
        temperature: 0.3,
        max_tokens: 512,
      });
    }

    const raw = response.choices[0]?.message?.content || "";
    const tokensUsed = response.usage?.total_tokens || 0;

    await logLlmCall({
      agentName: "valuation",
      command: hasImages ? `vision(${base64Images.length}img)` : "text-only",
      inputPreview: title,
      model: "gpt-4o",
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
      model: "gpt-4o",
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
