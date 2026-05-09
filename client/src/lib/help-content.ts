export type HelpArticle = { title: string; body: string };

export type HelpIconName =
  | "user-plus"
  | "file-text"
  | "message-square"
  | "credit-card"
  | "shield"
  | "help-circle";

export type HelpCategory = {
  slug: string;
  title: string;
  description: string;
  icon: HelpIconName;
  articles: HelpArticle[];
};

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Learn the basics of bartering on Bareter",
    icon: "user-plus",
    articles: [
      {
        title: "How to create your account",
        body:
          "Click 'Sign up' from the top of any page and register with your email and a password. Bareter is free for everyone — there's no card required to create an account.",
      },
      {
        title: "Completing your business profile",
        body:
          "Open your profile from the avatar menu and add your business name, a short description, your country and city, and a logo. A complete profile builds trust and helps the AI matching engine connect you with the right barter partners.",
      },
      {
        title: "Getting verified as a business",
        body:
          "Upload your trade licence, commercial registration, or Emirates ID from the verification section of your profile. Our team reviews documents within 1–2 business days, after which a verified badge appears on your profile.",
      },
      {
        title: "Creating your first listing",
        body:
          "From your dashboard, click 'Create listing', then add a title, description, photos, category, and the open-market value of what you're offering. Save it and your listing goes live for other businesses to browse and propose barters on.",
      },
    ],
  },
  {
    slug: "making-barters",
    title: "Making Barters",
    description: "Everything about proposing and managing barters",
    icon: "file-text",
    articles: [
      {
        title: "How to propose a barter",
        body:
          "Open any listing you're interested in and click 'Propose a Barter'. Choose what you're offering in return and its retail value, add a short note, and send it. The owner will be notified and can accept, negotiate, or decline.",
      },
      {
        title: "Negotiating deal terms",
        body:
          "Every proposal opens a deal chat where both sides can adjust quantities, add extra items, or refine timelines. Values don't need to match exactly — the goal is for both parties to feel the exchange is fair before signing.",
      },
      {
        title: "Understanding the barter contract",
        body:
          "Once both sides agree, Bareter auto-generates a contract listing what each party provides, declared values, deliverables, and timelines. It's a legally binding agreement under UAE law and is digitally signed by both parties.",
      },
      {
        title: "Uploading delivery proof",
        body:
          "After delivering your side of the barter, attach photos, receipts, or signed documents in the deal chat as proof. Once both parties confirm delivery, the deal is marked completed and you can rate each other.",
      },
    ],
  },
  {
    slug: "chat-communication",
    title: "Chat & Communication",
    description: "Stay connected with bartering partners",
    icon: "message-square",
    articles: [
      {
        title: "Using the deal chat",
        body:
          "Every active deal has a dedicated chat thread. Use it to clarify terms, share photos, agree on delivery dates, and keep a written record of everything that was promised — it stays attached to the deal for future reference.",
      },
      {
        title: "Notification settings",
        body:
          "Open your account settings to choose which events trigger an email or in-app notification — new proposals, chat messages, contract updates, and deal status changes can each be toggled independently.",
      },
      {
        title: "Reporting inappropriate behavior",
        body:
          "Use the report option inside any chat or profile to flag spam, harassment, or attempts to move payments off-platform. Our team reviews every report and may suspend accounts that break our community rules.",
      },
      {
        title: "Communication best practices",
        body:
          "Keep conversations on Bareter so disputes can be reviewed if needed, agree on dates and quantities in writing, and confirm delivery before marking a deal complete. Clear, respectful communication is the fastest path to a good rating.",
      },
    ],
  },
  {
    slug: "account-billing",
    title: "Account & Billing",
    description: "Bareter is free — here's what to know",
    icon: "credit-card",
    articles: [
      {
        title: "Is Bareter really free?",
        body:
          "Yes. Creating an account, posting listings, proposing barters, generating contracts, and completing deals are all free. We don't take a commission on barter transactions.",
      },
      {
        title: "Managing your account",
        body:
          "From your account settings you can update your email, change your password, manage notification preferences, and delete your account if you ever want to leave. All of it is self-serve.",
      },
      {
        title: "VAT-compliant invoice templates",
        body:
          "Bareter contracts include the information you need to issue a UAE VAT tax invoice for your side of the barter — declared value, parties, and date. You issue the invoice from your own accounting system using these details.",
      },
      {
        title: "Updating your business details",
        body:
          "Change your business name, trade licence, address, or logo from your profile at any time. If you update licence information, the verified badge may be re-checked by our team.",
      },
    ],
  },
  {
    slug: "trust-safety",
    title: "Trust & Safety",
    description: "Stay safe while bartering",
    icon: "shield",
    articles: [
      {
        title: "Verified business badges",
        body:
          "Verified badges appear on profiles whose business documents have been reviewed and approved by our team. Look for the badge before agreeing to high-value barters, and complete your own verification to earn trust faster.",
      },
      {
        title: "Rating and reviews system",
        body:
          "After a deal is completed, both parties can leave a 1–5 star rating and a written review. Ratings are public on the profile and can only be left by people who actually completed a barter with you.",
      },
      {
        title: "Dispute resolution process",
        body:
          "Try to resolve issues first inside the deal chat. If that fails, contact our support team — we review the chat history, contract, and any uploaded proof to mediate. Repeat offenders can be suspended from the platform.",
      },
      {
        title: "Protecting your account",
        body:
          "Use a strong, unique password, never share login codes, and keep barter conversations on Bareter. Be cautious of anyone asking you to pay cash, send wire transfers, or move the deal off-platform.",
      },
    ],
  },
  {
    slug: "vat-compliance",
    title: "VAT & Compliance",
    description: "UAE tax regulations for barter deals",
    icon: "help-circle",
    articles: [
      {
        title: "VAT on barter transactions",
        body:
          "Under UAE FTA rules, barter transactions are subject to 5% VAT based on the open-market value of the goods or services exchanged. Both sides should issue a tax invoice for their side of the deal.",
      },
      {
        title: "Generating VAT invoices",
        body:
          "Bareter doesn't issue VAT invoices on your behalf. Use the declared values, party details, and deal date from the contract to generate a compliant tax invoice from your own accounting software.",
      },
      {
        title: "FTA compliance requirements",
        body:
          "Each side is responsible for declaring barter income, charging VAT on their supply, and keeping records as required by the FTA. Our contract template includes a VAT reminder so neither side forgets the obligation.",
      },
      {
        title: "Record keeping for barters",
        body:
          "Keep your signed contract, the deal chat history, delivery proof, and the VAT invoice you issued. Bareter retains your contracts in your account so you can download them whenever you need to.",
      },
    ],
  },
];

export function searchHelpContent(
  query: string,
): { category: HelpCategory; article: HelpArticle }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: { category: HelpCategory; article: HelpArticle; score: number }[] = [];
  for (const cat of HELP_CATEGORIES) {
    for (const art of cat.articles) {
      const titleHit = art.title.toLowerCase().includes(q);
      const bodyHit = art.body.toLowerCase().includes(q);
      const catHit = cat.title.toLowerCase().includes(q);
      if (titleHit || bodyHit || catHit) {
        const score = (titleHit ? 3 : 0) + (catHit ? 1 : 0) + (bodyHit ? 1 : 0);
        results.push({ category: cat, article: art, score });
      }
    }
  }
  return results.sort((a, b) => b.score - a.score).map(({ score, ...rest }) => rest);
}
