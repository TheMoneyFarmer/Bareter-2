import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { trackEvent } from "@/lib/posthog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CATEGORIES, LOCATIONS, COUNTRIES, getCitiesForCountry, ExchangeItem } from "@shared/schema";
import AiValuationPanel from "@/components/ai-valuation-panel";
import {
  Package,
  ShoppingCart,
  Loader2,
  X,
  Plus,
  ImagePlus,
  Tag,
  MapPin,
  DollarSign,
  FileText,
  ArrowLeftRight,
  Star,
  Sparkles,
  Upload,
  Settings2,
} from "lucide-react";
import { z } from "zod";

const exchangeItemSchema = z.object({
  name: z.string(),
  isPriority: z.boolean(),
});

function makeCreateListingSchema(t: (key: string) => string) {
  return z.object({
    type: z.enum(["offer", "request"]),
    title: z.string().min(5, t("create.validation.titleMin")),
    description: z.string().min(20, t("create.validation.descMin")),
    categories: z.array(z.string()).min(1, t("create.validation.categoryMin")),
    retailValue: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: t("create.validation.valueInvalid"),
    }),
    location: z.string().min(1, t("create.validation.locationRequired")),
    country: z.string().length(2).optional(),
    city: z.string().optional(),
    tags: z.array(z.string()).optional(),
    images: z.array(z.string()).min(3, t("create.validation.imagesMin")),
    wantedCategories: z.array(z.string()).optional(),
    exchangeItems: z.array(exchangeItemSchema).optional(),
    openToOffers: z.boolean().optional(),
  });
}

type CreateListingForm = z.infer<ReturnType<typeof makeCreateListingSchema>>;

export function CreateListingPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [newTag, setNewTag] = useState("");
  const [newExchangeItem, setNewExchangeItem] = useState("");
  const [newItemPriority, setNewItemPriority] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [categoryDetails, setCategoryDetails] = useState<Record<string, string | number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<CreateListingForm>({
    resolver: zodResolver(makeCreateListingSchema(t)),
    defaultValues: {
      type: "offer",
      title: "",
      description: "",
      categories: [],
      retailValue: "",
      location: user?.location || "",
      country: user?.country || "AE",
      city: user?.city || "",
      tags: [],
      images: [],
      wantedCategories: [],
      exchangeItems: [],
      openToOffers: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateListingForm) => {
      const res = await apiRequest("POST", "/api/listings", {
        ...data,
        retailValue: data.retailValue,
        categoryDetails: Object.keys(categoryDetails).length > 0 ? categoryDetails : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      trackEvent("listing_created", {
        listing_id: data.id,
        listing_category: (data.categories || [])[0],
        listing_value: data.retailValue ? parseFloat(data.retailValue) : undefined,
      });
      toast({
        title: t("create.successTitle"),
        description: t("create.successDesc"),
      });
      navigate(`/listings/${data.id}`);
    },
    onError: (error: any) => {
      toast({
        title: t("create.failedTitle"),
        description: error.message || t("common.somethingWentWrong"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateListingForm) => {
    createMutation.mutate(data);
  };

  // Autosave: debounce form changes and POST to /api/listing-drafts.
  const draftIdRef = useRef<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [resumeChoice, setResumeChoice] = useState<null | { id: string; data: Record<string, unknown>; title: string | null }>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const draftId = params.get("draft");
    type DraftRow = { id: string; data: Record<string, unknown>; title: string | null };
    apiRequest("GET", `/api/listing-drafts`).then(r => r.json()).then((rows: DraftRow[]) => {
      if (draftId) {
        const found = rows?.find((r) => r.id === draftId);
        if (found?.data) {
          draftIdRef.current = found.id;
          try { form.reset(found.data as unknown as CreateListingForm); } catch { /* ignore shape drift */ }
        }
        setDraftLoaded(true);
        return;
      }
      const candidate = rows?.[0];
      if (candidate && candidate.data) {
        setResumeChoice({ id: candidate.id, data: candidate.data, title: candidate.title ?? null });
      } else {
        setDraftLoaded(true);
      }
    }).catch(() => setDraftLoaded(true));
  }, []);

  // Held in a ref so each keystroke cancels the prior pending save.
  const autosaveTimerRef = useRef<number | null>(null);
  const saveDraftNow = async (values: Partial<CreateListingForm>) => {
    const hasContent = (values.title && values.title.length > 0) || (values.description && values.description.length > 0);
    if (!hasContent) return;
    setDraftSaving(true);
    try {
      const res = await apiRequest("POST", "/api/listing-drafts", {
        id: draftIdRef.current ?? undefined,
        title: values.title || null,
        data: values,
      });
      const saved = await res.json();
      if (saved?.id) draftIdRef.current = saved.id;
      setDraftSavedAt(new Date());
    } catch (err) {
      console.warn("[autosave] draft save failed:", err);
    } finally {
      setDraftSaving(false);
    }
  };
  useEffect(() => {
    if (!user || !draftLoaded) return;
    const sub = form.watch((values) => {
      if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = window.setTimeout(() => {
        autosaveTimerRef.current = null;
        saveDraftNow(values as Partial<CreateListingForm>);
      }, 1500);
    });
    return () => {
      sub.unsubscribe();
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [form, user, draftLoaded]);
  // Flush pending autosave on field blur so leaving a field guarantees a save.
  const flushAutosave = () => {
    if (!user || !draftLoaded) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    saveDraftNow(form.getValues() as Partial<CreateListingForm>);
  };

  const acceptResume = () => {
    if (!resumeChoice) return;
    draftIdRef.current = resumeChoice.id;
    try { form.reset(resumeChoice.data as unknown as CreateListingForm); } catch { /* ignore shape drift */ }
    setResumeChoice(null);
    setDraftLoaded(true);
  };
  const declineResume = () => {
    if (resumeChoice?.id) {
      apiRequest("DELETE", `/api/listing-drafts/${resumeChoice.id}`).catch(() => {});
    }
    setResumeChoice(null);
    setDraftLoaded(true);
  };

  // Once the listing is created successfully, drop the draft so it
  // doesn't keep nagging the user from the Drafts tab.
  useEffect(() => {
    if (createMutation.isSuccess && draftIdRef.current) {
      apiRequest("DELETE", `/api/listing-drafts/${draftIdRef.current}`).catch(() => {});
      draftIdRef.current = null;
    }
  }, [createMutation.isSuccess]);

  const toggleCategory = (category: string) => {
    const current = form.getValues("categories");
    if (current.includes(category)) {
      form.setValue("categories", current.filter((c) => c !== category));
    } else {
      form.setValue("categories", [...current, category]);
    }
  };

  const toggleWantedCategory = (category: string) => {
    const current = form.getValues("wantedCategories") || [];
    if (current.includes(category)) {
      form.setValue("wantedCategories", current.filter((c) => c !== category));
    } else {
      form.setValue("wantedCategories", [...current, category]);
    }
  };

  const addTag = () => {
    if (newTag.trim()) {
      const current = form.getValues("tags") || [];
      if (!current.includes(newTag.trim())) {
        form.setValue("tags", [...current, newTag.trim()]);
      }
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    const current = form.getValues("tags") || [];
    form.setValue("tags", current.filter((t) => t !== tag));
  };

  const addExchangeItem = () => {
    if (newExchangeItem.trim()) {
      const current = form.getValues("exchangeItems") || [];
      const exists = current.some((item) => item.name.toLowerCase() === newExchangeItem.trim().toLowerCase());
      if (!exists) {
        form.setValue("exchangeItems", [
          ...current,
          { name: newExchangeItem.trim(), isPriority: newItemPriority },
        ]);
      }
      setNewExchangeItem("");
      setNewItemPriority(false);
    }
  };

  const removeExchangeItem = (name: string) => {
    const current = form.getValues("exchangeItems") || [];
    form.setValue("exchangeItems", current.filter((item) => item.name !== name));
  };

  const toggleItemPriority = (name: string) => {
    const current = form.getValues("exchangeItems") || [];
    form.setValue(
      "exchangeItems",
      current.map((item) =>
        item.name === name ? { ...item, isPriority: !item.isPriority } : item
      )
    );
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploadingImages(true);
    const currentImages = form.getValues("images") || [];

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        if (!file.type.startsWith("image/")) {
          throw new Error(`${file.name} is not an image file`);
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`${file.name} exceeds 5MB limit`);
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "listing");

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Upload failed");
        }

        const data = await res.json();
        return data.url as string;
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      form.setValue("images", [...currentImages, ...uploadedUrls], { shouldValidate: true });
    } catch (error: any) {
      toast({
        title: t("create.uploadFailed"),
        description: error.message || t("create.uploadImageError"),
        variant: "destructive",
      });
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    const current = form.getValues("images") || [];
    form.setValue("images", current.filter((_, i) => i !== index), { shouldValidate: true });
  };

  const selectedType = form.watch("type");
  const selectedCategories = form.watch("categories");
  const wantedCategories = form.watch("wantedCategories") || [];
  const exchangeItems = form.watch("exchangeItems") || [];
  const tags = form.watch("tags") || [];
  const images = form.watch("images") || [];
  const openToOffers = form.watch("openToOffers");
  const retailValueWatch = form.watch("retailValue");
  const titleWatch = form.watch("title");
  const descriptionWatch = form.watch("description");

  const { data: marketAverages } = useQuery<Record<string, number>>({
    queryKey: ["/api/market-average", selectedCategories],
    queryFn: async () => {
      if (!selectedCategories || selectedCategories.length === 0) return {};
      const cats = selectedCategories.join(",");
      const res = await fetch(`/api/market-average?categories=${encodeURIComponent(cats)}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: (selectedCategories || []).length > 0,
  });

  const marketAvgValue = marketAverages ? Object.values(marketAverages).reduce((sum, v) => sum + v, 0) / Math.max(Object.values(marketAverages).length, 1) : null;
  const enteredValue = parseFloat(retailValueWatch);
  const isLowValue = marketAvgValue && !isNaN(enteredValue) && enteredValue > 0 && enteredValue < marketAvgValue * 0.3;

  const priorityItems = exchangeItems.filter((item) => item.isPriority);
  const otherItems = exchangeItems.filter((item) => !item.isPriority);

  if (!user) {
    return (
      <div className="container px-4 py-12 mx-auto max-w-2xl text-center">
        <p className="text-muted-foreground">{t("create.signInRequired")}</p>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto max-w-3xl">
      <div className="mb-8 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t("create.title")}</h1>
          <p className="text-muted-foreground">{t("create.subtitle")}</p>
        </div>
        {/* Visible autosave indicator — flips between "Saving…" and the
            most recent saved-at timestamp so users know their work is safe. */}
        {(draftSaving || draftSavedAt) && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0 pt-2" data-testid="autosave-status">
            {draftSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{t("create.autosaveSaving")}</span>
              </>
            ) : (
              <span>
                {t("create.autosaveSaved")} · {draftSavedAt!.toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Continue / Start fresh dialog when a draft already exists. */}
      {resumeChoice && (
        <Card className="mb-6 border-primary/40 bg-primary/5" data-testid="resume-draft-dialog">
          <CardHeader>
            <CardTitle className="text-lg">{t("create.resumeDraftTitle")}</CardTitle>
            <CardDescription>{t("create.resumeDraftDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={acceptResume} data-testid="button-resume-continue">
              {t("create.resumeDraftContinue")}
            </Button>
            <Button variant="outline" onClick={declineResume} data-testid="button-resume-fresh">
              {t("create.resumeDraftFresh")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("create.listingType")}</CardTitle>
              <CardDescription>
                {t("create.listingTypeDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-2 gap-4"
                      >
                        <div>
                          <RadioGroupItem
                            value="offer"
                            id="offer"
                            className="peer sr-only"
                          />
                          <label
                            htmlFor="offer"
                            className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-card p-6 cursor-pointer peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover-elevate"
                            data-testid="radio-offer"
                          >
                            <Package className="h-10 w-10 mb-3 text-primary" />
                            <span className="font-semibold">{t("create.imOffering")}</span>
                            <span className="text-xs text-muted-foreground text-center mt-1">
                              {t("create.goodsOrServices")}
                            </span>
                          </label>
                        </div>
                        <div>
                          <RadioGroupItem
                            value="request"
                            id="request"
                            className="peer sr-only"
                          />
                          <label
                            htmlFor="request"
                            className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-card p-6 cursor-pointer peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover-elevate"
                            data-testid="radio-request"
                          >
                            <ShoppingCart className="h-10 w-10 mb-3 text-primary" />
                            <span className="font-semibold">{t("create.imLookingFor")}</span>
                            <span className="text-xs text-muted-foreground text-center mt-1">
                              {t("create.somethingINeed")}
                            </span>
                          </label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("create.details")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("listing.title")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          selectedType === "offer"
                            ? t("create.offerPlaceholder")
                            : t("create.requestPlaceholder")
                        }
                        data-testid="input-title"
                        {...field}
                        onBlur={() => { field.onBlur(); flushAutosave(); }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("listing.description")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("create.descriptionPlaceholder")}
                        className="min-h-[120px] resize-none"
                        data-testid="textarea-description"
                        {...field}
                        onBlur={() => { field.onBlur(); flushAutosave(); }}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("create.descriptionHint")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="h-5 w-5" />
                {selectedType === "offer" ? t("create.whatImOffering") : t("create.whatINeed")} - {t("listing.categories")}
              </CardTitle>
              <CardDescription>
                {t("create.selectAtLeastOne")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="categories"
                render={() => (
                  <FormItem>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((category) => (
                        <Badge
                          key={category}
                          variant={selectedCategories.includes(category) ? "default" : "outline"}
                          className="cursor-pointer text-sm py-1.5 px-3"
                          onClick={() => toggleCategory(category)}
                          data-testid={`badge-category-${category.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {category}
                        </Badge>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {(selectedCategories.includes("Fashion") || selectedCategories.includes("Modeling") || selectedCategories.includes("Hospitality") || selectedCategories.includes("SaaS")) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  {t("create.categoryDetails")}
                </CardTitle>
                <CardDescription>
                  {t("create.categoryDetailsDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(selectedCategories.includes("Fashion") || selectedCategories.includes("Modeling")) && (
                  <>
                    <div className="space-y-2">
                      <FormLabel>{t("create.numberOfOutfits")}</FormLabel>
                      <Input
                        type="number"
                        value={categoryDetails.numberOfOutfits ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, numberOfOutfits: e.target.value ? Number(e.target.value) : "" }))}
                        data-testid="input-number-of-outfits"
                      />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>{t("create.shootDuration")}</FormLabel>
                      <Input
                        value={categoryDetails.shootDuration ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, shootDuration: e.target.value }))}
                        placeholder={t("create.shootDurationPlaceholder")}
                        data-testid="input-shoot-duration"
                      />
                    </div>
                  </>
                )}
                {selectedCategories.includes("Hospitality") && (
                  <>
                    <div className="space-y-2">
                      <FormLabel>{t("create.preferredDates")}</FormLabel>
                      <Input
                        value={categoryDetails.dates ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, dates: e.target.value }))}
                        placeholder={t("create.preferredDatesPlaceholder")}
                        data-testid="input-preferred-dates"
                      />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>{t("create.roomType")}</FormLabel>
                      <Input
                        value={categoryDetails.roomType ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, roomType: e.target.value }))}
                        placeholder={t("create.roomTypePlaceholder")}
                        data-testid="input-room-type"
                      />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>{t("create.contentDeliverables")}</FormLabel>
                      <Input
                        value={categoryDetails.contentDeliverables ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, contentDeliverables: e.target.value }))}
                        placeholder={t("create.contentDeliverablePlaceholder")}
                        data-testid="input-content-deliverables"
                      />
                    </div>
                  </>
                )}
                {selectedCategories.includes("SaaS") && (
                  <>
                    <div className="space-y-2">
                      <FormLabel>{t("create.licenseDuration")}</FormLabel>
                      <Input
                        value={categoryDetails.licenseDuration ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, licenseDuration: e.target.value }))}
                        placeholder={t("create.licenseDurationPlaceholder")}
                        data-testid="input-license-duration"
                      />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>{t("create.featuresIncluded")}</FormLabel>
                      <Input
                        value={categoryDetails.featuresIncluded ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, featuresIncluded: e.target.value }))}
                        placeholder={t("create.featuresIncludedPlaceholder")}
                        data-testid="input-features-included"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
                {t("create.whatIWantInExchange")}
              </CardTitle>
              <CardDescription>
                {t("create.tellPartners")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <FormLabel className="text-base mb-3 block">{t("create.preferredCategories")}</FormLabel>
                <p className="text-sm text-muted-foreground mb-3">
                  {t("create.selectCategoriesAccept")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((category) => (
                    <Badge
                      key={`wanted-${category}`}
                      variant={wantedCategories.includes(category) ? "default" : "outline"}
                      className="cursor-pointer text-sm py-1.5 px-3"
                      onClick={() => toggleWantedCategory(category)}
                      data-testid={`badge-wanted-${category.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {category}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <FormLabel className="text-base mb-1 block">{t("create.specificExchangeItems")}</FormLabel>
                <p className="text-sm text-muted-foreground mb-3">
                  {t("create.addSpecificItems")}
                </p>

                {priorityItems.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      {t("create.priorityItemsLabel")}
                    </p>
                    <div className="space-y-2">
                      {priorityItems.map((item) => (
                        <div key={item.name} className="flex items-center gap-2 p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                          <span className="text-sm flex-1">{item.name}</span>
                          <button
                            type="button"
                            onClick={() => toggleItemPriority(item.name)}
                            className="text-yellow-600 hover:text-yellow-800 text-xs"
                            data-testid={`button-deprioritize-${item.name}`}
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeExchangeItem(item.name)}
                            className="text-destructive hover:text-destructive/80"
                            data-testid={`button-remove-priority-${item.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {otherItems.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium mb-2">{t("create.alsoOpenTo")}</p>
                    <div className="space-y-2">
                      {otherItems.map((item) => (
                        <div key={item.name} className="flex items-center gap-2 p-2 rounded-lg bg-muted">
                          <span className="text-sm flex-1">{item.name}</span>
                          <button
                            type="button"
                            onClick={() => toggleItemPriority(item.name)}
                            className="text-muted-foreground hover:text-yellow-600 text-xs"
                            data-testid={`button-prioritize-${item.name}`}
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeExchangeItem(item.name)}
                            className="text-destructive hover:text-destructive/80"
                            data-testid={`button-remove-item-${item.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="priority-new"
                      checked={newItemPriority}
                      onCheckedChange={(checked) => setNewItemPriority(!!checked)}
                      data-testid="checkbox-new-item-priority"
                    />
                    <label htmlFor="priority-new" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                      <Star className="h-3 w-3" /> {t("create.priority")}
                    </label>
                  </div>
                  <Input
                    placeholder={t("create.exchangeItemPlaceholder")}
                    value={newExchangeItem}
                    onChange={(e) => setNewExchangeItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExchangeItem())}
                    className="flex-1"
                    data-testid="input-exchange-item"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addExchangeItem} data-testid="button-add-exchange-item">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <FormField
                control={form.control}
                name="openToOffers"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t("create.openToOtherOffers")}</FormLabel>
                      <FormDescription>
                        {t("create.allowMembers")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-open-to-offers"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                {t("create.valueAndLocation")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="retailValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("create.retailValueLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        data-testid="input-retail-value"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("create.approximateValue")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {marketAvgValue && (
                <div className="text-xs text-muted-foreground">
                  {t("create.marketAverage")}: AED {marketAvgValue.toLocaleString()}
                  {isLowValue && (
                    <span className="text-yellow-600 ms-1">
                      — {t("create.valueBelowRange")}
                    </span>
                  )}
                </div>
              )}

              {titleWatch && descriptionWatch && selectedCategories.length > 0 && (
                <AiValuationPanel
                  title={titleWatch}
                  description={descriptionWatch}
                  category={selectedCategories[0] || ""}
                />
              )}

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("listing.location")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-location">
                          <SelectValue placeholder={t("listing.location")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LOCATIONS.map((loc) => (
                          <SelectItem key={loc} value={loc}>
                            {loc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("create.country")}</FormLabel>
                    <Select onValueChange={(v) => { field.onChange(v); form.setValue("city", ""); }} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-country">
                          <SelectValue placeholder={t("create.country")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
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
                render={({ field }) => {
                  const countryCode = form.watch("country") || "AE";
                  const cities = getCitiesForCountry(countryCode);
                  return (
                    <FormItem>
                      <FormLabel>{t("create.city")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-city">
                            <SelectValue placeholder={t("create.selectCity")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {cities.map((city) => (
                            <SelectItem key={city} value={city}>
                              {city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="h-5 w-5" />
                {t("create.tagsOptional")}
              </CardTitle>
              <CardDescription>
                {t("create.addKeywords")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder={t("create.addTagPlaceholder")}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  data-testid="input-tag"
                />
                <Button type="button" variant="outline" size="icon" onClick={addTag} data-testid="button-add-tag">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-destructive"
                        data-testid={`button-remove-tag-${tag}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImagePlus className="h-5 w-5" />
                {t("create.imagesSection")}
                <Badge variant="destructive" className="text-xs ms-auto">{t("create.imagesRequired")}</Badge>
              </CardTitle>
              <CardDescription>
                {t("create.imagesDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {images.map((url, index) => (
                    <div key={url} className="relative group rounded-lg overflow-hidden aspect-square">
                      <img
                        src={url}
                        alt={`${t("create.uploadImageAlt")} ${index + 1}`}
                        className="w-full h-full object-cover"
                        data-testid={`img-listing-preview-${index}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 end-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-remove-image-${index}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <FormField
                control={form.control}
                name="images"
                render={() => (
                  <FormItem>
                    <FormControl>
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => handleImageUpload(e.target.files)}
                          data-testid="input-image-upload"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full h-24 border-dashed gap-2"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImages}
                          data-testid="button-upload-images"
                        >
                          {uploadingImages ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin" />
                              {t("create.uploading")}
                            </>
                          ) : (
                            <>
                              <Upload className="h-5 w-5" />
                              {t("create.addImages")}
                            </>
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {images.length > 0 && images.length < 3 && (
                <p className="text-sm text-yellow-600 mt-2">
                  {images.length} {t("create.minImages")} — {3 - images.length}{" "}
                  {3 - images.length === 1 ? t("create.moreNeeded") : t("create.moreNeededPlural")}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-4 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/browse")}
              data-testid="button-cancel-listing"
            >
              {t("create.cancelBtn")}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-create-listing"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {t("create.creating")}
                </>
              ) : (
                t("create.createBtn")
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
