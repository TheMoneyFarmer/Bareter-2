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
import { HELP_CATEGORIES, type HelpIconName } from "@/lib/help-content";

const ICON_MAP: Record<HelpIconName, typeof UserPlus> = {
  "user-plus": UserPlus,
  "file-text": FileText,
  "message-square": MessageSquare,
  "credit-card": CreditCard,
  shield: Shield,
  "help-circle": HelpCircle,
};

type PublicSettings = Record<string, string | null>;
type Article = { title: string; body: string };

const categories: {
  title: string;
  description: string;
  icon: typeof UserPlus;
  articles: Article[];
}[] = HELP_CATEGORIES.map((c) => ({
  title: c.title,
  description: c.description,
  icon: ICON_MAP[c.icon],
  articles: c.articles,
}));

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
          <h2 className="text-xl font-semibold mb-4">Help Articles</h2>
          <Card data-testid="card-help-sanity-articles">
            <CardContent className="p-0">
              <Accordion type="multiple" className="w-full">
                {sanityArticles
                  .filter(
                    (a) =>
                      !searchQuery ||
                      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      a.body.toLowerCase().includes(searchQuery.toLowerCase()),
                  )
                  .map((article) => (
                    <AccordionItem
                      key={article.slug}
                      value={article.slug}
                      className="border-b last:border-b-0 px-4"
                      data-testid={`item-help-sanity-${article.slug}`}
                    >
                      <AccordionTrigger
                        className="text-sm text-left py-4 hover:no-underline font-medium"
                        data-testid={`button-help-sanity-${article.slug}`}
                      >
                        {article.title}
                      </AccordionTrigger>
                      <AccordionContent
                        className="text-sm text-muted-foreground pb-4 whitespace-pre-line"
                        data-testid={`text-help-sanity-${article.slug}`}
                      >
                        {article.body}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      )}

      {sanityArticles.length === 0 && (
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
      )}

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
