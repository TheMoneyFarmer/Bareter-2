import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Settings,
  Globe,
  Megaphone,
  Type,
  HelpCircle,
  Mail,
  Phone,
  MapPin,
  Shield,
  Rocket,
  Save,
  AlertTriangle,
  Plus,
  Trash2,
  ListOrdered,
  Users,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

type PlatformSettings = Record<string, string | null>;

type HowItWorksStep = { n: number; emoji: string; title: string; desc: string };
type FaqEntry = { category: string; questions: { q: string; a: string }[] };

const ALL_EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "RAK", "Fujairah", "Umm Al Quwain"];

export function AdminPlatformSettings() {
  const { toast } = useToast();
  const [settingsTab, setSettingsTab] = useState("general");

  const { data: settings, isLoading } = useQuery<PlatformSettings>({
    queryKey: ["/api/admin/settings/platform"],
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const res = await apiRequest("PUT", "/api/admin/settings/platform", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/platform"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      toast({ title: "Saved", description: "Platform settings updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    },
  });

  const launchEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/waitlist/launch-email");
      return res.json();
    },
    onSuccess: (data: { sent: number; failed: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/platform"] });
      toast({
        title: "Launch emails sent",
        description: `Sent: ${data.sent}, Failed: ${data.failed}, Total eligible: ${data.total}`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send launch emails", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i}><CardContent className="p-6"><div className="h-20 bg-muted/60 animate-pulse rounded" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Platform Settings</h2>
        <p className="text-muted-foreground">Configure platform behavior, content, and feature flags</p>
      </div>

      <Tabs value={settingsTab} onValueChange={setSettingsTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general" data-testid="tab-settings-general">
            <Settings className="h-4 w-4 mr-1.5" />General
          </TabsTrigger>
          <TabsTrigger value="cms" data-testid="tab-settings-cms">
            <Type className="h-4 w-4 mr-1.5" />Content (CMS)
          </TabsTrigger>
          <TabsTrigger value="limits" data-testid="tab-settings-limits">
            <ListOrdered className="h-4 w-4 mr-1.5" />Limits
          </TabsTrigger>
          <TabsTrigger value="contact" data-testid="tab-settings-contact">
            <Mail className="h-4 w-4 mr-1.5" />Contact
          </TabsTrigger>
          <TabsTrigger value="waitlist" data-testid="tab-settings-waitlist">
            <Rocket className="h-4 w-4 mr-1.5" />Waitlist
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettings settings={settings || {}} onSave={(u) => saveMutation.mutate(u)} saving={saveMutation.isPending} />
        </TabsContent>
        <TabsContent value="cms">
          <CMSSettings settings={settings || {}} onSave={(u) => saveMutation.mutate(u)} saving={saveMutation.isPending} />
        </TabsContent>
        <TabsContent value="limits">
          <LimitsSettings settings={settings || {}} onSave={(u) => saveMutation.mutate(u)} saving={saveMutation.isPending} />
        </TabsContent>
        <TabsContent value="contact">
          <ContactSettings settings={settings || {}} onSave={(u) => saveMutation.mutate(u)} saving={saveMutation.isPending} />
        </TabsContent>
        <TabsContent value="waitlist">
          <WaitlistSettings
            settings={settings || {}}
            onLaunchEmail={() => launchEmailMutation.mutate()}
            launchEmailPending={launchEmailMutation.isPending}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralSettings({ settings, onSave, saving }: { settings: PlatformSettings; onSave: (u: Record<string, string>) => void; saving: boolean }) {
  const [maintenanceMode, setMaintenanceMode] = useState(settings.maintenance_mode === "true");
  const [registrationEnabled, setRegistrationEnabled] = useState(settings.registration_enabled !== "false");
  const [inviteOnly, setInviteOnly] = useState(settings.invite_only_mode === "true");
  const [bannerEnabled, setBannerEnabled] = useState(settings.announcement_banner_enabled === "true");
  const [bannerText, setBannerText] = useState(settings.announcement_banner_text || "");
  const [bannerLink, setBannerLink] = useState(settings.announcement_banner_link || "");
  const [maintenanceMessage, setMaintenanceMessage] = useState(settings.maintenance_message || "");

  useEffect(() => {
    setMaintenanceMode(settings.maintenance_mode === "true");
    setRegistrationEnabled(settings.registration_enabled !== "false");
    setInviteOnly(settings.invite_only_mode === "true");
    setBannerEnabled(settings.announcement_banner_enabled === "true");
    setBannerText(settings.announcement_banner_text || "");
    setBannerLink(settings.announcement_banner_link || "");
    setMaintenanceMessage(settings.maintenance_message || "");
  }, [settings]);

  const handleSave = () => {
    onSave({
      maintenance_mode: maintenanceMode ? "true" : "false",
      maintenance_message: maintenanceMessage,
      registration_enabled: registrationEnabled ? "true" : "false",
      invite_only_mode: inviteOnly ? "true" : "false",
      announcement_banner_enabled: bannerEnabled ? "true" : "false",
      announcement_banner_text: bannerText,
      announcement_banner_link: bannerLink,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Feature Flags
          </CardTitle>
          <CardDescription>Control platform-wide behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Maintenance Mode
              </p>
              <p className="text-sm text-muted-foreground">
                When enabled, all non-admin API routes return 503. The site shows a maintenance page.
              </p>
            </div>
            <Switch
              checked={maintenanceMode}
              onCheckedChange={setMaintenanceMode}
              data-testid="switch-maintenance-mode"
            />
          </div>
          {maintenanceMode && (
            <div className="ml-6 border-l-2 border-destructive/30 pl-4">
              <Label htmlFor="maintenance-message">Maintenance Message</Label>
              <Input
                id="maintenance-message"
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="We'll be back soon! We're performing scheduled maintenance."
                className="mt-1.5"
                data-testid="input-maintenance-message"
              />
              <p className="text-xs text-muted-foreground mt-1">Custom message shown on the maintenance page</p>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Registration Enabled</p>
              <p className="text-sm text-muted-foreground">Allow new users to register on the platform</p>
            </div>
            <Switch
              checked={registrationEnabled}
              onCheckedChange={setRegistrationEnabled}
              data-testid="switch-registration-enabled"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Invite-Only Mode</p>
              <p className="text-sm text-muted-foreground">
                Only users who are on the waitlist can register
              </p>
            </div>
            <Switch
              checked={inviteOnly}
              onCheckedChange={setInviteOnly}
              data-testid="switch-invite-only"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Announcement Banner
          </CardTitle>
          <CardDescription>Display a site-wide announcement banner at the top of every page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="banner-enabled">Banner Enabled</Label>
            <Switch
              id="banner-enabled"
              checked={bannerEnabled}
              onCheckedChange={setBannerEnabled}
              data-testid="switch-banner-enabled"
            />
          </div>
          <div>
            <Label htmlFor="banner-text">Banner Text</Label>
            <Input
              id="banner-text"
              value={bannerText}
              onChange={(e) => setBannerText(e.target.value)}
              placeholder="e.g. We're launching soon! Join the waitlist."
              className="mt-1.5"
              data-testid="input-banner-text"
            />
          </div>
          <div>
            <Label htmlFor="banner-link">Banner Link (optional)</Label>
            <Input
              id="banner-link"
              value={bannerLink}
              onChange={(e) => setBannerLink(e.target.value)}
              placeholder="e.g. /pricing or https://..."
              className="mt-1.5"
              data-testid="input-banner-link"
            />
            <p className="text-xs text-muted-foreground mt-1">Optional URL - makes the banner text clickable</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2" data-testid="button-save-general">
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save General Settings"}
      </Button>
    </div>
  );
}

function CMSSettings({ settings, onSave, saving }: { settings: PlatformSettings; onSave: (u: Record<string, string>) => void; saving: boolean }) {
  const [headline, setHeadline] = useState(settings.hero_headline || "");
  const [tagline, setTagline] = useState(settings.hero_tagline || "");
  const [ctaText, setCtaText] = useState(settings.hero_cta || "");
  const [steps, setSteps] = useState<HowItWorksStep[]>(() => {
    try {
      return settings.how_it_works_steps ? JSON.parse(settings.how_it_works_steps) : [];
    } catch { return []; }
  });
  const [faqEntries, setFaqEntries] = useState<FaqEntry[]>(() => {
    try {
      return settings.faq_entries ? JSON.parse(settings.faq_entries) : [];
    } catch { return []; }
  });

  useEffect(() => {
    setHeadline(settings.hero_headline || "");
    setTagline(settings.hero_tagline || "");
    setCtaText(settings.hero_cta || "");
    try { setSteps(settings.how_it_works_steps ? JSON.parse(settings.how_it_works_steps) : []); } catch { setSteps([]); }
    try { setFaqEntries(settings.faq_entries ? JSON.parse(settings.faq_entries) : []); } catch { setFaqEntries([]); }
  }, [settings]);

  const handleSave = () => {
    const updates: Record<string, string> = {
      hero_headline: headline,
      hero_tagline: tagline,
      hero_cta: ctaText,
      how_it_works_steps: steps.length > 0 ? JSON.stringify(steps) : "",
      faq_entries: faqEntries.length > 0 ? JSON.stringify(faqEntries) : "",
    };
    onSave(updates);
  };

  const addStep = () => {
    setSteps([...steps, { n: steps.length + 1, emoji: "📋", title: "", desc: "" }]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, n: i + 1 })));
  };

  const updateStep = (index: number, field: keyof HowItWorksStep, value: string | number) => {
    setSteps(steps.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const addFaqCategory = () => {
    setFaqEntries([...faqEntries, { category: "New Category", questions: [] }]);
  };

  const removeFaqCategory = (index: number) => {
    setFaqEntries(faqEntries.filter((_, i) => i !== index));
  };

  const addFaqQuestion = (catIndex: number) => {
    setFaqEntries(faqEntries.map((c, i) =>
      i === catIndex ? { ...c, questions: [...c.questions, { q: "", a: "" }] } : c
    ));
  };

  const removeFaqQuestion = (catIndex: number, qIndex: number) => {
    setFaqEntries(faqEntries.map((c, i) =>
      i === catIndex ? { ...c, questions: c.questions.filter((_, j) => j !== qIndex) } : c
    ));
  };

  const updateFaqCategory = (catIndex: number, value: string) => {
    setFaqEntries(faqEntries.map((c, i) => i === catIndex ? { ...c, category: value } : c));
  };

  const updateFaqQuestion = (catIndex: number, qIndex: number, field: "q" | "a", value: string) => {
    setFaqEntries(faqEntries.map((c, ci) =>
      ci === catIndex ? {
        ...c,
        questions: c.questions.map((q, qi) => qi === qIndex ? { ...q, [field]: value } : q),
      } : c
    ));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Hero Section</CardTitle>
          <CardDescription>Edit the landing page headline and tagline. Leave blank to use defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="hero-headline">Headline</Label>
            <Input
              id="hero-headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Barter what you have for what you need."
              className="mt-1.5"
              data-testid="input-hero-headline"
            />
          </div>
          <div>
            <Label htmlFor="hero-tagline">Tagline</Label>
            <Input
              id="hero-tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="UAE's AI-powered barter marketplace. No cash. Just value."
              className="mt-1.5"
              data-testid="input-hero-tagline"
            />
          </div>
          <div>
            <Label htmlFor="hero-cta">CTA Button Text</Label>
            <Input
              id="hero-cta"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="Start Bartering"
              className="mt-1.5"
              data-testid="input-hero-cta"
            />
            <p className="text-xs text-muted-foreground mt-1">Leave blank to use the default button label</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>How It Works Steps</span>
            <Button variant="outline" size="sm" onClick={addStep} className="gap-1" data-testid="button-add-step">
              <Plus className="h-3.5 w-3.5" />Add Step
            </Button>
          </CardTitle>
          <CardDescription>Edit the "How it works" steps on the landing page. Leave empty to use defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {steps.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom steps — using default 3-step flow
            </p>
          )}
          {steps.map((step, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">Step {step.n}</Badge>
                <Button variant="ghost" size="icon" onClick={() => removeStep(i)} data-testid={`button-remove-step-${i}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Emoji</Label>
                  <Input value={step.emoji} onChange={(e) => updateStep(i, "emoji", e.target.value)} className="mt-1" data-testid={`input-step-emoji-${i}`} />
                </div>
                <div>
                  <Label>Title</Label>
                  <Input value={step.title} onChange={(e) => updateStep(i, "title", e.target.value)} className="mt-1" data-testid={`input-step-title-${i}`} />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input value={step.desc} onChange={(e) => updateStep(i, "desc", e.target.value)} className="mt-1" data-testid={`input-step-desc-${i}`} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><HelpCircle className="h-5 w-5" />FAQ Editor</span>
            <Button variant="outline" size="sm" onClick={addFaqCategory} className="gap-1" data-testid="button-add-faq-category">
              <Plus className="h-3.5 w-3.5" />Add Category
            </Button>
          </CardTitle>
          <CardDescription>Edit FAQ categories and questions. Leave empty to use default FAQs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {faqEntries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom FAQ entries — using hardcoded defaults
            </p>
          )}
          {faqEntries.map((cat, ci) => (
            <div key={ci} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <Label>Category Name</Label>
                  <Input
                    value={cat.category}
                    onChange={(e) => updateFaqCategory(ci, e.target.value)}
                    className="mt-1"
                    data-testid={`input-faq-category-${ci}`}
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeFaqCategory(ci)} data-testid={`button-remove-faq-category-${ci}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              {cat.questions.map((q, qi) => (
                <div key={qi} className="ml-4 border-l-2 border-muted pl-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={q.q}
                        onChange={(e) => updateFaqQuestion(ci, qi, "q", e.target.value)}
                        placeholder="Question"
                        data-testid={`input-faq-q-${ci}-${qi}`}
                      />
                      <Textarea
                        value={q.a}
                        onChange={(e) => updateFaqQuestion(ci, qi, "a", e.target.value)}
                        placeholder="Answer"
                        rows={2}
                        data-testid={`input-faq-a-${ci}-${qi}`}
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeFaqQuestion(ci, qi)} data-testid={`button-remove-faq-q-${ci}-${qi}`}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => addFaqQuestion(ci)} className="ml-4 gap-1" data-testid={`button-add-faq-q-${ci}`}>
                <Plus className="h-3.5 w-3.5" />Add Question
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2" data-testid="button-save-cms">
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save CMS Content"}
      </Button>
    </div>
  );
}

function LimitsSettings({ settings, onSave, saving }: { settings: PlatformSettings; onSave: (u: Record<string, string>) => void; saving: boolean }) {
  const [highValue, setHighValue] = useState(settings.high_value_threshold || "50000");
  const [maxListings, setMaxListings] = useState(settings.max_listings_per_user || "0");
  const [activeEmirates, setActiveEmirates] = useState<string[]>(() => {
    try {
      return settings.active_emirates ? JSON.parse(settings.active_emirates) : ALL_EMIRATES;
    } catch { return ALL_EMIRATES; }
  });

  useEffect(() => {
    setHighValue(settings.high_value_threshold || "50000");
    setMaxListings(settings.max_listings_per_user || "0");
    try { setActiveEmirates(settings.active_emirates ? JSON.parse(settings.active_emirates) : ALL_EMIRATES); } catch { setActiveEmirates(ALL_EMIRATES); }
  }, [settings]);

  const toggleEmirate = (emirate: string) => {
    setActiveEmirates(prev =>
      prev.includes(emirate)
        ? prev.filter(e => e !== emirate)
        : [...prev, emirate]
    );
  };

  const handleSave = () => {
    onSave({
      high_value_threshold: highValue,
      max_listings_per_user: maxListings,
      active_emirates: JSON.stringify(activeEmirates),
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Listing Limits</CardTitle>
          <CardDescription>Control listing creation limits and thresholds</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="high-value">High-Value Threshold (AED)</Label>
            <p className="text-sm text-muted-foreground mb-1.5">Listings above this value are flagged for extra review</p>
            <Input
              id="high-value"
              type="number"
              value={highValue}
              onChange={(e) => setHighValue(e.target.value)}
              placeholder="50000"
              className="max-w-xs"
              data-testid="input-high-value-threshold"
            />
          </div>
          <Separator />
          <div>
            <Label htmlFor="max-listings">Max Listings Per User</Label>
            <p className="text-sm text-muted-foreground mb-1.5">Set to 0 for unlimited</p>
            <Input
              id="max-listings"
              type="number"
              value={maxListings}
              onChange={(e) => setMaxListings(e.target.value)}
              placeholder="0"
              className="max-w-xs"
              data-testid="input-max-listings"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Active Emirates
          </CardTitle>
          <CardDescription>Select which emirates are active on the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ALL_EMIRATES.map(emirate => (
              <Button
                key={emirate}
                variant={activeEmirates.includes(emirate) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleEmirate(emirate)}
                data-testid={`button-emirate-${emirate.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {activeEmirates.includes(emirate) && <MapPin className="h-3.5 w-3.5 mr-1" />}
                {emirate}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2" data-testid="button-save-limits">
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save Limits"}
      </Button>
    </div>
  );
}

function ContactSettings({ settings, onSave, saving }: { settings: PlatformSettings; onSave: (u: Record<string, string>) => void; saving: boolean }) {
  const [contactEmail, setContactEmail] = useState(settings.contact_email || "");
  const [supportEmail, setSupportEmail] = useState(settings.support_email || "");
  const [supportPhone, setSupportPhone] = useState(settings.support_phone || "");

  useEffect(() => {
    setContactEmail(settings.contact_email || "");
    setSupportEmail(settings.support_email || "");
    setSupportPhone(settings.support_phone || "");
  }, [settings]);

  const handleSave = () => {
    onSave({
      contact_email: contactEmail,
      support_email: supportEmail,
      support_phone: supportPhone,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Contact & Support
          </CardTitle>
          <CardDescription>Configure contact information displayed across the site. Leave blank to use defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="contact-email">Contact Email</Label>
            <Input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="hello@bareter.com"
              className="mt-1.5 max-w-md"
              data-testid="input-contact-email"
            />
          </div>
          <div>
            <Label htmlFor="support-email">Support Email</Label>
            <Input
              id="support-email"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@bareter.com"
              className="mt-1.5 max-w-md"
              data-testid="input-support-email"
            />
          </div>
          <div>
            <Label htmlFor="support-phone">Support Phone</Label>
            <Input
              id="support-phone"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="+971 52 313 3512"
              className="mt-1.5 max-w-md"
              data-testid="input-support-phone"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2" data-testid="button-save-contact">
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save Contact Info"}
      </Button>
    </div>
  );
}

function WaitlistSettings({ settings, onLaunchEmail, launchEmailPending }: {
  settings: PlatformSettings;
  onLaunchEmail: () => void;
  launchEmailPending: boolean;
}) {
  const lastSent = settings.waitlist_launch_email_sent_at;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Launch Email
          </CardTitle>
          <CardDescription>
            Send a launch notification email to all confirmed waitlist entries who haven't yet registered.
            This is a one-time action — use with care.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastSent && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">Last sent: {new Date(lastSent).toLocaleString()}</Badge>
            </div>
          )}
          <Button
            onClick={onLaunchEmail}
            disabled={launchEmailPending}
            variant="default"
            className="gap-2"
            data-testid="button-send-launch-email"
          >
            <Rocket className="h-4 w-4" />
            {launchEmailPending ? "Sending..." : "Send Launch Emails"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
