import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { apiRequest, handleAuthExpiry } from "@/lib/queryClient";
import { CATEGORIES, COUNTRIES, getCitiesForCountry } from "@shared/schema";
import AiValuationPanel from "@/components/ai-valuation-panel";
import { ListingDetailFields, ITEM_TYPE_LABELS, type ItemType } from "@/components/listing-detail-fields";
import {
  Package, ShoppingCart, Loader2, X, Plus, ImagePlus,
  Tag, MapPin, DollarSign, FileText, ArrowLeftRight, Star,
  Upload, Settings2, Home, Car, Smartphone, Shirt, Sofa, MoreHorizontal,
  Camera, Users, Sparkles, Check, BedDouble, Building2, Briefcase, Handshake,
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
    categories: z.array(z.string()),
    retailValue: z.string().optional(),
    location: z.string().min(1, t("create.validation.locationRequired")),
    country: z.string().length(2).optional(),
    city: z.string().optional(),
    tags: z.array(z.string()).optional(),
    images: z.array(z.string()),
    wantedCategories: z.array(z.string()).optional(),
    exchangeItems: z.array(exchangeItemSchema).optional(),
    openToOffers: z.boolean().optional(),
  }).superRefine((data, ctx) => {
    if (data.type === "offer") {
      if (data.images.length < 3) {
        ctx.addIssue({ code: z.ZodIssueCode.too_small, type: "array", minimum: 3, inclusive: true, path: ["images"], message: t("create.validation.imagesMin") });
      }
      if (data.categories.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.too_small, type: "array", minimum: 1, inclusive: true, path: ["categories"], message: t("create.validation.categoryMin") });
      }
      if (!data.retailValue || isNaN(parseFloat(data.retailValue)) || parseFloat(data.retailValue) <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retailValue"], message: t("create.validation.valueInvalid") });
      }
    }
  });
}

type CreateListingForm = z.infer<ReturnType<typeof makeCreateListingSchema>>;

const ITEM_TYPE_ICONS: Record<ItemType, React.ReactNode> = {
  hospitality:  <BedDouble className="h-5 w-5" />,
  room_rental:  <Home className="h-5 w-5" />,
  office_space: <Building2 className="h-5 w-5" />,
  real_estate:  <Home className="h-5 w-5" />,
  automotive:   <Car className="h-5 w-5" />,
  electronics:  <Smartphone className="h-5 w-5" />,
  services:     <Briefcase className="h-5 w-5" />,
  brand_collab: <Handshake className="h-5 w-5" />,
  fashion:      <Shirt className="h-5 w-5" />,
  furniture:    <Sofa className="h-5 w-5" />,
  other:        <MoreHorizontal className="h-5 w-5" />,
  "":           <MoreHorizontal className="h-5 w-5" />,
};

export function CreateListingPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [itemType, setItemType] = useState<ItemType>("");
  const [newExchangeItem, setNewExchangeItem] = useState("");
  const [newItemPriority, setNewItemPriority] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [categoryDetails, setCategoryDetails] = useState<Record<string, string | number | boolean | string[]>>({});
  const [aiValuation, setAiValuation] = useState<{
    estimatedRange: { min: number; max: number };
    fairValue: number;
    confidence: number;
    reasoning: string;
    marketComparison: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Brand Collab mode
  const [isCollab, setIsCollab] = useState(false);
  const [collabContentType, setCollabContentType] = useState("instagram_post");
  const [collabRequiredFollowers, setCollabRequiredFollowers] = useState("");
  const [collabBrief, setCollabBrief] = useState("");
  const [collabPlatforms, setCollabPlatforms] = useState<string[]>(["instagram"]);
  const [collabDeliverables, setCollabDeliverables] = useState("1");
  const [collabProductValue, setCollabProductValue] = useState("");
  const [collabDeadline, setCollabDeadline] = useState("");
  const [collabUsageRights, setCollabUsageRights] = useState("brand_social");
  const COLLAB_PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "linkedin"];

  // Custom "Other" category
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");

  const addCustomCategory = () => {
    const val = customCategoryInput.trim();
    if (!val) return;
    const current = form.getValues("categories");
    if (!current.includes(val)) {
      form.setValue("categories", [...current, val], { shouldValidate: true });
    }
    setCustomCategoryInput("");
    setShowCustomCategory(false);
  };

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
        isCollab,
        collabDetails: isCollab ? {
          contentType: collabContentType,
          requiredFollowers: collabRequiredFollowers ? parseInt(collabRequiredFollowers) : 0,
          requiredPlatforms: collabPlatforms,
          contentBrief: collabBrief,
          deadline: collabDeadline || undefined,
          usageRights: collabUsageRights,
          deliverables: parseInt(collabDeliverables) || 1,
          productValue: collabProductValue ? parseFloat(collabProductValue) : 0,
        } : undefined,
        valuation: aiValuation
          ? {
              minAed: Math.round(aiValuation.estimatedRange.min),
              maxAed: Math.round(aiValuation.estimatedRange.max),
              fairAed: Math.round(aiValuation.fairValue),
              confidence: aiValuation.confidence,
              reasoning: aiValuation.reasoning,
              marketNote: aiValuation.marketComparison,
            }
          : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Cancel any pending autosave and delete the draft immediately
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (draftIdRef.current) {
        apiRequest("DELETE", `/api/listing-drafts/${draftIdRef.current}`).catch(() => {});
        draftIdRef.current = null;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/listing-drafts"] });
      trackEvent("listing_created", {
        listing_id: data.id,
        listing_category: (data.categories || [])[0],
        listing_value: data.retailValue ? parseFloat(data.retailValue) : undefined,
      });
      toast({ title: t("create.successTitle"), description: t("create.successDesc") });
      navigate(`/listings/${data.id}`);
    },
    onError: (error: any) => {
      toast({ title: t("create.failedTitle"), description: error.message || t("common.somethingWentWrong"), variant: "destructive" });
    },
  });

  const onSubmit = (data: CreateListingForm) => createMutation.mutate(data);

  // ── Draft autosave ───────────────────────────────────────────────────────
  const draftIdRef = useRef<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [resumeChoice, setResumeChoice] = useState<null | { id: string; data: Record<string, unknown>; title: string | null }>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const draftId = params.get("draft");

    // Pre-fill from rejected proposal redirect (?prefill=1)
    if (params.get("prefill") === "1") {
      const title = params.get("title") || "";
      const description = params.get("description") || "";
      const retailValue = params.get("retailValue") || "";
      let images: string[] = [];
      try { images = JSON.parse(params.get("images") || "[]"); } catch { /* ignore */ }
      form.reset({
        ...form.getValues(),
        title,
        description,
        retailValue,
        images,
        type: "offer",
      });
      setDraftLoaded(true);
      return;
    }

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
      if (autosaveTimerRef.current !== null) { window.clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    };
  }, [form, user, draftLoaded]);

  const flushAutosave = () => {
    if (!user || !draftLoaded) return;
    if (autosaveTimerRef.current !== null) { window.clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    saveDraftNow(form.getValues() as Partial<CreateListingForm>);
  };

  const acceptResume = () => {
    if (!resumeChoice) return;
    draftIdRef.current = resumeChoice.id;
    try { form.reset(resumeChoice.data as unknown as CreateListingForm); } catch { /* ignore */ }
    setResumeChoice(null);
    setDraftLoaded(true);
  };
  const declineResume = () => {
    if (resumeChoice?.id) apiRequest("DELETE", `/api/listing-drafts/${resumeChoice.id}`).catch(() => {});
    setResumeChoice(null);
    setDraftLoaded(true);
  };

  useEffect(() => {
    if (createMutation.isSuccess && draftIdRef.current) {
      apiRequest("DELETE", `/api/listing-drafts/${draftIdRef.current}`).catch(() => {});
      draftIdRef.current = null;
    }
  }, [createMutation.isSuccess]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const toggleCategory = (category: string) => {
    const current = form.getValues("categories");
    form.setValue("categories",
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category]
    );
  };

  const toggleWantedCategory = (category: string) => {
    const current = form.getValues("wantedCategories") || [];
    form.setValue("wantedCategories",
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category]
    );
  };

  const addExchangeItem = () => {
    if (!newExchangeItem.trim()) return;
    const current = form.getValues("exchangeItems") || [];
    if (!current.some((i) => i.name.toLowerCase() === newExchangeItem.trim().toLowerCase())) {
      form.setValue("exchangeItems", [...current, { name: newExchangeItem.trim(), isPriority: newItemPriority }]);
    }
    setNewExchangeItem("");
    setNewItemPriority(false);
  };

  const removeExchangeItem = (name: string) => {
    form.setValue("exchangeItems", (form.getValues("exchangeItems") || []).filter((i) => i.name !== name));
  };

  const toggleItemPriority = (name: string) => {
    form.setValue("exchangeItems",
      (form.getValues("exchangeItems") || []).map((i) => i.name === name ? { ...i, isPriority: !i.isPriority } : i)
    );
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    const currentImages = form.getValues("images") || [];
    try {
      const urls = await Promise.all(Array.from(files).map(async (file) => {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image file`);
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} exceeds 5MB limit`);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "listing");
        const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) handleAuthExpiry(401);
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Upload failed");
        }
        return (await res.json()).url as string;
      }));
      form.setValue("images", [...currentImages, ...urls], { shouldValidate: true });
    } catch (error: any) {
      toast({ title: t("create.uploadFailed"), description: error.message || t("create.uploadImageError"), variant: "destructive" });
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    form.setValue("images", (form.getValues("images") || []).filter((_, i) => i !== index), { shouldValidate: true });
  };

  // ── Watchers ─────────────────────────────────────────────────────────────
  const selectedType       = form.watch("type");
  const selectedCategories = form.watch("categories");
  const wantedCategories   = form.watch("wantedCategories") || [];
  const exchangeItems      = form.watch("exchangeItems") || [];
  const images             = form.watch("images") || [];
  const titleWatch         = form.watch("title");
  const descriptionWatch   = form.watch("description");
  const priorityItems      = exchangeItems.filter((i) => i.isPriority);
  const otherItems         = exchangeItems.filter((i) => !i.isPriority);

  if (!user) {
    return (
      <div className="container px-4 py-12 mx-auto max-w-2xl text-center">
        <p className="text-muted-foreground">{t("create.signInRequired")}</p>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            {selectedType === "request" ? "Post What You're Looking For" : t("create.title")}
          </h1>
          <p className="text-muted-foreground">
            {selectedType === "request"
              ? "Describe what you need and what you can offer in return. No photos required."
              : t("create.subtitle")}
          </p>
        </div>
        {(draftSaving || draftSavedAt) && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0 pt-2" data-testid="autosave-status">
            {draftSaving ? (
              <><Loader2 className="h-3 w-3 animate-spin" /><span>{t("create.autosaveSaving")}</span></>
            ) : (
              <span>{t("create.autosaveSaved")} · {draftSavedAt!.toLocaleTimeString()}</span>
            )}
          </div>
        )}
      </div>

      {/* Resume draft */}
      {resumeChoice && (
        <Card className="mb-6 border-primary/40 bg-primary/5" data-testid="resume-draft-dialog">
          <CardHeader>
            <CardTitle className="text-lg">{t("create.resumeDraftTitle")}</CardTitle>
            <CardDescription>{t("create.resumeDraftDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={acceptResume} data-testid="button-resume-continue">{t("create.resumeDraftContinue")}</Button>
            <Button variant="outline" onClick={declineResume} data-testid="button-resume-fresh">{t("create.resumeDraftFresh")}</Button>
          </CardContent>
        </Card>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* ── 1. Listing type ─────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("create.listingType")}</CardTitle>
              <CardDescription>{t("create.listingTypeDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-2 gap-4">
                      <div>
                        <RadioGroupItem value="offer" id="offer" className="peer sr-only" />
                        <label htmlFor="offer" className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-card p-6 cursor-pointer peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover-elevate" data-testid="radio-offer">
                          <Package className="h-10 w-10 mb-3 text-primary" />
                          <span className="font-semibold">{t("create.imOffering")}</span>
                          <span className="text-xs text-muted-foreground text-center mt-1">{t("create.goodsOrServices")}</span>
                        </label>
                      </div>
                      <div>
                        <RadioGroupItem value="request" id="request" className="peer sr-only" />
                        <label htmlFor="request" className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-card p-6 cursor-pointer peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover-elevate" data-testid="radio-request">
                          <ShoppingCart className="h-10 w-10 mb-3 text-primary" />
                          <span className="font-semibold">{t("create.imLookingFor")}</span>
                          <span className="text-xs text-muted-foreground text-center mt-1">{t("create.somethingINeed")}</span>
                        </label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── 2. Title & Description ──────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("create.details")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("listing.title")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={selectedType === "offer" ? t("create.offerPlaceholder") : t("create.requestPlaceholder")}
                      data-testid="input-title"
                      {...field}
                      onBlur={() => { field.onBlur(); flushAutosave(); }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
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
                  <FormDescription>{t("create.descriptionHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── 3. Item type + dynamic detail fields (offer only) ──────── */}
          {selectedType !== "request" && <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Listing Details
              </CardTitle>
              <CardDescription>
                Choose your listing category — fields will adapt so your listing is as detailed as possible.
                Great listings close faster.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Item type quick-select */}
              <div>
                <FormLabel className="text-sm mb-2 block">What are you listing?</FormLabel>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {(Object.keys(ITEM_TYPE_LABELS) as Exclude<ItemType, "">[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setItemType(type); setCategoryDetails({}); }}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-xs font-medium transition-colors cursor-pointer
                        ${itemType === type ? "border-primary bg-primary/5 text-primary" : "border-muted bg-card text-muted-foreground hover:border-primary/40"}`}
                      data-testid={`btn-item-type-${type}`}
                    >
                      {ITEM_TYPE_ICONS[type]}
                      <span className="text-center leading-tight">{ITEM_TYPE_LABELS[type]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic fields */}
              {itemType && (
                <ListingDetailFields
                  itemType={itemType}
                  details={categoryDetails}
                  onChange={setCategoryDetails}
                />
              )}
            </CardContent>
          </Card>}

          {/* ── 4. Photos ────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImagePlus className="h-5 w-5" />
                {selectedType === "request" ? "Inspiration Image" : t("create.imagesSection")}
                {selectedType === "request"
                  ? <Badge variant="outline" className="text-xs ms-auto text-muted-foreground">Optional</Badge>
                  : <Badge variant="destructive" className="text-xs ms-auto">{t("create.imagesRequired")}</Badge>
                }
              </CardTitle>
              <CardDescription>
                {selectedType === "request"
                  ? "Optionally add one image to help describe what you're looking for."
                  : t("create.imagesDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {images.map((url, index) => (
                    <div key={url} className="relative group rounded-lg overflow-hidden aspect-square">
                      <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" data-testid={`img-listing-preview-${index}`} />
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
              <FormField control={form.control} name="images" render={() => (
                <FormItem>
                  <FormControl>
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple={selectedType !== "request"}
                        className="hidden"
                        onChange={(e) => handleImageUpload(e.target.files)}
                        data-testid="input-image-upload"
                      />
                      {(selectedType !== "request" || images.length === 0) && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full h-24 border-dashed gap-2"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImages}
                          data-testid="button-upload-images"
                        >
                          {uploadingImages ? (
                            <><Loader2 className="h-5 w-5 animate-spin" />{t("create.uploading")}</>
                          ) : (
                            <><Upload className="h-5 w-5" />
                            {selectedType === "request" ? "Add inspiration image (optional)" : t("create.addImages")}</>
                          )}
                        </Button>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {selectedType === "offer" && images.length > 0 && images.length < 3 && (
                <p className="text-sm text-yellow-600 mt-2">
                  {images.length} {t("create.minImages")} — {3 - images.length}{" "}
                  {3 - images.length === 1 ? t("create.moreNeeded") : t("create.moreNeededPlural")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── 5. Bareter Value ─────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                {selectedType === "request" ? "Budget & Location" : "Value & Location"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* AI Valuation — offer listings only */}
              {selectedType !== "request" && titleWatch && descriptionWatch && (
                <AiValuationPanel
                  title={titleWatch}
                  description={descriptionWatch}
                  category={itemType || undefined}
                  condition={(categoryDetails.condition as string) || undefined}
                  images={images}
                  onValuation={setAiValuation}
                  onApplyValue={(val) => form.setValue("retailValue", String(Math.round(val)))}
                />
              )}

              <FormField control={form.control} name="retailValue" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {selectedType === "request" ? "Budget / Estimated Value" : t("create.retailValueLabel")}
                    {selectedType === "request" && <span className="text-muted-foreground font-normal text-xs ml-2">(optional)</span>}
                  </FormLabel>
                  <FormControl>
                    <Input type="number" placeholder={selectedType === "request" ? "e.g. 5000 — leave blank if flexible" : "0"} data-testid="input-retail-value" {...field} />
                  </FormControl>
                  <FormDescription>
                    {selectedType === "request" ? "Approximate budget helps potential partners know what you can offer in return." : t("create.approximateValue")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("listing.location")}</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Dubai Marina" data-testid="input-location" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="country" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("create.country")}</FormLabel>
                  <Select onValueChange={(v) => { field.onChange(v); form.setValue("city", ""); }} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-country"><SelectValue placeholder={t("create.country")} /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="city" render={({ field }) => {
                const cities = getCitiesForCountry(form.watch("country") || "AE");
                return (
                  <FormItem>
                    <FormLabel>{t("create.city")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-city"><SelectValue placeholder={t("create.selectCity")} /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {cities.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                );
              }} />
            </CardContent>
          </Card>

          {/* ── 6. Exchange section ─────────────────────────────────────── */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
                {selectedType === "request" ? "What can you offer in return?" : t("create.whatIWantInExchange")}
              </CardTitle>
              <CardDescription>
                {selectedType === "request"
                  ? "Tell potential partners what you have to exchange for what you're looking for."
                  : t("create.tellPartners")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <FormLabel className="text-base mb-2 block">{t("create.preferredCategories")}</FormLabel>
                <p className="text-sm text-muted-foreground mb-3">{t("create.selectCategoriesAccept")}</p>
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
                <p className="text-sm text-muted-foreground mb-3">{t("create.addSpecificItems")}</p>

                {priorityItems.length > 0 && (
                  <div className="mb-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /> {t("create.priorityItemsLabel")}
                    </p>
                    {priorityItems.map((item) => (
                      <div key={item.name} className="flex items-center gap-2 p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                        <span className="text-sm flex-1">{item.name}</span>
                        <button type="button" onClick={() => toggleItemPriority(item.name)} className="text-yellow-600 hover:text-yellow-800" data-testid={`button-deprioritize-${item.name}`}><Star className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => removeExchangeItem(item.name)} className="text-destructive hover:text-destructive/80" data-testid={`button-remove-priority-${item.name}`}><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}

                {otherItems.length > 0 && (
                  <div className="mb-3 space-y-2">
                    <p className="text-sm font-medium">{t("create.alsoOpenTo")}</p>
                    {otherItems.map((item) => (
                      <div key={item.name} className="flex items-center gap-2 p-2 rounded-lg bg-muted">
                        <span className="text-sm flex-1">{item.name}</span>
                        <button type="button" onClick={() => toggleItemPriority(item.name)} className="text-muted-foreground hover:text-yellow-600" data-testid={`button-prioritize-${item.name}`}><Star className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => removeExchangeItem(item.name)} className="text-destructive hover:text-destructive/80" data-testid={`button-remove-item-${item.name}`}><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox id="priority-new" checked={newItemPriority} onCheckedChange={(c) => setNewItemPriority(!!c)} data-testid="checkbox-new-item-priority" />
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

              <FormField control={form.control} name="openToOffers" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">{t("create.openToOtherOffers")}</FormLabel>
                    <FormDescription>{t("create.allowMembers")}</FormDescription>
                  </div>
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-open-to-offers" />
                  </FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── 7. Category tags ────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Category Tags
                {selectedType === "request" && <Badge variant="outline" className="text-xs ms-auto text-muted-foreground">Optional</Badge>}
              </CardTitle>
              <CardDescription>
                {selectedType === "request"
                  ? "Optionally tag your request — helps brands and members find what you're looking for."
                  : "Select all categories that apply — these help others discover your listing."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField control={form.control} name="categories" render={() => (
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

                    {/* Custom categories the user already added */}
                    {selectedCategories
                      .filter((c) => !(CATEGORIES as readonly string[]).includes(c))
                      .map((custom) => (
                        <Badge
                          key={custom}
                          variant="default"
                          className="cursor-pointer text-sm py-1.5 px-3 gap-1.5 bg-bareter-teal"
                          onClick={() => toggleCategory(custom)}
                        >
                          {custom}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}

                    {/* "Other" trigger badge */}
                    <Badge
                      variant="outline"
                      className="cursor-pointer text-sm py-1.5 px-3 gap-1 border-dashed border-bareter-teal text-bareter-teal hover:bg-bareter-teal/10"
                      onClick={() => setShowCustomCategory((v) => !v)}
                      data-testid="badge-category-other"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Other
                    </Badge>
                  </div>

                  {/* Inline custom category input */}
                  {showCustomCategory && (
                    <div className="mt-3 flex items-center gap-2 max-w-xs">
                      <Input
                        autoFocus
                        placeholder="e.g. Antiques, Crypto, Art…"
                        value={customCategoryInput}
                        onChange={(e) => setCustomCategoryInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addCustomCategory(); }
                          if (e.key === "Escape") { setShowCustomCategory(false); setCustomCategoryInput(""); }
                        }}
                        className="h-9 text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 px-3"
                        onClick={addCustomCategory}
                        disabled={!customCategoryInput.trim()}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 px-3"
                        onClick={() => { setShowCustomCategory(false); setCustomCategoryInput(""); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── Brand Collab Toggle ──────────────────────────────────────── */}
          <Card className={`border-2 transition-colors ${isCollab ? "border-primary bg-primary/5" : "border-dashed border-muted-foreground/30"}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${isCollab ? "bg-primary text-white" : "bg-muted"}`}>
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Brand Collab Listing</p>
                    <p className="text-xs text-muted-foreground">Offer your product/service in exchange for creator content</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCollab(!isCollab)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${isCollab ? "bg-primary" : "bg-muted-foreground/30"}`}
                  data-testid="toggle-is-collab"
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isCollab ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {isCollab && (
                <div className="mt-5 space-y-4 border-t pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Content Type</label>
                      <select
                        value={collabContentType}
                        onChange={(e) => setCollabContentType(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        data-testid="select-collab-content-type"
                      >
                        <option value="instagram_post">Instagram Post</option>
                        <option value="instagram_story">Instagram Story</option>
                        <option value="instagram_reel">Instagram Reel</option>
                        <option value="tiktok_video">TikTok Video</option>
                        <option value="youtube_video">YouTube Video</option>
                        <option value="youtube_short">YouTube Short</option>
                        <option value="twitter_post">X / Twitter Post</option>
                        <option value="blog_post">Blog Post</option>
                        <option value="multiple">Multiple Formats</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Min Follower Count</label>
                      <input
                        type="number"
                        value={collabRequiredFollowers}
                        onChange={(e) => setCollabRequiredFollowers(e.target.value)}
                        placeholder="e.g. 10000"
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        data-testid="input-collab-followers"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Content Brief <span className="text-destructive">*</span></label>
                    <textarea
                      value={collabBrief}
                      onChange={(e) => setCollabBrief(e.target.value)}
                      placeholder="Describe what content you want — style, tone, key messages, dos and don'ts..."
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                      data-testid="textarea-collab-brief"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Product Value (AED)</label>
                      <input
                        type="number"
                        value={collabProductValue}
                        onChange={(e) => setCollabProductValue(e.target.value)}
                        placeholder="e.g. 500"
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        data-testid="input-collab-product-value"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Deliverables</label>
                      <input
                        type="number"
                        value={collabDeliverables}
                        onChange={(e) => setCollabDeliverables(e.target.value)}
                        min="1"
                        placeholder="1"
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        data-testid="input-collab-deliverables"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Deadline (optional)</label>
                      <input
                        type="date"
                        value={collabDeadline}
                        onChange={(e) => setCollabDeadline(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        data-testid="input-collab-deadline"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Usage Rights</label>
                      <select
                        value={collabUsageRights}
                        onChange={(e) => setCollabUsageRights(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        data-testid="select-collab-usage-rights"
                      >
                        <option value="creator_only">Creator use only</option>
                        <option value="brand_social">Brand can repost on social</option>
                        <option value="brand_unlimited">Brand unlimited use</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Required Platforms</label>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {COLLAB_PLATFORMS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setCollabPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${collabPlatforms.includes(p) ? "bg-primary text-white border-primary" : "bg-background border-muted-foreground/30 text-muted-foreground"}`}
                          >
                            {p === "twitter" ? "X/Twitter" : p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Submit ───────────────────────────────────────────────────── */}
          <div className="flex gap-4 justify-end">
            <Button type="button" variant="outline" onClick={() => navigate("/browse")} data-testid="button-cancel-listing">
              {t("create.cancelBtn")}
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-listing">
              {createMutation.isPending ? (
                <><Loader2 className="me-2 h-4 w-4 animate-spin" />{t("create.creating")}</>
              ) : t("create.createBtn")}
            </Button>
          </div>

        </form>
      </Form>
    </div>
  );
}
