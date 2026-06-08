import { useState, useRef, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LOCATIONS, type Listing, type Rating, type OfferNeedItem, type SocialProfile, type ListingDraft, type DealWithUsers } from "@shared/schema";
import { Link } from "wouter";
import { FileText, Trash2 } from "lucide-react";
import {
  User,
  MapPin,
  Building2,
  Shield,
  ShieldCheck,
  Star,
  Plus,
  X,
  Loader2,
  Camera,
  Package,
  ShoppingCart,
  ImageIcon,
  CheckCircle,
  Clock,
  AlertCircle,
  Globe,
  Users,
  Award,
  ThumbsUp,
  Handshake,
  ExternalLink,
  Settings,
  ChevronRight,
  ArrowLeft,
  Mail,
  MessageCircle,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { VerifiedBadge, TrustBadges, isUserVerified } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import { SiInstagram, SiTiktok, SiYoutube, SiLinkedin, SiX } from "react-icons/si";
import { z } from "zod";

type ProfileForm = {
  fullName: string;
  bio?: string;
  location?: string;
  businessName?: string;
};

type User = {
  id: string;
  fullName: string;
  email: string;
  accountType?: string | null;
  kycStatus?: string | null;
  kybStatus?: string | null;
  isVerified?: boolean | null;
  [key: string]: any;
};

function VerificationSection({ user }: { user: User }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const emailVerified = !!(user as any).emailVerified;
  const phoneVerified = !!(user as any).phoneVerified;
  const existingPhone: string = (user as any).phone || "";

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState(existingPhone);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      toast({ title: "Enter your WhatsApp number", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/phone/send-otp", { phone: phone.trim() });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Failed to send code", variant: "destructive" });
        return;
      }
      if (data.dev) setDevCode(data.dev);
      setStep("otp");
      toast({ title: "Code sent", description: "Check your WhatsApp for the 6-digit code." });
    } catch {
      toast({ title: "Failed to send code", description: "Please check your number and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (code.trim().length !== 6) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/phone/verify-otp", { code: code.trim() });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Invalid code", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "WhatsApp verified!", description: "You can now post listings and propose barters." });
    } catch {
      toast({ title: "Verification failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    setResending(true);
    try {
      const res = await apiRequest("POST", "/api/auth/resend-verification", {});
      if (res.ok) toast({ title: "Verification email resent", description: "Check your inbox." });
      else toast({ title: "Failed to resend", variant: "destructive" });
    } catch {
      toast({ title: "Failed to resend", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  const reset = () => { setStep("phone"); setCode(""); setDevCode(null); };

  // Both verified — all done
  if (emailVerified && phoneVerified) {
    return (
      <Card>
        <CardContent className="pt-8 pb-8">
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="font-semibold text-lg">Fully Verified</h3>
            <p className="text-muted-foreground mt-1 text-sm">Your email and WhatsApp are confirmed. You're all set to barter.</p>
            <div className="flex justify-center gap-3 mt-5">
              <Badge variant="outline" className="text-blue-600 border-blue-200 gap-1.5 px-3 py-1">
                <Mail className="h-3.5 w-3.5" /> Email verified
              </Badge>
              <Badge variant="outline" className="text-green-600 border-green-200 gap-1.5 px-3 py-1">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp verified
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Email not yet verified
  if (!emailVerified) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Confirm your email
          </CardTitle>
          <CardDescription>Check your inbox for a verification link from Bareter.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
            <Mail className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700 dark:text-amber-300">Email not yet confirmed</AlertTitle>
            <AlertDescription className="text-amber-600 dark:text-amber-400">
              A verification link was sent to <strong>{user.email}</strong>. Click it to activate your account.
            </AlertDescription>
          </Alert>
          <Button variant="outline" className="w-full gap-2" onClick={handleResendEmail} disabled={resending}>
            {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Resend verification email
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Email verified, phone not verified — show inline phone verification
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-green-600" />
          Verify your WhatsApp
        </CardTitle>
        <CardDescription>
          {step === "phone"
            ? "Add your WhatsApp number to post listings and propose barters."
            : `Enter the 6-digit code sent to ${phone}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground pb-1">
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
          Email verified
          <span className="mx-2 text-border">·</span>
          <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          WhatsApp pending
        </div>
        <Separator />
        {step === "phone" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="verify-phone">WhatsApp number</Label>
              <Input
                id="verify-phone"
                type="tel"
                placeholder="+971 50 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
              />
              <p className="text-xs text-muted-foreground">Include country code, e.g. +971 for UAE</p>
            </div>
            <Button className="w-full gap-2" size="lg" onClick={handleSendOtp} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Send code via WhatsApp
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="verify-otp">Verification code</Label>
              <Input
                id="verify-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                className="text-center text-xl tracking-[0.3em] font-mono"
                autoFocus
              />
              {devCode && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border border-amber-200 dark:border-amber-800">
                  Dev — code: <strong>{devCode}</strong>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={reset} disabled={loading}>
                <RefreshCw className="h-3.5 w-3.5" />
                Change number
              </Button>
              <Button
                className="flex-1 gap-2"
                size="lg"
                onClick={handleVerifyOtp}
                disabled={loading || code.length !== 6}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newOfferName, setNewOfferName] = useState("");
  const [newOfferValue, setNewOfferValue] = useState("");
  const [newNeedName, setNewNeedName] = useState("");
  const [newNeedValue, setNewNeedValue] = useState("");

  const PROFILE_TABS = [
    { id: "profile",       label: "Profile",       desc: "Personal & business details", icon: User },
    { id: "offers",        label: "My Offers",      desc: "What you're offering to barter", icon: Package },
    { id: "needs",         label: "My Needs",       desc: "What you're looking for", icon: ShoppingCart },
    { id: "deals",         label: "Deals",          desc: "Active and completed barters", icon: Handshake },
    { id: "endorsements",  label: "Endorsements",   desc: "Reviews from your partners", icon: ThumbsUp },
    { id: "portfolio",     label: "Portfolio",      desc: "Showcase your work", icon: ImageIcon },
    { id: "drafts",        label: "Drafts",         desc: "Saved listing drafts", icon: FileText },
    { id: "verification",  label: "Verification",   desc: "Identity verification status", icon: Shield },
  ] as const;

  type ProfileTabId = typeof PROFILE_TABS[number]["id"];

  const getInitialTab = (): ProfileTabId => {
    if (typeof window === "undefined") return "profile";
    const p = new URLSearchParams(window.location.search).get("tab") as ProfileTabId;
    return PROFILE_TABS.some(t => t.id === p) ? p : "profile";
  };

  const [activeTab, setActiveTab] = useState<ProfileTabId>(getInitialTab);
  const [mobileView, setMobileView] = useState<"menu" | "section">(
    () => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab")) ? "section" : "menu"
  );

  const goToSection = (tab: ProfileTabId) => {
    setActiveTab(tab);
    setMobileView("section");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  };

  const goBackToMenu = () => {
    setMobileView("menu");
  };

  const activeSectionLabel = PROFILE_TABS.find(t => t.id === activeTab)?.label ?? "Profile";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const verificationInputRef = useRef<HTMLInputElement>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);

  const { data: listings } = useQuery<Listing[]>({
    queryKey: ["/api/listings/user", user?.id],
    enabled: !!user,
  });

  const { data: ratings } = useQuery<Rating[]>({
    queryKey: ["/api/ratings/user", user?.id],
    enabled: !!user,
  });

  const { data: credibility } = useQuery<{
    credibilityScore: number;
    completedDeals: number;
    totalEndorsements: number;
    avgRating: number;
    isVerified: boolean;
  }>({
    queryKey: ["/api/users", user?.id, "credibility"],
    enabled: !!user,
  });

  const { data: endorsements } = useQuery<Array<{
    id: string;
    skill: string;
    fromUserId: string;
    fromUser?: { fullName: string; avatarUrl?: string };
  }>>({
    queryKey: ["/api/endorsements", user?.id],
    enabled: !!user,
  });

  const { data: portfolioItems } = useQuery<Array<{
    id: string;
    title: string;
    description?: string;
    mediaUrl: string;
    mediaType: string;
    category?: string;
  }>>({
    queryKey: ["/api/portfolio", user?.id],
    enabled: !!user,
  });

  const profileSchema = useMemo(() => z.object({
    fullName: z.string().min(2, t("validation.nameTooShort")),
    bio: z.string().optional(),
    location: z.string().optional(),
    businessName: z.string().optional(),
  }), [t]);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user?.fullName || "",
      bio: user?.bio || "",
      location: user?.location || "",
      businessName: user?.businessName || "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const res = await apiRequest("PATCH", "/api/users/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: t("profile.profileUpdated"),
        description: t("profile.profileSaved"),
      });
    },
    onError: () => {
      toast({
        title: t("profile.updateFailed"),
        description: t("profile.updateFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const updateListsMutation = useMutation({
    mutationFn: async (data: { whatIOffer?: OfferNeedItem[]; whatINeed?: OfferNeedItem[] }) => {
      const res = await apiRequest("PATCH", "/api/users/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: t("profile.fileUploaded"),
        description: t("profile.fileUploadedDesc"),
      });
    },
    onError: () => {
      toast({
        title: t("profile.uploadFailed"),
        description: t("common.somethingWentWrong"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileForm) => {
    updateProfileMutation.mutate(data);
  };

  const addOffer = () => {
    if (newOfferName.trim() && user) {
      const value = parseFloat(newOfferValue) || 0;
      const offers: OfferNeedItem[] = [...(user.whatIOffer || []), { name: newOfferName.trim(), value }];
      updateListsMutation.mutate({ whatIOffer: offers });
      setNewOfferName("");
      setNewOfferValue("");
    }
  };

  const removeOffer = (index: number) => {
    if (user) {
      const offers = (user.whatIOffer || []).filter((_, i) => i !== index);
      updateListsMutation.mutate({ whatIOffer: offers });
    }
  };

  const addNeed = () => {
    if (newNeedName.trim() && user) {
      const value = parseFloat(newNeedValue) || 0;
      const needs: OfferNeedItem[] = [...(user.whatINeed || []), { name: newNeedName.trim(), value }];
      updateListsMutation.mutate({ whatINeed: needs });
      setNewNeedName("");
      setNewNeedValue("");
    }
  };

  const removeNeed = (index: number) => {
    if (user) {
      const needs = (user.whatINeed || []).filter((_, i) => i !== index);
      updateListsMutation.mutate({ whatINeed: needs });
    }
  };

  const handleFileUpload = (type: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFileMutation.mutate({ file, type });
    }
  };

  const handlePortfolioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFileMutation.mutate({ file, type: "portfolio" });
    }
  };

  const averageRating = ratings && ratings.length > 0
    ? (ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length).toFixed(1)
    : null;

  const totalOfferValue = (user?.whatIOffer || []).reduce((sum, item) => sum + (item.value || 0), 0);
  const totalNeedValue = (user?.whatINeed || []).reduce((sum, item) => sum + (item.value || 0), 0);

  const verificationStatusConfig: Record<string, { icon: typeof CheckCircle; color: string; text: string }> = {
    pending: { icon: Clock, color: "text-yellow-500", text: t("profile.verification.notSubmitted") },
    submitted: { icon: Clock, color: "text-blue-500", text: t("profile.verification.underReview") },
    verified: { icon: CheckCircle, color: "text-green-500", text: t("profile.verification.verified") },
    rejected: { icon: AlertCircle, color: "text-red-500", text: t("profile.verification.rejected") },
  };

  const verificationStatus = verificationStatusConfig[user?.verificationStatus || "pending"] || verificationStatusConfig.pending;

  if (!user) {
    return (
      <div className="container px-4 py-12 mx-auto max-w-4xl text-center">
        <p className="text-muted-foreground">{t("profile.signIn")}</p>
      </div>
    );
  }

  const isProfileIncomplete = !user.bio || !user.location || !user.businessName;

  return (
    <div className="px-3 py-4 md:container md:px-4 md:py-8 mx-auto max-w-4xl">
      {/* Mobile: header bar — shows back button when inside a section */}
      <div className="md:hidden flex items-center justify-between mb-4">
        {mobileView === "section" ? (
          <>
            <button
              type="button"
              onClick={goBackToMenu}
              className="flex items-center gap-1.5 text-sm font-semibold text-bareter-teal"
            >
              <ArrowLeft className="h-4 w-4" />
              {activeSectionLabel}
            </button>
            <Link href="/settings">
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Settings">
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold">My Profile</h1>
            <Link href="/settings">
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Settings">
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
          </>
        )}
      </div>

      {isProfileIncomplete && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("profile.completeProfile")}</AlertTitle>
          <AlertDescription>
            {t("profile.completeProfileDesc")}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col md:flex-row gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="flex flex-col items-center">
          <div className="relative">
            <Avatar className="h-24 w-24 md:h-32 md:w-32">
              <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} className="object-cover" />
              <AvatarFallback className="text-3xl md:text-4xl bg-primary text-primary-foreground">
                {user.fullName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleFileUpload("avatar")}
            />
            <Button
              size="icon"
              variant="secondary"
              className="absolute bottom-0 right-0 h-10 w-10 rounded-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadFileMutation.isPending}
              data-testid="button-change-avatar"
            >
              {uploadFileMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            {(isUserVerified(user.kycStatus, user.kybStatus) || user.isVerified) ? (
              <Badge className="gap-1">
                <Shield className="h-3 w-3" />
                {t("profile.status.verified")}
              </Badge>
            ) : (
              <Badge variant="outline" className={verificationStatus.color}>
                <verificationStatus.icon className="h-3 w-3 mr-1" />
                {verificationStatus.text}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex-1 text-center md:text-left min-w-0">
          <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold">{user.fullName}</h1>
            <FounderBadge show={!!user.founderBadge} size="md" />
            <TrustBadges emailVerified={(user as any).emailVerified} phoneVerified={(user as any).phoneVerified} />
          </div>
          {user.businessName && (
            <p className="text-muted-foreground flex items-center justify-center md:justify-start gap-1 mt-1">
              <Building2 className="h-4 w-4" />
              {user.businessName}
            </p>
          )}
          {user.location && (
            <p className="text-muted-foreground flex items-center justify-center md:justify-start gap-1 mt-1">
              <MapPin className="h-4 w-4" />
              {user.location}
            </p>
          )}
          {user.signupType && (
            <Badge variant="outline" className="mt-2">
              {user.signupType === "creator" ? t("profile.signupCreator") : user.signupType === "business" ? t("profile.signupBusiness") : t("profile.signupPersonal")}
            </Badge>
          )}
          {user.socialProfiles && (user.socialProfiles as SocialProfile[]).length > 0 && (
            <div className="flex items-center justify-center md:justify-start gap-3 mt-3 flex-wrap">
              {(user.socialProfiles as SocialProfile[]).map((sp: SocialProfile) => {
                const platformIcons: Record<string, typeof SiInstagram> = {
                  instagram: SiInstagram,
                  tiktok: SiTiktok,
                  youtube: SiYoutube,
                  linkedin: SiLinkedin,
                  x: SiX,
                };
                const Icon = platformIcons[sp.platform] || Globe;
                return (
                  <div key={sp.platform} className="flex items-center gap-1 text-sm text-muted-foreground" data-testid={`social-${sp.platform}`}>
                    <Icon className="h-4 w-4" />
                    <span>@{sp.username}</span>
                    {sp.followerCount && (
                      <Badge variant="secondary" className="text-xs ml-1">
                        <Users className="h-3 w-3 mr-1" />
                        {sp.followerCount >= 1000 ? `${(sp.followerCount / 1000).toFixed(1)}K` : sp.followerCount}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {credibility && credibility.credibilityScore > 0 && (
            <div className="flex items-center justify-center md:justify-start gap-2 mt-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <Award className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary" data-testid="text-credibility-score">
                  {credibility.credibilityScore}/100
                </span>
                <span className="text-xs text-muted-foreground">{t("profile.credibility")}</span>
              </div>
              {credibility.completedDeals > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {credibility.completedDeals} {t("profile.deals")}
                </Badge>
              )}
            </div>
          )}
          <div className="grid grid-cols-3 md:flex md:items-center md:justify-start md:gap-4 gap-2 mt-3 w-full max-w-xs md:max-w-none">
            <div className="text-center p-2 rounded-lg bg-muted/50 md:bg-transparent md:p-0">
              <div className="text-lg md:text-xl font-bold">{listings?.length || 0}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">{t("profile.listings")}</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50 md:bg-transparent md:p-0">
              <div className="text-lg md:text-xl font-bold flex items-center justify-center gap-0.5">
                {averageRating || "-"}
                <Star className="h-3.5 w-3.5 md:h-4 md:w-4 text-yellow-500 fill-yellow-500" />
              </div>
              <div className="text-[10px] md:text-xs text-muted-foreground">{t("profile.rating")} ({ratings?.length || 0})</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50 md:bg-transparent md:p-0">
              <div className="text-sm md:text-xl font-bold text-primary leading-tight">
                {t("common.aed")} {totalOfferValue.toLocaleString()}
              </div>
              <div className="text-[10px] md:text-xs text-muted-foreground">{t("profile.offersValue")}</div>
            </div>
            {endorsements && endorsements.length > 0 && (
              <div className="text-center p-2 rounded-lg bg-muted/50 md:bg-transparent md:p-0 md:ml-4">
                <div className="text-lg md:text-xl font-bold flex items-center justify-center gap-1">
                  {endorsements.length}
                  <ThumbsUp className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                </div>
                <div className="text-[10px] md:text-xs text-muted-foreground">{t("profile.tabEndorsements")}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile section list — shown when no section is active */}
      {mobileView === "menu" && (
        <div className="md:hidden rounded-xl border border-border overflow-hidden divide-y divide-border bg-card">
          {PROFILE_TABS.map(({ id, label, desc, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => goToSection(id)}
              className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-muted/40 active:bg-muted/60 transition-colors text-start"
            >
              <div className="h-9 w-9 rounded-full bg-bareter-teal/10 flex items-center justify-center flex-shrink-0">
                <Icon className="h-4.5 w-4.5 text-bareter-teal" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => goToSection(v as ProfileTabId)} className="space-y-6">
        {/* Desktop tab bar — hidden on mobile */}
        <div className="hidden md:block">
          <TabsList className="flex w-full overflow-x-auto gap-0.5 h-auto p-1">
            <TabsTrigger value="profile" className="flex-shrink-0 flex-row gap-1.5 px-3 py-1.5 text-xs" data-testid="tab-profile">
              <User className="h-4 w-4 flex-shrink-0" />
              <span className="whitespace-nowrap">{t("profile.tabProfile")}</span>
            </TabsTrigger>
            <TabsTrigger value="offers" className="flex-shrink-0 flex-row gap-1.5 px-3 py-1.5 text-xs" data-testid="tab-offers">
              <Package className="h-4 w-4 flex-shrink-0" />
              <span className="whitespace-nowrap">{t("profile.tabOffers")}</span>
            </TabsTrigger>
            <TabsTrigger value="needs" className="flex-shrink-0 flex-row gap-1.5 px-3 py-1.5 text-xs" data-testid="tab-needs">
              <ShoppingCart className="h-4 w-4 flex-shrink-0" />
              <span className="whitespace-nowrap">{t("profile.tabNeeds")}</span>
            </TabsTrigger>
            <TabsTrigger value="deals" className="flex-shrink-0 flex-row gap-1.5 px-3 py-1.5 text-xs" data-testid="tab-deals">
              <Handshake className="h-4 w-4 flex-shrink-0" />
              <span className="whitespace-nowrap">Deals</span>
            </TabsTrigger>
            <TabsTrigger value="endorsements" className="flex-shrink-0 flex-row gap-1.5 px-3 py-1.5 text-xs" data-testid="tab-endorsements">
              <ThumbsUp className="h-4 w-4 flex-shrink-0" />
              <span className="whitespace-nowrap">{t("profile.tabEndorsements")}</span>
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="flex-shrink-0 flex-row gap-1.5 px-3 py-1.5 text-xs" data-testid="tab-portfolio">
              <ImageIcon className="h-4 w-4 flex-shrink-0" />
              <span className="whitespace-nowrap">{t("profile.tabPortfolio")}</span>
            </TabsTrigger>
            <TabsTrigger value="drafts" className="flex-shrink-0 flex-row gap-1.5 px-3 py-1.5 text-xs" data-testid="tab-drafts">
              <FileText className="h-4 w-4 flex-shrink-0" />
              <span className="whitespace-nowrap">{t("profile.tabDrafts")}</span>
            </TabsTrigger>
            <TabsTrigger value="verification" className="flex-shrink-0 flex-row gap-1.5 px-3 py-1.5 text-xs" data-testid="tab-verification">
              <Shield className="h-4 w-4 flex-shrink-0" />
              <span className="whitespace-nowrap">{t("profile.tabVerify")}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab content — hidden on mobile until user taps into a section */}
        <div className={mobileView === "menu" ? "hidden md:block" : ""}>

        {/* Task #248 — Drafts tab: surface autosaved listings so users
            can pick up where they left off without going back to the
            create-listing page from a deep link. */}
        <TabsContent value="drafts">
          <DraftsPanel />
        </TabsContent>

        <TabsContent value="deals">
          <DealsPanel />
        </TabsContent>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>{t("profile.profileInformation")}</CardTitle>
              <CardDescription>{t("profile.updateDetails")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("auth.fullName")}</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-profile-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("auth.businessName")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("profile.businessNamePlaceholder")}
                            {...field}
                            data-testid="input-business-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("profile.location")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-location">
                              <SelectValue placeholder={t("profile.selectLocation")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {LOCATIONS.map((location) => (
                              <SelectItem key={location} value={location}>
                                {location}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("profile.bio")}</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t("profile.bioPlaceholder")}
                            className="min-h-[100px] resize-none"
                            {...field}
                            data-testid="textarea-bio"
                          />
                        </FormControl>
                        <FormDescription>
                          {t("profile.bioDescription")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateProfileMutation.isPending}
                      data-testid="button-save-profile"
                    >
                      {updateProfileMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("profile.saving")}
                        </>
                      ) : (
                        t("profile.saveChanges")
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                {t("profile.whatIOffer")}
              </CardTitle>
              <CardDescription>
                {t("profile.whatIOfferDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <Input
                  value={newOfferName}
                  onChange={(e) => setNewOfferName(e.target.value)}
                  placeholder={t("profile.offerInputPlaceholder")}
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOffer())}
                  data-testid="input-new-offer-name"
                />
                <div className="flex gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{t("common.aed")}</span>
                    <Input
                      type="number"
                      value={newOfferValue}
                      onChange={(e) => setNewOfferValue(e.target.value)}
                      placeholder="0"
                      className="w-32 pl-12"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOffer())}
                      data-testid="input-new-offer-value"
                    />
                  </div>
                  <Button onClick={addOffer} data-testid="button-add-offer">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {(user.whatIOffer || []).map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                  >
                    <div>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-primary font-bold">
                        {t("common.aed")} {(item.value || 0).toLocaleString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeOffer(index)}
                        data-testid={`button-remove-offer-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(user.whatIOffer || []).length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    {t("profile.noOffers")}
                  </p>
                )}
              </div>
              {(user.whatIOffer || []).length > 0 && (
                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t("profile.totalOfferValue")}</span>
                  <span className="text-xl font-bold text-primary">
                    {t("common.aed")} {totalOfferValue.toLocaleString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="needs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                {t("profile.whatINeed")}
              </CardTitle>
              <CardDescription>
                {t("profile.whatINeedDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <Input
                  value={newNeedName}
                  onChange={(e) => setNewNeedName(e.target.value)}
                  placeholder={t("profile.needInputPlaceholder")}
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNeed())}
                  data-testid="input-new-need-name"
                />
                <div className="flex gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{t("common.aed")}</span>
                    <Input
                      type="number"
                      value={newNeedValue}
                      onChange={(e) => setNewNeedValue(e.target.value)}
                      placeholder="0"
                      className="w-32 pl-12"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNeed())}
                      data-testid="input-new-need-value"
                    />
                  </div>
                  <Button onClick={addNeed} data-testid="button-add-need">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {(user.whatINeed || []).map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                  >
                    <div>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-primary font-bold">
                        {t("common.aed")} {(item.value || 0).toLocaleString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeNeed(index)}
                        data-testid={`button-remove-need-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(user.whatINeed || []).length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    {t("profile.noNeeds")}
                  </p>
                )}
              </div>
              {(user.whatINeed || []).length > 0 && (
                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t("profile.totalNeedValue")}</span>
                  <span className="text-xl font-bold text-primary">
                    {t("common.aed")} {totalNeedValue.toLocaleString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="endorsements">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ThumbsUp className="h-5 w-5 text-primary" />
                {t("profile.skillEndorsements")}
              </CardTitle>
              <CardDescription>
                {t("profile.endorsementsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {endorsements && endorsements.length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(
                    endorsements.reduce<Record<string, typeof endorsements>>((acc, e) => {
                      if (!acc[e.skill]) acc[e.skill] = [];
                      acc[e.skill].push(e);
                      return acc;
                    }, {})
                  ).map(([skill, skillEndorsements]) => (
                    <div key={skill} className="p-3 rounded-md bg-muted" data-testid={`endorsement-skill-${skill}`}>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-primary" />
                          <span className="font-medium">{skill}</span>
                        </div>
                        <Badge variant="secondary">
                          {skillEndorsements.length} {skillEndorsements.length !== 1 ? t("profile.endorsementPlural") : t("profile.endorsementSingular")}
                        </Badge>
                      </div>
                      <div className="flex -space-x-2">
                        {skillEndorsements.slice(0, 5).map((e) => (
                          <Avatar key={e.id} className="h-7 w-7 border-2 border-background">
                            <AvatarImage src={e.fromUser?.avatarUrl || undefined} />
                            <AvatarFallback className="text-[8px]">{e.fromUser?.fullName?.charAt(0) || "U"}</AvatarFallback>
                          </Avatar>
                        ))}
                        {skillEndorsements.length > 5 && (
                          <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium">
                            +{skillEndorsements.length - 5}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ThumbsUp className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">{t("profile.noEndorsements")}</p>
                  <p className="text-muted-foreground text-xs mt-1">{t("profile.endorsementsHint")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-primary" />
                {t("profile.portfolioGallery")}
              </CardTitle>
              <CardDescription>
                {t("profile.portfolioDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                type="file"
                ref={portfolioInputRef}
                className="hidden"
                accept="image/*,video/*"
                onChange={handlePortfolioUpload}
              />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Button
                  variant="outline"
                  className="aspect-square flex flex-col items-center justify-center gap-2 h-auto"
                  onClick={() => portfolioInputRef.current?.click()}
                  disabled={uploadFileMutation.isPending}
                  data-testid="button-add-portfolio"
                >
                  {uploadFileMutation.isPending ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Plus className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t("profile.addImage")}</span>
                    </>
                  )}
                </Button>
                {portfolioItems && portfolioItems.length > 0
                  ? portfolioItems.map((item) => (
                    <div key={item.id} className="relative aspect-square rounded-md overflow-hidden bg-muted group" data-testid={`portfolio-item-${item.id}`}>
                      <img src={item.mediaUrl} alt={item.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <p className="text-white text-xs font-medium truncate">{item.title}</p>
                        {item.category && <Badge variant="secondary" className="text-[10px] mt-0.5">{item.category}</Badge>}
                      </div>
                    </div>
                  ))
                  : (user.portfolioImages || []).map((image, index) => (
                    <div key={index} className="relative aspect-square rounded-md overflow-hidden bg-muted group">
                      <img src={image} alt={t("profile.portfolioAlt", { n: String(index + 1) })} className="w-full h-full object-cover" />
                    </div>
                  ))
                }
              </div>
              {(!portfolioItems || portfolioItems.length === 0) && (user.portfolioImages || []).length === 0 && (
                <p className="text-muted-foreground text-sm text-center mt-4">
                  {t("profile.portfolioHint")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification">
          <VerificationSection user={user} />
        </TabsContent>

        </div>{/* end mobile-hidden content wrapper */}
      </Tabs>
    </div>
  );
}

// ── Task #248: Drafts panel ──────────────────────────────────────────
// Lists all saved drafts for the current user with a "continue" CTA
const DEAL_STATE_COLORS: Record<string, string> = {
  proposed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  accepted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  delivery: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-muted text-muted-foreground",
  disputed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function DealsPanel() {
  const { user } = useAuth();
  const [dealFilter, setDealFilter] = useState<"all" | "active" | "completed">("all");

  const { data: deals = [], isLoading } = useQuery<DealWithUsers[]>({
    queryKey: ["/api/deals"],
    enabled: !!user,
  });

  const filtered = deals.filter((d) => {
    if (dealFilter === "active") return !["completed", "cancelled"].includes(d.state);
    if (dealFilter === "completed") return d.state === "completed";
    return true;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Handshake className="h-5 w-5" />My Deals</CardTitle>
            <CardDescription className="mt-1">All your barter deals — active and completed</CardDescription>
          </div>
          <div className="flex gap-1.5">
            {(["all", "active", "completed"] as const).map((f) => (
              <Button
                key={f}
                variant={dealFilter === f ? "default" : "outline"}
                size="sm"
                className="capitalize h-8"
                onClick={() => setDealFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <Handshake className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="font-semibold">
              {dealFilter === "active" ? "No active deals" : dealFilter === "completed" ? "No completed deals" : "No deals yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {dealFilter === "all"
                ? "Once you propose or accept a barter deal it will appear here."
                : `Switch to "All" to see all your deals.`}
            </p>
            {dealFilter === "all" && (
              <Link href="/browse">
                <Button variant="bareter" size="sm" className="mt-4">Browse Listings</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((deal) => {
              const isSeeker = deal.seekerId === user?.id;
              const counterpart = isSeeker ? deal.provider : deal.seeker;
              return (
                <Link key={deal.id} href={`/deals/${deal.id}`}>
                  <div className="flex items-center gap-4 p-4 rounded-xl border hover:bg-muted/40 transition-colors group cursor-pointer">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-bold">
                      {counterpart?.fullName?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm truncate">
                          {isSeeker ? "You → " : "← "}{counterpart?.fullName || "Unknown"}
                        </span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 h-4 shrink-0 ${DEAL_STATE_COLORS[deal.state] || ""}`}
                        >
                          {deal.state.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{deal.seekerOffer || "Barter deal"}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(deal.createdAt!).toLocaleDateString()}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// that round-trips through ?draft=<id>. Deleting is destructive but
// scoped (storage layer enforces userId match) so the optimistic
// invalidation here is safe.
function DraftsPanel() {
  const { t } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: drafts, isLoading } = useQuery<ListingDraft[]>({
    queryKey: ["/api/listing-drafts"],
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/listing-drafts/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/listing-drafts"] });
      qc.invalidateQueries({ queryKey: ["/api/continue"] });
    },
    onError: () => toast({ title: "Could not delete draft", variant: "destructive" }),
  });
  const publish = useMutation({
    mutationFn: async (draft: ListingDraft) => {
      const res = await apiRequest("POST", "/api/listings", draft.data);
      const created = await res.json();
      await apiRequest("DELETE", `/api/listing-drafts/${draft.id}`).catch(() => {});
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/listing-drafts"] });
      qc.invalidateQueries({ queryKey: ["/api/continue"] });
      qc.invalidateQueries({ queryKey: ["/api/listings"] });
      toast({ title: "Listing published" });
    },
    onError: (err: Error) => toast({
      title: "Could not publish draft",
      description: err?.message || "Open the draft to fix missing fields.",
      variant: "destructive",
    }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.draftsTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : !drafts || drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-drafts-empty">
            {t("profile.draftsEmpty")}
          </p>
        ) : (
          <div className="space-y-3" data-testid="list-drafts">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 border rounded-md p-3 hover-elevate"
                data-testid={`row-draft-${d.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate" data-testid={`text-draft-title-${d.id}`}>
                    {d.title || t("profile.draftsUntitled")}
                  </p>
                  {d.updatedAt && (
                    <p className="text-xs text-muted-foreground">
                      {t("profile.draftsUpdated")}: {new Date(d.updatedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => publish.mutate(d)}
                  disabled={publish.isPending}
                  data-testid={`button-draft-publish-${d.id}`}
                >
                  {t("profile.draftsPublish")}
                </Button>
                <Link href={`/create-listing?draft=${d.id}`}>
                  <Button size="sm" variant="outline" data-testid={`button-draft-continue-${d.id}`}>
                    {t("profile.draftsContinue")}
                  </Button>
                </Link>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => del.mutate(d.id)}
                  disabled={del.isPending}
                  aria-label={t("profile.draftsDelete")}
                  data-testid={`button-draft-delete-${d.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
