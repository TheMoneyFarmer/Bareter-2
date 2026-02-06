import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { registerSchema } from "@shared/schema";
import { Handshake, Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { z } from "zod";

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
  const { register } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const benefits = [
    t("landing.noSubscription"),
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
      acceptTerms: false,
    },
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      await register(data.email, data.password, data.fullName);
      toast({
        title: t("auth.accountCreated"),
        description: t("auth.welcomeToMargin"),
      });
      navigate("/profile");
    } catch (error: any) {
      toast({
        title: t("auth.registrationFailed"),
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">{t("auth.register")}</CardTitle>
              <CardDescription>
                {t("auth.joinMargin")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        <FormLabel>{t("auth.password")}</FormLabel>
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
                            {t("footer.terms")} & {t("footer.privacy")}
                          </FormLabel>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-submit-register"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("common.loading")}
                      </>
                    ) : (
                      t("auth.register")
                    )}
                  </Button>
                </form>
              </Form>

              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">{t("auth.haveAccount")} </span>
                <Link href="/login" className="text-primary hover:underline font-medium">
                  {t("auth.signIn")}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
