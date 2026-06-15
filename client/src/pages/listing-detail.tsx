import { useState, useEffect, useRef } from "react";
import { useSeo } from "@/hooks/use-seo";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trackEvent } from "@/lib/posthog";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useWaitlist } from "@/lib/waitlist";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ListingWithUser, Listing, ListingCommentWithUser } from "@shared/schema";
import {
  MapPin,
  Package,
  ShoppingCart,
  Shield,
  Star,
  Eye,
  Calendar,
  Tag,
  Handshake,
  ArrowLeft,
  Loader2,
  MessageSquare,
  ExternalLink,
  ArrowLeftRight,
  ArrowRightLeft,
  Sparkles,
  CheckCircle,
  ClipboardList,
  Heart,
  Bookmark,
  Send,
  AlertTriangle,
  Flag,
  Zap,
  Award,
  Play,
  Info,
  Languages,
  Search,
  Upload,
  X,
  ImageIcon,
  Users,
  Camera,
  TrendingUp,
  Clock,
} from "lucide-react";
import type { ServiceTier } from "@shared/schema";
import { VerifiedBadge, TrustBadges } from "@/components/verified-badge";
import { FounderBadge } from "@/components/founder-badge";
import type { ExchangeItem } from "@shared/schema";
import { getDeliverablesForListing, type DeliverableItem } from "@shared/deliverables";
import { ShareMenu } from "@/components/share-menu";
import { ReportModal } from "@/components/report-modal";
import { timeAgo, formatValue } from "@/lib/utils";
import { ValueMatchBadge } from "@/components/ValueMatchBadge";
import { ReviewModal } from "@/components/ReviewModal";
import { ReputationBadge } from "@/components/ReputationBadge";
import { StarRating } from "@/components/StarRating";

const _listingTranslationCache = new Map<string, { title: string; description: string }>();

// ── Renders saved categoryDetails in a clean labelled grid ──────────────────
const LABEL_MAP: Record<string, string> = {
  // Common
  condition:"Condition", brand:"Brand", model:"Model", color:"Colour",
  year:"Year", make:"Make", dimensions:"Dimensions", material:"Material",
  // Hospitality
  propertyType:"Property Type", propertyName:"Property Name", starRating:"Star Rating",
  roomType:"Room Type", nights:"Nights", rooms:"Rooms", bedConfig:"Bed Configuration",
  maxOccupancy:"Max Occupancy", checkinFrom:"Check-in From", checkinUntil:"Check-in Until",
  advanceNotice:"Advance Notice", minStay:"Minimum Stay", mealPlan:"Meal Plan",
  cancellationPolicy:"Cancellation Policy", specialTerms:"Terms / Exclusions",
  contentPlatforms:"Content Platforms", contentTypes:"Content Types Required",
  minFollowers:"Min Followers", creatorNiche:"Creator Niche",
  requiredHashtags:"Required Hashtags", keyMessages:"Key Messages",
  postingDeadline:"Posting Deadline",
  // Real estate / Room rental
  sizeSqft:"Size (sqft)", plotSqft:"Plot Size (sqft)", bedrooms:"Bedrooms",
  bathrooms:"Bathrooms", furnishing:"Furnishing", view:"View", buildingName:"Building / Development",
  paymentTerms:"Payment Terms", amenities:"Amenities", unitFeatures:"Unit Features",
  availableFrom:"Available From", availableUntil:"Available Until",
  rentalDuration:"Rental Duration", utilitiesIncluded:"Utilities Included",
  rules:"House Rules", tenantPreference:"Tenant Preference",
  nationalityPref:"Nationality Preference", floor:"Floor",
  // Office
  spaceType:"Space Type", buildingGrade:"Building Grade", capacity:"Capacity",
  fitout:"Fit-out", minRental:"Min Rental Period", jurisdiction:"Freezone / Mainland",
  // Automotive
  vehicleType:"Vehicle Type", mileageKm:"Mileage (km)", engine:"Engine",
  fuelType:"Fuel Type", transmission:"Transmission", interiorColor:"Interior Colour",
  specs:"Regional Specs", doors:"Doors", serviceHistory:"Service History",
  warranty:"Warranty", gccRegistered:"GCC Registered", accidents:"Accident History",
  features:"Features & Extras", additionalNotes:"Additional Notes",
  // Yacht
  vesselType:"Vessel Type", lengthFt:"Length (ft)", engineHours:"Engine Hours",
  engineDetails:"Engine Details", marina:"Marina / Location", offeringType:"Offering Type",
  flag:"Flag / Registration",
  // Electronics
  deviceType:"Device Type", storage:"Storage", ram:"RAM", region:"Region",
  batteryHealth:"Battery Health", accessories:"Accessories Included",
  // Gaming
  gamingType:"Type", platform:"Platform", titleModel:"Title / Model",
  format:"Format", includes:"Included",
  // Fashion
  fashionCategory:"Category", size:"Size", gender:"Gender",
  // Jewelry
  jewelryType:"Item Type", metal:"Metal", stone:"Stone", stoneCarat:"Stone Carat",
  movement:"Watch Movement", caseSize:"Case Size (mm)",
  // Beauty
  beautyType:"Type", productName:"Product / Service", sizeVolume:"Size / Volume",
  expiryDate:"Expiry Date", suitableFor:"Suitable For",
  certifications:"Certifications", serviceLocation:"Service Location",
  qualifications:"Qualifications",
  // Food
  foodType:"Type", providerName:"Provider / Restaurant", cuisine:"Cuisine",
  serves:"Serves (persons)", mealType:"Meal Type", duration:"Duration",
  dietary:"Dietary Options", menuDescription:"Menu Description", terms:"Terms",
  // Sports & Fitness
  sportsType:"Type", sportCategory:"Sport Category", targetLevel:"Level",
  sessions:"Sessions / Classes", validUntil:"Valid Until", location:"Location",
  // Home Appliances
  applianceType:"Appliance Type", voltage:"Voltage",
  // Furniture
  furnitureType:"Item Type", assembly:"Assembly",
  // Garden & Outdoor
  gardenType:"Type",
  // Tools
  toolType:"Type", powerSource:"Power Source", hoursUsed:"Hours of Use",
  // Pets
  petsType:"Animal Type", breed:"Breed", age:"Age", health:"Health Status",
  papers:"Papers & Pedigree",
  // Books
  mediaType:"Type", title:"Title", author:"Author", genre:"Genre",
  language:"Language", quantity:"Quantity",
  // Musical instruments
  instrumentType:"Instrument Type",
  // Art
  artType:"Type", artist:"Artist / Maker", medium:"Medium",
  documentation:"Documentation", frameStatus:"Frame",
  // Luggage
  luggageType:"Type", wheels:"Wheels", lock:"Lock Type",
  // Services
  serviceCategory:"Service Category", serviceTitle:"Service Title",
  deliverables:"Deliverables", deliveryTimeline:"Delivery Timeline",
  revisions:"Revisions", experienceLevel:"Experience Level",
  languages:"Languages", packageBasic:"Basic Package",
  packageStandard:"Standard Package", packagePremium:"Premium Package",
  requirements:"Requirements from Client", tools:"Tools Used", portfolio:"Portfolio",
  // Brand collab
  offeringCategory:"Offering Category", offeringName:"Offering Name",
  offeringDescription:"Offering Description", retailValue:"Retail Value (AED)",
  spotsAvailable:"Spots Available", platforms:"Platforms",
  contentFormats:"Content Formats", contentCount:"Content Pieces",
  minEngagement:"Min Engagement Rate", creatorLocation:"Creator Location",
  requiredMentions:"Required Tags / Mentions", toneStyle:"Tone & Style",
  usageRights:"Content Usage Rights",
};

function CategoryDetailsDisplay({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(([, v]) => {
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
  if (entries.length === 0) return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="bg-muted/40 px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">Listing Details</h3>
      </div>
      <div className="divide-y divide-border">
        {entries.map(([key, value]) => {
          const label = LABEL_MAP[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
          const display = Array.isArray(value) ? value.join(", ") : String(value);
          return (
            <div key={key} className="flex gap-3 px-4 py-3 text-sm">
              <span className="text-muted-foreground min-w-[160px] flex-shrink-0">{label}</span>
              <span className="font-medium text-foreground flex-1">{display}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { gate } = useWaitlist();
  const { toast } = useToast();
  const { t, language, isRTL } = useI18n();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const [proposeOpen, setProposeOpen] = useState(searchParams.get("propose") === "true");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [counterOffer, setCounterOffer] = useState("");
  const [counterValue, setCounterValue] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>([]);
  const [newDeliverable, setNewDeliverable] = useState("");
  const [inquirySent, setInquirySent] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<{ title: string; description: string } | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const translationCacheRef = _listingTranslationCache;

  // Collab apply state
  const [collabApplyOpen, setCollabApplyOpen] = useState(false);
  const [collabPitch, setCollabPitch] = useState("");
  const [collabHandle, setCollabHandle] = useState("");
  const [collabFollowers, setCollabFollowers] = useState("");
  const [collabPortfolioLink, setCollabPortfolioLink] = useState("");

  const { data: listing, isLoading } = useQuery<ListingWithUser>({
    queryKey: ["/api/listings", id],
  });

  const { data: myListings } = useQuery<Listing[]>({
    queryKey: ["/api/listings/user", user?.id],
    enabled: !!user,
  });

  const { data: wishlistCheck } = useQuery<{ isWishlisted: boolean }>({
    queryKey: ["/api/wishlist/check", id],
    enabled: !!user && !!id,
  });

  const toggleWishlistMutation = useMutation({
    mutationFn: async () => {
      if (wishlistCheck?.isWishlisted) {
        await apiRequest("DELETE", `/api/wishlist/${id}`);
      } else {
        await apiRequest("POST", `/api/wishlist/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist/check", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: wishlistCheck?.isWishlisted ? "Removed from saved" : "Saved to favourites" });
    },
    onError: () => toast({ title: "Failed to update saved listings", variant: "destructive" }),
  });

  useSeo({
    title: listing ? `${listing.title} — Bareter` : "Listing — Bareter",
    description: listing?.description
      ? listing.description.slice(0, 160)
      : "View this barter listing on Bareter — UAE's cashless B2B marketplace.",
    canonical: `${window.location.origin}/listings/${id}`,
  });

  const viewedRef = useRef(false);
  const dwellTimerRef = useRef<number | null>(null);
  const composerStartedRef = useRef(false);
  useEffect(() => {
    if (listing && !viewedRef.current) {
      viewedRef.current = true;
      trackEvent("listing_viewed", {
        listing_id: listing.id,
        listing_category: (listing.categories as string[] | undefined)?.[0],
        listing_value: listing.retailValue ? parseFloat(String(listing.retailValue)) : undefined,
      });
      // Engagement view event — gated by 10s dwell so bounces don't pollute the log.
      if (user) {
        const listingId = listing.id;
        dwellTimerRef.current = window.setTimeout(() => {
          dwellTimerRef.current = null;
          apiRequest("POST", "/api/engagement/track", {
            eventType: "viewed",
            listingId,
          }).catch(() => { /* best-effort */ });
        }, 10_000);
      }
    }
    return () => {
      if (dwellTimerRef.current !== null) {
        window.clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
    };
  }, [listing, user]);

  // Reset deliverables when modal opens/closes
  useEffect(() => {
    if (!proposeOpen) {
      setDeliverables([]);
      setNewDeliverable("");
    }
  }, [proposeOpen]);

  // Debounced dynamic deliverables — generated from what the proposer types, not the listing
  const deliverableDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (deliverableDebounceRef.current) clearTimeout(deliverableDebounceRef.current);
    if (!counterOffer.trim()) {
      setDeliverables([]);
      return;
    }
    deliverableDebounceRef.current = setTimeout(() => {
      const items = getDeliverablesForListing(counterOffer, counterOffer, []);
      setDeliverables(items);
    }, 500);
    return () => {
      if (deliverableDebounceRef.current) clearTimeout(deliverableDebounceRef.current);
    };
  }, [counterOffer]);

  const toggleDeliverable = (index: number) => {
    setDeliverables(prev => prev.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item
    ));
  };

  const addCustomDeliverable = () => {
    const label = newDeliverable.trim();
    if (!label) return;
    setDeliverables(prev => [...prev, { label, checked: true }]);
    setNewDeliverable("");
  };

  const handleTranslateListing = async () => {
    if (!listing) return;
    if (showTranslated) { setShowTranslated(false); return; }
    const targetLang = "ar";
    const cacheKey = `${listing.id}-${targetLang}`;
    if (translationCacheRef.has(cacheKey)) {
      setTranslation(translationCacheRef.get(cacheKey)!);
      setShowTranslated(true);
      return;
    }
    setTranslating(true);
    try {
      const textToTranslate = `TITLE: ${listing.title}\nDESCRIPTION: ${listing.description || ""}`;
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: textToTranslate, targetLang }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Translation failed");
      }
      const data = await res.json();
      const translated = {
        title: data.title || listing.title,
        description: data.description || (listing.description || ""),
      };
      translationCacheRef.set(cacheKey, translated);
      setTranslation(translated);
      setShowTranslated(true);
    } catch (e: any) {
      toast({ title: e?.message || t("translate.error"), variant: "destructive" });
    } finally {
      setTranslating(false);
    }
  };

  const proposeTradeMutation = useMutation({
    mutationFn: async (data: {
      providerListingId: string;
      seekerOffer: string;
      seekerValue: string;
      deliverables: DeliverableItem[];
    }) => {
      const res = await apiRequest("POST", "/api/deals", {
        providerListingId: data.providerListingId,
        seekerOffer: data.seekerOffer,
        seekerValue: data.seekerValue,
        deliverables: data.deliverables,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      trackEvent("barter_proposed", { deal_id: data.id });
      toast({
        title: t("listingDetail.barterProposed"),
        description: t("listingDetail.barterProposedDesc"),
      });
      navigate(`/deals/${data.id}`);
    },
    onError: (error: any) => {
      toast({
        title: t("listingDetail.failedToPropose"),
        description: error.message || t("common.somethingWentWrong"),
        variant: "destructive",
      });
    },
  });

  const [commentOfferName, setCommentOfferName] = useState("");
  const [commentOfferValue, setCommentOfferValue] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [commentDescription, setCommentDescription] = useState("");
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const [uploadingCommentImages, setUploadingCommentImages] = useState(false);
  const commentImageInputRef = useRef<HTMLInputElement>(null);

  // Counter-offer state (for proposal counter-offer flow)
  const [counteringProposalId, setCounteringProposalId] = useState<string | null>(null);
  const [ctrName, setCtrName] = useState("");
  const [ctrValue, setCtrValue] = useState("");
  const [ctrDesc, setCtrDesc] = useState("");

  // Review modal state
  const [reviewProposal, setReviewProposal] = useState<{ id: string; otherPartyName: string } | null>(null);

  const { data: similarListings } = useQuery<any[]>({
    queryKey: ["/api/listings", id, "similar"],
    queryFn: async () => {
      const res = await fetch(`/api/listings/${id}/similar?limit=6`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  const { data: userReviews } = useQuery<{ avgRating: number; reviewCount: number; reviews: any[] }>({
    queryKey: ["/api/users", listing?.userId, "reviews"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${listing!.userId}/reviews`, { credentials: "include" });
      if (!res.ok) return { avgRating: 0, reviewCount: 0, reviews: [] };
      return res.json();
    },
    enabled: !!listing?.userId,
  });

  const respondCommentMutation = useMutation({
    mutationFn: async ({ commentId, status }: { commentId: string; status: "accepted" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/listings/${id}/proposals/${commentId}`, { status });
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id, "comments"] });
      if (vars.status === "accepted") {
        toast({ title: "Proposal accepted! Taking you to the deal…" });
        setTimeout(() => {
          if (data?.dealId) {
            navigate(`/deals/${data.dealId}`);
          } else {
            navigate("/deals");
          }
        }, 800);
      } else {
        toast({ title: "Proposal declined" });
      }
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to respond", variant: "destructive" }),
  });

  const counterOfferMutation = useMutation({
    mutationFn: async ({ proposalId, name, value, description }: { proposalId: string; name: string; value: string; description: string }) => {
      const res = await apiRequest("POST", `/api/listings/${id}/proposals/${proposalId}/counter`, { name, value, description, images: [] });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id, "comments"] });
      setCounteringProposalId(null);
      setCtrName(""); setCtrValue(""); setCtrDesc("");
      toast({ title: "Counter-offer sent!", description: "The proposer has been notified." });
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to send counter-offer", variant: "destructive" }),
  });

  const counterRespondMutation = useMutation({
    mutationFn: async ({ proposalId, response }: { proposalId: string; response: "accepted" | "rejected" }) => {
      const res = await apiRequest("POST", `/api/listings/${id}/proposals/${proposalId}/counter-respond`, { response });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id, "comments"] });
      toast({ title: vars.response === "accepted" ? "Counter-offer accepted!" : "Counter-offer declined" });
      if (vars.response === "accepted") {
        const comment = listingComments?.find(c => c.id === vars.proposalId);
        if (comment) setReviewProposal({ id: vars.proposalId, otherPartyName: (listing as any)?.user?.fullName || "Listing owner" });
      }
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to respond", variant: "destructive" }),
  });

  const { data: listingComments } = useQuery<ListingCommentWithUser[]>({
    queryKey: ["/api/listings", id, "comments"],
    enabled: !!id,
  });

  // Collab applications — fetched only when owner of a collab listing
  const { data: collabApplications = [] } = useQuery<any[]>({
    queryKey: ["/api/listings", id, "collab-applications"],
    queryFn: async () => {
      const res = await fetch(`/api/listings/${id}/collab/applications`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id && !!user && !!(listing as any)?.isCollab && user.id === listing?.userId,
  });

  // My application for this collab (creator)
  const { data: myCollabApp } = useQuery<any>({
    queryKey: ["/api/listings", id, "my-collab-app"],
    queryFn: async () => {
      const res = await fetch(`/api/me/collab/applications`, { credentials: "include" });
      if (!res.ok) return null;
      const all = await res.json();
      return all.find((a: any) => a.listingId === id) ?? null;
    },
    enabled: !!id && !!user && !!(listing as any)?.isCollab && user.id !== listing?.userId,
  });

  const applyCollabMutation = useMutation({
    mutationFn: async (data: { pitch: string; socialHandle: string; followerCount: string; portfolioLink: string }) => {
      const res = await apiRequest("POST", `/api/listings/${id}/collab/apply`, {
        pitch: data.pitch,
        socialHandle: data.socialHandle || undefined,
        followerCount: data.followerCount ? parseInt(data.followerCount) : undefined,
        portfolioLink: data.portfolioLink || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id, "my-collab-app"] });
      setCollabApplyOpen(false);
      setCollabPitch(""); setCollabHandle(""); setCollabFollowers(""); setCollabPortfolioLink("");
      toast({ title: "Application submitted!", description: "The brand will review your application and get back to you." });
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to submit application", variant: "destructive" }),
  });

  const respondCollabMutation = useMutation({
    mutationFn: async ({ appId, status, note }: { appId: string; status: "accepted" | "rejected"; note?: string }) => {
      const res = await apiRequest("PATCH", `/api/listings/${id}/collab/applications/${appId}`, { status, brandNote: note });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id, "collab-applications"] });
      toast({ title: vars.status === "accepted" ? "Application accepted! A deal has been created." : "Application declined." });
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to update application", variant: "destructive" }),
  });

  const listingLikeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/listings/${id}/like`);
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/listings", id] });
      const previous = queryClient.getQueryData<any>(["/api/listings", id]);
      if (previous) {
        queryClient.setQueryData(["/api/listings", id], {
          ...previous,
          isLiked: !previous.isLiked,
          likeCount: previous.isLiked ? Math.max(0, (previous.likeCount || 0) - 1) : (previous.likeCount || 0) + 1,
        });
      }
      return { previous };
    },
    onError: (error: any, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["/api/listings", id], context.previous);
      toast({ title: t("common.error"), description: error.message || t("common.couldNotUpdateLike"), variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/liked"] });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: { content: string | null; offerItemName: string; offerItemValue: string; offerDescription: string | null; images: string[] }) => {
      const res = await apiRequest("POST", `/api/listings/${id}/comments`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/listings", id, "comments"] });
      setCommentOfferName("");
      setCommentOfferValue("");
      setCommentMessage("");
      setCommentDescription("");
      setCommentImages([]);
      toast({ title: t("listingDetail.proposalPosted"), description: t("listingDetail.proposalPostedDesc") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const handleCommentImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingCommentImages(true);
    try {
      const urls = await Promise.all(Array.from(files).map(async (file) => {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image file`);
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} exceeds 5MB limit`);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "listing");
        const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
        if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Upload failed"); }
        return (await res.json()).url as string;
      }));
      setCommentImages(prev => [...prev, ...urls]);
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message || "Could not upload image", variant: "destructive" });
    } finally {
      setUploadingCommentImages(false);
      if (commentImageInputRef.current) commentImageInputRef.current.value = "";
    }
  };

  const removeCommentImage = (index: number) => {
    setCommentImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitComment = () => {
    if (!commentOfferName || !commentOfferValue) return;
    if (commentImages.length < 2) {
      toast({ title: "Images required", description: "Please upload at least 2 images of your offer", variant: "destructive" });
      return;
    }
    createCommentMutation.mutate({
      content: commentMessage || null,
      offerItemName: commentOfferName,
      offerItemValue: commentOfferValue,
      offerDescription: commentDescription || null,
      images: commentImages,
    });
  };

  const quickInquiryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/inquiries", {
        toUserId: listing?.userId,
        listingId: listing?.id,
        message: "Is this still available?",
      });
      return res.json();
    },
    onSuccess: () => {
      setInquirySent(true);
      toast({ title: t("listingDetail.inquirySent"), description: t("listingDetail.sellerNotified") });
    },
    onError: () => {
      toast({ title: t("listingDetail.couldNotSend"), description: t("listingDetail.pleaseRetry"), variant: "destructive" });
    },
  });

  const conditionConfig: Record<string, { label: string; color: string }> = {
    new: { label: t("listingDetail.conditionNew"), color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    like_new: { label: t("listingDetail.conditionLikeNew"), color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    excellent: { label: t("listingDetail.conditionExcellent"), color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    good: { label: t("listingDetail.conditionGood"), color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    fair: { label: t("listingDetail.conditionFair"), color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
    refurbished: { label: t("listingDetail.conditionRefurbished"), color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  };

  const tierConfig: Record<string, { icon: string; color: string; bg: string; border: string }> = {
    bronze: { icon: "🥉", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20", border: "border-orange-200 dark:border-orange-800" },
    silver: { icon: "🥈", color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-900/20", border: "border-slate-200 dark:border-slate-700" },
    gold: { icon: "🥇", color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/20", border: "border-yellow-200 dark:border-yellow-800" },
  };

  const handleProposeTrade = () => {
    if (!listing || !counterOffer || !counterValue) return;
    proposeTradeMutation.mutate({
      providerListingId: listing.id,
      seekerOffer: counterOffer,
      seekerValue: counterValue,
      deliverables,
    });
  };

  if (isLoading) {
    return (
      <div className="bg-bareter-off-white dark:bg-background min-h-screen">
        <div className="container px-4 py-8 mx-auto max-w-7xl">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
            <div className="space-y-6">
              <Skeleton className="aspect-video rounded-bareter-card" />
              <Skeleton className="h-32 rounded-bareter-card" />
            </div>
            <div>
              <Skeleton className="h-64 rounded-bareter-card" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold mb-2">{t("listingDetail.listingNotFound")}</h2>
        <p className="text-muted-foreground mb-4">
          {t("listingDetail.listingNotFoundDesc")}
        </p>
        <Link href="/browse">
          <Button>{t("listingDetail.browseListings")}</Button>
        </Link>
      </div>
    );
  }

  const isOwnListing = user?.id === listing.userId;
  const createdDate = listing.createdAt ? new Date(listing.createdAt).toLocaleDateString() : "N/A";

  return (
    <div className="bg-bareter-off-white dark:bg-background min-h-screen pb-24 lg:pb-8">
      <div className="container px-4 py-6 mx-auto max-w-7xl">
      <nav aria-label="Breadcrumb" className="text-caption mb-4 flex items-center gap-1.5 flex-wrap">
        <Link href="/" className="hover:text-bareter-teal">{t("listingDetail.home")}</Link>
        <span aria-hidden="true">{isRTL ? "‹" : "›"}</span>
        <Link href="/browse" className="hover:text-bareter-teal">{t("listingDetail.listings")}</Link>
        {(listing.categories || [])[0] && (
          <>
            <span aria-hidden="true">{isRTL ? "‹" : "›"}</span>
            <span className="text-bareter-navy dark:text-foreground">{(listing.categories || [])[0]}</span>
          </>
        )}
        {listing.location && (
          <>
            <span aria-hidden="true">{isRTL ? "‹" : "›"}</span>
            <span className="text-bareter-navy dark:text-foreground">{listing.location}</span>
          </>
        )}
      </nav>

      <Link href="/browse" className="inline-flex items-center gap-2 text-bareter-muted hover:text-bareter-teal mb-4 text-sm">
        <ArrowLeft className={`h-4 w-4 ${isRTL ? "rotate-180" : ""}`} />
        {t("listingDetail.backToListings")}
      </Link>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
        <div className="space-y-6 min-w-0">
          <button
            type="button"
            onClick={() => listing.images && listing.images.length > 0 && setLightboxIndex(0)}
            className="group relative block w-full rounded-bareter-card overflow-hidden bg-bareter-off-white dark:bg-muted aspect-video shadow-bareter-card cursor-zoom-in disabled:cursor-default"
            disabled={!listing.images || listing.images.length === 0}
            data-testid="button-open-lightbox"
            aria-label="Open image gallery"
          >
            {listing.images && listing.images.length > 0 ? (
              <img
                src={listing.images[0]}
                alt={listing.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                {listing.type === "offer" ? (
                  <Package className="h-24 w-24 text-primary/30" />
                ) : (
                  <ShoppingCart className="h-24 w-24 text-primary/30" />
                )}
              </div>
            )}
            <Badge
              variant={listing.type === "offer" ? "default" : "secondary"}
              className="absolute top-4 start-4"
            >
              {listing.type === "offer" ? (
                <><Package className="h-3 w-3 me-1" /> {t("listingDetail.offer")}</>
              ) : (
                <><ShoppingCart className="h-3 w-3 me-1" /> {t("listingDetail.request")}</>
              )}
            </Badge>
          </button>

          {listing.images && listing.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" data-testid="strip-thumbnails">
              {listing.images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="relative h-20 w-20 flex-shrink-0 rounded-md overflow-hidden border border-bareter-border dark:border-border hover:border-bareter-teal transition-colors"
                  data-testid={`button-thumbnail-${i}`}
                  aria-label={`Open image ${i + 1}`}
                >
                  <img src={img} alt={`${listing.title} ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Video embed */}
          {(listing as any).videoUrl && (
            <div className="rounded-bareter-card overflow-hidden border border-bareter-border dark:border-border" data-testid="listing-video">
              <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-bareter-border dark:border-border">
                <Play className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{t("listingDetail.video")}</span>
              </div>
              <div className="aspect-video">
                <video
                  src={(listing as any).videoUrl}
                  controls
                  className="w-full h-full object-cover"
                  preload="metadata"
                />
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-card rounded-bareter-card border border-bareter-border dark:border-border shadow-bareter-card p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-bareter-navy dark:text-foreground" data-testid="text-listing-title">
                  {showTranslated && translation ? translation.title : listing.title}
                </h1>
                {/* Translate button — hidden until multi-language release */}
              </div>
              <div className="flex gap-2">
                {user && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={listingLikeMutation.isPending}
                    onClick={() => listingLikeMutation.mutate()}
                    data-testid="button-header-like"
                  >
                    <Heart className={`h-5 w-5 ${listing.isLiked ? "fill-destructive text-destructive" : ""}`} />
                  </Button>
                )}
                {user && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={toggleWishlistMutation.isPending}
                    onClick={() => toggleWishlistMutation.mutate()}
                    data-testid="button-header-save"
                  >
                    <Bookmark className={`h-5 w-5 ${wishlistCheck?.isWishlisted ? "fill-bareter-teal text-bareter-teal" : ""}`} />
                  </Button>
                )}
                <ShareMenu
                  url={window.location.href}
                  title={listing.title}
                  size="icon"
                  variant="ghost"
                  data-testid="button-header-share"
                />
                {(!user || listing.userId !== user.id) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (!gate()) return;
                      if (!user) { navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
                      setShowReport(true);
                    }}
                    data-testid="button-report-listing"
                    title="Report this listing"
                  >
                    <Flag className="h-5 w-5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
              {listing.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {listing.location}
                </div>
              )}
              <div className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {listing.viewCount || 0} {t("listingDetail.views")}
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {t("listingDetail.listed")} {createdDate}
              </div>
              {(listing as any).condition && conditionConfig[(listing as any).condition] && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${conditionConfig[(listing as any).condition].color}`}
                  data-testid="badge-condition"
                >
                  <Info className="h-3 w-3" />
                  {conditionConfig[(listing as any).condition].label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="text-3xl md:text-4xl font-bold text-bareter-teal" data-testid="text-listing-detail-price">
                AED {parseFloat(listing.retailValue as string).toLocaleString()}
              </div>
              {(listing as any).valueFlagged && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">{t("listingDetail.valueMayBeOutside")}</span>
                </div>
              )}
            </div>

            {/* Feed-style offering + exchange chips */}
            {(() => {
              const exchangeItems = (listing as any).exchangeItems as ExchangeItem[] | undefined;
              const wantedCategories = (listing as any).wantedCategories as string[] | undefined;
              const primaryCategory = (listing.categories || [])[0];
              const hasExchangeInfo = (exchangeItems && exchangeItems.length > 0) || (wantedCategories && wantedCategories.length > 0);
              return (
                <div className="rounded-lg bg-muted/40 border p-3 mb-4 space-y-2.5">
                  {/* OFFERING chip */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Offering</p>
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-white"
                      style={{ backgroundColor: primaryCategory ? ({"Real Estate":"#4A1D96","Automotive":"#1C2D4A","Electronics":"#1E40AF","Fashion":"#9D174D","Technology":"#1E40AF","Hospitality":"#7C2D12","Food":"#B45309","Events":"#A16207","Services":"#1A7272"}[primaryCategory] || "#136c68") : "#136c68" }}
                    >
                      <Package className="h-3.5 w-3.5" />
                      {listing.title}
                      <span className="opacity-80">AED {parseFloat(listing.retailValue as string).toLocaleString()}</span>
                    </span>
                  </div>

                  {/* WILLING TO BARTER FOR chips */}
                  {hasExchangeInfo && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Willing to barter for</p>
                      <div className="flex flex-wrap gap-1.5">
                        {exchangeItems?.slice(0, 5).map((item: ExchangeItem) => (
                          <span key={item.name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border bg-background">
                            <Search className="h-3 w-3 text-muted-foreground" />
                            {item.name}
                            {item.estimatedValue && item.estimatedValue > 0 && (
                              <span className="text-muted-foreground">~AED {Number(item.estimatedValue).toLocaleString()}</span>
                            )}
                          </span>
                        ))}
                        {wantedCategories?.map((cat: string) => (
                          <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border bg-background">
                            <Search className="h-3 w-3 text-muted-foreground" />
                            {cat}
                          </span>
                        ))}
                        {(listing as any).openToOffers && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed bg-background text-muted-foreground">
                            + Open to other offers
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex flex-wrap gap-2 mb-4">
              {(listing.categories || []).map((category) => {
                const catColor: Record<string, string> = {"Real Estate":"#4A1D96","Automotive":"#1C2D4A","Electronics":"#1E40AF","Fashion":"#9D174D","Technology":"#1E40AF","Hospitality":"#7C2D12","Food":"#B45309","Events":"#A16207","Services":"#1A7272"};
                return (
                  <Badge key={category} style={{ backgroundColor: catColor[category] || "#374151", color: "white" }}>
                    {category}
                  </Badge>
                );
              })}
            </div>

            {/* Hashtag-style tags */}
            {(listing.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {(listing.tags || []).map((tag) => (
                  <span key={tag} className="text-xs text-primary font-medium">#{tag.replace(/^#/, "")}</span>
                ))}
              </div>
            )}

            <Separator className="my-6" />

            <div>
              <h3 className="font-semibold mb-3">{t("listingDetail.description")}</h3>
              <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                {showTranslated && translation ? translation.description : listing.description}
              </p>
            </div>

            {/* ── Category-specific details ── */}
            {(listing as any).categoryDetails && Object.keys((listing as any).categoryDetails).length > 0 && (
              <CategoryDetailsDisplay details={(listing as any).categoryDetails} />
            )}

            {/* Service tiers (Bronze / Silver / Gold) */}
            {(listing as any).serviceTiers && ((listing as any).serviceTiers as ServiceTier[]).length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  {t("listingDetail.servicePackages")}
                </h3>
                <div className="grid sm:grid-cols-3 gap-3" data-testid="service-tiers">
                  {((listing as any).serviceTiers as ServiceTier[]).map((tier, idx) => {
                    const key = tier.name.toLowerCase();
                    const cfg = tierConfig[key] || tierConfig.bronze;
                    return (
                      <div
                        key={idx}
                        className={`rounded-lg border p-4 ${cfg.bg} ${cfg.border}`}
                        data-testid={`tier-${key}`}
                      >
                        <div className={`text-sm font-bold mb-1 flex items-center gap-1 ${cfg.color}`}>
                          <span>{cfg.icon}</span>
                          {tier.name}
                        </div>
                        <div className="text-lg font-bold mb-2">
                          AED {tier.value.toLocaleString()}
                        </div>
                        {tier.description && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{tier.description}</p>
                        )}
                        {tier.deliverables.length > 0 && (
                          <ul className="space-y-1">
                            {tier.deliverables.map((d, di) => (
                              <li key={di} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" />
                                {d}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(((listing as any).exchangeItems?.length > 0) || ((listing as any).wantedCategories?.length > 0)) && (
              <div className="mt-6">
                <Separator className="mb-6" />
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ArrowLeftRight className="h-5 w-5 text-primary" />
                      {t("listingDetail.whatIWantInExchange")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {((listing as any).exchangeItems as ExchangeItem[] || []).filter((item: ExchangeItem) => item.isPriority).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5 text-primary">
                          <Star className="h-4 w-4 fill-current" />
                          {t("listingDetail.priorityItems")}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {((listing as any).exchangeItems as ExchangeItem[] || [])
                            .filter((item: ExchangeItem) => item.isPriority)
                            .map((item: ExchangeItem) => (
                              <Badge key={item.name} className="gap-1">
                                <Star className="h-3 w-3 fill-current" />
                                {item.name}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}

                    {((listing as any).exchangeItems as ExchangeItem[] || []).filter((item: ExchangeItem) => !item.isPriority).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5 text-muted-foreground">
                          <Sparkles className="h-4 w-4" />
                          {t("listingDetail.alsoOpenTo")}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {((listing as any).exchangeItems as ExchangeItem[] || [])
                            .filter((item: ExchangeItem) => !item.isPriority)
                            .map((item: ExchangeItem) => (
                              <Badge key={item.name} variant="secondary">
                                {item.name}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}

                    {((listing as any).wantedCategories as string[] || []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 text-muted-foreground">{t("listingDetail.preferredCategories")}</h4>
                        <div className="flex flex-wrap gap-2">
                          {((listing as any).wantedCategories as string[] || []).map((category: string) => (
                            <Badge key={category} variant="outline">
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {(listing as any).openToOffers && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>{t("listingDetail.openToOtherOffers")}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* ── Collab Details — shown for isCollab listings ── */}
          {(listing as any).isCollab && (() => {
            const cd = (listing as any).collabDetails as any;
            if (!cd) return null;
            const isCreator = user?.signupType === "creator";
            const isOwnCollab = user?.id === listing.userId;
            return (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Camera className="h-5 w-5 text-primary" />
                    Brand Collab Opportunity
                    <Badge className="ml-auto text-xs bg-primary/20 text-primary border-primary/30">Collab</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {cd.contentBrief && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Content Brief</p>
                      <p className="text-sm text-foreground leading-relaxed">{cd.contentBrief}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {cd.contentType && (
                      <div className="rounded-lg bg-background border p-3 text-center">
                        <Camera className="h-4 w-4 text-primary mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Content Type</p>
                        <p className="text-sm font-semibold capitalize">{cd.contentType.replace(/_/g, " ")}</p>
                      </div>
                    )}
                    {cd.requiredFollowers > 0 && (
                      <div className="rounded-lg bg-background border p-3 text-center">
                        <Users className="h-4 w-4 text-primary mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Min Followers</p>
                        <p className="text-sm font-semibold">{cd.requiredFollowers >= 1000 ? `${(cd.requiredFollowers / 1000).toFixed(0)}K+` : cd.requiredFollowers}</p>
                      </div>
                    )}
                    {cd.deliverables > 0 && (
                      <div className="rounded-lg bg-background border p-3 text-center">
                        <ClipboardList className="h-4 w-4 text-primary mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Deliverables</p>
                        <p className="text-sm font-semibold">{cd.deliverables} piece{cd.deliverables !== 1 ? "s" : ""}</p>
                      </div>
                    )}
                    {cd.productValue > 0 && (
                      <div className="rounded-lg bg-background border p-3 text-center">
                        <TrendingUp className="h-4 w-4 text-primary mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Product Value</p>
                        <p className="text-sm font-semibold">AED {cd.productValue.toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                  {cd.requiredPlatforms?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Platforms</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cd.requiredPlatforms.map((p: string) => (
                          <Badge key={p} variant="secondary" className="capitalize">{p}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {cd.deadline && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>Deadline: <strong className="text-foreground">{new Date(cd.deadline).toLocaleDateString()}</strong></span>
                    </div>
                  )}
                  {cd.usageRights && (
                    <div className="text-xs text-muted-foreground">
                      Usage rights: {cd.usageRights === "creator_only" ? "Creator use only" : cd.usageRights === "brand_social" ? "Brand can use on social" : "Brand unlimited use"}
                    </div>
                  )}
                  {!isOwnCollab && (
                    <div className="pt-2 border-t">
                      {isCreator ? (
                        myCollabApp ? (
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="font-medium">
                              Application {myCollabApp.status === "accepted" ? "accepted ✓" : myCollabApp.status === "rejected" ? "declined" : "submitted — pending review"}
                            </span>
                          </div>
                        ) : (
                          <Button variant="bareter" className="w-full gap-2" onClick={() => setCollabApplyOpen(true)}>
                            <Camera className="h-4 w-4" />
                            Apply to This Collab
                          </Button>
                        )
                      ) : (
                        <p className="text-xs text-muted-foreground text-center">
                          <Link href="/register" className="text-primary hover:underline">Create a creator account</Link> to apply to brand collab opportunities.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* ── Collab Applications Panel — shown to brand owner ── */}
          {(listing as any).isCollab && user?.id === listing.userId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Collab Applications
                  {collabApplications.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">{collabApplications.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {collabApplications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No applications yet. Share your listing to attract creators.</p>
                ) : (
                  <div className="space-y-3">
                    {collabApplications.map((app: any) => (
                      <div key={app.id} className="p-3 rounded-lg border bg-muted/20 space-y-2">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-9 w-9 flex-shrink-0">
                            <AvatarImage src={app.creator?.avatarUrl ?? undefined} />
                            <AvatarFallback>{app.creator?.fullName?.charAt(0) ?? "C"}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link href={`/users/${app.creatorId}`}>
                                <span className="font-semibold text-sm hover:underline">{app.creator?.fullName}</span>
                              </Link>
                              <Badge variant={app.status === "accepted" ? "default" : app.status === "rejected" ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                                {app.status}
                              </Badge>
                            </div>
                            {app.socialHandle && <p className="text-xs text-muted-foreground">{app.socialHandle} · {app.followerCount ? `${app.followerCount >= 1000 ? (app.followerCount/1000).toFixed(0)+"K" : app.followerCount} followers` : ""}</p>}
                            <p className="text-sm mt-1">{app.pitch}</p>
                            {app.portfolioLink && (
                              <a href={app.portfolioLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5 mt-1">
                                <ExternalLink className="h-3 w-3" />Portfolio
                              </a>
                            )}
                          </div>
                        </div>
                        {app.status === "pending" && (
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => respondCollabMutation.mutate({ appId: app.id, status: "accepted" })} disabled={respondCollabMutation.isPending}>
                              <CheckCircle className="h-3 w-3" />Accept
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/30" onClick={() => respondCollabMutation.mutate({ appId: app.id, status: "rejected" })} disabled={respondCollabMutation.isPending}>
                              <X className="h-3 w-3" />Decline
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card id="comments" data-testid="listing-comments-section">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                {t("listingDetail.barterProposals")} ({listingComments?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {listingComments && listingComments.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {listingComments.filter((comment) => isOwnListing || user?.id === comment.userId).map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/40" data-testid={`comment-${comment.id}`}>
                      <Link href={`/users/${comment.userId}`}>
                        <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                          <AvatarImage src={comment.user?.avatarUrl || undefined} />
                          <AvatarFallback className="text-[10px]">{comment.user?.fullName?.charAt(0) || "U"}</AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link href={`/users/${comment.userId}`}>
                            <span className="text-sm font-semibold hover:underline">{comment.user?.fullName?.split(" ")[0]}</span>
                          </Link>
                          <VerifiedBadge isVerified={comment.user?.isVerified} kycStatus={comment.user?.kycStatus} kybStatus={comment.user?.kybStatus} accountType={comment.user?.accountType} size="xs" testId="badge-verified" />
                          <FounderBadge show={!!comment.user?.founderBadge} />
                          <Badge variant="default" className="text-[10px] gap-0.5 bg-green-600 text-white no-default-hover-elevate no-default-active-elevate">
                            <ArrowRightLeft className="h-2.5 w-2.5" />
                            {comment.offerItemName}
                          </Badge>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            AED {formatValue(comment.offerItemValue)}
                          </span>
                          <ValueMatchBadge
                            offerValue={comment.offerItemValue}
                            listingValue={listing.retailValue as string}
                            aiFairValue={(comment as any).valuationFairAed}
                            aiConfidence={(comment as any).valuationConfidence}
                          />
                        </div>
                        {(comment as any).offerDescription && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{(comment as any).offerDescription}</p>
                        )}
                        {(comment as any).images && ((comment as any).images as string[]).length > 0 && (
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {((comment as any).images as string[]).map((imgUrl: string, imgIdx: number) => (
                              <a key={imgIdx} href={imgUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={imgUrl}
                                  alt={`Offer image ${imgIdx + 1}`}
                                  className="h-14 w-14 object-cover rounded border hover:opacity-90 transition-opacity"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                        {comment.content && (
                          <p className="text-sm text-muted-foreground mt-0.5">{comment.content}</p>
                        )}
                        <span className="text-[10px] text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                        {/* Status badge */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {comment.status === "accepted" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">✓ Accepted</span>}
                          {comment.status === "rejected" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">✕ Declined</span>}
                          {comment.status === "countered" && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">↔ Counter-offered</span>}
                          {(!comment.status || comment.status === "pending") && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">Pending</span>}
                        </div>

                        {/* Counter-offer shown to proposer for response */}
                        {comment.status === "countered" && user?.id === comment.userId && (comment as any).counterOfferStatus === "pending" && (
                          <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 p-2.5 space-y-1.5">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Counter-offer from listing owner:</p>
                            <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">{(comment as any).counterOfferName} — AED {formatValue((comment as any).counterOfferValue)}</p>
                            {(comment as any).counterOfferDescription && <p className="text-xs text-muted-foreground">{(comment as any).counterOfferDescription}</p>}
                            <div className="flex gap-2 pt-1">
                              <button type="button" onClick={() => counterRespondMutation.mutate({ proposalId: comment.id, response: "accepted" })} className="text-xs font-semibold text-green-700 hover:underline">Accept</button>
                              <button type="button" onClick={() => counterRespondMutation.mutate({ proposalId: comment.id, response: "rejected" })} className="text-xs font-semibold text-red-600 hover:underline">Decline</button>
                            </div>
                          </div>
                        )}

                        {/* Owner actions: accept / decline / counter */}
                        {isOwnListing && (!comment.status || comment.status === "pending") && (
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <button type="button" onClick={() => respondCommentMutation.mutate({ commentId: comment.id, status: "accepted" })} className="text-[11px] font-semibold text-green-700 dark:text-green-400 hover:underline">✓ Accept</button>
                            <button type="button" onClick={() => respondCommentMutation.mutate({ commentId: comment.id, status: "rejected" })} className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline">✕ Decline</button>
                            <button type="button" onClick={() => { setCounteringProposalId(comment.id); setCtrName(""); setCtrValue(""); setCtrDesc(""); }} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">↔ Counter</button>
                          </div>
                        )}

                        {/* Counter-offer form (owner) */}
                        {isOwnListing && counteringProposalId === comment.id && (
                          <div className="mt-2 p-2.5 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 space-y-2">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Propose different terms:</p>
                            <div className="flex gap-2">
                              <Input value={ctrName} onChange={e => setCtrName(e.target.value)} placeholder="What you offer" className="text-xs h-8 flex-1" />
                              <div className="relative w-28 flex-shrink-0">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">AED</span>
                                <Input type="number" value={ctrValue} onChange={e => setCtrValue(e.target.value)} placeholder="Value" className="text-xs h-8 pl-9" />
                              </div>
                            </div>
                            <Textarea value={ctrDesc} onChange={e => setCtrDesc(e.target.value)} placeholder="Details (optional)" className="text-xs resize-none" rows={2} />
                            <div className="flex gap-2 justify-end">
                              <button type="button" onClick={() => setCounteringProposalId(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                              <button type="button" disabled={!ctrName || !ctrValue || counterOfferMutation.isPending} onClick={() => counterOfferMutation.mutate({ proposalId: comment.id, name: ctrName, value: ctrValue, description: ctrDesc })} className="text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline disabled:opacity-50">Send counter-offer</button>
                            </div>
                          </div>
                        )}

                        {/* Rejected nudge — only visible to the proposer */}
                        {user && comment.userId === user.id && comment.status === "rejected" && (
                          <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 px-2.5 py-1.5 space-y-1">
                            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">Your offer was declined. Turn it into a listing?</p>
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-primary hover:underline"
                              onClick={() => {
                                const params = new URLSearchParams({
                                  prefill: "1",
                                  title: comment.offerItemName,
                                  description: (comment as any).offerDescription || "",
                                  retailValue: comment.offerItemValue,
                                  images: JSON.stringify((comment as any).images || []),
                                });
                                window.location.href = `/create-listing?${params.toString()}`;
                              }}
                            >
                              Create a listing with this offer →
                            </button>
                          </div>
                        )}

                        {/* Leave a review — accepted proposals */}
                        {comment.status === "accepted" && user && (user.id === comment.userId || user.id === listing.userId) && (
                          <button type="button" onClick={() => setReviewProposal({ id: comment.id, otherPartyName: user.id === comment.userId ? ((listing as any).user?.fullName || "Owner") : (comment.user?.fullName || "Proposer") })} className="mt-1 text-[11px] font-semibold text-amber-600 hover:underline">
                            ★ Leave a review
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("listingDetail.noProposals")}</p>
              )}

              {!user && (
                <div className="pt-3 border-t space-y-2 text-center" data-testid="proposal-login-prompt">
                  <p className="text-sm text-muted-foreground">Sign up or log in to propose a barter.</p>
                  <div className="flex gap-2 justify-center">
                    <Link href="/register" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-8 px-3 hover:bg-primary/90 transition-colors">Create account</Link>
                    <Link href="/login" className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-8 px-3 hover:bg-accent transition-colors">Log in</Link>
                  </div>
                </div>
              )}

              {user && !isOwnListing && (user.kycStatus !== "APPROVED" && user.kybStatus !== "APPROVED" && !user.isVerified && !(user as any).phoneVerified) && (
                <div className="pt-3 border-t space-y-2 text-center" data-testid="proposal-verify-prompt">
                  <div className="flex items-center justify-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    <p className="text-sm font-medium">Add your WhatsApp to propose a barter</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Verify your WhatsApp number to unlock proposals and protect both sides of every deal.</p>
                  <Link href="/profile" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-8 px-4 hover:bg-primary/90 transition-colors">Add WhatsApp</Link>
                </div>
              )}

              {user && !isOwnListing && (user.kycStatus === "APPROVED" || user.kybStatus === "APPROVED" || user.isVerified || !!(user as any).phoneVerified) && (
                <div className="space-y-4 pt-3 border-t">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4 text-primary" />
                    {t("listingDetail.proposeWhatYouOffer")}
                  </p>

                  {/* Offer name + value */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={commentOfferName}
                      onChange={(e) => setCommentOfferName(e.target.value)}
                      placeholder={t("listingDetail.whatAreYouOffering")}
                      className="text-sm flex-1"
                      data-testid="input-comment-offer-name"
                    />
                    <div className="relative flex-shrink-0 w-32">
                      <span className="absolute start-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">AED</span>
                      <Input
                        type="number"
                        value={commentOfferValue}
                        onChange={(e) => setCommentOfferValue(e.target.value)}
                        placeholder="Value"
                        className="text-sm ps-10"
                        min="1"
                        data-testid="input-comment-offer-value"
                      />
                    </div>
                  </div>

                  {/* Offer description */}
                  <div>
                    <Textarea
                      value={commentDescription}
                      onChange={(e) => setCommentDescription(e.target.value)}
                      placeholder="Describe your offer in detail — condition, brand, specifications, what's included..."
                      className="text-sm resize-none"
                      rows={3}
                      data-testid="input-comment-description"
                    />
                  </div>

                  {/* Image upload — 2 required */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-medium flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5" />
                        Offer Images
                        <span className="text-destructive ml-0.5">*</span>
                        <span className="text-muted-foreground font-normal ml-1">({commentImages.length}/2 minimum)</span>
                      </Label>
                      <button
                        type="button"
                        onClick={() => commentImageInputRef.current?.click()}
                        disabled={uploadingCommentImages}
                        className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                        data-testid="button-upload-comment-image"
                      >
                        {uploadingCommentImages ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        Add photos
                      </button>
                      <input
                        ref={commentImageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleCommentImageUpload(e.target.files)}
                      />
                    </div>

                    {commentImages.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => commentImageInputRef.current?.click()}
                        disabled={uploadingCommentImages}
                        className="w-full border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
                        data-testid="dropzone-comment-images"
                      >
                        {uploadingCommentImages ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <Upload className="h-6 w-6" />
                        )}
                        <span className="text-xs font-medium">Upload at least 2 photos of your offer</span>
                        <span className="text-[11px]">JPG, PNG, WEBP · Max 5MB each</span>
                      </button>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {commentImages.map((url, idx) => (
                          <div key={idx} className="relative aspect-square rounded-md overflow-hidden border bg-muted group" data-testid={`comment-image-${idx}`}>
                            <img src={url} alt={`Offer image ${idx + 1}`} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeCommentImage(idx)}
                              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => commentImageInputRef.current?.click()}
                          disabled={uploadingCommentImages}
                          className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
                        >
                          {uploadingCommentImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        </button>
                      </div>
                    )}
                    {commentImages.length > 0 && commentImages.length < 2 && (
                      <p className="text-[11px] text-destructive mt-1">Add {2 - commentImages.length} more photo{2 - commentImages.length > 1 ? "s" : ""} to continue</p>
                    )}
                  </div>

                  {/* Optional message */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={commentMessage}
                      onChange={(e) => setCommentMessage(e.target.value)}
                      placeholder={t("listingDetail.addMessage")}
                      className="text-sm flex-1"
                      onKeyDown={(e) => e.key === "Enter" && handleSubmitComment()}
                      onFocus={() => {
                        if (user && listing && !composerStartedRef.current) {
                          composerStartedRef.current = true;
                          apiRequest("POST", "/api/engagement/track", {
                            eventType: "message_started",
                            listingId: listing.id,
                          }).catch(() => { /* best-effort */ });
                        }
                      }}
                      data-testid="input-comment-message"
                    />
                    <Button
                      size="sm"
                      onClick={handleSubmitComment}
                      disabled={createCommentMutation.isPending || !commentOfferName.trim() || !commentOfferValue || commentImages.length < 2}
                      className="gap-1 shrink-0"
                      data-testid="button-submit-comment"
                    >
                      {createCommentMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      {t("listingDetail.propose")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-4 py-3 border-t border-b" data-testid="listing-engagement-bar">
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                disabled={listingLikeMutation.isPending}
                onClick={() => listingLikeMutation.mutate()}
                data-testid="button-like-listing"
              >
                <Heart className={`h-4 w-4 ${listing.isLiked ? "fill-destructive text-destructive" : ""}`} />
                <span>{listing.likeCount || 0} {t("listingDetail.likes")}</span>
              </Button>
            )}
            {!user && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Heart className="h-4 w-4" />
                <span>{listing.likeCount || 0} {t("listingDetail.likes")}</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span>{listing.commentCount || 0} {t("listingDetail.proposals")}</span>
            </div>
            <ShareMenu
              url={window.location.href}
              title={listing.title}
              showLabel
              data-testid="button-share-listing"
            />
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Price + primary CTA card */}
          {!isOwnListing && (
            <Card className="rounded-bareter-card border-bareter-border shadow-bareter-card">
              <CardContent className="p-5 space-y-3">
                {(listing as any).isCollab ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Camera className="h-5 w-5 text-primary" />
                      <span className="text-sm font-semibold text-primary">Brand Collab</span>
                    </div>
                    {(listing as any).collabDetails?.productValue > 0 && (
                      <div className="text-3xl font-bold text-bareter-teal">
                        AED {Number((listing as any).collabDetails.productValue).toLocaleString()}
                        <span className="text-sm font-normal text-muted-foreground ml-2">product value</span>
                      </div>
                    )}
                    {listing.location && (
                      <div className="inline-flex items-center gap-1 text-sm text-bareter-muted">
                        <MapPin className="h-4 w-4 text-bareter-teal" />
                        {listing.location}
                      </div>
                    )}
                    {user ? (
                      user.signupType === "creator" ? (
                        myCollabApp ? (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-700 dark:text-green-400">
                              Application {myCollabApp.status === "accepted" ? "accepted!" : myCollabApp.status === "rejected" ? "declined" : "submitted"}
                            </span>
                          </div>
                        ) : (
                          <Button
                            variant="bareter"
                            className="bareter-cta-pulse w-full h-[52px] gap-2 text-base"
                            onClick={() => setCollabApplyOpen(true)}
                            data-testid="button-apply-collab"
                          >
                            <Camera className="h-5 w-5" />
                            Apply to Collab
                          </Button>
                        )
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground text-center">This is a creator collab listing.</p>
                          <Link href={`/inbox?userId=${listing.userId}`}>
                            <Button variant="bareter-outline" className="w-full h-11 gap-2">
                              <MessageSquare className="h-4 w-4" />
                              Message Brand
                            </Button>
                          </Link>
                        </div>
                      )
                    ) : (
                      <Link href="/login">
                        <Button variant="bareter" className="w-full h-[52px] gap-2 text-base">
                          <Camera className="h-5 w-5" />
                          Sign In to Apply
                        </Button>
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-3xl md:text-4xl font-bold text-bareter-teal">
                      AED {parseFloat(listing.retailValue as string).toLocaleString()}
                    </div>
                    {listing.location && (
                      <div className="inline-flex items-center gap-1 text-sm text-bareter-muted">
                        <MapPin className="h-4 w-4 text-bareter-teal" />
                        {listing.location}
                      </div>
                    )}
                    {user ? (
                      <Button
                        variant="bareter"
                        className="bareter-cta-pulse w-full h-[52px] gap-2 text-base"
                        onClick={() => setProposeOpen(true)}
                        data-testid="button-propose-trade-sticky"
                      >
                        <Handshake className="h-5 w-5" />
                        {t("listingDetail.proposeBarter")}
                      </Button>
                    ) : (
                      <Link href="/login">
                        <Button variant="bareter" className="w-full h-[52px] gap-2 text-base">
                          <Handshake className="h-5 w-5" />
                          {t("listingDetail.signInToBarter")}
                        </Button>
                      </Link>
                    )}
                    <Link href={`/inbox?userId=${listing.userId}`}>
                      <Button variant="bareter-outline" className="w-full h-11 gap-2">
                        <MessageSquare className="h-4 w-4" />
                        {t("listingDetail.messageSellerBtn")}
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      className="w-full h-11 gap-2"
                      onClick={() => quickInquiryMutation.mutate()}
                      disabled={inquirySent || quickInquiryMutation.isPending}
                      data-testid="button-quick-inquiry"
                    >
                      {quickInquiryMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : inquirySent ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                      {inquirySent ? t("listingDetail.inquirySent") : t("listingDetail.isStillAvailable")}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-bareter-card border-bareter-border shadow-bareter-card">
            <CardHeader>
              <CardTitle className="text-lg text-bareter-navy dark:text-foreground">{listing.type === "offer" ? t("listingDetail.aboutTheSeller") : t("listingDetail.aboutTheBuyer")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <Link href={`/users/${listing.userId}`}>
                  <Avatar className="h-14 w-14 cursor-pointer hover:ring-2 hover:ring-primary transition-all">
                    <AvatarImage src={listing.user?.avatarUrl || undefined} />
                    <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                      {listing.user?.fullName?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Link href={`/users/${listing.userId}`} className="font-semibold hover:underline hover:text-primary transition-colors">{listing.user?.fullName}</Link>
                    <VerifiedBadge isVerified={listing.user?.isVerified} kycStatus={listing.user?.kycStatus} kybStatus={listing.user?.kybStatus} accountType={listing.user?.accountType} size="xs" testId="badge-verified" />
                    <TrustBadges emailVerified={(listing.user as any)?.emailVerified} phoneVerified={(listing.user as any)?.phoneVerified} />
                    <FounderBadge show={!!listing.user?.founderBadge} />
                    <ReputationBadge completedDeals={listing.user?.totalCompletedDeals ?? 0} avgRating={userReviews?.avgRating} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {userReviews && userReviews.reviewCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <StarRating value={Math.round(userReviews.avgRating)} readonly size="sm" />
                        <span className="font-medium text-foreground">{userReviews.avgRating.toFixed(1)}</span>
                        <span>({userReviews.reviewCount})</span>
                      </span>
                    )}
                  </div>
                  {listing.user?.businessName && (
                    <p className="text-sm text-muted-foreground">{listing.user.businessName}</p>
                  )}
                </div>
              </div>

              {listing.user?.bio && (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                  {listing.user.bio}
                </p>
              )}

              <Link href={`/users/${listing.userId}`}>
                <Button variant="outline" className="w-full gap-2" data-testid="button-view-profile">
                  {t("listingDetail.viewFullProfile")}
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {!isOwnListing && user && (
            <Dialog open={proposeOpen} onOpenChange={setProposeOpen}>
              <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>{t("listingDetail.proposeBarter")}</DialogTitle>
                  <DialogDescription>
                    {t("listingDetail.tellWhatYouCanOffer").replace("{name}", listing.user?.fullName || "")}
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 pe-4">
                  <div className="space-y-4 py-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">{t("listingDetail.theyAreOffering")}</p>
                      <p className="font-medium">{listing.title}</p>
                      <p className="text-sm text-primary font-bold">
                        AED {parseFloat(listing.retailValue as string).toLocaleString()}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="counter-offer">{t("listingDetail.yourCounterOffer")}</Label>
                      <Textarea
                        id="counter-offer"
                        placeholder={t("listingDetail.counterOfferPlaceholder")}
                        value={counterOffer}
                        onChange={(e) => setCounterOffer(e.target.value)}
                        className="min-h-[100px] resize-none"
                        data-testid="textarea-counter-offer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="counter-value">{t("listingDetail.estimatedValue")}</Label>
                      <div className="relative">
                        <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          AED
                        </span>
                        <Input
                          id="counter-value"
                          type="number"
                          placeholder="0.00"
                          value={counterValue}
                          onChange={(e) => setCounterValue(e.target.value)}
                          className="ps-14"
                          data-testid="input-counter-value"
                        />
                      </div>
                    </div>

                    {/* Deliverables checklist — always shown, smart-matched to listing */}
                    <div className="space-y-3" data-testid="deliverables-checklist">
                      <Separator />
                      <div>
                        <Label className="flex items-center gap-2 mb-1">
                          <ClipboardList className="h-4 w-4 text-primary" />
                          {t("listingDetail.deliverablesChecklist")}
                        </Label>
                        <p className="text-xs text-muted-foreground mb-3">
                          {counterOffer.trim()
                            ? "Suggested based on what you're offering. Check, uncheck, or add your own."
                            : "Start typing what you're offering above to see smart suggestions."}
                        </p>
                      </div>

                      {/* Checklist */}
                      {deliverables.length > 0 && (
                        <div className="space-y-2.5 rounded-lg border p-3 max-h-52 overflow-y-auto">
                          {deliverables.map((item, index) => (
                            <div key={index} className="flex items-start gap-2.5">
                              <Checkbox
                                id={`deliverable-${index}`}
                                checked={item.checked}
                                onCheckedChange={() => toggleDeliverable(index)}
                                data-testid={`checkbox-deliverable-${index}`}
                              />
                              <label
                                htmlFor={`deliverable-${index}`}
                                className={`text-sm leading-tight cursor-pointer flex-1 ${
                                  item.checked ? "text-foreground" : "text-muted-foreground line-through"
                                }`}
                              >
                                {item.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add custom deliverable */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newDeliverable}
                          onChange={(e) => setNewDeliverable(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomDeliverable(); } }}
                          placeholder="Add a custom deliverable…"
                          className="flex-1 text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-bareter-teal"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addCustomDeliverable}
                          disabled={!newDeliverable.trim()}
                          className="flex-shrink-0 h-9 px-3"
                        >
                          + Add
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {deliverables.filter(d => d.checked).length} of {deliverables.length} selected
                        </p>
                        <button
                          type="button"
                          onClick={() => setDeliverables(prev => prev.map(d => ({ ...d, checked: false })))}
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                        >
                          Continue without selecting
                        </button>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
                {counterValue && listing && (parseFloat(listing.retailValue as string) + parseFloat(counterValue)) > 5000 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 mx-6 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t("listingDetail.highValueBarter")}</p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        {t("listingDetail.highValueWarning")}
                      </p>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setProposeOpen(false)}>
                    {t("listingDetail.cancel")}
                  </Button>
                  <Button
                    onClick={handleProposeTrade}
                    disabled={!counterOffer || !counterValue || proposeTradeMutation.isPending}
                    data-testid="button-submit-proposal"
                  >
                    {proposeTradeMutation.isPending ? (
                      <>
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        {t("listingDetail.sending")}
                      </>
                    ) : (
                      <>
                        <MessageSquare className="me-2 h-4 w-4" />
                        {t("listingDetail.sendProposal")}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {isOwnListing && (
            <Card className="rounded-bareter-card border-bareter-border shadow-bareter-card">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-bareter-muted">{t("listingDetail.thisIsYourListing")}</p>
                <Button variant="bareter-outline" className="mt-2 w-full" data-testid="button-edit-listing">
                  {t("listingDetail.editListing")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Similar listings */}
      {similarListings && similarListings.length > 0 && (
        <div className="mt-6 px-4 lg:px-0">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-bareter-teal" />
            Similar Listings
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {similarListings.map((l: any) => (
              <Link key={l.id} href={`/listings/${l.id}`} className="group block bg-white dark:bg-card border border-bareter-border rounded-xl overflow-hidden hover:shadow-bareter-hover transition-shadow">
                {l.images?.[0] ? (
                  <img src={l.images[0]} alt={l.title} className="w-full h-28 object-cover group-hover:scale-[1.02] transition-transform" />
                ) : (
                  <div className="w-full h-28 bg-muted/30 flex items-center justify-center">
                    <ArrowRightLeft className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="p-2">
                  <p className="text-xs font-semibold line-clamp-2 text-bareter-navy dark:text-foreground">{l.title}</p>
                  {l.retailValue && <p className="text-xs text-bareter-teal font-bold mt-0.5">AED {Number(l.retailValue).toLocaleString()}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <ReportModal
        open={showReport}
        onOpenChange={setShowReport}
        targetType="listing"
        targetId={listing?.id ?? ""}
      />

      {/* Collab Apply Dialog */}
      <Dialog open={collabApplyOpen} onOpenChange={setCollabApplyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              Apply to Brand Collab
            </DialogTitle>
            <DialogDescription>
              Tell {listing.user?.fullName || "the brand"} why you're the right creator for this opportunity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-muted/40 border">
              <p className="text-xs text-muted-foreground mb-0.5">Collab opportunity</p>
              <p className="font-medium text-sm">{listing.title}</p>
              {(listing as any).collabDetails?.productValue > 0 && (
                <p className="text-xs text-primary font-semibold mt-0.5">
                  AED {Number((listing as any).collabDetails.productValue).toLocaleString()} product value
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="collab-pitch">Your pitch <span className="text-destructive">*</span></Label>
              <Textarea
                id="collab-pitch"
                placeholder="Introduce yourself and explain why you're a great fit — your niche, audience, and how you'll create content for this brand..."
                value={collabPitch}
                onChange={(e) => setCollabPitch(e.target.value)}
                rows={4}
                className="resize-none text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="collab-handle">Social handle</Label>
                <Input
                  id="collab-handle"
                  placeholder="@yourusername"
                  value={collabHandle}
                  onChange={(e) => setCollabHandle(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="collab-followers">Follower count</Label>
                <Input
                  id="collab-followers"
                  type="number"
                  placeholder="e.g. 50000"
                  value={collabFollowers}
                  onChange={(e) => setCollabFollowers(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="collab-portfolio">Portfolio link <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="collab-portfolio"
                placeholder="https://yourportfolio.com or link to past work"
                value={collabPortfolioLink}
                onChange={(e) => setCollabPortfolioLink(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollabApplyOpen(false)}>Cancel</Button>
            <Button
              variant="bareter"
              disabled={!collabPitch.trim() || applyCollabMutation.isPending}
              onClick={() => applyCollabMutation.mutate({ pitch: collabPitch, socialHandle: collabHandle, followerCount: collabFollowers, portfolioLink: collabPortfolioLink })}
              className="gap-2"
            >
              {applyCollabMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review modal */}
      {reviewProposal && (
        <ReviewModal
          open={!!reviewProposal}
          onClose={() => setReviewProposal(null)}
          proposalId={reviewProposal.id}
          revieweeName={reviewProposal.otherPartyName}
          listingTitle={listing.title}
        />
      )}
      </div>

      {/* Mobile sticky bottom CTA */}
      {!isOwnListing && (
        <div className="lg:hidden fixed bottom-[60px] inset-x-0 z-40 bg-white dark:bg-card border-t border-bareter-border dark:border-border p-3 shadow-[0_-4px_12px_rgba(15,25,35,0.08)]">
          {(listing as any).isCollab ? (
            user ? (
              user.signupType === "creator" ? (
                myCollabApp ? (
                  <div className="flex items-center justify-center gap-2 h-14 text-green-600 font-semibold">
                    <CheckCircle className="h-5 w-5" />
                    Application {myCollabApp.status === "accepted" ? "Accepted!" : myCollabApp.status === "rejected" ? "Declined" : "Submitted"}
                  </div>
                ) : (
                  <Button variant="bareter" className="w-full h-14 text-base gap-2" onClick={() => setCollabApplyOpen(true)} data-testid="button-apply-collab-mobile">
                    <Camera className="h-5 w-5" />
                    Apply to Collab
                  </Button>
                )
              ) : (
                <Link href={`/inbox?userId=${listing.userId}`}>
                  <Button variant="bareter-outline" className="w-full h-14 text-base gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Message Brand
                  </Button>
                </Link>
              )
            ) : (
              <Link href="/login">
                <Button variant="bareter" className="w-full h-14 text-base gap-2">
                  <Camera className="h-5 w-5" />
                  Sign In to Apply
                </Button>
              </Link>
            )
          ) : (
            user ? (
              <Button
                variant="bareter"
                className="w-full h-14 text-base gap-2"
                onClick={() => setProposeOpen(true)}
                data-testid="button-propose-trade-mobile"
              >
                <Handshake className="h-5 w-5" />
                {t("listingDetail.proposeBarter")} · AED {parseFloat(listing.retailValue as string).toLocaleString()}
              </Button>
            ) : (
              <Link href="/login">
                <Button variant="bareter" className="w-full h-14 text-base gap-2">
                  <Handshake className="h-5 w-5" />
                  {t("listingDetail.signInToBarter")}
                </Button>
              </Link>
            )
          )}
        </div>
      )}

      {listing.images && listing.images.length > 0 && (
        <Dialog open={lightboxIndex !== null} onOpenChange={(o) => !o && setLightboxIndex(null)}>
          <DialogContent className="max-w-4xl p-0 bg-bareter-navy-deep border-none">
            <DialogHeader className="sr-only">
              <DialogTitle>{listing.title}</DialogTitle>
              <DialogDescription>Listing image gallery</DialogDescription>
            </DialogHeader>
            {lightboxIndex !== null && (
              <div className="relative">
                <img
                  src={listing.images[lightboxIndex]}
                  alt={`${listing.title} ${lightboxIndex + 1} ${t("common.of")} ${listing.images.length}`}
                  className="w-full max-h-[85vh] object-contain"
                  data-testid="img-lightbox"
                />
                {listing.images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => isRTL
                        ? setLightboxIndex((i) => (i! + 1) % listing.images!.length)
                        : setLightboxIndex((i) => (i! - 1 + listing.images!.length) % listing.images!.length)}
                      className="absolute start-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center transition-colors"
                      data-testid="button-lightbox-prev"
                      aria-label="Previous image"
                    >
                      <ArrowLeft className={`h-5 w-5 ${isRTL ? "rotate-180" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => isRTL
                        ? setLightboxIndex((i) => (i! - 1 + listing.images!.length) % listing.images!.length)
                        : setLightboxIndex((i) => (i! + 1) % listing.images!.length)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center transition-colors"
                      data-testid="button-lightbox-next"
                      aria-label="Next image"
                    >
                      <ArrowLeft className={`h-5 w-5 ${isRTL ? "" : "rotate-180"}`} />
                    </button>
                    <div className="absolute bottom-3 inset-x-0 mx-auto w-fit px-3 py-1 rounded-full bg-bareter-navy-deep/60 text-white text-xs">
                      {lightboxIndex + 1} / {listing.images.length}
                    </div>
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
