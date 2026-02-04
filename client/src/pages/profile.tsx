import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LOCATIONS, type Listing, type Rating } from "@shared/schema";
import {
  User,
  MapPin,
  Building2,
  Shield,
  Star,
  Plus,
  X,
  Loader2,
  Camera,
  Package,
  ShoppingCart,
  ImageIcon,
} from "lucide-react";
import { z } from "zod";

const profileSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  bio: z.string().optional(),
  location: z.string().optional(),
  businessName: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

export function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newOffer, setNewOffer] = useState("");
  const [newNeed, setNewNeed] = useState("");

  const { data: listings } = useQuery<Listing[]>({
    queryKey: ["/api/listings/user", user?.id],
    enabled: !!user,
  });

  const { data: ratings } = useQuery<Rating[]>({
    queryKey: ["/api/ratings/user", user?.id],
    enabled: !!user,
  });

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user?.fullName || "",
      bio: user?.bio || "",
      location: user?.location || "",
      businessName: user?.businessName || "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const res = await apiRequest("PATCH", "/api/users/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateListsMutation = useMutation({
    mutationFn: async (data: { whatIOffer?: string[]; whatINeed?: string[] }) => {
      const res = await apiRequest("PATCH", "/api/users/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const onSubmit = (data: ProfileForm) => {
    updateProfileMutation.mutate(data);
  };

  const addOffer = () => {
    if (newOffer.trim() && user) {
      const offers = [...(user.whatIOffer || []), newOffer.trim()];
      updateListsMutation.mutate({ whatIOffer: offers });
      setNewOffer("");
    }
  };

  const removeOffer = (index: number) => {
    if (user) {
      const offers = (user.whatIOffer || []).filter((_, i) => i !== index);
      updateListsMutation.mutate({ whatIOffer: offers });
    }
  };

  const addNeed = () => {
    if (newNeed.trim() && user) {
      const needs = [...(user.whatINeed || []), newNeed.trim()];
      updateListsMutation.mutate({ whatINeed: needs });
      setNewNeed("");
    }
  };

  const removeNeed = (index: number) => {
    if (user) {
      const needs = (user.whatINeed || []).filter((_, i) => i !== index);
      updateListsMutation.mutate({ whatINeed: needs });
    }
  };

  const averageRating = ratings && ratings.length > 0
    ? (ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length).toFixed(1)
    : null;

  if (!user) {
    return (
      <div className="container px-4 py-12 mx-auto max-w-4xl text-center">
        <p className="text-muted-foreground">Please sign in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8 mx-auto max-w-4xl">
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <div className="flex flex-col items-center">
          <div className="relative">
            <Avatar className="h-32 w-32">
              <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
              <AvatarFallback className="text-4xl bg-primary text-primary-foreground">
                {user.fullName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Button
              size="icon"
              variant="secondary"
              className="absolute bottom-0 right-0 h-10 w-10 rounded-full"
              data-testid="button-change-avatar"
            >
              <Camera className="h-4 w-4" />
            </Button>
          </div>
          {user.isVerified && (
            <Badge className="mt-3 gap-1">
              <Shield className="h-3 w-3" />
              Verified
            </Badge>
          )}
        </div>

        <div className="flex-1 text-center md:text-left">
          <h1 className="text-2xl font-bold">{user.fullName}</h1>
          {user.businessName && (
            <p className="text-muted-foreground flex items-center justify-center md:justify-start gap-1 mt-1">
              <Building2 className="h-4 w-4" />
              {user.businessName}
            </p>
          )}
          {user.location && (
            <p className="text-muted-foreground flex items-center justify-center md:justify-start gap-1 mt-1">
              <MapPin className="h-4 w-4" />
              {user.location}
            </p>
          )}
          <div className="flex items-center justify-center md:justify-start gap-4 mt-4">
            <div className="text-center">
              <div className="text-xl font-bold">{listings?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Listings</div>
            </div>
            <Separator orientation="vertical" className="h-10" />
            <div className="text-center">
              <div className="text-xl font-bold flex items-center gap-1">
                {averageRating || "-"}
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
              </div>
              <div className="text-xs text-muted-foreground">Rating ({ratings?.length || 0})</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile" data-testid="tab-profile">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="offers" data-testid="tab-offers">
            <Package className="h-4 w-4 mr-2" />
            Offers
          </TabsTrigger>
          <TabsTrigger value="needs" data-testid="tab-needs">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Needs
          </TabsTrigger>
          <TabsTrigger value="portfolio" data-testid="tab-portfolio">
            <ImageIcon className="h-4 w-4 mr-2" />
            Portfolio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal and business details</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-profile-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Name (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your company or business name"
                            {...field}
                            data-testid="input-business-name"
                          />
                        </FormControl>
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
                              <SelectValue placeholder="Select your location" />
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

                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bio</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell others about yourself and your business..."
                            className="min-h-[100px] resize-none"
                            {...field}
                            data-testid="textarea-bio"
                          />
                        </FormControl>
                        <FormDescription>
                          This will be visible on your public profile
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={updateProfileMutation.isPending}
                      data-testid="button-save-profile"
                    >
                      {updateProfileMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                What I Offer
              </CardTitle>
              <CardDescription>
                List the goods and services you can provide in trades
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  value={newOffer}
                  onChange={(e) => setNewOffer(e.target.value)}
                  placeholder="e.g., Hotel room nights, Marketing services..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOffer())}
                  data-testid="input-new-offer"
                />
                <Button onClick={addOffer} data-testid="button-add-offer">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(user.whatIOffer || []).map((item, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {item}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 hover:bg-transparent"
                      onClick={() => removeOffer(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
                {(user.whatIOffer || []).length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    No offers added yet. Add what you can provide in trades.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="needs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                What I Need
              </CardTitle>
              <CardDescription>
                List the goods and services you're looking to receive
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  value={newNeed}
                  onChange={(e) => setNewNeed(e.target.value)}
                  placeholder="e.g., Office supplies, Web development..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNeed())}
                  data-testid="input-new-need"
                />
                <Button onClick={addNeed} data-testid="button-add-need">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(user.whatINeed || []).map((item, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {item}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 hover:bg-transparent"
                      onClick={() => removeNeed(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
                {(user.whatINeed || []).length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    No needs added yet. Add what you're looking for in trades.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-primary" />
                Portfolio Gallery
              </CardTitle>
              <CardDescription>
                Showcase your work with images and videos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Button
                  variant="outline"
                  className="aspect-square flex flex-col items-center justify-center gap-2 h-auto"
                  data-testid="button-add-portfolio"
                >
                  <Plus className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Add Image</span>
                </Button>
                {(user.portfolioImages || []).map((image, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                    <img
                      src={image}
                      alt={`Portfolio ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
              {(user.portfolioImages || []).length === 0 && (
                <p className="text-muted-foreground text-sm text-center mt-4">
                  Add images to showcase your products and services
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
