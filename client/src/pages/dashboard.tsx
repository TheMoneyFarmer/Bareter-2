import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  BarChart3, 
  Users, 
  FolderOpen, 
  TrendingUp, 
  Eye, 
  Handshake,
  Download,
  FileText,
  UserPlus,
  UserMinus,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { VerifiedBadge } from "@/components/verified-badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import type { User, Listing, Deal } from "@shared/schema";

type FollowerWithUser = {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
  follower: User;
};

type AnalyticsData = {
  totalListings: number;
  activeListings: number;
  totalViews: number;
  totalDeals: number;
  completedDeals: number;
  totalValue: number;
  followerCount: number;
  followingCount: number;
  viewsOverTime: { date: string; views: number }[];
  dealsOverTime: { date: string; deals: number }[];
  listingsByCategory: { category: string; count: number }[];
};

type DealWithContract = Deal & {
  seeker: User;
  provider: User;
};

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState("30");
  const [dealFilter, setDealFilter] = useState("completed");

  // Redirect if not logged in
  if (!authLoading && !user) {
    navigate("/login");
    return null;
  }

  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/dashboard/analytics", timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/analytics?timeRange=${timeRange}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: !!user,
  });

  // Fetch followers
  const { data: followers, isLoading: followersLoading } = useQuery<FollowerWithUser[]>({
    queryKey: ["/api/users", user?.id, "followers"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/followers`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch followers");
      return res.json();
    },
    enabled: !!user,
  });

  // Fetch completed deals with contracts
  const { data: deals, isLoading: dealsLoading } = useQuery<DealWithContract[]>({
    queryKey: ["/api/dashboard/deals", dealFilter],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/deals?filter=${dealFilter}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch deals");
      return res.json();
    },
    enabled: !!user,
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: (followerId: string) =>
      apiRequest("DELETE", `/api/users/${followerId}/unfollow`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", user?.id, "followers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/analytics", timeRange] });
      toast({ title: "Removed follower" });
    },
    onError: () => {
      toast({ title: "Failed to remove follower", variant: "destructive" });
    },
  });

  // Load sample deals mutation
  const loadSampleDealsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/demo/sample-deals", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/analytics", timeRange] });
      toast({ 
        title: "Sample deals loaded!",
        description: `Created ${data.deals} sample barter scenario deals.`
      });
    },
    onError: () => {
      toast({ title: "Failed to load sample deals", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="grid gap-6 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Professional Dashboard</h1>
          <p className="text-muted-foreground">Track your marketplace performance and manage your content</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px]" data-testid="select-time-range">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="analytics" className="space-y-6">
        <TabsList>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="followers" data-testid="tab-followers">
            <Users className="h-4 w-4 mr-2" />
            Followers
          </TabsTrigger>
          <TabsTrigger value="deals" data-testid="tab-deals-folder">
            <FolderOpen className="h-4 w-4 mr-2" />
            Deals Folder
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Listings</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-listings">
                  {analyticsLoading ? <Skeleton className="h-8 w-16" /> : analytics?.totalListings ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {analytics?.activeListings ?? 0} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Views</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-views">
                  {analyticsLoading ? <Skeleton className="h-8 w-16" /> : analytics?.totalViews ?? 0}
                </div>
                <div className="flex items-center text-xs text-green-600">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  +12% from last period
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed Deals</CardTitle>
                <Handshake className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-completed-deals">
                  {analyticsLoading ? <Skeleton className="h-8 w-16" /> : analytics?.completedDeals ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  out of {analytics?.totalDeals ?? 0} total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Trade Value</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-value">
                  {analyticsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    `AED ${(analytics?.totalValue ?? 0).toLocaleString()}`
                  )}
                </div>
                <div className="flex items-center text-xs text-green-600">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  +8% from last period
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Views Over Time</CardTitle>
                <CardDescription>Listing views in the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {analyticsLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics?.viewsOverTime ?? []}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="views"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary) / 0.2)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Listings by Category</CardTitle>
                <CardDescription>Distribution of your listings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {analyticsLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics?.listingsByCategory ?? []} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" />
                        <YAxis dataKey="category" type="category" className="text-xs" width={100} />
                        <Tooltip />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Follower Stats */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Followers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-followers">
                  {analyticsLoading ? <Skeleton className="h-8 w-16" /> : analytics?.followerCount ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">People following your content</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Following</CardTitle>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-following">
                  {analyticsLoading ? <Skeleton className="h-8 w-16" /> : analytics?.followingCount ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">Content creators you follow</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="followers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Followers</CardTitle>
              <CardDescription>
                People who are following your listings and content
              </CardDescription>
            </CardHeader>
            <CardContent>
              {followersLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : followers && followers.length > 0 ? (
                <div className="space-y-4">
                  {followers.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-4 p-4 rounded-lg border"
                      data-testid={`follower-item-${f.follower.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={f.follower.avatarUrl || undefined} />
                          <AvatarFallback>
                            {f.follower.fullName?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{f.follower.fullName}</p>
                          <p className="text-sm text-muted-foreground">
                            {f.follower.businessName || f.follower.email}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3" />
                            Followed on {new Date(f.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <VerifiedBadge isVerified={f.follower.isVerified} kycStatus={(f.follower as any).kycStatus} kybStatus={(f.follower as any).kybStatus} size="sm" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/users/${f.follower.id}`)}
                          data-testid={`button-view-profile-${f.follower.id}`}
                        >
                          View Profile
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => unfollowMutation.mutate(f.follower.id)}
                          data-testid={`button-remove-follower-${f.follower.id}`}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No followers yet</h3>
                  <p className="text-muted-foreground text-sm">
                    Create great listings and engage with the community to gain followers
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deals" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Deals Folder</CardTitle>
                  <CardDescription>
                    Download contracts and reference documents for your closed deals
                  </CardDescription>
                </div>
                <Select value={dealFilter} onValueChange={setDealFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-deal-filter">
                    <SelectValue placeholder="Filter deals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Deals</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {dealsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
                      <Skeleton className="h-10 w-10" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-48 mb-2" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-9 w-24" />
                    </div>
                  ))}
                </div>
              ) : deals && deals.length > 0 ? (
                <div className="space-y-4">
                  {deals.map((deal) => {
                    const isSeeker = deal.seekerId === user?.id;
                    const otherParty = isSeeker ? deal.provider : deal.seeker;
                    
                    return (
                      <div
                        key={deal.id}
                        className="flex flex-col gap-4 p-4 rounded-lg border sm:flex-row sm:items-center sm:justify-between"
                        data-testid={`deal-item-${deal.id}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="p-2 rounded-lg bg-muted">
                            <FileText className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">Deal #{deal.dealNumber}</p>
                              <Badge
                                variant={deal.state === "completed" ? "default" : "secondary"}
                              >
                                {deal.state}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              with {otherParty?.fullName || otherParty?.businessName}
                            </p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              <span>
                                Value: AED {Number(deal.seekerValue || 0).toLocaleString()}
                              </span>
                              <span>
                                {new Date(deal.createdAt!).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/deals/${deal.id}`)}
                            data-testid={`button-view-deal-${deal.id}`}
                          >
                            View Details
                          </Button>
                          {deal.state === "completed" && (
                            <Button
                              size="sm"
                              onClick={() => window.open(`/api/deals/${deal.id}/contract`, "_blank")}
                              data-testid={`button-download-contract-${deal.id}`}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Contract
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No deals found</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Complete deals to see them here with downloadable contracts
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button variant="outline" onClick={() => navigate("/browse")} data-testid="button-browse-listings">
                      Browse Listings
                    </Button>
                    <Button 
                      onClick={() => loadSampleDealsMutation.mutate()}
                      disabled={loadSampleDealsMutation.isPending}
                      data-testid="button-load-samples"
                    >
                      {loadSampleDealsMutation.isPending ? "Loading..." : "Load Sample Deals"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Load sample barter scenarios: Suits↔Models, Hotel↔Influencer, Restaurant↔Photographer, SaaS↔Designer, Dentist↔Marketing
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
