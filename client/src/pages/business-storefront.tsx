import { useState, useRef, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Building2,
  MapPin,
  ShieldCheck,
  Package,
  Globe,
  Clock,
  Settings,
  Plus,
  Search,
  Eye,
  Pencil,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  Store,
  Trash2,
  ImagePlus,
  X,
  Loader2,
  ArrowLeftRight,
  Camera,
  Save,
} from "lucide-react";
import { API_BASE, assetUrl, apiRequest } from "@/lib/queryClient";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/lib/auth";
import { useSeo } from "@/hooks/use-seo";
import { useToast } from "@/hooks/use-toast";
import { BusinessProductCard } from "@/components/BusinessProductCard";
import { ListingCard as BrandListingCard } from "@/components/ListingCard";

// ── Types ──────────────────────────────────────────────────────────────────

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

interface DayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}

type BusinessHours = Partial<Record<DayKey, DayHours>>;

interface BusinessStorefrontData {
  id: string;
  companyName: string;
  category?: string | null;
  kybStatus: string;
  kybVerifiedAt?: string | null;
  createdAt: string;
  coverImageUrl?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  businessHours?: BusinessHours | null;
  location?: string | null;
  websiteDisplay?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
  owner: {
    id: string;
    fullName: string;
    avatarUrl?: string | null;
    city?: string | null;
    country?: string | null;
    isVerified?: boolean;
  } | null;
  activeListings: any[];
  ownerListings?: any[];
}

interface CatalogProduct {
  id: string;
  businessId: string;
  name: string;
  description?: string | null;
  price?: string | null;
  currency: string;
  images: string[];
  isActive: boolean;
  createdAt: string;
}

type CatalogTab = "all" | "products" | "wholesale" | "services" | "store";

// ── Dubai timezone helpers ─────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS: Record<DayKey, string> = {
  sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday",
  thu: "Thursday", fri: "Friday", sat: "Saturday",
};

function getDubaiNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
}

function getDayKey(d: Date): DayKey {
  return DAY_KEYS[d.getDay()];
}

function fmt12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function isOpenNow(hours: BusinessHours): { open: boolean; label: string } {
  const now = getDubaiNow();
  const dayKey = getDayKey(now);
  const today = hours[dayKey];
  if (!today || today.closed) return { open: false, label: "Closed today" };
  if (!today.open || !today.close) return { open: false, label: "Hours not set" };
  const cur = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (cur >= today.open && cur < today.close) {
    return { open: true, label: `Open · closes ${fmt12(today.close)}` };
  }
  if (cur < today.open) {
    return { open: false, label: `Closed · opens ${fmt12(today.open)}` };
  }
  return { open: false, label: "Closed now" };
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function BusinessStorefrontSkeleton() {
  return (
    <div className="container mx-auto max-w-5xl px-4 pb-12 space-y-0">
      <Skeleton className="w-full h-48 rounded-none" />
      <div className="px-6 pb-6 space-y-4">
        <div className="flex items-end gap-4 -mt-10">
          <Skeleton className="h-20 w-20 rounded-xl flex-shrink-0 ring-4 ring-background" />
          <div className="space-y-2 pb-2 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-4 w-full max-w-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    </div>
  );
}

// ── Hours panel ────────────────────────────────────────────────────────────

function HoursPanel({ hours }: { hours: BusinessHours }) {
  const [expanded, setExpanded] = useState(false);
  const now = getDubaiNow();
  const todayKey = getDayKey(now);
  const status = isOpenNow(hours);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 text-sm hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className={`font-medium ${status.open ? "text-green-600" : "text-muted-foreground"}`}>
          {status.label}
        </span>
        <span className="text-xs text-muted-foreground">(tap to see hours)</span>
      </button>
      {expanded && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
          {DAY_KEYS.slice(1).concat(DAY_KEYS[0]).map(day => {
            const dh = hours[day];
            const isToday = day === todayKey;
            return (
              <div key={day} className={`flex justify-between gap-4 ${isToday ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                <span className="w-24 shrink-0">{DAY_LABELS[day]}</span>
                <span>
                  {dh?.closed ? "Closed" : (dh?.open && dh?.close) ? `${fmt12(dh.open)} – ${fmt12(dh.close)}` : "—"}
                </span>
              </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground pt-1 border-t border-border mt-1">All times Dubai (GST, UTC+4)</p>
        </div>
      )}
    </div>
  );
}

// ── Store product card ─────────────────────────────────────────────────────

function StoreProductCard({
  product,
  isOwner,
  onDelete,
}: {
  product: CatalogProduct;
  isOwner: boolean;
  onDelete: (id: string) => void;
}) {
  const thumb = product.images?.[0] ? assetUrl(product.images[0]) : null;
  const priceNum = product.price ? parseFloat(product.price) : null;

  return (
    <article className="bg-white dark:bg-card rounded-xl border border-bareter-border dark:border-border shadow-sm overflow-hidden group relative flex flex-col">
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-muted overflow-hidden flex-shrink-0 relative">
        {thumb ? (
          <img
            src={thumb}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        <span className="absolute top-2 start-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white bg-bareter-teal/90 shadow-sm">
          <Store className="h-3 w-3" />
          Catalog
        </span>
        {/* Multiple images indicator */}
        {product.images.length > 1 && (
          <span className="absolute top-2 end-2 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded">
            +{product.images.length - 1}
          </span>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={() => onDelete(product.id)}
            className="absolute bottom-2 end-2 h-6 w-6 rounded-full bg-red-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove product"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-3 gap-1.5">
        <h3 className="text-sm font-semibold text-bareter-navy dark:text-foreground line-clamp-2 leading-snug">
          {product.name}
        </h3>
        {product.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        )}
        <div className="mt-auto pt-1.5 flex items-end justify-between gap-2">
          {priceNum != null ? (
            <div>
              <p className="text-[9px] font-normal text-muted-foreground uppercase tracking-wide leading-none mb-0.5">Exchange value</p>
              <p className="text-sm font-bold text-bareter-navy dark:text-foreground">
                AED {priceNum.toLocaleString()}
              </p>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground italic">Value to be discussed</span>
          )}
        </div>
        <div className="pt-1.5 border-t border-bareter-border dark:border-border flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-bareter-teal bg-bareter-teal-muted px-2 py-0.5 rounded-full">
            <ArrowLeftRight className="h-2.5 w-2.5" />
            Barter only — not for sale
          </span>
        </div>
      </div>
    </article>
  );
}

// ── Add Product dialog ─────────────────────────────────────────────────────

function AddProductDialog({
  open,
  onClose,
  businessId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setDescription("");
    setPrice("");
    setImageFiles([]);
    setPreviews([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).slice(0, 5 - imageFiles.length);
    const combined = [...imageFiles, ...arr].slice(0, 5);
    setImageFiles(combined);
    Promise.all(combined.map(f => {
      return new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.readAsDataURL(f);
      });
    })).then(setPreviews);
  }

  function removeImage(idx: number) {
    const next = imageFiles.filter((_, i) => i !== idx);
    setImageFiles(next);
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast({ title: "Product name is required", variant: "destructive" });
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      if (description.trim()) fd.append("description", description.trim());
      if (price.trim()) fd.append("price", price.trim());
      imageFiles.forEach(f => fd.append("images", f));
      const res = await fetch(`${API_BASE}/api/businesses/${businessId}/catalog`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to add product");
      }
      toast({ title: "Product added to your store!" });
      reset();
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: err.message || "Failed to add product", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            Add product to barter catalog
          </DialogTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Products here are available for barter exchange — not for sale.
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Images */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Photos (up to 5)</Label>
            {previews.length > 0 && (
              <div className="grid grid-cols-5 gap-1.5">
                {previews.map((src, i) => (
                  <div key={i} className="relative aspect-square rounded-md overflow-hidden bg-muted">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-0.5 end-0.5 h-4 w-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {previews.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="aspect-square rounded-md border-2 border-dashed border-border flex items-center justify-center hover:border-primary transition-colors"
                  >
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}
            {previews.length === 0 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-24 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 hover:border-primary transition-colors"
              >
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Upload photos</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prod-name" className="text-xs font-medium">Product name *</Label>
            <Input
              id="prod-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Premium Leather Handbag"
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prod-desc" className="text-xs font-medium">Description</Label>
            <Textarea
              id="prod-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the product, materials, dimensions…"
              rows={3}
              maxLength={2000}
              className="text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prod-price" className="text-xs font-medium">Exchange value (AED)</Label>
            <p className="text-[11px] text-muted-foreground -mt-1">Estimated value of what you'd accept in exchange. Not a sale price.</p>
            <Input
              id="prod-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="Leave blank to discuss directly"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 gap-1.5" disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add product
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Business categories ────────────────────────────────────────────────────

const BIZ_CATEGORIES = [
  "Retail", "Food & Beverage", "Fashion & Apparel", "Electronics", "Health & Beauty",
  "Real Estate", "Automotive", "Travel & Hospitality", "Education", "Media & Entertainment",
  "Finance & Legal", "Construction", "Logistics & Shipping", "Technology", "Events",
  "Sports & Fitness", "Home & Garden", "Art & Crafts", "Manufacturing", "Other",
];

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const EDIT_DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
type EditDayKey = typeof DAYS[number];
const defaultHours = () =>
  Object.fromEntries(DAYS.map(d => [d, { open: "09:00", close: "18:00", closed: d === "sun" }])) as Record<EditDayKey, { open: string; close: string; closed: boolean }>;

// ── Inline business edit sheet ─────────────────────────────────────────────

function BusinessEditSheet({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: any;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState(profile.companyName ?? "");
  const [category, setCategory] = useState(profile.category ?? "");
  const [description, setDescription] = useState(profile.description ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [website, setWebsite] = useState(profile.websiteDisplay ?? "");
  const [hours, setHours] = useState<Record<EditDayKey, { open: string; close: string; closed: boolean }>>(
    profile.businessHours ? { ...defaultHours(), ...profile.businessHours } : defaultHours()
  );
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // Sync when profile changes (e.g. after an image upload refreshes data)
  useEffect(() => {
    setCompanyName(profile.companyName ?? "");
    setCategory(profile.category ?? "");
    setDescription(profile.description ?? "");
    setLocation(profile.location ?? "");
    setWebsite(profile.websiteDisplay ?? "");
    setHours(profile.businessHours ? { ...defaultHours(), ...profile.businessHours } : defaultHours());
  }, [profile.id, open]);

  async function handleSave() {
    if (!companyName.trim()) return toast({ title: "Company name is required", variant: "destructive" });
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/businesses/${profile.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          category: category.trim() || undefined,
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          websiteDisplay: website.trim() || undefined,
          businessHours: hours,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Save failed");
      }
      toast({ title: "Business profile saved!" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: err.message || "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File, endpoint: string, setUploading: (v: boolean) => void) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Upload failed");
      }
      onSaved();
      toast({ title: "Image updated!" });
    } catch (err: any) {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Edit business profile
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-6">

            {/* ── Cover + Logo images ───────────────────────────────── */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Storefront images</p>

              {/* Cover */}
              <div className="space-y-1.5">
                <Label className="text-xs">Cover banner</Label>
                <div
                  className="relative w-full h-28 rounded-xl overflow-hidden bg-muted border border-border cursor-pointer group"
                  onClick={() => coverRef.current?.click()}
                >
                  {profile.coverImageUrl ? (
                    <img src={assetUrl(profile.coverImageUrl)} alt="Cover" className="w-full h-full object-cover group-hover:brightness-75 transition-all" />
                  ) : (
                    <div className="w-full h-full bg-bareter-navy/10 flex items-center justify-center">
                      <Camera className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingCover
                      ? <Loader2 className="h-6 w-6 text-white animate-spin" />
                      : <div className="flex items-center gap-1.5 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full"><Camera className="h-3.5 w-3.5" /> Change cover</div>}
                  </div>
                </div>
                <input ref={coverRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, `/api/businesses/${profile.id}/cover`, setUploadingCover); e.target.value = ""; }} />
              </div>

              {/* Logo */}
              <div className="space-y-1.5">
                <Label className="text-xs">Logo</Label>
                <div className="flex items-center gap-4">
                  <div
                    className="relative h-20 w-20 rounded-xl overflow-hidden bg-muted border border-border cursor-pointer group flex-shrink-0"
                    onClick={() => logoRef.current?.click()}
                  >
                    {profile.logoUrl ? (
                      <img src={assetUrl(profile.logoUrl)} alt="Logo" className="w-full h-full object-cover group-hover:brightness-75 transition-all" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploadingLogo
                        ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                        : <Camera className="h-5 w-5 text-white" />}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Tap your logo to replace it. Square images work best.</p>
                </div>
                <input ref={logoRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, `/api/businesses/${profile.id}/logo`, setUploadingLogo); e.target.value = ""; }} />
              </div>
            </div>

            {/* ── Business details ──────────────────────────────────── */}
            <div className="space-y-4 border-t border-border pt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business details</p>

              <div className="space-y-1.5">
                <Label htmlFor="edit-company-name" className="text-xs">Company name *</Label>
                <Input id="edit-company-name" value={companyName} onChange={e => setCompanyName(e.target.value)} maxLength={200} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <div className="flex flex-wrap gap-1.5">
                  {BIZ_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory((c: string) => c === cat ? "" : cat)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        category === cat
                          ? "bg-bareter-teal text-white border-bareter-teal"
                          : "bg-muted text-muted-foreground border-border hover:border-bareter-teal/50"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-description" className="text-xs">Description</Label>
                <Textarea
                  id="edit-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Tell visitors what your business offers…"
                  maxLength={2000}
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-location" className="text-xs">Location</Label>
                  <Input id="edit-location" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Dubai Marina, UAE" maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-website" className="text-xs">Website</Label>
                  <Input id="edit-website" value={website} onChange={e => setWebsite(e.target.value)} placeholder="www.example.com" maxLength={300} />
                  <p className="text-[10px] text-muted-foreground">Shown as plain text, not a link.</p>
                </div>
              </div>
            </div>

            {/* ── Business hours ────────────────────────────────────── */}
            <div className="space-y-3 border-t border-border pt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Business hours <span className="font-normal normal-case">(Dubai time)</span>
              </p>
              <div className="space-y-2">
                {DAYS.map(day => (
                  <div key={day} className="flex items-center gap-2.5">
                    <span className="w-8 text-xs font-medium text-muted-foreground shrink-0">{EDIT_DAY_LABELS[day]}</span>
                    <Checkbox
                      checked={!hours[day]?.closed}
                      onCheckedChange={v => setHours(h => ({ ...h, [day]: { ...h[day], closed: !v } }))}
                    />
                    {!hours[day]?.closed ? (
                      <>
                        <Input
                          type="time"
                          value={hours[day]?.open ?? "09:00"}
                          onChange={e => setHours(h => ({ ...h, [day]: { ...h[day], open: e.target.value } }))}
                          className="h-7 w-28 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">–</span>
                        <Input
                          type="time"
                          value={hours[day]?.close ?? "18:00"}
                          onChange={e => setHours(h => ({ ...h, [day]: { ...h[day], close: e.target.value } }))}
                          className="h-7 w-28 text-xs"
                        />
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Closed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Sticky save footer */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0 bg-background">
          <Button className="w-full gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function BusinessStorefrontPage() {
  const { id } = useParams<{ id: string }>();
  const { user: loggedInUser } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<CatalogTab>("all");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogSort, setCatalogSort] = useState<"newest" | "value_desc">("newest");
  const [minAed, setMinAed] = useState("");
  const [maxAed, setMaxAed] = useState("");
  const [mgmtTab, setMgmtTab] = useState<"active" | "pending" | "inactive">("active");
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ listingId, isActive }: { listingId: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/listings/${listingId}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", id, "storefront"] });
    },
    onError: () => toast({ title: "Failed to update listing", variant: "destructive" }),
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await fetch(`${API_BASE}/api/businesses/${id}/catalog/${productId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove product");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", id, "catalog"] });
      toast({ title: "Product removed" });
    },
    onError: () => toast({ title: "Failed to remove product", variant: "destructive" }),
  });

  const { data, isLoading, isError } = useQuery<BusinessStorefrontData | null>({
    queryKey: ["/api/businesses", id, "storefront"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/businesses/${id}/storefront`, {
        credentials: "include",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load business profile");
      return res.json();
    },
    enabled: !!id,
    staleTime: 60_000,
    retry: false,
  });

  const { data: catalogProducts = [] } = useQuery<CatalogProduct[]>({
    queryKey: ["/api/businesses", id, "catalog"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/businesses/${id}/catalog`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  useSeo({
    title: data?.companyName ? `${data.companyName} — Bareter` : "Business — Bareter",
  });

  if (isLoading) return <BusinessStorefrontSkeleton />;

  if (isError || !data) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Business not found</h1>
        <p className="text-muted-foreground mb-6">
          This business profile doesn't exist or is currently unavailable.
        </p>
        <Link href="/browse" className="text-primary text-sm font-medium hover:underline">
          Browse listings
        </Link>
      </div>
    );
  }

  const profile = data as BusinessStorefrontData;
  const isOwner = !!loggedInUser && loggedInUser.id === profile.owner?.id;
  const isVerified = profile.kybStatus === "verified";
  const initials = profile.companyName?.slice(0, 2).toUpperCase() ?? "BZ";
  const hours = profile.businessHours as BusinessHours | null | undefined;

  // Catalog filtering
  const products   = profile.activeListings.filter(l => l.listingType === "business_product");
  const wholesale  = profile.activeListings.filter(l => l.listingType === "business_wholesale");
  const services   = profile.activeListings.filter(l => l.listingType === "business_service");
  const tabListings: Record<Exclude<CatalogTab, "store">, any[]> = {
    all: profile.activeListings,
    products,
    wholesale,
    services,
  };
  const isBizListing = (l: any) =>
    l.listingType === "business_product" ||
    l.listingType === "business_wholesale" ||
    l.listingType === "business_service";

  // Apply search / value filter / sort
  const applyFilters = (list: any[]) => {
    let result = list;
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase();
      result = result.filter(l =>
        (l.title ?? "").toLowerCase().includes(q) ||
        (l.description ?? "").toLowerCase().includes(q),
      );
    }
    if (minAed !== "") {
      const min = parseFloat(minAed);
      if (!isNaN(min)) result = result.filter(l => parseFloat(l.retailValue ?? "0") >= min);
    }
    if (maxAed !== "") {
      const max = parseFloat(maxAed);
      if (!isNaN(max)) result = result.filter(l => parseFloat(l.retailValue ?? "0") <= max);
    }
    if (catalogSort === "value_desc") {
      result = [...result].sort((a, b) => parseFloat(b.retailValue ?? "0") - parseFloat(a.retailValue ?? "0"));
    }
    return result;
  };
  const visibleListings = activeTab !== "store" ? applyFilters(tabListings[activeTab as Exclude<CatalogTab, "store">]) : [];

  // Mode to pass to create-listing based on active tab
  const modeForTab: Record<CatalogTab, string> = {
    all: "business_product",
    products: "business_product",
    wholesale: "business_wholesale",
    services: "business_service",
    store: "business_product",
  };

  // Owner management listings
  const ownerAll = profile.ownerListings ?? [];
  const mgmtListings = {
    active:   ownerAll.filter(l => l.isActive),
    pending:  ownerAll.filter(l => !l.isActive && l.moderationStatus === "pending"),
    inactive: ownerAll.filter(l => !l.isActive && l.moderationStatus !== "pending"),
  };

  return (
    <div className="bg-bareter-off-white dark:bg-background min-h-screen">
      {/* ── Cover banner ── */}
      <div className="relative w-full h-44 sm:h-56 bg-bareter-navy overflow-hidden">
        {profile.coverImageUrl ? (
          <img
            src={assetUrl(profile.coverImageUrl)}
            alt={`${profile.companyName} cover`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-bareter-navy via-bareter-navy/90 to-bareter-teal/40" />
        )}
        <div className="absolute top-4 start-4">
          <BackButton fallback="/browse" label="Browse" variant="overlay" />
        </div>
        {isOwner && (
          <div className="absolute top-4 end-4">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs bg-black/20 border-white/30 text-white hover:bg-black/30 hover:text-white backdrop-blur-sm"
              onClick={() => setEditOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              Edit business
            </Button>
          </div>
        )}
      </div>

      <div className="container mx-auto max-w-5xl px-4">
        {/* ── Logo overlap ── */}
        <div className="flex items-end gap-4 -mt-10 mb-4">
          <div className="relative flex-shrink-0">
            {profile.logoUrl ? (
              <img
                src={assetUrl(profile.logoUrl)}
                alt={`${profile.companyName} logo`}
                className="h-20 w-20 rounded-xl object-cover ring-4 ring-background shadow-md"
              />
            ) : (
              <div className="h-20 w-20 rounded-xl ring-4 ring-background shadow-md bg-bareter-navy flex items-center justify-center">
                <span className="text-xl font-bold text-white">{initials}</span>
              </div>
            )}
            {isVerified && (
              <span className="absolute -bottom-1 -end-1 h-6 w-6 rounded-full bg-green-500 border-2 border-background flex items-center justify-center shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5 text-white" />
              </span>
            )}
          </div>
        </div>

        {/* ── Business header ── */}
        <div className="space-y-3 pb-5 border-b border-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{profile.companyName}</h1>
                {isVerified && (
                  <Badge variant="outline" className="gap-1 text-xs border-green-300 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                    <ShieldCheck className="h-3 w-3" />
                    Verified business
                  </Badge>
                )}
                {profile.isFeatured && (
                  <Badge className="text-xs bg-bareter-gold text-bareter-navy border-0">Featured</Badge>
                )}
                {!profile.isActive && isOwner && (
                  <Badge variant="outline" className="text-xs border-red-300 text-red-600 bg-red-50">Inactive — not publicly visible</Badge>
                )}
              </div>
              {profile.category && (
                <p className="text-sm text-muted-foreground mt-0.5">{profile.category}</p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {profile.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" />
                {profile.location}
              </span>
            )}
            {profile.websiteDisplay && (
              <span className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 shrink-0" />
                <span>{profile.websiteDisplay}</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Package className="h-4 w-4 shrink-0" />
              {profile.activeListings.length} listing{profile.activeListings.length !== 1 ? "s" : ""}
            </span>
            {catalogProducts.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Store className="h-4 w-4 shrink-0" />
                {catalogProducts.length} product{catalogProducts.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {profile.description && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {profile.description}
            </p>
          )}

          {hours && Object.keys(hours).length > 0 && (
            <HoursPanel hours={hours} />
          )}
        </div>

        {/* ── Catalog header row (tabs + action buttons) ── */}
        <div className="flex items-center justify-between gap-2 pt-4 pb-2">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1">
            {(["all", "products", "wholesale", "services", "store"] as CatalogTab[]).map(tab => {
              const count = tab === "store"
                ? catalogProducts.length
                : tabListings[tab as Exclude<CatalogTab, "store">].length;
              const labels: Record<CatalogTab, string> = {
                all: "All",
                products: "Products",
                wholesale: "Wholesale",
                services: "Services",
                store: "Store",
              };
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "bg-bareter-teal text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  }`}
                  data-testid={`tab-catalog-${tab}`}
                >
                  {tab === "store" && <Store className="h-3.5 w-3.5" />}
                  {labels[tab]}
                  {count > 0 && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0 rounded-full ${
                      activeTab === tab ? "bg-white/20 text-white" : "bg-background text-muted-foreground"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Owner action buttons */}
          {isOwner && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {activeTab === "store" ? (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowAddProduct(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add product
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => navigate(`/create-listing?mode=${modeForTab[activeTab]}&businessId=${profile.id}`)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add listing
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── Catalog search / sort / value filter (hidden on Store tab) ── */}
        {activeTab !== "store" && (
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search listings…"
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="relative">
              <select
                value={catalogSort}
                onChange={e => setCatalogSort(e.target.value as "newest" | "value_desc")}
                className="h-8 rounded-md border border-input bg-background px-3 pr-8 text-sm text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="newest">Newest</option>
                <option value="value_desc">Highest value</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <Input
              placeholder="Min AED"
              type="number"
              min="0"
              value={minAed}
              onChange={e => setMinAed(e.target.value)}
              className="h-8 w-24 text-sm"
            />
            <Input
              placeholder="Max AED"
              type="number"
              min="0"
              value={maxAed}
              onChange={e => setMaxAed(e.target.value)}
              className="h-8 w-24 text-sm"
            />
          </div>
        )}

        {/* ── Listing grid (barter listings tabs) ── */}
        {activeTab !== "store" && (
          <div className="pb-8 pt-1">
            {visibleListings.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No listings in this category yet.</p>
                {isOwner && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4 gap-1.5 text-xs"
                    onClick={() => navigate(`/create-listing?mode=${modeForTab[activeTab]}&businessId=${profile.id}`)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add listing
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleListings.map((listing: any) =>
                  isBizListing(listing)
                    ? <BusinessProductCard key={listing.id} listing={listing} />
                    : <BrandListingCard key={listing.id} listing={listing} />
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Store tab: ecommerce product catalog ── */}
        {activeTab === "store" && (
          <div className="pb-8 pt-2">
            {catalogProducts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Store className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No products in the store yet.</p>
                {isOwner && (
                  <>
                    <p className="text-xs mt-1">Add products your customers can browse.</p>
                    <Button
                      size="sm"
                      className="mt-4 gap-1.5 text-xs"
                      onClick={() => setShowAddProduct(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add your first product
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalogProducts.map(product => (
                  <StoreProductCard
                    key={product.id}
                    product={product}
                    isOwner={isOwner}
                    onDelete={productId => deleteProductMutation.mutate(productId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Owner: Manage catalog ── */}
        {isOwner && ownerAll.length > 0 && (
          <div className="pb-12 border-t border-border pt-6">
            <h2 className="text-base font-semibold mb-3">Manage catalog</h2>
            <div className="flex items-center gap-1 mb-4">
              {(["active", "pending", "inactive"] as const).map(t => {
                const count = mgmtListings[t].length;
                const label = { active: "Active", pending: "Pending review", inactive: "Inactive" }[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMgmtTab(t)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      mgmtTab === t
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className={`text-[10px] font-bold px-1 rounded-full ${
                        mgmtTab === t ? "bg-background/20" : "bg-background text-muted-foreground"
                      }`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {mgmtListings[mgmtTab].length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No listings here.</p>
            ) : (
              <div className="space-y-2">
                {mgmtListings[mgmtTab].map((l: any) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{l.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.listingType?.replace(/_/g, " ")} · AED {parseFloat(l.retailValue ?? "0").toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => navigate(`/listings/${l.id}`)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => navigate(`/create-listing?draft=${l.id}`)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      {mgmtTab !== "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1"
                          disabled={toggleActiveMutation.isPending}
                          onClick={() => toggleActiveMutation.mutate({ listingId: l.id, isActive: !l.isActive })}
                        >
                          {l.isActive
                            ? <><ToggleRight className="h-3.5 w-3.5 text-green-600" /> Deactivate</>
                            : <><ToggleLeft className="h-3.5 w-3.5" /> Activate</>
                          }
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add Product dialog ── */}
      <AddProductDialog
        open={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        businessId={profile.id}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/businesses", id, "catalog"] })}
      />

      {/* ── Inline business edit sheet ── */}
      <BusinessEditSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        profile={profile}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/businesses", id, "storefront"] })}
      />
    </div>
  );
}
