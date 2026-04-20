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
import { LOCATIONS, type Listing, type Rating, type OfferNeedItem, type SocialProfile } from "@shared/schema";
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
  Globe,
  Users,
  Award,
  ThumbsUp,
  Zap,
  TrendingUp,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import { VerifiedBadge, isUserVerified } from "@/components/verified-badge";
import { SiInstagram, SiTiktok, SiYoutube, SiLinkedin, SiX } from "react-icons/si";
import { z } from "zod";

const profileSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  bio: z.string().optional(),
  location: z.string().optional(),
  businessName: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

type User = {
  id: string;
  fullName: string;
  email: string;
  accountType?: string | null;
  kycStatus?: string | null;
  kybStatus?: string | null;
  isVerified?: boolean | null;
  [key: string]: any;
};

function VerificationSection({ user }: { user: User }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAccountType, setSelectedAccountType] = useState(user.accountType || "individual");

  const { data: verificationStatus, isLoading: statusLoading } = useQuery<{
    accountType: string;
    kycStatus: string;
    kybStatus: string;
    isVerified: boolean;
    status: string;
    label: string;
    color: string;
  }>({
    queryKey: ["/api/verification/status"],
  });

  const startVerificationMutation = useMutation({
    mutationFn: async (accountType: string) => {
      const res = await apiRequest("POST", "/api/verification/session", { accountType });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.verificationUrl) {
        window.open(data.verificationUrl, "_blank");
        toast({
          title: "Verification Started",
          description: "Complete the verification process in the new window.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/verification/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start verification. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateAccountTypeMutation = useMutation({
    mutationFn: async (accountType: string) => {
      const res = await apiRequest("PATCH", "/api/users/account-type", { accountType });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const handleAccountTypeChange = (value: string) => {
    setSelectedAccountType(value);
    updateAccountTypeMutation.mutate(value);
  };

  const status = verificationStatus?.status || "NOT_STARTED";
  const isVerified = verificationStatus?.isVerified || user.isVerified;
  const canStartVerification = status === "NOT_STARTED" || status === "DECLINED" || status === "EXPIRED" || status === "ABANDONED";

  const getStatusConfig = () => {
    switch (status) {
      case "APPROVED":
        return { icon: CheckCircle, color: "text-green-500", bgColor: "bg-green-50 dark:bg-green-950", text: "Verified" };
      case "IN_PROGRESS":
        return { icon: Clock, color: "text-yellow-500", bgColor: "bg-yellow-50 dark:bg-yellow-950", text: "Verification In Progress" };
      case "IN_REVIEW":
        return { icon: Clock, color: "text-blue-500", bgColor: "bg-blue-50 dark:bg-blue-950", text: "Under Review" };
      case "DECLINED":
        return { icon: AlertCircle, color: "text-red-500", bgColor: "bg-red-50 dark:bg-red-950", text: "Verification Failed" };
      case "EXPIRED":
        return { icon: AlertCircle, color: "text-orange-500", bgColor: "bg-orange-50 dark:bg-orange-950", text: "Verification Expired" };
      case "ABANDONED":
        return { icon: AlertCircle, color: "text-gray-500", bgColor: "bg-gray-50 dark:bg-gray-950", text: "Verification Abandoned" };
      default:
        return { icon: Shield, color: "text-muted-foreground", bgColor: "bg-muted", text: "Not Verified" };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Identity Verification
        </CardTitle>
        <CardDescription>
          Verify your identity to start bartering on BarterGram
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className={`flex items-start gap-4 p-4 rounded-lg ${statusConfig.bgColor}`}>
          <div className={`p-2 rounded-full bg-background ${statusConfig.color}`}>
            <StatusIcon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium">Status: {statusConfig.text}</h4>
            <p className="text-sm text-muted-foreground mt-1">
              {status === "NOT_STARTED" && "Complete identity verification to start bartering."}
              {status === "IN_PROGRESS" && "Please complete the verification process in the verification window."}
              {status === "IN_REVIEW" && "Your documents are being reviewed. This usually takes a few minutes."}
              {status === "APPROVED" && "You are verified and can now trade on BarterGram!"}
              {status === "DECLINED" && "Your verification was declined. Please try again with valid documents."}
              {status === "EXPIRED" && "Your verification session expired. Please start again."}
              {status === "ABANDONED" && "You didn't complete verification. Please try again."}
            </p>
          </div>
        </div>

        {!isVerified && (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Account Type</label>
                <Select value={selectedAccountType} onValueChange={handleAccountTypeChange}>
                  <SelectTrigger data-testid="select-account-type">
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual (Personal ID)</SelectItem>
                    <SelectItem value="business">Business (Trade License)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedAccountType === "individual" 
                    ? "You'll verify with Emirates ID or Passport"
                    : "You'll verify with Trade License and authorized signatory ID"
                  }
                </p>
              </div>
            </div>

            <Separator />

            {canStartVerification && (
              <Button
                className="w-full gap-2"
                size="lg"
                onClick={() => startVerificationMutation.mutate(selectedAccountType)}
                disabled={startVerificationMutation.isPending}
                data-testid="button-start-verification"
              >
                {startVerificationMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
                {status === "NOT_STARTED" ? "Start Verification" : "Retry Verification"}
              </Button>
            )}

            {status === "IN_PROGRESS" && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertTitle>Verification in Progress</AlertTitle>
                <AlertDescription>
                  If you closed the verification window, click the button below to continue.
                  <Button
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => startVerificationMutation.mutate(selectedAccountType)}
                    disabled={startVerificationMutation.isPending}
                    data-testid="button-continue-verification"
                  >
                    Continue Verification
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {isVerified && (
          <Alert className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-700 dark:text-green-300">Verified Account</AlertTitle>
            <AlertDescription className="text-green-600 dark:text-green-400">
              Your identity has been verified. You can now trade with confidence on BarterGram.
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        <div className="space-y-3">
          <h4 className="font-medium">Why Verification is Required</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Mandatory for all bartering activities
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Builds trust with bartering partners
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Complies with UAE regulations
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Protects against fraud
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

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

  const { data: credibility } = useQuery<{
    credibilityScore: number;
    completedDeals: number;
    totalEndorsements: number;
    avgRating: number;
    isVerified: boolean;
  }>({
    queryKey: ["/api/users", user?.id, "credibility"],
    enabled: !!user,
  });

  const { data: endorsements } = useQuery<Array<{
    id: string;
    skill: string;
    fromUserId: string;
    fromUser?: { fullName: string; avatarUrl?: string };
  }>>({
    queryKey: ["/api/endorsements", user?.id],
    enabled: !!user,
  });

  const { data: portfolioItems } = useQuery<Array<{
    id: string;
    title: string;
    description?: string;
    mediaUrl: string;
    mediaType: string;
    category?: string;
  }>>({
    queryKey: ["/api/portfolio", user?.id],
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

  const verificationStatus = verificationStatusConfig[user?.verificationStatus || "pending"] || verificationStatusConfig.pending;

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
            Add your bio, location, and business details to start bartering. Complete profiles get more trade proposals.
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
          {user.signupType && (
            <Badge variant="outline" className="mt-2">
              {user.signupType === "creator" ? "Creator" : "Brand"}
            </Badge>
          )}
          {user.socialProfiles && (user.socialProfiles as SocialProfile[]).length > 0 && (
            <div className="flex items-center justify-center md:justify-start gap-3 mt-3 flex-wrap">
              {(user.socialProfiles as SocialProfile[]).map((sp: SocialProfile) => {
                const platformIcons: Record<string, typeof SiInstagram> = {
                  instagram: SiInstagram,
                  tiktok: SiTiktok,
                  youtube: SiYoutube,
                  linkedin: SiLinkedin,
                  x: SiX,
                };
                const Icon = platformIcons[sp.platform] || Globe;
                return (
                  <div key={sp.platform} className="flex items-center gap-1 text-sm text-muted-foreground" data-testid={`social-${sp.platform}`}>
                    <Icon className="h-4 w-4" />
                    <span>@{sp.username}</span>
                    {sp.followerCount && (
                      <Badge variant="secondary" className="text-xs ml-1">
                        <Users className="h-3 w-3 mr-1" />
                        {sp.followerCount >= 1000 ? `${(sp.followerCount / 1000).toFixed(1)}K` : sp.followerCount}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {credibility && credibility.credibilityScore > 0 && (
            <div className="flex items-center justify-center md:justify-start gap-2 mt-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <Award className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary" data-testid="text-credibility-score">
                  {credibility.credibilityScore}/100
                </span>
                <span className="text-xs text-muted-foreground">Credibility</span>
              </div>
              {credibility.completedDeals > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {credibility.completedDeals} deals
                </Badge>
              )}
            </div>
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
            {endorsements && endorsements.length > 0 && (
              <>
                <Separator orientation="vertical" className="h-10" />
                <div className="text-center">
                  <div className="text-xl font-bold flex items-center gap-1">
                    {endorsements.length}
                    <ThumbsUp className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-xs text-muted-foreground">Endorsements</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="profile" className="flex-1 min-w-0" data-testid="tab-profile">
            <User className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0" />
            <span className="truncate">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="offers" className="flex-1 min-w-0" data-testid="tab-offers">
            <Package className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0" />
            <span className="truncate">Offers</span>
          </TabsTrigger>
          <TabsTrigger value="needs" className="flex-1 min-w-0" data-testid="tab-needs">
            <ShoppingCart className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0" />
            <span className="truncate">Needs</span>
          </TabsTrigger>
          <TabsTrigger value="endorsements" className="flex-1 min-w-0" data-testid="tab-endorsements">
            <ThumbsUp className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0" />
            <span className="truncate">Endorsements</span>
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="flex-1 min-w-0" data-testid="tab-portfolio">
            <ImageIcon className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0" />
            <span className="truncate">Portfolio</span>
          </TabsTrigger>
          <TabsTrigger value="verification" className="flex-1 min-w-0" data-testid="tab-verification">
            <Shield className="h-4 w-4 mr-1 sm:mr-2 flex-shrink-0" />
            <span className="truncate">Verify</span>
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

        <TabsContent value="endorsements">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ThumbsUp className="h-5 w-5 text-primary" />
                Skill Endorsements
              </CardTitle>
              <CardDescription>
                Endorsements from other traders who have worked with you
              </CardDescription>
            </CardHeader>
            <CardContent>
              {endorsements && endorsements.length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(
                    endorsements.reduce<Record<string, typeof endorsements>>((acc, e) => {
                      if (!acc[e.skill]) acc[e.skill] = [];
                      acc[e.skill].push(e);
                      return acc;
                    }, {})
                  ).map(([skill, skillEndorsements]) => (
                    <div key={skill} className="p-3 rounded-md bg-muted" data-testid={`endorsement-skill-${skill}`}>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-primary" />
                          <span className="font-medium">{skill}</span>
                        </div>
                        <Badge variant="secondary">{skillEndorsements.length} endorsement{skillEndorsements.length !== 1 ? "s" : ""}</Badge>
                      </div>
                      <div className="flex -space-x-2">
                        {skillEndorsements.slice(0, 5).map((e) => (
                          <Avatar key={e.id} className="h-7 w-7 border-2 border-background">
                            <AvatarImage src={e.fromUser?.avatarUrl || undefined} />
                            <AvatarFallback className="text-[8px]">{e.fromUser?.fullName?.charAt(0) || "U"}</AvatarFallback>
                          </Avatar>
                        ))}
                        {skillEndorsements.length > 5 && (
                          <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium">
                            +{skillEndorsements.length - 5}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ThumbsUp className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No endorsements yet</p>
                  <p className="text-muted-foreground text-xs mt-1">Complete trades to receive endorsements from other users</p>
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
                {portfolioItems && portfolioItems.length > 0
                  ? portfolioItems.map((item) => (
                    <div key={item.id} className="relative aspect-square rounded-md overflow-hidden bg-muted group" data-testid={`portfolio-item-${item.id}`}>
                      <img src={item.mediaUrl} alt={item.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <p className="text-white text-xs font-medium truncate">{item.title}</p>
                        {item.category && <Badge variant="secondary" className="text-[10px] mt-0.5">{item.category}</Badge>}
                      </div>
                    </div>
                  ))
                  : (user.portfolioImages || []).map((image, index) => (
                    <div key={index} className="relative aspect-square rounded-md overflow-hidden bg-muted group">
                      <img src={image} alt={`Portfolio ${index + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))
                }
              </div>
              {(!portfolioItems || portfolioItems.length === 0) && (user.portfolioImages || []).length === 0 && (
                <p className="text-muted-foreground text-sm text-center mt-4">
                  Add images to showcase your products and services
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification">
          <VerificationSection user={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
