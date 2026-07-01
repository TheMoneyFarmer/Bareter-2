import { useEffect, useState } from "react";
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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { useI18n, type Language } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, API_BASE } from "@/lib/queryClient";
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
  const { user } = useAuth();
  const { language: activeLanguage, setLanguage, t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mobileView, setMobileView] = useState<"menu" | "section">("menu");
  const [activeTab, setActiveTab] = useState("account");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    (user?.preferredCategories as string[]) || []
  );
  const [passwordChangeStep, setPasswordChangeStep] = useState<PasswordChangeStep>("form");
  const [pendingPasswordData, setPendingPasswordData] = useState<{ currentPassword: string; newPassword: string } | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [socialLinks, setSocialLinks] = useState<{ instagram?: string; linkedin?: string; twitter?: string; tiktok?: string; youtube?: string; snapchat?: string }>(() => {
    const sl = user?.socialLinks as { instagram?: string; linkedin?: string; twitter?: string; tiktok?: string; youtube?: string; snapchat?: string } | null;
    return sl || {};
  });

  // ── Profile Mode state (creator_profiles + business_profiles tables) ──────
  const CREATOR_NICHES = ["Fashion", "Beauty", "Tech", "Food", "Travel", "Lifestyle", "Fitness", "Finance", "Entertainment", "Gaming", "Education"];
  const CREATOR_PLATFORMS = ["Instagram", "TikTok", "YouTube", "LinkedIn", "X (Twitter)", "Snapchat", "Podcast", "Blog"];
  const AUDIENCE_SIZES = [
    { value: "Under 1K",  label: "Under 1,000" },
    { value: "1K–10K",    label: "1,000 – 10,000" },
    { value: "10K–50K",   label: "10,000 – 50,000" },
    { value: "50K–100K",  label: "50,000 – 100,000" },
    { value: "100K–500K", label: "100,000 – 500,000" },
    { value: "500K+",     label: "500,000+" },
  ];
  const BUSINESS_CATEGORIES = ["Retail", "Food & Beverage", "Technology", "Healthcare", "Real Estate", "Finance", "Education", "Beauty & Wellness", "Fashion", "Events", "Media", "Other"];

  const [cpDisplayName, setCpDisplayName] = useState("");
  const [cpBio, setCpBio] = useState("");
  const [cpNiche, setCpNiche] = useState("");
  const [cpPrimaryPlatform, setCpPrimaryPlatform] = useState("");
  const [cpAudienceSize, setCpAudienceSize] = useState("");
  const [bizCompanyName, setBizCompanyName] = useState("");
  const [bizTradeLicense, setBizTradeLicense] = useState("");
  const [bizCategory, setBizCategory] = useState("");

  // Fetch existing profiles (404 → null, not an error)
  const { data: creatorProfile, refetch: refetchCreatorProfile } = useQuery<Record<string, any> | null>({
    queryKey: ["/api/creators/me"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/creators/me`, { credentials: "include" });
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
      const res = await fetch(`${API_BASE}/api/businesses/me`, { credentials: "include" });
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
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to create creator profile", variant: "destructive" }),
  });

  const createBusinessMutation = useMutation({
    mutationFn: async (data: { companyName: string; tradeLicenseNumber?: string; category?: string }) => {
      const res = await apiRequest("POST", "/api/businesses", data);
      return res.json();
    },
    onSuccess: () => {
      refetchBusinessProfile();
      toast({ title: "Business profile created!", description: "Complete KYB verification to publish business listings." });
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
      const res = await apiRequest("POST", `/api/businesses/${businessId}/kyb/start`);
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
          <div className="px-4 pt-6 pb-4 flex items-center gap-3 border-b border-border">
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
                  <Button variant="destructive" size="sm" data-testid="button-delete-account">
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
                        <Select value={cpNiche} onValueChange={setCpNiche}>
                          <SelectTrigger id="cp-niche"><SelectValue placeholder="Select niche" /></SelectTrigger>
                          <SelectContent>
                            {CREATOR_NICHES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cp-platform">Primary Platform</Label>
                        <Select value={cpPrimaryPlatform} onValueChange={setCpPrimaryPlatform}>
                          <SelectTrigger id="cp-platform"><SelectValue placeholder="Select platform" /></SelectTrigger>
                          <SelectContent>
                            {CREATOR_PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cp-audience">Audience Size</Label>
                      <Select value={cpAudienceSize} onValueChange={setCpAudienceSize}>
                        <SelectTrigger id="cp-audience"><SelectValue placeholder="Select range" /></SelectTrigger>
                        <SelectContent>
                          {AUDIENCE_SIZES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
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
                  <div className="space-y-4">
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
                        <Label htmlFor="biz-category">Category</Label>
                        <Select value={bizCategory} onValueChange={setBizCategory}>
                          <SelectTrigger id="biz-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                          <SelectContent>
                            {BUSINESS_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
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

          </div>
        </TabsContent>
      </Tabs>
      </div>{/* end content wrapper */}
    </div>
  );
}
