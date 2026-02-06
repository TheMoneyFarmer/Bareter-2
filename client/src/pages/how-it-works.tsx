import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  UserPlus,
  Search,
  Handshake,
  MessageSquare,
  FileText,
  CheckCircle,
  ArrowRight,
  Shield,
  DollarSign,
  Star,
} from "lucide-react";

const steps = [
  {
    step: 1,
    title: "Create Your Profile",
    description: "Sign up and build your business profile. Add what you offer and what you need, upload your portfolio, and get verified for more trust.",
    icon: UserPlus,
  },
  {
    step: 2,
    title: "Browse & Discover",
    description: "Explore listings from verified UAE businesses. Filter by category, location, and value to find perfect trade opportunities.",
    icon: Search,
  },
  {
    step: 3,
    title: "Propose a Trade",
    description: "Found something you want? Propose a trade by selecting what you offer in return. Set fair values for both sides.",
    icon: Handshake,
  },
  {
    step: 4,
    title: "Negotiate & Agree",
    description: "Chat in real-time to discuss details, timelines, and deliverables. Refine the terms until both parties are satisfied.",
    icon: MessageSquare,
  },
  {
    step: 5,
    title: "Sign the Contract",
    description: "Generate a binding barter contract with both parties' offers, values, and VAT compliance clauses. Digital signatures seal the deal.",
    icon: FileText,
  },
  {
    step: 6,
    title: "Complete & Review",
    description: "Deliver your goods/services, upload proof, and mark complete. Rate your trading partner to build community trust.",
    icon: CheckCircle,
  },
];

const benefits = [
  {
    title: "Verified Businesses",
    description: "All traders are verified with trade licenses and IDs, ensuring you're dealing with legitimate UAE businesses.",
    icon: Shield,
  },
  {
    title: "Low Success Fees",
    description: "Only pay 12% of the smaller trade value upon completion (min AED 100). No upfront fees or subscriptions.",
    icon: DollarSign,
  },
  {
    title: "Trust & Ratings",
    description: "Our rating system helps you identify reliable partners. Build your reputation with every successful trade.",
    icon: Star,
  },
];

export function HowItWorksPage() {
  return (
    <div className="container px-4 py-12 mx-auto max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">How Margin Works</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Trade goods and services with UAE businesses in 6 simple steps. No cash needed.
        </p>
      </div>

      <div className="grid gap-6 mb-16">
        {steps.map((step, index) => (
          <Card key={step.step} className="relative overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <step.icon className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-medium text-primary">Step {step.step}</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:flex items-center">
                    <ArrowRight className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Why Trade on Margin?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {benefits.map((benefit) => (
            <Card key={benefit.title}>
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <benefit.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{benefit.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">{benefit.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="text-center bg-primary/5 rounded-2xl p-8">
        <h2 className="text-2xl font-bold mb-4">Ready to Start Trading?</h2>
        <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
          Join hundreds of UAE businesses already trading on Margin. Create your free account today.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/register">
            <Button size="lg" data-testid="button-get-started">Get Started Free</Button>
          </Link>
          <Link href="/browse">
            <Button size="lg" variant="outline" data-testid="button-browse-listings">Browse Listings</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
