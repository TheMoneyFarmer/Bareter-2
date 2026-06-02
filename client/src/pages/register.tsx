import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { registerSchema, COUNTRIES, getCitiesForCountry } from "@shared/schema";
import type { SocialProfile } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Handshake,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle,
  User,
  Building2,
  Camera,
  ArrowLeft,
  ArrowRight,
  SkipForward,
  Instagram,
  Youtube,
  Linkedin,
  Twitter,
  Video,
  Users,
} from "lucide-react";
import { z } from "zod";
import { trackEvent } from "@/lib/posthog";

function GoogleSignInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

const extendedRegisterSchema = registerSchema.extend({
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof extendedRegisterSchema>;

type SignupType = "personal" | "business" | "creator";

interface SocialFormState {
  instagram: { username: string; followerCount: string };
  tiktok: { username: string; followerCount: string };
  youtube: { username: string; followerCount: string };
  linkedin: { username: string };
  x: { username: string };
}

const SOCIAL_PLATFORMS = [
  {
    key: "instagram" as const,
    label: "Instagram",
    icon: Instagram,
    hasFollowers: true,
    placeholder: "@username",
  },
  {
    key: "tiktok" as const,
    label: "TikTok",
    icon: Video,
    hasFollowers: true,
    placeholder: "@username",
  },
  {
    key: "youtube" as const,
    label: "YouTube",
    icon: Youtube,
    hasFollowers: true,
    placeholder: "Channel name",
  },
  {
    key: "linkedin" as const,
    label: "LinkedIn",
    icon: Linkedin,
    hasFollowers: false,
    placeholder: "Profile URL or username",
  },
  {
    key: "x" as const,
    label: "X / Twitter",
    icon: Twitter,
    hasFollowers: false,
    placeholder: "@handle",
  },
];

export function RegisterPage() {
  const { register, user } = useAuth();
  const { mode: waitlistMode, open: openWaitlist } = useWaitlist();
  const { toast } = useToast();
  const { t } = useI18n();
  const [, navigate] = useLocation();

  const [inviteCode, setInviteCode] = useState(() => {
    try {
      const url = new URL(window.location.href);
      // Accept either ?invite=CODE (admin beta-invite link) or
      // ?ref=CODE (waitlist referral link) — both are valid invite
      // codes the server accepts during invite-only registration.
      // Normalize to match how codes are stored (uppercase, ≤16 chars)
      // so a lowercased link doesn't get rejected on submit.
      const raw = url.searchParams.get("invite") || url.searchParams.get("ref") || "";
      return raw.trim().toUpperCase().slice(0, 16);
    } catch { return ""; }
  });

  // Only bounce visitors to the waitlist when they DON'T have an invite
  // code. Friends who open an invite link must be able to reach the
  // registration form even while waitlist mode is on — the server still
  // validates the code on submit.
  useEffect(() => {
    if (waitlistMode.enabled && !user && !inviteCode) {
      openWaitlist();
      navigate("/");
    }
  }, [waitlistMode.enabled, user, inviteCode, openWaitlist, navigate]);
  const { data: googleStatus } = useQuery<{ enabled: boolean }>({ queryKey: ["/api/auth/google/status"], staleTime: Infinity });
  const googleEnabled = googleStatus?.enabled ?? false;
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [signupType, setSignupType] = useState<SignupType | null>(null);
  const [registerError, setRegisterError] = useState<{ emailExists?: boolean; message?: string } | null>(null);
  const [socialForm, setSocialForm] = useState<SocialFormState>({
    instagram: { username: "", followerCount: "" },
    tiktok: { username: "", followerCount: "" },
    youtube: { username: "", followerCount: "" },
    linkedin: { username: "" },
    x: { username: "" },
  });

  const benefits = [
    t("landing.freeForEveryone"),
    t("landing.verifiedPartners"),
    t("landing.bindingContracts"),
    t("deal.chat"),
  ];

  const form = useForm<RegisterForm>({
    resolver: zodResolver(extendedRegisterSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
      country: "AE",
      city: "",
      acceptTerms: false,
    },
  });

  // IP-based country/city preselect when register form loads
  useEffect(() => {
    let cancelled = false;
    fetch("/api/geo/lookup", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((geo) => {
        if (cancelled || !geo?.country) return;
        if (!form.getValues("country") || form.getValues("country") === "AE") {
          form.setValue("country", geo.country);
        }
        if (!form.getValues("city") && geo.city) {
          form.setValue("city", geo.city);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCountry = form.watch("country") || "AE";
  const cityOptions = getCitiesForCountry(selectedCountry);

  const buildSocialProfiles = (): SocialProfile[] => {
    const profiles: SocialProfile[] = [];

    if (socialForm.instagram.username.trim()) {
      profiles.push({
        platform: "instagram",
        username: socialForm.instagram.username.trim(),
        followerCount: socialForm.instagram.followerCount
          ? parseInt(socialForm.instagram.followerCount, 10) || undefined
          : undefined,
      });
    }
    if (socialForm.tiktok.username.trim()) {
      profiles.push({
        platform: "tiktok",
        username: socialForm.tiktok.username.trim(),
        followerCount: socialForm.tiktok.followerCount
          ? parseInt(socialForm.tiktok.followerCount, 10) || undefined
          : undefined,
      });
    }
    if (socialForm.youtube.username.trim()) {
      profiles.push({
        platform: "youtube",
        username: socialForm.youtube.username.trim(),
        followerCount: socialForm.youtube.followerCount
          ? parseInt(socialForm.youtube.followerCount, 10) || undefined
          : undefined,
      });
    }
    if (socialForm.linkedin.username.trim()) {
      profiles.push({
        platform: "linkedin",
        username: socialForm.linkedin.username.trim(),
      });
    }
    if (socialForm.x.username.trim()) {
      profiles.push({
        platform: "x",
        username: socialForm.x.username.trim(),
      });
    }

    return profiles;
  };

  const handleFinalSubmit = async () => {
    const formValues = form.getValues();
    setIsLoading(true);
    try {
      const socialProfiles = buildSocialProfiles();
      await register({
        email: formValues.email,
        password: formValues.password,
        fullName: formValues.fullName,
        country: formValues.country,
        city: formValues.city,
        signupType: signupType || undefined,
        socialProfiles: socialProfiles.length > 0 ? socialProfiles : undefined,
        inviteCode: inviteCode.trim().toUpperCase().slice(0, 16) || undefined,
      });
      trackEvent("register", {
        account_type: signupType || undefined,
        country: formValues.country,
      });
      toast({
        title: t("auth.accountCreated"),
        description: t("auth.welcomeToMargin"),
      });
      navigate("/profile");
    } catch (error: any) {
      const raw = (error?.message || "").toLowerCase();
      if (raw.includes("already registered") || raw.includes("already exists") || raw.includes("email already") || raw.includes("duplicate")) {
        setRegisterError({ emailExists: true });
        return;
      }
      const friendlyMessage =
        raw.includes("invite") || raw.includes("invitation")
          ? "This invite code is invalid or has already been used."
          : raw.includes("password") && raw.includes("weak")
          ? "Your password is too weak. Please use at least 8 characters with a mix of letters and numbers."
          : raw.includes("rate") || raw.includes("too many")
          ? "Too many attempts. Please wait a few minutes and try again."
          : "Something went wrong while creating your account. Please try again.";
      setRegisterError({ message: friendlyMessage });
      toast({
        title: "Account creation failed",
        description: friendlyMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onStep2Submit = async (data: RegisterForm) => {
    setStep(3);
  };

  const handleSocialChange = (
    platform: keyof SocialFormState,
    field: string,
    value: string,
  ) => {
    setSocialForm((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value,
      },
    }));
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
              s === step
                ? "bg-primary text-primary-foreground"
                : s < step
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
            data-testid={`step-indicator-${s}`}
          >
            {s < step ? <CheckCircle className="h-4 w-4" /> : s}
          </div>
          {s < 3 && (
            <div
              className={`h-0.5 w-8 transition-colors ${
                s < step ? "bg-primary" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <>
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>
          Join Bareter — UAE's first AI-powered barter marketplace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderStepIndicator()}

        {/* Google OAuth */}
        {googleEnabled && (
          <>
            <a
              href="/auth/google"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-border bg-white dark:bg-muted hover:bg-gray-50 dark:hover:bg-muted/80 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-foreground transition-colors shadow-sm"
              data-testid="button-google-register"
            >
              <GoogleSignInIcon />
              Continue with Google
            </a>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or choose account type</span>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => { setSignupType("personal"); setStep(2); }}
            className={`relative flex flex-col items-center gap-3 rounded-md border p-5 text-center transition-colors hover-elevate cursor-pointer ${signupType === "personal" ? "border-primary bg-primary/5" : "border-border"}`}
            data-testid="card-signup-personal"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Personal</p>
              <p className="text-xs text-muted-foreground mt-1">Individuals & sole traders</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => { setSignupType("business"); setStep(2); }}
            className={`relative flex flex-col items-center gap-3 rounded-md border p-5 text-center transition-colors hover-elevate cursor-pointer ${signupType === "business" ? "border-primary bg-primary/5" : "border-border"}`}
            data-testid="card-signup-business"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Business</p>
              <p className="text-xs text-muted-foreground mt-1">Companies & agencies</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => { setSignupType("creator"); setStep(2); }}
            className={`relative flex flex-col items-center gap-3 rounded-md border p-5 text-center transition-colors hover-elevate cursor-pointer ${signupType === "creator" ? "border-primary bg-primary/5" : "border-border"}`}
            data-testid="card-signup-creator"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <Camera className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Creator</p>
              <p className="text-xs text-muted-foreground mt-1">Influencers & content creators</p>
            </div>
          </button>
        </div>

        <div className="mt-6 text-center text-sm">
          <span className="text-muted-foreground">{t("auth.haveAccount")} </span>
          <Link href="/login" className="text-primary hover:underline font-medium" data-testid="link-login">
            {t("auth.signIn")}
          </Link>
        </div>
      </CardContent>
    </>
  );

  const renderStep2 = () => (
    <>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-xl">{t("auth.register")}</CardTitle>
          <Badge variant="secondary" className="text-xs capitalize">
            {signupType}
          </Badge>
        </div>
        <CardDescription>
          {t("auth.joinMargin")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {renderStepIndicator()}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onStep2Submit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.fullName")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Smith"
                      data-testid="input-fullname"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.email")}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@company.com"
                      data-testid="input-email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.password")}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        data-testid="input-password"
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      data-testid="input-confirm-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select onValueChange={(v) => { field.onChange(v); form.setValue("city", ""); }} value={field.value || "AE"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-country">
                          <SelectValue placeholder="Country" />
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
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-city">
                          <SelectValue placeholder="City" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-72">
                        {cityOptions.map((city) => (
                          <SelectItem key={city} value={city}>{city}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              <FormLabel>Invite Code (optional)</FormLabel>
              <Input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123"
                maxLength={16}
                className="mt-1.5"
                data-testid="input-invite-code"
              />
              <p className="text-xs text-muted-foreground mt-1">
                If you have an invite code from a friend, enter it here
              </p>
            </div>

            <FormField
              control={form.control}
              name="acceptTerms"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-terms"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-sm font-normal">
                      I agree to the{" "}
                      <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">
                        Terms of Use
                      </a>
                      ,{" "}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">
                        Privacy Policy
                      </a>
                      , and{" "}
                      <a href="/legal/cookies" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">
                        Cookie Policy
                      </a>
                      . See also our{" "}
                      <a href="/legal/customer-agreement" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">
                        Customer Agreement
                      </a>
                      .
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                data-testid="button-back-step1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                data-testid="button-next-step3"
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </form>
        </Form>

        <div className="mt-6 text-center text-sm">
          <span className="text-muted-foreground">{t("auth.haveAccount")} </span>
          <Link href="/login" className="text-primary hover:underline font-medium" data-testid="link-login-step2">
            {t("auth.signIn")}
          </Link>
        </div>
      </CardContent>
    </>
  );

  const renderStep3 = () => (
    <>
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-xl">Social Media Presence</CardTitle>
          <Badge variant="secondary" className="text-xs">Optional</Badge>
        </div>
        <CardDescription>
          Add your social profiles to help partners find and verify you. You can skip this step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {renderStepIndicator()}

        {/* Email-already-exists inline banner */}
        {registerError?.emailExists && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3.5 flex flex-col gap-1">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              An account with this email already exists
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Looks like you've already signed up. Please{" "}
              <Link href="/login" className="font-semibold underline hover:no-underline">sign in to your account</Link>
              {" "}instead, or use a different email address.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {SOCIAL_PLATFORMS.map((platform) => {
            const Icon = platform.icon;
            const state = socialForm[platform.key];
            return (
              <div
                key={platform.key}
                className="rounded-md border p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{platform.label}</span>
                </div>
                <div className={`grid gap-3 ${platform.hasFollowers ? "grid-cols-2" : "grid-cols-1"}`}>
                  <Input
                    placeholder={platform.placeholder}
                    value={state.username}
                    onChange={(e) =>
                      handleSocialChange(platform.key, "username", e.target.value)
                    }
                    data-testid={`input-social-${platform.key}-username`}
                  />
                  {platform.hasFollowers && "followerCount" in state && (
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="Followers"
                        value={(state as { username: string; followerCount: string }).followerCount}
                        onChange={(e) =>
                          handleSocialChange(
                            platform.key,
                            "followerCount",
                            e.target.value,
                          )
                        }
                        data-testid={`input-social-${platform.key}-followers`}
                      />
                      <Users className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => { setStep(2); setRegisterError(null); }}
            data-testid="button-back-step2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={handleFinalSubmit}
            disabled={isLoading || !!registerError?.emailExists}
            data-testid="button-skip-social"
          >
            <SkipForward className="mr-2 h-4 w-4" />
            Skip
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handleFinalSubmit}
            disabled={isLoading || !!registerError?.emailExists}
            data-testid="button-submit-register"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                {t("auth.register")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center">
        <div className="hidden lg:block space-y-8">
          <div>
            <Link href="/" className="flex items-center gap-2 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Handshake className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold">{t("app.name")}</span>
            </Link>
            <h1 className="text-3xl font-bold mb-3">
              {t("auth.startBartering")}<br />{t("auth.notCash")}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t("auth.joinDescription")}
            </p>
          </div>

          <div className="space-y-3">
            {benefits.map((benefit, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm">{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="lg:hidden flex flex-col items-center mb-8">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <Handshake className="h-6 w-6 text-primary-foreground" />
              </div>
            </Link>
            <h1 className="text-2xl font-bold text-center">{t("auth.createAccount")}</h1>
            <p className="text-muted-foreground text-center mt-1">
              {t("auth.joinMargin")}
            </p>
          </div>

          <Card>
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </Card>
        </div>
      </div>
    </div>
  );
}
