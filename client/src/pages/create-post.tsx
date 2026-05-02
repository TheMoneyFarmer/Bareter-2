import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FEED_CATEGORIES, LOCATIONS, COUNTRIES, getCitiesForCountry } from "@shared/schema";
import type { OfferNeedItem, PostCategoryDetails } from "@shared/schema";
import {
  Loader2,
  X,
  Plus,
  ImagePlus,
  MapPin,
  DollarSign,
  FileText,
  ArrowLeftRight,
  Upload,
  Hash,
  TrendingUp,
  Tag,
  Building2,
  Car,
  Watch,
  PackagePlus,
  Search,
  HelpCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STRUCTURED_SUBCATEGORIES = [
  "Car",
  "Motorcycle",
  "Yacht/Boat",
  "Truck/Van",
  "House",
  "Villa",
  "Apartment",
  "Watches",
  "Jewelry",
  "Art",
  "Electronics",
  "Office Space",
];

const ASSET_VEHICLE_SUBS = [
  "Car",
  "Motorcycle",
  "Yacht/Boat",
  "Truck/Van",
  "House",
  "Villa",
  "Apartment",
  "Watches",
];

const BIG_TICKET_SUBS = [
  "House",
  "Villa",
  "Apartment",
  "Office Space",
  "Yacht/Boat",
  "Watches",
  "Jewelry",
  "Art",
  "Electronics",
];

const REAL_ESTATE_TYPES = ["House", "Apartment", "Villa", "Office Space"];
const VEHICLE_TYPES = ["Car", "Motorcycle", "Yacht/Boat", "Truck/Van"];
const LUXURY_TYPES = ["Watches", "Jewelry", "Art", "Electronics"];

const PROPERTY_TYPES = ["House", "Apartment", "Villa", "Penthouse", "Townhouse"];
const AMENITIES = [
  "Pool",
  "Gym",
  "Parking",
  "Sea View",
  "Furnished",
  "Balcony",
  "Garden",
  "Security",
  "Maid's Room",
];
const OWNERSHIP_STATUSES = ["Freehold", "Leasehold", "Off-Plan"];

const ENGINE_TYPES = ["Petrol", "Diesel", "Electric", "Hybrid"];
const TRANSMISSIONS = ["Automatic", "Manual"];
const CONDITIONS = ["New", "Excellent", "Good", "Fair"];
const VEHICLE_FEATURES = [
  "Leather Seats",
  "Navigation",
  "Sunroof",
  "AC",
  "Sound System",
  "Bluetooth",
  "Rear Camera",
  "Cruise Control",
];

const MATERIALS = ["Gold", "Platinum", "Steel", "Titanium", "Ceramic"];

type FormValues = {
  postType: string;
  title: string;
  feedCategory: string;
  subCategory: string;
  caption: string;
  declaredValue: string;
  hashtags: string;
  location: string;
  country: string;
  city: string;
  marketValuation: string;
};

export function CreatePostPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [offerItems, setOfferItems] = useState<OfferNeedItem[]>([]);
  const [wantItems, setWantItems] = useState<OfferNeedItem[]>([]);
  const [offerName, setOfferName] = useState("");
  const [offerValue, setOfferValue] = useState("");
  const [wantName, setWantName] = useState("");
  const [wantValue, setWantValue] = useState("");
  const [categoryDetails, setCategoryDetails] = useState<PostCategoryDetails>(
    {}
  );

  const form = useForm<FormValues>({
    defaultValues: {
      postType: "offer",
      title: "",
      feedCategory: "",
      subCategory: "",
      caption: "",
      declaredValue: "",
      hashtags: "",
      location: user?.location || "",
      country: user?.country || "AE",
      city: user?.city || "",
      marketValuation: "",
    },
  });

  const feedCategory = form.watch("feedCategory");
  const subCategory = form.watch("subCategory");

  const showStructuredSubs =
    feedCategory === "Assets & Vehicles" || feedCategory === "Big Ticket";

  const subOptions =
    feedCategory === "Assets & Vehicles"
      ? ASSET_VEHICLE_SUBS
      : feedCategory === "Big Ticket"
        ? BIG_TICKET_SUBS
        : [];

  const isRealEstate = REAL_ESTATE_TYPES.includes(subCategory);
  const isVehicle = VEHICLE_TYPES.includes(subCategory);
  const isLuxury = LUXURY_TYPES.includes(subCategory);

  const updateDetail = (key: string, value: string | number | boolean | string[]) => {
    setCategoryDetails((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArrayDetail = (key: string, item: string) => {
    const current = ((categoryDetails as Record<string, unknown>)[key] as string[]) || [];
    if (current.includes(item)) {
      updateDetail(
        key,
        current.filter((i) => i !== item)
      );
    } else {
      updateDetail(key, [...current, item]);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const hashtagsArray = data.hashtags
        ? data.hashtags
            .split(",")
            .map((t) => t.trim().replace(/^#/, ""))
            .filter(Boolean)
        : [];

      const body = {
        postType: data.postType,
        title: data.title,
        caption: data.caption,
        mediaUrls,
        feedCategory: data.feedCategory,
        subCategory: data.subCategory || undefined,
        declaredValue: data.declaredValue,
        offerItems,
        wantItems,
        hashtags: hashtagsArray,
        location: data.location || undefined,
        country: data.country || undefined,
        city: data.city || data.location || undefined,
        marketValuation: data.marketValuation || undefined,
        categoryDetails:
          Object.keys(categoryDetails).length > 0 ? categoryDetails : undefined,
      };

      const res = await apiRequest("POST", "/api/posts", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Post created",
        description: "Your barter post is now live.",
      });
      navigate("/feed");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create post",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    if (!data.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!data.caption.trim()) {
      toast({ title: "Caption is required", variant: "destructive" });
      return;
    }
    if (!data.declaredValue || isNaN(Number(data.declaredValue)) || Number(data.declaredValue) <= 0) {
      toast({
        title: "Valid declared value is required",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(data);
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImages(true);
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
        formData.append("type", "post");
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
      setMediaUrls((prev) => [...prev, ...uploadedUrls]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Upload failed";
      toast({
        title: "Upload failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const addOfferItem = () => {
    if (offerName.trim() && offerValue) {
      setOfferItems((prev) => [
        ...prev,
        { name: offerName.trim(), value: Number(offerValue) },
      ]);
      setOfferName("");
      setOfferValue("");
    }
  };

  const addWantItem = () => {
    if (wantName.trim() && wantValue) {
      setWantItems((prev) => [
        ...prev,
        { name: wantName.trim(), value: Number(wantValue) },
      ]);
      setWantName("");
      setWantValue("");
    }
  };

  if (!user) {
    return (
      <div className="container px-4 py-12 mx-auto max-w-2xl text-center">
        <p className="text-muted-foreground" data-testid="text-sign-in-required">
          Please sign in to create a post.
        </p>
      </div>
    );
  }

  const feedCategoryOptions = FEED_CATEGORIES.filter((c) => c !== "All");

  return (
    <div className="container px-4 py-8 mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
          Create Post
        </h1>
        <p className="text-muted-foreground">
          Share what you want to barter on the Bareter marketplace
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 2023 Toyota Camry for Barter"
                        data-testid="input-title"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={form.watch("postType") === "offer" ? "default" : "outline"}
                  className="flex-1 toggle-elevate"
                  onClick={() => form.setValue("postType", "offer")}
                  data-testid="button-post-type-offer"
                >
                  <PackagePlus className="h-4 w-4 mr-2" />
                  I'm Offering
                </Button>
                <Button
                  type="button"
                  variant={form.watch("postType") === "request" ? "default" : "outline"}
                  className="flex-1 toggle-elevate"
                  onClick={() => form.setValue("postType", "request")}
                  data-testid="button-post-type-request"
                >
                  <Search className="h-4 w-4 mr-2" />
                  I'm Looking For
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="feedCategory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Feed Category</FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          form.setValue("subCategory", "");
                          setCategoryDetails({});
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-feed-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {feedCategoryOptions.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showStructuredSubs ? (
                  <FormField
                    control={form.control}
                    name="subCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sub Category</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            setCategoryDetails({});
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-sub-category">
                              <SelectValue placeholder="Select sub-category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {subOptions.map((sub) => (
                              <SelectItem key={sub} value={sub}>
                                {sub}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : feedCategory ? (
                  <FormField
                    control={form.control}
                    name="subCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sub Category</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Web Development, Catering"
                            data-testid="input-sub-category"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>

              <FormField
                control={form.control}
                name="caption"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what you are offering and what makes it valuable..."
                        className="min-h-[120px] resize-none"
                        data-testid="textarea-caption"
                        {...field}
                      />
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
                <ImagePlus className="h-5 w-5" />
                Photos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleImageUpload(e.target.files)}
                data-testid="input-file-upload"
              />
              <div className="flex flex-wrap gap-3">
                {mediaUrls.map((url, index) => (
                  <div
                    key={index}
                    className="relative w-24 h-24 rounded-md overflow-hidden border"
                  >
                    <img
                      src={url}
                      alt={`Upload ${index + 1}`}
                      className="w-full h-full object-cover"
                      data-testid={`img-preview-${index}`}
                    />
                    <button
                      type="button"
                      className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5"
                      onClick={() => removeImage(index)}
                      data-testid={`button-remove-image-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="w-24 h-24 rounded-md border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground hover-elevate"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImages}
                  data-testid="button-upload-photos"
                >
                  {uploadingImages ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-6 w-6 mb-1" />
                      <span className="text-xs">Add</span>
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" />
                Barter Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <FormLabel className="text-base mb-3 block">
                  What I Offer
                </FormLabel>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Input
                    value={offerName}
                    onChange={(e) => setOfferName(e.target.value)}
                    placeholder="Item name"
                    className="flex-1 min-w-[140px]"
                    data-testid="input-offer-name"
                  />
                  <Input
                    type="number"
                    value={offerValue}
                    onChange={(e) => setOfferValue(e.target.value)}
                    placeholder="Value (AED)"
                    className="w-32"
                    data-testid="input-offer-value"
                  />
                  <Button
                    type="button"
                    onClick={addOfferItem}
                    data-testid="button-add-offer"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                {offerItems.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {offerItems.map((item, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="gap-1"
                        data-testid={`badge-offer-${i}`}
                      >
                        {item.name} - AED {item.value.toLocaleString()}
                        <button
                          type="button"
                          onClick={() =>
                            setOfferItems((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          data-testid={`button-remove-offer-${i}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <FormLabel className="text-base mb-3 block">
                  What I Want in Return
                </FormLabel>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Input
                    value={wantName}
                    onChange={(e) => setWantName(e.target.value)}
                    placeholder="Item name"
                    className="flex-1 min-w-[140px]"
                    data-testid="input-want-name"
                  />
                  <Input
                    type="number"
                    value={wantValue}
                    onChange={(e) => setWantValue(e.target.value)}
                    placeholder="Value (AED)"
                    className="w-32"
                    data-testid="input-want-value"
                  />
                  <Button
                    type="button"
                    onClick={addWantItem}
                    data-testid="button-add-want"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                {wantItems.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {wantItems.map((item, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="gap-1"
                        data-testid={`badge-want-${i}`}
                      >
                        {item.name} - AED {item.value.toLocaleString()}
                        <button
                          type="button"
                          onClick={() =>
                            setWantItems((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          data-testid={`button-remove-want-${i}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <FormField
                control={form.control}
                name="declaredValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Declared Value (AED)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 85000"
                        data-testid="input-declared-value"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="flex items-center gap-1">
                      Use professional appraisal for high-value items. Accurate details build trust and better matches.
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Provide an accurate declared value based on professional appraisal or market research for the best matching results.</p>
                        </TooltipContent>
                      </Tooltip>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {isRealEstate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Property Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <FormLabel>Property Type</FormLabel>
                    <Select
                      value={(categoryDetails.propertyType as string) || ""}
                      onValueChange={(val) => updateDetail("propertyType", val)}
                    >
                      <SelectTrigger data-testid="select-property-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Ownership Status</FormLabel>
                    <Select
                      value={(categoryDetails.ownershipStatus as string) || ""}
                      onValueChange={(val) =>
                        updateDetail("ownershipStatus", val)
                      }
                    >
                      <SelectTrigger data-testid="select-ownership-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {OWNERSHIP_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <FormLabel>Bedrooms</FormLabel>
                    <Input
                      type="number"
                      value={categoryDetails.bedrooms ?? ""}
                      onChange={(e) =>
                        updateDetail(
                          "bedrooms",
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      data-testid="input-bedrooms"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Bathrooms</FormLabel>
                    <Input
                      type="number"
                      value={categoryDetails.bathrooms ?? ""}
                      onChange={(e) =>
                        updateDetail(
                          "bathrooms",
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      data-testid="input-bathrooms"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Sq. Meters</FormLabel>
                    <Input
                      type="number"
                      value={categoryDetails.squareMeters ?? ""}
                      onChange={(e) =>
                        updateDetail(
                          "squareMeters",
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      data-testid="input-square-meters"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Year Built</FormLabel>
                    <Input
                      type="number"
                      value={categoryDetails.yearBuilt ?? ""}
                      onChange={(e) =>
                        updateDetail(
                          "yearBuilt",
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      data-testid="input-year-built"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <FormLabel>Area</FormLabel>
                    <Input
                      value={(categoryDetails.area as string) ?? ""}
                      onChange={(e) => updateDetail("area", e.target.value)}
                      placeholder="e.g., Dubai Marina"
                      data-testid="input-area"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Floor Number</FormLabel>
                    <Input
                      type="number"
                      value={categoryDetails.floorNumber ?? ""}
                      onChange={(e) =>
                        updateDetail(
                          "floorNumber",
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      data-testid="input-floor-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>View Type</FormLabel>
                    <Input
                      value={(categoryDetails.viewType as string) ?? ""}
                      onChange={(e) => updateDetail("viewType", e.target.value)}
                      placeholder="e.g., Sea View, Garden"
                      data-testid="input-view-type"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <FormLabel>Amenities</FormLabel>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {AMENITIES.map((amenity) => {
                      const selected =
                        ((categoryDetails.amenities as string[]) || []).includes(
                          amenity
                        );
                      return (
                        <label
                          key={amenity}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() =>
                              toggleArrayDetail("amenities", amenity)
                            }
                            data-testid={`checkbox-amenity-${amenity.toLowerCase().replace(/\s+/g, "-")}`}
                          />
                          <span className="text-sm">{amenity}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={categoryDetails.furnished === true}
                      onCheckedChange={(checked) => updateDetail("furnished", checked === true)}
                      data-testid="checkbox-furnished"
                    />
                    <span className="text-sm">Fully Furnished</span>
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Google Maps Link (optional)</FormLabel>
                    <Input
                      value={(categoryDetails.mapsLink as string) ?? ""}
                      onChange={(e) => updateDetail("mapsLink", e.target.value)}
                      placeholder="https://maps.google.com/..."
                      data-testid="input-maps-link"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {isVehicle && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Car className="h-5 w-5" />
                  Vehicle Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <FormLabel>Make</FormLabel>
                    <Input
                      value={(categoryDetails.make as string) ?? ""}
                      onChange={(e) => updateDetail("make", e.target.value)}
                      placeholder="e.g., Toyota"
                      data-testid="input-make"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Model</FormLabel>
                    <Input
                      value={(categoryDetails.model as string) ?? ""}
                      onChange={(e) => updateDetail("model", e.target.value)}
                      placeholder="e.g., Camry"
                      data-testid="input-model"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Year</FormLabel>
                    <Input
                      type="number"
                      value={categoryDetails.year ?? ""}
                      onChange={(e) =>
                        updateDetail(
                          "year",
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      data-testid="input-vehicle-year"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <FormLabel>
                      {subCategory === "Yacht/Boat" ? "Hours Used" : "Mileage"}
                    </FormLabel>
                    <Input
                      type="number"
                      value={
                        subCategory === "Yacht/Boat"
                          ? (categoryDetails.hoursUsed ?? "")
                          : (categoryDetails.mileage ?? "")
                      }
                      onChange={(e) =>
                        updateDetail(
                          subCategory === "Yacht/Boat"
                            ? "hoursUsed"
                            : "mileage",
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      data-testid="input-mileage"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>
                      {subCategory === "Yacht/Boat" ? "Cabins" : "Doors"}
                    </FormLabel>
                    <Input
                      type="number"
                      value={
                        subCategory === "Yacht/Boat"
                          ? (categoryDetails.cabins ?? "")
                          : (categoryDetails.doors ?? "")
                      }
                      onChange={(e) =>
                        updateDetail(
                          subCategory === "Yacht/Boat" ? "cabins" : "doors",
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      data-testid="input-doors"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Engine Capacity</FormLabel>
                    <Input
                      value={(categoryDetails.engineCapacity as string) ?? ""}
                      onChange={(e) =>
                        updateDetail("engineCapacity", e.target.value)
                      }
                      placeholder="e.g., 2.5L"
                      data-testid="input-engine-capacity"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Color</FormLabel>
                    <Input
                      value={(categoryDetails.color as string) ?? ""}
                      onChange={(e) => updateDetail("color", e.target.value)}
                      placeholder="e.g., White"
                      data-testid="input-color"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <FormLabel>Engine Type</FormLabel>
                    <Select
                      value={(categoryDetails.engineType as string) || ""}
                      onValueChange={(val) => updateDetail("engineType", val)}
                    >
                      <SelectTrigger data-testid="select-engine-type">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {ENGINE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Transmission</FormLabel>
                    <Select
                      value={(categoryDetails.transmission as string) || ""}
                      onValueChange={(val) => updateDetail("transmission", val)}
                    >
                      <SelectTrigger data-testid="select-transmission">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSMISSIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Condition</FormLabel>
                    <Select
                      value={(categoryDetails.condition as string) || ""}
                      onValueChange={(val) => updateDetail("condition", val)}
                    >
                      <SelectTrigger data-testid="select-vehicle-condition">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITIONS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <FormLabel>Features</FormLabel>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {VEHICLE_FEATURES.map((feature) => {
                      const selected =
                        ((categoryDetails.features as string[]) || []).includes(
                          feature
                        );
                      return (
                        <label
                          key={feature}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() =>
                              toggleArrayDetail("features", feature)
                            }
                            data-testid={`checkbox-feature-${feature.toLowerCase().replace(/\s+/g, "-")}`}
                          />
                          <span className="text-sm">{feature}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <FormLabel>Registration Expiry</FormLabel>
                    <Input
                      type="date"
                      value={(categoryDetails.registrationExpiry as string) ?? ""}
                      onChange={(e) => updateDetail("registrationExpiry", e.target.value)}
                      data-testid="input-registration-expiry"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Insurance Expiry</FormLabel>
                    <Input
                      type="date"
                      value={(categoryDetails.insuranceExpiry as string) ?? ""}
                      onChange={(e) => updateDetail("insuranceExpiry", e.target.value)}
                      data-testid="input-insurance-expiry"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Fuel Efficiency</FormLabel>
                    <Input
                      value={(categoryDetails.fuelEfficiency as string) ?? ""}
                      onChange={(e) => updateDetail("fuelEfficiency", e.target.value)}
                      placeholder="e.g., 12 km/L"
                      data-testid="input-fuel-efficiency"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {isLuxury && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Watch className="h-5 w-5" />
                  Item Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <FormLabel>Brand</FormLabel>
                    <Input
                      value={(categoryDetails.brand as string) ?? ""}
                      onChange={(e) => updateDetail("brand", e.target.value)}
                      placeholder="e.g., Rolex"
                      data-testid="input-brand"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Model</FormLabel>
                    <Input
                      value={(categoryDetails.model as string) ?? ""}
                      onChange={(e) => updateDetail("model", e.target.value)}
                      placeholder="e.g., Submariner"
                      data-testid="input-luxury-model"
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Year</FormLabel>
                    <Input
                      type="number"
                      value={categoryDetails.year ?? ""}
                      onChange={(e) =>
                        updateDetail(
                          "year",
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      data-testid="input-luxury-year"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <FormLabel>Condition</FormLabel>
                    <Select
                      value={(categoryDetails.condition as string) || ""}
                      onValueChange={(val) => updateDetail("condition", val)}
                    >
                      <SelectTrigger data-testid="select-luxury-condition">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITIONS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Material</FormLabel>
                    <Select
                      value={(categoryDetails.material as string) || ""}
                      onValueChange={(val) => updateDetail("material", val)}
                    >
                      <SelectTrigger data-testid="select-material">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {MATERIALS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <FormLabel>Features</FormLabel>
                  <Input
                    value={
                      Array.isArray(categoryDetails.features)
                        ? (categoryDetails.features as string[]).join(", ")
                        : ""
                    }
                    onChange={(e) =>
                      updateDetail(
                        "features",
                        e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                      )
                    }
                    placeholder="Comma-separated, e.g., Chronograph, Date Display"
                    data-testid="input-luxury-features"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <FormLabel>Serial Number (optional)</FormLabel>
                    <Input
                      value={(categoryDetails.serialNumber as string) ?? ""}
                      onChange={(e) =>
                        updateDetail("serialNumber", e.target.value)
                      }
                      data-testid="input-serial-number"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Checkbox
                      checked={categoryDetails.boxAndPapers === true}
                      onCheckedChange={(checked) =>
                        updateDetail("boxAndPapers", checked === true)
                      }
                      data-testid="checkbox-box-papers"
                    />
                    <span className="text-sm">Box & Papers included</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="hashtags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Hash className="h-4 w-4" />
                      Hashtags
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="luxury, dubai, barter (comma-separated)"
                        data-testid="input-hashtags"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Separate hashtags with commas
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => {
                  const userCountry = (user?.country || "AE").toUpperCase();
                  const cities = getCitiesForCountry(userCountry);
                  const allOptions = Array.from(new Set([...cities, ...LOCATIONS]));
                  return (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Location
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-location">
                            <SelectValue placeholder="Select location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allOptions.map((loc) => (
                            <SelectItem key={loc} value={loc}>
                              {loc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="marketValuation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Market Valuation (optional)
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Reference market trends, comparable sales, or valuation sources..."
                        className="min-h-[80px] resize-none"
                        data-testid="textarea-market-valuation"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="flex items-center gap-1">
                      Reference market trends, e.g., 'Dubizzle average AED 2.5M for similar villas'
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Adding market references helps other members understand fair value and increases trust in your listing.</p>
                        </TooltipContent>
                      </Tooltip>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pb-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/feed")}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-submit-post"
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create Post
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
