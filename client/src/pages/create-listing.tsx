import { useState, useRef } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CATEGORIES, LOCATIONS, ExchangeItem } from "@shared/schema";
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

const createListingSchema = z.object({
  type: z.enum(["offer", "request"]),
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  categories: z.array(z.string()).min(1, "Select at least one category"),
  retailValue: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: "Enter a valid value greater than 0",
  }),
  location: z.string().min(1, "Select a location"),
  tags: z.array(z.string()).optional(),
  images: z.array(z.string()).min(3, "Please upload at least 3 images"),
  wantedCategories: z.array(z.string()).optional(),
  exchangeItems: z.array(exchangeItemSchema).optional(),
  openToOffers: z.boolean().optional(),
});

type CreateListingForm = z.infer<typeof createListingSchema>;

export function CreateListingPage() {
  const { user } = useAuth();
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
    resolver: zodResolver(createListingSchema),
    defaultValues: {
      type: "offer",
      title: "",
      description: "",
      categories: [],
      retailValue: "",
      location: user?.location || "",
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
      toast({
        title: "Listing created!",
        description: "Your listing is now live and visible to other users.",
      });
      navigate(`/listings/${data.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create listing",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateListingForm) => {
    createMutation.mutate(data);
  };

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
        title: "Upload failed",
        description: error.message || "Could not upload one or more images. Please try again.",
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
        <p className="text-muted-foreground">Please sign in to create a listing.</p>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create Listing</h1>
        <p className="text-muted-foreground">
          List something you want to offer or request in a trade
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Listing Type</CardTitle>
              <CardDescription>
                Are you offering something or looking for something?
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
                            <span className="font-semibold">I'm Offering</span>
                            <span className="text-xs text-muted-foreground text-center mt-1">
                              Goods or services to trade
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
                            <span className="font-semibold">I'm Looking For</span>
                            <span className="text-xs text-muted-foreground text-center mt-1">
                              Something I need
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
                Details
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
                        placeholder={
                          selectedType === "offer"
                            ? "e.g., 5 Nights Hotel Stay in Dubai Marina"
                            : "e.g., Looking for Web Development Services"
                        }
                        data-testid="input-title"
                        {...field}
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what you're offering or looking for in detail..."
                        className="min-h-[120px] resize-none"
                        data-testid="textarea-description"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Be specific about what's included, conditions, and any requirements
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
                {selectedType === "offer" ? "What I'm Offering" : "What I Need"} - Categories
              </CardTitle>
              <CardDescription>
                Select all categories that apply (at least one required)
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
                  Category Details
                </CardTitle>
                <CardDescription>
                  Provide additional details specific to your selected categories
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(selectedCategories.includes("Fashion") || selectedCategories.includes("Modeling")) && (
                  <>
                    <div className="space-y-2">
                      <FormLabel>Number of Outfits</FormLabel>
                      <Input
                        type="number"
                        value={categoryDetails.numberOfOutfits ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, numberOfOutfits: e.target.value ? Number(e.target.value) : "" }))}
                        data-testid="input-number-of-outfits"
                      />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>Shoot Duration</FormLabel>
                      <Input
                        value={categoryDetails.shootDuration ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, shootDuration: e.target.value }))}
                        placeholder="e.g., 2 hours, Full day"
                        data-testid="input-shoot-duration"
                      />
                    </div>
                  </>
                )}
                {selectedCategories.includes("Hospitality") && (
                  <>
                    <div className="space-y-2">
                      <FormLabel>Preferred Dates</FormLabel>
                      <Input
                        value={categoryDetails.dates ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, dates: e.target.value }))}
                        placeholder="e.g., Dec 15-20, Flexible"
                        data-testid="input-preferred-dates"
                      />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>Room Type</FormLabel>
                      <Input
                        value={categoryDetails.roomType ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, roomType: e.target.value }))}
                        placeholder="e.g., Deluxe Suite, Standard"
                        data-testid="input-room-type"
                      />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>Content Deliverables</FormLabel>
                      <Input
                        value={categoryDetails.contentDeliverables ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, contentDeliverables: e.target.value }))}
                        placeholder="e.g., 3 Reels + 5 Stories"
                        data-testid="input-content-deliverables"
                      />
                    </div>
                  </>
                )}
                {selectedCategories.includes("SaaS") && (
                  <>
                    <div className="space-y-2">
                      <FormLabel>License Duration</FormLabel>
                      <Input
                        value={categoryDetails.licenseDuration ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, licenseDuration: e.target.value }))}
                        placeholder="e.g., 12 months, Annual"
                        data-testid="input-license-duration"
                      />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>Features Included</FormLabel>
                      <Input
                        value={categoryDetails.featuresIncluded ?? ""}
                        onChange={(e) => setCategoryDetails((prev) => ({ ...prev, featuresIncluded: e.target.value }))}
                        placeholder="e.g., Pro plan, All features"
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
                What I Want in Exchange
              </CardTitle>
              <CardDescription>
                Tell potential trade partners what you're looking for in return
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <FormLabel className="text-base mb-3 block">Preferred Categories</FormLabel>
                <p className="text-sm text-muted-foreground mb-3">
                  Select categories of goods/services you'd accept in trade
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

              <div className="border-t pt-6">
                <FormLabel className="text-base mb-3 block flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Specific Exchange Items
                </FormLabel>
                <p className="text-sm text-muted-foreground mb-3">
                  Add specific items you'd accept. Mark priority items with a star!
                </p>
                
                <div className="flex gap-2 mb-4">
                  <Input
                    value={newExchangeItem}
                    onChange={(e) => setNewExchangeItem(e.target.value)}
                    placeholder="e.g., Professional photos, Marketing services..."
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExchangeItem())}
                    className="flex-1"
                    data-testid="input-exchange-item"
                  />
                  <Button
                    type="button"
                    variant={newItemPriority ? "default" : "outline"}
                    size="icon"
                    onClick={() => setNewItemPriority(!newItemPriority)}
                    title={newItemPriority ? "Priority item" : "Mark as priority"}
                    data-testid="button-toggle-priority"
                  >
                    <Star className={`h-4 w-4 ${newItemPriority ? "fill-current" : ""}`} />
                  </Button>
                  <Button type="button" onClick={addExchangeItem} data-testid="button-add-exchange">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {priorityItems.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-primary mb-2 flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" />
                      Priority Items (What I Really Want)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {priorityItems.map((item) => (
                        <Badge
                          key={item.name}
                          className="gap-1 pr-1 bg-primary/10 text-primary border-primary/30"
                        >
                          <Star className="h-3 w-3 fill-current" />
                          {item.name}
                          <button
                            type="button"
                            className="ml-1 p-0.5 rounded hover-elevate"
                            onClick={(e) => { e.stopPropagation(); toggleItemPriority(item.name); }}
                            title="Remove priority"
                            data-testid={`button-toggle-priority-${item.name.replace(/\s+/g, "-")}`}
                          >
                            <Star className="h-3 w-3 fill-current text-primary" />
                          </button>
                          <button
                            type="button"
                            className="p-0.5 rounded hover-elevate"
                            onClick={(e) => { e.stopPropagation(); removeExchangeItem(item.name); }}
                            data-testid={`button-remove-item-${item.name.replace(/\s+/g, "-")}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {otherItems.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Also Open To
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {otherItems.map((item) => (
                        <Badge key={item.name} variant="secondary" className="gap-1 pr-1">
                          {item.name}
                          <button
                            type="button"
                            className="ml-1 p-0.5 rounded hover-elevate"
                            onClick={(e) => { e.stopPropagation(); toggleItemPriority(item.name); }}
                            title="Mark as priority"
                            data-testid={`button-make-priority-${item.name.replace(/\s+/g, "-")}`}
                          >
                            <Star className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="p-0.5 rounded hover-elevate"
                            onClick={(e) => { e.stopPropagation(); removeExchangeItem(item.name); }}
                            data-testid={`button-remove-${item.name.replace(/\s+/g, "-")}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t pt-6">
                <FormField
                  control={form.control}
                  name="openToOffers"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-open-offers"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="cursor-pointer">
                          Open to other offers
                        </FormLabel>
                        <FormDescription>
                          Allow traders to propose items not listed above
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Value & Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="retailValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retail Value (AED)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          AED
                        </span>
                        <Input
                          type="number"
                          placeholder="0.00"
                          className="pl-14"
                          data-testid="input-value"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      The approximate retail/market value of what you're offering or requesting
                    </FormDescription>
                    {marketAvgValue && !isNaN(enteredValue) && enteredValue > 0 && (
                      <p className={`text-xs mt-1 flex items-center gap-1 ${isLowValue ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {isLowValue ? "⚠" : "ℹ"} Market average for this category: AED {marketAvgValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {isLowValue && " — your value seems significantly below the typical range"}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-location">
                          <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LOCATIONS.map((location) => (
                          <SelectItem key={location} value={location}>
                            {location}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <AiValuationPanel
            title={titleWatch || ""}
            description={descriptionWatch || ""}
            category={(selectedCategories || [])[0] || ""}
            condition={form.watch("condition") || undefined}
            declaredValue={retailValueWatch ? parseFloat(String(retailValueWatch)) : undefined}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tags (Optional)
              </CardTitle>
              <CardDescription>
                Add keywords to help others find your listing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  data-testid="input-tag"
                />
                <Button type="button" onClick={addTag} data-testid="button-add-tag">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button
                      type="button"
                      className="p-0.5 rounded hover-elevate"
                      onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                      data-testid={`button-remove-tag-${tag.replace(/\s+/g, "-")}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImagePlus className="h-5 w-5" />
                Images
                <Badge variant="destructive" className="text-xs">Required</Badge>
              </CardTitle>
              <CardDescription>
                Upload at least 3 photos to showcase your listing. Max 5MB per image.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="images"
                render={() => (
                  <FormItem>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handleImageUpload(e.target.files)}
                      data-testid="input-image-upload"
                    />
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {images.map((url, index) => (
                        <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                          <img
                            src={url}
                            alt={`Listing image ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ visibility: "visible" }}
                            data-testid={`button-remove-image-${index}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        className="aspect-square flex flex-col items-center justify-center gap-2 h-auto border-dashed border-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImages}
                        data-testid="button-add-image"
                      >
                        {uploadingImages ? (
                          <>
                            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                            <span className="text-xs text-muted-foreground">Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Add Images</span>
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <FormDescription>
                        {images.length}/3 minimum images uploaded
                      </FormDescription>
                      {images.length < 3 && (
                        <span className="text-xs text-destructive">
                          {3 - images.length} more {3 - images.length === 1 ? "image" : "images"} needed
                        </span>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex gap-4 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/browse")}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-create-listing"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Listing
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
