import { useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/lib/posthog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWaitlist } from "@/lib/waitlist";
import { COUNTRIES, getCitiesForCountry, getCountryByCode } from "@shared/schema";
import { Handshake, Loader2, Copy, Check, Share2, Trophy, ChevronsUpDown } from "lucide-react";

const OTHER_CITY = "__other__";

type SubmitResponse = {
  ok: boolean;
  alreadyOnList: boolean;
  position: number;
  referralCode: string;
  referralCount: number;
  totalCount: number;
};

export function WaitlistDialog() {
  const { isOpen, close, mode, referralCode: incomingRef, defaults, appUrl } = useWaitlist();
  const { toast } = useToast();
  const [step, setStep] = useState<"form" | "success">("form");
  const [success, setSuccess] = useState<SubmitResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [cityIsOther, setCityIsOther] = useState<boolean>(false);
  const [accountType, setAccountType] = useState<string>("individual");
  const [businessName, setBusinessName] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  const cityOptions = useMemo(() => getCitiesForCountry(country), [country]);

  // Prefill country/city from context defaults whenever the dialog opens.
  // Always reset country/city/cityIsOther on open so prior session state never
  // leaks a stale city under the new country selection.
  useEffect(() => {
    if (isOpen) {
      const nextCountry = defaults.country || "";
      const nextCity = defaults.city || "";
      setCountry(nextCountry);
      setCity(nextCity);
      const known = getCitiesForCountry(nextCountry);
      setCityIsOther(!!nextCity && !known.includes(nextCity));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaults.country, defaults.city]);

  // Live total
  const { data: counter } = useQuery<{ count: number }>({
    queryKey: ["/api/waitlist/count"],
    enabled: isOpen,
    refetchInterval: 15000,
  });
  const totalCount = counter?.count ?? mode.count ?? null;

  // Lookup referrer name
  const { data: referrer } = useQuery<{ referralCode: string; name: string | null; country: string | null }>({
    queryKey: ["/api/waitlist/by-code", incomingRef],
    enabled: isOpen && !!incomingRef,
  });

  useEffect(() => {
    if (!isOpen) {
      setStep("form");
      setSuccess(null);
      setCopied(false);
    }
  }, [isOpen]);

  const submit = useMutation({
    mutationFn: async () => {
      // Resolve city to match what the user actually sees in the form.
      // - If the city Select is active (country has a list, not in "Other" mode),
      //   only submit the city when it's still in the country's list; otherwise
      //   the Select is showing the placeholder and we should send null.
      // - In "Other" / free-text mode, submit whatever was typed.
      let submittedCity: string | null = null;
      if (country && cityOptions.length > 0 && !cityIsOther) {
        submittedCity = city && cityOptions.includes(city) ? city : null;
      } else {
        submittedCity = city.trim() ? city.trim() : null;
      }
      const res = await apiRequest("POST", "/api/waitlist", {
        email,
        name: name || null,
        country: country || null,
        city: submittedCity,
        accountType,
        businessName: accountType === "business" ? (businessName || null) : null,
        source: typeof window !== "undefined" ? window.location.pathname : null,
        referredByCode: incomingRef || null,
        company_website: honeypot,
      });
      return (await res.json()) as SubmitResponse;
    },
    onSuccess: (data) => {
      trackEvent("waitlist_signup");
      setSuccess(data);
      setStep("success");
      if (data.totalCount !== undefined) {
        queryClient.setQueryData(["/api/waitlist/count"], { count: data.totalCount });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/waitlist/mode"] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not join the waitlist",
        description: err?.message || "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Please enter your email", variant: "destructive" });
      return;
    }
    submit.mutate();
  };

  // Build share URL from the server-trusted public app URL so links always
  // point at the canonical (custom) domain, even when the dialog is opened
  // on a Replit dev URL or a redirect/preview host.
  const shareBase = appUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const shareUrl = success
    ? `${shareBase.replace(/\/+$/, "")}/?ref=${success.referralCode}`
    : "";

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Link copied!", description: "Share it with your friends to skip the line." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", description: shareUrl });
    }
  };

  const nativeShare = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Bareter",
          text: "Bareter is a worldwide barter marketplace launching soon. Join the waitlist!",
          url: shareUrl,
        });
      } catch {
        // user cancelled
      }
    } else {
      copyLink();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-waitlist">
        {step === "form" ? (
          <>
            <DialogHeader>
              <div className="flex items-center justify-center mb-2">
                <img
                  src="/logo-icon.png"
                  alt="Bareter"
                  className="h-12 w-12 rounded-xl shadow-sm"
                  data-testid="img-waitlist-logo"
                />
              </div>
              <DialogTitle className="text-center text-2xl">
                Bareter is launching soon
              </DialogTitle>
              <DialogDescription className="text-center">
                Join the waitlist and grab a <strong>Founder Badge</strong> for your profile at launch.
                {totalCount != null && totalCount > 0 && (
                  <> {" "}
                    <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span>{" "}
                    people already in.
                  </>
                )}
                {referrer?.name && (
                  <> {" "}
                    <span className="block mt-2 text-primary font-medium">
                      Invited by {referrer.name}
                    </span>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={onSubmit} className="space-y-3 mt-2">
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
                aria-hidden="true"
                name="company_website"
              />

              <div>
                <Label htmlFor="wl-email">Email *</Label>
                <Input
                  id="wl-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  data-testid="input-waitlist-email"
                />
              </div>

              <div>
                <Label htmlFor="wl-name">Name (optional)</Label>
                <Input
                  id="wl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  data-testid="input-waitlist-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="wl-country">Country</Label>
                  <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="wl-country"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={countryPickerOpen}
                        className="w-full justify-between font-normal"
                        data-testid="select-waitlist-country"
                      >
                        <span className={cn("truncate", !country && "text-muted-foreground")}>
                          {country ? getCountryByCode(country)?.name ?? "Select" : "Select"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search country..." data-testid="input-waitlist-country-search" />
                        <CommandList>
                          <CommandEmpty>No country found.</CommandEmpty>
                          <CommandGroup>
                            {COUNTRIES.map((c) => (
                              <CommandItem
                                key={c.code}
                                value={`${c.name} ${c.code}`}
                                onSelect={() => {
                                  if (c.code !== country) {
                                    setCountry(c.code);
                                    setCity("");
                                    setCityIsOther(false);
                                  }
                                  setCountryPickerOpen(false);
                                }}
                                data-testid={`option-waitlist-country-${c.code}`}
                              >
                                <span className="flex-1 truncate">{c.name}</span>
                                <Check
                                  className={cn(
                                    "ml-2 h-4 w-4",
                                    country === c.code ? "opacity-100" : "opacity-0"
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="wl-city">City</Label>
                  {country && cityOptions.length > 0 && !cityIsOther ? (
                    <Select
                      value={city && cityOptions.includes(city) ? city : ""}
                      onValueChange={(val) => {
                        if (val === OTHER_CITY) {
                          setCityIsOther(true);
                          setCity("");
                        } else {
                          setCity(val);
                        }
                      }}
                    >
                      <SelectTrigger id="wl-city" data-testid="select-waitlist-city">
                        <SelectValue placeholder="Pick your city" />
                      </SelectTrigger>
                      <SelectContent>
                        {cityOptions.map((c) => (
                          <SelectItem key={c} value={c} data-testid={`option-waitlist-city-${c}`}>
                            {c}
                          </SelectItem>
                        ))}
                        <SelectItem value={OTHER_CITY} data-testid="option-waitlist-city-other">
                          Other / type my city
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-1">
                      <Input
                        id="wl-city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Your city"
                        data-testid="input-waitlist-city"
                      />
                      {country && cityOptions.length > 0 && cityIsOther && (
                        <button
                          type="button"
                          className="text-[11px] text-primary underline"
                          onClick={() => { setCityIsOther(false); setCity(""); }}
                          data-testid="button-waitlist-city-back"
                        >
                          Pick from list instead
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="wl-type">I am a</Label>
                <Select value={accountType} onValueChange={setAccountType}>
                  <SelectTrigger id="wl-type" data-testid="select-waitlist-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {accountType === "business" && (
                <div>
                  <Label htmlFor="wl-biz">Business name (optional)</Label>
                  <Input
                    id="wl-biz"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Acme Co."
                    data-testid="input-waitlist-business"
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={submit.isPending}
                data-testid="button-waitlist-submit"
              >
                {submit.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Joining…</>
                ) : (
                  "Join the waitlist"
                )}
              </Button>

              <p className="text-[11px] text-muted-foreground text-center pt-1" data-testid="text-waitlist-consent">
                By joining, you agree to our{" "}
                <Link href="/terms" onClick={close} className="text-primary underline" data-testid="link-waitlist-terms">
                  Terms of Use
                </Link>
                ,{" "}
                <Link href="/privacy" onClick={close} className="text-primary underline" data-testid="link-waitlist-privacy">
                  Privacy Policy
                </Link>
                , and{" "}
                <Link href="/legal/cookies" onClick={close} className="text-primary underline" data-testid="link-waitlist-cookies">
                  Cookie Policy
                </Link>
                .
              </p>

              <p className="text-[11px] text-muted-foreground text-center pt-1">
                Already have an account?{" "}
                <a href="/login" onClick={close} className="text-primary underline" data-testid="link-waitlist-login">
                  Sign in
                </a>
              </p>
            </form>
          </>
        ) : (
          <div className="text-center" data-testid="waitlist-success">
            <div className="flex items-center justify-center mb-3">
              <div className="relative">
                <img
                  src="/logo-icon.png"
                  alt="Bareter"
                  className="h-14 w-14 rounded-xl shadow-sm"
                  data-testid="img-waitlist-success-logo"
                />
                <span className="absolute -bottom-1 -end-1 bg-amber-400 text-amber-950 rounded-full h-6 w-6 flex items-center justify-center shadow">
                  <Trophy className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
            <DialogTitle className="text-2xl mb-1">
              {success?.alreadyOnList ? "You're already on the list!" : "You're on the list! 🎉"}
            </DialogTitle>
            <DialogDescription>
              You're position{" "}
              <span className="font-semibold text-foreground" data-testid="text-waitlist-position">
                #{success?.position}
              </span>
              . A confirmation email is on its way.
            </DialogDescription>

            <div className="mt-5 rounded-lg border bg-muted/40 p-4 text-left">
              <p className="text-sm font-semibold mb-1">Skip the line</p>
              <p className="text-xs text-muted-foreground mb-3">
                Every friend who joins through your link moves you up. You currently have{" "}
                <span className="font-semibold text-foreground">{success?.referralCount ?? 0}</span>{" "}
                {success && (success.referralCount ?? 0) === 1 ? "referral" : "referrals"}.
              </p>
              <div className="flex items-center gap-2">
                <Input value={shareUrl} readOnly className="text-xs" data-testid="input-waitlist-share-url" />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={copyLink}
                  data-testid="button-waitlist-copy"
                  aria-label="Copy link"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                type="button"
                variant="default"
                className="w-full mt-3"
                onClick={nativeShare}
                data-testid="button-waitlist-share"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share my invite link
              </Button>
            </div>

            <Button
              variant="ghost"
              className="mt-4"
              onClick={close}
              data-testid="button-waitlist-close"
            >
              Keep exploring Bareter
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
