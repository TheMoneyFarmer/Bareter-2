import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";

const features = [
  { name: "Create unlimited listings", included: true },
  { name: "Browse all offers & requests", included: true },
  { name: "Propose unlimited barters", included: true },
  { name: "Real-time chat", included: true },
  { name: "Generate barter contracts", included: true },
  { name: "Delivery proof upload", included: true },
  { name: "Rating & reviews", included: true },
  { name: "Business verification", included: true },
  { name: "VAT-compliant invoices", included: true },
  { name: "Email notifications", included: true },
];

export function PricingPage() {
  return (
    <div className="container px-4 py-12 mx-auto max-w-4xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Bareter is Free for Everyone</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Every feature on Bareter is free to use. Create your account, list what you offer, find what you need, and complete deals — all at no cost.
        </p>
      </div>

      <Card className="border-2 border-primary mb-12">
        <CardHeader className="text-center pb-2">
          <Badge className="w-fit mx-auto mb-2">Free</Badge>
          <CardTitle className="text-2xl">Everything Included</CardTitle>
          <CardDescription>All features available to every user, with nothing to pay</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid sm:grid-cols-2 gap-3 mt-4">
            {features.map((feature) => (
              <li key={feature.name} className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                <span className="text-sm">{feature.name}</span>
              </li>
            ))}
          </ul>
          <div className="text-center mt-8">
            <Link href="/register">
              <Button size="lg" data-testid="button-start-bartering">
                Create Your Free Account
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="bg-muted/30 rounded-2xl p-8">
        <h2 className="text-2xl font-bold text-center mb-6">Frequently Asked Questions</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-2">Is there really nothing to pay?</h3>
            <p className="text-sm text-muted-foreground">
              That's right. Listing items, proposing barters, chatting, generating contracts, and completing deals are all free.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Do I need a credit card to sign up?</h3>
            <p className="text-sm text-muted-foreground">
              No. You can register and use every feature on Bareter without entering any payment details.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Are there any limits on usage?</h3>
            <p className="text-sm text-muted-foreground">
              No artificial limits — create as many listings and complete as many deals as you like.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">What about VAT and contracts?</h3>
            <p className="text-sm text-muted-foreground">
              Barter contracts and VAT-compliant invoice templates are included for free, helping you stay compliant with UAE FTA rules.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
