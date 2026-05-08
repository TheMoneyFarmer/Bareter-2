import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Search,
  UserPlus,
  FileText,
  MessageSquare,
  CreditCard,
  Shield,
  HelpCircle,
  Mail,
  Phone,
} from "lucide-react";

type PublicSettings = Record<string, string | null>;
type Article = { title: string; body: string };

const categories: {
  title: string;
  description: string;
  icon: typeof UserPlus;
  articles: Article[];
}[] = [
  {
    title: "Getting Started",
    description: "Learn the basics of bartering on Bareter",
    icon: UserPlus,
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
    title: "Making Barters",
    description: "Everything about proposing and managing barters",
    icon: FileText,
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
    title: "Chat & Communication",
    description: "Stay connected with bartering partners",
    icon: MessageSquare,
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
    title: "Account & Billing",
    description: "Bareter is free — here's what to know",
    icon: CreditCard,
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
    title: "Trust & Safety",
    description: "Stay safe while bartering",
    icon: Shield,
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
    title: "VAT & Compliance",
    description: "UAE tax regulations for barter deals",
    icon: HelpCircle,
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

type SanityHelpArticle = { slug: string; title: string; body: string };

export function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["/api/public/settings"],
    staleTime: 60_000,
  });
  const { data: sanityArticles = [] } = useQuery<SanityHelpArticle[]>({
    queryKey: ["/api/public/help-articles"],
    staleTime: 60_000,
  });
  const supportEmail = settings?.support_email || "support@bareter.com";
  const supportPhone = settings?.support_phone || "+971 52 313 3512";
  const [openByCategory, setOpenByCategory] = useState<Record<string, string[]>>({});

  const toggleFirstArticle = (slug: string, firstValue: string) => {
    setOpenByCategory((prev) => {
      const current = prev[slug] ?? [];
      const next = current.includes(firstValue)
        ? current.filter((v) => v !== firstValue)
        : [...current, firstValue];
      return { ...prev, [slug]: next };
    });
  };

  return (
    <div className="container px-4 py-12 mx-auto max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Help Center</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Find answers to common questions and learn how to make the most of Bareter
        </p>
        <div className="max-w-xl mx-auto relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search for help articles..."
            className="pl-12 h-12 text-lg"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-help"
          />
        </div>
      </div>

      {sanityArticles.length > 0 && (
        <div className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Articles</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sanityArticles
              .filter(
                (a) =>
                  !searchQuery ||
                  a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  a.body.toLowerCase().includes(searchQuery.toLowerCase()),
              )
              .map((article) => (
                <Card key={article.slug} data-testid={`card-help-sanity-${article.slug}`}>
                  <CardHeader>
                    <CardTitle className="text-base">{article.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-4">{article.body}</p>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
        {categories
          .filter((cat) =>
            !searchQuery ||
            cat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            cat.articles.some(
              (a) =>
                a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                a.body.toLowerCase().includes(searchQuery.toLowerCase()),
            ),
          )
          .map((category) => {
          const slug = category.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          const firstValue = `${slug}-0`;
          const openValues = openByCategory[slug] ?? [];
          return (
            <Card key={category.title} data-testid={`card-help-category-${slug}`}>
              <CardHeader
                role="button"
                tabIndex={0}
                onClick={() => toggleFirstArticle(slug, firstValue)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleFirstArticle(slug, firstValue);
                  }
                }}
                className="cursor-pointer hover-elevate rounded-t-lg"
                data-testid={`button-help-card-${slug}`}
              >
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <category.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{category.title}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion
                  type="multiple"
                  value={openValues}
                  onValueChange={(v) =>
                    setOpenByCategory((prev) => ({ ...prev, [slug]: v }))
                  }
                  className="w-full"
                >
                  {category.articles.map((article, index) => {
                    const articleSlug = article.title
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/(^-|-$)/g, "");
                    return (
                      <AccordionItem
                        key={article.title}
                        value={`${slug}-${index}`}
                        className="border-b last:border-b-0"
                      >
                        <AccordionTrigger
                          className="text-sm text-left py-3 hover:no-underline text-muted-foreground hover:text-foreground"
                          data-testid={`button-help-article-${slug}-${articleSlug}`}
                        >
                          {article.title}
                        </AccordionTrigger>
                        <AccordionContent
                          className="text-sm text-muted-foreground pb-3"
                          data-testid={`text-help-article-${slug}-${articleSlug}`}
                        >
                          {article.body}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email Support
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <p className="font-medium mb-2">{supportEmail}</p>
            <p className="text-sm text-muted-foreground">
              Response time: Within 24 hours (business days)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Phone Support
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              For urgent matters, reach us by phone during business hours.
            </p>
            <p className="font-medium mb-2">{supportPhone}</p>
            <p className="text-sm text-muted-foreground">
              Mon - Fri: 9:00 AM - 6:00 PM (GST)
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12 text-center">
        <p className="text-muted-foreground mb-4">Still have questions?</p>
        <Link href="/faq">
          <Button variant="outline" data-testid="link-view-faq">View FAQs</Button>
        </Link>
      </div>
    </div>
  );
}
