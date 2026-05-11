/**
 * Seed three SEO-tuned blog posts into the live Sanity production dataset.
 *
 * Run with:
 *   npm run blogs:seed
 *
 * Requires in env (already in .env.local for local dev, or Replit Secrets in prod):
 *   SANITY_PROJECT_ID, SANITY_DATASET, SANITY_SEED_TOKEN (Editor role).
 *
 * Idempotent: uses createOrReplace keyed by a stable _id, so re-running
 * updates the posts in place rather than creating duplicates.
 */

import { createClient } from "@sanity/client";
import { randomUUID } from "node:crypto";

// Strip surrounding whitespace, quotes, and trailing punctuation so a small
// typo in .env.local (e.g. `SANITY_DATASET=production,`) does not break us.
const clean = (v: string | undefined) =>
  (v ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/[,;]+$/, "");

const projectId = clean(process.env.SANITY_PROJECT_ID);
const dataset = clean(process.env.SANITY_DATASET);
const token = clean(process.env.SANITY_SEED_TOKEN);

if (!projectId || !dataset || !token) {
  console.error(
    "[seedBlogs] missing env: need SANITY_PROJECT_ID, SANITY_DATASET, SANITY_SEED_TOKEN",
  );
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2024-01-01",
  useCdn: false,
});

type Span = {
  _type: "span";
  _key: string;
  text: string;
  marks?: string[];
};

type Block = {
  _type: "block";
  _key: string;
  style: "normal" | "h2" | "h3" | "blockquote";
  markDefs?: never[];
  children: Span[];
};

function span(text: string, marks: string[] = []): Span {
  return { _type: "span", _key: randomUUID(), text, marks };
}

function p(text: string): Block {
  return {
    _type: "block",
    _key: randomUUID(),
    style: "normal",
    markDefs: [],
    children: [span(text)],
  };
}

function h2(text: string): Block {
  return {
    _type: "block",
    _key: randomUUID(),
    style: "h2",
    markDefs: [],
    children: [span(text)],
  };
}

function h3(text: string): Block {
  return {
    _type: "block",
    _key: randomUUID(),
    style: "h3",
    markDefs: [],
    children: [span(text)],
  };
}

function quote(text: string): Block {
  return {
    _type: "block",
    _key: randomUUID(),
    style: "blockquote",
    markDefs: [],
    children: [span(text)],
  };
}

// ---------------------------------------------------------------------------
// POST 1 — Playbook (Sara persona, informational pillar)
// ---------------------------------------------------------------------------

const post1Body: Block[] = [
  p(
    "If your UAE business is spending cash on services you could be trading for, you are leaving money on the table. Barter is back in 2026, not as a sentimental throwback to a pre-cash economy, but as a serious cash-conservation strategy for SMEs, freelancers, and asset-rich operators across Dubai and the wider Emirates. This guide walks through exactly how to barter business services in Dubai today: when it works, when it does not, and the five things every deal needs in writing before you shake hands.",
  ),
  h2("What barter actually means in a UAE business context"),
  p(
    "A barter transaction is an exchange of goods or services for other goods or services, with no cash changing hands. The UAE Federal Tax Authority treats it as two separate supplies happening at the same time, each valued at open market value, each subject to 5% VAT if both parties are VAT-registered. We cover the VAT side in detail in our companion post on VATP042. The headline: barter is fully legal, fully taxable, and increasingly attractive in a higher-interest-rate environment where cash sitting in inventory costs you real money.",
  ),
  h2("Three real scenarios where bartering beats paying cash"),
  h3("Scenario 1: Hotel + creative agency"),
  p(
    "A four-star Dubai hotel has a 62% shoulder-season occupancy. A boutique creative agency needs a brand film for a new client pitch. The hotel comps a five-night suite plus F&B vouchers worth AED 18,000 of open-market value. The agency delivers a 60-second brand film and a content sprint of the same value. Both parties save the cash they would have written cheques for, and both walk away with assets that compound in value: the agency uses the suite for a real shoot, and the hotel uses the film as marketing collateral for years.",
  ),
  h3("Scenario 2: Designer + accountant"),
  p(
    "A freelance brand designer in Business Bay needs a year of bookkeeping. A small accounting practice needs a fresh brand identity. They agree a barter at AED 22,000 each side, sign a one-page contract, raise tax invoices to each other, and move on. No cash flow hit on either side, no procurement bureaucracy.",
  ),
  h3("Scenario 3: Venue operator + content creator"),
  p(
    "A Palm Jumeirah villa operator has a quiet midweek calendar. A UAE-based content creator has 180,000 engaged followers. The villa hosts the creator for a long weekend in exchange for an agreed deliverables package: two Reels, one carousel, three Stories. Open market value AED 12,000 each side. The villa fills idle inventory, the creator skips the usual freebie-treadmill, and both parties have a contract that survives audit.",
  ),
  h2("The five things every UAE barter deal needs in writing"),
  p(
    "Most barter deals fall apart not because the counterparty is dishonest, but because nobody wrote down what they were trading. Before you commit, lock these five things on paper.",
  ),
  p(
    "1. Open market value for each side, in AED. Both numbers should be defensible to an FTA auditor and ideally identical.",
  ),
  p(
    "2. Deliverables. What exactly is being delivered, by when, and to what spec. \"Two Reels\" is not a spec. \"Two 30-second Reels, vertical, brand-approved, posted to the creator's main account within 14 days\" is.",
  ),
  p(
    "3. Acceptance criteria. How does the counterparty confirm delivery? A screenshot, a signed receipt, an inspection?",
  ),
  p(
    "4. VAT treatment. Both parties raise tax invoices to each other for the open market value. Each charges 5% VAT, each reclaims it (assuming both are VAT-registered businesses).",
  ),
  p(
    "5. What happens if delivery fails. Who covers the gap, how is the deal unwound, what is the dispute path?",
  ),
  h2("Where to find counterparties, and why WhatsApp groups alone are not enough"),
  p(
    "UAE business owners have been bartering informally for years, mostly through WhatsApp groups, LinkedIn DMs, and chamber-of-commerce events. That works for the first two or three deals you do with people you already know. It breaks down the moment you want to scale: discovery is slow, vetting is non-existent, and the only contract is a screenshot of a chat thread.",
  ),
  p(
    "A formal barter marketplace closes those gaps. The counterparty is identity-verified, the value is anchored by AI valuation, the contract is auto-generated with VAT clauses, and you have a rating system that compounds trust over time. That is what Bareter exists to do.",
  ),
  h2("How Bareter handles the heavy lifting"),
  p(
    "Sign up takes a few minutes. Verify your trade licence (KYB) once, and that badge follows you across every deal. Post what you have, post what you need, and the platform's matching engine surfaces compatible counterparties in seconds. When a deal comes together, the platform generates a binding contract with the AED value, VAT line, deliverables, and acceptance terms already filled in. You sign electronically, the deal locks, you exchange offline, and you both rate each other when it is done.",
  ),
  p(
    "Bareter is currently free for every UAE business while we grow the marketplace. No platform fees, no commission, no listing cost. The trade itself is between you and your counterparty.",
  ),
  quote(
    "If I can get the campaign I would have paid an agency for, by giving away rooms I would otherwise discount to 30%, that is a no-brainer. I just need it to look proper in the audit file. -- a Dubai hotel marketing director, paraphrased.",
  ),
  h2("Next step"),
  p(
    "List your first offer or request on Bareter and see how many AI-matched counterparties show up in the first hour. The fastest way to learn whether barter works for your specific business is to do one deal and see what you get back.",
  ),
];

// ---------------------------------------------------------------------------
// POST 2 — VAT compliance (Yousef + Khalid personas)
// ---------------------------------------------------------------------------

const post2Body: Block[] = [
  p(
    "In April 2025 the UAE Federal Tax Authority issued VAT Public Clarification VATP042, which finally put the question of how to treat barter transactions for VAT to rest. If you do barter deals in the UAE, this is the rulebook you need to know. Here it is in plain English, with worked examples your accountant can use tomorrow morning.",
  ),
  h2("What VATP042 actually says"),
  p(
    "Three things, in order of importance.",
  ),
  p(
    "First: a barter transaction is treated as two separate supplies, happening at the same moment. Each side of the trade is a supply in its own right. Each side is taxable, each side requires a tax invoice.",
  ),
  p(
    "Second: the value of each supply is the open market value of what is being given, not what is being received. In other words, you do not value your side of the trade by what the other party gives you. You value it by what your own goods or services would have sold for in cash.",
  ),
  p(
    "Third: standard 5% VAT applies to each side at that open market value, unless the supply is zero-rated or exempt for some other reason.",
  ),
  h2("Worked example: AED 25,000 design package for AED 25,000 venue rental"),
  p(
    "A Business Bay design agency agrees to deliver a brand identity refresh to a Dubai event venue. In exchange, the venue rents its ballroom to the agency for a private client launch. Both parties are VAT-registered. Both sides have an open market value of AED 25,000.",
  ),
  p(
    "On delivery, the design agency raises a tax invoice to the venue for AED 25,000 plus 5% VAT, totalling AED 26,250. The venue raises a tax invoice to the agency for AED 25,000 plus 5% VAT, totalling AED 26,250. Each party records the inbound invoice as a recoverable input, and the outbound invoice as output VAT due. Net VAT impact: zero on both sides, assuming neither is partly exempt.",
  ),
  p(
    "Net cash impact: still zero, because the deal is a barter. But the FTA gets its 5% paid and reclaimed on both legs, which is exactly what VATP042 was designed to ensure.",
  ),
  h2("Three common mistakes UAE businesses make on barter VAT"),
  h3("Mistake 1: Only invoicing one side"),
  p(
    "A surprising number of businesses raise a tax invoice from one side of a barter and not the other. This is non-compliant. Both sides are supplies, both sides need invoices, both sides incur VAT.",
  ),
  h3("Mistake 2: Valuing your side by what you received"),
  p(
    "If you swap inventory with a retail price of AED 50,000 for services that would normally cost AED 35,000, your side of the supply is valued at AED 50,000, not AED 35,000. VATP042 is explicit: each side is valued at its own open market value, not the value of the counterparty's leg.",
  ),
  h3("Mistake 3: Treating the barter as a non-event for VAT"),
  p(
    "We see this most often in informal trades between people who know each other. \"It is a favour, it is not really a sale.\" Legally it is a sale, both ways, and the absence of cash does not exempt either side from VAT. The FTA can and does treat undeclared barter as undeclared revenue.",
  ),
  h2("Record-keeping the FTA expects"),
  p(
    "Keep four artefacts for every barter deal for five years.",
  ),
  p(
    "1. A written agreement signed by both parties, stating the deliverables, the AED open market value of each side, the dates, and the VAT treatment.",
  ),
  p(
    "2. The tax invoice raised by you to the counterparty, in the same format you would issue for any cash sale.",
  ),
  p(
    "3. The tax invoice raised by the counterparty to you, which becomes your input VAT record.",
  ),
  p(
    "4. Evidence of how you arrived at the open market value, especially when there is no obvious published price. A screenshot of comparable cash listings is enough.",
  ),
  h2("How Bareter generates the right paperwork automatically"),
  p(
    "Every deal closed on Bareter ships with a generated contract that includes the AED value on each side, the VAT line, the deliverables, the acceptance criteria, and an audit trail of both parties' identity verification. The contract is FTA-compliant out of the box. You still raise the tax invoices through your own accounting software, because that is where your VAT returns are filed from, but the agreement that backs those invoices is already done.",
  ),
  p(
    "For high-value deals above AED 50,000, an additional verification tier kicks in and the platform pushes a structured invoice template you can hand to your accountant.",
  ),
  h2("If you take one thing away"),
  p(
    "Barter is taxable both ways at open market value. VATP042 is the FTA's instruction manual. Run your deals through a platform that generates the paperwork the FTA expects, not through a chat thread that an auditor cannot follow.",
  ),
  p(
    "This article is general guidance, not tax advice. For deals above AED 50,000 or where one side is zero-rated or exempt, talk to your accountant.",
  ),
];

// ---------------------------------------------------------------------------
// POST 3 — Comparison (Reem persona, decision intent)
// ---------------------------------------------------------------------------

const post3Body: Block[] = [
  p(
    "If you are a UAE business looking to trade goods or services without cash in 2026, you have three realistic options: Bareter, Obodo, or the informal Facebook and WhatsApp barter groups that have been running for years. This post is an honest comparison so you can pick the right one for your situation, without us pretending the alternatives do not exist.",
  ),
  h2("Why platform choice actually matters"),
  p(
    "The platform you pick determines four things: how quickly you find counterparties, how much vetting you can do before committing, whether the deal is enforceable when something goes wrong, and whether the paperwork survives an FTA audit. Those four things together decide whether your barter strategy scales beyond two or three favours with people you already know.",
  ),
  h2("Option 1: Free Facebook and WhatsApp barter groups"),
  p(
    "Pros: zero cost, immediate access, sometimes hundreds of members, useful for one-off swaps within a tight social circle.",
  ),
  p(
    "Cons: no identity verification, no contracts, no rating system, no AI matching, no FTA-compliant paperwork, no dispute path. You are responsible for vetting every counterparty yourself. If a deal goes wrong, your only recourse is to complain in the same group where the person is still posting.",
  ),
  p(
    "Best for: a single trade with someone you already trust, where the cash value is small and the relationship matters more than the paperwork.",
  ),
  h2("Option 2: Obodo"),
  p(
    "Obodo (obodo.ae) is a UAE barter platform aimed primarily at individual consumers and small sellers. It positions itself as \"barter free of charge\" and operates as a peer-to-peer classifieds-style site for goods.",
  ),
  p(
    "Pros: established brand in the UAE consumer barter space, focused on C2C trades, simple interface.",
  ),
  p(
    "Cons: not designed for B2B trades or high-ticket service swaps, no built-in VAT-compliant contract generation, limited business-grade verification, low organic traffic and ranking presence (domain authority 1 at time of writing), no AI matching layer.",
  ),
  p(
    "Best for: trading second-hand consumer goods between individuals, especially low-cash-value items where formal contracts and VAT invoices are not relevant.",
  ),
  h2("Option 3: Bareter"),
  p(
    "Bareter is built for verified UAE businesses and professionals doing higher-ticket B2B trades of goods and services. It is the only UAE platform we are aware of that pairs KYB-verified business profiles with auto-generated contracts and explicit VATP042-compliant paperwork.",
  ),
  p(
    "Pros: business and creator verification via Didit (Emirates ID for individuals, trade licence for businesses), AI matching that surfaces compatible counterparties automatically, binding contract generation per deal, 5% VAT treatment baked into every agreement, dispute mediation, in-app messaging with deal-state tracking, English and Arabic UI with right-to-left support, currently free for every user during launch.",
  ),
  p(
    "Cons: newer entrant so the network is still growing, currently UAE-only with a waitlist gate for users outside the Emirates, optimised for trades above AED 5,000 in value rather than tiny consumer swaps.",
  ),
  p(
    "Best for: hotels filling shoulder-season inventory, creative agencies trading services for office or production resources, luxury and automotive dealers trading slow-moving inventory, venue operators monetising idle calendar time, and content creators bartering audience access for hotel stays, event tickets, or wardrobe.",
  ),
  h2("Decision matrix"),
  p(
    "If the deal is under AED 1,000 and you already know the other person: Facebook or WhatsApp group is fine.",
  ),
  p(
    "If the deal is under AED 5,000 and one or both sides is an individual trading personal goods: Obodo is a reasonable choice.",
  ),
  p(
    "If you are a verified UAE business doing service-for-service, service-for-asset, or asset-for-asset trades above AED 5,000: Bareter is built for exactly this.",
  ),
  p(
    "If you are a content creator who wants audience access to count as real currency, with proper deliverables and contracts: Bareter, paired with Creator-tier verification.",
  ),
  h2("One last note on cost"),
  p(
    "Bareter charges no platform fees, no commission, no listing fees, and no subscription during the launch period. That is a deliberate strategy to build a healthy bartering community first, not a hidden upsell waiting to happen. Premium features may be introduced later, with notice, and what is free today will stay free for our launch community. The full pricing position is on our pricing page.",
  ),
  p(
    "Pick the option that matches the deal you are actually trying to do, not the most prestigious-sounding one. For one-off consumer swaps, the free groups are still fine. For everything else, the platform with verification, contracts, and AI matching pays for itself the moment one deal goes sideways and the paperwork saves you.",
  ),
];

// ---------------------------------------------------------------------------

const now = new Date();
const minus = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const posts = [
  {
    _id: "blogPost-how-to-barter-business-services-dubai-2026",
    _type: "blogPost" as const,
    title:
      "How to Barter Business Services in Dubai: A 2026 Playbook for SMEs",
    slug: {
      _type: "slug" as const,
      current: "how-to-barter-business-services-dubai-2026",
    },
    excerpt:
      "A practical, step-by-step guide for UAE small businesses and freelancers who want to trade services for services, or goods for services, legally and without burning cash.",
    author: "The Bareter Team",
    category: "business-insights",
    publishedAt: minus(2),
    body: post1Body,
  },
  {
    _id: "blogPost-uae-vat-barter-transactions-vatp042-explained",
    _type: "blogPost" as const,
    title:
      "UAE VAT on Barter Transactions: VATP042 Explained in Plain English",
    slug: {
      _type: "slug" as const,
      current: "uae-vat-barter-transactions-vatp042-explained",
    },
    excerpt:
      "The Federal Tax Authority's VATP042 clarification spells out exactly how barter transactions are taxed in the UAE. Here it is in plain English, with worked examples your accountant can use.",
    author: "The Bareter Team",
    category: "uae-market",
    publishedAt: minus(1),
    body: post2Body,
  },
  {
    _id: "blogPost-best-uae-barter-platform-comparison-2026",
    _type: "blogPost" as const,
    title:
      "Bareter vs Obodo vs Free Facebook Groups: Choosing a UAE Barter Platform in 2026",
    slug: {
      _type: "slug" as const,
      current: "best-uae-barter-platform-bareter-obodo-comparison",
    },
    excerpt:
      "An honest, head-to-head comparison of the three real options for UAE businesses bartering goods and services without cash in 2026.",
    author: "The Bareter Team",
    category: "bartering-tips",
    publishedAt: minus(0),
    body: post3Body,
  },
];

async function main() {
  console.log(
    `[seedBlogs] upserting ${posts.length} posts into ${projectId}/${dataset}...`,
  );
  for (const post of posts) {
    const res = await client.createOrReplace(post);
    console.log(`  ✓ ${res._id}  (${post.slug.current})`);
  }
  console.log("[seedBlogs] done.");
}

main().catch((err) => {
  console.error("[seedBlogs] failed:", err);
  process.exit(1);
});
