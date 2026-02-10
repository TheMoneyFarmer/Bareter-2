import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Gift,
  Copy,
  Check,
  Users,
  Ticket,
  Send,
  Loader2,
  Share2,
} from "lucide-react";
import { Link } from "wouter";

export function ReferralsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [referralInput, setReferralInput] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: codeData } = useQuery<{ referralCode: string }>({
    queryKey: ["/api/referral/code"],
    enabled: !!user,
  });

  const { data: stats } = useQuery<{
    totalReferrals: number;
    feeWaiversEarned: number;
    feeWaiversPending: number;
  }>({
    queryKey: ["/api/referral/stats"],
    enabled: !!user,
  });

  const { data: waiverData } = useQuery<{ hasWaiver: boolean; waiverCount: number }>({
    queryKey: ["/api/referral/check-waiver"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/referral/check-waiver"] });
      setReferralInput("");
      toast({ title: "Referral Applied", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to apply referral code", variant: "destructive" });
    },
  });

  const copyCode = () => {
    if (codeData?.referralCode) {
      navigator.clipboard.writeText(codeData.referralCode);
      setCopied(true);
      toast({ title: "Copied!", description: "Referral code copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareViaWhatsApp = () => {
    if (codeData?.referralCode) {
      const message = encodeURIComponent(
        `Join BarterGram - the UAE barter marketplace! Use my referral code ${codeData.referralCode} and we both get 1 free deal fee waived. Sign up at ${window.location.origin}/register`
      );
      window.open(`https://wa.me/?text=${message}`, "_blank");
    }
  };

  if (!user) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-4xl text-center">
        <Gift className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Referral Program</h1>
        <p className="text-muted-foreground mb-4">Please log in to access your referral code.</p>
        <Link href="/login">
          <Button data-testid="button-login">Log In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Gift className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Invite & Earn</h1>
          <p className="text-muted-foreground text-sm">
            Invite a hotel, influencer, or business and both get 1 free deal fee waived
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="p-6 text-center">
            <Users className="h-8 w-8 text-primary mx-auto mb-2" />
            <div className="text-3xl font-bold" data-testid="text-total-referrals">{stats?.totalReferrals || 0}</div>
            <p className="text-sm text-muted-foreground">People Invited</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <Ticket className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <div className="text-3xl font-bold" data-testid="text-waivers-available">{waiverData?.waiverCount || 0}</div>
            <p className="text-sm text-muted-foreground">Fee Waivers Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <Check className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <div className="text-3xl font-bold" data-testid="text-waivers-used">{stats?.feeWaiversEarned || 0}</div>
            <p className="text-sm text-muted-foreground">Waivers Used</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Your Referral Code
            </CardTitle>
            <CardDescription>
              Share this code with hotels, influencers, or businesses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-md px-4 py-3 font-mono text-lg tracking-wider text-center" data-testid="text-referral-code">
                {codeData?.referralCode || "Loading..."}
              </div>
              <Button size="icon" variant="outline" onClick={copyCode} data-testid="button-copy-code">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={shareViaWhatsApp} className="w-full gap-2" variant="outline" data-testid="button-share-whatsapp">
              <Send className="h-4 w-4" />
              Share via WhatsApp
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Have a Referral Code?
            </CardTitle>
            <CardDescription>
              Enter a referral code from someone who invited you
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.referredBy ? (
              <div className="text-center py-4">
                <Badge variant="secondary" className="mb-2">Already Applied</Badge>
                <p className="text-sm text-muted-foreground">
                  You've already used a referral code
                </p>
              </div>
            ) : (
              <>
                <Input
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value)}
                  placeholder="Enter referral code (e.g., BG-XXXX)"
                  data-testid="input-referral-code"
                />
                <Button
                  onClick={() => applyMutation.mutate(referralInput)}
                  disabled={!referralInput || applyMutation.isPending}
                  className="w-full gap-2"
                  data-testid="button-apply-referral"
                >
                  {applyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Apply Referral Code
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">How It Works</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <span className="font-bold text-primary">1</span>
              </div>
              <h4 className="font-medium mb-1">Share Your Code</h4>
              <p className="text-sm text-muted-foreground">Send your referral code to a hotel, influencer, or business</p>
            </div>
            <div className="text-center">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <span className="font-bold text-primary">2</span>
              </div>
              <h4 className="font-medium mb-1">They Join</h4>
              <p className="text-sm text-muted-foreground">They sign up and enter your referral code</p>
            </div>
            <div className="text-center">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <span className="font-bold text-primary">3</span>
              </div>
              <h4 className="font-medium mb-1">Both Get Rewarded</h4>
              <p className="text-sm text-muted-foreground">You both get 1 free deal fee waived (save up to AED 100+)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}