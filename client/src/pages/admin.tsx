import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User, Listing, DealWithUsers, MessageWithSender, ListingWithUser } from "@shared/schema";
import {
  Users,
  Package,
  Handshake,
  Search,
  Shield,
  ShieldCheck,
  ShieldX,
  MoreHorizontal,
  DollarSign,
  Activity,
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Crown,
  Trash2,
  Star,
  Eye,
  FileText,
  MessageSquare,
  BarChart3,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Ban,
  Flag,
  Pause,
  Play,
  AlertTriangle,
  FileCheck,
  Bot,
  Sparkles,
  Building2,
} from "lucide-react";
import { VerifiedBadge, isUserVerified } from "@/components/verified-badge";
import { Link, useLocation } from "wouter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type AdminSection = "dashboard" | "users" | "listings" | "deals" | "analytics" | "settings" | "reports" | "flags" | "ai-logs" | "waitlist";

type WaitlistEntryRow = {
  id: number;
  email: string;
  name: string | null;
  country: string | null;
  city: string | null;
  accountType: string | null;
  businessName: string | null;
  referralCode: string;
  referredByCode: string | null;
  referralCount: number | null;
  position: number;
  source: string | null;
  confirmedAt: string | null;
  convertedUserId: string | null;
  createdAt: string | null;
};

type AnalyticsData = {
  totalUsers: number;
  totalDeals: number;
  activeDeals: number;
  completedDeals: number;
  totalListings: number;
  activeListings: number;
  totalGMV: number;
  monthlyGMV: number;
  pendingVerifications: number;
  categoryStats: Record<string, number>;
  dealsPerWeek: { week: string; count: number }[];
};

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

export function AdminPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeal, setSelectedDeal] = useState<DealWithUsers | null>(null);
  const [banDialog, setBanDialog] = useState<{ open: boolean; user: User | null; reason: string }>({
    open: false,
    user: null,
    reason: "",
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!user?.isAdmin,
  });

  const { data: listings, isLoading: listingsLoading } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/admin/listings"],
    enabled: !!user?.isAdmin,
  });

  const { data: deals, isLoading: dealsLoading } = useQuery<DealWithUsers[]>({
    queryKey: ["/api/admin/deals"],
    enabled: !!user?.isAdmin,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics"],
    enabled: !!user?.isAdmin,
  });

  const { data: dealMessages } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/admin/deals", selectedDeal?.id, "messages"],
    enabled: !!selectedDeal,
  });

  const verifyUserMutation = useMutation({
    mutationFn: async ({ userId, verified }: { userId: string; verified: boolean }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/verify`, { verified });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
      toast({ title: "Success", description: "User verification updated" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "User role updated" });
    },
  });

  const banUserMutation = useMutation({
    mutationFn: async ({ userId, banned, reason }: { userId: string; banned: boolean; reason?: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/ban`, { banned, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setBanDialog({ open: false, user: null, reason: "" });
      toast({ title: "Success", description: "User ban status updated" });
    },
  });

  const deleteListingMutation = useMutation({
    mutationFn: async (listingId: string) => {
      await apiRequest("DELETE", `/api/admin/listings/${listingId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
      toast({ title: "Success", description: "Listing removed" });
    },
  });

  // NOTE: do NOT early-return here. There are more hooks declared further
  // down (useQuery for /api/admin/reports, /api/admin/behavioral-flags,
  // /api/admin/ai-logs and a few useState hooks) and an early return on
  // the loading-then-loaded transition for `user.isAdmin` would change
  // the hook count between renders, blowing up with
  // "Rendered more hooks than during the previous render." The actual
  // gate now sits right before the main JSX return, after every hook
  // has been declared. The server-side `requireAdmin` middleware is
  // the real authority — this is just a friendly client-side message.

  const filteredUsers = users?.filter(
    (u) =>
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredListings = listings?.filter(
    (l) =>
      l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDeals = deals?.filter(
    (d) =>
      d.dealNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.seeker.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.provider.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const navItems = [
    { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { id: "users" as const, label: "Users", icon: Users },
    { id: "listings" as const, label: "Listings", icon: Package },
    { id: "deals" as const, label: "Deals", icon: Handshake },
    { id: "reports" as const, label: "Reports", icon: Flag },
    { id: "flags" as const, label: "Flags", icon: AlertTriangle },
    { id: "ai-logs" as const, label: "AI Logs", icon: Bot },
    { id: "waitlist" as const, label: "Waitlist", icon: Sparkles },
    { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];

  const categoryData = analytics?.categoryStats
    ? Object.entries(analytics.categoryStats).map(([name, value]) => ({ name, value }))
    : [];

  const renderDashboard = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Dashboard Overview</h2>
        <p className="text-muted-foreground">Platform metrics and quick actions</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card data-testid="stat-total-users">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold" data-testid="text-total-users">{analytics?.totalUsers || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-active-deals">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Active Deals</p>
                <p className="text-2xl font-bold" data-testid="text-active-deals">{analytics?.activeDeals || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Handshake className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-monthly-gmv">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">GMV This Month</p>
                <p className="text-2xl font-bold" data-testid="text-monthly-gmv">
                  {analytics?.monthlyGMV ? `${(analytics.monthlyGMV / 1000).toFixed(0)}K` : "0"}
                </p>
                <p className="text-xs text-muted-foreground">AED</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-pending-verifications">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Pending Verifications</p>
                <p className="text-2xl font-bold" data-testid="text-pending-verifications">{analytics?.pendingVerifications || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Deals Per Week</CardTitle>
            <CardDescription>Deal creation trend over the last 12 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics?.dealsPerWeek || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest deals and user actions</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                {deals?.slice(0, 10).map((deal) => (
                  <div key={deal.id} className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      deal.state === "completed" ? "bg-green-500/10" :
                      deal.state === "cancelled" ? "bg-red-500/10" :
                      "bg-blue-500/10"
                    }`}>
                      {deal.state === "completed" ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : deal.state === "cancelled" ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Activity className="h-4 w-4 text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {deal.seeker.fullName} ↔ {deal.provider.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {deal.dealNumber} • {deal.state}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {deal.createdAt ? new Date(deal.createdAt).toLocaleDateString() : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Users Management</h2>
          <p className="text-muted-foreground">Manage registered users and verification status</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-users"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {usersLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.map((u) => (
                  <TableRow key={u.id} className={u.isBanned ? "opacity-50" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={u.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {u.fullName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="font-medium">{u.fullName}</span>
                          {u.businessName && (
                            <p className="text-xs text-muted-foreground">{u.businessName}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" || u.role === "super_admin" ? "destructive" : "secondary"}>
                        {u.role === "super_admin" ? "Super Admin" : u.role === "admin" ? "Admin" : "User"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.isBanned ? (
                          <Badge variant="destructive" className="gap-1">
                            <Ban className="h-3 w-3" />
                            Banned
                          </Badge>
                        ) : (isUserVerified(u.kycStatus, u.kybStatus) || u.isVerified) ? (
                          <Badge className="gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Unverified</Badge>
                        )}
                        {(u.kycStatus === "IN_PROGRESS" || u.kybStatus === "IN_PROGRESS") && (
                          <Badge variant="outline" className="text-orange-600">Pending</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{u.location || "-"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-user-actions-${u.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => verifyUserMutation.mutate({ userId: u.id, verified: !u.isVerified })}
                            data-testid={`button-verify-user-${u.id}`}
                          >
                            {u.isVerified ? (
                              <>
                                <ShieldX className="h-4 w-4 mr-2" />
                                Remove Verification
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Verify User
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => changeRoleMutation.mutate({ userId: u.id, role: u.role === "admin" ? "user" : "admin" })}
                            data-testid={`button-toggle-admin-${u.id}`}
                          >
                            <Crown className="h-4 w-4 mr-2" />
                            {u.role === "admin" || u.role === "super_admin" ? "Remove Admin" : "Make Admin"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (u.isBanned) {
                                banUserMutation.mutate({ userId: u.id, banned: false });
                              } else {
                                setBanDialog({ open: true, user: u, reason: "" });
                              }
                            }}
                            data-testid={`button-ban-user-${u.id}`}
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            {u.isBanned ? "Unban User" : "Ban User"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderListings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Listings Management</h2>
          <p className="text-muted-foreground">View and moderate all platform listings</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search listings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-listings"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {listingsLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Value (AED)</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Likes</TableHead>
                  <TableHead>Proposals</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredListings?.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={l.type === "offer" ? "default" : "secondary"} className="shrink-0">
                            {l.type === "offer" ? "Offer" : "Request"}
                          </Badge>
                          <span className="font-medium line-clamp-1">{l.title}</span>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {(l as any).valueFlagged && (
                            <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/60 text-amber-600">
                              <AlertTriangle className="h-2.5 w-2.5" />Value flagged
                            </Badge>
                          )}
                          {(l as any).imageFlagged && (
                            <Badge variant="outline" className="text-[10px] gap-1 border-red-500/60 text-red-600">
                              <AlertTriangle className="h-2.5 w-2.5" />Image flagged
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={l.user.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">{l.user.fullName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{l.user.fullName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {parseFloat(l.retailValue as string).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {((l.categories as string[]) || []).slice(0, 1).map((cat) => (
                        <Badge key={cat} variant="outline" className="text-xs">
                          {cat}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell>
                      {l.isActive ? (
                        <Badge variant="outline" className="text-green-600">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.viewCount || 0}</TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-likes-${l.id}`}>{l.likeCount || 0}</TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-comments-${l.id}`}>{l.commentCount || 0}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-listing-actions-${l.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/listings/${l.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Listing
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteListingMutation.mutate(l.id)}
                            data-testid={`button-delete-listing-${l.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Listing
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderDeals = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Deals Management</h2>
          <p className="text-muted-foreground">View all deals and their details</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-deals"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {dealsLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal ID</TableHead>
                  <TableHead>Parties</TableHead>
                  <TableHead>Values (AED)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeals?.map((d) => (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => setSelectedDeal(d)}
                    data-testid={`row-deal-${d.id}`}
                  >
                    <TableCell className="font-mono text-sm">{d.dealNumber}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={d.seeker.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">{d.seeker.fullName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{d.seeker.fullName}</span>
                        <span className="text-muted-foreground mx-1">↔</span>
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={d.provider.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">{d.provider.fullName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{d.provider.fullName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium">{parseFloat(d.seekerValue as string).toLocaleString()}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="font-medium">{parseFloat(d.providerValue as string).toLocaleString()}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        d.state === "completed" ? "default" :
                        d.state === "cancelled" ? "destructive" :
                        "secondary"
                      }>
                        {d.state}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedDeal(d); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderAnalytics = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Analytics</h2>
        <p className="text-muted-foreground">Platform performance and insights</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Deals Per Week</CardTitle>
            <CardDescription>Deal creation trend over 12 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.dealsPerWeek || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Categories</CardTitle>
            <CardDescription>Listings by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData.slice(0, 8)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {categoryData.slice(0, 8).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Platform Summary</CardTitle>
            <CardDescription>All-time platform metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{analytics?.totalUsers || 0}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-500">{analytics?.totalDeals || 0}</p>
                <p className="text-sm text-muted-foreground">Total Deals</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-500">
                  AED {analytics?.totalGMV ? (analytics.totalGMV / 1000).toFixed(0) : 0}K
                </p>
                <p className="text-sm text-muted-foreground">Total GMV</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Settings</h2>
        <p className="text-muted-foreground">Platform configuration and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platform Settings</CardTitle>
          <CardDescription>Configure platform-wide settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Platform Pricing</p>
                <p className="text-sm text-muted-foreground">Bareter is free for all users</p>
              </div>
              <Badge variant="secondary">Free</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Verification Required</p>
                <p className="text-sm text-muted-foreground">KYC/KYB required for bartering</p>
              </div>
              <Badge>Enabled</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const { data: reportsData = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/reports"],
    enabled: activeSection === "reports",
  });

  const { data: flagsData } = useQuery<{ rapidPosters: any[]; reportedUsers: any[]; newAccountsWithDeals: any[] }>({
    queryKey: ["/api/admin/behavioral-flags"],
    enabled: activeSection === "flags",
  });

  const updateReportStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/reports/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] }),
  });

  const pauseAccount = useMutation({
    mutationFn: ({ id, isPaused }: { id: string; isPaused: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/pause`, { isPaused }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/behavioral-flags"] });
      toast({ title: "Account status updated" });
    },
  });

  const kybApproval = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/kyb`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "KYB status updated" });
    },
  });

  const renderReports = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Reports</h2>
        <p className="text-muted-foreground">User-submitted reports for review</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportsData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No reports submitted yet
                  </TableCell>
                </TableRow>
              ) : (
                reportsData.map((report: any) => (
                  <TableRow key={report.id} data-testid={`row-report-${report.id}`}>
                    <TableCell>
                      <Badge variant="outline">{report.targetType}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{report.reason.replace("_", " ")}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                      {report.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        report.status === "pending" ? "secondary" :
                        report.status === "actioned" ? "default" : "outline"
                      }>
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateReportStatus.mutate({ id: report.id, status: "dismissed" })}
                          data-testid={`button-dismiss-report-${report.id}`}
                        >
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateReportStatus.mutate({ id: report.id, status: "actioned" })}
                          data-testid={`button-action-report-${report.id}`}
                        >
                          Action
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderFlags = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Behavioral Flags</h2>
        <p className="text-muted-foreground">Accounts with suspicious patterns</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rapid Posters (5+ listings in 24h)</CardTitle>
        </CardHeader>
        <CardContent>
          {!flagsData?.rapidPosters?.length ? (
            <p className="text-sm text-muted-foreground">No rapid posters detected</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Listings (24h)</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flagsData.rapidPosters.map((r: any) => (
                  <TableRow key={r.userId}>
                    <TableCell className="font-mono text-xs">{r.userId}</TableCell>
                    <TableCell><Badge variant="destructive">{r.listingsIn24h}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => pauseAccount.mutate({ id: r.userId, isPaused: true })}>
                        <Pause className="h-3 w-3 mr-1" />Pause
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Frequently Reported Users (3+ reports)</CardTitle>
        </CardHeader>
        <CardContent>
          {!flagsData?.reportedUsers?.length ? (
            <p className="text-sm text-muted-foreground">No heavily reported users</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Report Count</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flagsData.reportedUsers.map((r: any) => (
                  <TableRow key={r.userId}>
                    <TableCell className="font-mono text-xs">{r.userId}</TableCell>
                    <TableCell><Badge variant="destructive">{r.reportCount}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => pauseAccount.mutate({ id: r.userId, isPaused: true })}>
                        <Pause className="h-3 w-3 mr-1" />Pause
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Accounts (last 7 days)</CardTitle>
          <CardDescription>Recently created accounts to watch</CardDescription>
        </CardHeader>
        <CardContent>
          {!flagsData?.newAccountsWithDeals?.length ? (
            <p className="text-sm text-muted-foreground">No new accounts this period</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flagsData.newAccountsWithDeals.map((u: any) => (
                  <TableRow key={u.userId}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{u.fullName}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => pauseAccount.mutate({ id: u.userId, isPaused: true })}>
                        <Pause className="h-3 w-3 mr-1" />Pause
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  interface ModerationLogEntry {
    id: string;
    targetType: string;
    targetId: string;
    action: string;
    reason: string;
    confidence: string | null;
    createdAt: string | null;
  }

  interface AgentInteractionEntry {
    id: string;
    agentType: string;
    userId: string | null;
    userMessage: string;
    agentResponse: string;
    tokensUsed: number | null;
    createdAt: string | null;
  }

  const { data: aiLogs } = useQuery<{
    moderationLogs: ModerationLogEntry[];
    agentInteractions: AgentInteractionEntry[];
  }>({
    queryKey: ["/api/ai/logs"],
    enabled: activeSection === "ai-logs" && !!user?.isAdmin,
  });

  const [aiLogFilter, setAiLogFilter] = useState<"all" | "approved" | "flagged" | "rejected">("all");
  const [aiAgentFilter, setAiAgentFilter] = useState<string>("all");

  const filteredModLogs = (aiLogs?.moderationLogs || []).filter(
    (l) => aiLogFilter === "all" || l.action === aiLogFilter
  );
  const filteredInteractions = (aiLogs?.agentInteractions || []).filter(
    (i) => aiAgentFilter === "all" || i.agentType === aiAgentFilter
  );
  const totalTokens = (aiLogs?.agentInteractions || []).reduce((sum, i) => sum + (i.tokensUsed || 0), 0);

  const renderWaitlist = () => <WaitlistAdminSection />;

  const renderAiLogs = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">AI Agent Logs</h2>
        <p className="text-muted-foreground">Monitor AI agent activity and moderation decisions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Interactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-ai-total-interactions">{aiLogs?.agentInteractions?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Moderation Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-ai-moderation-count">{aiLogs?.moderationLogs?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Flagged Content</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500" data-testid="text-ai-flagged-count">
              {(aiLogs?.moderationLogs || []).filter((l) => l.action === "flagged").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Tokens Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-ai-total-tokens">{totalTokens.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">Moderation Logs</CardTitle>
            <div className="flex gap-1">
              {(["all", "approved", "flagged", "rejected"] as const).map((f) => (
                <Button
                  key={f}
                  variant={aiLogFilter === f ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 capitalize"
                  data-testid={`btn-filter-moderation-${f}`}
                  onClick={() => setAiLogFilter(f)}
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredModLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No moderation logs found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModLogs.map((log) => (
                  <TableRow key={log.id} data-testid={`row-moderation-${log.id}`}>
                    <TableCell>
                      <Badge variant="outline">{log.targetType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={log.action === "approved" ? "default" : log.action === "rejected" ? "destructive" : "secondary"}
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{log.reason}</TableCell>
                    <TableCell>{log.confidence ? `${Math.round(parseFloat(log.confidence) * 100)}%` : "N/A"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.createdAt ? new Date(log.createdAt).toLocaleDateString() : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">Agent Interactions</CardTitle>
            <div className="flex gap-1">
              {["all", "support", "matching", "valuation", "engagement", "admin"].map((f) => (
                <Button
                  key={f}
                  variant={aiAgentFilter === f ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 capitalize"
                  data-testid={`btn-filter-agent-${f}`}
                  onClick={() => setAiAgentFilter(f)}
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredInteractions.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No agent interactions found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>User Message</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInteractions.map((interaction) => (
                  <TableRow key={interaction.id} data-testid={`row-interaction-${interaction.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{interaction.agentType}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-sm">{interaction.userMessage}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{interaction.agentResponse?.substring(0, 80)}</TableCell>
                    <TableCell className="text-sm">{interaction.tokensUsed || 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {interaction.createdAt ? new Date(interaction.createdAt).toLocaleDateString() : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return renderDashboard();
      case "users":
        return renderUsers();
      case "listings":
        return renderListings();
      case "deals":
        return renderDeals();
      case "reports":
        return renderReports();
      case "flags":
        return renderFlags();
      case "ai-logs":
        return renderAiLogs();
      case "waitlist":
        return renderWaitlist();
      case "analytics":
        return renderAnalytics();
      case "settings":
        return renderSettings();
      default:
        return renderDashboard();
    }
  };

  // Friendly client-side gate. The real enforcement is the
  // `requireAdmin` middleware on every /api/admin/* route. We delay
  // this check until after every hook above so the hook order is
  // stable across the auth-loading → auth-loaded transition.
  if (!user?.isAdmin) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl text-center">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <Shield className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-6">
          You don't have permission to view this page.
        </p>
        <Link href="/">
          <Button data-testid="button-go-home">Go Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside
        className={`bg-sidebar border-r flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        <div className="p-4 border-b flex items-center justify-between gap-2">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">Admin Panel</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            data-testid="button-toggle-sidebar"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <Button
              key={item.id}
              variant={activeSection === item.id ? "secondary" : "ghost"}
              className={`w-full justify-start gap-3 ${sidebarCollapsed ? "px-2" : ""}`}
              onClick={() => setActiveSection(item.id)}
              data-testid={`nav-${item.id}`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Button>
          ))}
          <Link href="/admin/company-os">
            <Button
              variant="ghost"
              className={`w-full justify-start gap-3 ${sidebarCollapsed ? "px-2" : ""}`}
              data-testid="nav-company-os"
            >
              <Building2 className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span>Company OS</span>}
            </Button>
          </Link>
        </nav>

        <div className="p-2 border-t">
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 text-destructive hover:text-destructive ${
              sidebarCollapsed ? "px-2" : ""
            }`}
            onClick={() => {
              logout();
              setLocation("/");
            }}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>Logout</span>}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {analyticsLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-10 w-64" />
              <div className="grid grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </main>

      {/* Deal Detail Dialog */}
      <Dialog open={!!selectedDeal} onOpenChange={(open) => !open && setSelectedDeal(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Deal Details
              <Badge variant="outline" className="font-mono">{selectedDeal?.dealNumber}</Badge>
            </DialogTitle>
            <DialogDescription>
              Full deal information and chat history
            </DialogDescription>
          </DialogHeader>

          {selectedDeal && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={selectedDeal.seeker.avatarUrl || undefined} />
                        <AvatarFallback>{selectedDeal.seeker.fullName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      {selectedDeal.seeker.fullName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-1">Offering:</p>
                    <p className="text-sm font-medium">{selectedDeal.seekerOffer}</p>
                    <p className="text-lg font-bold mt-2">AED {parseFloat(selectedDeal.seekerValue as string).toLocaleString()}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={selectedDeal.provider.avatarUrl || undefined} />
                        <AvatarFallback>{selectedDeal.provider.fullName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      {selectedDeal.provider.fullName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-1">Offering:</p>
                    <p className="text-sm font-medium">{selectedDeal.providerOffer}</p>
                    <p className="text-lg font-bold mt-2">AED {parseFloat(selectedDeal.providerValue as string).toLocaleString()}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className="mt-1">{selectedDeal.state}</Badge>
                </div>
                {selectedDeal.timeline && (
                  <div>
                    <p className="text-sm text-muted-foreground">Timeline</p>
                    <p className="text-sm">{selectedDeal.timeline}</p>
                  </div>
                )}
              </div>

              {selectedDeal.contractPdfUrl && (
                <Button variant="outline" className="gap-2" asChild>
                  <a href={selectedDeal.contractPdfUrl} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4" />
                    View Contract PDF
                  </a>
                </Button>
              )}

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Chat History
                </h4>
                <ScrollArea className="h-[200px] border rounded-lg p-4">
                  {dealMessages && dealMessages.length > 0 ? (
                    <div className="space-y-3">
                      {dealMessages.map((msg) => (
                        <div key={msg.id} className="flex gap-2">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarImage src={msg.sender.avatarUrl || undefined} />
                            <AvatarFallback className="text-xs">{msg.sender.fullName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-xs text-muted-foreground">{msg.sender.fullName}</p>
                            <p className="text-sm">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No messages in this deal</p>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ban User Dialog */}
      <Dialog open={banDialog.open} onOpenChange={(open) => !open && setBanDialog({ open: false, user: null, reason: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>
              Are you sure you want to ban {banDialog.user?.fullName}? They will no longer be able to access the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Reason for ban</label>
            <Textarea
              placeholder="Enter the reason for banning this user..."
              value={banDialog.reason}
              onChange={(e) => setBanDialog({ ...banDialog, reason: e.target.value })}
              className="mt-2"
              data-testid="input-ban-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialog({ open: false, user: null, reason: "" })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => banDialog.user && banUserMutation.mutate({
                userId: banDialog.user.id,
                banned: true,
                reason: banDialog.reason
              })}
              data-testid="button-confirm-ban"
            >
              Ban User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WaitlistOffsetCard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{
    offset: number;
    source: "db" | "env" | "default";
    stored: number | null;
    env: number | null;
    defaultValue: number;
  }>({
    queryKey: ["/api/admin/waitlist/offset"],
  });
  const [draft, setDraft] = useState<string>("");
  const editingValue = draft !== "" ? draft : data ? String(data.offset) : "";

  const mutation = useMutation({
    mutationFn: async (offset: number) => {
      const res = await apiRequest("PUT", "/api/admin/waitlist/offset", { offset });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Offset updated", description: "New value is live for all public waitlist responses." });
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist/offset"] });
      queryClient.invalidateQueries({ queryKey: ["/api/waitlist/mode"] });
      queryClient.invalidateQueries({ queryKey: ["/api/waitlist/count"] });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const n = Number.parseInt(editingValue, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast({ title: "Invalid offset", description: "Enter a non-negative whole number.", variant: "destructive" });
      return;
    }
    mutation.mutate(n);
  };

  const sourceLabel = data?.source === "db"
    ? "admin override (database)"
    : data?.source === "env"
      ? "WAITLIST_POSITION_OFFSET env var"
      : "built-in default";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Public Position Offset</CardTitle>
        <CardDescription>
          Public-facing waitlist positions and counts start at this number. Raw signup order is preserved
          in admin views and CSV exports. Changes take effect for everyone immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Currently effective</div>
            <div className="text-xl font-bold" data-testid="text-waitlist-offset-effective">
              {isLoading ? "…" : data?.offset ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground">from {sourceLabel}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Admin override (DB)</div>
            <div className="text-base font-medium" data-testid="text-waitlist-offset-stored">
              {data?.stored ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Env var fallback</div>
            <div className="text-base font-medium">{data?.env ?? "—"}</div>
            <div className="text-xs text-muted-foreground">default {data?.defaultValue ?? 310}</div>
          </div>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">New offset</label>
            <Input
              type="number"
              min={0}
              value={editingValue}
              onChange={(e) => setDraft(e.target.value)}
              data-testid="input-waitlist-offset"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={mutation.isPending || editingValue === "" || (data && Number.parseInt(editingValue, 10) === data.offset)}
            data-testid="button-save-waitlist-offset"
          >
            {mutation.isPending ? "Saving…" : "Save offset"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WaitlistAdminSection() {
  const { data: modeData } = useQuery<{ enabled: boolean; count: number }>({
    queryKey: ["/api/waitlist/mode"],
  });
  const { data, isLoading } = useQuery<{
    entries: WaitlistEntryRow[];
    total: number;
    stats: { byCountry: Array<{ country: string; count: number }>; byDay: Array<{ day: string; count: number }> };
  }>({
    queryKey: ["/api/admin/waitlist"],
  });
  const entries = data?.entries || [];
  const total = data?.total ?? entries.length;
  const confirmed = entries.filter((e) => !!e.confirmedAt).length;
  const converted = entries.filter((e) => !!e.convertedUserId).length;
  const topReferrers = [...entries]
    .filter((e) => (e.referralCount || 0) > 0)
    .sort((a, b) => (b.referralCount || 0) - (a.referralCount || 0))
    .slice(0, 5);
  const [search, setSearch] = useState("");
  const filtered = entries.filter((e) =>
    !search ||
    e.email.toLowerCase().includes(search.toLowerCase()) ||
    (e.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (e.referralCode || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold mb-1">Waitlist</h2>
          <p className="text-muted-foreground">Manage early access signups and Founder Badge recipients</p>
          <div
            className={`mt-2 inline-flex items-center gap-2 rounded-md px-3 py-1 text-xs font-medium ${
              modeData?.enabled
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
            data-testid="badge-waitlist-mode"
          >
            <span className={`h-2 w-2 rounded-full ${modeData?.enabled ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
            WAITLIST_MODE: {modeData?.enabled ? "ON (read-only)" : "OFF"}
          </div>
        </div>
        <Button asChild data-testid="button-export-waitlist-csv">
          <a href="/api/admin/waitlist/export.csv" download>
            Export CSV
          </a>
        </Button>
      </div>

      <WaitlistOffsetCard />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Signups</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="text-waitlist-total">{total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Confirmed</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="text-waitlist-confirmed">{confirmed}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Converted</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="text-waitlist-converted">{converted}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Referrer</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm font-medium truncate" data-testid="text-waitlist-top-referrer">
              {topReferrers[0]?.email || "—"}
            </div>
            <div className="text-xs text-muted-foreground">{topReferrers[0]?.referralCount ?? 0} referrals</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">Entries</CardTitle>
            <Input
              placeholder="Search email, name, or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
              data-testid="input-waitlist-search"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No waitlist entries found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pos</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Referral Code</TableHead>
                  <TableHead>Referrals</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.id} data-testid={`row-waitlist-${entry.id}`}>
                    <TableCell className="font-mono text-sm">#{entry.position}</TableCell>
                    <TableCell className="text-sm">{entry.email}</TableCell>
                    <TableCell className="text-sm">{entry.name || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {entry.city || entry.country ? `${entry.city || ""}${entry.city && entry.country ? ", " : ""}${entry.country || ""}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{entry.accountType || "—"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{entry.referralCode}</TableCell>
                    <TableCell className="text-sm">{entry.referralCount || 0}</TableCell>
                    <TableCell>
                      {entry.convertedUserId ? (
                        <Badge variant="default">Converted</Badge>
                      ) : entry.confirmedAt ? (
                        <Badge variant="secondary">Confirmed</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {topReferrers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Top Referrers</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Referrals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topReferrers.map((r) => (
                  <TableRow key={r.referralCode} data-testid={`row-referrer-${r.referralCode}`}>
                    <TableCell className="text-sm">{r.email}</TableCell>
                    <TableCell className="font-mono text-xs">{r.referralCode}</TableCell>
                    <TableCell className="text-sm font-semibold">{r.referralCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

