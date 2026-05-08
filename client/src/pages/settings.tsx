import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { useI18n, type Language } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
} from "lucide-react";
import { z } from "zod";

function VerificationRefreshButton({ onRefresh }: { onRefresh: () => void }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/verification/refresh");
      return res.json() as Promise<{ synced: boolean; message: string; status?: string; isVerified?: boolean }>;
    },
    onSuccess: (data) => {
      if (data.synced) {
        toast({ title: "Status Updated", description: data.message });
        onRefresh();
      } else {
        toast({ title: "No Change", description: data.message, variant: "default" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Could not check verification status. Please try again.", variant: "destructive" });
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
      {mutation.isPending ? "Checking..." : "Refresh Status"}
    </Button>
  );
}

const accountSettingsSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  businessName: z.string().optional(),
  location: z.string().optional(),
  country: z.string().length(2).optional(),
  city: z.string().optional(),
  timezone: z.string(),
  currency: z.string(),
  language: z.string(),
});

const notificationSettingsSchema = z.object({
  emailNotifications: z.boolean(),
  dealNotifications: z.boolean(),
  messageNotifications: z.boolean(),
  marketingEmails: z.boolean(),
});

const privacySettingsSchema = z.object({
  profileVisibility: z.string(),
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  allowDirectMessages: z.boolean(),
});

const tradingSettingsSchema = z.object({
  preferredCategories: z.array(z.string()),
  tradingRadius: z.number().min(0),
  minTradeValue: z.string().optional(),
  maxTradeValue: z.string().optional(),
  autoMatchEnabled: z.boolean(),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type AccountSettingsForm = z.infer<typeof accountSettingsSchema>;
type NotificationSettingsForm = z.infer<typeof notificationSettingsSchema>;
type PrivacySettingsForm = z.infer<typeof privacySettingsSchema>;
type TradingSettingsForm = z.infer<typeof tradingSettingsSchema>;
type PasswordChangeForm = z.infer<typeof passwordChangeSchema>;

const TIMEZONES = [
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Asia/Riyadh", label: "Riyadh (GMT+3)" },
  { value: "Asia/Qatar", label: "Doha (GMT+3)" },
  { value: "Asia/Kuwait", label: "Kuwait (GMT+3)" },
  { value: "Asia/Bahrain", label: "Manama (GMT+3)" },
  { value: "Asia/Muscat", label: "Muscat (GMT+4)" },
  { value: "Europe/London", label: "London (GMT+0)" },
  { value: "America/New_York", label: "New York (GMT-5)" },
];

const CURRENCIES = [
  { value: "AED", label: "AED - UAE Dirham" },
  { value: "SAR", label: "SAR - Saudi Riyal" },
  { value: "QAR", label: "QAR - Qatari Riyal" },
  { value: "KWD", label: "KWD - Kuwaiti Dinar" },
  { value: "BHD", label: "BHD - Bahraini Dinar" },
  { value: "OMR", label: "OMR - Omani Rial" },
  { value: "USD", label: "USD - US Dollar" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية (Arabic)" },
];

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public - Anyone can view your profile" },
  { value: "verified_only", label: "Verified Only - Only verified users can view" },
  { value: "private", label: "Private - Only you can see your profile" },
];

const RADIUS_OPTIONS = [
  { value: 0, label: "Unlimited (Any location)" },
  { value: 25, label: "25 km" },
  { value: 50, label: "50 km" },
  { value: 100, label: "100 km" },
  { value: 250, label: "250 km" },
  { value: 500, label: "500 km" },
];

export function SettingsPage() {
  const { user } = useAuth();
  const { language: activeLanguage, setLanguage } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    (user?.preferredCategories as string[]) || []
  );

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

  // The Account form's defaultValues are only read once on mount, but the
  // /api/auth/me query is asynchronous: on first render `user` is often
  // null, so the form mounts with empty fullName/email. Reset the form
  // once the user data arrives (and whenever the persisted user record
  // changes elsewhere) so the inputs stay in sync with the saved profile.
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

  // Mirror the live i18n language (which updates immediately on header
  // toggle, before /api/auth/me has refetched) into the form so the
  // language Select always reflects the currently-active language.
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
      // If the user changed their language preference here, mirror it into
      // the live i18n context so the UI updates immediately without waiting
      // for /api/auth/me to refetch (LanguageSync will also no-op once it
      // sees the new server value).
      const nextLang = (variables as { language?: string } | undefined)?.language;
      if (nextLang === "en" || nextLang === "ar") {
        setLanguage(nextLang as Language);
      }
      toast({
        title: "Settings saved",
        description: "Your settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordChangeForm) => {
      const res = await apiRequest("POST", "/api/users/change-password", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
      passwordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password.",
        variant: "destructive",
      });
    },
  });

  const onAccountSubmit = (data: AccountSettingsForm) => {
    updateSettingsMutation.mutate(data);
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
    changePasswordMutation.mutate(data);
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
        <p className="text-muted-foreground">Please sign in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Account Settings</h1>
          <p className="text-muted-foreground">Manage your account preferences and settings</p>
        </div>
      </div>

      <Tabs defaultValue="account" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="account" data-testid="tab-account">
            <User className="h-4 w-4 mr-2" />
            Account
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="privacy" data-testid="tab-privacy">
            <Eye className="h-4 w-4 mr-2" />
            Privacy
          </TabsTrigger>
          <TabsTrigger value="trading" data-testid="tab-bartering">
            <RefreshCw className="h-4 w-4 mr-2" />
            Bartering
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Lock className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Update your personal and business details</CardDescription>
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
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your full name" {...field} data-testid="input-fullname" />
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
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="your@email.com" {...field} data-testid="input-email" />
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
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="+971 XX XXX XXXX" {...field} data-testid="input-phone" />
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
                          <FormLabel>Website</FormLabel>
                          <FormControl>
                            <Input placeholder="https://yourwebsite.com" {...field} data-testid="input-website" />
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
                          <FormLabel>Business Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your company name" {...field} data-testid="input-business-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={accountForm.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country</FormLabel>
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
                                <SelectValue placeholder="Select country" />
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
                            <FormLabel>City</FormLabel>
                            <Select
                              onValueChange={(v) => { field.onChange(v); accountForm.setValue("location", v); }}
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-city">
                                  <SelectValue placeholder="Select city" />
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
                    <h4 className="font-medium">Display Preferences</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={accountForm.control}
                        name="language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Language</FormLabel>
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
                            <FormLabel>Timezone</FormLabel>
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
                            <FormLabel>Currency</FormLabel>
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
                    Save Changes
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {user?.accountType === "business" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Business License Verification
                </CardTitle>
                <CardDescription>
                  Business accounts must upload a valid UAE business license before creating listings or accepting deals. 
                  Data is handled per PDPL guidelines.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">KYB Status</p>
                    <Badge
                      variant={
                        user?.kybStatus === "APPROVED" ? "default" :
                        user?.kybStatus === "PENDING_REVIEW" ? "secondary" : "outline"
                      }
                      className="mt-1"
                    >
                      {user?.kybStatus === "APPROVED" ? "Verified" :
                       user?.kybStatus === "PENDING_REVIEW" ? "Pending Review" :
                       "Not Uploaded"}
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
                        View Document
                      </Button>
                    </a>
                  )}
                </div>

                {user?.kybStatus !== "APPROVED" && (
                  <div>
                    <Label htmlFor="license-upload">Upload Business License (PDF or Image)</Label>
                    <p className="text-xs text-muted-foreground mb-2 mt-1">
                      Upload a valid DED-issued business license. Our team will review and verify it.
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
                          const res = await fetch("/api/upload", {
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
                      Choose File to Upload
                    </Button>
                  </div>
                )}

                {user?.kybStatus === "APPROVED" && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    Your business license has been verified. You can create listings and accept deals.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how and when you want to be notified</CardDescription>
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
                          <FormLabel className="text-base">Email Notifications</FormLabel>
                          <FormDescription>
                            Receive email notifications for important updates
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
                          <FormLabel className="text-base">Deal Updates</FormLabel>
                          <FormDescription>
                            Get notified when deals are proposed, accepted, or completed
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
                          <FormLabel className="text-base">Message Alerts</FormLabel>
                          <FormDescription>
                            Receive notifications for new messages in your deals
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
                          <FormLabel className="text-base">Marketing & Promotions</FormLabel>
                          <FormDescription>
                            Receive updates about new features, tips, and special offers
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
                    Save Preferences
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Settings</CardTitle>
              <CardDescription>Control who can see your information</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...privacyForm}>
                <form onSubmit={privacyForm.handleSubmit(onPrivacySubmit)} className="space-y-6">
                  <FormField
                    control={privacyForm.control}
                    name="profileVisibility"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Profile Visibility</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-profile-visibility">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {VISIBILITY_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
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
                          <FormLabel className="text-base">Show Email Address</FormLabel>
                          <FormDescription>
                            Allow other users to see your email on your profile
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
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Show Phone Number</FormLabel>
                          <FormDescription>
                            Allow other users to see your phone number
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-show-phone"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={privacyForm.control}
                    name="allowDirectMessages"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Allow Direct Messages</FormLabel>
                          <FormDescription>
                            Let other users contact you directly about potential barters
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
                    Save Privacy Settings
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trading">
          <Card>
            <CardHeader>
              <CardTitle>Bartering Preferences</CardTitle>
              <CardDescription>Customize your bartering experience and preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...tradingForm}>
                <form onSubmit={tradingForm.handleSubmit(onTradingSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <Label>Preferred Categories</Label>
                    <p className="text-sm text-muted-foreground">
                      Select categories you're most interested in bartering
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
                        <FormLabel>Bartering Radius</FormLabel>
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
                          Only see barters within this distance from your location
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
                          <FormLabel>Minimum Barter Value (AED)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="0" 
                              {...field} 
                              data-testid="input-min-trade-value"
                            />
                          </FormControl>
                          <FormDescription>
                            Minimum value for barters you're interested in
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
                          <FormLabel>Maximum Barter Value (AED)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="Unlimited" 
                              {...field} 
                              data-testid="input-max-trade-value"
                            />
                          </FormControl>
                          <FormDescription>
                            Maximum value for barters you're interested in
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
                          <FormLabel className="text-base">AI Auto-Match</FormLabel>
                          <FormDescription>
                            Get AI-powered suggestions for potential barters based on your offers and needs
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
                    Save Bartering Preferences
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
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                    <FormField
                      control={passwordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
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
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <Input 
                              type="password" 
                              placeholder="••••••••" 
                              {...field} 
                              data-testid="input-new-password"
                            />
                          </FormControl>
                          <FormDescription>
                            Must be at least 8 characters
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
                          <FormLabel>Confirm New Password</FormLabel>
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
                      disabled={changePasswordMutation.isPending}
                      data-testid="button-change-password"
                    >
                      {changePasswordMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Change Password
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Account Security</CardTitle>
                <CardDescription>Manage your account security settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${user.emailVerified ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400" : "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400"}`}>
                      {user.emailVerified ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-medium">Email Verification</p>
                      <p className="text-sm text-muted-foreground">
                        {user.emailVerified ? "Your email is verified" : "Your email is not verified"}
                      </p>
                    </div>
                  </div>
                  {!user.emailVerified && (
                    <Button variant="outline" size="sm" data-testid="button-verify-email">
                      Verify Email
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      user.isVerified
                        ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
                        : (user.kycStatus === "IN_REVIEW" || user.kybStatus === "IN_REVIEW" || user.kycStatus === "IN_PROGRESS" || user.kybStatus === "IN_PROGRESS" || user.kycStatus === "PENDING_REVIEW" || user.kybStatus === "PENDING_REVIEW")
                          ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400"
                          : (user.kycStatus === "DECLINED" || user.kybStatus === "DECLINED")
                            ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">Identity Verification</p>
                      <p className="text-sm text-muted-foreground">
                        {user.isVerified
                          ? "Your identity is verified — you can create listings and barter"
                          : (user.kycStatus === "IN_REVIEW" || user.kybStatus === "IN_REVIEW")
                            ? "Documents received — under review (usually a few minutes)"
                            : (user.kycStatus === "IN_PROGRESS" || user.kybStatus === "IN_PROGRESS" || user.kycStatus === "PENDING_REVIEW" || user.kybStatus === "PENDING_REVIEW")
                              ? "Verification in progress — please complete the steps"
                              : (user.kycStatus === "DECLINED" || user.kybStatus === "DECLINED")
                                ? "Verification was not approved — please try again"
                                : "Complete KYC/KYB verification to barter"}
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
                        <a href="/profile">Verify Now</a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>Irreversible and destructive actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Export Your Data</p>
                    <p className="text-sm text-muted-foreground">
                      Download a copy of all your data
                    </p>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-export-data">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-destructive">Delete Account</p>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete your account and all data
                    </p>
                  </div>
                  <Button variant="destructive" size="sm" data-testid="button-delete-account">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Account
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
