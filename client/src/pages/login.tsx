import { useState } from "react";
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
import { loginSchema } from "@shared/schema";
import { trackEvent } from "@/lib/posthog";
import { Handshake, Loader2, Eye, EyeOff, ExternalLink, Copy } from "lucide-react";
import { z } from "zod";

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
  const { data: config } = useQuery<{ passwordResetEnabled: boolean }>({ queryKey: ["/api/config"] });
  const passwordResetEnabled = config?.passwordResetEnabled ?? false;
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
      toast({
        title: t("auth.loginFailed"),
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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
