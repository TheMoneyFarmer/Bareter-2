import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { API_BASE, apiRequest, storeMobileToken, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { registerSchema, COUNTRIES, getCitiesForCountry } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Handshake,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Mail,
  RefreshCw,
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

function AppleSignInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.32.07 2.23.73 3 .78 1.17-.24 2.3-.96 3.55-.84 1.5.15 2.63.73 3.36 1.86-3.03 1.87-2.28 5.61.41 6.97-.61 1.55-1.38 3.08-2.32 4.11zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
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

  const redirectTo = (() => {
    try {
      const r = new URL(window.location.href).searchParams.get("redirect") || "";
      return r.startsWith("/") ? r : "/browse";
    } catch { return "/browse"; }
  })();

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
  const { data: appleStatus } = useQuery<{ enabled: boolean }>({ queryKey: ["/api/auth/apple/status"], staleTime: Infinity });
  const appleEnabled = appleStatus?.enabled ?? false;
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [step, setStep] = useState(() => {
    try {
      return new URL(window.location.href).searchParams.get("step") === "verify" ? 0 : 1;
    } catch { return 1; }
  });
  const [registerError, setRegisterError] = useState<{ emailExists?: boolean; message?: string } | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("step") === "verify") {
        return decodeURIComponent(url.searchParams.get("email") || "");
      }
    } catch { /* ignore */ }
    return null;
  });
  const [resendingVerification, setResendingVerification] = useState(false);
  const [internationalCountry, setInternationalCountry] = useState<string | null>(null);

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
    fetch(`${API_BASE}/api/geo/lookup`, { credentials: "include" })
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

  const handleFinalSubmit = async () => {
    const formValues = form.getValues();
    setIsLoading(true);
    setRegisterError(null);
    try {
      const result = await register({
        email: formValues.email,
        password: formValues.password,
        fullName: formValues.fullName,
        country: formValues.country,
        city: formValues.city,
        inviteCode: inviteCode.trim().toUpperCase().slice(0, 16) || undefined,
      });
      trackEvent("register", {
        country: formValues.country,
      });
      setRegisteredEmail(formValues.email);
      if (result?.onInternationalWaitlist) {
        setInternationalCountry(formValues.country);
        return;
      }
      // Store email then navigate so the success screen survives any
      // auth-context re-render that would otherwise reset component state.
      navigate(`/register?step=verify&email=${encodeURIComponent(formValues.email)}`);
    } catch (error: any) {
      const raw = (error?.message || "").toLowerCase();
      if (raw.includes("already registered") || raw.includes("already exists") || raw.includes("email already") || raw.includes("duplicate")) {
        setRegisterError({ emailExists: true });
        // Also show toast so the user cannot miss it
        toast({
          title: "Email already registered",
          description: "An account with this email already exists. Sign in instead.",
          variant: "destructive",
        });
        return;
      }
      const friendlyMessage =
        raw.includes("invite") || raw.includes("invitation")
          ? "This invite code is invalid or has already been used."
          : raw.includes("password") && raw.includes("weak")
          ? "Your password is too weak. Please use at least 8 characters with a mix of letters and numbers."
          : raw.includes("rate") || raw.includes("too many")
          ? "Too many attempts. Please wait a few minutes and try again."
          : raw.includes("city") || raw.includes("please select")
          ? "Please select your city before continuing."
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

  const onStep2Submit = async (_data: RegisterForm) => {
    await handleFinalSubmit();
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2].map((s) => (
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
          {s < 2 && (
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

  const handleGoogleNative = async () => {
    setGoogleLoading(true);
    try {
      const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
      await GoogleAuth.initialize({
        clientId: '990746727496-blj1mvk3i39on7d1t88cbgpos11995dp.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      });
      const result = await GoogleAuth.signIn();
      const idToken = result.authentication.idToken;
      const userData = await apiRequest("POST", "/api/auth/google/native", { idToken });
      const { mobileToken, ...user } = userData as any;
      if (mobileToken) await storeMobileToken(mobileToken);
      queryClient.setQueryData(["/api/auth/me"], user);
      navigate("/browse");
    } catch (err: any) {
      const msg = (err?.message ?? "").toLowerCase();
      if (msg.includes("cancel") || msg.includes("dismiss") || msg.includes("12501") || msg.includes("sign_in_cancelled")) return;
      apiRequest("POST", "/api/logs/client-error", {
        context: "google-sign-in-register",
        error: String(err?.message ?? err),
        platform: "ios-native",
      }).catch(() => {});
      toast({ title: "Sign-in failed", description: "Please try again or use email.", variant: "destructive" });
    } finally {
      setGoogleLoading(false);
    }
  };

  const renderStep1 = () => (
    <>
      <CardHeader className="space-y-1 text-center pb-2">
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>
          Join Bareter — UAE's first smart barter marketplace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {googleEnabled && (
          Capacitor.isNativePlatform() ? (
            <button
              type="button"
              onClick={handleGoogleNative}
              disabled={googleLoading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-border bg-white dark:bg-muted hover:bg-gray-50 dark:hover:bg-muted/80 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-foreground transition-colors shadow-sm disabled:opacity-50"
              data-testid="button-google-register"
            >
              {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleSignInIcon />}
              Continue with Google
            </button>
          ) : (
            <a
              href="/auth/google"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-border bg-white dark:bg-muted hover:bg-gray-50 dark:hover:bg-muted/80 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-foreground transition-colors shadow-sm"
              data-testid="button-google-register"
            >
              <GoogleSignInIcon />
              Continue with Google
            </a>
          )
        )}

        {appleEnabled && (
          <a
            href="/auth/apple"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-border bg-black hover:bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors shadow-sm"
            data-testid="button-apple-register"
          >
            <AppleSignInIcon />
            Continue with Apple
          </a>
        )}

        {(googleEnabled || appleEnabled) && (
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>
        )}

        <Button
          variant="outline"
          className="w-full h-11 font-semibold"
          onClick={() => setStep(2)}
          data-testid="button-continue-email"
        >
          <Mail className="mr-2 h-4 w-4" />
          Continue with email
        </Button>

        <p className="text-center text-xs text-muted-foreground pt-1">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline hover:text-foreground" onClick={(e) => e.stopPropagation()}>Terms</Link>
          {" & "}
          <Link href="/privacy" className="underline hover:text-foreground" onClick={(e) => e.stopPropagation()}>Privacy Policy</Link>
        </p>

        <div className="text-center text-sm pt-1">
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
        <CardTitle className="text-xl">{t("auth.register")}</CardTitle>
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
                      onChange={(e) => { field.onChange(e); setRegisterError(null); }}
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
                      <Link href="/terms" className="underline text-primary hover:text-primary/80" onClick={(e) => e.stopPropagation()}>
                        Terms of Use
                      </Link>
                      ,{" "}
                      <Link href="/privacy" className="underline text-primary hover:text-primary/80" onClick={(e) => e.stopPropagation()}>
                        Privacy Policy
                      </Link>
                      , and{" "}
                      <Link href="/legal/cookies" className="underline text-primary hover:text-primary/80" onClick={(e) => e.stopPropagation()}>
                        Cookie Policy
                      </Link>
                      . See also our{" "}
                      <Link href="/legal/customer-agreement" className="underline text-primary hover:text-primary/80" onClick={(e) => e.stopPropagation()}>
                        Customer Agreement
                      </Link>
                      .
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            {registerError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive" data-testid="register-error">
                {registerError.emailExists ? (
                  <>An account with this email already exists.{" "}
                    <Link href="/login" className="underline font-medium">Sign in instead</Link>
                  </>
                ) : (
                  registerError.message
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setStep(1); setRegisterError(null); }}
                data-testid="button-back-step1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isLoading}
                data-testid="button-create-account"
              >
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("common.loading")}</>
                ) : (
                  <>{t("auth.register")}<ArrowRight className="ml-2 h-4 w-4" /></>
                )}
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
            {internationalCountry ? (
              <div className="p-8 text-center space-y-5">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-3xl">
                  🌍
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">
                    Bareter is coming to {COUNTRIES.find((c) => c.code === internationalCountry)?.name ?? internationalCountry}!
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    We're currently live exclusively in the <strong>United Arab Emirates</strong> and expanding fast.
                    You've been added to our early-access list — we'll notify you the moment we launch in your country.
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm text-left space-y-1.5">
                  <p className="font-medium text-foreground">Want to start now?</p>
                  <p className="text-muted-foreground">
                    You can browse and barter UAE listings by switching your location to UAE in Settings or using the location selector at the top of any page.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button onClick={() => navigate("/browse")} className="w-full">
                    Explore UAE Listings
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="text-muted-foreground">
                    Go to Settings to change location
                  </Button>
                </div>
              </div>
            ) : registeredEmail ? (
              <div className="p-8 text-center space-y-5">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Mail className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-1">Check your email</h2>
                  <p className="text-muted-foreground text-sm">
                    We sent a verification link to <strong>{registeredEmail}</strong>.<br />
                    Click the link to verify your email and complete your account.
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground space-y-1.5 text-left">
                  <p className="font-medium text-foreground">What's next?</p>
                  <p>1. Open the email from Bareter</p>
                  <p>2. Click "Verify my email"</p>
                  <p>3. You're all set — start bartering</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button onClick={() => navigate(redirectTo)} className="w-full">
                    Continue to Bareter
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={resendingVerification}
                    onClick={async () => {
                      setResendingVerification(true);
                      try {
                        await fetch(`${API_BASE}/api/auth/resend-verification`, { method: "POST", credentials: "include" });
                        toast({ title: "Email resent", description: "Check your inbox again." });
                      } catch { /* ignore */ }
                      setResendingVerification(false);
                    }}
                    className="gap-1.5 text-muted-foreground"
                  >
                    {resendingVerification ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Resend verification email
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {(step === 1 || step === 0) && !registeredEmail && renderStep1()}
                {step === 2 && !registeredEmail && renderStep2()}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
