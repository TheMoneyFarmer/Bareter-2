import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { WhatsappSettingsToggle } from "@/components/whatsapp-settings-toggle";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useAuth } from "@/lib/auth";
import { useI18n, type Language } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, API_BASE, assetUrl, mobileHeaders } from "@/lib/queryClient";
import { BackButton } from "@/components/BackButton";
import { CATEGORIES, LOCATIONS, COUNTRIES, getCitiesForCountry } from "@shared/schema";
import {
  Settings,
  Bell,
  Shield,
  Globe,
  CreditCard,
  User,
  Lock,
  Eye,
  Mail,
  Phone,
  Building2,
  MapPin,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
  Download,
  RefreshCw,
  Instagram,
  Linkedin,
  Twitter,
  Camera,
  TrendingUp,
  Youtube,
  Users,
  ArrowLeft,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { z } from "zod";
import { useMemo } from "react";

function VerificationRefreshButton({ onRefresh }: { onRefresh: () => void }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/verification/refresh");
      return res.json() as Promise<{ synced: boolean; message: string; status?: string; isVerified?: boolean }>;
    },
    onSuccess: (data) => {
      if (data.synced) {
        toast({ title: t("settings.statusUpdated"), description: data.message });
        onRefresh();
      } else {
        toast({ title: t("settings.noChange"), description: data.message, variant: "default" });
      }
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("settings.verificationCheckError"), variant: "destructive" });
    },
  });
  return (
    <Button
      variant="outline"
      size="sm"
      data-testid="button-refresh-verification"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      <RefreshCw className={`h-3 w-3 mr-1.5 ${mutation.isPending ? "animate-spin" : ""}`} />
      {mutation.isPending ? t("settings.checking") : t("settings.refreshStatus")}
    </Button>
  );
}

type AccountSettingsForm = {
  fullName: string;
  email: string;
  phone?: string;
  website?: string;
  businessName?: string;
  location?: string;
  country?: string;
  city?: string;
  timezone: string;
  currency: string;
  language: string;
};
type NotificationSettingsForm = {
  emailNotifications: boolean;
  dealNotifications: boolean;
  messageNotifications: boolean;
  marketingEmails: boolean;
};
type PrivacySettingsForm = {
  profileVisibility: string;
  showEmail: boolean;
  showPhone: boolean;
  allowDirectMessages: boolean;
};
type TradingSettingsForm = {
  preferredCategories: string[];
  tradingRadius: number;
  minTradeValue?: string;
  maxTradeValue?: string;
  autoMatchEnabled: boolean;
};
type PasswordChangeForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};
type PasswordChangeStep = "form" | "otp";


export function SettingsPage() {
  const { user, logout } = useAuth();
  const { language: activeLanguage, setLanguage, t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [mobileView, setMobileView] = useState<"menu" | "section">("menu");
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t) return t;
    }
    return "account";
  });
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    (user?.preferredCategories as string[]) || []
  );
  // Deletion dialog state
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deleteCreatorOpen, setDeleteCreatorOpen] = useState(false);
  const [deleteBusinessOpen, setDeleteBusinessOpen] = useState(false);

  const [passwordChangeStep, setPasswordChangeStep] = useState<PasswordChangeStep>("form");
  const [pendingPasswordData, setPendingPasswordData] = useState<{ currentPassword: string; newPassword: string } | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [socialLinks, setSocialLinks] = useState<{ instagram?: string; linkedin?: string; twitter?: string; tiktok?: string; youtube?: string; snapchat?: string }>(() => {
    const sl = user?.socialLinks as { instagram?: string; linkedin?: string; twitter?: string; tiktok?: string; youtube?: string; snapchat?: string } | null;
    return sl || {};
  });

  // ── Profile Mode state (creator_profiles + business_profiles tables) ──────
  const CREATOR_PLATFORMS = ["Instagram", "TikTok", "YouTube", "LinkedIn", "Twitter/X", "Snapchat", "Pinterest", "Other"];

  const BUSINESS_CATEGORY_GROUPS: { group: string; items: string[] }[] = [
    { group: "Food & Beverage", items: ["Restaurant", "Café", "Catering", "Food Truck", "Bakery", "Cloud Kitchen", "Bar & Lounge", "Food Retail", "Beverage Brand"] },
    { group: "Retail", items: ["Fashion & Apparel", "Electronics", "Home & Furniture", "Luxury Goods", "Jewellery & Watches", "Sporting Goods", "Books & Stationery", "Toys & Games", "Health & Beauty", "Supermarket", "Convenience Store", "Online Retail"] },
    { group: "Services", items: ["Marketing & Advertising", "Graphic Design", "Photography", "Videography", "Web Development", "IT Services", "Accounting & Finance", "Legal Services", "HR & Recruitment", "Consulting", "PR & Communications", "Event Management", "Translation"] },
    { group: "Hospitality & Tourism", items: ["Hotel", "Serviced Apartment", "Resort", "Travel Agency", "Tour Operator", "Car Rental", "Yacht Charter"] },
    { group: "Health & Wellness", items: ["Gym & Fitness", "Spa & Beauty Salon", "Medical Clinic", "Dental", "Pharmacy", "Mental Health", "Nutrition & Wellness"] },
    { group: "Education", items: ["School", "University", "Training Centre", "Online Education", "Tutoring", "Language School"] },
    { group: "Construction & Real Estate", items: ["Construction", "Fit-Out & Interior Design", "Real Estate Agency", "Property Developer", "Architecture", "Engineering", "Facilities Management"] },
    { group: "Logistics & Transport", items: ["Freight & Shipping", "Last Mile Delivery", "Warehousing", "Moving Services", "Fleet Management"] },
    { group: "Technology", items: ["Software Development", "App Development", "SaaS", "Cybersecurity", "Data & Analytics", "AI & Automation", "Hardware & Electronics"] },
    { group: "Media & Entertainment", items: ["Production Company", "Music", "Publishing", "Gaming", "Streaming", "Podcast"] },
    { group: "Manufacturing", items: ["Food Manufacturing", "Textile", "Packaging", "Industrial Equipment", "Consumer Goods"] },
    { group: "Other", items: ["Agriculture", "Energy", "Non-Profit", "Government", "Other"] },
  ];
  const ALL_BIZ_CATEGORIES = BUSINESS_CATEGORY_GROUPS.flatMap(g => g.items);

  const [cpDisplayName, setCpDisplayName] = useState("");
  const [cpBio, setCpBio] = useState("");
  const [cpNiche, setCpNiche] = useState("");
  const [cpPrimaryPlatform, setCpPrimaryPlatform] = useState<string | undefined>(undefined);
  const [cpAudienceSize, setCpAudienceSize] = useState("");
  const [cpEditingStats, setCpEditingStats] = useState(false);
  const [cpFollowerCount, setCpFollowerCount] = useState("");
  const [cpEngagementRate, setCpEngagementRate] = useState("");
  const [cpContentNiches, setCpContentNiches] = useState<string[]>([]);
  const [cpInstagramHandle, setCpInstagramHandle] = useState("");
  const [cpTiktokHandle, setCpTiktokHandle] = useState("");
  const [cpYoutubeHandle, setCpYoutubeHandle] = useState("");
  const CONTENT_NICHE_OPTIONS = ["Fashion", "Beauty", "Tech", "Food", "Travel", "Lifestyle", "Fitness", "Business", "Finance", "Entertainment", "Gaming", "Education", "Health", "Parenting", "Sports", "Art", "Music", "Comedy", "News", "Other"];
  const [bizCategoryOpen, setBizCategoryOpen] = useState(false);
  const [bizCompanyName, setBizCompanyName] = useState("");
  const [bizTradeLicense, setBizTradeLicense] = useState("");
  const [bizCategory, setBizCategory] = useState("");

  // Fetch existing profiles (404 → null, not an error)
  const { data: creatorProfile, refetch: refetchCreatorProfile } = useQuery<Record<string, any> | null>({
    queryKey: ["/api/creators/me"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/creators/me`, { credentials: "include", headers: await mobileHeaders() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch creator profile");
      return res.json();
    },
    enabled: !!user,
    staleTime: 0,
    retry: false,
  });

  const { data: businessProfile, refetch: refetchBusinessProfile } = useQuery<Record<string, any> | null>({
    queryKey: ["/api/businesses/me"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/businesses/me`, { credentials: "include", headers: await mobileHeaders() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch business profile");
      return res.json();
    },
    enabled: !!user,
    staleTime: 0,
    retry: false,
  });

  const createCreatorMutation = useMutation({
    mutationFn: async (data: { displayName: string; bio?: string; niche?: string; primaryPlatform?: string; audienceSize?: string }) => {
      const res = await apiRequest("POST", "/api/creators", data);
      return res.json();
    },
    onSuccess: () => {
      refetchCreatorProfile();
      toast({ title: "Creator profile created!", description: "You're now discoverable in the Creators directory." });
      const from = new URLSearchParams(window.location.search).get("from");
      if (from === "create-listing") setTimeout(() => window.location.assign("/create-listing"), 1200);
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to create creator profile", variant: "destructive" }),
  });

  const updateCreatorStatsMutation = useMutation({
    mutationFn: async (data: { followerCount: number; avgEngagementRate: number; contentNiches: string[]; primaryPlatform?: string; instagramHandle?: string; tiktokHandle?: string; youtubeHandle?: string; openToCollabs: boolean }) => {
      const res = await apiRequest("PATCH", "/api/me/creator-profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creators/me"] });
      setCpEditingStats(false);
      toast({ title: "Creator stats updated!", description: "Your profile is now visible in the Creators directory." });
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to update creator stats", variant: "destructive" }),
  });

  const createBusinessMutation = useMutation({
    mutationFn: async (data: { companyName: string; tradeLicenseNumber?: string; category?: string }) => {
      const res = await apiRequest("POST", "/api/businesses", data);
      return res.json();
    },
    onSuccess: () => {
      refetchBusinessProfile();
      toast({ title: "Business profile created!", description: "Complete KYB verification to publish business listings." });
      const from = new URLSearchParams(window.location.search).get("from");
      if (from === "create-listing") setTimeout(() => window.location.assign("/create-listing"), 1200);
    },
    onError: (err: any) => {
      if (err?.message?.includes("409")) {
        refetchBusinessProfile();
      } else {
        toast({ title: err?.message || "Failed to create business profile", variant: "destructive" });
      }
    },
  });

  const startKybMutation = useMutation({
    mutationFn: async (businessId: string) => {
      const returnTo = window.location.pathname + window.location.search;
      const res = await apiRequest("POST", `/api/businesses/${businessId}/kyb/start`, { returnTo });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.verificationUrl) {
        window.location.href = data.verificationUrl;
      } else {
        toast({ title: "KYB session started", description: "Follow the verification link sent to you." });
      }
    },
    onError: (err: any) => toast({ title: err?.message || "Could not start verification", variant: "destructive" }),
  });

  // ── Business profile settings (storefront fields) ───────────────────────
  const [bizDescription, setBizDescription] = useState("");
  const [bizLocation, setBizLocation] = useState("");
  const [bizWebsiteDisplay, setBizWebsiteDisplay] = useState("");
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  type DayKey = typeof DAYS[number];
  const defaultHours = () => Object.fromEntries(DAYS.map(d => [d, { open: "09:00", close: "18:00", closed: d === "sun" }]));
  const [bizHours, setBizHours] = useState<Record<DayKey, { open: string; close: string; closed: boolean }>>(defaultHours() as any);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Seed editable fields when businessProfile loads
  useEffect(() => {
    if (!businessProfile) return;
    setBizDescription(businessProfile.description ?? "");
    setBizLocation(businessProfile.location ?? "");
    setBizWebsiteDisplay(businessProfile.websiteDisplay ?? "");
    if (businessProfile.businessHours && typeof businessProfile.businessHours === "object") {
      setBizHours({ ...defaultHours(), ...businessProfile.businessHours } as any);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfile?.id]);

  const saveBusinessSettingsMutation = useMutation({
    mutationFn: async (businessId: string) => {
      const res = await apiRequest("PATCH", `/api/businesses/${businessId}`, {
        description: bizDescription.trim() || undefined,
        location: bizLocation.trim() || undefined,
        websiteDisplay: bizWebsiteDisplay.trim() || undefined,
        businessHours: bizHours,
      });
      return res.json();
    },
    onSuccess: () => {
      refetchBusinessProfile();
      toast({ title: "Business profile saved" });
    },
    onError: (err: any) => toast({ title: err?.message || "Save failed", variant: "destructive" }),
  });

  const uploadCoverMutation = useMutation({
    mutationFn: async ({ businessId, file }: { businessId: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/businesses/${businessId}/cover`, { method: "POST", credentials: "include", body: fd, headers: await mobileHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).message ?? "Upload failed"); }
      return res.json();
    },
    onSuccess: () => { refetchBusinessProfile(); toast({ title: "Cover image updated" }); },
    onError: (err: any) => toast({ title: err?.message || "Upload failed", variant: "destructive" }),
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async ({ businessId, file }: { businessId: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/businesses/${businessId}/logo`, { method: "POST", credentials: "include", body: fd, headers: await mobileHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).message ?? "Upload failed"); }
      return res.json();
    },
    onSuccess: () => { refetchBusinessProfile(); toast({ title: "Logo updated" }); },
    onError: (err: any) => toast({ title: err?.message || "Upload failed", variant: "destructive" }),
  });

  const RADIUS_OPTIONS = [
    { value: 0, label: t("settings.radiusUnlimited") },
    { value: 25, label: `25 ${t("common.km")}` },
    { value: 50, label: `50 ${t("common.km")}` },
    { value: 100, label: `100 ${t("common.km")}` },
    { value: 250, label: `250 ${t("common.km")}` },
    { value: 500, label: `500 ${t("common.km")}` },
  ];

  const TIMEZONES = useMemo(() => [
    { value: "Asia/Dubai", label: t("settings.tz.dubai") },
    { value: "Asia/Riyadh", label: t("settings.tz.riyadh") },
    { value: "Asia/Qatar", label: t("settings.tz.doha") },
    { value: "Asia/Kuwait", label: t("settings.tz.kuwait") },
    { value: "Asia/Bahrain", label: t("settings.tz.manama") },
    { value: "Asia/Muscat", label: t("settings.tz.muscat") },
    { value: "Europe/London", label: t("settings.tz.london") },
    { value: "America/New_York", label: t("settings.tz.newYork") },
  ], [t]);

  const CURRENCIES = useMemo(() => [
    { value: "AED", label: t("settings.cur.aed") },
    { value: "SAR", label: t("settings.cur.sar") },
    { value: "QAR", label: t("settings.cur.qar") },
    { value: "KWD", label: t("settings.cur.kwd") },
    { value: "BHD", label: t("settings.cur.bhd") },
    { value: "OMR", label: t("settings.cur.omr") },
    { value: "USD", label: t("settings.cur.usd") },
  ], [t]);

  const LANGUAGES = useMemo(() => [
    { value: "en", label: t("settings.lang.en") },
    { value: "ar", label: t("settings.lang.ar") },
  ], [t]);

  const accountSettingsSchema = useMemo(() => z.object({
    fullName: z.string().min(2, t("validation.nameTooShort")),
    email: z.string().email(t("validation.invalidEmail")),
    phone: z.string().optional(),
    website: z.string().url().optional().or(z.literal("")),
    businessName: z.string().optional(),
    location: z.string().optional(),
    country: z.string().length(2).optional(),
    city: z.string().optional(),
    timezone: z.string(),
    currency: z.string(),
    language: z.string(),
  }), [t]);

  const notificationSettingsSchema = useMemo(() => z.object({
    emailNotifications: z.boolean(),
    dealNotifications: z.boolean(),
    messageNotifications: z.boolean(),
    marketingEmails: z.boolean(),
  }), []);

  const privacySettingsSchema = useMemo(() => z.object({
    profileVisibility: z.string(),
    showEmail: z.boolean(),
    showPhone: z.boolean(),
    allowDirectMessages: z.boolean(),
  }), []);

  const tradingSettingsSchema = useMemo(() => z.object({
    preferredCategories: z.array(z.string()),
    tradingRadius: z.number().min(0),
    minTradeValue: z.string().optional(),
    maxTradeValue: z.string().optional(),
    autoMatchEnabled: z.boolean(),
  }), []);

  const passwordChangeSchema = useMemo(() => z.object({
    currentPassword: z.string().min(1, t("validation.currentPasswordRequired")),
    newPassword: z.string().min(8, t("validation.passwordTooShort")),
    confirmPassword: z.string(),
  }).refine(data => data.newPassword === data.confirmPassword, {
    message: t("validation.passwordsNoMatch"),
    path: ["confirmPassword"],
  }), [t]);

  const accountForm = useForm<AccountSettingsForm>({
    resolver: zodResolver(accountSettingsSchema),
    defaultValues: {
      fullName: user?.fullName || "",
      email: user?.email || "",
      phone: user?.phone || "",
      website: user?.website || "",
      businessName: user?.businessName || "",
      location: user?.location || "",
      country: user?.country || "AE",
      city: user?.city || "",
      timezone: user?.timezone || "Asia/Dubai",
      currency: user?.currency || "AED",
      language: user?.language || "en",
    },
  });

  useEffect(() => {
    if (!user) return;
    accountForm.reset({
      fullName: user.fullName || "",
      email: user.email || "",
      phone: user.phone || "",
      website: user.website || "",
      businessName: user.businessName || "",
      location: user.location || "",
      country: user.country || "AE",
      city: user.city || "",
      timezone: user.timezone || "Asia/Dubai",
      currency: user.currency || "AED",
      language: user.language || activeLanguage,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.fullName, user?.email, user?.phone, user?.website, user?.businessName, user?.location, user?.country, user?.city, user?.timezone, user?.currency, user?.language]);

  useEffect(() => {
    if (accountForm.getValues("language") !== activeLanguage) {
      accountForm.setValue("language", activeLanguage);
    }
  }, [activeLanguage, accountForm]);

  const notificationForm = useForm<NotificationSettingsForm>({
    resolver: zodResolver(notificationSettingsSchema),
    defaultValues: {
      emailNotifications: user?.emailNotifications ?? true,
      dealNotifications: user?.dealNotifications ?? true,
      messageNotifications: user?.messageNotifications ?? true,
      marketingEmails: user?.marketingEmails ?? false,
    },
  });

  const privacyForm = useForm<PrivacySettingsForm>({
    resolver: zodResolver(privacySettingsSchema),
    defaultValues: {
      profileVisibility: user?.profileVisibility || "public",
      showEmail: user?.showEmail ?? false,
      showPhone: user?.showPhone ?? false,
      allowDirectMessages: user?.allowDirectMessages ?? true,
    },
  });

  const tradingForm = useForm<TradingSettingsForm>({
    resolver: zodResolver(tradingSettingsSchema),
    defaultValues: {
      preferredCategories: (user?.preferredCategories as string[]) || [],
      tradingRadius: user?.tradingRadius || 0,
      minTradeValue: user?.minTradeValue?.toString() || "",
      maxTradeValue: user?.maxTradeValue?.toString() || "",
      autoMatchEnabled: user?.autoMatchEnabled ?? true,
    },
  });

  const passwordForm = useForm<PasswordChangeForm>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<AccountSettingsForm & NotificationSettingsForm & PrivacySettingsForm & TradingSettingsForm>) => {
      const res = await apiRequest("PATCH", "/api/users/settings", data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      const nextLang = (variables as { language?: string } | undefined)?.language;
      if (nextLang === "en" || nextLang === "ar") {
        setLanguage(nextLang as Language);
      }
      toast({
        title: t("settings.settingsSaved"),
        description: t("settings.settingsSavedDesc"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("settings.saveFailed"),
        variant: "destructive",
      });
    },
  });

  // Step 1: verify current password + email OTP
  const requestPasswordChangeMutation = useMutation({
    mutationFn: async (data: PasswordChangeForm) => {
      const res = await apiRequest("POST", "/api/users/change-password/request", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      return res.json();
    },
    onSuccess: (_resp, data) => {
      setPendingPasswordData({ currentPassword: data.currentPassword, newPassword: data.newPassword });
      setPasswordChangeStep("otp");
      setOtpValue("");
      toast({
        title: t("settings.otpSent"),
        description: t("settings.otpSentDesc"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("settings.passwordChangeFailed"),
        variant: "destructive",
      });
    },
  });

  // Step 2: submit OTP to confirm the change
  const changePasswordMutation = useMutation({
    mutationFn: async ({ otp }: { otp: string }) => {
      if (!pendingPasswordData) throw new Error("No pending change");
      const res = await apiRequest("POST", "/api/users/change-password", {
        currentPassword: pendingPasswordData.currentPassword,
        newPassword: pendingPasswordData.newPassword,
        otp,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t("settings.passwordChanged"),
        description: t("settings.passwordChangedDesc"),
      });
      passwordForm.reset();
      setPasswordChangeStep("form");
      setPendingPasswordData(null);
      setOtpValue("");
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("settings.otpInvalid"),
        variant: "destructive",
      });
    },
  });

  const deleteCreatorMutation = useMutation({
    mutationFn: async () => {
      const hdrs = await mobileHeaders();
      const res = await fetch(`${API_BASE}/api/creators/me`, { method: "DELETE", credentials: "include", headers: hdrs });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to delete creator profile");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Creator profile deleted", description: "Your creator profile has been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/creators/me"] });
      setDeleteCreatorOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete creator profile", variant: "destructive" });
    },
  });

  const deleteBusinessMutation = useMutation({
    mutationFn: async (businessId: string) => {
      const hdrs = await mobileHeaders();
      const res = await fetch(`${API_BASE}/api/businesses/${businessId}/self`, { method: "DELETE", credentials: "include", headers: hdrs });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to delete business profile");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Business profile deleted", description: "Your business profile has been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses/me"] });
      setDeleteBusinessOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete business profile", variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (password: string) => {
      const hdrs = await mobileHeaders();
      const res = await fetch(`${API_BASE}/api/me`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to delete account");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Account deleted", description: "Your account has been permanently deleted." });
      setDeleteAccountOpen(false);
      logout?.();
      navigate("/");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Could not delete account", variant: "destructive" });
    },
  });

  const onAccountSubmit = (data: AccountSettingsForm) => {
    updateSettingsMutation.mutate({ ...data, socialLinks } as any);
  };

  const onNotificationSubmit = (data: NotificationSettingsForm) => {
    updateSettingsMutation.mutate(data);
  };

  const onPrivacySubmit = (data: PrivacySettingsForm) => {
    updateSettingsMutation.mutate(data);
  };

  const onTradingSubmit = (data: TradingSettingsForm) => {
    updateSettingsMutation.mutate({
      ...data,
      preferredCategories: selectedCategories,
    });
  };

  const onPasswordSubmit = (data: PasswordChangeForm) => {
    requestPasswordChangeMutation.mutate(data);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  if (!user) {
    return (
      <div className="container px-4 py-12 mx-auto max-w-4xl text-center">
        <p className="text-muted-foreground">{t("settings.signInRequired")}</p>
      </div>
    );
  }

  const SECTIONS = [
    { id: "account",       label: t("settings.account"),       icon: User,      desc: "Name, email, phone, location" },
    { id: "notifications", label: t("settings.notifications"), icon: Bell,      desc: "Email alerts, deals, messages" },
    { id: "privacy",       label: t("settings.privacy"),       icon: Eye,       desc: "Who can see your profile" },
    { id: "trading",       label: t("settings.bartering"),     icon: RefreshCw, desc: "Categories, radius, preferences" },
    { id: "security",      label: t("settings.security"),      icon: Lock,      desc: "Password, verification, data" },
    { id: "profile-mode",  label: "Profile Mode",              icon: Users,     desc: "Creator and business profiles" },
  ];

  const activeSectionLabel = SECTIONS.find(s => s.id === activeTab)?.label ?? "";

  return (
    <div className="mx-auto max-w-4xl">

      {/* ── MOBILE: menu list ─────────────────────────────────────── */}
      {mobileView === "menu" && (
        <div className="md:hidden">
          <div className="px-4 pt-4 pb-1">
            <BackButton fallback="/profile" label="Profile" />
          </div>
          <div className="px-4 pt-2 pb-4 flex items-center gap-3 border-b border-border">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">{t("settings.accountSettings")}</h1>
          </div>
          <div className="divide-y divide-border">
            {SECTIONS.map(section => (
              <button
                key={section.id}
                type="button"
                className="w-full flex items-center gap-4 px-4 py-4 hover:bg-muted/40 active:bg-muted/60 transition-colors text-left"
                onClick={() => { setActiveTab(section.id); setMobileView("section"); }}
                data-testid={`mobile-settings-${section.id}`}
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <section.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{section.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{section.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── MOBILE: section content (back button header) ──────────── */}
      {mobileView === "section" && (
        <div className="md:hidden sticky top-0 z-10 bg-background border-b border-border flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileView("menu")}
            className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Back to settings"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="font-semibold text-foreground">{activeSectionLabel}</h2>
        </div>
      )}

      {/* ── CONTENT: hidden on mobile when showing menu ───────────── */}
      <div className={`${mobileView === "menu" ? "hidden md:block" : "block"} px-3 py-4 md:container md:px-4 md:py-8`}>

        {/* Desktop header */}
        <div className="hidden md:flex items-center gap-3 mb-8">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t("settings.accountSettings")}</h1>
            <p className="text-muted-foreground">{t("settings.managePreferences")}</p>
          </div>
        </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setMobileView("section"); }} className="space-y-6">
        <div className="hidden md:block">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="account" data-testid="tab-account">
            <User className="h-4 w-4 mr-2" />
            {t("settings.account")}
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Bell className="h-4 w-4 mr-2" />
            {t("settings.notifications")}
          </TabsTrigger>
          <TabsTrigger value="privacy" data-testid="tab-privacy">
            <Eye className="h-4 w-4 mr-2" />
            {t("settings.privacy")}
          </TabsTrigger>
          <TabsTrigger value="trading" data-testid="tab-bartering">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("settings.bartering")}
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Lock className="h-4 w-4 mr-2" />
            {t("settings.security")}
          </TabsTrigger>
          <TabsTrigger value="profile-mode" data-testid="tab-profile-mode">
            <Users className="h-4 w-4 mr-2" />
            Profile Mode
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.accountInformation")}</CardTitle>
              <CardDescription>{t("settings.updateDetails")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...accountForm}>
                <form onSubmit={accountForm.handleSubmit(onAccountSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={accountForm.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("auth.fullName")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("auth.fullName")} {...field} data-testid="input-fullname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={accountForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("settings.emailAddress")}</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder={t("settings.emailPlaceholder")} {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={accountForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("settings.phoneNumber")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("settings.phonePlaceholder")} {...field} data-testid="input-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={accountForm.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("settings.website")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("settings.websitePlaceholder")} {...field} data-testid="input-website" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={accountForm.control}
                      name="businessName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("auth.businessName")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("auth.businessName")} {...field} data-testid="input-business-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="font-medium">Social Media Links</h4>
                    <p className="text-sm text-muted-foreground">Add your social profiles so others can connect with you.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="social-instagram" className="flex items-center gap-1.5"><Instagram className="h-4 w-4" /> Instagram</Label>
                        <Input id="social-instagram" placeholder="https://instagram.com/yourhandle" value={socialLinks.instagram || ""} onChange={(e) => setSocialLinks(prev => ({ ...prev, instagram: e.target.value }))} data-testid="input-social-instagram" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="social-tiktok" className="flex items-center gap-1.5">TikTok</Label>
                        <Input id="social-tiktok" placeholder="https://tiktok.com/@yourhandle" value={socialLinks.tiktok || ""} onChange={(e) => setSocialLinks(prev => ({ ...prev, tiktok: e.target.value }))} data-testid="input-social-tiktok" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="social-youtube" className="flex items-center gap-1.5">YouTube</Label>
                        <Input id="social-youtube" placeholder="https://youtube.com/@channel" value={socialLinks.youtube || ""} onChange={(e) => setSocialLinks(prev => ({ ...prev, youtube: e.target.value }))} data-testid="input-social-youtube" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="social-snapchat" className="flex items-center gap-1.5">Snapchat</Label>
                        <Input id="social-snapchat" placeholder="https://snapchat.com/add/yourhandle" value={socialLinks.snapchat || ""} onChange={(e) => setSocialLinks(prev => ({ ...prev, snapchat: e.target.value }))} data-testid="input-social-snapchat" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="social-linkedin" className="flex items-center gap-1.5"><Linkedin className="h-4 w-4" /> LinkedIn</Label>
                        <Input id="social-linkedin" placeholder="https://linkedin.com/in/yourprofile" value={socialLinks.linkedin || ""} onChange={(e) => setSocialLinks(prev => ({ ...prev, linkedin: e.target.value }))} data-testid="input-social-linkedin" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="social-twitter" className="flex items-center gap-1.5"><Twitter className="h-4 w-4" /> X / Twitter</Label>
                        <Input id="social-twitter" placeholder="https://x.com/yourhandle" value={socialLinks.twitter || ""} onChange={(e) => setSocialLinks(prev => ({ ...prev, twitter: e.target.value }))} data-testid="input-social-twitter" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={accountForm.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("create.country")}</FormLabel>
                          <Select
                            onValueChange={(v) => {
                              field.onChange(v);
                              accountForm.setValue("city", "");
                              accountForm.setValue("location", "");
                            }}
                            value={field.value || "AE"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-country">
                                <SelectValue placeholder={t("settings.selectCountry")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-72">
                              {COUNTRIES.map((c) => (
                                <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={accountForm.control}
                      name="city"
                      render={({ field }) => {
                        const countryCode = accountForm.watch("country") || "AE";
                        const cities = getCitiesForCountry(countryCode);
                        return (
                          <FormItem>
                            <FormLabel>{t("create.city")}</FormLabel>
                            <Select
                              onValueChange={(v) => { field.onChange(v); accountForm.setValue("location", v); }}
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-city">
                                  <SelectValue placeholder={t("create.selectCity")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {cities.map((c) => (
                                  <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium">{t("settings.displayPreferences")}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={accountForm.control}
                        name="language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("settings.language")}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-language">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {LANGUAGES.map(lang => (
                                  <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={accountForm.control}
                        name="timezone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("settings.timezone")}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-timezone">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TIMEZONES.map(tz => (
                                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={accountForm.control}
                        name="currency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("settings.currency")}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-currency">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {CURRENCIES.map(curr => (
                                  <SelectItem key={curr.value} value={curr.value}>{curr.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full md:w-auto"
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-account"
                  >
                    {updateSettingsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    {t("settings.saveChanges")}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {user?.accountType === "business" && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {t("settings.businessLicenseTitle")}
                </CardTitle>
                <CardDescription>
                  {t("settings.businessLicenseDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{t("settings.kybStatus")}</p>
                    <Badge
                      variant={
                        user?.kybStatus === "APPROVED" ? "default" :
                        user?.kybStatus === "PENDING_REVIEW" ? "secondary" : "outline"
                      }
                      className="mt-1"
                    >
                      {user?.kybStatus === "APPROVED" ? t("settings.kybVerified") :
                       user?.kybStatus === "PENDING_REVIEW" ? t("settings.kybPendingReview") :
                       t("settings.kybNotUploaded")}
                    </Badge>
                  </div>
                  {user?.businessLicenseUrl && (
                    <a
                      href={user.businessLicenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto"
                    >
                      <Button variant="outline" size="sm">
                        {t("settings.viewDocument")}
                      </Button>
                    </a>
                  )}
                </div>

                {user?.kybStatus !== "APPROVED" && (
                  <div>
                    <Label htmlFor="license-upload">{t("settings.uploadLicenseLabel")}</Label>
                    <p className="text-xs text-muted-foreground mb-2 mt-1">
                      {t("settings.uploadLicenseHint")}
                    </p>
                    <input
                      id="license-upload"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      data-testid="input-license-upload"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("type", "business_license");
                        try {
                          const res = await fetch(`${API_BASE}/api/upload`, {
                            method: "POST",
                            body: formData,
                            credentials: "include",
                          });
                          if (res.ok) {
                            window.location.reload();
                          }
                        } catch {}
                      }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById("license-upload")?.click()}
                      data-testid="button-upload-license"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t("settings.chooseFileUpload")}
                    </Button>
                  </div>
                )}

                {user?.kybStatus === "APPROVED" && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    {t("settings.licenseVerified")}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.notificationPreferences")}</CardTitle>
              <CardDescription>{t("settings.chooseNotifications")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...notificationForm}>
                <form onSubmit={notificationForm.handleSubmit(onNotificationSubmit)} className="space-y-6">
                  <FormField
                    control={notificationForm.control}
                    name="emailNotifications"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{t("settings.emailNotifications")}</FormLabel>
                          <FormDescription>
                            {t("settings.emailNotificationsDesc")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-email-notifications"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={notificationForm.control}
                    name="dealNotifications"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{t("settings.dealUpdates")}</FormLabel>
                          <FormDescription>
                            {t("settings.dealUpdatesDesc")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-deal-notifications"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={notificationForm.control}
                    name="messageNotifications"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{t("settings.messageAlerts")}</FormLabel>
                          <FormDescription>
                            {t("settings.messageAlertsDesc")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-message-notifications"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={notificationForm.control}
                    name="marketingEmails"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{t("settings.marketingPromo")}</FormLabel>
                          <FormDescription>
                            {t("settings.marketingPromoDesc")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-marketing-emails"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-notifications"
                  >
                    {updateSettingsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    {t("settings.savePreferences")}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WhatsApp notifications — additive, below the email notification card */}
        <div className="mt-4">
          <WhatsappSettingsToggle />
        </div>

        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.privacySettings")}</CardTitle>
              <CardDescription>{t("settings.controlWhoSees")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...privacyForm}>
                <form onSubmit={privacyForm.handleSubmit(onPrivacySubmit)} className="space-y-6">
                  <FormField
                    control={privacyForm.control}
                    name="profileVisibility"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.profileVisibility")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-profile-visibility">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="public">{t("settings.visibility.public")}</SelectItem>
                            <SelectItem value="verified_only">{t("settings.visibility.verifiedOnly")}</SelectItem>
                            <SelectItem value="private">{t("settings.visibility.private")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  <FormField
                    control={privacyForm.control}
                    name="showEmail"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{t("settings.showEmail")}</FormLabel>
                          <FormDescription>
                            {t("settings.showEmailDesc")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-show-email"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={privacyForm.control}
                    name="showPhone"
                    render={({ field }) => (
                      <FormItem className="rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">{t("settings.showPhone")}</FormLabel>
                            <FormDescription>
                              Show your phone number publicly on your profile and listings so anyone can call you directly.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-show-phone"
                            />
                          </FormControl>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                          💬 Regardless of this setting, you can always share your number privately inside a deal chat using the "Share my phone" button.
                        </p>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={privacyForm.control}
                    name="allowDirectMessages"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{t("settings.allowDMs")}</FormLabel>
                          <FormDescription>
                            {t("settings.allowDMsDesc")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-allow-dm"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-privacy"
                  >
                    {updateSettingsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    {t("settings.savePrivacy")}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trading">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.barteringPreferences")}</CardTitle>
              <CardDescription>{t("settings.barteringPreferencesDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...tradingForm}>
                <form onSubmit={tradingForm.handleSubmit(onTradingSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <Label>{t("settings.preferredCategories")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.selectCategories")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map(category => (
                        <Badge
                          key={category}
                          variant={selectedCategories.includes(category) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleCategory(category)}
                          data-testid={`badge-category-${category.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <FormField
                    control={tradingForm.control}
                    name="tradingRadius"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.barteringRadius")}</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(parseInt(v))}
                          value={field.value.toString()}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-trading-radius">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {RADIUS_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value.toString()}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {t("settings.barteringRadiusDesc")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={tradingForm.control}
                      name="minTradeValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("settings.minBarterValue")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="0"
                              {...field}
                              data-testid="input-min-trade-value"
                            />
                          </FormControl>
                          <FormDescription>
                            {t("settings.minBarterValueDesc")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={tradingForm.control}
                      name="maxTradeValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("settings.maxBarterValue")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder={t("settings.unlimitedPlaceholder")}
                              {...field}
                              data-testid="input-max-trade-value"
                            />
                          </FormControl>
                          <FormDescription>
                            {t("settings.maxBarterValueDesc")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={tradingForm.control}
                    name="autoMatchEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{t("settings.aiAutoMatch")}</FormLabel>
                          <FormDescription>
                            {t("settings.aiAutoMatchDesc")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-auto-match"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-bartering"
                  >
                    {updateSettingsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    {t("settings.saveBarteringPrefs")}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.changePassword")}</CardTitle>
                <CardDescription>{t("settings.updatePassword")}</CardDescription>
              </CardHeader>
              <CardContent>
                {passwordChangeStep === "form" ? (
                  <Form {...passwordForm}>
                    <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                      <FormField
                        control={passwordForm.control}
                        name="currentPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("settings.currentPassword")}</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="••••••••"
                                {...field}
                                data-testid="input-current-password"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={passwordForm.control}
                        name="newPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("settings.newPassword")}</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="••••••••"
                                {...field}
                                data-testid="input-new-password"
                              />
                            </FormControl>
                            <FormDescription>
                              {t("settings.passwordMinLength")}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={passwordForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("settings.confirmNewPassword")}</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="••••••••"
                                {...field}
                                data-testid="input-confirm-password"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        disabled={requestPasswordChangeMutation.isPending}
                        data-testid="button-send-verification-code"
                      >
                        {requestPasswordChangeMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        {t("settings.sendVerificationCode")}
                      </Button>
                    </form>
                  </Form>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t("settings.otpSentDesc")}
                    </p>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none" htmlFor="otp-input">
                        {t("settings.verificationCode")}
                      </label>
                      <Input
                        id="otp-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder={t("settings.verificationCodePlaceholder")}
                        value={otpValue}
                        onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        data-testid="input-otp"
                        className="tracking-widest text-center text-lg font-mono"
                      />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        onClick={() => changePasswordMutation.mutate({ otp: otpValue })}
                        disabled={changePasswordMutation.isPending || otpValue.length !== 6}
                        data-testid="button-confirm-change"
                      >
                        {changePasswordMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        {t("settings.confirmChange")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => requestPasswordChangeMutation.mutate(passwordForm.getValues())}
                        disabled={requestPasswordChangeMutation.isPending}
                        data-testid="button-resend-code"
                      >
                        {requestPasswordChangeMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        {t("settings.resendCode")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setPasswordChangeStep("form");
                          setPendingPasswordData(null);
                          setOtpValue("");
                        }}
                        data-testid="button-back-to-form"
                      >
                        {t("settings.backToForm")}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("settings.accountSecurity")}</CardTitle>
                <CardDescription>{t("settings.manageSecuritySettings")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      user.isVerified
                        ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
                        : (user.kycStatus === "EXPIRED" || user.kybStatus === "EXPIRED")
                          ? "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400"
                          : (user.kycStatus === "IN_REVIEW" || user.kybStatus === "IN_REVIEW" || user.kycStatus === "IN_PROGRESS" || user.kybStatus === "IN_PROGRESS" || user.kycStatus === "PENDING_REVIEW" || user.kybStatus === "PENDING_REVIEW")
                            ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400"
                            : (user.kycStatus === "DECLINED" || user.kybStatus === "DECLINED")
                              ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{t("settings.identityVerification")}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.isVerified
                          ? t("settings.verificationIdentityVerified")
                          : (user.kycStatus === "EXPIRED" || user.kybStatus === "EXPIRED")
                            ? t("settings.verificationExpired")
                            : (user.kycStatus === "IN_REVIEW" || user.kybStatus === "IN_REVIEW")
                              ? t("settings.verificationInReview")
                              : (user.kycStatus === "IN_PROGRESS" || user.kybStatus === "IN_PROGRESS" || user.kycStatus === "PENDING_REVIEW" || user.kybStatus === "PENDING_REVIEW")
                                ? t("settings.verificationInProgress")
                                : (user.kycStatus === "DECLINED" || user.kybStatus === "DECLINED")
                                  ? t("settings.verificationDeclined")
                                  : t("settings.verificationRequired")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(user.kycStatus === "IN_REVIEW" || user.kybStatus === "IN_REVIEW" ||
                      user.kycStatus === "IN_PROGRESS" || user.kybStatus === "IN_PROGRESS" ||
                      user.kycStatus === "PENDING_REVIEW" || user.kybStatus === "PENDING_REVIEW") && (
                      <VerificationRefreshButton onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] })} />
                    )}
                    {!user.isVerified && (
                      <Button variant="outline" size="sm" asChild data-testid="button-verify-identity">
                        <a href="/profile">
                          {(user.kycStatus === "EXPIRED" || user.kybStatus === "EXPIRED") ? t("settings.startNewVerification") : t("settings.verifyNow")}
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive">{t("settings.dangerZone")}</CardTitle>
                <CardDescription>{t("settings.dangerZoneDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t("settings.exportData")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.exportDataDesc")}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-export-data">
                    <Download className="h-4 w-4 mr-2" />
                    {t("settings.exportBtn")}
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-destructive">{t("settings.deleteAccount")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.deleteAccountDesc")}
                    </p>
                  </div>
                  <Button variant="destructive" size="sm" data-testid="button-delete-account" onClick={() => { setDeleteAccountPassword(""); setDeleteAccountOpen(true); }}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("settings.deleteAccount")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="profile-mode">
          <div className="space-y-6">

            {/* ── Creator Profile ── */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Camera className="h-5 w-5 text-primary" />
                      Creator Profile
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Get discovered by brands. Show your niche, platform, and audience size.
                    </CardDescription>
                  </div>
                  {creatorProfile && (
                    <Badge className="shrink-0 mt-0.5 bg-primary/10 text-primary border-primary/20">Active</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {creatorProfile ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Display Name</p>
                        <p className="font-medium text-sm">{creatorProfile.displayName}</p>
                      </div>
                      {creatorProfile.niche && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Niche</p>
                          <p className="font-medium text-sm">{creatorProfile.niche}</p>
                        </div>
                      )}
                      {creatorProfile.primaryPlatform && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Primary Platform</p>
                          <p className="font-medium text-sm">{creatorProfile.primaryPlatform}</p>
                        </div>
                      )}
                      {creatorProfile.audienceSize && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Audience Size</p>
                          <p className="font-medium text-sm">{creatorProfile.audienceSize}</p>
                        </div>
                      )}
                    </div>
                    {creatorProfile.bio && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Bio</p>
                        <p className="text-sm leading-relaxed">{creatorProfile.bio}</p>
                      </div>
                    )}
                    {/* Stats section — follower count, engagement, niches */}
                    <div className="pt-3 border-t border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">Audience Stats</p>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                          const jsonb = (user as any)?.creatorProfile;
                          setCpFollowerCount(String(jsonb?.followerCount ?? ""));
                          setCpEngagementRate(String(jsonb?.avgEngagementRate ?? ""));
                          setCpContentNiches(jsonb?.contentNiches ?? []);
                          setCpInstagramHandle(jsonb?.instagramHandle ?? "");
                          setCpTiktokHandle(jsonb?.tiktokHandle ?? "");
                          setCpYoutubeHandle(jsonb?.youtubeHandle ?? "");
                          setCpPrimaryPlatform(jsonb?.primaryPlatform ?? creatorProfile.primaryPlatform ?? "");
                          setCpEditingStats(true);
                        }}>
                          <Pencil className="h-3 w-3" /> Edit stats
                        </Button>
                      </div>
                      {cpEditingStats ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="cp-followers" className="text-xs">Followers <span className="text-destructive">*</span></Label>
                              <Input id="cp-followers" type="number" min="2000" placeholder="e.g. 10000" value={cpFollowerCount} onChange={e => setCpFollowerCount(e.target.value)} className="h-8 text-sm" />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="cp-eng" className="text-xs">Engagement Rate %</Label>
                              <Input id="cp-eng" type="number" step="0.1" min="0" max="100" placeholder="e.g. 4.5" value={cpEngagementRate} onChange={e => setCpEngagementRate(e.target.value)} className="h-8 text-sm" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Primary Platform</Label>
                            <select value={cpPrimaryPlatform ?? ""} onChange={e => setCpPrimaryPlatform(e.target.value || undefined)} className="w-full h-8 rounded-md border border-input bg-transparent px-3 text-sm">
                              <option value="">Select platform</option>
                              {CREATOR_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Content Niches</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {CONTENT_NICHE_OPTIONS.map(n => (
                                <button key={n} type="button" onClick={() => setCpContentNiches(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])}
                                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${cpContentNiches.includes(n) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Instagram handle</Label>
                              <Input placeholder="@handle" value={cpInstagramHandle} onChange={e => setCpInstagramHandle(e.target.value)} className="h-7 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">TikTok handle</Label>
                              <Input placeholder="@handle" value={cpTiktokHandle} onChange={e => setCpTiktokHandle(e.target.value)} className="h-7 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">YouTube handle</Label>
                              <Input placeholder="@channel" value={cpYoutubeHandle} onChange={e => setCpYoutubeHandle(e.target.value)} className="h-7 text-xs" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="text-xs h-8" disabled={!cpFollowerCount || parseInt(cpFollowerCount) < 2000 || updateCreatorStatsMutation.isPending}
                              onClick={() => updateCreatorStatsMutation.mutate({
                                followerCount: parseInt(cpFollowerCount),
                                avgEngagementRate: parseFloat(cpEngagementRate) || 0,
                                contentNiches: cpContentNiches,
                                primaryPlatform: cpPrimaryPlatform,
                                instagramHandle: cpInstagramHandle || undefined,
                                tiktokHandle: cpTiktokHandle || undefined,
                                youtubeHandle: cpYoutubeHandle || undefined,
                                openToCollabs: true,
                              })}>
                              {updateCreatorStatsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                              Save stats
                            </Button>
                            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setCpEditingStats(false)}>Cancel</Button>
                          </div>
                          {parseInt(cpFollowerCount) > 0 && parseInt(cpFollowerCount) < 2000 && (
                            <p className="text-xs text-destructive">Minimum 2,000 followers required.</p>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-3 text-center">
                          {[
                            { label: "Followers", value: (user as any)?.creatorProfile?.followerCount ? Number((user as any).creatorProfile.followerCount).toLocaleString() : "—" },
                            { label: "Engagement", value: (user as any)?.creatorProfile?.avgEngagementRate ? `${(user as any).creatorProfile.avgEngagementRate}%` : "—" },
                            { label: "Niches", value: ((user as any)?.creatorProfile?.contentNiches as string[] | undefined)?.length ? `${((user as any).creatorProfile.contentNiches as string[]).length} set` : "—" },
                          ].map(s => (
                            <div key={s.label} className="bg-muted/40 rounded-lg p-2">
                              <p className="text-sm font-bold">{s.value}</p>
                              <p className="text-[10px] text-muted-foreground">{s.label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-border">
                      <Link href={`/creators/${user?.id}`}>
                        <Button variant="outline" size="sm" className="gap-2 text-xs">
                          <Eye className="h-3.5 w-3.5" />
                          View my creator page
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cp-display-name">Display Name <span className="text-destructive">*</span></Label>
                      <Input
                        id="cp-display-name"
                        placeholder="Your creator name"
                        value={cpDisplayName}
                        onChange={(e) => setCpDisplayName(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cp-bio">Bio</Label>
                      <Textarea
                        id="cp-bio"
                        placeholder="Tell brands what you create..."
                        value={cpBio}
                        onChange={(e) => setCpBio(e.target.value)}
                        rows={3}
                        maxLength={500}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="cp-niche">Niche</Label>
                        <Input
                          id="cp-niche"
                          value={cpNiche}
                          onChange={e => setCpNiche(e.target.value)}
                          placeholder="Fashion, Food, Tech, Fitness, Travel…"
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cp-platform">Primary Platform</Label>
                        <select
                          id="cp-platform"
                          value={cpPrimaryPlatform ?? ""}
                          onChange={e => setCpPrimaryPlatform(e.target.value || undefined)}
                          className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">Select platform</option>
                          {CREATOR_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cp-audience">Audience Size</Label>
                      <Input
                        id="cp-audience"
                        value={cpAudienceSize}
                        onChange={e => setCpAudienceSize(e.target.value)}
                        placeholder="10K, 500K, 1.2M…"
                        maxLength={50}
                      />
                    </div>
                    <Button
                      onClick={() => createCreatorMutation.mutate({
                        displayName: cpDisplayName.trim(),
                        bio: cpBio.trim() || undefined,
                        niche: cpNiche || undefined,
                        primaryPlatform: cpPrimaryPlatform || undefined,
                        audienceSize: cpAudienceSize || undefined,
                      })}
                      disabled={!cpDisplayName.trim() || createCreatorMutation.isPending}
                      className="w-full"
                    >
                      {createCreatorMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Create Creator Profile
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Business Profile ── */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      Business Profile
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Sell products and services to other businesses. Requires business verification.
                    </CardDescription>
                  </div>
                  {businessProfile && (
                    <Badge className={`shrink-0 mt-0.5 ${businessProfile.kybStatus === "verified" ? "bg-green-100 text-green-700 border-green-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                      {businessProfile.kybStatus === "verified" ? "Verified" : "Pending KYB"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {businessProfile ? (
                  <div className="space-y-6">
                    {/* Read-only identity row */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Company Name</p>
                        <p className="font-medium text-sm">{businessProfile.companyName}</p>
                      </div>
                      {businessProfile.category && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Category</p>
                          <p className="font-medium text-sm">{businessProfile.category}</p>
                        </div>
                      )}
                      {businessProfile.tradeLicenseNumber && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Trade License</p>
                          <p className="font-medium text-sm">{businessProfile.tradeLicenseNumber}</p>
                        </div>
                      )}
                    </div>

                    {/* Cover + Logo uploads */}
                    <div className="border-t border-border pt-4 space-y-3">
                      <p className="text-sm font-medium">Storefront images</p>
                      <div className="flex flex-wrap gap-4">
                        {/* Cover */}
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">Cover banner</p>
                          {businessProfile.coverImageUrl ? (
                            <div className="relative w-40 h-20 rounded-md overflow-hidden border border-border">
                              <img src={assetUrl(businessProfile.coverImageUrl)} alt="Cover" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-40 h-20 rounded-md border-2 border-dashed border-border flex items-center justify-center text-muted-foreground/50">
                              <Camera className="h-6 w-6" />
                            </div>
                          )}
                          <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadCoverMutation.mutate({ businessId: businessProfile.id, file: f }); e.target.value = ""; }} />
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs w-40"
                            disabled={uploadCoverMutation.isPending}
                            onClick={() => coverInputRef.current?.click()}>
                            {uploadCoverMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                            {businessProfile.coverImageUrl ? "Change cover" : "Upload cover"}
                          </Button>
                        </div>
                        {/* Logo */}
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">Logo</p>
                          {businessProfile.logoUrl ? (
                            <div className="relative w-20 h-20 rounded-full overflow-hidden border border-border">
                              <img src={assetUrl(businessProfile.logoUrl)} alt="Logo" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center text-muted-foreground/50">
                              <Building2 className="h-6 w-6" />
                            </div>
                          )}
                          <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogoMutation.mutate({ businessId: businessProfile.id, file: f }); e.target.value = ""; }} />
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs w-20"
                            disabled={uploadLogoMutation.isPending}
                            onClick={() => logoInputRef.current?.click()}>
                            {uploadLogoMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                            Logo
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Editable fields */}
                    <div className="border-t border-border pt-4 space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="biz-description">Description</Label>
                        <Textarea
                          id="biz-description"
                          placeholder="Tell visitors what your business offers…"
                          value={bizDescription}
                          onChange={e => setBizDescription(e.target.value)}
                          maxLength={2000}
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="biz-location">Location</Label>
                          <Input
                            id="biz-location"
                            placeholder="e.g. Dubai Marina, UAE"
                            value={bizLocation}
                            onChange={e => setBizLocation(e.target.value)}
                            maxLength={200}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="biz-website-display">Website</Label>
                          <Input
                            id="biz-website-display"
                            placeholder="e.g. www.example.com"
                            value={bizWebsiteDisplay}
                            onChange={e => setBizWebsiteDisplay(e.target.value)}
                            maxLength={300}
                          />
                          <p className="text-[10px] text-muted-foreground">Displayed as plain text only. Not a clickable link.</p>
                        </div>
                      </div>

                      {/* Business hours */}
                      <div className="space-y-2">
                        <Label>Business Hours <span className="text-[10px] text-muted-foreground font-normal">(Dubai time)</span></Label>
                        <div className="space-y-1.5">
                          {DAYS.map(day => (
                            <div key={day} className="flex items-center gap-3">
                              <span className="w-8 text-xs font-medium text-muted-foreground shrink-0">{DAY_LABELS[day]}</span>
                              <Checkbox
                                checked={!bizHours[day]?.closed}
                                onCheckedChange={v => setBizHours(h => ({ ...h, [day]: { ...h[day], closed: !v } }))}
                                id={`biz-hours-open-${day}`}
                              />
                              <label htmlFor={`biz-hours-open-${day}`} className="text-xs text-muted-foreground sr-only">Open</label>
                              {!bizHours[day]?.closed ? (
                                <>
                                  <Input
                                    type="time"
                                    value={bizHours[day]?.open ?? "09:00"}
                                    onChange={e => setBizHours(h => ({ ...h, [day]: { ...h[day], open: e.target.value } }))}
                                    className="h-7 w-28 text-xs"
                                  />
                                  <span className="text-xs text-muted-foreground">–</span>
                                  <Input
                                    type="time"
                                    value={bizHours[day]?.close ?? "18:00"}
                                    onChange={e => setBizHours(h => ({ ...h, [day]: { ...h[day], close: e.target.value } }))}
                                    className="h-7 w-28 text-xs"
                                  />
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">Closed</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        disabled={saveBusinessSettingsMutation.isPending}
                        onClick={() => saveBusinessSettingsMutation.mutate(businessProfile.id)}
                      >
                        {saveBusinessSettingsMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Save business profile
                      </Button>
                    </div>

                    <div className="pt-2 border-t border-border">
                      <Link href={`/businesses/${businessProfile.id}`}>
                        <Button variant="outline" size="sm" className="gap-2 text-xs">
                          <Eye className="h-3.5 w-3.5" />
                          View my business page
                        </Button>
                      </Link>
                    </div>

                    {businessProfile.kybStatus !== "verified" && (
                      <Alert>
                        <Shield className="h-4 w-4" />
                        <AlertTitle>Business verification required</AlertTitle>
                        <AlertDescription className="mt-1">
                          Complete KYB verification to publish business listings and access wholesale features.
                        </AlertDescription>
                        <Button
                          size="sm"
                          className="mt-3"
                          disabled={startKybMutation.isPending}
                          onClick={() => startKybMutation.mutate(businessProfile.id)}
                        >
                          {startKybMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                          Start verification
                        </Button>
                      </Alert>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="biz-company-name">Company Name <span className="text-destructive">*</span></Label>
                      <Input
                        id="biz-company-name"
                        placeholder="Your company name"
                        value={bizCompanyName}
                        onChange={(e) => setBizCompanyName(e.target.value)}
                        maxLength={200}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="biz-trade-license">Trade License Number</Label>
                        <Input
                          id="biz-trade-license"
                          placeholder="e.g. CN-12345678"
                          value={bizTradeLicense}
                          onChange={(e) => setBizTradeLicense(e.target.value)}
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Category</Label>
                        <Popover open={bizCategoryOpen} onOpenChange={setBizCategoryOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={bizCategoryOpen} className="w-full justify-between font-normal">
                              {bizCategory || "Select category"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search categories…" />
                              <CommandList className="max-h-64">
                                <CommandEmpty>No category found.</CommandEmpty>
                                {BUSINESS_CATEGORY_GROUPS.map(grp => (
                                  <CommandGroup key={grp.group} heading={grp.group}>
                                    {grp.items.map(item => (
                                      <CommandItem key={item} value={item} onSelect={val => { setBizCategory(val); setBizCategoryOpen(false); }}>
                                        <Check className={`mr-2 h-4 w-4 ${bizCategory === item ? "opacity-100" : "opacity-0"}`} />
                                        {item}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                ))}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <Button
                      onClick={() => createBusinessMutation.mutate({
                        companyName: bizCompanyName.trim(),
                        tradeLicenseNumber: bizTradeLicense.trim() || undefined,
                        category: bizCategory || undefined,
                      })}
                      disabled={!bizCompanyName.trim() || createBusinessMutation.isPending}
                      className="w-full"
                    >
                      {createBusinessMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Create Business Profile
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Profile Danger Zone ── */}
            {(creatorProfile || businessProfile) && (
              <Card className="border-destructive/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-destructive text-base flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Remove Profiles
                  </CardTitle>
                  <CardDescription>These actions only remove the profile — your main account stays active.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {creatorProfile && (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Delete creator profile</p>
                        <p className="text-xs text-muted-foreground">Removes your creator page and portfolio. Cannot be undone.</p>
                      </div>
                      <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0" onClick={() => setDeleteCreatorOpen(true)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  )}
                  {creatorProfile && businessProfile && <Separator />}
                  {businessProfile && (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Delete business profile</p>
                        <p className="text-xs text-muted-foreground">Removes your business page, catalog, and team. Existing deals are preserved.</p>
                      </div>
                      <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0" onClick={() => setDeleteBusinessOpen(true)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </div>
        </TabsContent>
      </Tabs>

      {/* ── Delete Account Dialog ── */}
      <AlertDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will erase all your listings, deals, messages, and profile data. This cannot be undone. Enter your password to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              type="password"
              placeholder="Your password"
              value={deleteAccountPassword}
              onChange={e => setDeleteAccountPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccountMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={!deleteAccountPassword || deleteAccountMutation.isPending}
              onClick={(e) => { e.preventDefault(); deleteAccountMutation.mutate(deleteAccountPassword); }}
            >
              {deleteAccountMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete my account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Creator Profile Dialog ── */}
      <AlertDialog open={deleteCreatorOpen} onOpenChange={setDeleteCreatorOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete creator profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Your creator page and all portfolio items will be permanently removed. Your main Bareter account stays intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCreatorMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteCreatorMutation.isPending}
              onClick={(e) => { e.preventDefault(); deleteCreatorMutation.mutate(); }}
            >
              {deleteCreatorMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Yes, delete creator profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Business Profile Dialog ── */}
      <AlertDialog open={deleteBusinessOpen} onOpenChange={setDeleteBusinessOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete business profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Your business page, product catalog, and team members will be permanently removed. Existing barter deals are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusinessMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteBusinessMutation.isPending}
              onClick={(e) => { e.preventDefault(); if (businessProfile) deleteBusinessMutation.mutate(businessProfile.id); }}
            >
              {deleteBusinessMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Yes, delete business profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      </div>{/* end content wrapper */}
    </div>
  );
}
