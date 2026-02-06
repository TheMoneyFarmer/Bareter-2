import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import {
  ArrowRight,
  Handshake,
  Shield,
  FileText,
  MessageSquare,
  Star,
  TrendingUp,
  Users,
  CheckCircle,
  Building2,
  Utensils,
  Laptop,
  Briefcase,
  PartyPopper,
  ShoppingBag,
} from "lucide-react";

const categories = [
  { icon: Building2, label: "Hospitality", count: 234 },
  { icon: ShoppingBag, label: "Fashion", count: 189 },
  { icon: Laptop, label: "SaaS", count: 156 },
  { icon: Briefcase, label: "Services", count: 312 },
  { icon: Utensils, label: "Food", count: 178 },
  { icon: PartyPopper, label: "Events", count: 145 },
];

const steps = [
  {
    icon: Users,
    title: "Create Your Profile",
    description: "List what you offer and what you need. Upload your business verification for a verified badge.",
  },
  {
    icon: Handshake,
    title: "Find & Propose Trades",
    description: "Browse listings from verified UAE businesses. Click to propose a trade with your counter-offer.",
  },
  {
    icon: MessageSquare,
    title: "Negotiate & Agree",
    description: "Chat in real-time to finalize terms. Generate a binding barter contract with all details.",
  },
  {
    icon: CheckCircle,
    title: "Complete & Rate",
    description: "Upload delivery proof, pay a small success fee, and leave ratings for each other.",
  },
];

const stats = [
  { value: "AED 12M+", label: "Total Trade Value" },
  { value: "2,500+", label: "Active Users" },
  { value: "850+", label: "Completed Deals" },
  { value: "98%", label: "Satisfaction Rate" },
];

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%2314b8a6%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50" />
        
        <div className="container relative px-4 py-20 md:py-32 mx-auto max-w-7xl">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5">
              UAE's Premier Barter Marketplace
            </Badge>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Trade Value,{" "}
              <span className="text-primary">Not Cash</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-8 leading-relaxed">
              Connect with verified UAE businesses to exchange goods and services. 
              No cash needed - just value for value, backed by secure contracts 
              and UAE VAT compliance.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href={user ? "/browse" : "/register"}>
                <Button size="lg" className="gap-2 px-8" data-testid="button-get-started">
                  {user ? "Browse Listings" : "Start Trading Free"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button size="lg" variant="outline" data-testid="button-how-it-works">
                  See How It Works
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 mt-12">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center px-4">
                  <div className="text-2xl md:text-3xl font-bold text-primary">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-card">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Popular Categories</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Explore active barter opportunities across diverse industries
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map((category) => (
              <Link key={category.label} href={`/browse?category=${category.label}`}>
                <Card className="hover-elevate cursor-pointer h-full">
                  <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                      <category.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-medium mb-1">{category.label}</h3>
                    <span className="text-xs text-muted-foreground">{category.count} listings</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How Margin Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Simple, secure, and transparent barter trading in four easy steps
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={step.title} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <step.icon className="h-8 w-8 text-primary" />
                    </div>
                    <div className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
                      {index + 1}
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-[calc(50%+3rem)] w-[calc(100%-6rem)] h-px bg-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-card">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-4">Why Choose Margin</Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Secure, Compliant, Professional
              </h2>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Verified Business Partners</h4>
                    <p className="text-sm text-muted-foreground">
                      All users can upload their trade license or ID for verification. 
                      Trade with confidence knowing your partners are legitimate.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Binding Barter Contracts</h4>
                    <p className="text-sm text-muted-foreground">
                      Generate professional PDF contracts with retail values, 
                      timelines, deliverables, and UAE VAT compliance clauses.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">UAE VAT Compliant</h4>
                    <p className="text-sm text-muted-foreground">
                      All contracts include proper VAT clauses at 5% on open market value, 
                      compliant with UAE Federal Tax Authority rules.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Star className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Ratings & Reputation</h4>
                    <p className="text-sm text-muted-foreground">
                      Build your reputation through verified reviews. 
                      Higher ratings mean better trading opportunities.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/5 rounded-3xl blur-3xl" />
              <Card className="relative">
                <CardContent className="p-8">
                  <div className="text-center space-y-6">
                    <div className="h-20 w-20 rounded-2xl bg-primary mx-auto flex items-center justify-center">
                      <Handshake className="h-10 w-10 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold mb-2">Ready to Start Trading?</h3>
                      <p className="text-muted-foreground mb-6">
                        Join thousands of UAE businesses already trading value for value
                      </p>
                      <Link href={user ? "/browse" : "/register"}>
                        <Button size="lg" className="w-full gap-2" data-testid="button-cta-bottom">
                          {user ? "Explore Listings" : "Create Free Account"}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      No subscription required. Pay only 12% success fee on completed deals.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
