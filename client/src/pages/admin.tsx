import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, API_BASE, assetUrl } from "@/lib/queryClient";
import type { User, Listing, DealWithUsers, MessageWithSender, ListingWithUser, ModerationLog, Report, DisputeWithParties, AdminAuditLog, FailedLoginAttempt } from "@shared/schema";
import { CATEGORIES, COUNTRIES } from "@shared/schema";
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
  UserPlus,
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
  Mail,
  KeyRound,
  BadgeCheck,
  Pencil,
  X,
  Gavel,
  ShieldAlert,
  ClipboardList,
  LogIn,
  Power,
  ToggleLeft,
  ToggleRight,
  Megaphone,
  Plus,
  ExternalLink,
  RefreshCw,
  Database,
  Camera,
  Zap,
  TrendingUp,
  Coins,
  Trophy,
  Instagram,
  Globe,
  MapPin,
  Tag,
  Percent,
  Wallet,
  ListChecks,
  Sun,
} from "lucide-react";
import { VerifiedBadge, isUserVerified } from "@/components/verified-badge";
import { AdminLegalSection } from "@/components/admin/legal-section";
import { AdminPlatformSettings } from "@/components/admin/platform-settings";
import { AdminSupportSection } from "@/components/admin/support-section";
import { AdminIntegrationsSection } from "@/components/admin/integrations-section";
import { AdminReviewsSection } from "@/components/admin/reviews-section";
import { ScrollText } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type AdminSection = "queue" | "dashboard" | "users" | "listings" | "deals" | "disputes" | "analytics" | "settings" | "reports" | "flags" | "logs" | "waitlist" | "feature-waitlist" | "intl-waitlist" | "legal" | "email" | "support" | "reviews" | "creators" | "collabs" | "barter-credits" | "success-stories" | "feature-stats";

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
  newUsersToday?: number;
  newUsersThisWeek?: number;
  totalDeals: number;
  activeDeals: number;
  completedDeals: number;
  cancelledDeals: number;
  proposedDeals: number;
  inProgressDeals: number;
  totalListings: number;
  liveListings: number;
  activeListings: number;
  pausedListings: number;
  deletedListings: number;
  pendingListings: number;
  flaggedListings: number;
  newListingsToday: number;
  totalGMV: number;
  monthlyGMV: number;
  avgDealValue?: number;
  completionRate?: number;
  pendingVerifications: number;
  incompleteVerifications?: number;
  openDrafts?: number;
  abandonedEngagement?: number;
  categoryStats: Record<string, number>;
  topCategories?: { category: string; count: number }[];
  topCountries?: { country: string; count: number }[];
  topCities?: { city: string; count: number }[];
  dealsPerWeek: { week: string; count: number }[];
};

type DateRangeFilter = "all" | "today" | "week" | "month" | "year" | "custom";

function matchesDateRange(date: string | Date | null | undefined, range: DateRangeFilter, customFrom: string, customTo: string): boolean {
  if (range === "all") return true;
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  if (range === "custom") {
    if (customFrom && d < new Date(customFrom)) return false;
    if (customTo && d > new Date(`${customTo}T23:59:59`)) return false;
    return true;
  }
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return d >= start;
  }
  if (range === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return d >= start;
  }
  if (range === "month") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    return d >= start;
  }
  if (range === "year") {
    const start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    return d >= start;
  }
  return true;
}

type FunnelData = {
  waitlistCount: number;
  registeredCount: number;
  listedCount: number;
  dealtCount: number;
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
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [createUserDialog, setCreateUserDialog] = useState<{
    open: boolean; fullName: string; email: string; password: string; phone: string; role: string; accountType: string; isVerified: boolean;
  }>({ open: false, fullName: "", email: "", password: "", phone: "", role: "user", accountType: "individual", isVerified: false });
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; user: User | null; subject: string; body: string }>({
    open: false, user: null, subject: "", body: "",
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [userAccountTypeFilter, setUserAccountTypeFilter] = useState<string>("all");
  const [listingStatusFilter, setListingStatusFilter] = useState<string>("all");
  const [listingCategoryFilter, setListingCategoryFilter] = useState<string>("all");
  const [listingCityFilter, setListingCityFilter] = useState<string>("all");
  const [listingValueFilter, setListingValueFilter] = useState<string>("all");
  const [listingCountryFilter, setListingCountryFilter] = useState<string>("all");
  const [listingSortBy, setListingSortBy] = useState<string>("date_desc");
  const [userCountryFilter, setUserCountryFilter] = useState<string>("all");
  const [userSortBy, setUserSortBy] = useState<string>("date_desc");
  const [dealStateFilter, setDealStateFilter] = useState<string>("all");
  const [dealSortBy, setDealSortBy] = useState<string>("date_desc");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [draftsDialogOpen, setDraftsDialogOpen] = useState(false);
  const [abandonedDialogOpen, setAbandonedDialogOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; listingId: string | null; reason: string }>({
    open: false, listingId: null, reason: "",
  });
  const [editListingDialog, setEditListingDialog] = useState<{ open: boolean; listing: ListingWithUser | null; categories: string[]; retailValue: string }>({
    open: false, listing: null, categories: [], retailValue: "",
  });
  const [disputeStatusFilter, setDisputeStatusFilter] = useState<string>("all");
  const [reportStatusFilter, setReportStatusFilter] = useState<string>("all");
  const [reportTypeFilter, setReportTypeFilter] = useState<string>("all");
  const [selectedDispute, setSelectedDispute] = useState<DisputeWithParties | null>(null);
  const [disputeDecisionDialog, setDisputeDecisionDialog] = useState<{ open: boolean; dispute: DisputeWithParties | null; decision: string; reasoning: string; outcome: string }>({
    open: false, dispute: null, decision: "", reasoning: "", outcome: "",
  });
  const [createDisputeDialog, setCreateDisputeDialog] = useState<{ open: boolean; partyAId: string; partyBId: string; subject: string; description: string; dealId: string }>({
    open: false, partyAId: "", partyBId: "", subject: "", description: "", dealId: "",
  });
  const [disputeAiSuggestion, setDisputeAiSuggestion] = useState<{
    loading: boolean;
    analysis?: string;
    suggestedOutcome?: string;
    suggestedDecision?: string;
    suggestedReasoning?: string;
    confidence?: string;
    error?: string;
  }>({ loading: false });
  const [settingsTab, setSettingsTab] = useState<string>("platform");
  const [auditLogActionFilter, setAuditLogActionFilter] = useState<string>("all");
  const [auditLogAdminFilter, setAuditLogAdminFilter] = useState<string>("all");
  const [auditLogDateFrom, setAuditLogDateFrom] = useState<string>("");
  const [auditLogDateTo, setAuditLogDateTo] = useState<string>("");
  const [logsSource, setLogsSource] = useState<"all" | "ai" | "email" | "whatsapp" | "audit">("all");
  const [logsDatePreset, setLogsDatePreset] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [logsDateFrom, setLogsDateFrom] = useState("");
  const [logsDateTo, setLogsDateTo] = useState("");
  const [logsSearch, setLogsSearch] = useState("");
  const [logsStatusFilter, setLogsStatusFilter] = useState("all");
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastCityFilter, setBroadcastCityFilter] = useState("");
  const [broadcastAccountType, setBroadcastAccountType] = useState("all");
  const [broadcastVerification, setBroadcastVerification] = useState("all");
  const [broadcastJobId, setBroadcastJobId] = useState<string | null>(null);
  const [logsBroadcastFilter, setLogsBroadcastFilter] = useState<string | null>(null);
  const [broadcastPreviewHtml, setBroadcastPreviewHtml] = useState<string | null>(null);
  const [broadcastTestEmails, setBroadcastTestEmails] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState("users");
  const [broadcastBodyMode, setBroadcastBodyMode] = useState<"text" | "html">("text");
  const [aiDraftPrompt, setAiDraftPrompt] = useState("");
  const [aiDraftOpen, setAiDraftOpen] = useState(false);
  const [broadcastPreviewOpen, setBroadcastPreviewOpen] = useState(false);
  const [templatePreviewHtml, setTemplatePreviewHtml] = useState<string | null>(null);
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);
  const [dealsExportFrom, setDealsExportFrom] = useState("");
  const [dealsExportTo, setDealsExportTo] = useState("");
  const [dealsExportState, setDealsExportState] = useState("completed");
  const [reportsExportFrom, setReportsExportFrom] = useState("");
  const [reportsExportTo, setReportsExportTo] = useState("");
  const [editingTemplateKey, setEditingTemplateKey] = useState<string | null>(null);
  const [editingTemplateValue, setEditingTemplateValue] = useState("");
  const [adminRoleDialog, setAdminRoleDialog] = useState<{ open: boolean; user: User | null; action: "promote" | "demote" }>({
    open: false, user: null, action: "promote",
  });

  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedListingIds, setSelectedListingIds] = useState<Set<string>>(new Set());
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  const [selectedDisputeIds, setSelectedDisputeIds] = useState<Set<string>>(new Set());

  const toggleId = useCallback((id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, []);

  const toggleAll = useCallback((ids: string[], setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter(prev => prev.size === ids.length && ids.every(id => prev.has(id)) ? new Set() : new Set(ids));
  }, []);

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!user?.isAdmin,
    staleTime: 0,
  });

  const { data: listings, isLoading: listingsLoading } = useQuery<ListingWithUser[]>({
    queryKey: ["/api/admin/listings"],
    enabled: !!user?.isAdmin,
    staleTime: 0,
  });

  const { data: deals, isLoading: dealsLoading } = useQuery<DealWithUsers[]>({
    queryKey: ["/api/admin/deals"],
    enabled: !!user?.isAdmin,
    staleTime: 0,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics"],
    enabled: !!user?.isAdmin,
    staleTime: 0,
  });

  interface MorningPendingListing { id: string; title: string; category: string | null; retailValue: string | null; createdAt: string | null; userId: string; userEmail: string | null; userName: string | null }
  interface MorningPendingVerif { id: string; email: string; fullName: string; accountType: string | null; verificationStatus: string | null; createdAt: string | null }
  interface MorningReport { id: string; targetType: string; reason: string; status: string; createdAt: string | null }
  interface MorningDispute { id: string; subject: string; status: string; partyAId: string; partyBId: string; createdAt: string | null }
  interface MorningSupportTicket { id: string; ticketNumber: string; subject: string; category: string; priority: string; status: string; requesterEmail: string | null; requesterName: string | null; createdAt: string | null; lastActivityAt: string | null }
  interface MorningFlaggedPost { id: string; caption: string; postType: string | null; moderationStatus: string | null; createdAt: string | null; userId: string; userEmail: string | null; userName: string | null }
  interface MorningStaleDeals { id: string; dealNumber: string; state: string; seekerOffer: string; providerOffer: string; updatedAt: string | null; createdAt: string | null }
  interface MorningMultiReportedUser { userId: string; email: string | null; fullName: string | null; reportCount: number }
  interface MorningCheckData {
    pendingListings: MorningPendingListing[];
    autoBlockedQueue: ModerationLogEntry[];
    pendingVerifications: MorningPendingVerif[];
    openReports: MorningReport[];
    openDisputes: MorningDispute[];
    openSupportTickets: MorningSupportTicket[];
    unrespondedTickets: MorningSupportTicket[];
    flaggedPosts: MorningFlaggedPost[];
    staleDeals: MorningStaleDeals[];
    multiReportedUsers: MorningMultiReportedUser[];
    stats: { newUsers24h: number; newListings24h: number; newDeals24h: number; completedDeals24h: number; activeUsers24h: number };
  }

  const { data: morningCheck, isLoading: morningCheckLoading, refetch: refetchMorningCheck } = useQuery<MorningCheckData>({
    queryKey: ["/api/admin/morning-check"],
    enabled: activeSection === "queue" && !!user?.isAdmin,
    staleTime: 0,
    refetchInterval: 7 * 60 * 60 * 1000,
  });

  const { data: listingDraftsData, isLoading: listingDraftsLoading } = useQuery<{
    id: string; title: string | null; userId: string; userFullName: string | null; userEmail: string | null; createdAt: string; updatedAt: string;
  }[]>({
    queryKey: ["/api/admin/listing-drafts"],
    enabled: !!user?.isAdmin && draftsDialogOpen,
    staleTime: 0,
  });

  const { data: abandonedEngagementData, isLoading: abandonedEngagementLoading } = useQuery<{
    userId: string; userFullName: string | null; userEmail: string | null; listingId: string | null; listingTitle: string | null; eventType: string; createdAt: string;
  }[]>({
    queryKey: ["/api/admin/abandoned-engagement"],
    enabled: !!user?.isAdmin && abandonedDialogOpen,
    staleTime: 0,
  });

  const { data: userGrowth } = useQuery<{ date: string; count: number }[]>({
    queryKey: ["/api/admin/analytics/user-growth"],
    enabled: !!user?.isAdmin,
    staleTime: 0,
  });

  const { data: topListings } = useQuery<{ id: string; title: string; viewCount: number; proposalCount: number }[]>({
    queryKey: ["/api/admin/analytics/top-listings"],
    enabled: !!user?.isAdmin,
    staleTime: 0,
  });

  const { data: funnelData, isLoading: funnelLoading } = useQuery<FunnelData>({
    queryKey: ["/api/admin/analytics/funnel"],
    enabled: !!user?.isAdmin,
    staleTime: 0,
  });

  // ── New Feature queries ────────────────────────────────────────────────────
  interface FeatureStats {
    bulkListingsActive: number; successStoriesPending: number; successStoriesApproved: number;
    digestEmailsSent: number; digestEmailsLast7d: number; digestAvgMatches: number;
    whatsappOptIns: number; whatsappTotal: number; instantMatchCalls: number;
  }
  const { data: featureStats, isLoading: featureStatsLoading, refetch: refetchFeatureStats } = useQuery<FeatureStats>({
    queryKey: ["/api/admin/features/stats"],
    enabled: activeSection === "feature-stats" && !!user?.isAdmin,
    staleTime: 0,
  });

  interface AdminBarterCredit { id: string; userId: string; balanceAed: string; lifetimeEarnedAed: string; updatedAt: string | null; userEmail: string | null; userName: string | null }
  const { data: barterCreditsData, isLoading: creditsLoading, refetch: refetchCredits } = useQuery<AdminBarterCredit[]>({
    queryKey: ["/api/admin/barter-credits"],
    enabled: activeSection === "barter-credits" && !!user?.isAdmin,
    staleTime: 0,
  });

  interface AdminSuccessStory { id: string; dealId: string; authorId: string; partnerId: string; caption: string | null; imageUrl: string | null; seekerItem: string | null; providerItem: string | null; isFeatured: boolean; status: string; createdAt: string | null; authorName: string | null; partnerName: string | null }
  const [storyStatusFilter, setStoryStatusFilter] = useState("all");
  const { data: successStoriesData, isLoading: storiesLoading, refetch: refetchStories } = useQuery<AdminSuccessStory[]>({
    queryKey: ["/api/admin/success-stories", storyStatusFilter],
    enabled: activeSection === "success-stories" && !!user?.isAdmin,
    staleTime: 0,
  });

  const updateStoryMutation = useMutation({
    mutationFn: async ({ id, status, isFeatured }: { id: string; status?: string; isFeatured?: boolean }) =>
      apiRequest("PATCH", `/api/admin/success-stories/${id}/status`, { status, isFeatured }),
    onSuccess: () => { refetchStories(); toast({ title: "Story updated" }); },
  });

  const [creditAdjustUserId, setCreditAdjustUserId] = useState("");
  const [creditAdjustAmount, setCreditAdjustAmount] = useState("");
  const [creditAdjustNote, setCreditAdjustNote] = useState("");
  const adjustCreditMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/admin/barter-credits/${creditAdjustUserId}/adjust`, {
      amount: parseFloat(creditAdjustAmount), note: creditAdjustNote,
    }),
    onSuccess: () => { refetchCredits(); setCreditAdjustAmount(""); setCreditAdjustNote(""); toast({ title: "Credits adjusted" }); },
    onError: () => toast({ title: "Error adjusting credits", variant: "destructive" }),
  });

  const [digestSending, setDigestSending] = useState(false);
  const sendDigestMutation = useMutation({
    mutationFn: async (userId?: string) => apiRequest("POST", "/api/admin/match-digest/send", userId ? { userId } : {}),
    onSuccess: (data: any) => { toast({ title: `Digest sent to ${data?.sent ?? 0} users` }); setDigestSending(false); refetchFeatureStats(); },
    onError: () => { toast({ title: "Digest send failed", variant: "destructive" }); setDigestSending(false); },
  });

  const { data: emailStats } = useQuery<{ total: number; sent: number; failed: number }>({
    queryKey: ["/api/admin/email/stats"],
    enabled: !!user?.isAdmin,
    staleTime: 0,
  });

  const { data: emailTemplates } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/email/templates"],
    enabled: !!user?.isAdmin,
    staleTime: 0,
  });

  const { data: dealMessages } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/admin/deals", selectedDeal?.id, "messages"],
    enabled: !!selectedDeal,
    staleTime: 0,
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof createUserDialog) => {
      const res = await apiRequest("POST", "/api/admin/users/create", {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        phone: data.phone || undefined,
        role: data.role,
        accountType: data.accountType,
        isVerified: data.isVerified,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setCreateUserDialog({ open: false, fullName: "", email: "", password: "", phone: "", role: "user", accountType: "individual", isVerified: false });
      toast({ title: "User created", description: "New user account created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create user", description: err.message, variant: "destructive" });
    },
  });

  const verifyUserMutation = useMutation({
    mutationFn: async ({ userId, verified }: { userId: string; verified: boolean }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/verify`, { verified });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/funnel"] });
      toast({ title: "Success", description: "User verification updated" });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/admin/users/${userId}/promote`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setAdminRoleDialog({ open: false, user: null, action: "promote" });
      toast({ title: "Success", description: "User promoted to admin" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to promote user", variant: "destructive" });
    },
  });

  const demoteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/admin/users/${userId}/demote`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setAdminRoleDialog({ open: false, user: null, action: "demote" });
      toast({ title: "Success", description: "Admin access removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to demote user", variant: "destructive" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/funnel"] });
      toast({ title: "Success", description: "Listing removed" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/admin/users/${userId}/reset-password`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Password reset email sent" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send password reset email", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/funnel"] });
      setDeleteDialog({ open: false, user: null });
      setSelectedUserId(null);
      toast({ title: "Success", description: "User data erased (PDPL)" });
    },
  });

  const verificationTierMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/verification-tier`, { tier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "Verification tier updated" });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async ({ userId, subject, body }: { userId: string; subject: string; body: string }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/email`, { subject, body });
    },
    onSuccess: () => {
      setEmailDialog({ open: false, user: null, subject: "", body: "" });
      toast({ title: "Success", description: "Email sent successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send email", variant: "destructive" });
    },
  });

  const approveListingMutation = useMutation({
    mutationFn: async (listingId: string) => {
      await apiRequest("PATCH", `/api/admin/listings/${listingId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/morning-check"] });
      toast({ title: "Success", description: "Listing approved" });
    },
  });

  const rejectListingMutation = useMutation({
    mutationFn: async ({ listingId, reason }: { listingId: string; reason: string }) => {
      await apiRequest("PATCH", `/api/admin/listings/${listingId}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/morning-check"] });
      setRejectDialog({ open: false, listingId: null, reason: "" });
      toast({ title: "Success", description: "Listing rejected and user notified" });
    },
  });

  const approvePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      await apiRequest("PATCH", `/api/admin/posts/${postId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/morning-check"] });
      toast({ title: "Success", description: "Post approved" });
    },
  });

  const rejectPostMutation = useMutation({
    mutationFn: async ({ postId, reason }: { postId: string; reason: string }) => {
      await apiRequest("PATCH", `/api/admin/posts/${postId}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/morning-check"] });
      toast({ title: "Success", description: "Post rejected" });
    },
  });

  const editListingMutation = useMutation({
    mutationFn: async ({ listingId, categories, retailValue }: { listingId: string; categories: string[]; retailValue: string }) => {
      await apiRequest("PATCH", `/api/admin/listings/${listingId}/edit`, { categories, retailValue });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/listings"] });
      setEditListingDialog({ open: false, listing: null, categories: [], retailValue: "" });
      toast({ title: "Success", description: "Listing updated" });
    },
  });

  const featureListingMutation = useMutation({
    mutationFn: async ({ listingId, featured }: { listingId: string; featured: boolean }) => {
      await apiRequest("PATCH", `/api/admin/listings/${listingId}/feature`, { featured, durationDays: 7 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/listings"] });
      toast({ title: "Success", description: "Listing feature status updated" });
    },
  });

  // ── Bulk mutations ────────────────────────────────────────────────────────
  const bulkUserMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: "ban" | "unban" | "delete" }) => {
      const res = await apiRequest("POST", "/api/admin/bulk/users", { ids: Array.from(ids), action });
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
      setSelectedUserIds(new Set());
      toast({ title: "Done", description: `${data.affected} user(s) ${vars.action === "delete" ? "deleted" : vars.action === "ban" ? "banned" : "unbanned"}` });
    },
    onError: (err: any) => toast({ title: "Bulk action failed", description: err?.message?.slice(0, 200) || "Unknown error", variant: "destructive" }),
  });

  const bulkListingMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: "approve" | "reject" | "delete" }) => {
      const res = await apiRequest("POST", "/api/admin/bulk/listings", { ids: Array.from(ids), action });
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
      setSelectedListingIds(new Set());
      toast({ title: "Done", description: `${data.affected} listing(s) ${vars.action}d` });
    },
    onError: () => toast({ title: "Error", description: "Bulk action failed", variant: "destructive" }),
  });

  const bulkDealMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/admin/bulk/deals", { ids: Array.from(ids), action: "delete" });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
      setSelectedDealIds(new Set());
      toast({ title: "Done", description: `${data.affected} deal(s) deleted` });
    },
    onError: () => toast({ title: "Error", description: "Bulk delete failed", variant: "destructive" }),
  });

  const bulkDisputeMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: "delete" | "resolve" }) => {
      const res = await apiRequest("POST", "/api/admin/bulk/disputes", { ids: Array.from(ids), action });
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      setSelectedDisputeIds(new Set());
      toast({ title: "Done", description: `${data.affected} dispute(s) ${vars.action}d` });
    },
    onError: () => toast({ title: "Error", description: "Bulk action failed", variant: "destructive" }),
  });

  const { data: userDetail } = useQuery<User & { listings: Listing[]; deals: DealWithUsers[] }>({
    queryKey: ["/api/admin/users", selectedUserId, "detail"],
    enabled: !!selectedUserId,
    staleTime: 0,
  });

  const { data: listingModerationHistory } = useQuery<ModerationLog[]>({
    queryKey: ["/api/admin/listings", selectedListingId, "moderation-history"],
    enabled: !!selectedListingId,
    staleTime: 0,
  });

  const { data: disputesData = [], isLoading: disputesLoading } = useQuery<DisputeWithParties[]>({
    queryKey: ["/api/admin/disputes"],
    enabled: activeSection === "disputes",
    staleTime: 0,
  });

  const auditLogQueryParams = new URLSearchParams();
  if (auditLogActionFilter !== "all") auditLogQueryParams.set("action", auditLogActionFilter);
  if (auditLogAdminFilter !== "all") auditLogQueryParams.set("adminId", auditLogAdminFilter);
  if (auditLogDateFrom) auditLogQueryParams.set("from", new Date(auditLogDateFrom).toISOString());
  if (auditLogDateTo) auditLogQueryParams.set("to", new Date(auditLogDateTo + "T23:59:59").toISOString());
  const auditLogUrl = `/api/admin/audit-logs${auditLogQueryParams.toString() ? `?${auditLogQueryParams}` : ""}`;

  const { data: auditLogs = [] } = useQuery<AdminAuditLog[]>({
    queryKey: ["/api/admin/audit-logs", auditLogActionFilter, auditLogAdminFilter, auditLogDateFrom, auditLogDateTo],
    queryFn: () => fetch(auditLogUrl, { credentials: "include" }).then(r => r.json()),
    enabled: (activeSection === "settings" && settingsTab === "audit") || activeSection === "logs",
    staleTime: 0,
  });

  const { data: failedLogins = [] } = useQuery<FailedLoginAttempt[]>({
    queryKey: ["/api/admin/failed-logins"],
    enabled: activeSection === "settings" && settingsTab === "security",
    staleTime: 0,
  });

  const { data: dataCollectionSetting } = useQuery<{ dataCollectionDisabled: boolean }>({
    queryKey: ["/api/admin/settings/data-collection"],
    enabled: activeSection === "settings",
    staleTime: 0,
  });

  const { data: betaInviteData } = useQuery<{ code: string | null; inviteUrl: string | null }>({
    queryKey: ["/api/admin/beta-invite-code"],
    enabled: activeSection === "settings",
    staleTime: 0,
  });

  const regenerateInviteCodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/beta-invite-code/regenerate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/beta-invite-code"] });
      toast({ title: "New code generated", description: "Share the updated invite link with your beta testers." });
    },
  });

  const dealStateMutation = useMutation({
    mutationFn: async ({ dealId, state, reason }: { dealId: string; state: string; reason?: string }) => {
      await apiRequest("PATCH", `/api/admin/deals/${dealId}/state`, { state, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/funnel"] });
      setSelectedDeal(null);
      toast({ title: "Success", description: "Deal state updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update deal state", variant: "destructive" });
    },
  });

  const createDisputeMutation = useMutation({
    mutationFn: async (data: { partyAId: string; partyBId: string; subject: string; description?: string; dealId?: string }) => {
      await apiRequest("POST", "/api/admin/disputes", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      setCreateDisputeDialog({ open: false, partyAId: "", partyBId: "", subject: "", description: "", dealId: "" });
      toast({ title: "Success", description: "Dispute created" });
    },
  });

  const disputeStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/admin/disputes/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      toast({ title: "Success", description: "Dispute status updated" });
    },
  });

  const disputeDecisionMutation = useMutation({
    mutationFn: async ({ id, decision, decisionReasoning, outcome }: { id: string; decision: string; decisionReasoning: string; outcome: string }) => {
      await apiRequest("PATCH", `/api/admin/disputes/${id}/decision`, { decision, decisionReasoning, outcome });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      setDisputeDecisionDialog({ open: false, dispute: null, decision: "", reasoning: "", outcome: "" });
      setDisputeAiSuggestion({ loading: false });
      setSelectedDispute(null);
      toast({ title: "Success", description: "Dispute resolved and parties notified" });
    },
  });

  const disputeEscalateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/disputes/${id}/escalate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      toast({ title: "Success", description: "Dispute escalated to mediation" });
    },
  });

  const disputeDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/disputes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      setSelectedDispute(null);
      toast({ title: "Success", description: "Dispute deleted" });
    },
  });

  const [evidenceText, setEvidenceText] = useState("");
  const addEvidenceMutation = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      const res = await apiRequest("POST", `/api/admin/disputes/${id}/evidence`, { description });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      setSelectedDispute(data);
      setEvidenceText("");
      toast({ title: "Success", description: "Evidence added" });
    },
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/admin/users/${userId}/revoke-sessions`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "All sessions revoked" });
    },
  });

  const dataCollectionMutation = useMutation({
    mutationFn: async (disabled: boolean) => {
      await apiRequest("PATCH", "/api/admin/settings/data-collection", { disabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/data-collection"] });
      toast({ title: "Success", description: "Data collection setting updated" });
    },
  });

  const marketingConsentMutation = useMutation({
    mutationFn: async ({ userId, marketingEmails }: { userId: string; marketingEmails: boolean }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/marketing-consent`, { marketingEmails });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "Marketing consent updated" });
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: async (data: { subject: string; body: string; filter?: { audience?: string; city?: string; accountType?: string; verificationStatus?: string; bodyMode?: string } }) => {
      const res = await apiRequest("POST", "/api/admin/email/broadcast", data);
      return res.json();
    },
    onSuccess: (data: { broadcastId: string; recipientCount: number; status: string }) => {
      setBroadcastJobId(data.broadcastId);
      setBroadcastSubject("");
      setBroadcastBody("");
      toast({ title: "Broadcast queued", description: `Sending to ${data.recipientCount} recipients in the background…` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/broadcasts"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to start broadcast", variant: "destructive" });
    },
  });

  const broadcastTestMutation = useMutation({
    mutationFn: async (data: { subject: string; body: string; to?: string; bodyMode?: string }) => {
      const res = await apiRequest("POST", "/api/admin/email/broadcast/test", data);
      return res.json();
    },
    onSuccess: (data: { message: string }) => {
      toast({ title: "Test email sent", description: data.message });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send test email", variant: "destructive" });
    },
  });

  const resendFailedMutation = useMutation({
    mutationFn: async (originalBroadcastId: string) => {
      const res = await apiRequest("POST", `/api/admin/email/broadcast/${originalBroadcastId}/resend-failed`, {});
      return res.json();
    },
    onSuccess: (data: { broadcastId: string; recipientCount: number; status: string }) => {
      setBroadcastJobId(data.broadcastId);
      toast({ title: "Resending to failed recipients", description: `Retrying ${data.recipientCount} recipients in the background…` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/broadcasts"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to start resend";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const aiDraftMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await apiRequest("POST", "/api/admin/email/ai-draft", { prompt });
      return res.json() as Promise<{ subject: string; body: string }>;
    },
    onSuccess: (data) => {
      if (data.subject) setBroadcastSubject(data.subject);
      if (data.body) setBroadcastBody(data.body);
      setAiDraftOpen(false);
      setAiDraftPrompt("");
      toast({ title: "AI draft ready", description: "Subject and body have been filled in — review and edit before sending." });
    },
    onError: () => {
      toast({ title: "AI draft failed", description: "Gemini API quota exceeded or key invalid — check AI_INTEGRATIONS_OPENAI_API_KEY.", variant: "destructive" });
    },
  });

  const { data: broadcastJobStatus } = useQuery<{ id: string; status: string; recipientCount: number; sent: number; failed: number; completedAt: string | null }>({
    queryKey: ["/api/admin/email/broadcast", broadcastJobId],
    enabled: !!broadcastJobId,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 3000;
    },
  });

  useEffect(() => {
    if (broadcastJobStatus?.status === "completed" || broadcastJobStatus?.status === "failed") {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/stats"] });
    }
  }, [broadcastJobStatus?.status]);

  type BroadcastJobRow = { id: string; subject: string; status: string; recipientCount: number; sent: number; failed: number; createdAt: string | null; completedAt: string | null; filter: { retryOf?: string } | null };
  const { data: broadcastHistory, refetch: refetchBroadcastHistory } = useQuery<BroadcastJobRow[]>({
    queryKey: ["/api/admin/email/broadcasts"],
    queryFn: async () => { const r = await fetch(`${API_BASE}/api/admin/email/broadcasts`, { credentials: "include" }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    staleTime: 0,
    enabled: false,
  });

  // setLogsBroadcastFilter + refetchEmailLogs() in the same handler would race —
  // the query's queryKey only updates on the next render, so an immediate
  // refetch() would still hit the *previous* filter. Fetch directly and seed
  // the cache for the key this component is about to render with instead.
  const loadEmailLogs = async (broadcastIdFilter: string | null) => {
    setLogsBroadcastFilter(broadcastIdFilter);
    const url = broadcastIdFilter
      ? `/api/admin/email/logs?broadcastId=${encodeURIComponent(broadcastIdFilter)}`
      : "/api/admin/email/logs";
    const r = await fetch(url, { credentials: "include" });
    if (r.ok) {
      queryClient.setQueryData(["/api/admin/email/logs", broadcastIdFilter], await r.json());
    }
  };

  const previewMutation = useMutation({
    mutationFn: async (data: { body: string; recipientName?: string; vars?: Record<string, string>; mode?: "broadcast" | "template" | "html" }) => {
      const res = await apiRequest("POST", "/api/admin/email/preview", data);
      return res.json() as Promise<{ html: string }>;
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await apiRequest("PUT", "/api/admin/email/templates", { templates: { [key]: value } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/templates"] });
      setEditingTemplateKey(null);
      setEditingTemplateValue("");
      toast({ title: "Template saved" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to save template";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const [sendingTestKey, setSendingTestKey] = useState<string | null>(null);
  const sendTestEmailMutation = useMutation({
    mutationFn: async (templateKey: string) => {
      const res = await apiRequest("POST", `/api/admin/email/test/${templateKey}`, {});
      return res.json() as Promise<{ ok: boolean; to: string; templateKey: string }>;
    },
    onSuccess: (data) => {
      setSendingTestKey(null);
      if (data.ok) {
        toast({ title: "Test sent", description: `Email dispatched to ${data.to}` });
      } else {
        toast({ title: "Test failed", description: "Email provider not configured or send failed — check Email Logs", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/logs"] });
    },
    onError: () => {
      setSendingTestKey(null);
      toast({ title: "Error", description: "Failed to send test email", variant: "destructive" });
    },
  });

  const { data: emailLogsData, refetch: refetchEmailLogs } = useQuery<any[]>({
    queryKey: ["/api/admin/email/logs", logsBroadcastFilter],
    queryFn: async () => {
      const url = logsBroadcastFilter
        ? `/api/admin/email/logs?broadcastId=${encodeURIComponent(logsBroadcastFilter)}`
        : "/api/admin/email/logs";
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 0,
    enabled: false,
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

  const availableUserCountries = Array.from(new Set((users ?? []).map(u => (u as any).country).filter(Boolean) as string[])).sort();

  const filteredUsers = users?.filter((u) => {
    const matchesSearch = u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (userStatusFilter === "active" && !(!u.isBanned && !(u.kycStatus === "IN_PROGRESS" || u.kybStatus === "IN_PROGRESS" || u.kycStatus === "IN_REVIEW" || u.kybStatus === "IN_REVIEW"))) return false;
    if (userStatusFilter === "banned" && !u.isBanned) return false;
    if (userStatusFilter === "pending" && !(u.kycStatus === "IN_PROGRESS" || u.kybStatus === "IN_PROGRESS" || u.kycStatus === "IN_REVIEW" || u.kybStatus === "IN_REVIEW")) return false;
    if (userStatusFilter === "unverified" && !(!u.isVerified && !u.isBanned)) return false;
    if (userAccountTypeFilter === "individual" && !(u.accountType === "individual" || !u.accountType)) return false;
    if (userAccountTypeFilter === "business" && u.accountType !== "business") return false;
    if (userCountryFilter !== "all" && (u as any).country !== userCountryFilter) return false;
    if (!matchesDateRange(u.createdAt, dateRangeFilter, customDateFrom, customDateTo)) return false;
    return true;
  }).sort((a, b) => {
    const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return userSortBy === "date_asc" ? aT - bT : bT - aT;
  });

  const availableCities = Array.from(new Set((listings ?? []).map(l => l.city).filter(Boolean) as string[])).sort();
  const availableListingCountries = Array.from(new Set((listings ?? []).map(l => (l as any).country).filter(Boolean) as string[])).sort();

  const filteredListings = listings?.filter((l) => {
    const matchesSearch = l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.user?.fullName?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    const isDeleted = !!(l as any).deletedAt;
    if (listingStatusFilter === "deleted") return isDeleted;
    if (isDeleted) return false; // hide deleted from all other filters
    if (listingStatusFilter === "active" && (!l.isActive || l.moderationStatus === "rejected")) return false;
    if (listingStatusFilter === "paused" && (l.isActive || isDeleted)) return false;
    if (listingStatusFilter === "inactive" && l.isActive) return false;
    if (listingStatusFilter === "pending" && l.moderationStatus !== "pending") return false;
    if (listingStatusFilter === "approved" && l.moderationStatus !== "approved") return false;
    if (listingStatusFilter === "flagged" && l.moderationStatus !== "flagged" && !l.valueFlagged && !l.imageFlagged) return false;
    if (listingStatusFilter === "rejected" && l.moderationStatus !== "rejected") return false;
    if (listingStatusFilter === "featured" && !l.isFeatured) return false;
    if (listingCategoryFilter !== "all") {
      const cats = (l.categories as string[]) || [];
      if (!cats.includes(listingCategoryFilter)) return false;
    }
    if (listingCityFilter !== "all" && l.city !== listingCityFilter) return false;
    if (listingCountryFilter !== "all" && (l as any).country !== listingCountryFilter) return false;
    if (listingValueFilter !== "all") {
      const val = parseFloat(l.retailValue || "0");
      if (listingValueFilter === "under1000" && val >= 1000) return false;
      if (listingValueFilter === "1000to5000" && (val < 1000 || val > 5000)) return false;
      if (listingValueFilter === "5000to20000" && (val < 5000 || val > 20000)) return false;
      if (listingValueFilter === "over20000" && val <= 20000) return false;
    }
    if (!matchesDateRange(l.createdAt, dateRangeFilter, customDateFrom, customDateTo)) return false;
    return true;
  }).sort((a, b) => {
    if (listingSortBy === "value_desc") return parseFloat(b.retailValue || "0") - parseFloat(a.retailValue || "0");
    if (listingSortBy === "value_asc") return parseFloat(a.retailValue || "0") - parseFloat(b.retailValue || "0");
    if (listingSortBy === "proposals_desc") return ((b as any).proposalCount ?? 0) - ((a as any).proposalCount ?? 0);
    if (listingSortBy === "views_desc") return ((b as any).viewCount ?? 0) - ((a as any).viewCount ?? 0);
    const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return listingSortBy === "date_asc" ? aT - bT : bT - aT;
  });

  const filteredDeals = deals?.filter((d) => {
    const matchesSearch = d.dealNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.seeker.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.provider.fullName.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (dealStateFilter === "active" && !["proposed", "accepted", "in_progress", "delivery_proof"].includes(d.state)) return false;
    if (dealStateFilter !== "all" && dealStateFilter !== "active" && d.state !== dealStateFilter) return false;
    if (!matchesDateRange(d.createdAt, dateRangeFilter, customDateFrom, customDateTo)) return false;
    return true;
  }).sort((a, b) => {
    if (dealSortBy === "value_desc" || dealSortBy === "value_asc") {
      const aVal = parseFloat(a.seekerValue as string || "0") + parseFloat(a.providerValue as string || "0");
      const bVal = parseFloat(b.seekerValue as string || "0") + parseFloat(b.providerValue as string || "0");
      return dealSortBy === "value_asc" ? aVal - bVal : bVal - aVal;
    }
    const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dealSortBy === "date_asc" ? aT - bT : bT - aT;
  });

  const pendingModerationCount = (listings || []).filter(l => l.moderationStatus === "pending").length;
  const pendingVerifCount = (users || []).filter(u => u.verificationStatus === "submitted").length;
  const morningBadge = pendingModerationCount + pendingVerifCount;

  const navItems: { id: AdminSection; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "queue", label: "Daily Queue", icon: ClipboardList, badge: morningBadge > 0 ? morningBadge : undefined },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users },
    { id: "listings", label: "Listings", icon: Package },
    { id: "deals", label: "Deals", icon: Handshake },
    { id: "disputes", label: "Disputes", icon: Gavel },
    { id: "reports", label: "Reports", icon: Flag },
    { id: "flags", label: "Flags", icon: AlertTriangle },
    { id: "logs", label: "Logs", icon: ScrollText },
    { id: "waitlist", label: "Waitlist", icon: Sparkles },
    { id: "feature-waitlist", label: "Feature Waitlists", icon: Sparkles },
    { id: "intl-waitlist", label: "Intl. Waitlist", icon: Globe },
    { id: "legal", label: "Legal", icon: ScrollText },
    { id: "email", label: "Email", icon: Mail },
    { id: "support", label: "Support", icon: MessageSquare },
    { id: "reviews", label: "Reviews", icon: Star },
    { id: "creators", label: "Creators", icon: Camera },
    { id: "collabs", label: "Collabs", icon: Zap },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "feature-stats", label: "Feature Hub", icon: Zap },
    { id: "barter-credits", label: "Barter Credits", icon: Coins },
    { id: "success-stories", label: "Success Stories", icon: Trophy },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const categoryData = analytics?.categoryStats
    ? Object.entries(analytics.categoryStats).map(([name, value]) => ({ name, value }))
    : [];

  // Shared date-range control reused across Users/Listings/Deals — single
  // dateRangeFilter state drives all three so a dashboard card click can
  // preset it once and land on a coherent filtered view.
  const renderDateRangeFilter = () => (
    <div className="flex items-center gap-2">
      <Select value={dateRangeFilter} onValueChange={(v) => setDateRangeFilter(v as DateRangeFilter)}>
        <SelectTrigger className="w-[130px]" data-testid="select-date-range-filter">
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">Last 7 Days</SelectItem>
          <SelectItem value="month">Last 30 Days</SelectItem>
          <SelectItem value="year">Last Year</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>
      {dateRangeFilter === "custom" && (
        <>
          <Input type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)} className="w-36 h-9 text-xs" data-testid="input-date-range-from" />
          <Input type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)} className="w-36 h-9 text-xs" data-testid="input-date-range-to" />
        </>
      )}
    </div>
  );

  // Lets a dashboard card jump straight to a section with a preset filter
  // combination, so "New Listings Today" etc. land on the exact filtered
  // view the metric describes instead of just switching tabs blind.
  const goToSection = (section: AdminSection, opts?: {
    userStatusFilter?: string;
    userCountryFilter?: string;
    userSortBy?: string;
    listingStatusFilter?: string;
    listingValueFilter?: string;
    listingCountryFilter?: string;
    listingSortBy?: string;
    dealStateFilter?: string;
    dealSortBy?: string;
    dateRangeFilter?: DateRangeFilter;
  }) => {
    setSearchQuery("");
    setDateRangeFilter(opts?.dateRangeFilter ?? "all");
    setCustomDateFrom("");
    setCustomDateTo("");
    setUserStatusFilter(opts?.userStatusFilter ?? "all");
    setUserCountryFilter(opts?.userCountryFilter ?? "all");
    setUserSortBy(opts?.userSortBy ?? "date_desc");
    setListingStatusFilter(opts?.listingStatusFilter ?? "all");
    setListingValueFilter(opts?.listingValueFilter ?? "all");
    setListingCountryFilter(opts?.listingCountryFilter ?? "all");
    setListingSortBy(opts?.listingSortBy ?? "date_desc");
    setDealStateFilter(opts?.dealStateFilter ?? "all");
    setDealSortBy(opts?.dealSortBy ?? "date_desc");
    setActiveSection(section);
  };

  const StatCard = ({
    testId, label, value, sub, icon, color, onClick,
  }: {
    testId: string; label: string; value: string | number; sub?: string;
    icon: React.ReactNode; color: string; onClick?: () => void;
  }) => (
    <Card
      data-testid={testId}
      className={onClick ? "cursor-pointer transition-colors hover:bg-muted/50" : undefined}
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center shrink-0`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderDashboard = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Dashboard Overview</h2>
        <p className="text-muted-foreground">Platform metrics and quick actions — click any card to drill in</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          testId="stat-total-users" label="Total Users" value={analytics?.totalUsers || 0}
          icon={<Users className="h-5 w-5 text-primary" />} color="bg-primary/10"
          onClick={() => goToSection("users")}
        />
        <StatCard
          testId="stat-new-users-today" label="New Users Today" value={analytics?.newUsersToday || 0}
          icon={<UserPlus className="h-5 w-5 text-cyan-500" />} color="bg-cyan-500/10"
          onClick={() => goToSection("users", { dateRangeFilter: "today" })}
        />
        <StatCard
          testId="stat-new-users-week" label="New Users This Week" value={analytics?.newUsersThisWeek || 0}
          icon={<UserPlus className="h-5 w-5 text-sky-500" />} color="bg-sky-500/10"
          onClick={() => goToSection("users", { dateRangeFilter: "week" })}
        />
        <StatCard
          testId="stat-active-deals" label="Active Deals" value={analytics?.activeDeals || 0}
          icon={<Handshake className="h-5 w-5 text-blue-500" />} color="bg-blue-500/10"
          onClick={() => goToSection("deals", { dealStateFilter: "active" })}
        />
        <StatCard
          testId="stat-total-deals" label="Total Deals" value={analytics?.totalDeals || 0}
          icon={<ListChecks className="h-5 w-5 text-indigo-500" />} color="bg-indigo-500/10"
          onClick={() => goToSection("deals")}
        />

        <StatCard
          testId="stat-completed-deals" label="Completed Deals" value={analytics?.completedDeals || 0}
          icon={<CheckCircle className="h-5 w-5 text-green-500" />} color="bg-green-500/10"
          onClick={() => goToSection("deals", { dealStateFilter: "completed" })}
        />
        <StatCard
          testId="stat-completion-rate" label="Completion Rate"
          value={analytics?.completionRate !== undefined ? `${analytics.completionRate.toFixed(0)}%` : "0%"}
          icon={<Percent className="h-5 w-5 text-emerald-500" />} color="bg-emerald-500/10"
          onClick={() => goToSection("deals", { dealStateFilter: "completed" })}
        />
        <StatCard
          testId="stat-monthly-gmv" label="GMV This Month"
          value={analytics?.monthlyGMV ? `${(analytics.monthlyGMV / 1000).toFixed(0)}K` : "0"}
          sub="AED" icon={<DollarSign className="h-5 w-5 text-green-500" />} color="bg-green-500/10"
          onClick={() => goToSection("deals", { dealStateFilter: "completed", dealSortBy: "value_desc", dateRangeFilter: "month" })}
        />
        <StatCard
          testId="stat-total-gmv" label="Total GMV (All Time)"
          value={analytics?.totalGMV ? `${(analytics.totalGMV / 1000).toFixed(0)}K` : "0"}
          sub="AED" icon={<Wallet className="h-5 w-5 text-teal-500" />} color="bg-teal-500/10"
          onClick={() => goToSection("deals", { dealStateFilter: "completed", dealSortBy: "value_desc" })}
        />
        <StatCard
          testId="stat-avg-deal-value" label="Avg Deal Value"
          value={analytics?.avgDealValue ? `${Math.round(analytics.avgDealValue).toLocaleString()}` : "0"}
          sub="AED" icon={<DollarSign className="h-5 w-5 text-lime-500" />} color="bg-lime-500/10"
          onClick={() => goToSection("deals", { dealStateFilter: "completed", dealSortBy: "value_desc" })}
        />

        <StatCard
          testId="stat-total-listings" label="Total Listings" value={analytics?.totalListings || 0}
          icon={<Package className="h-5 w-5 text-purple-500" />} color="bg-purple-500/10"
          onClick={() => goToSection("listings")}
        />
        <StatCard
          testId="stat-active-listings" label="Active Listings" value={analytics?.activeListings || 0}
          icon={<Package className="h-5 w-5 text-fuchsia-500" />} color="bg-fuchsia-500/10"
          onClick={() => goToSection("listings")}
        />
        <StatCard
          testId="stat-new-listings-today" label="New Listings Today" value={analytics?.newListingsToday || 0}
          icon={<Package className="h-5 w-5 text-violet-500" />} color="bg-violet-500/10"
          onClick={() => goToSection("listings", { dateRangeFilter: "today" })}
        />
        <StatCard
          testId="stat-pending-verifications" label="Pending Verifications" value={analytics?.pendingVerifications || 0}
          icon={<Clock className="h-5 w-5 text-orange-500" />} color="bg-orange-500/10"
          onClick={() => goToSection("users", { userStatusFilter: "pending" })}
        />
        {/* Task #248: completion-funnel KPIs surfaced from /api/admin/analytics */}
        <StatCard
          testId="stat-incomplete-verifications" label="Incomplete Verifications" value={analytics?.incompleteVerifications || 0}
          icon={<Clock className="h-5 w-5 text-amber-500" />} color="bg-amber-500/10"
          onClick={() => goToSection("users", { userStatusFilter: "pending" })}
        />

        <StatCard
          testId="stat-open-drafts" label="Open Drafts" value={analytics?.openDrafts || 0}
          icon={<Package className="h-5 w-5 text-blue-500" />} color="bg-blue-500/10"
          onClick={() => setDraftsDialogOpen(true)}
        />
        <StatCard
          testId="stat-abandoned-engagement" label="Abandoned Engagement" value={analytics?.abandonedEngagement || 0}
          icon={<Clock className="h-5 w-5 text-rose-500" />} color="bg-rose-500/10"
          onClick={() => setAbandonedDialogOpen(true)}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Tag className="h-4 w-4" /> Top Categories</CardTitle>
            <CardDescription>Most-listed categories, click to filter listings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(analytics?.topCategories?.length ? analytics.topCategories : []).map((c) => (
              <button
                key={c.category}
                className="w-full flex items-center justify-between text-sm py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                onClick={() => goToSection("listings")}
                data-testid={`top-category-${c.category}`}
              >
                <span className="truncate">{c.category}</span>
                <Badge variant="secondary">{c.count}</Badge>
              </button>
            ))}
            {!analytics?.topCategories?.length && <p className="text-sm text-muted-foreground">No data yet</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4" /> Top Countries</CardTitle>
            <CardDescription>Listings by country, click to filter</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(analytics?.topCountries?.length ? analytics.topCountries : []).map((c) => (
              <button
                key={c.country}
                className="w-full flex items-center justify-between text-sm py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                onClick={() => goToSection("listings", { listingCountryFilter: c.country })}
                data-testid={`top-country-${c.country}`}
              >
                <span className="truncate">{c.country}</span>
                <Badge variant="secondary">{c.count}</Badge>
              </button>
            ))}
            {!analytics?.topCountries?.length && <p className="text-sm text-muted-foreground">No data yet</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4" /> Top Cities</CardTitle>
            <CardDescription>Listings by city, click to filter</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(analytics?.topCities?.length ? analytics.topCities : []).map((c) => (
              <button
                key={c.city}
                className="w-full flex items-center justify-between text-sm py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                onClick={() => goToSection("listings")}
                data-testid={`top-city-${c.city}`}
              >
                <span className="truncate">{c.city}</span>
                <Badge variant="secondary">{c.count}</Badge>
              </button>
            ))}
            {!analytics?.topCities?.length && <p className="text-sm text-muted-foreground">No data yet</p>}
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
                  <RechartsTooltip
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
            <CardDescription>Latest deals and user actions — click a row for details</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                {deals?.slice(0, 10).map((deal) => (
                  <div
                    key={deal.id}
                    className="flex items-start gap-3 cursor-pointer hover:bg-muted/50 rounded-md p-1.5 -m-1.5 transition-colors"
                    onClick={() => setSelectedDeal(deal)}
                    data-testid={`recent-activity-${deal.id}`}
                  >
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

      <Dialog open={draftsDialogOpen} onOpenChange={setDraftsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Open Drafts</DialogTitle>
            <DialogDescription>Listings users started but never published</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {listingDraftsLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : !listingDraftsData?.length ? (
              <p className="text-sm text-muted-foreground py-4">No open drafts.</p>
            ) : (
              <div className="space-y-2">
                {listingDraftsData.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-md border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{d.title || "Untitled draft"}</p>
                      <p className="text-xs text-muted-foreground truncate">{d.userFullName || d.userEmail || d.userId}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "-"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={abandonedDialogOpen} onOpenChange={setAbandonedDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Abandoned Engagement</DialogTitle>
            <DialogDescription>Users who saved or messaged on a listing 48h+ ago and never opened a deal</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {abandonedEngagementLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : !abandonedEngagementData?.length ? (
              <p className="text-sm text-muted-foreground py-4">No abandoned engagement.</p>
            ) : (
              <div className="space-y-2">
                {abandonedEngagementData.map((e, i) => (
                  <div key={`${e.userId}-${i}`} className="flex items-center justify-between gap-3 p-3 rounded-md border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.userFullName || e.userEmail || e.userId}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {e.eventType === "saved" ? "Saved" : "Messaged about"} {e.listingTitle || "a listing"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : "-"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );

  const handleExportCSV = () => {
    window.open("/api/admin/users/export.csv", "_blank");
    toast({ title: "Exporting", description: "CSV download started" });
  };

  const renderUsers = () => {
    const bannedCount = (users ?? []).filter(u => u.isBanned).length;
    const pendingCount = (users ?? []).filter(u => (u.kycStatus === "PENDING" || u.kybStatus === "PENDING") && !u.isBanned).length;
    const unverifiedCount = (users ?? []).filter(u => !u.isVerified && !u.isBanned && u.kycStatus !== "PENDING" && u.kybStatus !== "PENDING").length;
    return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Users Management</h2>
          <p className="text-muted-foreground">
            Manage registered users and verification status
            {filteredUsers && users && filteredUsers.length !== users.length && (
              <span className="ml-2 text-xs font-medium text-primary">Showing {filteredUsers.length.toLocaleString()} of {users.length.toLocaleString()}</span>
            )}
            {filteredUsers && users && filteredUsers.length === users.length && users.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">{users.length.toLocaleString()} total</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
            <SelectTrigger className="w-[170px]" data-testid="select-user-status-filter">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="banned">Banned {bannedCount > 0 && `(${bannedCount})`}</SelectItem>
              <SelectItem value="pending">Pending Verification {pendingCount > 0 && `(${pendingCount})`}</SelectItem>
              <SelectItem value="unverified">Unverified {unverifiedCount > 0 && `(${unverifiedCount})`}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={userAccountTypeFilter} onValueChange={setUserAccountTypeFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-user-account-type-filter">
              <SelectValue placeholder="Account type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
              <SelectItem value="business">Business</SelectItem>
            </SelectContent>
          </Select>
          {availableUserCountries.length > 0 && (
            <Select value={userCountryFilter} onValueChange={setUserCountryFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-user-country-filter">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {availableUserCountries.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {renderDateRangeFilter()}
          <Select value={userSortBy} onValueChange={setUserSortBy}>
            <SelectTrigger className="w-[140px]" data-testid="select-user-sort">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest First</SelectItem>
              <SelectItem value="date_asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>
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
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCSV} data-testid="button-export-csv">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setCreateUserDialog(d => ({ ...d, open: true }))} data-testid="button-create-user">
            <UserPlus className="h-4 w-4" />
            Create User
          </Button>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createUserDialog.open} onOpenChange={(open) => setCreateUserDialog(d => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>Manually create a user account. The user can log in immediately with these credentials.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Full Name *</Label>
                <Input value={createUserDialog.fullName} onChange={e => setCreateUserDialog(d => ({ ...d, fullName: e.target.value }))} placeholder="Jane Doe" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Email *</Label>
                <Input type="email" value={createUserDialog.email} onChange={e => setCreateUserDialog(d => ({ ...d, email: e.target.value }))} placeholder="jane@example.com" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Password *</Label>
                <Input type="password" value={createUserDialog.password} onChange={e => setCreateUserDialog(d => ({ ...d, password: e.target.value }))} placeholder="Min 8 characters" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Phone (optional)</Label>
                <Input value={createUserDialog.phone} onChange={e => setCreateUserDialog(d => ({ ...d, phone: e.target.value }))} placeholder="+971..." className="mt-1" />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={createUserDialog.role} onValueChange={v => setCreateUserDialog(d => ({ ...d, role: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Account Type</Label>
                <Select value={createUserDialog.accountType} onValueChange={v => setCreateUserDialog(d => ({ ...d, accountType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="cu-verified" checked={createUserDialog.isVerified} onChange={e => setCreateUserDialog(d => ({ ...d, isVerified: e.target.checked }))} className="h-4 w-4" />
                <Label htmlFor="cu-verified" className="font-normal cursor-pointer">Mark as verified immediately</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUserDialog(d => ({ ...d, open: false }))}>Cancel</Button>
            <Button
              onClick={() => createUserMutation.mutate(createUserDialog)}
              disabled={!createUserDialog.fullName || !createUserDialog.email || !createUserDialog.password || createUserMutation.isPending}
            >
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedUserIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-3 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
          <span className="text-sm font-medium">{selectedUserIds.size} user{selectedUserIds.size !== 1 ? "s" : ""} selected</span>
          <div className="flex items-center gap-2 ml-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => bulkUserMutation.mutate({ ids: Array.from(selectedUserIds), action: "ban" })} disabled={bulkUserMutation.isPending}>
              <Ban className="h-3.5 w-3.5 mr-1.5" />Ban
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUserMutation.mutate({ ids: Array.from(selectedUserIds), action: "unban" })} disabled={bulkUserMutation.isPending}>
              <UserCheck className="h-3.5 w-3.5 mr-1.5" />Unban
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setActiveSection("email"); toast({ title: `${selectedUserIds.size} users selected`, description: "Use the broadcast tool to email this group. Apply your filters there to match the same audience." }); }}>
              <Mail className="h-3.5 w-3.5" />Email {selectedUserIds.size}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${selectedUserIds.size} user(s) permanently? This cannot be undone.`)) bulkUserMutation.mutate({ ids: Array.from(selectedUserIds), action: "delete" }); }} disabled={bulkUserMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedUserIds(new Set())}>
            <X className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        </div>
      )}
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredUsers && filteredUsers.length > 0 && filteredUsers.every(u => selectedUserIds.has(u.id)) ? true : filteredUsers?.some(u => selectedUserIds.has(u.id)) ? "indeterminate" : false}
                      onCheckedChange={() => toggleAll(filteredUsers?.map(u => u.id) ?? [], setSelectedUserIds)}
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.map((u) => (
                  <TableRow key={u.id} className={`${u.isBanned ? "opacity-50" : ""} ${selectedUserIds.has(u.id) ? "bg-primary/5" : ""} cursor-pointer`} onClick={() => setSelectedUserId(u.id)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedUserIds.has(u.id)} onCheckedChange={() => toggleId(u.id, setSelectedUserIds)} />
                    </TableCell>
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
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={u.role === "admin" || u.role === "super_admin" ? "destructive" : "secondary"}>
                          {u.role === "super_admin" ? "Super Admin" : u.role === "admin" ? "Admin" : "User"}
                        </Badge>
                        {u.isAdmin && (
                          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 dark:border-amber-700">
                            <Crown className="h-3 w-3" />
                            Panel
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.isBanned ? (
                          <Badge variant="destructive" className="gap-1">
                            <Ban className="h-3 w-3" />
                            Banned
                          </Badge>
                        ) : isUserVerified(u.kycStatus, u.kybStatus, (u as any).phoneVerified, u.isVerified) ? (
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
                    <TableCell>
                      {(u as any).emailVerified && (u as any).phoneVerified ? (
                        <Badge variant="outline" className="text-green-600 gap-1"><CheckCircle className="h-3 w-3" />Done (2/2)</Badge>
                      ) : (u as any).emailVerified || (u as any).phoneVerified ? (
                        <Badge variant="secondary">1/2 — {(u as any).emailVerified ? "WhatsApp pending" : "Email pending"}</Badge>
                      ) : (
                        <Badge variant="secondary">0/2 — not started</Badge>
                      )}
                    </TableCell>
                    <TableCell>{u.location || "-"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} data-testid={`button-user-actions-${u.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedUserId(u.id); }} data-testid={`button-view-user-${u.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); verifyUserMutation.mutate({ userId: u.id, verified: !u.isVerified }); }}
                            data-testid={`button-verify-user-${u.id}`}
                          >
                            {u.isVerified ? (
                              <><ShieldX className="h-4 w-4 mr-2" />Remove Verification</>
                            ) : (
                              <><UserCheck className="h-4 w-4 mr-2" />Verify User</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              const isCurrentlyAdmin = u.isAdmin || u.role === "admin" || u.role === "super_admin";
                              setAdminRoleDialog({ open: true, user: u, action: isCurrentlyAdmin ? "demote" : "promote" });
                            }}
                            disabled={u.id === user?.id}
                            data-testid={`button-toggle-admin-${u.id}`}
                          >
                            <Crown className="h-4 w-4 mr-2" />
                            {(u.isAdmin || u.role === "admin" || u.role === "super_admin") ? "Remove Admin Access" : "Grant Admin Access"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled className="text-xs text-muted-foreground font-medium opacity-100 cursor-default">
                            <BadgeCheck className="h-4 w-4 mr-2" />
                            Set Verification Tier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); verificationTierMutation.mutate({ userId: u.id, tier: "basic" }); }} data-testid={`button-tier-basic-${u.id}`}>
                            <span className="ml-6">Basic {!u.isVerified && u.kybStatus !== "APPROVED" ? "✓" : ""}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); verificationTierMutation.mutate({ userId: u.id, tier: "verified" }); }} data-testid={`button-tier-verified-${u.id}`}>
                            <span className="ml-6">Verified {u.isVerified && u.kybStatus !== "APPROVED" ? "✓" : ""}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); verificationTierMutation.mutate({ userId: u.id, tier: "business" }); }} data-testid={`button-tier-business-${u.id}`}>
                            <span className="ml-6">Business {u.kybStatus === "APPROVED" ? "✓" : ""}</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); resetPasswordMutation.mutate(u.id); }} data-testid={`button-reset-password-${u.id}`}>
                            <KeyRound className="h-4 w-4 mr-2" />
                            Send Password Reset
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEmailDialog({ open: true, user: u, subject: "", body: "" }); }} data-testid={`button-send-email-${u.id}`}>
                            <Mail className="h-4 w-4 mr-2" />
                            Send Email
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
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
                          <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteDialog({ open: true, user: u }); }} data-testid={`button-delete-user-${u.id}`}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Account (PDPL)
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
  );};

  const renderListings = () => {
    const approvedCount = (listings ?? []).filter(l => l.moderationStatus === "approved").length;
    const pendingListCount = (listings ?? []).filter(l => l.moderationStatus === "pending").length;
    const flaggedCount = (listings ?? []).filter(l => l.moderationStatus === "flagged" || l.valueFlagged || l.imageFlagged).length;
    const rejectedCount = (listings ?? []).filter(l => l.moderationStatus === "rejected").length;
    return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Listings Management</h2>
          <p className="text-muted-foreground">
            View and moderate all platform listings
            {filteredListings && listings && filteredListings.length !== listings.length && (
              <span className="ml-2 text-xs font-medium text-primary">Showing {filteredListings.length.toLocaleString()} of {listings.length.toLocaleString()}</span>
            )}
            {filteredListings && listings && filteredListings.length === listings.length && listings.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">{listings.length.toLocaleString()} total</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={listingStatusFilter} onValueChange={setListingStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-listing-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="approved">Approved {approvedCount > 0 && `(${approvedCount})`}</SelectItem>
              <SelectItem value="pending">Pending {pendingListCount > 0 && `(${pendingListCount})`}</SelectItem>
              <SelectItem value="flagged">Flagged {flaggedCount > 0 && `(${flaggedCount})`}</SelectItem>
              <SelectItem value="rejected">Rejected {rejectedCount > 0 && `(${rejectedCount})`}</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="featured">Featured</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
            </SelectContent>
          </Select>
          <Select value={listingCategoryFilter} onValueChange={setListingCategoryFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-listing-category-filter">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableCities.length > 0 && (
            <Select value={listingCityFilter} onValueChange={setListingCityFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-listing-city-filter">
                <SelectValue placeholder="City" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {availableCities.map(city => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={listingValueFilter} onValueChange={setListingValueFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-listing-value-filter">
              <SelectValue placeholder="Value range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Values</SelectItem>
              <SelectItem value="under1000">Under 1,000 AED</SelectItem>
              <SelectItem value="1000to5000">1,000–5,000 AED</SelectItem>
              <SelectItem value="5000to20000">5,000–20,000 AED</SelectItem>
              <SelectItem value="over20000">Over 20,000 AED</SelectItem>
            </SelectContent>
          </Select>
          {availableListingCountries.length > 0 && (
            <Select value={listingCountryFilter} onValueChange={setListingCountryFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-listing-country-filter">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {availableListingCountries.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {renderDateRangeFilter()}
          <Select value={listingSortBy} onValueChange={setListingSortBy}>
            <SelectTrigger className="w-[160px]" data-testid="select-listing-sort">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest First</SelectItem>
              <SelectItem value="date_asc">Oldest First</SelectItem>
              <SelectItem value="value_desc">Highest Value</SelectItem>
              <SelectItem value="value_asc">Lowest Value</SelectItem>
              <SelectItem value="proposals_desc">Most Proposals</SelectItem>
              <SelectItem value="views_desc">Most Views</SelectItem>
            </SelectContent>
          </Select>
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
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { const params = new URLSearchParams(); if (listingStatusFilter !== "all") params.set("status", listingStatusFilter); if (listingCategoryFilter !== "all") params.set("category", listingCategoryFilter); window.open(`${API_BASE}/api/admin/listings/export.csv${params.toString() ? `?${params}` : ""}`, "_blank"); toast({ title: "Exporting", description: "Listings CSV download started" }); }} data-testid="button-export-listings-csv">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {selectedListingIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">{selectedListingIds.size} selected</span>
          <div className="flex items-center gap-2 ml-2">
            <Button size="sm" variant="outline" onClick={() => bulkListingMutation.mutate({ ids: Array.from(selectedListingIds), action: "approve" })} disabled={bulkListingMutation.isPending}>
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkListingMutation.mutate({ ids: Array.from(selectedListingIds), action: "reject" })} disabled={bulkListingMutation.isPending}>
              <XCircle className="h-3.5 w-3.5 mr-1.5" />Reject
            </Button>
            <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Remove ${selectedListingIds.size} listing(s)? This cannot be undone.`)) bulkListingMutation.mutate({ ids: Array.from(selectedListingIds), action: "delete" }); }} disabled={bulkListingMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedListingIds(new Set())}>
            <X className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        </div>
      )}
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredListings && filteredListings.length > 0 && filteredListings.every(l => selectedListingIds.has(l.id)) ? true : filteredListings?.some(l => selectedListingIds.has(l.id)) ? "indeterminate" : false}
                      onCheckedChange={() => toggleAll(filteredListings?.map(l => l.id) ?? [], setSelectedListingIds)}
                    />
                  </TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Value (AED)</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Moderation</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredListings?.map((l) => (
                  <TableRow key={l.id} className={`cursor-pointer ${selectedListingIds.has(l.id) ? "bg-primary/5" : ""}`} onClick={() => setSelectedListingId(l.id)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedListingIds.has(l.id)} onCheckedChange={() => toggleId(l.id, setSelectedListingIds)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={l.type === "offer" ? "default" : "secondary"} className="shrink-0">
                            {l.type === "offer" ? "Offer" : "Request"}
                          </Badge>
                          <span className="font-medium line-clamp-1">{l.title}</span>
                          {l.isFeatured && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {l.valueFlagged && (
                            <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/60 text-amber-600">
                              <AlertTriangle className="h-2.5 w-2.5" />Value flagged
                            </Badge>
                          )}
                          {l.imageFlagged && (
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
                        <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
                      ))}
                    </TableCell>
                    <TableCell>
                      {l.isActive ? (
                        <Badge variant="outline" className="text-green-600">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant={
                              l.moderationStatus === "approved" ? "default" :
                              l.moderationStatus === "rejected" ? "destructive" :
                              l.moderationStatus === "flagged" ? "outline" : "secondary"
                            } className={`cursor-default ${l.moderationStatus === "flagged" ? "text-amber-600 border-amber-500/60" : ""}`}>
                              {l.moderationStatus || "pending"}
                            </Badge>
                          </TooltipTrigger>
                          {(l as any).moderationReason && (
                            <TooltipContent className="max-w-xs text-xs" side="top">
                              <p className="font-medium mb-0.5">AI Moderation Reason:</p>
                              <p>{(l as any).moderationReason}</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.viewCount || 0}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} data-testid={`button-listing-actions-${l.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedListingId(l.id); }} data-testid={`button-view-listing-${l.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/listings/${l.id}`} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                              <Eye className="h-4 w-4 mr-2" />
                              View on Site
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {l.moderationStatus !== "approved" && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); approveListingMutation.mutate(l.id); }} data-testid={`button-approve-listing-${l.id}`}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRejectDialog({ open: true, listingId: l.id, reason: "" }); }} data-testid={`button-reject-listing-${l.id}`}>
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditListingDialog({ open: true, listing: l, categories: (l.categories as string[]) || [], retailValue: String(l.retailValue) }); }}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit Category/Value
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); featureListingMutation.mutate({ listingId: l.id, featured: !l.isFeatured }); }} data-testid={`button-feature-listing-${l.id}`}>
                            <Star className="h-4 w-4 mr-2" />
                            {l.isFeatured ? "Remove Featured" : "Mark as Featured"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteListingMutation.mutate(l.id); }}
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
  );};

  const renderDeals = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Deals Management</h2>
          <p className="text-muted-foreground">
            View all deals and their details
            {filteredDeals && deals && filteredDeals.length !== deals.length && (
              <span className="ml-2 text-xs font-medium text-primary">Showing {filteredDeals.length.toLocaleString()} of {deals.length.toLocaleString()}</span>
            )}
            {filteredDeals && deals && filteredDeals.length === deals.length && deals.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">{deals.length.toLocaleString()} total</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={dealStateFilter} onValueChange={setDealStateFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-deal-state-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active (In Progress)</SelectItem>
              <SelectItem value="proposed">Proposed</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="delivery_proof">Delivery Proof</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          {renderDateRangeFilter()}
          <Select value={dealSortBy} onValueChange={setDealSortBy}>
            <SelectTrigger className="w-[150px]" data-testid="select-deal-sort">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest First</SelectItem>
              <SelectItem value="date_asc">Oldest First</SelectItem>
              <SelectItem value="value_desc">Highest Value</SelectItem>
              <SelectItem value="value_asc">Lowest Value</SelectItem>
            </SelectContent>
          </Select>
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
          <div className="flex items-center gap-2">
            <Select value={dealsExportState} onValueChange={setDealsExportState}>
              <SelectTrigger className="w-32 h-9 text-xs" data-testid="select-deals-export-state"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="proposed">Proposed</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={dealsExportFrom} onChange={(e) => setDealsExportFrom(e.target.value)} className="w-36 h-9 text-xs" placeholder="From" data-testid="input-deals-export-from" />
            <Input type="date" value={dealsExportTo} onChange={(e) => setDealsExportTo(e.target.value)} className="w-36 h-9 text-xs" placeholder="To" data-testid="input-deals-export-to" />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => { const params = new URLSearchParams(); params.set("state", dealsExportState); if (dealsExportFrom) params.set("from", dealsExportFrom); if (dealsExportTo) params.set("to", dealsExportTo); window.open(`/api/admin/deals/export.csv?${params}`, "_blank"); toast({ title: "Exporting", description: "Deals CSV download started" }); }} data-testid="button-export-deals-csv">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {selectedDealIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">{selectedDealIds.size} selected</span>
          <div className="flex items-center gap-2 ml-2">
            <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${selectedDealIds.size} deal(s) permanently?`)) bulkDealMutation.mutate(Array.from(selectedDealIds)); }} disabled={bulkDealMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedDealIds(new Set())}>
            <X className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        </div>
      )}
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredDeals && filteredDeals.length > 0 && filteredDeals.every(d => selectedDealIds.has(d.id)) ? true : filteredDeals?.some(d => selectedDealIds.has(d.id)) ? "indeterminate" : false}
                      onCheckedChange={() => toggleAll(filteredDeals?.map(d => d.id) ?? [], setSelectedDealIds)}
                    />
                  </TableHead>
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
                    className={`cursor-pointer hover-elevate ${selectedDealIds.has(d.id) ? "bg-primary/5" : ""}`}
                    onClick={() => setSelectedDeal(d)}
                    data-testid={`row-deal-${d.id}`}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedDealIds.has(d.id)} onCheckedChange={() => toggleId(d.id, setSelectedDealIds)} />
                    </TableCell>
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

  const filteredDisputes = disputesData.filter(d => {
    if (disputeStatusFilter !== "all" && d.status !== disputeStatusFilter) return false;
    if (!matchesDateRange(d.createdAt, dateRangeFilter, customDateFrom, customDateTo)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return d.subject.toLowerCase().includes(q) ||
        d.partyA?.fullName?.toLowerCase().includes(q) ||
        d.partyB?.fullName?.toLowerCase().includes(q);
    }
    return true;
  });

  const renderDisputes = () => {
    const openCount = disputesData.filter(d => d.status === "open").length;
    const mediationCount = disputesData.filter(d => d.status === "in_mediation").length;
    return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Disputes</h2>
          <p className="text-muted-foreground">
            Manage disputes between parties
            {filteredDisputes.length !== disputesData.length && (
              <span className="ml-2 text-xs font-medium text-primary">Showing {filteredDisputes.length} of {disputesData.length}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={disputeStatusFilter} onValueChange={setDisputeStatusFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-dispute-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open {openCount > 0 && `(${openCount})`}</SelectItem>
              <SelectItem value="in_mediation">In Mediation {mediationCount > 0 && `(${mediationCount})`}</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          {renderDateRangeFilter()}
          <Button onClick={() => setCreateDisputeDialog({ ...createDisputeDialog, open: true })} data-testid="button-create-dispute">
            Create Dispute
          </Button>
        </div>
      </div>

      {selectedDisputeIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">{selectedDisputeIds.size} selected</span>
          <div className="flex items-center gap-2 ml-2">
            <Button size="sm" variant="outline" onClick={() => bulkDisputeMutation.mutate({ ids: Array.from(selectedDisputeIds), action: "resolve" })} disabled={bulkDisputeMutation.isPending}>
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />Resolve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${selectedDisputeIds.size} dispute(s) permanently?`)) bulkDisputeMutation.mutate({ ids: Array.from(selectedDisputeIds), action: "delete" }); }} disabled={bulkDisputeMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedDisputeIds(new Set())}>
            <X className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          {disputesLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : filteredDisputes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No disputes found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredDisputes.length > 0 && filteredDisputes.every(d => selectedDisputeIds.has(d.id)) ? true : filteredDisputes.some(d => selectedDisputeIds.has(d.id)) ? "indeterminate" : false}
                      onCheckedChange={() => toggleAll(filteredDisputes.map(d => d.id), setSelectedDisputeIds)}
                    />
                  </TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Party A</TableHead>
                  <TableHead>Party B</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDisputes.map((d) => (
                  <TableRow key={d.id} className={selectedDisputeIds.has(d.id) ? "bg-primary/5" : ""} data-testid={`row-dispute-${d.id}`}>
                    <TableCell>
                      <Checkbox checked={selectedDisputeIds.has(d.id)} onCheckedChange={() => toggleId(d.id, setSelectedDisputeIds)} />
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{d.subject}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-xs">{d.partyA?.fullName?.charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{d.partyA?.fullName || "Unknown"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-xs">{d.partyB?.fullName?.charAt(0) || "?"}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{d.partyB?.fullName || "Unknown"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        d.status === "resolved" ? "default" :
                        d.status === "in_mediation" ? "secondary" :
                        "outline"
                      }>
                        {d.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedDispute(d)} data-testid={`button-view-dispute-${d.id}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {d.status === "open" && (
                          <Button variant="outline" size="sm" onClick={() => disputeEscalateMutation.mutate(d.id)} data-testid={`button-escalate-dispute-${d.id}`}>
                            Escalate
                          </Button>
                        )}
                        {d.status !== "resolved" && (
                          <Button variant="outline" size="sm" onClick={() => setDisputeDecisionDialog({ open: true, dispute: d, decision: "", reasoning: "", outcome: "" })} data-testid={`button-decide-dispute-${d.id}`}>
                            Decide
                          </Button>
                        )}
                        {d.status !== "in_mediation" && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm("Delete this dispute permanently?")) disputeDeleteMutation.mutate(d.id); }} data-testid={`button-delete-dispute-${d.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );};

  const renderEmail = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Email Management</h2>
        <p className="text-muted-foreground">Broadcast emails and delivery tracking</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="stat-emails-total">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">{emailStats?.total || 0}</p>
            <p className="text-sm text-muted-foreground">Total Send Attempts</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-emails-delivered">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-green-500">{emailStats?.sent || 0}</p>
            <p className="text-sm text-muted-foreground">Accepted by Provider</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-emails-failed">
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-destructive">{emailStats?.failed || 0}</p>
            <p className="text-sm text-muted-foreground">Failed to Send</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Broadcast Email
          </CardTitle>
          <CardDescription>Send bulk emails to filtered user groups</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Audience */}
          <div className="space-y-2">
            <Label>Audience</Label>
            <Select value={broadcastAudience} onValueChange={(v) => { setBroadcastAudience(v); }} data-testid="select-broadcast-audience">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="users">Registered Users</SelectItem>
                <SelectItem value="waitlist-main">Waitlist — Main (confirmed, not yet registered)</SelectItem>
                <SelectItem value="waitlist-creators">Waitlist — Creators</SelectItem>
                <SelectItem value="waitlist-brand-collabs">Waitlist — Brand Collabs</SelectItem>
                <SelectItem value="waitlist-international">Waitlist — International</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {broadcastAudience === "waitlist-main" && (
            <p className="text-xs text-muted-foreground">
              This send also marks your beta as "launched" for the automated Waitlist Final Call reminder — only send this once you actually mean to announce launch.
            </p>
          )}

          {/* User-only filters */}
          {broadcastAudience === "users" && (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>City filter</Label>
                <Input placeholder="e.g. Dubai (leave empty for all)" value={broadcastCityFilter} onChange={(e) => setBroadcastCityFilter(e.target.value)} data-testid="input-broadcast-city" />
              </div>
              <div className="space-y-2">
                <Label>Account type</Label>
                <Select value={broadcastAccountType} onValueChange={setBroadcastAccountType}>
                  <SelectTrigger data-testid="select-broadcast-account-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Verification</Label>
                <Select value={broadcastVerification} onValueChange={setBroadcastVerification}>
                  <SelectTrigger data-testid="select-broadcast-verification"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="unverified">Unverified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Subject</Label>
            <Input placeholder="Email subject..." value={broadcastSubject} onChange={(e) => setBroadcastSubject(e.target.value)} data-testid="input-broadcast-subject" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Label>Body</Label>
                <button
                  type="button"
                  onClick={() => setBroadcastBodyMode((m) => m === "text" ? "html" : "text")}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${broadcastBodyMode === "html" ? "bg-bareter-teal/10 border-bareter-teal text-bareter-teal font-medium" : "border-muted-foreground/30 text-muted-foreground hover:text-foreground"}`}
                  data-testid="button-body-mode-toggle"
                >
                  {broadcastBodyMode === "html" ? "HTML" : "Text"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => setAiDraftOpen(true)}
                  data-testid="button-ai-draft-open"
                >
                  <Sparkles className="h-3 w-3 text-bareter-teal" />
                  Draft
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={async () => {
                    try {
                      const sampleVars = { name: "Sarah Al-Hassan", firstName: "Sarah", lastName: "Al-Hassan", email: "sarah@example.com", city: "Dubai", businessName: "Al-Hassan Trading", accountType: "business", appName: "Bareter", baseUrl: "https://bareter.com", signupUrl: "https://bareter.com/register", loginUrl: "https://bareter.com/login", browseUrl: "https://bareter.com/browse" };
                      const previewBody = broadcastBody || (broadcastBodyMode === "html" ? "<p>Hello, welcome to <strong>Bareter</strong>!</p>" : "Hello {{firstName}}, welcome to {{appName}}!");
                      const result = await previewMutation.mutateAsync({
                        body: previewBody,
                        recipientName: "Sarah Al-Hassan",
                        vars: sampleVars,
                        mode: broadcastBodyMode === "html" ? "html" : undefined,
                      });
                      setBroadcastPreviewHtml(result.html);
                      setBroadcastPreviewOpen(true);
                    } catch (err: unknown) {
                      toast({ title: "Preview failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
                    }
                  }}
                  disabled={previewMutation.isPending}
                  data-testid="button-broadcast-preview"
                >
                  <Eye className="h-3 w-3" />
                  {previewMutation.isPending ? "Loading…" : "Preview"}
                </button>
              </div>
            </div>
            <Textarea
              placeholder={broadcastBodyMode === "html" ? "Paste raw HTML here…" : "Email body... Use {{firstName}} for the recipient's name, e.g. 'Hi {{firstName}}, ...'"}
              rows={8}
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
              className={broadcastBodyMode === "html" ? "font-mono text-xs" : ""}
              data-testid="input-broadcast-body"
            />
            {/\{\{appName\}\}/.test(broadcastBody) && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                ⚠ Your email contains <code>{"{{appName}}"}</code> which inserts the platform name &ldquo;Bareter&rdquo; — not the recipient&apos;s name. Use <code>{"{{firstName}}"}</code> to personalise with each person&apos;s first name.
              </div>
            )}
            {broadcastBodyMode === "text" && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Recipient variables:</p>
                <div className="flex flex-wrap gap-1.5" data-testid="broadcast-variable-chips">
                  {[
                    { v: "{{greeting}}", hint: "Auto greeting: 'Hi Sarah,' or 'Hi there,'" },
                    { v: "{{firstName}}", hint: "First name only (e.g. Sarah)" },
                    { v: "{{name}}", hint: "Full name (e.g. Sarah Al-Hassan)" },
                    { v: "{{email}}", hint: "Recipient email address" },
                    { v: "{{signupUrl}}", hint: "Sign-up link" },
                    { v: "{{browseUrl}}", hint: "Browse listings link" },
                  ].map(({ v, hint }) => (
                    <button
                      key={v}
                      type="button"
                      title={hint}
                      onClick={() => setBroadcastBody((prev) => prev + v)}
                      className="text-xs font-mono bg-muted hover:bg-muted/80 border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`chip-var-${v.replace(/\{|\}/g, "")}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
            <Label className="text-xs text-muted-foreground">Test recipients (comma-separated — your account is always included)</Label>
            <Input
              placeholder="e.g. colleague@example.com, partner@company.ae"
              value={broadcastTestEmails}
              onChange={(e) => setBroadcastTestEmails(e.target.value)}
              className="text-sm"
              data-testid="input-broadcast-test-emails"
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setBroadcastJobId(null);
                  broadcastMutation.mutate({
                    subject: broadcastSubject,
                    body: broadcastBody,
                    filter: {
                      audience: broadcastAudience,
                      city: broadcastAudience === "users" ? (broadcastCityFilter || undefined) : undefined,
                      accountType: broadcastAudience === "users" ? broadcastAccountType : undefined,
                      verificationStatus: broadcastAudience === "users" ? broadcastVerification : undefined,
                      bodyMode: broadcastBodyMode === "html" ? "html" : undefined,
                    },
                  });
                }}
                disabled={!broadcastSubject || !broadcastBody || broadcastMutation.isPending || (!!broadcastJobId && broadcastJobStatus?.status !== "completed" && broadcastJobStatus?.status !== "failed")}
                className="gap-2"
                data-testid="button-send-broadcast"
              >
                {broadcastMutation.isPending ? "Queueing…" : <><Mail className="h-4 w-4" /> Send Broadcast</>}
              </Button>
              <Button
                variant="outline"
                onClick={() => broadcastTestMutation.mutate({ subject: broadcastSubject, body: broadcastBody, to: broadcastTestEmails || undefined, bodyMode: broadcastBodyMode === "html" ? "html" : undefined })}
                disabled={!broadcastSubject || !broadcastBody || broadcastTestMutation.isPending}
                className="gap-2"
                data-testid="button-send-test-broadcast"
              >
                {broadcastTestMutation.isPending ? "Sending…" : <><Mail className="h-4 w-4" /> Send test email</>}
              </Button>
            </div>
            {broadcastJobId && broadcastJobStatus && (
              <div className="rounded-md border px-4 py-3 text-sm space-y-1" data-testid="broadcast-job-status">
                <div className="flex items-center gap-2 font-medium">
                  {broadcastJobStatus.status === "completed" ? (
                    <span className="text-green-600">Broadcast complete</span>
                  ) : broadcastJobStatus.status === "failed" ? (
                    <span className="text-destructive">Broadcast failed</span>
                  ) : (
                    <span className="text-muted-foreground animate-pulse">
                      {broadcastJobStatus.status === "processing" ? "Sending…" : "Queued…"}
                    </span>
                  )}
                </div>
                {(broadcastJobStatus.status === "completed" || broadcastJobStatus.status === "processing") && (
                  <p className="text-muted-foreground">
                    {broadcastJobStatus.sent} sent · {broadcastJobStatus.failed} failed · {broadcastJobStatus.recipientCount} total
                  </p>
                )}
                <p className="text-xs text-muted-foreground font-mono">ID: {broadcastJobId}</p>
                {broadcastJobStatus.status === "completed" && broadcastJobStatus.failed > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resendFailedMutation.isPending}
                      onClick={() => broadcastJobId && resendFailedMutation.mutate(broadcastJobId)}
                      data-testid="button-resend-failed"
                    >
                      {resendFailedMutation.isPending ? "Resending…" : `Resend to ${broadcastJobStatus.failed} failed recipient${broadcastJobStatus.failed === 1 ? "" : "s"}`}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (!broadcastJobId) return;
                        loadEmailLogs(broadcastJobId);
                        document.querySelector('[data-testid="card-email-logs"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      data-testid="button-view-failures-in-logs"
                    >
                      View why it failed
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-broadcast-history">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Recent Broadcasts</CardTitle>
            <CardDescription>Past sends — resend to failed recipients even after a page refresh</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetchBroadcastHistory()} data-testid="button-refresh-broadcast-history">
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {!broadcastHistory ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Click Refresh to load past broadcasts</p>
          ) : broadcastHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No broadcasts sent yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Subject</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2 pr-3">Results</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {broadcastHistory.map((job) => (
                    <tr key={job.id} className="hover:bg-muted/30">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">{job.createdAt ? new Date(job.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td className="py-1.5 pr-3 max-w-[220px] truncate" title={job.subject}>
                        {job.subject}
                        {job.filter?.retryOf && <span className="ml-1.5 text-[10px] text-muted-foreground">(retry)</span>}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${job.status === "completed" ? "bg-green-100 text-green-700" : job.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{job.sent} sent · {job.failed} failed · {job.recipientCount} total</td>
                      <td className="py-1.5">
                        <div className="flex gap-1.5">
                          {job.status === "completed" && job.failed > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              disabled={resendFailedMutation.isPending}
                              onClick={() => resendFailedMutation.mutate(job.id)}
                              data-testid={`button-resend-failed-${job.id}`}
                            >
                              Resend failed
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => {
                              loadEmailLogs(job.id);
                              document.querySelector('[data-testid="card-email-logs"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            data-testid={`button-view-logs-${job.id}`}
                          >
                            View logs
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Email Templates
          </CardTitle>
          <CardDescription>View and edit email templates used for system notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {([
              { key: "email_template_welcome", label: "Welcome / Onboarding", vars: ["{{fullName}}", "{{email}}", "{{appName}}"], sampleVars: { fullName: "Sarah Al-Hassan", email: "sarah@example.com", appName: "Bareter" } },
              { key: "email_template_password_reset", label: "Password Reset", vars: ["{{fullName}}", "{{email}}", "{{actionUrl}}", "{{resetUrl}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { fullName: "Sarah Al-Hassan", email: "sarah@example.com", resetUrl: "https://bareter.com/reset-password?token=sample123", actionUrl: "https://bareter.com/reset-password?token=sample123", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_deal_completed", label: "Deal Completed", vars: ["{{greeting}}", "{{counterpartyName}}", "{{dealUrl}}", "{{appName}}"], sampleVars: { greeting: "Hi Sarah,", counterpartyName: "Ahmed Al-Mansouri", dealUrl: "https://bareter.com/deals/sample-123", appName: "Bareter" } },
              { key: "email_template_listing_rejected", label: "Listing Rejected", vars: ["{{greeting}}", "{{listingTitle}}", "{{reason}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", listingTitle: "Premium Photography Package", reason: "The listing does not meet our quality standards.", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_listing_approved", label: "Listing Approved", vars: ["{{greeting}}", "{{listingTitle}}", "{{listingUrl}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", listingTitle: "Premium Photography Package", listingUrl: "https://bareter.com/listings/sample-123", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_new_proposal", label: "New Proposal Received", vars: ["{{greeting}}", "{{senderName}}", "{{listingTitle}}", "{{proposalUrl}}", "{{appName}}"], sampleVars: { greeting: "Hi Sarah,", senderName: "Ahmed Al-Mansouri", listingTitle: "Premium Photography Package", proposalUrl: "https://bareter.com/deals/sample-123", appName: "Bareter" } },
              { key: "email_template_proposal_accepted", label: "Proposal Accepted", vars: ["{{greeting}}", "{{counterpartyName}}", "{{listingTitle}}", "{{dealUrl}}", "{{appName}}"], sampleVars: { greeting: "Hi Ahmed,", counterpartyName: "Sarah Al-Hassan", listingTitle: "Premium Photography Package", dealUrl: "https://bareter.com/deals/sample-123", appName: "Bareter" } },
              { key: "email_template_verification_approved", label: "Verification Approved", vars: ["{{greeting}}", "{{fullName}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", fullName: "Sarah Al-Hassan", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_re_engagement", label: "Re-engagement / Come Back", vars: ["{{greeting}}", "{{fullName}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", fullName: "Sarah Al-Hassan", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_match_found", label: "Match Found", vars: ["{{greeting}}", "{{listingTitle}}", "{{matchedListingTitle}}", "{{matchScore}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", listingTitle: "Premium Photography Package", matchedListingTitle: "Office Space in DIFC", matchScore: "87", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_new_message", label: "New Message (Deal Chat)", vars: ["{{greeting}}", "{{senderName}}", "{{listingTitle}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", senderName: "Ahmed Al-Mansouri", listingTitle: "Premium Photography Package", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_proposal_received", label: "Proposal Received (custom override)", vars: ["{{greeting}}", "{{proposerName}}", "{{listingTitle}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", proposerName: "Ahmed Al-Mansouri", listingTitle: "Premium Photography Package", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_contract_ready", label: "Contract Ready to Sign", vars: ["{{greeting}}", "{{listingTitle}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", listingTitle: "Premium Photography Package", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_proposal_declined", label: "Proposal Declined", vars: ["{{greeting}}", "{{listingTitle}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Ahmed,", listingTitle: "Premium Photography Package", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_signup_unverified", label: "Signup Nudge — Unverified Email (24h)", vars: ["{{greeting}}", "{{fullName}}", "{{appName}}", "{{baseUrl}}", "{{verifyUrl}}"], sampleVars: { greeting: "Hi Sarah,", fullName: "Sarah Al-Hassan", appName: "Bareter", baseUrl: "https://bareter.com", verifyUrl: "https://bareter.com/api/auth/verify-email?token=sample123" } },
              { key: "email_template_signup_no_listing", label: "Signup Nudge — No Listing Yet (24h)", vars: ["{{greeting}}", "{{fullName}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", fullName: "Sarah Al-Hassan", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_listing_no_proposal", label: "Listing Nudge — No Proposal Yet (72h)", vars: ["{{greeting}}", "{{fullName}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", fullName: "Sarah Al-Hassan", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_waitlist_final_call", label: "Waitlist Final Call (beta, never converted)", vars: ["{{greeting}}", "{{name}}", "{{appName}}", "{{baseUrl}}", "{{registerUrl}}"], sampleVars: { greeting: "Hi there,", name: "there", appName: "Bareter", baseUrl: "https://bareter.com", registerUrl: "https://bareter.com/register?invite=SAMPLE123" } },
            ] as const).map(({ key, label, vars, sampleVars }) => (
              <div key={key} className="border rounded-lg p-4" data-testid={`template-${key}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{label}</span>
                  {editingTemplateKey === key ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2"
                        onClick={async () => {
                          const result = await previewMutation.mutateAsync({ body: editingTemplateValue, vars: sampleVars, mode: "template" });
                          setTemplatePreviewHtml(result.html);
                          setTemplatePreviewOpen(true);
                        }}
                        disabled={!editingTemplateValue || previewMutation.isPending}
                        data-testid={`button-preview-template-${key}`}
                      >
                        <Eye className="h-3 w-3" />
                        {previewMutation.isPending ? "…" : "Preview"}
                      </button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingTemplateKey(null); setEditingTemplateValue(""); }} data-testid={`button-cancel-template-${key}`}>Cancel</Button>
                      <Button size="sm" onClick={() => saveTemplateMutation.mutate({ key, value: editingTemplateValue })} disabled={saveTemplateMutation.isPending} data-testid={`button-save-template-${key}`}>
                        {saveTemplateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-xs text-muted-foreground"
                        disabled={sendingTestKey === key || sendTestEmailMutation.isPending}
                        onClick={() => { setSendingTestKey(key); sendTestEmailMutation.mutate(key); }}
                        data-testid={`button-test-template-${key}`}
                      >
                        {sendingTestKey === key ? "Sending…" : "Send Test"}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => { setEditingTemplateKey(key); setEditingTemplateValue(emailTemplates?.[key] || ""); }} data-testid={`button-edit-template-${key}`}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                    </div>
                  )}
                </div>
                {editingTemplateKey === key ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={8}
                      value={editingTemplateValue}
                      onChange={(e) => setEditingTemplateValue(e.target.value)}
                      placeholder="Enter template HTML content..."
                      data-testid={`textarea-template-${key}`}
                    />
                    <div className="flex flex-wrap gap-1.5" data-testid={`template-vars-${key}`}>
                      {[...vars, "{{actionUrl}}"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setEditingTemplateValue((prev) => prev + v)}
                          className="text-xs font-mono bg-muted hover:bg-muted/80 border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground transition-colors"
                          data-testid={`chip-template-var-${v.replace(/\{|\}/g, "")}`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3 min-h-[60px]">
                    {emailTemplates?.[key] ? (
                      <span className="text-foreground whitespace-pre-wrap">{emailTemplates[key].substring(0, 200)}{emailTemplates[key].length > 200 ? "..." : ""}</span>
                    ) : (
                      <span className="italic">No custom template set — using system default</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Broadcast preview dialog */}
      <Dialog open={broadcastPreviewOpen} onOpenChange={setBroadcastPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-broadcast-preview">
          <DialogHeader>
            <DialogTitle>Broadcast Preview</DialogTitle>
            <DialogDescription>Rendered with sample recipient: Sarah Al-Hassan · sarah@example.com · Dubai</DialogDescription>
          </DialogHeader>
          {broadcastPreviewHtml && (
            <iframe
              srcDoc={broadcastPreviewHtml}
              className="w-full border rounded-md"
              style={{ height: "420px" }}
              sandbox="allow-same-origin"
              title="Email preview"
              data-testid="iframe-broadcast-preview"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* AI Draft dialog */}
      <Dialog open={aiDraftOpen} onOpenChange={setAiDraftOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-ai-draft">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-bareter-teal" />
              AI Email Draft
            </DialogTitle>
            <DialogDescription>
              Describe what this email is about and the Marketing Agent will draft the subject and body for you. You can edit it before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              placeholder="e.g. Welcome new users joining this week and invite them to post their first listing. Mention the cashless barter concept and give them a reason to act now."
              rows={4}
              value={aiDraftPrompt}
              onChange={(e) => setAiDraftPrompt(e.target.value)}
              data-testid="textarea-ai-draft-prompt"
            />
            <div className="flex flex-wrap gap-1.5">
              {[
                "Launch announcement for new users",
                "Re-engage inactive members",
                "Promote trending listings this week",
                "Invite users to complete verification",
                "Ramadan special — barter more, spend less",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setAiDraftPrompt(suggestion)}
                  className="text-xs bg-muted hover:bg-muted/80 border rounded-full px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`chip-ai-suggestion-${suggestion.slice(0, 20).replace(/\s/g, "-")}`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAiDraftOpen(false); setAiDraftPrompt(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => aiDraftMutation.mutate(aiDraftPrompt)}
              disabled={!aiDraftPrompt.trim() || aiDraftMutation.isPending}
              className="gap-2"
              data-testid="button-ai-draft-generate"
            >
              {aiDraftMutation.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Drafting…</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5" /> Generate Draft</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template preview dialog */}
      <Dialog open={templatePreviewOpen} onOpenChange={setTemplatePreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-template-preview">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>Rendered with sample variable values</DialogDescription>
          </DialogHeader>
          {templatePreviewHtml && (
            <iframe
              srcDoc={templatePreviewHtml}
              className="w-full border rounded-md"
              style={{ height: "420px" }}
              sandbox="allow-same-origin"
              title="Template preview"
              data-testid="iframe-template-preview"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Email Logs */}
      <Card data-testid="card-email-logs">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Email Logs</CardTitle>
            <CardDescription>
              {logsBroadcastFilter
                ? <>Showing logs for broadcast <span className="font-mono">{logsBroadcastFilter}</span></>
                : "Every transactional, test, and broadcast email sent — success and failures"}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {logsBroadcastFilter && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => loadEmailLogs(null)}
                data-testid="button-clear-logs-filter"
              >
                Clear filter
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => refetchEmailLogs()} data-testid="button-refresh-email-logs">
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!emailLogsData ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Click Refresh to load logs</p>
          ) : emailLogsData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No email logs yet — send a test to see entries here</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3">Time</th>
                    <th className="pb-2 pr-3">Template</th>
                    <th className="pb-2 pr-3">To</th>
                    <th className="pb-2 pr-3">Subject</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {emailLogsData.slice(0, 100).map((log: any) => (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">{log.createdAt ? new Date(log.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td className="py-1.5 pr-3 font-mono">{log.templateKey ? log.templateKey.replace("email_template_", "") : "—"}</td>
                      <td className="py-1.5 pr-3 max-w-[160px] truncate">{log.recipientEmail}</td>
                      <td className="py-1.5 pr-3 max-w-[200px] truncate text-muted-foreground">{log.subject}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${log.status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {log.status === "sent" ? "✓ sent" : "✗ failed"}
                        </span>
                      </td>
                      <td className="py-1.5">
                        <span className="text-muted-foreground">{log.source}</span>
                        {log.errorMessage && <p className="text-red-500 mt-0.5 max-w-[200px] truncate" title={log.errorMessage}>{log.errorMessage}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );


  const renderAnalytics = () => {
    const funnelSteps = [
      { label: "Waitlist Signups", hint: "Total entries in the waitlist table (all time)", value: funnelData?.waitlistCount ?? 0, color: "bg-blue-500" },
      { label: "Registered Users", hint: "Total accounts registered on the platform (all time, including unverified)", value: funnelData?.registeredCount ?? 0, color: "bg-teal-500" },
      { label: "Created a Listing", hint: "Distinct users who have published at least one listing", value: funnelData?.listedCount ?? 0, color: "bg-amber-500" },
      { label: "Completed a Deal", hint: "Distinct users who participated as seeker or provider in at least one completed deal", value: funnelData?.dealtCount ?? 0, color: "bg-green-500" },
    ];
    const topValue = funnelSteps[0].value || 1;

    return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Analytics</h2>
        <p className="text-muted-foreground">Platform performance and insights</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversion Funnel</CardTitle>
          <CardDescription>Waitlist → Registration → First listing → First deal · Aggregate platform totals, not strict cohort attribution</CardDescription>
        </CardHeader>
        <CardContent>
          {funnelLoading ? (
            <div className="space-y-4" data-testid="funnel-skeleton">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="h-2 w-full bg-muted animate-pulse rounded-full" />
                </div>
              ))}
            </div>
          ) : (
          <>
          <TooltipProvider delayDuration={200}>
          <div className="space-y-4">
            {funnelSteps.map((step, i) => {
              const prev = funnelSteps[i - 1]?.value;
              const convRate = prev && prev > 0 ? ((step.value / prev) * 100).toFixed(1) : null;
              const barPct = topValue > 0 ? (step.value / topValue) * 100 : 0;
              return (
                <div key={step.label} data-testid={`funnel-step-${i}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-4">{i + 1}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm font-medium cursor-help underline decoration-dotted underline-offset-2">{step.label}</span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p>{step.hint}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-3">
                      {convRate !== null && (
                        <span className="text-xs text-muted-foreground">
                          {convRate}% from prev
                        </span>
                      )}
                      <span className="text-sm font-bold tabular-nums w-14 text-right">
                        {step.value.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${step.color}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          </TooltipProvider>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t">
            {funnelSteps.map((step, i) => {
              const overallRate = funnelSteps[0].value > 0
                ? ((step.value / funnelSteps[0].value) * 100).toFixed(1)
                : "—";
              return (
                <div key={step.label} className="text-center" data-testid={`funnel-kpi-${i}`}>
                  <p className="text-2xl font-bold">{step.value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{step.label}</p>
                  {i > 0 && (
                    <p className="text-xs font-medium text-primary mt-0.5">{overallRate}% overall</p>
                  )}
                </div>
              );
            })}
          </div>
          {funnelSteps.some((step, i) => i > 0 && step.value > (funnelSteps[i - 1]?.value ?? 0)) && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
              ⚠ One or more steps exceed the previous step. This is expected when not all registered users originated from the waitlist (aggregate totals, not cohort attribution).
            </p>
          )}
          </>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>User Growth (30 days)</CardTitle>
            <CardDescription>New user signups per day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={userGrowth || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => v?.slice(5)} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} name="Signups" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

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
                  <RechartsTooltip
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
                  <RechartsTooltip
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

        <Card>
          <CardHeader>
            <CardTitle>Top Listings</CardTitle>
            <CardDescription>Most viewed active listings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topListings && topListings.length > 0 ? topListings.slice(0, 8).map((l, i) => (
                <div key={l.id} className="flex items-center justify-between gap-2" data-testid={`row-top-listing-${l.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-muted-foreground w-5">{i + 1}</span>
                    <span className="text-sm truncate">{l.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {l.viewCount}</span>
                    <span className="flex items-center gap-1"><Handshake className="h-3 w-3" /> {l.proposalCount}</span>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-4">No listings yet</p>
              )}
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
              <div className="text-center">
                <p className="text-3xl font-bold text-orange-500">{analytics?.liveListings || 0}</p>
                <p className="text-sm text-muted-foreground">Live Listings</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-red-500">{analytics?.deletedListings || 0}</p>
                <p className="text-sm text-muted-foreground">Deleted Listings</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{analytics?.completedDeals || 0}</p>
                <p className="text-sm text-muted-foreground">Closed Deals</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-500">{analytics?.newListingsToday || 0}</p>
                <p className="text-sm text-muted-foreground">New Today</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-500">{analytics?.cancelledDeals || 0}</p>
                <p className="text-sm text-muted-foreground">Cancelled Deals</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
  };

  const auditAdmins = Array.from(new Set(auditLogs.map(l => ({ id: l.adminId, email: l.adminEmail })).filter(a => a.email).map(a => JSON.stringify(a)))).map(s => JSON.parse(s) as { id: string; email: string });
  const auditActions = Array.from(new Set(auditLogs.map(l => l.action))).sort();

  // ── Feature Hub ──────────────────────────────────────────────────────────────
  const renderFeatureHub = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1">Feature Hub</h2>
          <p className="text-muted-foreground">Analytics and controls for v2 features</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchFeatureStats()}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[
          { label: "Bulk Listings Active", value: featureStats?.bulkListingsActive, icon: Package, color: "text-blue-600", onClick: () => goToSection("listings") },
          { label: "Stories Pending", value: featureStats?.successStoriesPending, icon: Trophy, color: "text-amber-600", onClick: () => setActiveSection("success-stories") },
          { label: "Stories Approved", value: featureStats?.successStoriesApproved, icon: Trophy, color: "text-green-600", onClick: () => setActiveSection("success-stories") },
          { label: "Digest Emails Sent", value: featureStats?.digestEmailsSent, icon: Mail, color: "", onClick: undefined },
          { label: "Digests Last 7d", value: featureStats?.digestEmailsLast7d, icon: Mail, color: "text-primary", onClick: undefined },
          { label: "Avg Matches/Email", value: featureStats?.digestAvgMatches, icon: TrendingUp, color: "", onClick: undefined },
          { label: "WhatsApp Opt-ins", value: featureStats?.whatsappOptIns, icon: MessageSquare, color: "text-green-600", onClick: undefined },
          { label: "Total WA Registered", value: featureStats?.whatsappTotal, icon: MessageSquare, color: "", onClick: undefined },
          { label: "Instant Match Calls", value: featureStats?.instantMatchCalls, icon: Zap, color: "text-amber-500", onClick: undefined },
        ].map(card => (
          <Card key={card.label} className={card.onClick ? "cursor-pointer hover:shadow-md hover:border-primary/40 transition-all" : ""} onClick={card.onClick}>
            <CardContent className="pt-4 pb-4">
              <div className={`text-2xl font-bold ${card.color}`}>
                {featureStatsLoading ? "…" : (card.value ?? "—")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Match Digest Campaign */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Smart Match Digest
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Send a weekly personalised email to all users with active listings, showing their top AI-matched trade opportunities.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => { setDigestSending(true); sendDigestMutation.mutate(undefined); }}
              disabled={sendDigestMutation.isPending || digestSending}
            >
              {sendDigestMutation.isPending ? "Sending…" : "Send Digest to All Users"}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { label: "Total sent", value: featureStats?.digestEmailsSent },
              { label: "Last 7 days", value: featureStats?.digestEmailsLast7d },
              { label: "Avg matches/email", value: featureStats?.digestAvgMatches },
            ].map(s => (
              <div key={s.label} className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-xl font-bold">{featureStatsLoading ? "…" : (s.value ?? 0)}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-green-600" /> WhatsApp Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
              <div className="text-3xl font-bold text-green-600">{featureStats?.whatsappOptIns ?? 0}</div>
              <div className="text-sm text-muted-foreground">Users opted in</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold">{featureStats?.whatsappTotal ?? 0}</div>
              <div className="text-sm text-muted-foreground">Total registered</div>
            </div>
          </div>
          {(featureStats?.whatsappTotal ?? 0) > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Opt-in rate</span>
                <span>{Math.round(((featureStats?.whatsappOptIns ?? 0) / (featureStats?.whatsappTotal ?? 1)) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${Math.round(((featureStats?.whatsappOptIns ?? 0) / (featureStats?.whatsappTotal ?? 1)) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ── Barter Credits Ledger ─────────────────────────────────────────────────
  const renderBarterCredits = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1">Barter Credits</h2>
          <p className="text-muted-foreground">View and adjust user barter credit balances</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchCredits()}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      {/* Adjust credits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Manual Credit Adjustment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <input
              className="border rounded px-3 py-2 text-sm w-48"
              placeholder="User ID"
              value={creditAdjustUserId}
              onChange={e => setCreditAdjustUserId(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2 text-sm w-32"
              placeholder="Amount AED (±)"
              type="number"
              value={creditAdjustAmount}
              onChange={e => setCreditAdjustAmount(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2 text-sm flex-1 min-w-40"
              placeholder="Reason / note"
              value={creditAdjustNote}
              onChange={e => setCreditAdjustNote(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => adjustCreditMutation.mutate()}
              disabled={adjustCreditMutation.isPending || !creditAdjustUserId || !creditAdjustAmount || !creditAdjustNote}
            >
              {adjustCreditMutation.isPending ? "Saving…" : "Apply"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* All balances */}
      <Card>
        <CardContent className="p-0">
          {creditsLoading ? (
            <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Balance (AED)</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Lifetime Earned</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {(barterCreditsData ?? []).map(row => (
                  <tr key={row.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{row.userName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{row.userEmail}</div>
                    </td>
                    <td className="p-3 text-right font-bold text-amber-600">AED {parseFloat(row.balanceAed).toFixed(2)}</td>
                    <td className="p-3 text-right text-muted-foreground">AED {parseFloat(row.lifetimeEarnedAed).toFixed(2)}</td>
                    <td className="p-3 text-right text-xs text-muted-foreground">
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
                {(barterCreditsData ?? []).length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No credits issued yet — they're awarded automatically when deals complete with a value imbalance.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ── Success Stories ───────────────────────────────────────────────────────
  const renderSuccessStories = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold mb-1">Success Stories</h2>
          <p className="text-muted-foreground">Review and feature user trade stories</p>
        </div>
        <div className="flex gap-2">
          {["all", "pending", "approved", "rejected"].map(s => (
            <Button
              key={s}
              variant={storyStatusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStoryStatusFilter(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {storiesLoading
          ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)
          : (successStoriesData ?? []).length === 0
          ? <p className="text-muted-foreground col-span-3 text-center py-12">No stories in this filter.</p>
          : (successStoriesData ?? []).map(story => (
            <Card key={story.id} className={`overflow-hidden ${story.isFeatured ? "ring-2 ring-amber-400" : ""}`}>
              {story.imageUrl && (
                <div className="h-36 bg-muted overflow-hidden">
                  <img src={assetUrl(story.imageUrl)} alt="story" className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{story.authorName ?? "Unknown"} × {story.partnerName ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{story.seekerItem} ↔ {story.providerItem}</p>
                  </div>
                  <div className="flex gap-1">
                    <Badge variant={story.status === "approved" ? "default" : story.status === "rejected" ? "destructive" : "secondary"}>
                      {story.status}
                    </Badge>
                    {story.isFeatured && <Badge className="bg-amber-100 text-amber-700">Featured</Badge>}
                  </div>
                </div>
                {story.caption && <p className="text-xs text-muted-foreground line-clamp-3">{story.caption}</p>}
                <div className="flex gap-1.5 flex-wrap">
                  {story.status !== "approved" && (
                    <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => updateStoryMutation.mutate({ id: story.id, status: "approved" })}>
                      Approve
                    </Button>
                  )}
                  {story.status !== "rejected" && (
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => updateStoryMutation.mutate({ id: story.id, status: "rejected" })}>
                      Reject
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className={`h-7 text-xs ${story.isFeatured ? "text-amber-600 border-amber-300" : ""}`}
                    onClick={() => updateStoryMutation.mutate({ id: story.id, isFeatured: !story.isFeatured })}
                  >
                    {story.isFeatured ? "Unfeature" : "Feature"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        }
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Settings</h2>
        <p className="text-muted-foreground">Platform configuration, security, and compliance</p>
      </div>

      <Tabs value={settingsTab} onValueChange={setSettingsTab}>
        <TabsList>
          <TabsTrigger value="platform" data-testid="tab-settings-platform">Platform</TabsTrigger>
          <TabsTrigger value="admins" data-testid="tab-settings-admins">Admins</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-settings-audit">Audit Log</TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-settings-security">Security</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-settings-integrations">Integrations</TabsTrigger>
          <TabsTrigger value="cms-members" data-testid="tab-settings-cms-members">CMS Members</TabsTrigger>
        </TabsList>

        <TabsContent value="platform" className="space-y-6">
          <AdminPlatformSettings />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Emergency Data Collection Disable
              </CardTitle>
              <CardDescription>Kill-switch to stop all non-essential data collection immediately</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant={dataCollectionSetting?.dataCollectionDisabled ? "destructive" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => dataCollectionMutation.mutate(!dataCollectionSetting?.dataCollectionDisabled)}
                disabled={dataCollectionMutation.isPending}
                data-testid="button-toggle-data-collection"
              >
                {dataCollectionSetting?.dataCollectionDisabled ? (
                  <><ToggleRight className="h-4 w-4" />Collection Disabled</>
                ) : (
                  <><ToggleLeft className="h-4 w-4" />Collection Active</>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Compliance — Cookie Consent Log</CardTitle>
              <CardDescription>
                Append-only audit trail of every cookie-banner decision. Used for UAE PDPL / GDPR compliance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href="/api/admin/consent/export.csv"
                data-testid="link-consent-export-csv"
                className="inline-flex items-center text-sm font-medium text-bareter-teal hover:underline"
              >
                Download consent log (CSV)
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-bareter-teal" />
                Beta Tester Invite
              </CardTitle>
              <CardDescription>
                Share this link with friends to let them register without joining the waitlist. The code grants one-time registration access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {betaInviteData?.code ? (
                <>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={betaInviteData.inviteUrl || `${window.location.origin}/register?invite=${betaInviteData.code}`}
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const link = betaInviteData.inviteUrl || `${window.location.origin}/register?invite=${betaInviteData.code}`;
                        navigator.clipboard.writeText(link);
                        toast({ title: "Copied!", description: "Invite link copied to clipboard." });
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Code: <span className="font-mono font-semibold">{betaInviteData.code}</span>
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No invite code set yet. Generate one below.</p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => regenerateInviteCodeMutation.mutate()}
                disabled={regenerateInviteCodeMutation.isPending}
              >
                <RefreshCw className="h-4 w-4" />
                {betaInviteData?.code ? "Regenerate Code" : "Generate Code"}
              </Button>
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="admins" className="space-y-4">
          <AdminsManagementTab
            users={users ?? []}
            currentUserId={user?.id ?? ""}
            currentUserRole={user?.role ?? ""}
            promoteMutation={promoteMutation}
            demoteMutation={demoteMutation}
          />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Admin Audit Log
                  </CardTitle>
                  <CardDescription>Track all admin actions for accountability</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={auditLogActionFilter} onValueChange={setAuditLogActionFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-audit-action-filter">
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All actions</SelectItem>
                      {auditActions.map(a => (
                        <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={auditLogAdminFilter} onValueChange={setAuditLogAdminFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-audit-admin-filter">
                      <SelectValue placeholder="All admins" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All admins</SelectItem>
                      {auditAdmins.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    type="date"
                    value={auditLogDateFrom}
                    onChange={e => setAuditLogDateFrom(e.target.value)}
                    className="border rounded-md px-2 py-1 text-sm h-9"
                    placeholder="From"
                    data-testid="input-audit-date-from"
                  />
                  <input
                    type="date"
                    value={auditLogDateTo}
                    onChange={e => setAuditLogDateTo(e.target.value)}
                    className="border rounded-md px-2 py-1 text-sm h-9"
                    placeholder="To"
                    data-testid="input-audit-date-to"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No audit log entries</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell className="text-sm">{log.adminEmail || log.adminId.slice(0, 8)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.action.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-muted-foreground">{log.targetType}</span>
                          {log.targetId && <span className="font-mono text-xs ml-1">{log.targetId.slice(0, 8)}…</span>}
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                          {log.details ? JSON.stringify(log.details).slice(0, 80) : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{log.ipAddress || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5" />
                Failed Login Attempts
              </CardTitle>
              <CardDescription>Recent failed login attempts for monitoring</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {failedLogins.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No failed login attempts recorded</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>User Agent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failedLogins.map((attempt) => (
                      <TableRow key={attempt.id} data-testid={`row-failed-login-${attempt.id}`}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {attempt.createdAt ? new Date(attempt.createdAt).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{attempt.email}</TableCell>
                        <TableCell>
                          <Badge variant={attempt.reason === "invalid_password" ? "destructive" : "secondary"}>
                            {(attempt.reason || "unknown").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{attempt.ipAddress || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                          {attempt.userAgent || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <AdminIntegrationsSection />
        </TabsContent>

        <TabsContent value="cms-members" className="space-y-4">
          <CmsMembersSection />
        </TabsContent>
      </Tabs>
    </div>
  );

  const { data: reportsData = [] } = useQuery<Report[]>({
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

  const renderReports = () => {
    const getTargetUrl = (report: any) => {
      if (report.targetType === "listing") return `/listings/${report.targetId}`;
      if (report.targetType === "post") return `/posts/${report.targetId}`;
      if (report.targetType === "user") return `/users/${report.targetId}`;
      if (report.targetType === "deal") return `/deals/${report.targetId}`;
      return null;
    };

    const filteredReports = (reportsData as any[]).filter(r => {
      if (reportStatusFilter !== "all" && r.status !== reportStatusFilter) return false;
      if (reportTypeFilter !== "all" && r.targetType !== reportTypeFilter) return false;
      return true;
    });
    const pendingReportsCount = (reportsData as any[]).filter(r => r.status === "pending").length;
    const actionedReportsCount = (reportsData as any[]).filter(r => r.status === "actioned").length;

    return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Reports</h2>
          <p className="text-muted-foreground">
            User-submitted reports for review
            {filteredReports.length !== reportsData.length && (
              <span className="ml-2 text-xs font-medium text-primary">Showing {filteredReports.length} of {reportsData.length}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={reportStatusFilter} onValueChange={setReportStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending {pendingReportsCount > 0 && `(${pendingReportsCount})`}</SelectItem>
              <SelectItem value="actioned">Actioned {actionedReportsCount > 0 && `(${actionedReportsCount})`}</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reportTypeFilter} onValueChange={setReportTypeFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="listing">Listing</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="post">Post</SelectItem>
              <SelectItem value="deal">Deal</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={reportsExportFrom} onChange={(e) => setReportsExportFrom(e.target.value)} className="w-36 h-9 text-xs" placeholder="From" data-testid="input-reports-export-from" />
          <Input type="date" value={reportsExportTo} onChange={(e) => setReportsExportTo(e.target.value)} className="w-36 h-9 text-xs" placeholder="To" data-testid="input-reports-export-to" />
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { const params = new URLSearchParams(); if (reportsExportFrom) params.set("from", reportsExportFrom); if (reportsExportTo) params.set("to", reportsExportTo); window.open(`/api/admin/reports/export.csv${params.toString() ? `?${params}` : ""}`, "_blank"); toast({ title: "Exporting", description: "Reports & disputes CSV download started" }); }} data-testid="button-export-reports-csv">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {filteredReports.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No reports found</CardContent></Card>
        ) : (
          filteredReports.map((report) => {
            const targetUrl = getTargetUrl(report);
            return (
              <Card key={report.id} className={report.status === "pending" ? "border-orange-200 dark:border-orange-900" : ""} data-testid={`row-report-${report.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {/* Reported content */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="capitalize">{report.targetType}</Badge>
                        <Badge variant={
                          report.status === "pending" ? "secondary" :
                          report.status === "actioned" ? "default" : "outline"
                        } className="capitalize">{report.status}</Badge>
                        <span className="text-xs text-muted-foreground">{report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ""}</span>
                      </div>

                      {report.targetTitle && (
                        <p className="font-semibold text-sm">
                          {targetUrl ? (
                            <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                              {report.targetTitle}
                            </a>
                          ) : report.targetTitle}
                        </p>
                      )}

                      <p className="text-sm"><span className="font-medium">Reason:</span> <span className="text-muted-foreground capitalize">{report.reason.replace(/_/g, " ")}</span></p>

                      {report.notes && (
                        <p className="text-sm"><span className="font-medium">Notes:</span> <span className="text-muted-foreground">{report.notes}</span></p>
                      )}

                      {report.reporter && (
                        <p className="text-xs text-muted-foreground">
                          Reported by: <a href={`/users/${report.reporterId}`} target="_blank" rel="noopener noreferrer" className="hover:underline font-medium">{report.reporter.fullName}</a>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      {targetUrl && (
                        <a href={targetUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="w-full gap-1.5">
                            <ExternalLink className="h-3.5 w-3.5" />
                            View {report.targetType}
                          </Button>
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={report.status === "dismissed"}
                        onClick={() => updateReportStatus.mutate({ id: report.id, status: "dismissed" })}
                        data-testid={`button-dismiss-report-${report.id}`}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={report.status === "actioned"}
                        onClick={() => updateReportStatus.mutate({ id: report.id, status: "actioned" })}
                        data-testid={`button-action-report-${report.id}`}
                      >
                        Mark Actioned
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
    );
  };

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
    rawResponse: { categories?: string[] } | null;
    triggeredBy: string | null;
    reviewedByAdmin: boolean | null;
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
    enabled: activeSection === "logs" && !!user?.isAdmin,
  });

  const { data: phoneVerifLogs = [] } = useQuery<PhoneVerifLog[]>({
    queryKey: ["/api/admin/phone-verification-logs", "unified"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/phone-verification-logs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: activeSection === "logs",
    staleTime: 0,
  });

  const { data: unifiedEmailLogs = [], refetch: refetchUnifiedEmailLogs } = useQuery<any[]>({
    queryKey: ["/api/admin/email/logs", "unified"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/email/logs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: activeSection === "logs",
    staleTime: 0,
  });

  const [aiLogFilter, setAiLogFilter] = useState<"all" | "approved" | "flagged" | "rejected">("all");
  const [aiAgentFilter, setAiAgentFilter] = useState<string>("all");

  const renderWaitlist = () => <WaitlistAdminSection />;

  // ── Creators section ──────────────────────────────────────────────────
  const { data: adminCreators = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/creators"],
    enabled: activeSection === "creators",
  });

  const renderCreators = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Creator Accounts</h2>
        <p className="text-muted-foreground">All users registered as Content Creators, with their profile stats.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creator</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Followers</TableHead>
                <TableHead>Engagement</TableHead>
                <TableHead>Niches</TableHead>
                <TableHead>Open to Collabs</TableHead>
                <TableHead>Verified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminCreators.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    No creator accounts yet.
                  </TableCell>
                </TableRow>
              ) : adminCreators.map((c: any) => {
                const cp = c.creatorProfile;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={c.avatarUrl || undefined} />
                          <AvatarFallback>{c.fullName?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{c.fullName}</p>
                          <p className="text-xs text-muted-foreground">{c.city}, {c.country}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{cp?.primaryPlatform || "—"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {cp?.followerCount ? Number(cp.followerCount).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {cp?.avgEngagementRate ? `${cp.avgEngagementRate}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(cp?.contentNiches || []).slice(0, 3).map((n: string) => (
                          <Badge key={n} variant="secondary" className="text-[10px] py-0">{n}</Badge>
                        ))}
                        {(cp?.contentNiches || []).length > 3 && (
                          <Badge variant="secondary" className="text-[10px] py-0">+{cp.contentNiches.length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {cp?.openToCollabs ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-200">Yes</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <VerifiedBadge kycStatus={c.verificationStatus} kybStatus={null} accountType={c.signupType} size="sm" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  // ── Collab Applications section ───────────────────────────────────────
  const { data: adminCollabs = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/collab-applications"],
    enabled: activeSection === "collabs",
  });

  const STATUS_COLORS: Record<string, string> = {
    pending:  "bg-yellow-500/10 text-yellow-700 border-yellow-200",
    accepted: "bg-green-500/10 text-green-600 border-green-200",
    rejected: "bg-red-500/10 text-red-600 border-red-200",
    withdrawn: "bg-gray-500/10 text-gray-600 border-gray-200",
  };

  const collabsByStatus = {
    pending:   adminCollabs.filter((a: any) => a.status === "pending"),
    accepted:  adminCollabs.filter((a: any) => a.status === "accepted"),
    rejected:  adminCollabs.filter((a: any) => a.status === "rejected"),
    withdrawn: adminCollabs.filter((a: any) => a.status === "withdrawn"),
  };

  const renderCollabs = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Brand Collab Applications</h2>
        <p className="text-muted-foreground">All creator applications to brand collab listings.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(["pending", "accepted", "rejected", "withdrawn"] as const).map((s) => (
          <Card key={s}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground capitalize mb-1">{s}</p>
              <p className="text-2xl font-bold">{collabsByStatus[s].length}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creator</TableHead>
                <TableHead>Listing</TableHead>
                <TableHead>Followers</TableHead>
                <TableHead>Engagement</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminCollabs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    No collab applications yet.
                  </TableCell>
                </TableRow>
              ) : adminCollabs.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={a.creator?.avatarUrl || undefined} />
                        <AvatarFallback>{a.creator?.fullName?.[0]}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{a.creator?.fullName || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm max-w-[180px] truncate">{a.listing?.title || "—"}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {a.followerCount ? Number(a.followerCount).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.engagementRate ? `${a.engagementRate}%` : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.socialHandle || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={`capitalize text-[11px] ${STATUS_COLORS[a.status] || ""}`}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderLogs = () => {
    // ── Client-side date range ──
    const getThreshold = (): Date | null => {
      if (logsDatePreset === "today") { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
      if (logsDatePreset === "week") return new Date(Date.now() - 7 * 86400000);
      if (logsDatePreset === "month") return new Date(Date.now() - 30 * 86400000);
      if (logsDatePreset === "custom" && logsDateFrom) return new Date(logsDateFrom);
      return null;
    };
    const getCeiling = (): Date | null => {
      if (logsDatePreset === "custom" && logsDateTo) { const d = new Date(logsDateTo); d.setHours(23, 59, 59, 999); return d; }
      return null;
    };
    const threshold = getThreshold();
    const ceiling = getCeiling();
    const inDate = (ts: string | null | undefined): boolean => {
      if (!ts) return true;
      const d = new Date(ts);
      if (threshold && d < threshold) return false;
      if (ceiling && d > ceiling) return false;
      return true;
    };

    const q = logsSearch.trim().toLowerCase();
    const matchQ = (...fields: (string | null | undefined)[]): boolean =>
      !q || fields.some(f => f?.toLowerCase().includes(q));

    const matchStatus = (isSuccess: boolean): boolean => {
      if (logsStatusFilter === "all") return true;
      return logsStatusFilter === "success" ? isSuccess : !isSuccess;
    };

    // ── Per-source filtered arrays ──
    const fMod = (aiLogs?.moderationLogs || []).filter(l =>
      (aiLogFilter === "all" || l.action === aiLogFilter) &&
      inDate(l.createdAt) &&
      matchQ(l.targetType, l.action, l.reason) &&
      matchStatus(l.action === "approved")
    );
    const fInt = (aiLogs?.agentInteractions || []).filter(l =>
      (aiAgentFilter === "all" || l.agentType === aiAgentFilter) &&
      inDate(l.createdAt) &&
      matchQ(l.agentType, l.userMessage, l.agentResponse)
    );
    const aiTotal = fMod.length + fInt.length;

    const fEmail = unifiedEmailLogs.filter(l =>
      inDate(l.createdAt) &&
      matchQ(l.recipientEmail, l.subject, l.templateKey) &&
      matchStatus(l.status === "sent")
    );

    const fWA = phoneVerifLogs.filter(l =>
      inDate(l.createdAt) &&
      matchQ(l.email, l.phone, l.result, l.failureReason) &&
      matchStatus(l.result === "sent")
    );

    const fAudit = auditLogs.filter((l: AdminAuditLog) =>
      inDate(l.createdAt?.toString()) &&
      matchQ((l as any).adminEmail, l.action, (l as any).targetType)
    );

    // ── Normalized combined feed for "all" view ──
    type NL = { key: string; source: string; ts: string | null; desc: string; ok: boolean | null; sub?: string };
    const allFeed: NL[] = [
      ...fMod.map(l => ({ key: `m-${l.id}`, source: "AI", ts: l.createdAt, desc: `Moderation: ${l.action} — ${l.targetType}`, ok: l.action === "approved", sub: l.reason?.substring(0, 60) || undefined })),
      ...fInt.map(l => ({ key: `i-${l.id}`, source: "AI", ts: l.createdAt, desc: `Agent (${l.agentType}): ${l.userMessage?.substring(0, 50)}`, ok: null, sub: `${l.tokensUsed || 0} tokens` })),
      ...fEmail.map((l: any) => ({ key: `e-${l.id}`, source: "Email", ts: l.createdAt, desc: `→ ${l.recipientEmail}: ${l.subject || l.templateKey || "email"}`, ok: l.status === "sent", sub: l.errorMessage?.substring(0, 60) || undefined })),
      ...fWA.map(l => ({ key: `w-${l.id}`, source: "WhatsApp", ts: l.createdAt, desc: `${l.email || l.userId || "user"} → ${l.phone}`, ok: l.result === "sent", sub: l.result !== "sent" ? (l.failureReason || l.result) : undefined })),
      ...fAudit.map((l: AdminAuditLog) => ({ key: `a-${l.id}`, source: "Audit", ts: l.createdAt?.toString() || null, desc: `${(l as any).adminEmail || "admin"}: ${l.action.replace(/_/g, " ")}`, ok: null, sub: (l as any).targetType || undefined })),
    ].sort((a, b) => {
      if (!a.ts && !b.ts) return 0;
      if (!a.ts) return 1;
      if (!b.ts) return -1;
      return new Date(b.ts).getTime() - new Date(a.ts).getTime();
    });

    const sourceColors: Record<string, string> = {
      AI: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
      Email: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
      WhatsApp: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
      Audit: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    };

    const fmt = (ts: string | null | undefined) =>
      ts ? new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold mb-1">Logs</h2>
          <p className="text-muted-foreground">All system activity in one place — AI, email, WhatsApp, and admin actions</p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Source pills */}
          <div className="flex gap-0.5 bg-muted p-0.5 rounded-lg">
            {(["all", "ai", "email", "whatsapp", "audit"] as const).map(s => (
              <button
                key={s}
                onClick={() => setLogsSource(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${logsSource === s ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {s === "all" ? "All" : s === "ai" ? "AI" : s === "email" ? "Email" : s === "whatsapp" ? "WhatsApp" : "Audit"}
              </button>
            ))}
          </div>

          {/* Date preset */}
          <Select value={logsDatePreset} onValueChange={v => setLogsDatePreset(v as typeof logsDatePreset)}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>

          {logsDatePreset === "custom" && (
            <>
              <Input type="date" value={logsDateFrom} onChange={e => setLogsDateFrom(e.target.value)} className="h-8 w-[130px] text-xs" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" value={logsDateTo} onChange={e => setLogsDateTo(e.target.value)} className="h-8 w-[130px] text-xs" />
            </>
          )}

          {/* Status */}
          <Select value={logsStatusFilter} onValueChange={setLogsStatusFilter}>
            <SelectTrigger className="w-[125px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="success">Success only</SelectItem>
              <SelectItem value="failure">Failures only</SelectItem>
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search email, phone, action…"
              value={logsSearch}
              onChange={e => setLogsSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Export CSV */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              const rows = allFeed.map(r =>
                [r.source, r.ts ? new Date(r.ts).toISOString() : "", `"${r.desc.replace(/"/g, '""')}"`, r.ok === null ? "" : r.ok ? "success" : "failure", `"${(r.sub || "").replace(/"/g, '""')}"`].join(",")
              );
              const csv = ["Source,Timestamp,Description,Status,Detail", ...rows].join("\n");
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
              a.download = `bareter-logs-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>

        {/* Summary stat cards — clicking a card switches to that source */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total", value: allFeed.length, sub: "all sources", src: "all" as const },
            { label: "AI", value: aiTotal, sub: `${fMod.length} mod · ${fInt.length} agent`, src: "ai" as const },
            { label: "Email", value: fEmail.length, sub: `${fEmail.filter((l: any) => l.status === "sent").length} delivered`, src: "email" as const },
            { label: "WhatsApp", value: fWA.length, sub: `${fWA.filter(l => l.result === "sent").length} sent`, src: "whatsapp" as const },
            { label: "Audit", value: fAudit.length, sub: "admin actions", src: "audit" as const },
          ].map(s => (
            <Card
              key={s.label}
              className={`cursor-pointer transition-colors hover:border-primary/40 ${logsSource === s.src ? "border-primary" : ""}`}
              onClick={() => setLogsSource(s.src)}
            >
              <CardContent className="pt-4 pb-3">
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground truncate">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── ALL: chronological merged feed ── */}
        {logsSource === "all" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Activity Feed</CardTitle>
              <CardDescription>{allFeed.length} events matching current filters</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {allFeed.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No activity found for the selected filters</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">Time</TableHead>
                      <TableHead className="w-[90px]">Source</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allFeed.slice(0, 200).map(row => (
                      <TableRow key={row.key}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(row.ts)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${sourceColors[row.source] || ""}`}>
                            {row.source}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs max-w-[280px] truncate">{row.desc}</TableCell>
                        <TableCell>
                          {row.ok === null
                            ? <span className="text-xs text-muted-foreground">—</span>
                            : row.ok
                              ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700">✓ ok</span>
                              : <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700">✗ fail</span>
                          }
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{row.sub || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {allFeed.length > 200 && (
                <p className="py-3 text-center text-xs text-muted-foreground border-t">
                  Showing first 200 of {allFeed.length} — apply a source or date filter to narrow down
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── AI: moderation logs + agent interactions ── */}
        {logsSource === "ai" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Interactions</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ai-total-interactions">{fInt.length}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Moderation Actions</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="text-ai-moderation-count">{fMod.length}</div></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Flagged</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-500" data-testid="text-ai-flagged-count">
                    {fMod.filter(l => l.action === "flagged").length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Tokens Used</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-ai-total-tokens">
                    {fInt.reduce((s, i) => s + (i.tokensUsed || 0), 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Auto-blocked review queue ── */}
            {(() => {
              const autoBlocked = (aiLogs?.moderationLogs || []).filter(l =>
                l.triggeredBy === "auto_ai" &&
                (l.action === "flagged" || l.action === "rejected") &&
                !l.reviewedByAdmin &&
                inDate(l.createdAt)
              );
              return autoBlocked.length > 0 ? (
                <Card className="border-amber-300 dark:border-amber-700">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <CardTitle className="text-base text-amber-700 dark:text-amber-400">
                        Auto-blocked — Needs Review ({autoBlocked.length})
                      </CardTitle>
                      <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">AI flagged · unreviewed</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      These listings were automatically blocked by the moderation engine. Review and approve or confirm rejection.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Override</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {autoBlocked.map(log => (
                          <TableRow key={log.id} className="bg-amber-50/50 dark:bg-amber-950/20">
                            <TableCell><Badge variant="outline">{log.targetType}</Badge></TableCell>
                            <TableCell>
                              <Badge variant={log.action === "rejected" ? "destructive" : "secondary"}>
                                {log.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[240px] text-xs text-muted-foreground">{log.reason}</TableCell>
                            <TableCell className="text-sm font-medium">
                              {log.confidence ? (
                                <span className={parseFloat(log.confidence) < 0.6 ? "text-amber-600" : "text-red-600"}>
                                  {Math.round(parseFloat(log.confidence) * 100)}%
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {log.createdAt ? new Date(log.createdAt).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell>
                              {log.targetType === "listing" && (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs text-green-700 border-green-400 hover:bg-green-50"
                                    onClick={() => approveListingMutation.mutate(log.targetId)}
                                    disabled={approveListingMutation.isPending}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs text-red-700 border-red-400 hover:bg-red-50"
                                    onClick={() => setRejectDialog({ open: true, listingId: log.targetId, reason: "" })}
                                  >
                                    Confirm Reject
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : null;
            })()}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">Moderation Logs</CardTitle>
                  <div className="flex gap-2 flex-wrap">
                    <div className="flex gap-1">
                      {(["all", "approved", "flagged", "rejected"] as const).map(f => (
                        <Button key={f} variant={aiLogFilter === f ? "default" : "outline"} size="sm" className="text-xs h-7 capitalize"
                          data-testid={`btn-filter-moderation-${f}`} onClick={() => setAiLogFilter(f)}>{f}</Button>
                      ))}
                    </div>
                    <Button
                      variant={aiLogFilter === ("auto_blocked" as any) ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7 border-amber-400 text-amber-700"
                      onClick={() => setAiLogFilter("auto_blocked" as any)}
                    >
                      Auto-blocked only
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const displayed = aiLogFilter === ("auto_blocked" as any)
                    ? fMod.filter(l => l.triggeredBy === "auto_ai" && (l.action === "flagged" || l.action === "rejected"))
                    : fMod;
                  return displayed.length === 0 ? (
                    <p className="text-muted-foreground text-sm py-4 text-center">No moderation logs</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Categories</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayed.map(log => {
                          const cats: string[] = log.rawResponse?.categories ?? [];
                          return (
                            <TableRow key={log.id} data-testid={`row-moderation-${log.id}`}>
                              <TableCell><Badge variant="outline">{log.targetType}</Badge></TableCell>
                              <TableCell>
                                <Badge variant={log.action === "approved" ? "default" : log.action === "rejected" ? "destructive" : "secondary"}>
                                  {log.action}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-xs ${log.triggeredBy === "auto_ai" ? "border-purple-400 text-purple-700" : "border-blue-400 text-blue-700"}`}>
                                  {log.triggeredBy === "manual_admin" ? "admin" : "auto"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {cats.length === 0
                                    ? <span className="text-xs text-muted-foreground">—</span>
                                    : cats.map(cat => (
                                      <Badge key={cat} variant="outline" className={`text-xs ${cat === "off_platform" ? "border-amber-500/60 text-amber-600" : cat === "cash_price" ? "border-red-400/60 text-red-600" : ""}`}
                                        data-testid={`badge-category-${log.id}-${cat}`}>{cat}</Badge>
                                    ))}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate text-sm">{log.reason}</TableCell>
                              <TableCell>{log.confidence ? `${Math.round(parseFloat(log.confidence) * 100)}%` : "N/A"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {log.createdAt ? new Date(log.createdAt).toLocaleDateString() : "N/A"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">Agent Interactions</CardTitle>
                  <div className="flex gap-1">
                    {["all", "support", "matching", "valuation", "engagement", "admin"].map(f => (
                      <Button key={f} variant={aiAgentFilter === f ? "default" : "outline"} size="sm" className="text-xs h-7 capitalize"
                        data-testid={`btn-filter-agent-${f}`} onClick={() => setAiAgentFilter(f)}>{f}</Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {fInt.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4 text-center">No agent interactions</p>
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
                      {fInt.map(i => (
                        <TableRow key={i.id} data-testid={`row-interaction-${i.id}`}>
                          <TableCell><Badge variant="outline" className="capitalize">{i.agentType}</Badge></TableCell>
                          <TableCell className="max-w-[150px] truncate text-sm">{i.userMessage}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">{i.agentResponse?.substring(0, 80)}</TableCell>
                          <TableCell className="text-sm">{i.tokensUsed || 0}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {i.createdAt ? new Date(i.createdAt).toLocaleDateString() : "N/A"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── EMAIL: delivery logs ── */}
        {logsSource === "email" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">Email Logs</CardTitle>
                <CardDescription>{fEmail.length} emails matching current filters</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => refetchUnifiedEmailLogs()}>Refresh</Button>
            </CardHeader>
            <CardContent className="p-0">
              {fEmail.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No email logs found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fEmail.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(log.createdAt)}</TableCell>
                        <TableCell className="text-xs font-mono">{log.templateKey ? log.templateKey.replace("email_template_", "") : "—"}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate">{log.recipientEmail}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">{log.subject}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${log.status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {log.status === "sent" ? "✓ sent" : "✗ failed"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.source}
                          {log.errorMessage && (
                            <p className="text-red-500 mt-0.5 max-w-[180px] truncate" title={log.errorMessage}>{log.errorMessage}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── WHATSAPP: phone verification logs ── */}
        {logsSource === "whatsapp" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total attempts", value: fWA.length },
                { label: "Successful", value: fWA.filter(l => l.result === "sent").length },
                { label: "Conflicts", value: fWA.filter(l => l.result === "conflict").length, warn: fWA.some(l => l.result === "conflict") },
                { label: "Service down", value: fWA.filter(l => l.result === "service_down").length, warn: fWA.some(l => l.result === "service_down") },
              ].map(s => (
                <Card key={s.label} className={s.warn ? "border-destructive/40" : ""}>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Attempt history</CardTitle>
                <CardDescription>{fWA.length} entries matching current filters</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {fWA.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No WhatsApp log entries found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Reason / detail</TableHead>
                        <TableHead>Service</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fWA.map(log => {
                        const meta = RESULT_LABELS[log.result] ?? { label: log.result, variant: "outline" as const };
                        return (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(log.createdAt)}</TableCell>
                            <TableCell className="text-xs max-w-[160px] truncate">{log.email ?? log.userId ?? "—"}</TableCell>
                            <TableCell className="text-xs font-mono">{log.phone}</TableCell>
                            <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{log.failureReason ?? "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{log.service ?? "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── AUDIT: admin action log ── */}
        {logsSource === "audit" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Admin Audit Log</CardTitle>
              <CardDescription>{fAudit.length} actions matching filters</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {fAudit.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No audit log entries found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fAudit.map((log: AdminAuditLog) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(log.createdAt?.toString())}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate">{(log as any).adminEmail ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{log.action.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{(log as any).targetType ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {log.details ? JSON.stringify(log.details).substring(0, 80) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderReviews = () => {
    return (
      <AdminReviewsSection />
    );
  };

  const renderSupportSection = () => <AdminSupportSection />;

  const renderMorningCheck = () => {
    const pending = morningCheck?.pendingListings ?? [];
    const blocked = morningCheck?.autoBlockedQueue ?? [];
    const verifs = morningCheck?.pendingVerifications ?? [];
    const openReps = morningCheck?.openReports ?? [];
    const openDisps = morningCheck?.openDisputes ?? [];
    const tickets = morningCheck?.openSupportTickets ?? [];
    const unresponded = morningCheck?.unrespondedTickets ?? [];
    const flaggedPosts = morningCheck?.flaggedPosts ?? [];
    const staleDeals = morningCheck?.staleDeals ?? [];
    const multiReported = morningCheck?.multiReportedUsers ?? [];
    const stats = morningCheck?.stats;
    const totalQueue = pending.length + blocked.length + verifs.length + openReps.length + openDisps.length + tickets.length + unresponded.length + flaggedPosts.length + multiReported.length;

    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              Daily Queue
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {morningCheckLoading
                ? "Loading queues…"
                : totalQueue === 0
                ? "All queues clear — nothing needs action right now."
                : `${totalQueue} item${totalQueue !== 1 ? "s" : ""} need your attention`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchMorningCheck()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* ── Platform Overview (analytics summary) ─────────────────────── */}
        {funnelData && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Platform Funnel</CardTitle>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => setActiveSection("analytics")}>
                  Full analytics →
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-4 gap-0">
                {[
                  { label: "Waitlist", value: funnelData.waitlistCount, color: "text-blue-600", section: "waitlist" as AdminSection },
                  { label: "Registered", value: funnelData.registeredCount, color: "text-teal-600", section: "users" as AdminSection },
                  { label: "Listed", value: funnelData.listedCount, color: "text-amber-600", section: "listings" as AdminSection },
                  { label: "Completed Deal", value: funnelData.dealtCount, color: "text-green-600", section: "deals" as AdminSection, opts: { dealStateFilter: "completed" } },
                ].map((stage, i, arr) => (
                  <div key={stage.label} className="flex items-center">
                    <button
                      className="flex-1 text-center p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => goToSection(stage.section, (stage as any).opts)}
                    >
                      <div className={`text-2xl font-bold ${stage.color}`}>{stage.value.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{stage.label}</div>
                      {i > 0 && arr[i - 1].value > 0 && (
                        <div className="text-[10px] text-muted-foreground/60">{Math.round((stage.value / arr[i - 1].value) * 100)}% conv.</div>
                      )}
                    </button>
                    {i < arr.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* User growth sparkline */}
        {userGrowth && userGrowth.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">User Growth — Last 30 days</CardTitle>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => goToSection("users", { dateRangeFilter: "month" })}>
                  View users →
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
              <LineChart width={740} height={80} data={userGrowth.slice(-30)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <RechartsTooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v: number) => [v, "New users"]}
                  labelFormatter={(l: string) => new Date(l).toLocaleDateString()}
                />
              </LineChart>
            </CardContent>
          </Card>
        )}

        {/* ── Activity stats (last 24h) — all clickable ─────────────────── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Last 24 hours</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {[
              { label: "Active users", value: stats?.activeUsers24h, color: "", section: "users" as AdminSection, opts: {} },
              { label: "New signups", value: stats?.newUsers24h, color: "", section: "users" as AdminSection, opts: { dateRangeFilter: "today" as DateRangeFilter } },
              { label: "New listings", value: stats?.newListings24h, color: "", section: "listings" as AdminSection, opts: { dateRangeFilter: "today" as DateRangeFilter } },
              { label: "Deals started", value: stats?.newDeals24h, color: "", section: "deals" as AdminSection, opts: { dateRangeFilter: "today" as DateRangeFilter } },
              { label: "Deals completed", value: stats?.completedDeals24h, color: "text-green-600", section: "deals" as AdminSection, opts: { dealStateFilter: "completed", dateRangeFilter: "today" as DateRangeFilter } },
            ].map(card => (
              <Card
                key={card.label}
                className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
                onClick={() => goToSection(card.section, card.opts)}
              >
                <CardContent className="pt-4 pb-4">
                  <div className={`text-2xl font-bold ${card.color}`}>{card.value ?? "—"}</div>
                  <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ── Action stats (items needing attention) — all clickable ─────── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Needs action</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {[
              { label: "Pending moderation", value: pending.length, color: "text-amber-600", section: "listings" as AdminSection, opts: { listingStatusFilter: "pending" } },
              { label: "Auto-blocked", value: blocked.length, color: "text-red-600", section: "logs" as AdminSection, opts: {} },
              { label: "Tickets waiting reply", value: unresponded.length, color: "text-orange-600", section: "support" as AdminSection, opts: {} },
              { label: "Multi-reported users", value: multiReported.length, color: "text-red-700", section: "reports" as AdminSection, opts: {} },
              { label: "Stale deals (7d+)", value: staleDeals.length, color: "text-yellow-600", section: "deals" as AdminSection, opts: { dealStateFilter: "active" } },
            ].map(card => (
              <Card
                key={card.label}
                className={`cursor-pointer hover:shadow-md hover:border-primary/40 transition-all ${card.value > 0 ? "ring-1 ring-inset ring-destructive/20" : ""}`}
                onClick={() => goToSection(card.section, card.opts)}
              >
                <CardContent className="pt-4 pb-4">
                  <div className={`text-2xl font-bold ${card.color}`}>{morningCheckLoading ? "…" : card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Queue 1: Pending listings */}
        {pending.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-amber-600" />
                Pending Listings
                <Badge className="ml-1">{pending.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">New listings waiting for your approval before going live.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.map((listing) => (
                <div key={listing.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="font-medium text-sm truncate">{listing.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {listing.userEmail ?? listing.userId} · {listing.category ?? "—"} · {listing.createdAt ? new Date(listing.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-green-700 border-green-400 hover:bg-green-50"
                      onClick={() => approveListingMutation.mutate(listing.id)}
                      disabled={approveListingMutation.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-700 border-red-400 hover:bg-red-50"
                      onClick={() => setRejectDialog({ open: true, listingId: listing.id, reason: "" })}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
              {pending.length >= 30 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  Showing first 30 — <button className="underline" onClick={() => setActiveSection("listings")}>view all in Listings</button>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Queue 2: Auto-blocked (AI) */}
        {blocked.length > 0 && (
          <Card className="border-amber-300 dark:border-amber-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Auto-blocked by AI
                <Badge variant="outline" className="text-amber-600 border-amber-400 ml-1">{blocked.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">AI flagged these but wasn't confident — decide to override or confirm.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {blocked.map((log) => (
                <div key={log.id} className="flex items-start justify-between p-3 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/40 dark:bg-amber-950/20">
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={log.action === "rejected" ? "destructive" : "secondary"} className="text-xs">{log.action}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {log.confidence ? `${Math.round(parseFloat(log.confidence) * 100)}% confidence` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">· {log.createdAt ? new Date(log.createdAt).toLocaleDateString() : ""}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{log.reason}</p>
                  </div>
                  {log.targetType === "listing" && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-green-700 border-green-400 hover:bg-green-50"
                        onClick={() => approveListingMutation.mutate(log.targetId)}
                        disabled={approveListingMutation.isPending}
                      >
                        Override
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-red-700 border-red-400 hover:bg-red-50"
                        onClick={() => setRejectDialog({ open: true, listingId: log.targetId, reason: "" })}
                      >
                        Confirm
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {blocked.length >= 30 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  Showing first 30 — <button className="underline" onClick={() => setActiveSection("logs")}>view all in Logs → AI</button>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Queue 3: Pending verifications */}
        {verifs.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="h-4 w-4 text-blue-600" />
                Pending Verifications
                <Badge className="ml-1">{verifs.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Users who submitted verification documents.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {verifs.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="font-medium text-sm truncate">{u.email}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.fullName} · {u.accountType} · Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => { setActiveSection("users"); setSearchQuery(u.email || ""); }}
                  >
                    Review
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Queue 4: Open reports */}
        {openReps.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Flag className="h-4 w-4 text-orange-600" />
                Open Reports
                <Badge variant="destructive" className="ml-1">{openReps.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">User-submitted reports waiting for action.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {openReps.slice(0, 10).map((report) => (
                <div key={report.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="font-medium text-sm truncate">{report.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {report.targetType} · {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => setActiveSection("reports")}
                  >
                    View
                  </Button>
                </div>
              ))}
              {openReps.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{openReps.length - 10} more — <button className="underline" onClick={() => setActiveSection("reports")}>view all in Reports</button>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Queue 5: Open disputes */}
        {openDisps.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gavel className="h-4 w-4 text-red-600" />
                Open Disputes
                <Badge variant="destructive" className="ml-1">{openDisps.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Active disputes needing admin mediation.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {openDisps.slice(0, 10).map((dispute) => (
                <div key={dispute.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="font-medium text-sm truncate">{dispute.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      Status: <span className="capitalize">{dispute.status.replace("_", " ")}</span> · {dispute.createdAt ? new Date(dispute.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => setActiveSection("disputes")}
                  >
                    Review
                  </Button>
                </div>
              ))}
              {openDisps.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{openDisps.length - 10} more — <button className="underline" onClick={() => setActiveSection("disputes")}>view all in Disputes</button>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Queue 6: Open support tickets */}
        {tickets.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-orange-600" />
                Support Tickets
                <Badge variant="destructive" className="ml-1">{tickets.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Open and in-progress tickets sorted by priority.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {tickets.slice(0, 15).map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        ticket.priority === "urgent" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" :
                        ticket.priority === "high" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" :
                        "bg-muted text-muted-foreground"
                      }`}>{ticket.priority}</span>
                      <span className="text-xs text-muted-foreground">#{ticket.ticketNumber}</span>
                    </div>
                    <p className="font-medium text-sm truncate">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ticket.requesterEmail ?? ticket.requesterName ?? "Unknown"} · {ticket.category} · {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => setActiveSection("support")}
                  >
                    Reply
                  </Button>
                </div>
              ))}
              {tickets.length > 15 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{tickets.length - 15} more — <button className="underline" onClick={() => setActiveSection("support")}>view all in Support</button>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Queue 7: Unresponded support tickets (ball in admin's court) */}
        {unresponded.length > 0 && (
          <Card className="border-orange-300 dark:border-orange-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-orange-700 dark:text-orange-400">
                <MessageSquare className="h-4 w-4" />
                Waiting for Your Reply
                <Badge variant="destructive" className="ml-1">{unresponded.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">User sent a message 4h+ ago — no admin reply yet.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {unresponded.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between p-3 border border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50/30 dark:bg-orange-950/20 hover:bg-orange-50/60">
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        ticket.priority === "urgent" ? "bg-red-100 text-red-700" :
                        ticket.priority === "high" ? "bg-orange-100 text-orange-700" :
                        "bg-muted text-muted-foreground"
                      }`}>{ticket.priority}</span>
                      <span className="text-xs text-muted-foreground">#{ticket.ticketNumber}</span>
                    </div>
                    <p className="font-medium text-sm truncate">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ticket.requesterEmail ?? ticket.requesterName ?? "Unknown"} · Last activity: {ticket.lastActivityAt ? new Date(ticket.lastActivityAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <Button size="sm" variant="default" className="h-7 text-xs shrink-0" onClick={() => setActiveSection("support")}>
                    Reply now
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Queue 8: Multi-reported users */}
        {multiReported.length > 0 && (
          <Card className="border-red-300 dark:border-red-800">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Multi-Reported Users
                <Badge variant="destructive" className="ml-1">{multiReported.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">These users have 2+ pending reports in the last 7 days — likely a pattern.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {multiReported.map((u) => (
                <div key={u.userId} className="flex items-center justify-between p-3 border border-red-200 dark:border-red-900 rounded-lg bg-red-50/30 dark:bg-red-950/20 hover:bg-red-50/60">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="font-medium text-sm truncate">{u.email ?? u.userId}</p>
                    <p className="text-xs text-muted-foreground">{u.fullName ?? "—"} · <span className="font-semibold text-red-600">{u.reportCount} reports</span> in 7 days</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0 text-red-700 border-red-400"
                    onClick={() => { setActiveSection("users"); setSearchQuery(u.email ?? ""); }}
                  >
                    Investigate
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Queue 9: Flagged community posts */}
        {flaggedPosts.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Flag className="h-4 w-4 text-yellow-600" />
                Flagged Posts
                <Badge className="ml-1">{flaggedPosts.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Community posts caught by auto-moderation — approve or reject.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {flaggedPosts.slice(0, 12).map((post) => (
                <div key={post.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/30">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-sm truncate">{post.caption.length > 100 ? post.caption.slice(0, 100) + "…" : post.caption}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {post.userEmail ?? post.userId} · {post.postType ?? "post"} · {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-green-700 border-green-400 hover:bg-green-50"
                      onClick={() => approvePostMutation.mutate(post.id)}
                      disabled={approvePostMutation.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-700 border-red-400 hover:bg-red-50"
                      onClick={() => rejectPostMutation.mutate({ postId: post.id, reason: "Rejected by admin" })}
                      disabled={rejectPostMutation.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
              {flaggedPosts.length > 12 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{flaggedPosts.length - 12} more — <button className="underline" onClick={() => setActiveSection("logs")}>view all in Logs</button>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Queue 10: Stale active deals */}
        {staleDeals.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-yellow-600" />
                Stale Deals (7+ days inactive)
                <Badge variant="outline" className="ml-1">{staleDeals.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Active deals with no activity in over a week — users may be stuck.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {staleDeals.slice(0, 10).map((deal) => (
                <div key={deal.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="font-medium text-sm">Deal #{deal.dealNumber}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {deal.seekerOffer} ↔ {deal.providerOffer}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      State: <span className="capitalize">{deal.state}</span> · Last update: {deal.updatedAt ? new Date(deal.updatedAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => setActiveSection("deals")}
                  >
                    View
                  </Button>
                </div>
              ))}
              {staleDeals.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{staleDeals.length - 10} more — <button className="underline" onClick={() => setActiveSection("deals")}>view all in Deals</button>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* All clear */}
        {totalQueue === 0 && !morningCheckLoading && (
          <div className="text-center py-20">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold">All queues clear</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-xs mx-auto">
              No pending listings, verifications, reports, disputes, or tickets. Auto-refreshes every 7 hours.
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeSection) {
      case "queue":
        return renderMorningCheck();
      case "dashboard":
        return renderDashboard();
      case "users":
        return renderUsers();
      case "listings":
        return renderListings();
      case "deals":
        return renderDeals();
      case "disputes":
        return renderDisputes();
      case "reports":
        return renderReports();
      case "flags":
        return renderFlags();
      case "logs":
        return renderLogs();
      case "waitlist":
        return renderWaitlist();
      case "feature-waitlist":
        return <FeatureWaitlistAdminSection />;
      case "intl-waitlist":
        return <InternationalWaitlistSection />;
      case "legal":
        return <AdminLegalSection />;
      case "email":
        return renderEmail();
      case "support":
        return renderSupportSection();
      case "reviews":
        return renderReviews();
      case "creators":
        return renderCreators();
      case "collabs":
        return renderCollabs();
      case "analytics":
        return renderAnalytics();
      case "feature-stats":
        return renderFeatureHub();
      case "barter-credits":
        return renderBarterCredits();
      case "success-stories":
        return renderSuccessStories();
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
              {!sidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
              {!sidebarCollapsed && item.badge ? (
                <span className="ml-auto text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 leading-none min-w-[1.25rem] text-center">
                  {item.badge}
                </span>
              ) : null}
              {sidebarCollapsed && item.badge ? (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
              ) : null}
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

              <div>
                <p className="text-xs text-muted-foreground mb-2">State Lifecycle</p>
                <div className="space-y-0">
                  {[
                    { label: "Created", ts: selectedDeal.createdAt, color: "bg-primary", always: true },
                    { label: "Proposed", ts: (selectedDeal as DealWithUsers & { proposedAt?: string }).proposedAt, color: "bg-blue-500", always: false },
                    { label: "Accepted", ts: (selectedDeal as DealWithUsers & { acceptedAt?: string }).acceptedAt, color: "bg-indigo-500", always: false },
                    { label: "Completed", ts: (selectedDeal as DealWithUsers & { completedAt?: string }).completedAt, color: "bg-green-500", always: false },
                    { label: "Cancelled", ts: (selectedDeal as DealWithUsers & { cancelledAt?: string }).cancelledAt, color: "bg-red-500", always: false },
                  ].filter(step => step.always || step.ts).map((step, idx, arr) => (
                    <div key={step.label} className="flex items-center gap-2 text-xs">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${step.ts ? step.color : "border-2 border-muted-foreground"}`} />
                        {idx < arr.length - 1 && <div className="w-px h-4 bg-border" />}
                      </div>
                      <div>
                        <span className="font-medium">{step.label}</span>
                        <span className="text-muted-foreground ml-2">{step.ts ? new Date(step.ts).toLocaleString() : ""}</span>
                      </div>
                    </div>
                  ))}
                  {selectedDeal.state !== "completed" && selectedDeal.state !== "cancelled" && (
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full border-2 border-muted-foreground animate-pulse" />
                      </div>
                      <span className="text-muted-foreground italic">Awaiting next step</span>
                    </div>
                  )}
                </div>
              </div>

              {selectedDeal.state !== "completed" && selectedDeal.state !== "cancelled" && (
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    className="gap-2"
                    onClick={() => dealStateMutation.mutate({ dealId: selectedDeal.id, state: "completed" })}
                    disabled={dealStateMutation.isPending}
                    data-testid="button-deal-complete"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Mark Complete
                  </Button>
                  <Button
                    variant="destructive"
                    className="gap-2"
                    onClick={() => dealStateMutation.mutate({ dealId: selectedDeal.id, state: "cancelled" })}
                    disabled={dealStateMutation.isPending}
                    data-testid="button-deal-cancel"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel Deal
                  </Button>
                </div>
              )}

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

      {/* Grant / Remove Admin Access Dialog */}
      <Dialog
        open={adminRoleDialog.open}
        onOpenChange={(open) => !open && setAdminRoleDialog({ open: false, user: null, action: "promote" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              {adminRoleDialog.action === "promote" ? "Grant Admin Access" : "Remove Admin Access"}
            </DialogTitle>
            <DialogDescription>
              {adminRoleDialog.action === "promote" ? (
                <>
                  This will give <strong>{adminRoleDialog.user?.fullName}</strong> ({adminRoleDialog.user?.email}) full access to the admin panel. They will be able to manage users, listings, and platform settings.
                </>
              ) : (
                <>
                  This will revoke <strong>{adminRoleDialog.user?.fullName}</strong>'s ({adminRoleDialog.user?.email}) admin panel access. They will no longer be able to perform admin actions.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdminRoleDialog({ open: false, user: null, action: "promote" })}
            >
              Cancel
            </Button>
            <Button
              variant={adminRoleDialog.action === "promote" ? "default" : "destructive"}
              onClick={() => {
                if (!adminRoleDialog.user) return;
                if (adminRoleDialog.action === "promote") {
                  promoteMutation.mutate(adminRoleDialog.user.id);
                } else {
                  demoteMutation.mutate(adminRoleDialog.user.id);
                }
              }}
              disabled={promoteMutation.isPending || demoteMutation.isPending}
              data-testid={`button-confirm-admin-role`}
            >
              {adminRoleDialog.action === "promote" ? "Grant Access" : "Remove Access"}
            </Button>
          </DialogFooter>
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

      {/* User Detail Drawer */}
      <Sheet open={!!selectedUserId} onOpenChange={(open) => !open && setSelectedUserId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="drawer-user-detail">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3">
              {userDetail && (
                <>
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={userDetail.avatarUrl || undefined} />
                    <AvatarFallback>{userDetail.fullName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      {userDetail.fullName}
                      {userDetail.isVerified && <VerifiedBadge kycStatus={userDetail.kycStatus} kybStatus={userDetail.kybStatus} size="sm" />}
                    </div>
                    <p className="text-sm font-normal text-muted-foreground">{userDetail.email}</p>
                  </div>
                </>
              )}
            </SheetTitle>
            <SheetDescription>User account details and activity</SheetDescription>
          </SheetHeader>

          {userDetail && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Role</p>
                  <Badge variant={userDetail.role === "admin" ? "destructive" : "secondary"}>{userDetail.role}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  {userDetail.isBanned ? (
                    <Badge variant="destructive">Banned</Badge>
                  ) : (
                    <Badge variant="outline" className="text-green-600">Active</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Business</p>
                  <p className="text-sm font-medium">{userDetail.businessName || "-"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="text-sm font-medium">{userDetail.location || "-"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">KYC Status</p>
                  <Badge variant="outline">{userDetail.kycStatus || "none"}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">KYB Status</p>
                  <Badge variant="outline">{userDetail.kybStatus || "none"}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Joined</p>
                  <p className="text-sm">{userDetail.createdAt ? new Date(userDetail.createdAt).toLocaleDateString() : "-"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Verification</p>
                  <p className="text-sm">
                    {(userDetail as any).emailVerified && (userDetail as any).phoneVerified
                      ? "Done (2/2) — email + WhatsApp"
                      : (userDetail as any).emailVerified
                        ? "1/2 — email verified, WhatsApp pending"
                        : (userDetail as any).phoneVerified
                          ? "1/2 — WhatsApp verified, email pending"
                          : "0/2 — not started"}
                  </p>
                </div>
              </div>

              <Separator />

              {(userDetail.verificationDocUrl || userDetail.businessLicenseUrl) && (
                <>
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Verification Documents
                    </h4>
                    <div className="space-y-2">
                      {userDetail.verificationDocUrl && (
                        <div className="flex items-center gap-2 p-2 border rounded-lg">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <a href={userDetail.verificationDocUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline" data-testid="link-kyc-doc">KYC Document</a>
                        </div>
                      )}
                      {userDetail.businessLicenseUrl && (
                        <div className="flex items-center gap-2 p-2 border rounded-lg">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <a href={userDetail.businessLicenseUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline" data-testid="link-kyb-doc">Business License</a>
                        </div>
                      )}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Activity Summary
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2 border rounded-lg">
                    <p className="text-lg font-bold">{userDetail.listings?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Listings</p>
                  </div>
                  <div className="text-center p-2 border rounded-lg">
                    <p className="text-lg font-bold">{userDetail.deals?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Deals</p>
                  </div>
                  <div className="text-center p-2 border rounded-lg">
                    <p className="text-lg font-bold">{userDetail.deals?.filter((d: DealWithUsers) => d.state === "completed").length || 0}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                </div>
                {userDetail.lastActiveAt && (
                  <p className="text-xs text-muted-foreground mt-2">Last active: {new Date(userDetail.lastActiveAt).toLocaleString()}</p>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Listings ({userDetail.listings?.length || 0})
                </h4>
                {userDetail.listings && userDetail.listings.length > 0 ? (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {userDetail.listings.map((listing: Listing) => (
                      <div key={listing.id} className="flex items-center justify-between p-2 border rounded-lg">
                        <div>
                          <p className="text-sm font-medium line-clamp-1">{listing.title}</p>
                          <p className="text-xs text-muted-foreground">AED {parseFloat(listing.retailValue as string).toLocaleString()}</p>
                        </div>
                        <Badge variant={listing.isActive ? "outline" : "secondary"} className={listing.isActive ? "text-green-600" : ""}>
                          {listing.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No listings</p>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Handshake className="h-4 w-4" />
                  Deals ({userDetail.deals?.length || 0})
                </h4>
                {userDetail.deals && userDetail.deals.length > 0 ? (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {userDetail.deals.map((deal: DealWithUsers) => (
                      <div key={deal.id} className="flex items-center justify-between p-2 border rounded-lg">
                        <div>
                          <p className="text-sm font-medium">Deal #{deal.dealNumber}</p>
                          <p className="text-xs text-muted-foreground">{deal.seekerOffer} ↔ {deal.providerOffer}</p>
                        </div>
                        <Badge>{deal.state}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No deals</p>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Megaphone className="h-4 w-4" />
                  Marketing Consent
                </h4>
                <div className="flex items-center justify-between p-2 border rounded-lg">
                  <p className="text-sm">{userDetail.marketingEmails ? "Opted in to marketing emails" : "Opted out of marketing emails"}</p>
                  <Button
                    size="sm"
                    variant={userDetail.marketingEmails ? "outline" : "default"}
                    onClick={() => marketingConsentMutation.mutate({ userId: userDetail.id, marketingEmails: !userDetail.marketingEmails })}
                    disabled={marketingConsentMutation.isPending}
                    data-testid="button-toggle-marketing-consent"
                  >
                    {userDetail.marketingEmails ? "Opt Out" : "Opt In"}
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { setEmailDialog({ open: true, user: userDetail, subject: "", body: "" }); }} data-testid="button-drawer-email">
                  <Mail className="h-3.5 w-3.5" />Email
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => resetPasswordMutation.mutate(userDetail.id)} data-testid="button-drawer-reset-password">
                  <KeyRound className="h-3.5 w-3.5" />Reset Password
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => revokeSessionsMutation.mutate(userDetail.id)} disabled={revokeSessionsMutation.isPending} data-testid="button-drawer-revoke-sessions">
                  <Power className="h-3.5 w-3.5" />Revoke Sessions
                </Button>
                <Button size="sm" variant="outline" className="gap-1" asChild data-testid="button-drawer-dsar-export">
                  <a href={`/api/admin/users/${userDetail.id}/export`} download>
                    <Download className="h-3.5 w-3.5" />Export (DSAR)
                  </a>
                </Button>
                <Button size="sm" variant="destructive" className="gap-1" onClick={() => setDeleteDialog({ open: true, user: userDetail })} data-testid="button-drawer-delete">
                  <Trash2 className="h-3.5 w-3.5" />Delete (PDPL)
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Send Email Dialog */}
      <Dialog open={emailDialog.open} onOpenChange={(open) => !open && setEmailDialog({ open: false, user: null, subject: "", body: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Email to {emailDialog.user?.fullName}</DialogTitle>
            <DialogDescription>
              Send an email from the Bareter admin team to {emailDialog.user?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Email subject..."
                value={emailDialog.subject}
                onChange={(e) => setEmailDialog({ ...emailDialog, subject: e.target.value })}
                data-testid="input-email-subject"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Write your message..."
                value={emailDialog.body}
                onChange={(e) => setEmailDialog({ ...emailDialog, body: e.target.value })}
                className="min-h-[150px]"
                data-testid="input-email-body"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialog({ open: false, user: null, subject: "", body: "" })}>
              Cancel
            </Button>
            <Button
              disabled={!emailDialog.subject || !emailDialog.body || sendEmailMutation.isPending}
              onClick={() => emailDialog.user && sendEmailMutation.mutate({ userId: emailDialog.user.id, subject: emailDialog.subject, body: emailDialog.body })}
              data-testid="button-send-email"
            >
              {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User (PDPL) Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, user: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete User Account</DialogTitle>
            <DialogDescription>
              This will permanently erase all data for <strong>{deleteDialog.user?.fullName}</strong> ({deleteDialog.user?.email}) under UAE PDPL compliance. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 border rounded-lg p-4 bg-destructive/5">
            <p className="text-sm font-medium text-destructive mb-2">The following will be permanently deleted:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>User profile and personal data</li>
              <li>All listings created by this user</li>
              <li>All deals and messages</li>
              <li>KYC/KYB verification records</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, user: null })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteUserMutation.isPending}
              onClick={() => deleteDialog.user && deleteUserMutation.mutate(deleteDialog.user.id)}
              data-testid="button-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Permanently Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Listing Detail Dialog */}
      <Dialog open={!!selectedListingId} onOpenChange={(open) => !open && setSelectedListingId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="dialog-listing-detail">
          <DialogHeader>
            <DialogTitle>Listing Details</DialogTitle>
            <DialogDescription>Full listing information and moderation history</DialogDescription>
          </DialogHeader>
          {(() => {
            const listing = listings?.find(l => l.id === selectedListingId);
            if (!listing) return <p className="text-muted-foreground text-sm">Loading...</p>;
            return (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  {listing.images && (listing.images as string[]).length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {(listing.images as string[]).map((url, i) => (
                        <img key={i} src={assetUrl(url)} alt={`Listing image ${i + 1}`} className="h-24 w-24 rounded-lg object-cover border" />
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Title</p>
                      <p className="font-medium">{listing.title}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="text-sm">{listing.description}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <Badge>{listing.type}</Badge>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Retail Value</p>
                      <p className="font-medium">AED {parseFloat(listing.retailValue as string).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Categories</p>
                      <div className="flex gap-1 flex-wrap">
                        {((listing.categories as string[]) || []).map(cat => (
                          <Badge key={cat} variant="outline">{cat}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Owner</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={listing.user.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">{listing.user.fullName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{listing.user.fullName}</span>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <Badge variant={listing.isActive ? "outline" : "secondary"} className={listing.isActive ? "text-green-600" : ""}>
                          {listing.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Moderation</p>
                        <Badge variant={
                          listing.moderationStatus === "approved" ? "default" :
                          listing.moderationStatus === "rejected" ? "destructive" : "secondary"
                        }>{listing.moderationStatus || "pending"}</Badge>
                      </div>
                      {listing.isFeatured && (
                        <div>
                          <p className="text-xs text-muted-foreground">Featured</p>
                          <Badge className="bg-amber-500 text-white gap-1"><Star className="h-3 w-3" />Featured</Badge>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>{listing.viewCount || 0} views</span>
                      <span>{listing.likeCount || 0} likes</span>
                      <span>{listing.commentCount || 0} proposals</span>
                    </div>
                  </div>
                </div>

                {listing.valueFlagged || listing.imageFlagged ? (
                  <div className="border border-amber-500/40 rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />Moderation Flags</p>
                    {listing.valueFlagged && <p className="text-sm text-amber-600">Value flagged by AI moderation</p>}
                    {listing.imageFlagged && <p className="text-sm text-amber-600">Image flagged by AI moderation</p>}
                  </div>
                ) : null}

                <Separator />

                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Moderation History
                  </h4>
                  {listingModerationHistory && listingModerationHistory.length > 0 ? (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {listingModerationHistory.map((log: ModerationLog, i: number) => (
                        <div key={log.id || i} className="flex items-start gap-3 p-2 border rounded-lg">
                          <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                            log.action?.includes("approve") ? "bg-green-500" :
                            log.action?.includes("reject") ? "bg-red-500" :
                            log.action?.includes("flag") ? "bg-amber-500" : "bg-gray-400"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{log.action}</p>
                            {log.reason && <p className="text-xs text-muted-foreground">{log.reason}</p>}
                            <p className="text-xs text-muted-foreground mt-1">
                              {log.adminUserId ? "By admin" : "By AI"}{log.confidence ? ` (${(parseFloat(log.confidence) * 100).toFixed(0)}% confidence)` : ""}
                              {" · "}{log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No moderation history</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {listing.moderationStatus !== "approved" && (
                    <Button size="sm" className="gap-1" onClick={() => approveListingMutation.mutate(listing.id)} data-testid="button-dialog-approve">
                      <CheckCircle className="h-3.5 w-3.5" />Approve
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => setRejectDialog({ open: true, listingId: listing.id, reason: "" })} data-testid="button-dialog-reject">
                    <XCircle className="h-3.5 w-3.5" />Reject
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditListingDialog({ open: true, listing, categories: (listing.categories as string[]) || [], retailValue: String(listing.retailValue) })} data-testid="button-dialog-edit">
                    <Pencil className="h-3.5 w-3.5" />Edit
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => featureListingMutation.mutate({ listingId: listing.id, featured: !listing.isFeatured })} data-testid="button-dialog-feature">
                    <Star className="h-3.5 w-3.5" />{listing.isFeatured ? "Unfeature" : "Feature"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Reject Listing Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => !open && setRejectDialog({ open: false, listingId: null, reason: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Listing</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this listing. The owner will be notified via email.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label>Reason for rejection</Label>
            <Textarea
              placeholder="Enter the reason for rejection..."
              value={rejectDialog.reason}
              onChange={(e) => setRejectDialog({ ...rejectDialog, reason: e.target.value })}
              className="min-h-[100px]"
              data-testid="input-reject-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, listingId: null, reason: "" })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectDialog.reason || rejectListingMutation.isPending}
              onClick={() => rejectDialog.listingId && rejectListingMutation.mutate({ listingId: rejectDialog.listingId, reason: rejectDialog.reason })}
              data-testid="button-confirm-reject"
            >
              {rejectListingMutation.isPending ? "Rejecting..." : "Reject Listing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Listing Dialog */}
      <Dialog open={editListingDialog.open} onOpenChange={(open) => !open && setEditListingDialog({ open: false, listing: null, categories: [], retailValue: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Listing</DialogTitle>
            <DialogDescription>
              Update the categories or retail value for "{editListingDialog.listing?.title}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Retail Value (AED)</Label>
              <Input
                type="number"
                value={editListingDialog.retailValue}
                onChange={(e) => setEditListingDialog({ ...editListingDialog, retailValue: e.target.value })}
                data-testid="input-edit-retail-value"
              />
            </div>
            <div className="space-y-2">
              <Label>Categories</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <Badge
                    key={cat}
                    variant={editListingDialog.categories.includes(cat) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => {
                      const cats = editListingDialog.categories.includes(cat)
                        ? editListingDialog.categories.filter(c => c !== cat)
                        : [...editListingDialog.categories, cat];
                      setEditListingDialog({ ...editListingDialog, categories: cats });
                    }}
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditListingDialog({ open: false, listing: null, categories: [], retailValue: "" })}>
              Cancel
            </Button>
            <Button
              disabled={editListingMutation.isPending || editListingDialog.categories.length === 0}
              onClick={() => editListingDialog.listing && editListingMutation.mutate({
                listingId: editListingDialog.listing.id,
                categories: editListingDialog.categories,
                retailValue: editListingDialog.retailValue,
              })}
              data-testid="button-confirm-edit-listing"
            >
              {editListingMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Detail Dialog */}
      <Dialog open={!!selectedDispute} onOpenChange={(open) => !open && setSelectedDispute(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-dispute-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5" />
              Dispute Details
            </DialogTitle>
            <DialogDescription>{selectedDispute?.subject}</DialogDescription>
          </DialogHeader>
          {selectedDispute && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Party A</p>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">{selectedDispute.partyA?.fullName?.charAt(0) || "?"}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{selectedDispute.partyA?.fullName}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Party B</p>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">{selectedDispute.partyB?.fullName?.charAt(0) || "?"}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{selectedDispute.partyB?.fullName}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={
                    selectedDispute.status === "resolved" ? "default" :
                    selectedDispute.status === "in_mediation" ? "secondary" : "outline"
                  }>{selectedDispute.status.replace("_", " ")}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm">{selectedDispute.createdAt ? new Date(selectedDispute.createdAt).toLocaleString() : "-"}</p>
                </div>
              </div>

              {selectedDispute.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm border rounded-lg p-3">{selectedDispute.description}</p>
                </div>
              )}

              {Array.isArray(selectedDispute.evidence) && selectedDispute.evidence.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><FileText className="h-3 w-3" />Evidence ({selectedDispute.evidence.length})</p>
                  <div className="space-y-2">
                    {selectedDispute.evidence.map((ev: { submittedBy: string; submittedByName?: string; description: string; fileUrls?: string[]; submittedAt: string }, idx: number) => (
                      <div key={idx} className="border rounded-lg p-3 text-sm space-y-1" data-testid={`evidence-item-${idx}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-xs">{ev.submittedByName || "Unknown"}</span>
                          <span className="text-xs text-muted-foreground">{new Date(ev.submittedAt).toLocaleString()}</span>
                        </div>
                        <p>{ev.description}</p>
                        {ev.fileUrls && ev.fileUrls.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {ev.fileUrls.map((url: string, fi: number) => (
                              <a key={fi} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">File {fi + 1}</a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDispute.status !== "resolved" && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Add Evidence</p>
                  <div className="flex gap-2">
                    <Textarea
                      value={evidenceText}
                      onChange={(e) => setEvidenceText(e.target.value)}
                      placeholder="Describe the evidence..."
                      className="text-sm min-h-[60px]"
                      data-testid="input-evidence-description"
                    />
                    <Button
                      size="sm"
                      className="gap-1 self-end"
                      disabled={!evidenceText.trim() || addEvidenceMutation.isPending}
                      onClick={() => addEvidenceMutation.mutate({ id: selectedDispute.id, description: evidenceText.trim() })}
                      data-testid="button-add-evidence"
                    >
                      <Plus className="h-3 w-3" />{addEvidenceMutation.isPending ? "Adding..." : "Add"}
                    </Button>
                  </div>
                </div>
              )}

              {selectedDispute.escalatedAt && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
                  <AlertTriangle className="h-4 w-4" />
                  Escalated on {new Date(selectedDispute.escalatedAt).toLocaleString()}
                </div>
              )}

              {selectedDispute.decision && (
                <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
                  <h4 className="font-medium text-sm flex items-center gap-2"><Gavel className="h-4 w-4" />Decision</h4>
                  <p className="text-sm">{selectedDispute.decision}</p>
                  {selectedDispute.decisionReasoning && (
                    <p className="text-sm text-muted-foreground">{selectedDispute.decisionReasoning}</p>
                  )}
                  <Badge>{selectedDispute.outcome?.replace(/_/g, " ")}</Badge>
                  {selectedDispute.decisionByAdmin && (
                    <p className="text-xs text-muted-foreground">By {selectedDispute.decisionByAdmin.fullName} on {selectedDispute.decisionAt ? new Date(selectedDispute.decisionAt).toLocaleString() : ""}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {selectedDispute.status !== "resolved" && (
                  <>
                    {selectedDispute.status === "open" && (
                      <Button variant="outline" className="gap-2" onClick={() => disputeEscalateMutation.mutate(selectedDispute.id)} disabled={disputeEscalateMutation.isPending} data-testid="button-dialog-escalate-dispute">
                        <AlertTriangle className="h-4 w-4" />Escalate to Mediation
                      </Button>
                    )}
                    <Button className="gap-2" onClick={() => setDisputeDecisionDialog({ open: true, dispute: selectedDispute, decision: "", reasoning: "", outcome: "" })} data-testid="button-dialog-decide-dispute">
                      <Gavel className="h-4 w-4" />Make Decision
                    </Button>
                  </>
                )}
                {selectedDispute.status !== "in_mediation" && (
                  <Button variant="destructive" className="gap-2" onClick={() => { if (confirm("Delete this dispute permanently?")) disputeDeleteMutation.mutate(selectedDispute.id); }} disabled={disputeDeleteMutation.isPending} data-testid="button-dialog-delete-dispute">
                    <Trash2 className="h-4 w-4" />Delete
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dispute Decision Dialog */}
      <Dialog open={disputeDecisionDialog.open} onOpenChange={(open) => { if (!open) { setDisputeDecisionDialog({ open: false, dispute: null, decision: "", reasoning: "", outcome: "" }); setDisputeAiSuggestion({ loading: false }); } }}>
        <DialogContent className="max-w-lg" data-testid="dialog-dispute-decision">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <DialogTitle>Resolve Dispute</DialogTitle>
                <DialogDescription className="mt-1">
                  Enter your decision for "{disputeDecisionDialog.dispute?.subject}". Both parties will be notified by email.
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0 border-primary/40 text-primary hover:bg-primary/10"
                disabled={disputeAiSuggestion.loading}
                data-testid="button-ai-dispute-suggest"
                onClick={async () => {
                  if (!disputeDecisionDialog.dispute) return;
                  setDisputeAiSuggestion({ loading: true });
                  try {
                    const res = await apiRequest("POST", "/api/ai/admin/dispute-suggest", { disputeId: disputeDecisionDialog.dispute.id });
                    const data = await res.json();
                    setDisputeAiSuggestion({ loading: false, ...data });
                  } catch {
                    setDisputeAiSuggestion({ loading: false, error: "AI suggestion failed. Please try again." });
                  }
                }}
              >
                {disputeAiSuggestion.loading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {disputeAiSuggestion.loading ? "Analyzing…" : "AI Assist"}
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* AI Suggestion Panel */}
            {(disputeAiSuggestion.loading || disputeAiSuggestion.analysis || disputeAiSuggestion.error) && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-3" data-testid="panel-ai-dispute-suggestion">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">AI Analysis</span>
                  {disputeAiSuggestion.confidence && !disputeAiSuggestion.loading && (
                    <Badge variant="outline" className="text-xs capitalize ml-auto">
                      {disputeAiSuggestion.confidence} confidence
                    </Badge>
                  )}
                </div>

                {disputeAiSuggestion.loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Analyzing dispute details and evidence…
                  </div>
                ) : disputeAiSuggestion.error ? (
                  <p className="text-sm text-destructive">{disputeAiSuggestion.error}</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground leading-relaxed">{disputeAiSuggestion.analysis}</p>

                    <div className="space-y-2 pt-1">
                      {/* Suggested outcome row */}
                      <div className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2 border">
                        <div className="text-sm">
                          <span className="text-xs text-muted-foreground block">Suggested outcome</span>
                          <span className="font-medium">
                            {disputeAiSuggestion.suggestedOutcome === "in_favor_party_a" && `In favor of ${disputeDecisionDialog.dispute?.partyA?.fullName || "Party A"}`}
                            {disputeAiSuggestion.suggestedOutcome === "in_favor_party_b" && `In favor of ${disputeDecisionDialog.dispute?.partyB?.fullName || "Party B"}`}
                            {disputeAiSuggestion.suggestedOutcome === "mutual" && "Mutual agreement"}
                            {disputeAiSuggestion.suggestedOutcome === "dismissed" && "Dismissed"}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 h-7 text-xs"
                          onClick={() => setDisputeDecisionDialog({ ...disputeDecisionDialog, outcome: disputeAiSuggestion.suggestedOutcome || "" })}
                          data-testid="button-ai-apply-outcome"
                        >Apply</Button>
                      </div>

                      {/* Suggested decision */}
                      {disputeAiSuggestion.suggestedDecision && (
                        <div className="rounded-md bg-background border px-3 py-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Suggested decision</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setDisputeDecisionDialog({ ...disputeDecisionDialog, decision: disputeAiSuggestion.suggestedDecision || "" })}
                              data-testid="button-ai-apply-decision"
                            >Apply</Button>
                          </div>
                          <p className="text-sm text-foreground/90">{disputeAiSuggestion.suggestedDecision}</p>
                        </div>
                      )}

                      {/* Suggested reasoning */}
                      {disputeAiSuggestion.suggestedReasoning && (
                        <div className="rounded-md bg-background border px-3 py-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Suggested reasoning</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setDisputeDecisionDialog({ ...disputeDecisionDialog, reasoning: disputeAiSuggestion.suggestedReasoning || "" })}
                              data-testid="button-ai-apply-reasoning"
                            >Apply</Button>
                          </div>
                          <p className="text-sm text-foreground/90">{disputeAiSuggestion.suggestedReasoning}</p>
                        </div>
                      )}

                      {/* Apply all */}
                      <Button
                        size="sm"
                        className="w-full gap-1.5 h-8"
                        onClick={() => setDisputeDecisionDialog({
                          ...disputeDecisionDialog,
                          outcome: disputeAiSuggestion.suggestedOutcome || disputeDecisionDialog.outcome,
                          decision: disputeAiSuggestion.suggestedDecision || disputeDecisionDialog.decision,
                          reasoning: disputeAiSuggestion.suggestedReasoning || disputeDecisionDialog.reasoning,
                        })}
                        data-testid="button-ai-apply-all"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Apply All Suggestions
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Outcome selector */}
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select value={disputeDecisionDialog.outcome} onValueChange={(v) => setDisputeDecisionDialog({ ...disputeDecisionDialog, outcome: v })}>
                <SelectTrigger data-testid="select-dispute-outcome">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_favor_party_a">
                    In favor of {disputeDecisionDialog.dispute?.partyA?.fullName || "Party A"}
                  </SelectItem>
                  <SelectItem value="in_favor_party_b">
                    In favor of {disputeDecisionDialog.dispute?.partyB?.fullName || "Party B"}
                  </SelectItem>
                  <SelectItem value="mutual">Mutual agreement</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Decision textarea */}
            <div className="space-y-2">
              <Label>Decision</Label>
              <Textarea
                placeholder="Enter your decision..."
                value={disputeDecisionDialog.decision}
                onChange={(e) => setDisputeDecisionDialog({ ...disputeDecisionDialog, decision: e.target.value })}
                className="min-h-[90px]"
                data-testid="input-dispute-decision"
              />
            </div>

            {/* Reasoning textarea */}
            <div className="space-y-2">
              <Label>Reasoning <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Provide reasoning for the decision..."
                value={disputeDecisionDialog.reasoning}
                onChange={(e) => setDisputeDecisionDialog({ ...disputeDecisionDialog, reasoning: e.target.value })}
                data-testid="input-dispute-reasoning"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDisputeDecisionDialog({ open: false, dispute: null, decision: "", reasoning: "", outcome: "" }); setDisputeAiSuggestion({ loading: false }); }}>
              Cancel
            </Button>
            <Button
              disabled={!disputeDecisionDialog.decision || !disputeDecisionDialog.outcome || disputeDecisionMutation.isPending}
              onClick={() => disputeDecisionDialog.dispute && disputeDecisionMutation.mutate({
                id: disputeDecisionDialog.dispute.id,
                decision: disputeDecisionDialog.decision,
                decisionReasoning: disputeDecisionDialog.reasoning,
                outcome: disputeDecisionDialog.outcome,
              })}
              data-testid="button-confirm-dispute-decision"
            >
              {disputeDecisionMutation.isPending ? "Resolving..." : "Resolve Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dispute Dialog */}
      <Dialog open={createDisputeDialog.open} onOpenChange={(open) => !open && setCreateDisputeDialog({ open: false, partyAId: "", partyBId: "", subject: "", description: "", dealId: "" })}>
        <DialogContent data-testid="dialog-create-dispute">
          <DialogHeader>
            <DialogTitle>Create Dispute</DialogTitle>
            <DialogDescription>Open a new dispute between two parties</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Brief subject of the dispute"
                value={createDisputeDialog.subject}
                onChange={(e) => setCreateDisputeDialog({ ...createDisputeDialog, subject: e.target.value })}
                data-testid="input-dispute-subject"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Party A (User ID)</Label>
                <Input
                  placeholder="User ID"
                  value={createDisputeDialog.partyAId}
                  onChange={(e) => setCreateDisputeDialog({ ...createDisputeDialog, partyAId: e.target.value })}
                  data-testid="input-dispute-party-a"
                />
              </div>
              <div className="space-y-2">
                <Label>Party B (User ID)</Label>
                <Input
                  placeholder="User ID"
                  value={createDisputeDialog.partyBId}
                  onChange={(e) => setCreateDisputeDialog({ ...createDisputeDialog, partyBId: e.target.value })}
                  data-testid="input-dispute-party-b"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Deal ID (optional)</Label>
              <Input
                placeholder="Related deal ID"
                value={createDisputeDialog.dealId}
                onChange={(e) => setCreateDisputeDialog({ ...createDisputeDialog, dealId: e.target.value })}
                data-testid="input-dispute-deal-id"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe the dispute..."
                value={createDisputeDialog.description}
                onChange={(e) => setCreateDisputeDialog({ ...createDisputeDialog, description: e.target.value })}
                className="min-h-[100px]"
                data-testid="input-dispute-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDisputeDialog({ open: false, partyAId: "", partyBId: "", subject: "", description: "", dealId: "" })}>
              Cancel
            </Button>
            <Button
              disabled={!createDisputeDialog.subject || !createDisputeDialog.partyAId || !createDisputeDialog.partyBId || createDisputeMutation.isPending}
              onClick={() => createDisputeMutation.mutate({
                partyAId: createDisputeDialog.partyAId,
                partyBId: createDisputeDialog.partyBId,
                subject: createDisputeDialog.subject,
                description: createDisputeDialog.description || undefined,
                dealId: createDisputeDialog.dealId || undefined,
              })}
              data-testid="button-confirm-create-dispute"
            >
              {createDisputeMutation.isPending ? "Creating..." : "Create Dispute"}
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
  const { toast } = useToast();
  const { data: modeData } = useQuery<{ enabled: boolean; count: number }>({
    queryKey: ["/api/waitlist/mode"],
  });
  const { data, isLoading } = useQuery<{
    entries: WaitlistEntryRow[];
    total: number;
    stats: { byCountry: Array<{ country: string; count: number }>; byDay: Array<{ day: string; count: number }> };
  }>({
    queryKey: ["/api/admin/waitlist"],
    staleTime: 0,
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

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleId = (id: number) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = (ids: number[]) => setSelectedIds((prev) => prev.size === ids.length && ids.every((id) => prev.has(id)) ? new Set() : new Set(ids));

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", name: "", country: "", city: "", accountType: "", businessName: "" });

  const addMutation = useMutation({
    mutationFn: async (body: typeof addForm) => {
      const res = await apiRequest("POST", "/api/admin/waitlist", {
        email: body.email,
        name: body.name || undefined,
        country: body.country || undefined,
        city: body.city || undefined,
        accountType: body.accountType || undefined,
        businessName: body.businessName || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist"] });
      setAddOpen(false);
      setAddForm({ email: "", name: "", country: "", city: "", accountType: "", businessName: "" });
      toast({ title: "Added to waitlist" });
    },
    onError: (err: Error) => toast({ title: "Failed to add entry", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      if (ids.length === 1) {
        const res = await apiRequest("DELETE", `/api/admin/waitlist/${ids[0]}`);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/admin/waitlist/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist"] });
      setSelectedIds(new Set());
      toast({ title: "Entry deleted" });
    },
    onError: (err: Error) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
  });

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
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild data-testid="button-export-waitlist-csv">
            <a href="/api/admin/waitlist/export.csv" download>
              Export CSV
            </a>
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)} data-testid="button-add-waitlist-entry">
            <Plus className="h-4 w-4" />
            Add Entry
          </Button>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Waitlist Entry</DialogTitle>
            <DialogDescription>Manually add someone to the main waitlist (e.g. a signup collected offline or via WhatsApp).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Email *</Label>
                <Input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Name</Label>
                <Input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" className="mt-1" />
              </div>
              <div>
                <Label>Country</Label>
                <Select value={addForm.country} onValueChange={(v) => setAddForm((f) => ({ ...f, country: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>City</Label>
                <Input value={addForm.city} onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))} placeholder="Dubai" className="mt-1" />
              </div>
              <div>
                <Label>Account Type</Label>
                <Select value={addForm.accountType} onValueChange={(v) => setAddForm((f) => ({ ...f, accountType: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Business Name</Label>
                <Input value={addForm.businessName} onChange={(e) => setAddForm((f) => ({ ...f, businessName: e.target.value }))} placeholder="Optional" className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate(addForm)} disabled={!addForm.email || addMutation.isPending} data-testid="button-confirm-add-waitlist">
              {addMutation.isPending ? "Adding..." : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 mb-3 bg-primary/5 border border-primary/20 rounded-lg">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Button
                size="sm"
                variant="destructive"
                className="ml-2"
                disabled={deleteMutation.isPending}
                onClick={() => { if (confirm(`Delete ${selectedIds.size} waitlist entr${selectedIds.size === 1 ? "y" : "ies"}? This cannot be undone.`)) deleteMutation.mutate(Array.from(selectedIds)); }}
                data-testid="button-bulk-delete-waitlist"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedIds(new Set())}>
                <X className="h-3.5 w-3.5 mr-1" />Clear
              </Button>
            </div>
          )}
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No waitlist entries found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id)) ? true : filtered.some((e) => selectedIds.has(e.id)) ? "indeterminate" : false}
                      onCheckedChange={() => toggleAll(filtered.map((e) => e.id))}
                    />
                  </TableHead>
                  <TableHead>Pos</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Referral Code</TableHead>
                  <TableHead>Referrals</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.id} className={selectedIds.has(entry.id) ? "bg-primary/5" : ""} data-testid={`row-waitlist-${entry.id}`}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => toggleId(entry.id)} />
                    </TableCell>
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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-waitlist-actions-${entry.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => { if (confirm(`Delete waitlist entry for ${entry.email}?`)) deleteMutation.mutate([entry.id]); }}
                            data-testid={`button-delete-waitlist-${entry.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
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

interface SanityMember {
  id: string;
  displayName?: string;
  email?: string;
  role: string;
  isCurrentUser?: boolean;
  createdAt?: string;
}

function CmsMembersSection() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ projectId: string; members: SanityMember[] }>({
    queryKey: ["/api/admin/sanity-members"],
    queryFn: () => fetch(`${API_BASE}/api/admin/sanity-members`, { credentials: "include" }).then((r) => {
      if (!r.ok) return r.json().then((e: { message?: string }) => { throw new Error(e.message ?? `Error ${r.status}`); });
      return r.json();
    }),
    staleTime: 60_000,
  });

  const members = data?.members;
  const SANITY_MANAGE_URL = `https://sanity.io/manage/project/${data?.projectId ?? "ho605hmx"}/members`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              CMS Members
            </CardTitle>
            <CardDescription>
              Current members with access to the Sanity Studio content editor
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-cms-members"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <a
              href={SANITY_MANAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-sanity-manage"
            >
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Manage in Sanity
              </Button>
            </a>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-destructive font-medium">Failed to load CMS members</p>
            <p className="text-xs text-muted-foreground mt-1">{(error as Error)?.message}</p>
            <p className="text-xs text-muted-foreground mt-1">
              The SANITY_API_TOKEN may need the <code>project:read</code> scope. Visit{" "}
              <a href={SANITY_MANAGE_URL} target="_blank" rel="noopener noreferrer" className="underline text-bareter-teal">
                sanity.io/manage
              </a>{" "}
              to manage members directly.
            </p>
          </div>
        ) : !members || members.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No members found for this Sanity project.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id} data-testid={`row-cms-member-${member.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-muted">
                          {(member.displayName ?? member.email ?? "?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium" data-testid={`text-cms-member-name-${member.id}`}>
                          {member.displayName ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-cms-member-email-${member.id}`}>
                          {member.email ?? member.id}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === "administrator" ? "default" : "secondary"} data-testid={`badge-cms-member-role-${member.id}`}>
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="p-4 border-t bg-muted/30 text-xs text-muted-foreground flex items-center gap-1">
          <span>To invite or remove members, use</span>
          <a
            href={SANITY_MANAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-bareter-teal hover:underline inline-flex items-center gap-0.5"
            data-testid="link-sanity-manage-footer"
          >
            sanity.io/manage <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

// ── WhatsApp Verification Logs ──────────────────────────────────────────────

type PhoneVerifLog = {
  id: number;
  userId: string | null;
  email: string | null;
  phone: string;
  result: string;
  failureReason: string | null;
  service: string | null;
  ipAddress: string | null;
  createdAt: string | null;
};

const RESULT_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  sent: { label: "Sent", variant: "default" },
  invalid_format: { label: "Bad format", variant: "outline" },
  conflict: { label: "Conflict", variant: "destructive" },
  service_down: { label: "Service down", variant: "destructive" },
  error: { label: "Error", variant: "destructive" },
};

function VerificationLogsSection() {
  const [resultFilter, setResultFilter] = useState<string>("all");
  const { data: logs = [], isLoading } = useQuery<PhoneVerifLog[]>({
    queryKey: ["/api/admin/phone-verification-logs", resultFilter],
    queryFn: async () => {
      const params = resultFilter !== "all" ? `?result=${resultFilter}` : "";
      const res = await fetch(`${API_BASE}/api/admin/phone-verification-logs${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load logs");
      return res.json();
    },
    staleTime: 0,
  });

  const failCount = logs.filter((l) => l.result !== "sent").length;
  const conflictCount = logs.filter((l) => l.result === "conflict").length;
  const serviceDownCount = logs.filter((l) => l.result === "service_down").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">WhatsApp Verification Logs</h2>
        <p className="text-muted-foreground">Every code send attempt — successful or failed — with the exact reason.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total attempts", value: logs.length },
          { label: "Successful", value: logs.filter((l) => l.result === "sent").length },
          { label: "Conflicts", value: conflictCount, warn: conflictCount > 0 },
          { label: "Service down", value: serviceDownCount, warn: serviceDownCount > 0 },
        ].map((s) => (
          <Card key={s.label} className={s.warn ? "border-destructive/40" : ""}>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Attempt history</CardTitle>
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="sent">Sent only</SelectItem>
                <SelectItem value="conflict">Conflicts</SelectItem>
                <SelectItem value="service_down">Service down</SelectItem>
                <SelectItem value="invalid_format">Bad format</SelectItem>
                <SelectItem value="error">Errors</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">No attempts recorded yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Reason / detail</TableHead>
                  <TableHead>Service</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const meta = RESULT_LABELS[log.result] ?? { label: log.result, variant: "outline" as const };
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate">{log.email ?? log.userId ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{log.phone}</TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                        {log.failureReason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.service ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminsManagementTab({
  users,
  currentUserId,
  currentUserRole,
  promoteMutation,
  demoteMutation,
}: {
  users: User[];
  currentUserId: string;
  currentUserRole: string;
  promoteMutation: ReturnType<typeof useMutation<void, Error, string>>;
  demoteMutation: ReturnType<typeof useMutation<void, Error, string>>;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; user: User | null; action: "promote" | "demote" }>({
    open: false, user: null, action: "promote",
  });
  const isSuperAdmin = currentUserRole === "super_admin";

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "super_admin">("admin");

  const { data: invites = [], isLoading: invitesLoading } = useQuery<
    { id: number; email: string; role: string; expiresAt: string; acceptedAt: string | null; revokedAt: string | null }[]
  >({
    queryKey: ["/api/admin/invites"],
    enabled: isSuperAdmin,
    staleTime: 0,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/invites", { email: inviteEmail.trim().toLowerCase(), role: inviteRole });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({ title: "Invite sent", description: `An invite link was emailed to ${inviteEmail.trim()}.` });
      setInviteEmail("");
      setInviteRole("admin");
    },
    onError: (err: Error) => {
      const raw = err.message?.split(": ").slice(1).join(": ") || "";
      const parsed = (() => {
        try { return JSON.parse(raw)?.message as string | undefined; } catch { return undefined; }
      })();
      toast({ title: "Couldn't send invite", description: parsed || "Something went wrong", variant: "destructive" });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/invites/${id}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({ title: "Invite revoked" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to revoke invite", variant: "destructive" });
    },
  });

  const admins = users.filter((u) => u.isAdmin || u.role === "admin" || u.role === "super_admin");
  const nonAdmins = users.filter((u) => !u.isAdmin && u.role !== "admin" && u.role !== "super_admin");

  const filteredAdmins = admins.filter((u) =>
    !search ||
    (u.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.fullName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredNonAdmins = nonAdmins.filter((u) =>
    addSearch.length >= 2 && (
      (u.email ?? "").toLowerCase().includes(addSearch.toLowerCase()) ||
      (u.fullName ?? "").toLowerCase().includes(addSearch.toLowerCase())
    )
  ).slice(0, 8);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-bareter-teal" />
            Admin Accounts
          </CardTitle>
          <CardDescription>
            Manage who has access to the admin panel. Admins can manage users, listings, deals, and platform settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search current admins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
            data-testid="input-admin-search"
          />
          {filteredAdmins.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No admins found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAdmins.map((u) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <TableRow key={u.id} data-testid={`row-admin-${u.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={u.profileImage ?? undefined} />
                            <AvatarFallback>{(u.fullName ?? u.email ?? "?")[0].toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">{u.fullName ?? "—"}</div>
                            {u.founderBadge && (
                              <div className="flex items-center gap-1 text-xs text-amber-600">
                                <Crown className="h-3 w-3" /> Founder
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "super_admin" ? "destructive" : "default"} data-testid={`badge-admin-role-${u.id}`}>
                          {u.role === "super_admin" ? "Super Admin" : "Admin"}
                        </Badge>
                        {isSelf && <Badge variant="outline" className="ml-1">You</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          disabled={isSelf || demoteMutation.isPending}
                          onClick={() => setConfirmDialog({ open: true, user: u, action: "demote" })}
                          data-testid={`button-remove-admin-${u.id}`}
                        >
                          <UserX className="h-3.5 w-3.5 mr-1" />
                          Remove Access
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-bareter-teal" />
            Add Admin
          </CardTitle>
          <CardDescription>Search for an existing user by name or email and grant them admin access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Type a name or email to search users..."
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            className="max-w-sm"
            data-testid="input-add-admin-search"
          />
          {addSearch.length >= 2 && filteredNonAdmins.length === 0 && (
            <p className="text-sm text-muted-foreground">No matching non-admin users found.</p>
          )}
          {filteredNonAdmins.length > 0 && (
            <div className="border rounded-md divide-y">
              {filteredNonAdmins.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-4 py-2.5" data-testid={`row-add-admin-${u.id}`}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={u.profileImage ?? undefined} />
                      <AvatarFallback>{(u.fullName ?? u.email ?? "?")[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">{u.fullName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setConfirmDialog({ open: true, user: u, action: "promote" })}
                    disabled={promoteMutation.isPending}
                    data-testid={`button-grant-admin-${u.id}`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                    Grant Admin
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-bareter-teal" />
              Invite a Department Lead
            </CardTitle>
            <CardDescription>
              Send a one-time invite link by email. They set their own password and get their own
              login — no shared credentials, and only super admins can send these.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="teammate@email.com"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="max-w-sm"
                data-testid="input-invite-email"
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "super_admin")}>
                <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => inviteMutation.mutate()}
                disabled={!inviteEmail.trim() || inviteMutation.isPending}
                data-testid="button-send-invite"
              >
                <Mail className="h-3.5 w-3.5 mr-1" />
                Send Invite
              </Button>
            </div>

            {invitesLoading ? (
              <div className="py-4 text-center text-muted-foreground text-sm">Loading invites…</div>
            ) : invites.length === 0 ? (
              <div className="py-4 text-center text-muted-foreground text-sm">No invites sent yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((inv) => {
                    const isExpired = !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) < new Date();
                    const statusLabel = inv.acceptedAt
                      ? "Accepted"
                      : inv.revokedAt
                        ? "Revoked"
                        : isExpired
                          ? "Expired"
                          : "Pending";
                    const statusVariant = inv.acceptedAt ? "default" : inv.revokedAt || isExpired ? "outline" : "secondary";
                    const canRevoke = !inv.acceptedAt && !inv.revokedAt && !isExpired;
                    return (
                      <TableRow key={inv.id} data-testid={`row-invite-${inv.id}`}>
                        <TableCell className="text-sm">{inv.email}</TableCell>
                        <TableCell>
                          <Badge variant={inv.role === "super_admin" ? "destructive" : "default"}>
                            {inv.role === "super_admin" ? "Super Admin" : "Admin"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant as "default" | "outline" | "secondary"}>{statusLabel}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canRevoke && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                              disabled={revokeInviteMutation.isPending}
                              onClick={() => revokeInviteMutation.mutate(inv.id)}
                              data-testid={`button-revoke-invite-${inv.id}`}
                            >
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, user: null, action: "promote" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.action === "promote" ? "Grant Admin Access" : "Remove Admin Access"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.action === "promote" ? (
                <>
                  This will give <strong>{confirmDialog.user?.fullName ?? confirmDialog.user?.email}</strong> full
                  access to the admin panel — including user management, listings, deals, and platform settings.
                </>
              ) : (
                <>
                  This will remove admin access for <strong>{confirmDialog.user?.fullName ?? confirmDialog.user?.email}</strong>.
                  They will no longer be able to access the admin panel.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, user: null, action: "promote" })}>
              Cancel
            </Button>
            <Button
              variant={confirmDialog.action === "promote" ? "default" : "destructive"}
              disabled={promoteMutation.isPending || demoteMutation.isPending}
              data-testid="button-confirm-admin-change"
              onClick={() => {
                if (!confirmDialog.user) return;
                if (confirmDialog.action === "promote") {
                  promoteMutation.mutate(confirmDialog.user.id);
                } else {
                  demoteMutation.mutate(confirmDialog.user.id);
                }
                setConfirmDialog({ open: false, user: null, action: "promote" });
                setAddSearch("");
              }}
            >
              {confirmDialog.action === "promote" ? "Grant Access" : "Remove Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureWaitlistAdminSection() {
  const { toast } = useToast();
  const { data: entries = [], isLoading } = useQuery<{ id: number; email: string; feature: string; createdAt: string }[]>({
    queryKey: ["/api/admin/feature-waitlist"],
    staleTime: 0,
  });

  const creators = entries.filter(e => e.feature === "creators");
  const brandCollabs = entries.filter(e => e.feature === "brand-collabs");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleId = (id: number) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = (ids: number[]) => setSelectedIds((prev) => prev.size === ids.length && ids.every((id) => prev.has(id)) ? new Set() : new Set(ids));

  const [addOpen, setAddOpen] = useState<{ open: boolean; feature: "creators" | "brand-collabs" }>({ open: false, feature: "creators" });
  const [addEmail, setAddEmail] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/feature-waitlist", { email: addEmail, feature: addOpen.feature });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-waitlist"] });
      setAddOpen({ open: false, feature: "creators" });
      setAddEmail("");
      toast({ title: "Added to waitlist" });
    },
    onError: (err: Error) => toast({ title: "Failed to add entry", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/feature-waitlist/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-waitlist"] });
      toast({ title: "Entry deleted" });
    },
    onError: (err: Error) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
  });

  const downloadCsv = (rows: typeof entries, filename: string) => {
    const csv = ["email,feature,joined_at", ...rows.map(r => `${r.email},${r.feature},${r.createdAt}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const renderTable = (rows: typeof entries, label: string, accent: string, feature: "creators" | "brand-collabs") => {
    const ids = rows.map(r => r.id);
    const selectedInGroup = ids.filter(id => selectedIds.has(id));
    return (
      <div className="rounded-xl border overflow-hidden">
        <div className={`px-5 py-3.5 flex items-center justify-between gap-2 flex-wrap ${accent}`}>
          <div>
            <p className="font-bold text-white text-sm">{label}</p>
            <p className="text-white/70 text-xs">{rows.length} signups</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedInGroup.length > 0 && (
              <button
                type="button"
                onClick={() => { if (confirm(`Delete ${selectedInGroup.length} entr${selectedInGroup.length === 1 ? "y" : "ies"}?`)) selectedInGroup.forEach(id => deleteMutation.mutate(id)); setSelectedIds(new Set()); }}
                className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />Delete ({selectedInGroup.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setAddOpen({ open: true, feature })}
              className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />Add
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(rows, `${label.toLowerCase().replace(/ /g,"-")}-waitlist.csv`)}
              className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No signups yet</div>
        ) : (
          <div className="divide-y">
            <div className="flex items-center gap-3 px-5 py-2 bg-muted/30">
              <Checkbox
                checked={ids.length > 0 && ids.every(id => selectedIds.has(id)) ? true : ids.some(id => selectedIds.has(id)) ? "indeterminate" : false}
                onCheckedChange={() => toggleAll(ids)}
              />
              <span className="text-xs text-muted-foreground">Select all</span>
            </div>
            {rows.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm" data-testid={`row-feature-waitlist-${r.id}`}>
                <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleId(r.id)} />
                <span className="font-medium flex-1">{r.email}</span>
                <span className="text-muted-foreground text-xs">{new Date(r.createdAt).toLocaleDateString()}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => { if (confirm(`Delete waitlist entry for ${r.email}?`)) deleteMutation.mutate(r.id); }}
                  data-testid={`button-delete-feature-waitlist-${r.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Feature Waitlists</h2>
        <p className="text-muted-foreground">Early-access signups for Creators Hub and Brand Collabs coming-soon pages.</p>
      </div>

      <Dialog open={addOpen.open} onOpenChange={(open) => setAddOpen((s) => ({ ...s, open }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to {addOpen.feature === "creators" ? "Creators Hub" : "Brand Collabs"} Waitlist</DialogTitle>
            <DialogDescription>Manually add an email to this feature waitlist.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>Email *</Label>
            <Input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="jane@example.com" className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen({ open: false, feature: "creators" })}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!addEmail || addMutation.isPending} data-testid="button-confirm-add-feature-waitlist">
              {addMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="space-y-5">
          {renderTable(creators, "Creators Hub", "bg-violet-600", "creators")}
          {renderTable(brandCollabs, "Brand Collabs", "bg-bareter-teal", "brand-collabs")}
        </div>
      )}
    </div>
  );
}

function InternationalWaitlistSection() {
  const { toast } = useToast();
  const { data: groups = [], isLoading } = useQuery<{ country: string; count: number; entries: { id: number; email: string; fullName: string | null; country: string; city: string | null; signupType: string | null; createdAt: string | null }[] }[]>({
    queryKey: ["/api/admin/international-waitlist"],
    staleTime: 0,
  });

  const totalCount = groups.reduce((s, g) => s + g.count, 0);

  const getCountryName = (code: string) =>
    COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code;

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleId = (id: number) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", fullName: "", country: "", city: "", signupType: "" });

  const addMutation = useMutation({
    mutationFn: async (body: typeof addForm) => {
      const res = await apiRequest("POST", "/api/admin/international-waitlist", {
        email: body.email,
        fullName: body.fullName || undefined,
        country: body.country,
        city: body.city || undefined,
        signupType: body.signupType || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/international-waitlist"] });
      setAddOpen(false);
      setAddForm({ email: "", fullName: "", country: "", city: "", signupType: "" });
      toast({ title: "Added to international waitlist" });
    },
    onError: (err: Error) => toast({ title: "Failed to add entry", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/international-waitlist/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/international-waitlist"] });
      toast({ title: "Entry deleted" });
    },
    onError: (err: Error) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
  });

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} entr${selectedIds.size === 1 ? "y" : "ies"}?`)) return;
    Array.from(selectedIds).forEach((id) => deleteMutation.mutate(id));
    setSelectedIds(new Set());
  };

  const downloadCsv = () => {
    const all = groups.flatMap((g) => g.entries);
    const header = "id,email,fullName,country,city,signupType,createdAt";
    const rows = all.map((e) =>
      [e.id, e.email, e.fullName ?? "", getCountryName(e.country), e.city ?? "", e.signupType ?? "", e.createdAt ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "international-waitlist.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold mb-0.5">International Waitlist</h2>
          <p className="text-sm text-muted-foreground">
            Users who signed up from outside UAE — sorted by country demand.
            {totalCount > 0 && <span className="ml-1 font-medium text-foreground">{totalCount} total across {groups.length} countr{groups.length === 1 ? "y" : "ies"}.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={deleteSelected} data-testid="button-bulk-delete-intl-waitlist">
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selectedIds.size})
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)} data-testid="button-add-intl-waitlist">
            <Plus className="h-3.5 w-3.5" />
            Add Entry
          </Button>
          {totalCount > 0 && (
            <Button variant="outline" size="sm" onClick={downloadCsv} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to International Waitlist</DialogTitle>
            <DialogDescription>Entries link to an existing Bareter account — enter the email of a user who already registered.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>User Email *</Label>
                <Input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} placeholder="Existing account email" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Full Name</Label>
                <Input value={addForm.fullName} onChange={(e) => setAddForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Defaults to the account's name" className="mt-1" />
              </div>
              <div>
                <Label>Country *</Label>
                <Select value={addForm.country} onValueChange={(v) => setAddForm((f) => ({ ...f, country: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>City</Label>
                <Input value={addForm.city} onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))} placeholder="Optional" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Signup Type</Label>
                <Input value={addForm.signupType} onChange={(e) => setAddForm((f) => ({ ...f, signupType: e.target.value }))} placeholder="Optional" className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate(addForm)} disabled={!addForm.email || !addForm.country || addMutation.isPending} data-testid="button-confirm-add-intl-waitlist">
              {addMutation.isPending ? "Adding..." : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No international signups yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.country}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="text-lg">{group.country}</span>
                    {getCountryName(group.country)}
                    <Badge variant="secondary" className="ml-1">{group.count}</Badge>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-1.5 pr-3 font-medium w-8"></th>
                        <th className="text-left py-1.5 pr-3 font-medium">Name</th>
                        <th className="text-left py-1.5 pr-3 font-medium">Email</th>
                        <th className="text-left py-1.5 pr-3 font-medium">City</th>
                        <th className="text-left py-1.5 pr-3 font-medium">Type</th>
                        <th className="text-left py-1.5 pr-3 font-medium">Signed up</th>
                        <th className="text-left py-1.5 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((e) => (
                        <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40" data-testid={`row-intl-waitlist-${e.id}`}>
                          <td className="py-1.5 pr-3">
                            <Checkbox checked={selectedIds.has(e.id)} onCheckedChange={() => toggleId(e.id)} />
                          </td>
                          <td className="py-1.5 pr-3">{e.fullName ?? "—"}</td>
                          <td className="py-1.5 pr-3 font-mono text-[11px]">{e.email}</td>
                          <td className="py-1.5 pr-3">{e.city ?? "—"}</td>
                          <td className="py-1.5 pr-3 capitalize">{e.signupType ?? "—"}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{e.createdAt ? new Date(e.createdAt).toLocaleDateString() : "—"}</td>
                          <td className="py-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => { if (confirm(`Delete waitlist entry for ${e.email}?`)) deleteMutation.mutate(e.id); }}
                              data-testid={`button-delete-intl-waitlist-${e.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
