import { useState, useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useLocation } from "wouter";
import { PhoneVerificationModal } from "@/components/phone-verification-modal";
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
import { apiRequest, handleAuthExpiry, API_BASE, uploadFile } from "@/lib/queryClient";
import { CATEGORIES, COUNTRIES, getCitiesForCountry } from "@shared/schema";
import AiValuationPanel from "@/components/ai-valuation-panel";
import { ListingDetailFields, ITEM_TYPE_LABELS, type ItemType } from "@/components/listing-detail-fields";
import {
  Package, ShoppingCart, Loader2, X, Plus, ImagePlus,
  Tag, MapPin, DollarSign, FileText, ArrowLeftRight, Star,
  Upload, Settings2, Home, Car, Smartphone, Shirt, Sofa, MoreHorizontal,
  Camera, Users, Sparkles, Check, BedDouble, Building2, Briefcase, Handshake, Layers,
  Anchor, Dumbbell, Heart, Zap, BookOpen, Palette, Music, Gamepad2,
  Wrench, TreePine, Luggage, Watch, Utensils, PawPrint, Share2, Video,
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
  hospitality:         <BedDouble className="h-5 w-5" />,
  room_rental:         <Home className="h-5 w-5" />,
  office_space:        <Building2 className="h-5 w-5" />,
  real_estate:         <Home className="h-5 w-5" />,
  automotive:          <Car className="h-5 w-5" />,
  yachts_boats:        <Anchor className="h-5 w-5" />,
  electronics:         <Smartphone className="h-5 w-5" />,
  gaming:              <Gamepad2 className="h-5 w-5" />,
  fashion:             <Shirt className="h-5 w-5" />,
  jewelry_watches:     <Watch className="h-5 w-5" />,
  beauty_wellness:     <Sparkles className="h-5 w-5" />,
  food_dining:         <Utensils className="h-5 w-5" />,
  sports_fitness:      <Dumbbell className="h-5 w-5" />,
  home_appliances:     <Zap className="h-5 w-5" />,
  furniture:           <Sofa className="h-5 w-5" />,
  garden_outdoor:      <TreePine className="h-5 w-5" />,
  tools_equipment:     <Wrench className="h-5 w-5" />,
  pets_animals:        <PawPrint className="h-5 w-5" />,
  books_media:         <BookOpen className="h-5 w-5" />,
  musical_instruments: <Music className="h-5 w-5" />,
  art_collectibles:    <Palette className="h-5 w-5" />,
  luggage_travel:      <Luggage className="h-5 w-5" />,
  services:            <Briefcase className="h-5 w-5" />,
  brand_collab:        <Handshake className="h-5 w-5" />,
  other:               <MoreHorizontal className="h-5 w-5" />,
  "":                  <MoreHorizontal className="h-5 w-5" />,
};

export function CreateListingPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showSharePrompt, setShowSharePrompt] = useState<{ id: string; title: string } | null>(null);

  const [itemType, setItemType] = useState<ItemType>("");
  const [newExchangeItem, setNewExchangeItem] = useState("");
  const [newItemPriority, setNewItemPriority] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
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

  // ── Listing mode ──────────────────────────────────────────────────────────
  const [listingMode, setListingMode] = useState<"individual" | "service" | "creator" | "business_product" | "business_wholesale" | "business_service">("individual");
  const [totalQuantity, setTotalQuantity] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [moq, setMoq] = useState("");
  // ── Individual service fields ──────────────────────────────────────────────
  const [indServiceDeliverables, setIndServiceDeliverables] = useState("");
  const [indServiceTimeline, setIndServiceTimeline] = useState("");
  const [indServiceArea, setIndServiceArea] = useState("");
  // ── Business service/product extra fields ─────────────────────────────────
  const [serviceDeliverables, setServiceDeliverables] = useState("");
  const [serviceTimeline, setServiceTimeline] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  // ── Business catalog ──────────────────────────────────────────────────────
  const [catalogItems, setCatalogItems] = useState<{name: string; sku: string; qty: string}[]>([]);
  const [newCatalogItem, setNewCatalogItem] = useState({name: "", sku: "", qty: ""});
  const [bulkTiers, setBulkTiers] = useState<{min: string; max: string; label: string}[]>([
    {min: "1", max: "10", label: ""}, {min: "11", max: "50", label: ""}, {min: "51", max: "", label: ""},
  ]);
  const [tradeTerms, setTradeTerms] = useState("");
  // ── Creator extra fields ───────────────────────────────────────────────────
  const [demoVideoUrl, setDemoVideoUrl] = useState<string | null>(null);
  const [uploadingDemoVideo, setUploadingDemoVideo] = useState(false);
  const demoVideoRef = useRef<HTMLInputElement>(null);
  const [portfolioLinks, setPortfolioLinks] = useState<string[]>([""]);
  const [creatorRateCard, setCreatorRateCard] = useState("");

  const { data: creatorProfile } = useQuery<Record<string, any> | null>({
    queryKey: ["/api/creators/me"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/creators/me`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!user,
    staleTime: 0,
    retry: false,
  });

  const { data: businessProfile } = useQuery<Record<string, any> | null>({
    queryKey: ["/api/businesses/me"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/businesses/me`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!user,
    staleTime: 0,
    retry: false,
  });

  // Phone verification gate
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<CreateListingForm | null>(null);

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
      const modeFields: Record<string, unknown> =
        listingMode === "service"
          ? {
              listingType: "individual_item",
              categoryDetails: {
                ...(indServiceDeliverables ? { serviceDeliverables: indServiceDeliverables } : {}),
                ...(indServiceTimeline ? { serviceTimeline: indServiceTimeline } : {}),
                ...(indServiceArea ? { serviceArea: indServiceArea } : {}),
                isService: true,
              },
            }
          : listingMode === "creator" && creatorProfile
          ? {
              listingType: "creator_service",
              creatorId: creatorProfile.id,
              videoUrl: demoVideoUrl || undefined,
              categoryDetails: {
                ...(creatorRateCard ? { rateCard: creatorRateCard } : {}),
                portfolioLinks: portfolioLinks.filter(Boolean),
              },
            }
          : listingMode === "business_product" && businessProfile
          ? {
              listingType: "business_product",
              businessId: businessProfile.id,
              actingAsBusinessId: businessProfile.id,
              categoryDetails: {
                ...(catalogItems.length > 0 ? { catalogItems } : {}),
                ...(moq ? { moq: parseInt(moq) } : {}),
                ...(tradeTerms ? { tradeTerms } : {}),
              },
            }
          : listingMode === "business_wholesale" && businessProfile
          ? {
              listingType: "business_wholesale",
              businessId: businessProfile.id,
              actingAsBusinessId: businessProfile.id,
              totalQuantity: totalQuantity ? parseInt(totalQuantity) : undefined,
              remainingQuantity: totalQuantity ? parseInt(totalQuantity) : undefined,
              unitLabel: unitLabel || undefined,
              claimStatus: "available",
              categoryDetails: {
                ...(moq ? { moq: parseInt(moq) } : {}),
                ...(tradeTerms ? { tradeTerms } : {}),
                bulkTiers: bulkTiers.filter(t => t.label).map(t => ({
                  min: parseInt(t.min), max: t.max ? parseInt(t.max) : null, label: t.label,
                })),
              },
            }
          : listingMode === "business_service" && businessProfile
          ? {
              listingType: "business_service",
              businessId: businessProfile.id,
              actingAsBusinessId: businessProfile.id,
              categoryDetails: {
                ...(serviceDeliverables ? { serviceDeliverables } : {}),
                ...(serviceTimeline ? { serviceTimeline } : {}),
                ...(serviceArea ? { serviceArea } : {}),
              },
            }
          : { listingType: "individual_item" };

      const res = await apiRequest("POST", "/api/listings", {
        ...data,
        retailValue: data.retailValue,
        categoryDetails: Object.keys(categoryDetails).length > 0 ? categoryDetails : undefined,
        isCollab: listingMode === "creator" || isCollab,
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
        ...modeFields,
        videoUrl: videoUrl || undefined,
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
      setShowSharePrompt({ id: data.id, title: data.title });
    },
    onError: (error: any) => {
      // If server says phone not verified, open the WhatsApp modal
      if (error?.phoneVerificationRequired || error?.message?.includes("Phone verification")) {
        setPendingSubmitData(createMutation.variables ?? null);
        setShowPhoneModal(true);
        return;
      }
      toast({ title: t("create.failedTitle"), description: error.message || t("common.somethingWentWrong"), variant: "destructive" });
    },
  });

  const onSubmit = (data: CreateListingForm) => {
    // If user is already phone-verified (from auth context), skip the gate
    if ((user as any)?.phoneVerified) {
      createMutation.mutate(data);
    } else {
      // Optimistically try — server will 403 with phoneVerificationRequired if needed
      createMutation.mutate(data);
    }
  };

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

  // Core upload logic — shared by web file input and native camera paths.
  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadingImages(true);
    const currentImages = form.getValues("images") || [];
    try {
      const urls = await Promise.all(files.map(async (file) => {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image file`);
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} exceeds 5MB limit`);
        return uploadFile(file, "listing");
      }));
      form.setValue("images", [...currentImages, ...urls], { shouldValidate: true });
    } catch (error: any) {
      toast({ title: t("create.uploadFailed"), description: error.message || t("create.uploadImageError"), variant: "destructive" });
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Web path: called by the hidden <input type="file">
  const handleImageUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    uploadFiles(Array.from(files));
  };

  // Native path: opens the OS camera / gallery picker via Capacitor
  const handleNativeCameraCapture = async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt, // lets user choose camera or gallery
        quality: 80,
        allowEditing: false,
      });
      if (!photo.dataUrl) throw new Error("No photo data");
      const res = await fetch(photo.dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `photo-${Date.now()}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      await uploadFiles([file]);
    } catch (err: any) {
      // User cancelled the picker — not an error worth showing
      const msg = (err?.message ?? "").toLowerCase();
      if (msg.includes("cancel") || msg.includes("dismiss") || msg.includes("no image") || msg === "user cancelled photos app") return;
      console.error("Camera error:", err);
      toast({ title: t("create.uploadFailed"), description: t("create.uploadImageError"), variant: "destructive" });
    }
  };

  const removeImage = (index: number) => {
    form.setValue("images", (form.getValues("images") || []).filter((_, i) => i !== index), { shouldValidate: true });
  };

  const handleVideoUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast({ title: "Video files only", variant: "destructive" }); return; }
    if (file.size > 50 * 1024 * 1024) { toast({ title: "Video must be under 50MB", variant: "destructive" }); return; }
    setUploadingVideo(true);
    try {
      const url = await uploadFile(file, "listing");
      setVideoUrl(url);
    } catch (err: any) {
      toast({ title: "Video upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const handleDemoVideoUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast({ title: "Video files only", variant: "destructive" }); return; }
    if (file.size > 100 * 1024 * 1024) { toast({ title: "Demo reel must be under 100MB", variant: "destructive" }); return; }
    setUploadingDemoVideo(true);
    try {
      const url = await uploadFile(file, "listing");
      setDemoVideoUrl(url);
    } catch (err: any) {
      toast({ title: "Demo upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingDemoVideo(false);
      if (demoVideoRef.current) demoVideoRef.current.value = "";
    }
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
      <div className="container px-4 py-12 mx-auto max-w-2xl text-center space-y-4">
        <p className="text-muted-foreground">{t("create.signInRequired")}</p>
        <div className="flex gap-3 justify-center">
          <a href="/register" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 py-2 hover:bg-primary/90 transition-colors">Create account</a>
          <a href="/login" className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-9 px-4 py-2 hover:bg-accent hover:text-accent-foreground transition-colors">Log in</a>
        </div>
      </div>
    );
  }

  const isVerified =
    user.kycStatus === "APPROVED" ||
    user.kybStatus === "APPROVED" ||
    user.isVerified ||
    !!(user as any).phoneVerified;

  if (!isVerified) {
    return (
      <div className="container px-4 py-12 mx-auto max-w-2xl text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        </div>
        <h2 className="text-xl font-bold">Add your WhatsApp first</h2>
        <p className="text-muted-foreground">Add and verify your WhatsApp number on your profile to start posting listings.</p>
        <a href="/profile?tab=verification" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 py-2 hover:bg-primary/90 transition-colors">Add WhatsApp</a>
      </div>
    );
  }

  if (showSharePrompt) {
    const listingUrl = `${window.location.origin}/listings/${showSharePrompt.id}`;
    const handleNativeShare = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const { Share } = await import("@capacitor/share");
          await Share.share({ title: showSharePrompt.title, text: `Check out my listing on Bareter: ${showSharePrompt.title}`, url: listingUrl });
        } catch {}
      } else if (navigator.share) {
        navigator.share({ title: showSharePrompt.title, url: listingUrl }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(listingUrl).catch(() => {});
        toast({ title: "Link copied!", description: "Share the link with your network" });
      }
      navigate(`/listings/${showSharePrompt.id}`);
    };

    return (
      <div className="container px-4 py-8 mx-auto max-w-md flex flex-col items-center text-center bareter-slide-up">
        <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6">
          <Check className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Your listing is live!</h2>
        <p className="text-muted-foreground mb-8">Share it to get faster offers from the Bareter community.</p>
        <button
          type="button"
          onClick={handleNativeShare}
          className="w-full flex items-center justify-center gap-2 bg-bareter-teal text-white font-semibold py-3 px-6 rounded-xl mb-3 hover:bg-bareter-teal-light transition-colors"
        >
          <Share2 className="h-5 w-5" />
          Share now
        </button>
        <button
          type="button"
          onClick={() => navigate(`/listings/${showSharePrompt.id}`)}
          className="w-full py-3 px-6 rounded-xl border text-muted-foreground hover:bg-muted transition-colors"
        >
          View my listing
        </button>
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

          {/* ── 0. Listing Mode — shown to ALL users ─────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Listing Mode
              </CardTitle>
              <CardDescription>Choose how this listing is published</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {/* Individual — always available */}
                <button type="button" onClick={() => setListingMode("individual")}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-colors ${listingMode === "individual" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"}`}>
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-semibold">Individual</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Standard P2P barter</span>
                </button>

                {/* Service — available to everyone, no profile needed */}
                <button type="button" onClick={() => setListingMode("service")}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-colors ${listingMode === "service" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"}`}>
                  <Briefcase className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-semibold">Service</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Offer your skills/time</span>
                </button>

                {/* Creator — requires creator profile */}
                <button type="button"
                  onClick={() => creatorProfile ? setListingMode("creator") : window.location.assign("/settings?tab=creator&from=create-listing")}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-colors relative ${listingMode === "creator" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"}`}>
                  <Camera className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-semibold">Creator</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Brand collab offer</span>
                  {!creatorProfile && <span className="text-[9px] text-primary mt-0.5 font-medium">Set up profile →</span>}
                </button>

                {/* Business Product */}
                <button type="button"
                  onClick={() => businessProfile ? setListingMode("business_product") : window.location.assign("/settings?tab=business&from=create-listing")}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-colors ${listingMode === "business_product" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"}`}>
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-semibold">Business</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Company product</span>
                  {!businessProfile && <span className="text-[9px] text-primary mt-0.5 font-medium">Set up profile →</span>}
                </button>

                {/* Business Service */}
                <button type="button"
                  onClick={() => businessProfile ? setListingMode("business_service") : window.location.assign("/settings?tab=business&from=create-listing")}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-colors ${listingMode === "business_service" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"}`}>
                  <Handshake className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-semibold">Biz Service</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Company service offer</span>
                  {!businessProfile && <span className="text-[9px] text-primary mt-0.5 font-medium">Set up profile →</span>}
                </button>

                {/* Wholesale — business + KYB verified */}
                <button type="button"
                  onClick={() => businessProfile ? setListingMode("business_wholesale") : window.location.assign("/settings?tab=business&from=create-listing")}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-colors ${listingMode === "business_wholesale" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"}`}>
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-semibold">Wholesale</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Bulk / split-qty deal</span>
                  {!businessProfile && <span className="text-[9px] text-primary mt-0.5 font-medium">Set up profile →</span>}
                </button>
              </div>

              {/* Context label */}
              {listingMode === "creator" && creatorProfile && (
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" />Listing as <strong>{creatorProfile.displayName}</strong>
                </p>
              )}
              {(listingMode === "business_product" || listingMode === "business_wholesale" || listingMode === "business_service") && businessProfile && (
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" />Listing on behalf of <strong>{businessProfile.companyName}</strong>
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Individual Service fields ─────────────────────────────────── */}
          {listingMode === "service" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" />Service Details</CardTitle>
                <CardDescription>Tell partners exactly what you offer, how long it takes, and where</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">What you'll deliver</label>
                  <Textarea placeholder="e.g. Full brand identity package — logo, colour palette, typography guide, 3 revision rounds…" value={indServiceDeliverables} onChange={e => setIndServiceDeliverables(e.target.value)} rows={3} maxLength={500} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Turnaround time</label>
                    <Input placeholder="e.g. 3 business days" value={indServiceTimeline} onChange={e => setIndServiceTimeline(e.target.value)} maxLength={80} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Location / remote?</label>
                    <Input placeholder="e.g. Dubai / Remote / Worldwide" value={indServiceArea} onChange={e => setIndServiceArea(e.target.value)} maxLength={80} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Business Product catalog + MOQ ───────────────────────────── */}
          {listingMode === "business_product" && businessProfile && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-primary" />Product Catalog</CardTitle>
                <CardDescription>List individual SKUs/products under this listing and set minimum order</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {catalogItems.length > 0 && (
                  <div className="space-y-2">
                    {catalogItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted text-sm">
                        <span className="flex-1 font-medium">{item.name}</span>
                        {item.sku && <span className="text-muted-foreground text-xs">SKU: {item.sku}</span>}
                        {item.qty && <span className="text-muted-foreground text-xs">Qty: {item.qty}</span>}
                        <button type="button" onClick={() => setCatalogItems(p => p.filter((_, j) => j !== i))} className="text-destructive"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Product name" value={newCatalogItem.name} onChange={e => setNewCatalogItem(p => ({...p, name: e.target.value}))} className="col-span-1" />
                  <Input placeholder="SKU (optional)" value={newCatalogItem.sku} onChange={e => setNewCatalogItem(p => ({...p, sku: e.target.value}))} />
                  <div className="flex gap-1">
                    <Input placeholder="Qty" type="number" value={newCatalogItem.qty} onChange={e => setNewCatalogItem(p => ({...p, qty: e.target.value}))} />
                    <Button type="button" size="icon" variant="outline" onClick={() => { if (newCatalogItem.name) { setCatalogItems(p => [...p, newCatalogItem]); setNewCatalogItem({name:"",sku:"",qty:""}); } }}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Min. Order Qty (MOQ)</label>
                    <Input type="number" placeholder="e.g. 10" value={moq} onChange={e => setMoq(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Trade Terms</label>
                    <select value={tradeTerms} onChange={e => setTradeTerms(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Select (optional)</option>
                      <option value="ex_works">Ex Works</option>
                      <option value="fob">FOB</option>
                      <option value="cif">CIF</option>
                      <option value="delivered">Delivered to buyer</option>
                      <option value="pickup">Buyer pickup</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Wholesale quantity + bulk pricing ────────────────────────── */}
          {listingMode === "business_wholesale" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Wholesale Details</CardTitle>
                <CardDescription>Multiple partners can each claim a portion of this stock</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Total Quantity <span className="text-destructive">*</span></label>
                    <Input type="number" min="2" placeholder="e.g. 500" value={totalQuantity} onChange={e => setTotalQuantity(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Unit Label</label>
                    <Input placeholder="e.g. kg, boxes, units" value={unitLabel} onChange={e => setUnitLabel(e.target.value)} maxLength={30} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Min. Order Qty (MOQ)</label>
                    <Input type="number" placeholder="e.g. 10" value={moq} onChange={e => setMoq(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Trade Terms</label>
                    <select value={tradeTerms} onChange={e => setTradeTerms(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Select (optional)</option>
                      <option value="ex_works">Ex Works</option>
                      <option value="fob">FOB</option>
                      <option value="cif">CIF</option>
                      <option value="delivered">Delivered to buyer</option>
                      <option value="pickup">Buyer pickup</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Bulk Pricing Tiers <span className="text-muted-foreground font-normal text-xs">(optional — describe barter value per tier)</span></label>
                  {bulkTiers.map((tier, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2 items-center">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground col-span-1">
                        <span>{tier.min}</span>
                        <span>–</span>
                        <span>{tier.max || "∞"} {unitLabel || "units"}</span>
                      </div>
                      <Input className="col-span-2 h-8 text-sm" placeholder={`Value/offer for this tier`} value={tier.label} onChange={e => setBulkTiers(p => p.map((t, j) => j === i ? {...t, label: e.target.value} : t))} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Business Service extra fields ─────────────────────────────── */}
          {listingMode === "business_service" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Service Details</CardTitle>
                <CardDescription>Help barter partners understand exactly what you offer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Deliverables</label>
                  <Textarea
                    placeholder="What exactly will you deliver? e.g. 2 social posts, 1 video ad, 3 revision rounds…"
                    value={serviceDeliverables}
                    onChange={(e) => setServiceDeliverables(e.target.value)}
                    rows={3}
                    maxLength={500}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Timeline</label>
                    <Input
                      placeholder="e.g. 5 business days"
                      value={serviceTimeline}
                      onChange={(e) => setServiceTimeline(e.target.value)}
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Service Area</label>
                    <Input
                      placeholder="e.g. Dubai, UAE / Remote"
                      value={serviceArea}
                      onChange={(e) => setServiceArea(e.target.value)}
                      maxLength={80}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Creator: demo reel + portfolio ───────────────────────────── */}
          {listingMode === "creator" && creatorProfile && (
            <Card className="border-bareter-teal/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Video className="h-4 w-4 text-bareter-teal" />Creator Showcase</CardTitle>
                <CardDescription>Upload a demo reel, add portfolio links, and describe your rates so brands know exactly what they're getting</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Demo reel */}
                <div>
                  <label className="text-sm font-medium block mb-1.5">Demo Reel / Short-form Sample <span className="text-muted-foreground font-normal text-xs">(optional, max 100MB)</span></label>
                  <input ref={demoVideoRef} type="file" accept="video/*" className="hidden" onChange={e => handleDemoVideoUpload(e.target.files?.[0] ?? null)} />
                  {demoVideoUrl ? (
                    <div className="relative rounded-lg overflow-hidden border aspect-video bg-black">
                      <video src={demoVideoUrl} controls className="w-full h-full object-contain" />
                      <button type="button" onClick={() => setDemoVideoUrl(null)} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" className="w-full h-16 border-dashed gap-2 text-sm border-bareter-teal/40 text-bareter-teal hover:bg-bareter-teal/5" onClick={() => demoVideoRef.current?.click()} disabled={uploadingDemoVideo}>
                      {uploadingDemoVideo ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading reel…</> : <><Video className="h-4 w-4" />Upload demo reel or short-form sample</>}
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">TikTok clips, Reels, YouTube Shorts, UGC demos — any format. Shows directly in your listing.</p>
                </div>

                {/* Portfolio links */}
                <div>
                  <label className="text-sm font-medium block mb-1.5">Portfolio / Sample Work Links</label>
                  <div className="space-y-2">
                    {portfolioLinks.map((link, i) => (
                      <div key={i} className="flex gap-2">
                        <Input placeholder="https://instagram.com/p/… or portfolio URL" value={link} onChange={e => setPortfolioLinks(p => p.map((l, j) => j === i ? e.target.value : l))} className="text-sm" />
                        {portfolioLinks.length > 1 && (
                          <button type="button" onClick={() => setPortfolioLinks(p => p.filter((_, j) => j !== i))} className="text-destructive"><X className="h-4 w-4" /></button>
                        )}
                      </div>
                    ))}
                    {portfolioLinks.length < 5 && (
                      <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2 text-muted-foreground" onClick={() => setPortfolioLinks(p => [...p, ""])}>
                        <Plus className="h-3.5 w-3.5 mr-1" />Add another link
                      </Button>
                    )}
                  </div>
                </div>

                {/* Rate card / what brands get */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">What brands get <span className="text-muted-foreground font-normal text-xs">(your rate card / deliverables)</span></label>
                  <Textarea
                    placeholder="e.g. 1× TikTok video (60s), 3× Instagram Stories, 1× Reel — raw footage included. Turnaround 5 days. 1 revision round."
                    value={creatorRateCard}
                    onChange={e => setCreatorRateCard(e.target.value)}
                    rows={3}
                    maxLength={600}
                  />
                </div>
              </CardContent>
            </Card>
          )}

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
                          onClick={() => {
                            if (Capacitor.isNativePlatform()) {
                              handleNativeCameraCapture();
                            } else {
                              fileInputRef.current?.click();
                            }
                          }}
                          disabled={uploadingImages}
                          data-testid="button-upload-images"
                        >
                          {uploadingImages ? (
                            <><Loader2 className="h-5 w-5 animate-spin" />{t("create.uploading")}</>
                          ) : (
                            <><Camera className="h-5 w-5" />
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

              {/* Video clip — optional, max 30s / 50MB */}
              {selectedType === "offer" && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Short video clip (optional)</p>
                  <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => handleVideoUpload(e.target.files?.[0] ?? null)} />
                  {videoUrl ? (
                    <div className="relative rounded-lg overflow-hidden border aspect-video bg-black">
                      <video src={videoUrl} controls className="w-full h-full object-contain" />
                      <button type="button" onClick={() => setVideoUrl(null)} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" className="w-full h-14 border-dashed gap-2 text-sm" onClick={() => videoInputRef.current?.click()} disabled={uploadingVideo}>
                      {uploadingVideo ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading…</> : <><Video className="h-4 w-4" />Add a short video</>}
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">Shows in the listing gallery. Max 50MB.</p>
                </div>
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
          <Card className={`border-2 transition-colors ${isCollab ? "border-bareter-teal" : "border-transparent"}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${isCollab ? "bg-bareter-teal/10" : "bg-muted"}`}>
                    <Camera className={`h-5 w-5 ${isCollab ? "text-bareter-teal" : ""}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">Brand Collab Listing</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Offer your product/service in exchange for creator content</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCollab(!isCollab)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${isCollab ? "bg-bareter-teal" : "bg-muted-foreground/20"}`}
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

      <PhoneVerificationModal
        open={showPhoneModal}
        existingPhone={(user as any)?.phone}
        onVerified={() => {
          setShowPhoneModal(false);
          if (pendingSubmitData) {
            createMutation.mutate(pendingSubmitData);
            setPendingSubmitData(null);
          }
        }}
        onClose={() => { setShowPhoneModal(false); setPendingSubmitData(null); }}
      />
    </div>
  );
}
