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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Pause,
  Play,
  Trash2,
  Pencil,
  ExternalLink,
  Package,
  ChevronRight,
  PlusCircle,
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

type FollowingWithUser = {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
  following: User;
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

type EditForm = {
  title: string;
  description: string;
  retailValue: string;
  location: string;
  tags: string;
  condition: string;
  openToOffers: boolean;
};

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState("30");
  const [dealFilter, setDealFilter] = useState("completed");
  const [activeTab, setActiveTab] = useState("analytics");
  const [showFollowingSheet, setShowFollowingSheet] = useState(false);
  const [deleteListingId, setDeleteListingId] = useState<string | null>(null);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    title: "",
    description: "",
    retailValue: "",
    location: "",
    tags: "",
    condition: "like_new",
    openToOffers: true,
  });

  if (!authLoading && !user) {
    navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return null;
  }

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

  const { data: followers, isLoading: followersLoading } = useQuery<FollowerWithUser[]>({
    queryKey: ["/api/users", user?.id, "followers"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/followers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch followers");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: following, isLoading: followingLoading } = useQuery<FollowingWithUser[]>({
    queryKey: ["/api/users", user?.id, "following"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/following`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch following");
      return res.json();
    },
    enabled: !!user && showFollowingSheet,
  });

  const { data: deals, isLoading: dealsLoading } = useQuery<DealWithContract[]>({
    queryKey: ["/api/dashboard/deals", dealFilter],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/deals?filter=${dealFilter}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deals");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: myListings, isLoading: listingsLoading } = useQuery<Listing[]>({
    queryKey: ["/api/listings/user", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/listings/user/${user?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch listings");
      return res.json();
    },
    enabled: !!user,
  });

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

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/listings/${id}/status`, { isActive }),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<Listing[]>(
        ["/api/listings/user", user?.id],
        (old) => (old ?? []).map((l) => (l.id === vars.id ? { ...l, isActive: vars.isActive } : l)),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/analytics", timeRange] });
      toast({ title: vars.isActive ? "Listing activated" : "Listing paused" });
    },
    onError: () => {
      toast({ title: "Failed to update listing status", variant: "destructive" });
    },
  });

  const deleteListingMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/listings/${id}`, {}),
    onSuccess: (_data, deletedId) => {
      // Immediately remove from the My Listings cache
      queryClient.setQueryData<Listing[]>(
        ["/api/listings/user", user?.id],
        (old) => (old ?? []).filter((l) => l.id !== deletedId),
      );
      // Wipe all browse/feed listing caches so they refetch fresh data on next visit
      queryClient.removeQueries({
        predicate: (query) => {
          const first = query.queryKey[0];
          return typeof first === "string" && first.startsWith("/api/listings");
        },
      });
      queryClient.removeQueries({ queryKey: ["/api/recommendations/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/analytics", timeRange] });
      setDeleteListingId(null);
      toast({ title: "Listing deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete listing", variant: "destructive" });
    },
  });

  const editListingMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Listing> }) =>
      apiRequest("PATCH", `/api/listings/${id}`, data),
    onSuccess: async (res, vars) => {
      const updated: Listing = await res.json();
      queryClient.setQueryData<Listing[]>(
        ["/api/listings/user", user?.id],
        (old) => (old ?? []).map((l) => (l.id === vars.id ? updated : l)),
      );
      setEditingListing(null);
      toast({ title: "Listing updated" });
    },
    onError: () => {
      toast({ title: "Failed to update listing", variant: "destructive" });
    },
  });

  function openEdit(listing: Listing) {
    setEditingListing(listing);
    setEditForm({
      title: listing.title ?? "",
      description: listing.description ?? "",
      retailValue: listing.retailValue?.toString() ?? "",
      location: listing.location ?? "",
      tags: (listing.tags as string[] | null)?.join(", ") ?? "",
      condition: listing.condition ?? "like_new",
      openToOffers: listing.openToOffers ?? true,
    });
  }

  function handleSaveEdit() {
    if (!editingListing) return;
    editListingMutation.mutate({
      id: editingListing.id,
      data: {
        title: editForm.title,
        description: editForm.description,
        retailValue: editForm.retailValue,
        location: editForm.location,
        tags: editForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
        condition: editForm.condition,
        openToOffers: editForm.openToOffers,
      },
    });
  }

  function getStatusBadge(listing: Listing) {
    if (!listing.isActive) {
      return <Badge variant="secondary">Paused</Badge>;
    }
    if (listing.moderationStatus === "pending") {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-400">Pending Review</Badge>;
    }
    return <Badge className="bg-green-100 text-green-700 border-0">Active</Badge>;
  }

  const listingForDelete = myListings?.find((l) => l.id === deleteListingId);

  if (authLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="grid gap-6 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="listings" data-testid="tab-my-listings">
            <Package className="h-4 w-4 mr-2" />
            My Listings
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

        {/* ── Analytics Tab ── */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Total Listings */}
            <Card
              className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
              onClick={() => setActiveTab("listings")}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Listings</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-listings">
                  {analyticsLoading ? <Skeleton className="h-8 w-16" /> : analytics?.totalListings ?? 0}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-muted-foreground">{analytics?.activeListings ?? 0} active</p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>

            {/* Total Views */}
            <Card
              className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
              onClick={() => setActiveTab("listings")}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Views</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-views">
                  {analyticsLoading ? <Skeleton className="h-8 w-16" /> : analytics?.totalViews ?? 0}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center text-xs text-green-600">
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                    across all listings
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>

            {/* Completed Deals */}
            <Card
              className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
              onClick={() => setActiveTab("deals")}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed Deals</CardTitle>
                <Handshake className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-completed-deals">
                  {analyticsLoading ? <Skeleton className="h-8 w-16" /> : analytics?.completedDeals ?? 0}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-muted-foreground">out of {analytics?.totalDeals ?? 0} total</p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>

            {/* Total Barter Value */}
            <Card
              className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
              onClick={() => setActiveTab("deals")}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Barter Value</CardTitle>
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
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center text-xs text-green-600">
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                    total deal value
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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

          {/* Follower stats */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card
              className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
              onClick={() => setActiveTab("followers")}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Followers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-followers">
                  {analyticsLoading ? <Skeleton className="h-8 w-16" /> : analytics?.followerCount ?? 0}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-muted-foreground">People following your content</p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
              onClick={() => setShowFollowingSheet(true)}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Following</CardTitle>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-following">
                  {analyticsLoading ? <Skeleton className="h-8 w-16" /> : analytics?.followingCount ?? 0}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-muted-foreground">Content creators you follow</p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── My Listings Tab ── */}
        <TabsContent value="listings" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">My Listings</h2>
              <p className="text-sm text-muted-foreground">Manage, edit, and track all your listings</p>
            </div>
            <Button onClick={() => navigate("/create-listing")}>
              <PlusCircle className="h-4 w-4 mr-2" />
              New Listing
            </Button>
          </div>

          {listingsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : myListings && myListings.length > 0 ? (
            <div className="space-y-3">
              {myListings.map((listing) => {
                const thumb = (listing.images as string[] | null)?.[0];
                return (
                  <Card key={listing.id} className="overflow-hidden">
                    <div className="flex items-start gap-4 p-4">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted border">
                        {thumb ? (
                          <img src={thumb} alt={listing.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="font-medium truncate">{listing.title}</p>
                          {getStatusBadge(listing)}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {(listing.categories as string[] | null)?.[0] && (
                            <span className="capitalize">{(listing.categories as string[])[0]}</span>
                          )}
                          {listing.retailValue && (
                            <span>AED {Number(listing.retailValue).toLocaleString()}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {listing.viewCount ?? 0} views
                          </span>
                          {listing.createdAt && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(listing.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {(listing.wantedCategories as string[] | null)?.length ? (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            Looking for: {(listing.wantedCategories as string[]).join(", ")}
                          </p>
                        ) : null}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/listings/${listing.id}`)}
                        >
                          <ExternalLink className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">View</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(listing)}
                        >
                          <Pencil className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={toggleStatusMutation.isPending}
                          onClick={() =>
                            toggleStatusMutation.mutate({
                              id: listing.id,
                              isActive: !listing.isActive,
                            })
                          }
                        >
                          {listing.isActive ? (
                            <>
                              <Pause className="h-4 w-4 sm:mr-1" />
                              <span className="hidden sm:inline">Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 sm:mr-1" />
                              <span className="hidden sm:inline">Activate</span>
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteListingId(listing.id)}
                        >
                          <Trash2 className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">No listings yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Create your first listing to start bartering
              </p>
              <Button onClick={() => navigate("/create-listing")}>
                <PlusCircle className="h-4 w-4 mr-2" />
                Create a Listing
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── Followers Tab ── */}
        <TabsContent value="followers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Followers</CardTitle>
              <CardDescription>People who are following your listings and content</CardDescription>
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
                        <VerifiedBadge
                          isVerified={f.follower.isVerified}
                          kycStatus={f.follower.kycStatus}
                          kybStatus={f.follower.kybStatus}
                          accountType={f.follower.accountType}
                          size="sm"
                        />
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

        {/* ── Deals Folder Tab ── */}
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
                              <Badge variant={deal.state === "completed" ? "default" : "secondary"}>
                                {deal.state}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              with {otherParty?.fullName || otherParty?.businessName}
                            </p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              <span>Value: AED {Number(deal.seekerValue || 0).toLocaleString()}</span>
                              <span>{new Date(deal.createdAt!).toLocaleDateString()}</span>
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
                  <Button variant="outline" onClick={() => navigate("/browse")}>
                    Browse Listings
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Following sheet */}
      <Sheet open={showFollowingSheet} onOpenChange={setShowFollowingSheet}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Following</SheetTitle>
            <SheetDescription>Creators and businesses you follow</SheetDescription>
          </SheetHeader>
          {followingLoading ? (
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
          ) : following && following.length > 0 ? (
            <div className="space-y-4">
              {following.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={f.following?.avatarUrl || undefined} />
                      <AvatarFallback>
                        {f.following?.fullName?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{f.following?.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.following?.businessName || f.following?.email}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigate(`/users/${f.following?.id}`);
                      setShowFollowingSheet(false);
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">Not following anyone yet</h3>
              <p className="text-muted-foreground text-sm">
                Browse the marketplace and follow creators you like
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit listing sheet */}
      <Sheet open={!!editingListing} onOpenChange={(open) => !open && setEditingListing(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Edit Listing</SheetTitle>
            <SheetDescription>Update your listing details</SheetDescription>
          </SheetHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Listing title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe what you're offering"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-value">Value (AED)</Label>
                <Input
                  id="edit-value"
                  type="number"
                  value={editForm.retailValue}
                  onChange={(e) => setEditForm((f) => ({ ...f, retailValue: e.target.value }))}
                  placeholder="e.g. 500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-location">Location</Label>
                <Input
                  id="edit-location"
                  value={editForm.location}
                  onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="City or area"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-condition">Condition</Label>
              <Select
                value={editForm.condition}
                onValueChange={(v) => setEditForm((f) => ({ ...f, condition: v }))}
              >
                <SelectTrigger id="edit-condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="like_new">Like New</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="service">Service / Digital</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tags">Tags (comma separated)</Label>
              <Input
                id="edit-tags"
                value={editForm.tags}
                onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="e.g. photography, Dubai, professional"
              />
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <input
                type="checkbox"
                id="edit-open-to-offers"
                checked={editForm.openToOffers}
                onChange={(e) => setEditForm((f) => ({ ...f, openToOffers: e.target.checked }))}
                className="w-4 h-4"
              />
              <Label htmlFor="edit-open-to-offers" className="cursor-pointer">
                Open to all offers
              </Label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1"
                onClick={handleSaveEdit}
                disabled={editListingMutation.isPending}
              >
                {editListingMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/listings/${editingListing?.id}`)}
              >
                Full Edit
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteListingId} onOpenChange={(open) => !open && setDeleteListingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
            <AlertDialogDescription>
              "{listingForDelete?.title}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteListingId && deleteListingMutation.mutate(deleteListingId)}
              disabled={deleteListingMutation.isPending}
            >
              {deleteListingMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
