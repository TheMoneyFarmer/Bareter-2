import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  ArrowRight,
} from "lucide-react";

const categories = [
  {
    title: "Getting Started",
    description: "Learn the basics of bartering on Margin",
    icon: UserPlus,
    articles: [
      "How to create your account",
      "Completing your business profile",
      "Getting verified as a business",
      "Creating your first listing",
    ],
  },
  {
    title: "Making Trades",
    description: "Everything about proposing and managing trades",
    icon: FileText,
    articles: [
      "How to propose a trade",
      "Negotiating deal terms",
      "Understanding the barter contract",
      "Uploading delivery proof",
    ],
  },
  {
    title: "Chat & Communication",
    description: "Stay connected with bartering partners",
    icon: MessageSquare,
    articles: [
      "Using the deal chat",
      "Notification settings",
      "Reporting inappropriate behavior",
      "Communication best practices",
    ],
  },
  {
    title: "Payments & Fees",
    description: "Understand our simple fee structure",
    icon: CreditCard,
    articles: [
      "How success fees work",
      "Payment methods accepted",
      "Splitting fees with partners",
      "Getting invoices and receipts",
    ],
  },
  {
    title: "Trust & Safety",
    description: "Stay safe while bartering",
    icon: Shield,
    articles: [
      "Verified business badges",
      "Rating and reviews system",
      "Dispute resolution process",
      "Protecting your account",
    ],
  },
  {
    title: "VAT & Compliance",
    description: "UAE tax regulations for barter trades",
    icon: HelpCircle,
    articles: [
      "VAT on barter transactions",
      "Generating VAT invoices",
      "FTA compliance requirements",
      "Record keeping for trades",
    ],
  },
];

export function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="container px-4 py-12 mx-auto max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Help Center</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Find answers to common questions and learn how to make the most of Margin
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

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
        {categories.map((category) => (
          <Card key={category.title} className="hover-elevate cursor-pointer">
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <category.icon className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-lg">{category.title}</CardTitle>
              <CardDescription>{category.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {category.articles.map((article) => (
                  <li key={article}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 group"
                    >
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      {article}
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
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
            <p className="font-medium mb-2">support@margin.ae</p>
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
            <p className="font-medium mb-2">+971 4 123 4567</p>
            <p className="text-sm text-muted-foreground">
              Sun - Thu: 9:00 AM - 6:00 PM (GST)
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
