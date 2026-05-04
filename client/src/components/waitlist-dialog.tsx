import { useEffect, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWaitlist } from "@/lib/waitlist";
import { COUNTRIES } from "@shared/schema";
import { Handshake, Loader2, Copy, Check, Share2, Trophy } from "lucide-react";

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
  const [accountType, setAccountType] = useState<string>("individual");
  const [businessName, setBusinessName] = useState("");
  const [honeypot, setHoneypot] = useState("");

  // Prefill country/city from context defaults whenever the dialog opens with new defaults.
  // We refresh on every open so geo-detected values aren't stuck behind earlier user-typed ones.
  useEffect(() => {
    if (isOpen) {
      if (defaults.country) setCountry(defaults.country);
      if (defaults.city) setCity(defaults.city);
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
      const res = await apiRequest("POST", "/api/waitlist", {
        email,
        name: name || null,
        country: country || null,
        city: city || null,
        accountType,
        businessName: accountType === "business" ? (businessName || null) : null,
        source: typeof window !== "undefined" ? window.location.pathname : null,
        referredByCode: incomingRef || null,
        company_website: honeypot,
      });
      return (await res.json()) as SubmitResponse;
    },
    onSuccess: (data) => {
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
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger id="wl-country" data-testid="select-waitlist-country">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="wl-city">City</Label>
                  <Input
                    id="wl-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Your city"
                    data-testid="input-waitlist-city"
                  />
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
                <Link href="/login" onClick={close} className="text-primary underline" data-testid="link-waitlist-login">
                  Sign in
                </Link>
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
