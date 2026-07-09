import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BackButton } from "@/components/BackButton";
import {
  Gift, Copy, Check, Users, Share2, Loader2,
  Sparkles, ShieldCheck, PartyPopper, ArrowRight,
  Clock, ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

export function ReferralsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [referralInput, setReferralInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const { data: codeData, isLoading: codeLoading } = useQuery<{ referralCode: string }>({
    queryKey: ["/api/referral/code"],
    enabled: !!user,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalReferrals: number;
    feeWaiversEarned: number;
    feeWaiversPending: number;
    referrals: Array<{ referrerId: string; referredId: string; createdAt: string; referrerFeeWaived: boolean }>;
  }>({
    queryKey: ["/api/referral/stats"],
    enabled: !!user,
  });

  const applyMutation = useMutation({
    mutationFn: async (referralCode: string) => {
      const res = await apiRequest("POST", "/api/referral/apply", { referralCode });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral"] });
      queryClient.invalidateQueries({ queryKey: ["/api/referral/stats"] });
      setReferralInput("");
      toast({ title: "Referral applied!", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Invalid code", description: error.message || "Could not apply this referral code.", variant: "destructive" });
    },
  });

  const inviteLink = codeData?.referralCode
    ? `${window.location.origin}/register?ref=${codeData.referralCode}`
    : "";

  const shareText = codeData?.referralCode
    ? `Join me on Bareter — the UAE barter marketplace where businesses trade goods and services without cash. Sign up with my invite link and your first deal fee is on us 🎉\n${inviteLink}`
    : "";

  const copyCode = () => {
    if (!codeData?.referralCode) return;
    navigator.clipboard.writeText(codeData.referralCode);
    setCopiedCode(true);
    toast({ title: "Code copied!" });
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    toast({ title: "Invite link copied!" });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const shareNative = async () => {
    if (!shareText) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join me on Bareter", text: shareText, url: inviteLink });
      } else {
        await navigator.clipboard.writeText(shareText);
        toast({ title: "Copied!", description: "Paste it anywhere to invite friends." });
      }
    } catch {}
  };

  if (!user) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-md text-center">
        <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Gift className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Invite & Earn</h1>
        <p className="text-muted-foreground mb-6">Log in to get your personal invite link and start growing your network.</p>
        <Link href="/login">
          <Button className="w-full">Log In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto max-w-xl bareter-slide-in">
      <BackButton fallback="/profile" label="Back" className="mb-5" />

      {/* Hero */}
      <div className="text-center mb-8">
        <div className="h-16 w-16 rounded-2xl bg-bareter-teal/10 flex items-center justify-center mx-auto mb-4">
          <Gift className="h-8 w-8 text-bareter-teal" />
        </div>
        <h1 className="text-2xl font-bold mb-1">Invite & Earn</h1>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          Invite businesses, creators, or friends — when they join, both of you get your first deal fee waived.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Invited", value: stats?.totalReferrals, icon: <Users className="h-4 w-4 text-bareter-teal" /> },
          { label: "Fees Waived", value: stats?.feeWaiversEarned, icon: <ShieldCheck className="h-4 w-4 text-green-500" /> },
          { label: "Pending", value: stats?.feeWaiversPending, icon: <Clock className="h-4 w-4 text-amber-500" /> },
        ].map(({ label, value, icon }) => (
          <Card key={label} className="border-bareter-border">
            <CardContent className="p-3 text-center">
              <div className="flex justify-center mb-1">{icon}</div>
              {statsLoading
                ? <Skeleton className="h-7 w-8 mx-auto mb-1" />
                : <div className="text-2xl font-bold">{value ?? 0}</div>}
              <p className="text-[11px] text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invite link + share */}
      <Card className="mb-4 border-bareter-border shadow-bareter-card">
        <CardContent className="p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Your invite link</p>

          {/* Link row */}
          <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
            <span className="text-xs text-muted-foreground truncate flex-1 font-mono">
              {codeLoading ? "Generating…" : inviteLink}
            </span>
            <button type="button" onClick={copyLink} className="shrink-0 text-muted-foreground hover:text-bareter-teal transition-colors">
              {copiedLink ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          {/* Code row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Code:</span>
              <span className="font-mono font-bold text-foreground tracking-widest">
                {codeLoading ? "—" : codeData?.referralCode}
              </span>
            </div>
            <button type="button" onClick={copyCode} className="text-muted-foreground hover:text-bareter-teal transition-colors">
              {copiedCode ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          {/* Share button */}
          <Button className="w-full gap-2 bg-bareter-teal hover:bg-bareter-teal/90 text-white" onClick={shareNative} disabled={!inviteLink}>
            <Share2 className="h-4 w-4" />
            Share Invite Link
          </Button>
        </CardContent>
      </Card>

      {/* Have a code */}
      <Card className="mb-6 border-bareter-border">
        <CardContent className="p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Enter a code you received</p>
          {user.referredBy ? (
            <div className="flex items-center gap-2 py-2">
              <ShieldCheck className="h-5 w-5 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold">Referral code applied</p>
                <p className="text-xs text-muted-foreground">Your first deal fee will be waived.</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={referralInput}
                onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                placeholder="e.g. BG-XXXX"
                className="font-mono tracking-widest"
                maxLength={16}
              />
              <Button
                onClick={() => applyMutation.mutate(referralInput)}
                disabled={referralInput.length < 4 || applyMutation.isPending}
                className="shrink-0"
              >
                {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent referrals */}
      {(stats?.referrals?.filter(r => r.referrerId === user.id) ?? []).length > 0 && (
        <Card className="mb-6 border-bareter-border">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">People you invited</p>
            <div className="space-y-2">
              {stats!.referrals.filter(r => r.referrerId === user.id).slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-bareter-teal/10 flex items-center justify-center">
                      <Users className="h-3.5 w-3.5 text-bareter-teal" />
                    </div>
                    <span className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  {r.referrerFeeWaived
                    ? <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Fee waived</Badge>
                    : <Badge variant="outline" className="text-[10px]">Pending</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <div className="rounded-2xl bg-bareter-teal/5 border border-bareter-teal/20 p-5">
        <p className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-bareter-teal" />
          How it works
        </p>
        <div className="space-y-3">
          {[
            { icon: <Share2 className="h-4 w-4 text-bareter-teal" />, title: "Share your link", desc: "Send your invite link to anyone — businesses, creators, or friends." },
            { icon: <Users className="h-4 w-4 text-bareter-teal" />, title: "They join Bareter", desc: "They sign up using your link. No code entry needed — it's automatic." },
            { icon: <PartyPopper className="h-4 w-4 text-bareter-teal" />, title: "Both get a fee waiver", desc: "You and your invitee each get your first deal fee waived. No strings." },
          ].map(({ icon, title, desc }, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-8 w-8 rounded-lg bg-white dark:bg-background border border-bareter-teal/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                {icon}
              </div>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
