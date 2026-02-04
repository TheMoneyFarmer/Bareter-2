import { useState } from "react";
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
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CATEGORIES, LOCATIONS } from "@shared/schema";
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
} from "lucide-react";
import { z } from "zod";

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
  images: z.array(z.string()).optional(),
});

type CreateListingForm = z.infer<typeof createListingSchema>;

export function CreateListingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [newTag, setNewTag] = useState("");

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
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateListingForm) => {
      const res = await apiRequest("POST", "/api/listings", {
        ...data,
        retailValue: data.retailValue,
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

  const selectedType = form.watch("type");
  const selectedCategories = form.watch("categories");
  const tags = form.watch("tags") || [];

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
                Categories
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
                          data-testid={`badge-category-${category.toLowerCase()}`}
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 hover:bg-transparent"
                      onClick={() => removeTag(tag)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImagePlus className="h-5 w-5" />
                Images (Optional)
              </CardTitle>
              <CardDescription>
                Add photos to showcase what you're offering
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <Button
                  type="button"
                  variant="outline"
                  className="aspect-square flex flex-col items-center justify-center gap-2 h-auto"
                  data-testid="button-add-image"
                >
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Add Image</span>
                </Button>
              </div>
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
