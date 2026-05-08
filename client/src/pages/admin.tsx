import { useState, useEffect } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User, Listing, DealWithUsers, MessageWithSender, ListingWithUser, ModerationLog, Report, DisputeWithParties, AdminAuditLog, FailedLoginAttempt } from "@shared/schema";
import { CATEGORIES } from "@shared/schema";
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
} from "lucide-react";
import { VerifiedBadge, isUserVerified } from "@/components/verified-badge";
import { AdminLegalSection } from "@/components/admin/legal-section";
import { AdminPlatformSettings } from "@/components/admin/platform-settings";
import { ScrollText } from "lucide-react";
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

type AdminSection = "dashboard" | "users" | "listings" | "deals" | "disputes" | "analytics" | "settings" | "reports" | "flags" | "ai-logs" | "waitlist" | "legal" | "email";

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
  newListingsToday: number;
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
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; user: User | null; subject: string; body: string }>({
    open: false, user: null, subject: "", body: "",
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [userAccountTypeFilter, setUserAccountTypeFilter] = useState<string>("all");
  const [listingStatusFilter, setListingStatusFilter] = useState<string>("all");
  const [listingCategoryFilter, setListingCategoryFilter] = useState<string>("all");
  const [listingCityFilter, setListingCityFilter] = useState<string>("all");
  const [listingValueFilter, setListingValueFilter] = useState<string>("all");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; listingId: string | null; reason: string }>({
    open: false, listingId: null, reason: "",
  });
  const [editListingDialog, setEditListingDialog] = useState<{ open: boolean; listing: ListingWithUser | null; categories: string[]; retailValue: string }>({
    open: false, listing: null, categories: [], retailValue: "",
  });
  const [disputeStatusFilter, setDisputeStatusFilter] = useState<string>("all");
  const [selectedDispute, setSelectedDispute] = useState<DisputeWithParties | null>(null);
  const [disputeDecisionDialog, setDisputeDecisionDialog] = useState<{ open: boolean; dispute: DisputeWithParties | null; decision: string; reasoning: string; outcome: string }>({
    open: false, dispute: null, decision: "", reasoning: "", outcome: "",
  });
  const [createDisputeDialog, setCreateDisputeDialog] = useState<{ open: boolean; partyAId: string; partyBId: string; subject: string; description: string; dealId: string }>({
    open: false, partyAId: "", partyBId: "", subject: "", description: "", dealId: "",
  });
  const [settingsTab, setSettingsTab] = useState<string>("platform");
  const [auditLogActionFilter, setAuditLogActionFilter] = useState<string>("all");
  const [auditLogAdminFilter, setAuditLogAdminFilter] = useState<string>("all");
  const [auditLogDateFrom, setAuditLogDateFrom] = useState<string>("");
  const [auditLogDateTo, setAuditLogDateTo] = useState<string>("");
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastCityFilter, setBroadcastCityFilter] = useState("");
  const [broadcastAccountType, setBroadcastAccountType] = useState("all");
  const [broadcastVerification, setBroadcastVerification] = useState("all");
  const [broadcastJobId, setBroadcastJobId] = useState<string | null>(null);
  const [broadcastPreviewHtml, setBroadcastPreviewHtml] = useState<string | null>(null);
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

  const { data: userGrowth } = useQuery<{ date: string; count: number }[]>({
    queryKey: ["/api/admin/analytics/user-growth"],
    enabled: !!user?.isAdmin,
  });

  const { data: topListings } = useQuery<{ id: string; title: string; viewCount: number; proposalCount: number }[]>({
    queryKey: ["/api/admin/analytics/top-listings"],
    enabled: !!user?.isAdmin,
  });

  const { data: emailStats } = useQuery<{ total: number; sent: number; failed: number }>({
    queryKey: ["/api/admin/email/stats"],
    enabled: !!user?.isAdmin,
  });

  const { data: emailTemplates } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/email/templates"],
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
      toast({ title: "Success", description: "Listing approved" });
    },
  });

  const rejectListingMutation = useMutation({
    mutationFn: async ({ listingId, reason }: { listingId: string; reason: string }) => {
      await apiRequest("PATCH", `/api/admin/listings/${listingId}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/listings"] });
      setRejectDialog({ open: false, listingId: null, reason: "" });
      toast({ title: "Success", description: "Listing rejected and user notified" });
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

  const { data: userDetail } = useQuery<User & { listings: Listing[]; deals: DealWithUsers[] }>({
    queryKey: ["/api/admin/users", selectedUserId, "detail"],
    enabled: !!selectedUserId,
  });

  const { data: listingModerationHistory } = useQuery<ModerationLog[]>({
    queryKey: ["/api/admin/listings", selectedListingId, "moderation-history"],
    enabled: !!selectedListingId,
  });

  const { data: disputesData = [], isLoading: disputesLoading } = useQuery<DisputeWithParties[]>({
    queryKey: ["/api/admin/disputes"],
    enabled: activeSection === "disputes",
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
    enabled: activeSection === "settings" && settingsTab === "audit",
  });

  const { data: failedLogins = [] } = useQuery<FailedLoginAttempt[]>({
    queryKey: ["/api/admin/failed-logins"],
    enabled: activeSection === "settings" && settingsTab === "security",
  });

  const { data: dataCollectionSetting } = useQuery<{ dataCollectionDisabled: boolean }>({
    queryKey: ["/api/admin/settings/data-collection"],
    enabled: activeSection === "settings",
  });

  const dealStateMutation = useMutation({
    mutationFn: async ({ dealId, state, reason }: { dealId: string; state: string; reason?: string }) => {
      await apiRequest("PATCH", `/api/admin/deals/${dealId}/state`, { state, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deals"] });
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
    mutationFn: async (data: { subject: string; body: string; filter?: { city?: string; accountType?: string; verificationStatus?: string } }) => {
      const res = await apiRequest("POST", "/api/admin/email/broadcast", data);
      return res.json();
    },
    onSuccess: (data: { broadcastId: string; recipientCount: number; status: string }) => {
      setBroadcastJobId(data.broadcastId);
      setBroadcastSubject("");
      setBroadcastBody("");
      toast({ title: "Broadcast queued", description: `Sending to ${data.recipientCount} recipients in the background…` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to start broadcast", variant: "destructive" });
    },
  });

  const broadcastTestMutation = useMutation({
    mutationFn: async (data: { subject: string; body: string }) => {
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

  const { data: broadcastJobStatus } = useQuery<{ id: string; status: string; recipientCount: number; sent: number; failed: number; completedAt: string | null }>({
    queryKey: ["/api/admin/email/broadcast", broadcastJobId],
    enabled: !!broadcastJobId,
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

  const previewMutation = useMutation({
    mutationFn: async (data: { body: string; recipientName?: string; vars?: Record<string, string>; mode?: "broadcast" | "template" }) => {
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
    onError: () => {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
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

  const filteredUsers = users?.filter((u) => {
    const matchesSearch = u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (userStatusFilter === "active") return !u.isBanned && !(u.kycStatus === "IN_PROGRESS" || u.kybStatus === "IN_PROGRESS" || u.kycStatus === "IN_REVIEW" || u.kybStatus === "IN_REVIEW");
    if (userStatusFilter === "banned") return u.isBanned;
    if (userStatusFilter === "pending") return u.kycStatus === "IN_PROGRESS" || u.kybStatus === "IN_PROGRESS" || u.kycStatus === "IN_REVIEW" || u.kybStatus === "IN_REVIEW";
    if (userStatusFilter === "unverified") return !u.isVerified && !u.isBanned;
    if (userAccountTypeFilter === "individual") return u.accountType === "individual" || !u.accountType;
    if (userAccountTypeFilter === "business") return u.accountType === "business";
    return true;
  }).filter((u) => {
    if (userAccountTypeFilter === "all") return true;
    if (userAccountTypeFilter === "individual") return u.accountType === "individual" || !u.accountType;
    if (userAccountTypeFilter === "business") return u.accountType === "business";
    return true;
  });

  const availableCities = Array.from(new Set((listings ?? []).map(l => l.city).filter(Boolean) as string[])).sort();

  const filteredListings = listings?.filter((l) => {
    const matchesSearch = l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.user?.fullName?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (listingStatusFilter === "active" && (!l.isActive || l.moderationStatus === "rejected")) return false;
    if (listingStatusFilter === "inactive" && l.isActive) return false;
    if (listingStatusFilter === "pending" && l.moderationStatus !== "pending") return false;
    if (listingStatusFilter === "flagged" && l.moderationStatus !== "flagged" && !l.valueFlagged && !l.imageFlagged) return false;
    if (listingStatusFilter === "rejected" && l.moderationStatus !== "rejected") return false;
    if (listingStatusFilter === "featured" && !l.isFeatured) return false;
    if (listingCategoryFilter !== "all") {
      const cats = (l.categories as string[]) || [];
      if (!cats.includes(listingCategoryFilter)) return false;
    }
    if (listingCityFilter !== "all" && l.city !== listingCityFilter) return false;
    if (listingValueFilter !== "all") {
      const val = parseFloat(l.retailValue || "0");
      if (listingValueFilter === "under1000" && val >= 1000) return false;
      if (listingValueFilter === "1000to5000" && (val < 1000 || val > 5000)) return false;
      if (listingValueFilter === "5000to20000" && (val < 5000 || val > 20000)) return false;
      if (listingValueFilter === "over20000" && val <= 20000) return false;
    }
    return true;
  });

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
    { id: "disputes" as const, label: "Disputes", icon: Gavel },
    { id: "reports" as const, label: "Reports", icon: Flag },
    { id: "flags" as const, label: "Flags", icon: AlertTriangle },
    { id: "ai-logs" as const, label: "AI Logs", icon: Bot },
    { id: "waitlist" as const, label: "Waitlist", icon: Sparkles },
    { id: "legal" as const, label: "Legal", icon: ScrollText },
    { id: "email" as const, label: "Email", icon: Mail },
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

        <Card data-testid="stat-new-listings-today">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">New Listings Today</p>
                <p className="text-2xl font-bold" data-testid="text-new-listings-today">{analytics?.newListingsToday || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-purple-500" />
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

  const handleExportCSV = () => {
    window.open("/api/admin/users/export.csv", "_blank");
    toast({ title: "Exporting", description: "CSV download started" });
  };

  const renderUsers = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Users Management</h2>
          <p className="text-muted-foreground">Manage registered users and verification status</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-user-status-filter">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="banned">Banned</SelectItem>
              <SelectItem value="pending">Pending Verification</SelectItem>
              <SelectItem value="unverified">Unverified</SelectItem>
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
                  <TableHead>Onboarding</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.map((u) => (
                  <TableRow key={u.id} className={`${u.isBanned ? "opacity-50" : ""} cursor-pointer`} onClick={() => setSelectedUserId(u.id)}>
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
                    <TableCell>
                      {u.onboardingCompleted ? (
                        <Badge variant="outline" className="text-green-600 gap-1"><CheckCircle className="h-3 w-3" />Done</Badge>
                      ) : (
                        <Badge variant="secondary">Step {u.onboardingStep || 1}/4</Badge>
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
  );

  const renderListings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Listings Management</h2>
          <p className="text-muted-foreground">View and moderate all platform listings</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={listingStatusFilter} onValueChange={setListingStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-listing-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="featured">Featured</SelectItem>
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
                  <TableHead>Moderation</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredListings?.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => setSelectedListingId(l.id)}>
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
                      <Badge variant={
                        l.moderationStatus === "approved" ? "default" :
                        l.moderationStatus === "rejected" ? "destructive" :
                        l.moderationStatus === "flagged" ? "outline" : "secondary"
                      } className={l.moderationStatus === "flagged" ? "text-amber-600 border-amber-500/60" : ""}>
                        {l.moderationStatus || "pending"}
                      </Badge>
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
  );

  const renderDeals = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Deals Management</h2>
          <p className="text-muted-foreground">View all deals and their details</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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

  const filteredDisputes = disputesData.filter(d => {
    if (disputeStatusFilter !== "all" && d.status !== disputeStatusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return d.subject.toLowerCase().includes(q) ||
        d.partyA?.fullName?.toLowerCase().includes(q) ||
        d.partyB?.fullName?.toLowerCase().includes(q);
    }
    return true;
  });

  const renderDisputes = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Disputes</h2>
          <p className="text-muted-foreground">Manage disputes between parties</p>
        </div>
        <div className="flex gap-2">
          <Select value={disputeStatusFilter} onValueChange={setDisputeStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-dispute-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_mediation">In Mediation</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateDisputeDialog({ ...createDisputeDialog, open: true })} data-testid="button-create-dispute">
            Create Dispute
          </Button>
        </div>
      </div>

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
                  <TableRow key={d.id} data-testid={`row-dispute-${d.id}`}>
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
  );

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
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input placeholder="Email subject..." value={broadcastSubject} onChange={(e) => setBroadcastSubject(e.target.value)} data-testid="input-broadcast-subject" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Body</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={async () => {
                  const sampleVars = { name: "Sarah Al-Hassan", email: "sarah@example.com", city: "Dubai", businessName: "Al-Hassan Trading", accountType: "business", appName: "Bareter" };
                  const result = await previewMutation.mutateAsync({ body: broadcastBody || "Hello {{name}}, welcome to {{appName}}!", recipientName: "Sarah Al-Hassan", vars: sampleVars });
                  setBroadcastPreviewHtml(result.html);
                  setBroadcastPreviewOpen(true);
                }}
                disabled={previewMutation.isPending}
                data-testid="button-broadcast-preview"
              >
                <Eye className="h-3 w-3" />
                {previewMutation.isPending ? "Loading…" : "Preview"}
              </button>
            </div>
            <Textarea placeholder="Email body... Use {{name}}, {{email}}, {{city}}, {{businessName}}, {{accountType}}, {{appName}} for personalisation." rows={6} value={broadcastBody} onChange={(e) => setBroadcastBody(e.target.value)} data-testid="input-broadcast-body" />
            <div className="flex flex-wrap gap-1.5 pt-0.5" data-testid="broadcast-variable-chips">
              {["{{name}}", "{{email}}", "{{city}}", "{{businessName}}", "{{accountType}}", "{{appName}}"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBroadcastBody((prev) => prev + v)}
                  className="text-xs font-mono bg-muted hover:bg-muted/80 border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`chip-var-${v.replace(/\{|\}/g, "")}`}
                >
                  {v}
                </button>
              ))}
            </div>
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
                      city: broadcastCityFilter || undefined,
                      accountType: broadcastAccountType,
                      verificationStatus: broadcastVerification,
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
                onClick={() => broadcastTestMutation.mutate({ subject: broadcastSubject, body: broadcastBody })}
                disabled={!broadcastSubject || !broadcastBody || broadcastTestMutation.isPending}
                className="gap-2"
                data-testid="button-send-test-broadcast"
              >
                {broadcastTestMutation.isPending ? "Sending…" : <><Mail className="h-4 w-4" /> Send test to me</>}
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
              </div>
            )}
          </div>
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
              { key: "email_template_password_reset", label: "Password Reset", vars: ["{{resetUrl}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { resetUrl: "https://bareter.com/reset-password?token=sample123", appName: "Bareter", baseUrl: "https://bareter.com" } },
              { key: "email_template_deal_completed", label: "Deal Completed", vars: ["{{greeting}}", "{{counterpartyName}}", "{{dealUrl}}", "{{appName}}"], sampleVars: { greeting: "Hi Sarah,", counterpartyName: "Ahmed Al-Mansouri", dealUrl: "https://bareter.com/deals/sample-123", appName: "Bareter" } },
              { key: "email_template_listing_rejected", label: "Listing Rejected", vars: ["{{greeting}}", "{{listingTitle}}", "{{reason}}", "{{appName}}", "{{baseUrl}}"], sampleVars: { greeting: "Hi Sarah,", listingTitle: "Premium Photography Package", reason: "The listing does not meet our quality standards.", appName: "Bareter", baseUrl: "https://bareter.com" } },
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
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => { setEditingTemplateKey(key); setEditingTemplateValue(emailTemplates?.[key] || ""); }} data-testid={`button-edit-template-${key}`}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
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
                      {vars.map((v) => (
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
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
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
                <p className="text-3xl font-bold text-purple-500">{analytics?.newListingsToday || 0}</p>
                <p className="text-sm text-muted-foreground">New Today</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-orange-500">{analytics?.activeListings || 0}</p>
                <p className="text-sm text-muted-foreground">Active Listings</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const auditAdmins = Array.from(new Set(auditLogs.map(l => ({ id: l.adminId, email: l.adminEmail })).filter(a => a.email).map(a => JSON.stringify(a)))).map(s => JSON.parse(s) as { id: string; email: string });
  const auditActions = Array.from(new Set(auditLogs.map(l => l.action))).sort();

  const renderSettings = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Settings</h2>
        <p className="text-muted-foreground">Platform configuration, security, and compliance</p>
      </div>

      <Tabs value={settingsTab} onValueChange={setSettingsTab}>
        <TabsList>
          <TabsTrigger value="platform" data-testid="tab-settings-platform">Platform</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-settings-audit">Audit Log</TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-settings-security">Security</TabsTrigger>
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

  const renderReports = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Reports</h2>
          <p className="text-muted-foreground">User-submitted reports for review</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={reportsExportFrom} onChange={(e) => setReportsExportFrom(e.target.value)} className="w-36 h-9 text-xs" placeholder="From" data-testid="input-reports-export-from" />
          <Input type="date" value={reportsExportTo} onChange={(e) => setReportsExportTo(e.target.value)} className="w-36 h-9 text-xs" placeholder="To" data-testid="input-reports-export-to" />
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { const params = new URLSearchParams(); if (reportsExportFrom) params.set("from", reportsExportFrom); if (reportsExportTo) params.set("to", reportsExportTo); window.open(`/api/admin/reports/export.csv${params.toString() ? `?${params}` : ""}`, "_blank"); toast({ title: "Exporting", description: "Reports & disputes CSV download started" }); }} data-testid="button-export-reports-csv">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
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
                reportsData.map((report) => (
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
                      {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : "N/A"}
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
      case "disputes":
        return renderDisputes();
      case "reports":
        return renderReports();
      case "flags":
        return renderFlags();
      case "ai-logs":
        return renderAiLogs();
      case "waitlist":
        return renderWaitlist();
      case "legal":
        return <AdminLegalSection />;
      case "email":
        return renderEmail();
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
                  <p className="text-xs text-muted-foreground">Onboarding</p>
                  <p className="text-sm">{userDetail.onboardingCompleted ? "Completed" : `Step ${userDetail.onboardingStep || 1}/4`}</p>
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
                        <img key={i} src={url} alt={`Listing image ${i + 1}`} className="h-24 w-24 rounded-lg object-cover border" />
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
      <Dialog open={disputeDecisionDialog.open} onOpenChange={(open) => !open && setDisputeDecisionDialog({ open: false, dispute: null, decision: "", reasoning: "", outcome: "" })}>
        <DialogContent data-testid="dialog-dispute-decision">
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
            <DialogDescription>
              Enter your decision for "{disputeDecisionDialog.dispute?.subject}". Both parties will be notified by email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select value={disputeDecisionDialog.outcome} onValueChange={(v) => setDisputeDecisionDialog({ ...disputeDecisionDialog, outcome: v })}>
                <SelectTrigger data-testid="select-dispute-outcome">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_favor_party_a">In favor of Party A</SelectItem>
                  <SelectItem value="in_favor_party_b">In favor of Party B</SelectItem>
                  <SelectItem value="mutual">Mutual agreement</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Decision</Label>
              <Textarea
                placeholder="Enter your decision..."
                value={disputeDecisionDialog.decision}
                onChange={(e) => setDisputeDecisionDialog({ ...disputeDecisionDialog, decision: e.target.value })}
                className="min-h-[100px]"
                data-testid="input-dispute-decision"
              />
            </div>
            <div className="space-y-2">
              <Label>Reasoning (optional)</Label>
              <Textarea
                placeholder="Provide reasoning for the decision..."
                value={disputeDecisionDialog.reasoning}
                onChange={(e) => setDisputeDecisionDialog({ ...disputeDecisionDialog, reasoning: e.target.value })}
                data-testid="input-dispute-reasoning"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeDecisionDialog({ open: false, dispute: null, decision: "", reasoning: "", outcome: "" })}>
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

