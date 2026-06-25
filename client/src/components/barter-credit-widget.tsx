import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins, TrendingUp, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useAuth as useUser } from "@/lib/auth";

interface BarterCreditBalance {
  id: string;
  userId: string;
  balanceAed: string;
  lifetimeEarnedAed: string;
  updatedAt: string | null;
}

interface BarterCreditTransaction {
  id: string;
  userId: string;
  amountAed: string;
  type: string;
  dealId: string | null;
  note: string | null;
  createdAt: string | null;
}

interface BarterCreditsData {
  balance: BarterCreditBalance | null;
  transactions: BarterCreditTransaction[];
}

export function BarterCreditWidget() {
  const { user } = useUser();

  const { data, isLoading } = useQuery<BarterCreditsData>({
    queryKey: ["/api/me/barter-credits"],
    enabled: !!user,
    staleTime: 30_000,
  });

  if (!user) return null;
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-3 w-40" />
        </CardContent>
      </Card>
    );
  }

  const balance = parseFloat(data?.balance?.balanceAed ?? "0");
  const lifetime = parseFloat(data?.balance?.lifetimeEarnedAed ?? "0");
  const recent = (data?.transactions ?? []).slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-500" />
          Barter Credits
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-2xl font-bold text-amber-600">
            AED {balance.toFixed(2)}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <TrendingUp className="h-3 w-3" />
            AED {lifetime.toFixed(2)} earned all time
          </p>
        </div>

        {recent.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Recent</p>
            {recent.map((tx) => {
              const amt = parseFloat(tx.amountAed);
              const isPositive = amt > 0;
              return (
                <div key={tx.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                    {isPositive
                      ? <ArrowUpRight className="h-3 w-3 text-green-500 shrink-0" />
                      : <ArrowDownLeft className="h-3 w-3 text-red-500 shrink-0" />
                    }
                    <span className="truncate">{tx.note ?? tx.type}</span>
                  </div>
                  <Badge variant={isPositive ? "default" : "secondary"} className={`text-[10px] shrink-0 ${isPositive ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}`}>
                    {isPositive ? "+" : ""}AED {Math.abs(amt).toFixed(2)}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        {balance === 0 && recent.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Complete trades to earn Barter Credits when your item value exceeds your trade partner's.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
