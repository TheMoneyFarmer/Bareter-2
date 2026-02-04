import { useState, useRef } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LOCATIONS, type Listing, type Rating, type OfferNeedItem } from "@shared/schema";
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
  Upload,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
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
  const [newOfferName, setNewOfferName] = useState("");
  const [newOfferValue, setNewOfferValue] = useState("");
  const [newNeedName, setNewNeedName] = useState("");
  const [newNeedValue, setNewNeedValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const verificationInputRef = useRef<HTMLInputElement>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);

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
    mutationFn: async (data: { whatIOffer?: OfferNeedItem[]; whatINeed?: OfferNeedItem[] }) => {
      const res = await apiRequest("PATCH", "/api/users/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "File uploaded",
        description: `Your ${variables.type === "verification" ? "verification document" : variables.type} has been uploaded.`,
      });
    },
    onError: () => {
      toast({
        title: "Upload failed",
        description: "Could not upload file. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileForm) => {
    updateProfileMutation.mutate(data);
  };

  const addOffer = () => {
    if (newOfferName.trim() && user) {
      const value = parseFloat(newOfferValue) || 0;
      const offers: OfferNeedItem[] = [...(user.whatIOffer || []), { name: newOfferName.trim(), value }];
      updateListsMutation.mutate({ whatIOffer: offers });
      setNewOfferName("");
      setNewOfferValue("");
    }
  };

  const removeOffer = (index: number) => {
    if (user) {
      const offers = (user.whatIOffer || []).filter((_, i) => i !== index);
      updateListsMutation.mutate({ whatIOffer: offers });
    }
  };

  const addNeed = () => {
    if (newNeedName.trim() && user) {
      const value = parseFloat(newNeedValue) || 0;
      const needs: OfferNeedItem[] = [...(user.whatINeed || []), { name: newNeedName.trim(), value }];
      updateListsMutation.mutate({ whatINeed: needs });
      setNewNeedName("");
      setNewNeedValue("");
    }
  };

  const removeNeed = (index: number) => {
    if (user) {
      const needs = (user.whatINeed || []).filter((_, i) => i !== index);
      updateListsMutation.mutate({ whatINeed: needs });
    }
  };

  const handleFileUpload = (type: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFileMutation.mutate({ file, type });
    }
  };

  const handlePortfolioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFileMutation.mutate({ file, type: "portfolio" });
    }
  };

  const averageRating = ratings && ratings.length > 0
    ? (ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length).toFixed(1)
    : null;

  const totalOfferValue = (user?.whatIOffer || []).reduce((sum, item) => sum + (item.value || 0), 0);
  const totalNeedValue = (user?.whatINeed || []).reduce((sum, item) => sum + (item.value || 0), 0);

  const verificationStatusConfig: Record<string, { icon: typeof CheckCircle; color: string; text: string }> = {
    pending: { icon: Clock, color: "text-yellow-500", text: "Not submitted" },
    submitted: { icon: Clock, color: "text-blue-500", text: "Under review" },
    verified: { icon: CheckCircle, color: "text-green-500", text: "Verified" },
    rejected: { icon: AlertCircle, color: "text-red-500", text: "Rejected" },
  };

  const verificationStatus = verificationStatusConfig[user?.verificationStatus || "pending"];

  if (!user) {
    return (
      <div className="container px-4 py-12 mx-auto max-w-4xl text-center">
        <p className="text-muted-foreground">Please sign in to view your profile.</p>
      </div>
    );
  }

  const isProfileIncomplete = !user.bio || !user.location || !user.businessName;

  return (
    <div className="container px-4 py-8 mx-auto max-w-4xl">
      {isProfileIncomplete && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Complete your profile</AlertTitle>
          <AlertDescription>
            Add your bio, location, and business details to start trading. Complete profiles get more trade proposals.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <div className="flex flex-col items-center">
          <div className="relative">
            <Avatar className="h-32 w-32">
              <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
              <AvatarFallback className="text-4xl bg-primary text-primary-foreground">
                {user.fullName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleFileUpload("avatar")}
            />
            <Button
              size="icon"
              variant="secondary"
              className="absolute bottom-0 right-0 h-10 w-10 rounded-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadFileMutation.isPending}
              data-testid="button-change-avatar"
            >
              {uploadFileMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            {user.isVerified && (
              <Badge className="gap-1">
                <Shield className="h-3 w-3" />
                Verified
              </Badge>
            )}
            <Badge variant="outline" className={verificationStatus.color}>
              <verificationStatus.icon className="h-3 w-3 mr-1" />
              {verificationStatus.text}
            </Badge>
          </div>
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
          <div className="flex items-center justify-center md:justify-start gap-4 mt-4 flex-wrap">
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
            <Separator orientation="vertical" className="h-10" />
            <div className="text-center">
              <div className="text-xl font-bold text-primary">
                AED {totalOfferValue.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Offers Value</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
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
          <TabsTrigger value="verification" data-testid="tab-verification">
            <Shield className="h-4 w-4 mr-2" />
            Verify
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
                        <FormLabel>Business Name</FormLabel>
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
                List the goods and services you can provide in trades with their retail values
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <Input
                  value={newOfferName}
                  onChange={(e) => setNewOfferName(e.target.value)}
                  placeholder="e.g., Hotel room nights"
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOffer())}
                  data-testid="input-new-offer-name"
                />
                <div className="flex gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">AED</span>
                    <Input
                      type="number"
                      value={newOfferValue}
                      onChange={(e) => setNewOfferValue(e.target.value)}
                      placeholder="0"
                      className="w-32 pl-12"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOffer())}
                      data-testid="input-new-offer-value"
                    />
                  </div>
                  <Button onClick={addOffer} data-testid="button-add-offer">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {(user.whatIOffer || []).map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                  >
                    <div>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-primary font-bold">
                        AED {(item.value || 0).toLocaleString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeOffer(index)}
                        data-testid={`button-remove-offer-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(user.whatIOffer || []).length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    No offers added yet. Add what you can provide in trades.
                  </p>
                )}
              </div>
              {(user.whatIOffer || []).length > 0 && (
                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Offer Value</span>
                  <span className="text-xl font-bold text-primary">
                    AED {totalOfferValue.toLocaleString()}
                  </span>
                </div>
              )}
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
                List the goods and services you're looking to receive with estimated values
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <Input
                  value={newNeedName}
                  onChange={(e) => setNewNeedName(e.target.value)}
                  placeholder="e.g., Office supplies"
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNeed())}
                  data-testid="input-new-need-name"
                />
                <div className="flex gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">AED</span>
                    <Input
                      type="number"
                      value={newNeedValue}
                      onChange={(e) => setNewNeedValue(e.target.value)}
                      placeholder="0"
                      className="w-32 pl-12"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNeed())}
                      data-testid="input-new-need-value"
                    />
                  </div>
                  <Button onClick={addNeed} data-testid="button-add-need">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {(user.whatINeed || []).map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                  >
                    <div>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-primary font-bold">
                        AED {(item.value || 0).toLocaleString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeNeed(index)}
                        data-testid={`button-remove-need-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(user.whatINeed || []).length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-4">
                    No needs added yet. Add what you're looking for in trades.
                  </p>
                )}
              </div>
              {(user.whatINeed || []).length > 0 && (
                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Need Value</span>
                  <span className="text-xl font-bold text-primary">
                    AED {totalNeedValue.toLocaleString()}
                  </span>
                </div>
              )}
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
              <input
                type="file"
                ref={portfolioInputRef}
                className="hidden"
                accept="image/*,video/*"
                onChange={handlePortfolioUpload}
              />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Button
                  variant="outline"
                  className="aspect-square flex flex-col items-center justify-center gap-2 h-auto"
                  onClick={() => portfolioInputRef.current?.click()}
                  disabled={uploadFileMutation.isPending}
                  data-testid="button-add-portfolio"
                >
                  {uploadFileMutation.isPending ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Plus className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Add Image</span>
                    </>
                  )}
                </Button>
                {(user.portfolioImages || []).map((image, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                    <img
                      src={image}
                      alt={`Portfolio ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-remove-portfolio-${index}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
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

        <TabsContent value="verification">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Business Verification
              </CardTitle>
              <CardDescription>
                Get verified to build trust and unlock more trading opportunities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted">
                <div className={`p-2 rounded-full bg-background ${verificationStatus.color}`}>
                  <verificationStatus.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">Verification Status: {verificationStatus.text}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {user.verificationStatus === "pending" && "Upload your trade license or Emirates ID to get verified."}
                    {user.verificationStatus === "submitted" && "Your documents are being reviewed. This usually takes 1-2 business days."}
                    {user.verificationStatus === "verified" && "Your business is verified! You now have access to all trading features."}
                    {user.verificationStatus === "rejected" && "Your verification was rejected. Please upload a clearer document."}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Upload Verification Document</h4>
                <p className="text-sm text-muted-foreground">
                  Accepted documents: Trade License, Commercial Registration, Emirates ID, or Passport for sole traders.
                </p>
                <input
                  type="file"
                  ref={verificationInputRef}
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileUpload("verification")}
                />
                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => verificationInputRef.current?.click()}
                    disabled={uploadFileMutation.isPending}
                    data-testid="button-upload-verification"
                  >
                    {uploadFileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload Document
                  </Button>
                  {user.verificationDocUrl && (
                    <Button variant="ghost" className="gap-2" asChild>
                      <a href={user.verificationDocUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4" />
                        View Current Document
                      </a>
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-medium">Benefits of Verification</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Display verified badge on your profile
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Higher visibility in search results
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Build trust with potential trading partners
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Access to premium trade opportunities
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
