import { useSeo } from "@/hooks/use-seo";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Sparkles, Users } from "lucide-react";
import { useWaitlist } from "@/lib/waitlist";
import { useAuth } from "@/lib/auth";
import { useCountUp } from "@/hooks/use-count-up";
import { useReveal } from "@/hooks/use-reveal";

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
  const { user } = useAuth();
  const { mode: waitlistMode, open: openWaitlist } = useWaitlist();
  const [, navigate] = useLocation();
  const { ref: ctaRef, isVisible } = useReveal<HTMLDivElement>();
  const { data: counter, isLoading: countLoading } = useQuery<{ count: number }>({
    queryKey: ["/api/waitlist/count"],
    refetchInterval: 10_000,
    enabled: waitlistMode.enabled,
  });
  const waitlistReady = waitlistMode.enabled && !countLoading && counter?.count !== undefined;
  const animatedCount = useCountUp(waitlistReady ? counter.count : null, 1500, isVisible);

  useSeo({ title: "Pricing — Free during launch · Bareter" });

  const onPrimaryClick = () => {
    if (user) {
      navigate("/create-listing");
      return;
    }
    if (waitlistMode.enabled) {
      openWaitlist();
      return;
    }
    navigate("/register");
  };

  const ctaLabel = user
    ? "Create a listing"
    : waitlistMode.enabled
      ? "Join the waitlist"
      : "Sign up";

  return (
    <div className="container px-4 py-12 mx-auto max-w-4xl" data-testid="page-pricing">
      <div className="text-center mb-12">
        <Badge
          variant="secondary"
          className="mb-4 inline-flex items-center gap-1.5"
          data-testid="badge-launch-promise"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Free during launch
        </Badge>
        <h1
          className="text-4xl font-bold mb-4"
          data-testid="heading-pricing"
        >
          Bareter is free for everyone
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          No fees. No commission. No subscription. Every feature on Bareter is
          free to use during our launch — list what you offer, find what you
          need, and complete deals at no cost.
        </p>
      </div>

      <Card className="border-2 border-primary mb-12">
        <CardHeader className="text-center pb-2">
          <Badge className="w-fit mx-auto mb-2">Free</Badge>
          <CardTitle className="text-2xl">Everything included</CardTitle>
          <CardDescription>
            All features available to every user, with nothing to pay
          </CardDescription>
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
          <div ref={ctaRef} className="text-center mt-8">
            <Button
              size="lg"
              onClick={onPrimaryClick}
              data-testid="button-pricing-cta"
            >
              {ctaLabel}
            </Button>
            {waitlistReady && !user && animatedCount !== null && (
              <p
                className="mt-3 text-sm text-muted-foreground flex items-center justify-center gap-1.5"
                data-testid="text-pricing-waitlist-count"
              >
                <Users className="h-4 w-4 text-bareter-teal" />
                <span className="font-semibold text-foreground">{animatedCount.toLocaleString()}+</span>{" "}
                businesses already on the waitlist
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="bg-muted/30 rounded-2xl p-8">
        <h2 className="text-2xl font-bold text-center mb-6">Frequently asked questions</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-2">Is there really nothing to pay?</h3>
            <p className="text-sm text-muted-foreground">
              That's right. During our launch, listing items, proposing barters,
              chatting, generating contracts, and completing deals are all free.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Do I need a credit card to sign up?</h3>
            <p className="text-sm text-muted-foreground">
              No. You can register and use every feature on Bareter without
              entering any payment details.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Are there any limits on usage?</h3>
            <p className="text-sm text-muted-foreground">
              No artificial limits — create as many listings and complete as
              many deals as you like.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Will paid plans come later?</h3>
            <p className="text-sm text-muted-foreground">
              We may introduce optional paid features in the future, but
              everything available today will stay free for our launch
              community. We'll always tell you well in advance before anything
              changes.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">What about VAT and contracts?</h3>
            <p className="text-sm text-muted-foreground">
              Barter contracts and VAT-compliant invoice templates are included
              for free, helping you stay compliant with UAE FTA rules.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">How do you make money then?</h3>
            <p className="text-sm text-muted-foreground">
              We don't, yet — and that's intentional. Our focus during launch
              is building a healthy bartering community across the UAE.
            </p>
          </div>
        </div>

        <div className="text-center mt-8">
          <Link href="/faq">
            <Button variant="outline" data-testid="link-pricing-faq">
              See more FAQs
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
