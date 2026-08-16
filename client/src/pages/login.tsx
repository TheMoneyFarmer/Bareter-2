import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, storeMobileToken, queryClient } from "@/lib/queryClient";
import { loginSchema } from "@shared/schema";
import { trackEvent } from "@/lib/posthog";
import { Handshake, Loader2, Eye, EyeOff, ExternalLink, Copy, AlertCircle } from "lucide-react";
import { z } from "zod";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.32.07 2.23.73 3 .78 1.17-.24 2.3-.96 3.55-.84 1.5.15 2.63.73 3.36 1.86-3.03 1.87-2.28 5.61.41 6.97-.61 1.55-1.38 3.08-2.32 4.11zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}

// Detect common in-app browsers where cookies are isolated from the main browser.
function detectInAppBrowser(): { detected: boolean; name: string } {
  const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "") || "";
  if (/Instagram/.test(ua)) return { detected: true, name: "Instagram" };
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return { detected: true, name: "Facebook" };
  if (/WhatsApp/.test(ua)) return { detected: true, name: "WhatsApp" };
  if (/LinkedInApp/.test(ua)) return { detected: true, name: "LinkedIn" };
  if (/TikTok|BytedanceWebview/.test(ua)) return { detected: true, name: "TikTok" };
  if (/Snapchat/.test(ua)) return { detected: true, name: "Snapchat" };
  if (/Twitter|X-Twitter/.test(ua)) return { detected: true, name: "X/Twitter" };
  return { detected: false, name: "" };
}

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login, user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  // Always show the forgot-password link — if email is not configured the page will show an error
  const passwordResetEnabled = true;
  const { data: googleStatus } = useQuery<{ enabled: boolean }>({ queryKey: ["/api/auth/google/status"], staleTime: Infinity });
  const googleEnabled = googleStatus?.enabled ?? false;
  const { data: appleStatus } = useQuery<{ enabled: boolean }>({ queryKey: ["/api/auth/apple/status"], staleTime: Infinity });
  const appleEnabled = appleStatus?.enabled ?? false;
  const inApp = detectInAppBrowser();

  // Read query params once (wouter's useLocation only exposes the path).
  const params = (() => {
    try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); }
  })();
  const sessionExpired = params.get("expired") === "1";
  const redirectTo = params.get("redirect") || "/browse";

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const handleOpenInBrowser = async () => {
    const url = window.location.href;
    // Try opening in a new tab/external browser via target="_blank" semantics.
    // Many in-app browsers (Instagram iOS 2022+) will open this in Safari.
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
    // Also copy the URL so the user can paste it if the tap didn't work.
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    } catch { /* clipboard not available */ }
  };

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      await login(data.email, data.password);
      // login() resolves only after the server returned the user AND
      // queryClient cache was set via onSuccess. No second round-trip needed.
      trackEvent("login");
      toast({
        title: t("auth.welcomeBack") + "!",
        description: t("auth.signInToContinue"),
      });
      navigate(redirectTo.startsWith("/") ? redirectTo : "/browse");
    } catch (error: any) {
      const raw = (error?.message || "").toLowerCase();
      const description =
        raw.includes("invalid credentials") || raw.includes("401") || raw.includes("password") || raw.includes("incorrect")
          ? "Incorrect email or password. Please double-check your details and try again."
          : raw.includes("too many") || raw.includes("rate limit") || raw.includes("429")
          ? "Too many sign-in attempts. Please wait a few minutes before trying again."
          : raw.includes("suspend") || raw.includes("banned")
          ? "Your account has been suspended. Please contact support at hello@bareter.com."
          : raw.includes("not found") || raw.includes("no account")
          ? "No account found with that email. Please check your email or sign up."
          : "Something went wrong. Please try again in a moment.";
      toast({
        title: "Sign-in unsuccessful",
        description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleNative = async () => {
    setAppleLoading(true);
    try {
      const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
      // clientId/redirectURI are required by this plugin's shared TypeScript
      // interface, but on the native iOS path they're vestiges of the
      // plugin's own web-fallback implementation — ASAuthorizationController
      // authenticates using the app's bundle id directly, not these values.
      // We never invoke this plugin's web path (the browser already has the
      // separate /auth/apple redirect flow above), so any well-formed values
      // are fine here; using the real ones costs nothing and avoids a
      // meaningless placeholder if this ever shows up in a log.
      const result = await SignInWithApple.authorize({
        clientId: "com.bareter.app",
        redirectURI: "https://bareter.com/auth/apple/callback",
        scopes: "email name",
      });
      const { identityToken, givenName, familyName } = result.response;
      // Apple sends the name ONLY on the very first authorization ever, then
      // null on every call after — same constraint the server-side web
      // callback already documents. Send it up while we have it; the server
      // never asks for it again.
      const fullName = [givenName, familyName].filter(Boolean).join(" ").trim() || undefined;
      const userData = await apiRequest("POST", "/api/auth/apple/native", { identityToken, fullName });
      const { mobileToken, ...user } = userData as any;
      if (mobileToken) await storeMobileToken(mobileToken);
      queryClient.setQueryData(["/api/auth/me"], user);
      trackEvent("login");
      navigate(redirectTo.startsWith("/") ? redirectTo : "/browse");
    } catch (err: any) {
      const msg = (err?.message ?? "").toLowerCase();
      // ASAuthorizationError.canceled === 1001 — the user dismissed the sheet.
      if (msg.includes("cancel") || msg.includes("1001")) return;
      apiRequest("POST", "/api/logs/client-error", {
        context: "apple-sign-in",
        error: String(err?.message ?? err),
        platform: "ios-native",
      }).catch(() => {});
      toast({ title: "Sign-in failed", description: "Please try again or use email.", variant: "destructive" });
    } finally {
      setAppleLoading(false);
    }
  };

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
      trackEvent("login");
      navigate(redirectTo.startsWith("/") ? redirectTo : "/browse");
    } catch (err: any) {
      const msg = (err?.message ?? "").toLowerCase();
      if (msg.includes("cancel") || msg.includes("dismiss") || msg.includes("12501") || msg.includes("sign_in_cancelled")) return;
      // Log full error server-side for admin visibility; show generic message to user
      apiRequest("POST", "/api/logs/client-error", {
        context: "google-sign-in",
        error: String(err?.message ?? err),
        platform: "ios-native",
      }).catch(() => {});
      toast({ title: "Sign-in failed", description: "Please try again or use email.", variant: "destructive" });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* In-app browser warning — shown prominently before the form */}
        {inApp.detected && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3.5" data-testid="notice-inapp-browser">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
              You&apos;re inside {inApp.name}&apos;s browser
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mb-3 leading-relaxed">
              {inApp.name}&apos;s browser blocks login sessions. Open bareter.com directly in <strong>Safari</strong> or <strong>Chrome</strong> for a reliable experience.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleOpenInBrowser}
                className="flex-1 flex items-center justify-center gap-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors"
                data-testid="button-open-in-browser"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Safari / Chrome
              </button>
              <button
                type="button"
                onClick={handleOpenInBrowser}
                className="flex items-center justify-center gap-1 border border-amber-400 text-amber-800 dark:text-amber-300 text-xs font-medium py-2 px-3 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                data-testid="button-copy-link"
              >
                <Copy className="h-3.5 w-3.5" />
                {linkCopied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Handshake className="h-6 w-6 text-primary-foreground" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-center">{t("auth.welcomeBack")}</h1>
          <p className="text-muted-foreground text-center mt-1">
            {t("auth.signInToContinue")}
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">{t("auth.signIn")}</CardTitle>
            <CardDescription>
              {t("auth.signInToContinue")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessionExpired && (
              <div
                className="mb-4 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
                data-testid="notice-session-expired"
              >
                Your session ended — please sign in again to continue.
              </div>
            )}

            {/* Social OAuth buttons */}
            {(googleEnabled || appleEnabled) && (
              <>
                {params.get("google_error") && (
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    Social sign-in failed — please try again or use email below.
                  </div>
                )}

                <div className={`grid gap-3 ${googleEnabled && appleEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
                  {googleEnabled && (
                    Capacitor.isNativePlatform() ? (
                      <button
                        type="button"
                        onClick={handleGoogleNative}
                        disabled={googleLoading}
                        className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-border bg-white dark:bg-muted hover:bg-gray-50 dark:hover:bg-muted/80 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-foreground transition-colors shadow-sm disabled:opacity-50"
                        data-testid="button-google-login"
                      >
                        {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
                        Google
                      </button>
                    ) : (
                      <a
                        href={`/auth/google${redirectTo !== "/browse" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}
                        className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-border bg-white dark:bg-muted hover:bg-gray-50 dark:hover:bg-muted/80 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-foreground transition-colors shadow-sm"
                        data-testid="button-google-login"
                      >
                        <GoogleIcon />
                        Google
                      </a>
                    )
                  )}
                  {appleEnabled && (
                    Capacitor.isNativePlatform() ? (
                      <button
                        type="button"
                        onClick={handleAppleNative}
                        disabled={appleLoading}
                        className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-border bg-black hover:bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm disabled:opacity-50"
                        data-testid="button-apple-login"
                      >
                        {appleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleIcon />}
                        Apple
                      </button>
                    ) : (
                      <a
                        href={`/auth/apple${redirectTo !== "/browse" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`}
                        className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-border bg-black hover:bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm"
                        data-testid="button-apple-login"
                      >
                        <AppleIcon />
                        Apple
                      </a>
                    )
                  )}
                </div>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or sign in with email</span>
                  </div>
                </div>
              </>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

                {passwordResetEnabled && (
                  <div className="flex justify-end -mt-2">
                    <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
                      {t("auth.forgotPassword") || "Forgot password?"}
                    </Link>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-submit-login"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </>
                  ) : (
                    t("auth.signIn")
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">{t("auth.noAccount")} </span>
              <Link href="/register" className="text-primary hover:underline font-medium">
                {t("auth.signUp")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
