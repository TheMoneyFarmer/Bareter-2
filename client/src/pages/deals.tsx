import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import type { DealWithUsers } from "@shared/schema";
import {
  Handshake,
  ArrowRight,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  FileText,
  MessageSquare,
  Calendar,
} from "lucide-react";

const stateConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-gray-500", icon: FileText },
  proposed: { label: "Proposed", color: "bg-blue-500", icon: Clock },
  accepted: { label: "Accepted", color: "bg-green-500", icon: CheckCircle },
  in_progress: { label: "In Progress", color: "bg-yellow-500", icon: Package },
  delivery_proof: { label: "Awaiting Proof", color: "bg-orange-500", icon: FileText },
  completed: { label: "Completed", color: "bg-emerald-500", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-500", icon: XCircle },
};

function DealCard({ deal, userId }: { deal: DealWithUsers; userId: string }) {
  const isSeeker = deal.seekerId === userId;
  const otherParty = isSeeker ? deal.provider : deal.seeker;
  const myOffer = isSeeker ? deal.seekerOffer : deal.providerOffer;
  const myValue = isSeeker ? deal.seekerValue : deal.providerValue;
  const theirOffer = isSeeker ? deal.providerOffer : deal.seekerOffer;
  const theirValue = isSeeker ? deal.providerValue : deal.seekerValue;
  const config = stateConfig[deal.state] || stateConfig.draft;
  const StateIcon = config.icon;

  return (
    <Link href={`/deals/${deal.id}`}>
      <Card className="hover-elevate cursor-pointer" data-testid={`card-deal-${deal.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12 flex-shrink-0">
              <AvatarImage src={otherParty?.avatarUrl || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {otherParty?.fullName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold truncate">{otherParty?.fullName}</span>
                <Badge variant="outline" className="text-xs shrink-0">
                  <div className={`h-2 w-2 rounded-full ${config.color} mr-1`} />
                  {config.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Deal #{deal.dealNumber}
              </p>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">You {isSeeker ? "offer" : "provide"}</p>
                  <p className="font-medium line-clamp-1">{myOffer}</p>
                  <p className="text-primary font-bold">
                    AED {parseFloat(myValue as string).toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">They {isSeeker ? "provide" : "offer"}</p>
                  <p className="font-medium line-clamp-1">{theirOffer}</p>
                  <p className="text-primary font-bold">
                    AED {parseFloat(theirValue as string).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {deal.createdAt ? new Date(deal.createdAt).toLocaleDateString() : "N/A"}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                    <MessageSquare className="h-3 w-3" />
                    Chat
                  </Button>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function DealsPage() {
  const { user } = useAuth();

  const { data: deals, isLoading } = useQuery<DealWithUsers[]>({
    queryKey: ["/api/deals"],
    enabled: !!user,
  });

  const activeDeals = deals?.filter((d) => !["completed", "cancelled"].includes(d.state)) || [];
  const completedDeals = deals?.filter((d) => d.state === "completed") || [];
  const cancelledDeals = deals?.filter((d) => d.state === "cancelled") || [];

  if (!user) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
          <Handshake className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Sign in to view your deals</h2>
        <p className="text-muted-foreground mb-6">
          You need to be signed in to see and manage your barter deals.
        </p>
        <Link href="/login">
          <Button>Sign In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">My Deals</h1>
          <p className="text-muted-foreground">
            Manage your active barters and view history
          </p>
        </div>
        <Link href="/browse">
          <Button className="gap-2" data-testid="button-find-trades">
            <Handshake className="h-4 w-4" />
            Find Barters
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="active" className="space-y-6">
        <TabsList>
          <TabsTrigger value="active" className="gap-2" data-testid="tab-active-deals">
            <Clock className="h-4 w-4" />
            Active ({activeDeals.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2" data-testid="tab-completed-deals">
            <CheckCircle className="h-4 w-4" />
            Completed ({completedDeals.length})
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="gap-2" data-testid="tab-cancelled-deals">
            <XCircle className="h-4 w-4" />
            Cancelled ({cancelledDeals.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : activeDeals.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Handshake className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No active deals</h3>
                <p className="text-muted-foreground mb-4">
                  Browse listings and propose barters to get started
                </p>
                <Link href="/browse">
                  <Button>Browse Listings</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {activeDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} userId={user.id} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedDeals.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No completed deals yet</h3>
                <p className="text-muted-foreground">
                  Your successfully completed barters will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {completedDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} userId={user.id} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cancelled">
          {cancelledDeals.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <XCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No cancelled deals</h3>
                <p className="text-muted-foreground">
                  Cancelled barters will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {cancelledDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} userId={user.id} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
