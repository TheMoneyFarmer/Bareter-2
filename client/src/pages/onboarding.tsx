import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LOCATIONS, COUNTRIES, getCitiesForCountry } from "@shared/schema";
import { Check, ChevronLeft, ChevronRight, MapPin, Briefcase, Package, Camera, Plus, Trash2 } from "lucide-react";
import type { OfferNeedItem } from "@shared/schema";

const STEPS = [
  { id: 1, title: "Basic Info", icon: Briefcase },
  { id: 2, title: "What You Offer", icon: Package },
  { id: 3, title: "What You Need", icon: Package },
  { id: 4, title: "Profile Photo", icon: Camera },
];

export default function OnboardingPage() {
  const { user, isLoading, refetch } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: "",
    businessName: "",
    location: "",
    country: "AE",
    city: "",
    bio: "",
    whatIOffer: [] as OfferNeedItem[],
    whatINeed: [] as OfferNeedItem[],
    avatarUrl: "",
    portfolioImages: [] as string[],
  });
  const [newOffer, setNewOffer] = useState({ name: "", value: 0, description: "" });
  const [newNeed, setNewNeed] = useState({ name: "", value: 0, description: "" });
  
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  const onboardingMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", "/api/onboarding", data);
      return res.json();
    },
    onSuccess: (data) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      if (data.onboardingCompleted) {
        toast({ title: "Welcome to BarterGram!", description: "Your profile is complete." });
        setLocation("/");
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save progress", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (user) {
      setStep(user.onboardingStep || 1);
      setFormData((prev) => ({
        fullName: user.fullName || prev.fullName,
        businessName: user.businessName || prev.businessName,
        location: user.location || prev.location,
        country: user.country || prev.country || "AE",
        city: user.city || prev.city || "",
        bio: user.bio || prev.bio,
        whatIOffer: (user.whatIOffer as OfferNeedItem[]) || prev.whatIOffer,
        whatINeed: (user.whatINeed as OfferNeedItem[]) || prev.whatINeed,
        avatarUrl: user.avatarUrl || prev.avatarUrl,
        portfolioImages: (user.portfolioImages as string[]) || prev.portfolioImages,
      }));
    }
  }, [user]);

  // IP-based preselect when user has no saved country yet
  useEffect(() => {
    if (!user) return;
    if (user.country) return;
    let cancelled = false;
    fetch("/api/geo/lookup", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((geo) => {
        if (cancelled || !geo?.country) return;
        setFormData((prev) => ({
          ...prev,
          country: prev.country && prev.country !== "AE" ? prev.country : geo.country,
          city: prev.city || geo.city || "",
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleNext = async () => {
    const dataToSave = { step, ...formData };
    onboardingMutation.mutate(dataToSave, {
      onSuccess: () => {
        if (step < 4) {
          setStep(step + 1);
        }
      },
    });
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = () => {
    const dataToSave = { step: 4, ...formData };
    onboardingMutation.mutate(dataToSave);
  };

  const addOffer = () => {
    if (newOffer.name && newOffer.value > 0) {
      setFormData({
        ...formData,
        whatIOffer: [...formData.whatIOffer, newOffer],
      });
      setNewOffer({ name: "", value: 0, description: "" });
    }
  };

  const removeOffer = (index: number) => {
    setFormData({
      ...formData,
      whatIOffer: formData.whatIOffer.filter((_, i) => i !== index),
    });
  };

  const addNeed = () => {
    if (newNeed.name && newNeed.value > 0) {
      setFormData({
        ...formData,
        whatINeed: [...formData.whatINeed, newNeed],
      });
      setNewNeed({ name: "", value: 0, description: "" });
    }
  };

  const removeNeed = (index: number) => {
    setFormData({
      ...formData,
      whatINeed: formData.whatINeed.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  step >= s.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s.id ? <Check className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-1 mx-2 ${step > s.id ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{STEPS[step - 1].title}</CardTitle>
            <CardDescription>
              Step {step} of {STEPS.length}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    data-testid="input-fullname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input
                    id="businessName"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    data-testid="input-businessname"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Select
                      value={formData.country}
                      onValueChange={(value) => setFormData({ ...formData, country: value, city: "", location: "" })}
                    >
                      <SelectTrigger data-testid="select-country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code} data-testid={`option-onb-country-${c.code}`}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Select
                      value={formData.city || formData.location}
                      onValueChange={(value) => setFormData({ ...formData, city: value, location: value })}
                    >
                      <SelectTrigger data-testid="select-city">
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent>
                        {getCitiesForCountry(formData.country).map((city) => (
                          <SelectItem key={city} value={city}>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              {city}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Tell us about your business..."
                    rows={4}
                    data-testid="input-bio"
                  />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-muted-foreground">
                  Add the services or products you offer for barter. Include estimated values in AED.
                </p>
                <div className="space-y-4">
                  {formData.whatIOffer.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">AED {item.value.toLocaleString()}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOffer(index)}
                        data-testid={`button-remove-offer-${index}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 p-4 border rounded-lg">
                  <Input
                    placeholder="What do you offer? (e.g., Web Development)"
                    value={newOffer.name}
                    onChange={(e) => setNewOffer({ ...newOffer, name: e.target.value })}
                    data-testid="input-offer-name"
                  />
                  <Input
                    type="number"
                    placeholder="Value in AED"
                    value={newOffer.value || ""}
                    onChange={(e) => setNewOffer({ ...newOffer, value: parseInt(e.target.value) || 0 })}
                    data-testid="input-offer-value"
                  />
                  <Textarea
                    placeholder="Description (optional)"
                    value={newOffer.description}
                    onChange={(e) => setNewOffer({ ...newOffer, description: e.target.value })}
                    data-testid="input-offer-description"
                  />
                  <Button onClick={addOffer} data-testid="button-add-offer">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Offer
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-muted-foreground">
                  Add what you're looking for in exchange. This helps us match you with the right partners.
                </p>
                <div className="space-y-4">
                  {formData.whatINeed.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">AED {item.value.toLocaleString()}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeNeed(index)}
                        data-testid={`button-remove-need-${index}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 p-4 border rounded-lg">
                  <Input
                    placeholder="What do you need? (e.g., Marketing Services)"
                    value={newNeed.name}
                    onChange={(e) => setNewNeed({ ...newNeed, name: e.target.value })}
                    data-testid="input-need-name"
                  />
                  <Input
                    type="number"
                    placeholder="Budget in AED"
                    value={newNeed.value || ""}
                    onChange={(e) => setNewNeed({ ...newNeed, value: parseInt(e.target.value) || 0 })}
                    data-testid="input-need-value"
                  />
                  <Textarea
                    placeholder="Description (optional)"
                    value={newNeed.description}
                    onChange={(e) => setNewNeed({ ...newNeed, description: e.target.value })}
                    data-testid="input-need-description"
                  />
                  <Button onClick={addNeed} data-testid="button-add-need">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Need
                  </Button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <p className="text-muted-foreground">
                  Add a profile photo and portfolio images to build trust with potential partners.
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Profile Photo URL</Label>
                    <Input
                      placeholder="https://..."
                      value={formData.avatarUrl}
                      onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                      data-testid="input-avatar-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Portfolio Image URLs (one per line)</Label>
                    <Textarea
                      placeholder="https://..."
                      value={formData.portfolioImages.join("\n")}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          portfolioImages: e.target.value.split("\n").filter((url) => url.trim()),
                        })
                      }
                      rows={4}
                      data-testid="input-portfolio-urls"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={step === 1}
                data-testid="button-back"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                {t("onboarding.back")}
              </Button>
              {step < 4 ? (
                <Button onClick={handleNext} disabled={onboardingMutation.isPending} data-testid="button-next">
                  {t("onboarding.next")}
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleComplete} disabled={onboardingMutation.isPending} data-testid="button-finish">
                  {t("onboarding.finish")}
                  <Check className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
