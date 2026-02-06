import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const features = [
  { name: "Create unlimited listings", included: true },
  { name: "Browse all offers & requests", included: true },
  { name: "Propose unlimited trades", included: true },
  { name: "Real-time chat", included: true },
  { name: "Generate barter contracts", included: true },
  { name: "Delivery proof upload", included: true },
  { name: "Rating & reviews", included: true },
  { name: "Business verification", included: true },
  { name: "VAT-compliant invoices", included: true },
  { name: "Email notifications", included: true },
];

const feeExamples = [
  { scenario: "Hotel stay (AED 5,000) for Marketing (AED 6,000)", smaller: 5000, fee: 600 },
  { scenario: "Software license (AED 2,000) for Events (AED 2,500)", smaller: 2000, fee: 240 },
  { scenario: "Consulting (AED 800) for Office supplies (AED 900)", smaller: 800, fee: 100 },
  { scenario: "Design work (AED 500) for Photography (AED 600)", smaller: 500, fee: 100 },
];

export function PricingPage() {
  return (
    <div className="container px-4 py-12 mx-auto max-w-5xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          No subscriptions, no hidden fees. Only pay when you successfully complete a trade.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-16">
        <Card className="border-2 border-primary">
          <CardHeader className="text-center pb-2">
            <Badge className="w-fit mx-auto mb-2">Only Fee</Badge>
            <CardTitle className="text-2xl">Success Fee</CardTitle>
            <CardDescription>Charged only when a deal is completed</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="mb-6">
              <span className="text-5xl font-bold">12%</span>
              <p className="text-muted-foreground mt-2">of the smaller declared value</p>
              <p className="text-sm text-muted-foreground mt-1">Minimum AED 100 per deal</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
              <span>Paid by the trade seeker (initiator)</span>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  The person who proposes the trade pays the success fee. Option to split or transfer to provider available.
                </TooltipContent>
              </Tooltip>
            </div>
            <Link href="/register">
              <Button className="w-full" size="lg" data-testid="button-start-trading">
                Start Trading Free
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Everything Included</CardTitle>
            <CardDescription>All features available to every user</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {features.map((feature) => (
                <li key={feature.name} className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-sm">{feature.name}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Fee Examples</h2>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium">Trade Scenario</th>
                    <th className="text-right p-4 font-medium">Smaller Value</th>
                    <th className="text-right p-4 font-medium">Success Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {feeExamples.map((example, index) => (
                    <tr key={index} className="border-b last:border-b-0">
                      <td className="p-4 text-sm">{example.scenario}</td>
                      <td className="p-4 text-right text-sm">AED {example.smaller.toLocaleString()}</td>
                      <td className="p-4 text-right text-sm font-medium text-primary">
                        AED {example.fee.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground mt-4">
          * Fee is always calculated on the smaller of the two declared values, with a minimum of AED 100
        </p>
      </div>

      <div className="bg-muted/30 rounded-2xl p-8">
        <h2 className="text-2xl font-bold text-center mb-6">Frequently Asked Questions</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-2">When do I pay the fee?</h3>
            <p className="text-sm text-muted-foreground">
              Only when both parties mark the deal as complete. If a deal is cancelled, no fee is charged.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Can I split the fee?</h3>
            <p className="text-sm text-muted-foreground">
              Yes, you can agree with your trading partner to split the fee or have the provider pay instead.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Is there a subscription?</h3>
            <p className="text-sm text-muted-foreground">
              No. Margin is completely free to use. You only pay when you successfully complete trades.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Are there any hidden fees?</h3>
            <p className="text-sm text-muted-foreground">
              None. The 12% success fee (min AED 100) is the only cost. No setup fees, no monthly fees.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
