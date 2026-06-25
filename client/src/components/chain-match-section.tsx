import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Repeat2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface ChainNode {
  id: number;
  title: string;
  userName: string;
  userId: number;
}

interface TradeChain {
  myListing: {
    id: number;
    title: string;
    categories: string[];
  };
  nodeB: ChainNode;
  nodeC: ChainNode;
}

export function ChainMatchSection() {
  const { user } = useAuth();

  const { data: chains, isLoading } = useQuery<TradeChain[]>({
    queryKey: ["/api/listings/chain-matches"],
    enabled: !!user,
  });

  // Not logged in — render nothing
  if (!user) return null;

  // Loading state
  if (isLoading) {
    return (
      <div className="my-6">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-2 animate-pulse">
          Finding trade chains...
        </p>
      </div>
    );
  }

  // No chains found — render nothing
  if (!chains || chains.length === 0) return null;

  const visibleChains = chains.slice(0, 3);

  return (
    <Card className="my-6 border-bareter-teal/20 bg-gradient-to-br from-emerald-50/50 to-background dark:from-emerald-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Repeat2 className="w-5 h-5 text-bareter-teal shrink-0" />
          <CardTitle className="text-base">3-Way Trade Chains Found</CardTitle>
          <Badge className="bg-bareter-teal text-white text-xs ml-1">
            {chains.length}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Multi-step barter paths where everyone gets what they want
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleChains.map((chain, index) => (
          <div
            key={index}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border bg-background/60"
          >
            {/* Chain path */}
            <div className="flex flex-wrap items-center gap-1 text-sm min-w-0">
              <span
                className="font-medium text-foreground truncate max-w-[120px]"
                title={chain.myListing.title}
              >
                {chain.myListing.title}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground truncate max-w-[140px]" title={chain.nodeB.title}>
                <span className="font-medium text-foreground">{chain.nodeB.title}</span>
                {" "}
                <span className="text-xs">by {chain.nodeB.userName}</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground truncate max-w-[140px]" title={chain.nodeC.title}>
                <span className="font-medium text-foreground">{chain.nodeC.title}</span>
                {" "}
                <span className="text-xs">by {chain.nodeC.userName}</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-bareter-teal font-medium whitespace-nowrap">
                back to you
              </span>
            </div>

            {/* CTA */}
            <Link href={`/listings/${chain.nodeB.id}`}>
              <Button
                size="sm"
                variant="outline"
                className="border-bareter-teal text-bareter-teal hover:bg-bareter-teal hover:text-white shrink-0 text-xs"
              >
                Explore Chain
              </Button>
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
