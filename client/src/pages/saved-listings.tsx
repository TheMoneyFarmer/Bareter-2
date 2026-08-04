import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, assetUrl } from "@/lib/queryClient";
import {
  Heart, MapPin, ArrowLeftRight, Bookmark, FolderPlus, Folder,
  FolderOpen, MoreVertical, Trash2, MoveRight, ChevronLeft, Plus,
} from "lucide-react";

type LikedListing = {
  id: string; title: string; images: string[] | null; retailValue: string | null;
  location: string | null; categories: string[] | null; type: string;
  folderId: string | null; likedAt: string;
};

type SavedFolder = {
  id: string; name: string; emoji: string; listingCount: number; createdAt: string;
};

type FoldersData = { folders: SavedFolder[]; unsortedCount: number };

const FOLDER_EMOJIS = ["📁","❤️","⭐","🎯","🎁","🛍️","🏠","📱","👗","🚗","💼","🎨","🏋️","📚","🌿"];

function ListingGrid({
  items, onRemove, onMoveToFolder, folders, emptyTitle, emptyText, emptyAction,
}: {
  items: LikedListing[];
  onRemove: (id: string) => void;
  onMoveToFolder?: (listingId: string, folderId: string | null) => void;
  folders?: SavedFolder[];
  emptyTitle: string; emptyText: string; emptyAction?: React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-bareter-border p-12 text-center">
        <Heart className="h-12 w-12 mx-auto mb-4 text-bareter-muted" />
        <h2 className="text-lg font-semibold text-bareter-navy dark:text-foreground mb-1">{emptyTitle}</h2>
        <p className="text-sm text-muted-foreground mb-4">{emptyText}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((listing) => (
        <div
          key={listing.id}
          className="group relative bg-white dark:bg-card border border-bareter-border rounded-xl overflow-hidden hover:shadow-bareter-hover transition-shadow"
        >
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            {onMoveToFolder && folders && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="h-8 w-8 rounded-full bg-white/90 dark:bg-card/90 flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors" aria-label="Move to folder">
                    <MoveRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => onMoveToFolder(listing.id, null)} className="gap-2 text-xs">
                    <Folder className="h-3.5 w-3.5" /> Unsorted
                  </DropdownMenuItem>
                  {folders.map(f => (
                    <DropdownMenuItem key={f.id} onClick={() => onMoveToFolder(listing.id, f.id)} className="gap-2 text-xs">
                      <span>{f.emoji}</span> {f.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <button
              type="button"
              onClick={() => onRemove(listing.id)}
              className="h-8 w-8 rounded-full bg-white/90 dark:bg-card/90 flex items-center justify-center shadow-sm hover:bg-red-50 transition-colors"
              aria-label="Remove"
            >
              <Heart className="h-4 w-4 text-red-500 fill-red-500" />
            </button>
          </div>

          <Link href={`/listings/${listing.id}`}>
            {listing.images?.[0] ? (
              <img src={assetUrl(listing.images[0])} alt={listing.title} className="w-full h-44 object-cover group-hover:scale-[1.02] transition-transform" />
            ) : (
              <div className="w-full h-44 bg-bareter-off-white flex items-center justify-center">
                <ArrowLeftRight className="h-8 w-8 text-bareter-muted" />
              </div>
            )}
            <div className="p-3">
              <p className="font-semibold text-bareter-navy dark:text-foreground text-sm line-clamp-2 mb-1">{listing.title}</p>
              {listing.retailValue && (
                <p className="text-bareter-teal font-bold text-sm">AED {Number(listing.retailValue).toLocaleString()}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1.5">
                {listing.location && (
                  <span className="flex items-center gap-0.5 text-[11px] text-bareter-muted">
                    <MapPin className="h-3 w-3" />{listing.location}
                  </span>
                )}
                <Badge variant="outline" className="text-[10px] px-1.5 h-4 ms-auto">
                  {listing.categories?.[0] ?? listing.type}
                </Badge>
              </div>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}

export function SavedListingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openFolder, setOpenFolder] = useState<SavedFolder | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderEmoji, setNewFolderEmoji] = useState("📁");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: likedListings = [], isLoading: likedLoading } = useQuery<LikedListing[]>({
    queryKey: ["/api/me/liked-listings"],
    enabled: !!user,
    staleTime: 0,
  });

  const { data: foldersData, isLoading: foldersLoading } = useQuery<FoldersData>({
    queryKey: ["/api/saved-folders"],
    enabled: !!user,
    staleTime: 0,
  });

  const { data: folderListings = [], isLoading: folderListingsLoading } = useQuery<LikedListing[]>({
    queryKey: ["/api/saved-folders", openFolder?.id ?? "unsorted", "listings"],
    queryFn: () => apiRequest("GET", `/api/saved-folders/${openFolder?.id ?? "unsorted"}/listings`).then(r => r.json()),
    enabled: !!user && openFolder !== undefined,
    staleTime: 0,
  });

  const createFolderMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/saved-folders", { name: newFolderName.trim(), emoji: newFolderEmoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-folders"] });
      setNewFolderName(""); setNewFolderEmoji("📁"); setCreateOpen(false);
      toast({ title: "Folder created!" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/saved-folders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/liked-listings"] });
      setOpenFolder(null);
      toast({ title: "Folder deleted" });
    },
  });

  const moveToFolderMutation = useMutation({
    mutationFn: ({ listingId, folderId }: { listingId: string; folderId: string | null }) =>
      apiRequest("PATCH", `/api/likes/${listingId}/folder`, { folderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/liked-listings"] });
      toast({ title: "Moved to folder" });
    },
  });

  const unlikeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/listings/${id}/like`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/liked-listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-folders"] });
      toast({ title: "Removed from liked" });
    },
  });

  if (!user) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-4xl text-center">
        <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Favorites</h1>
        <p className="text-muted-foreground mb-4">Please log in to view your saved listings.</p>
        <Link href="/login"><Button>Log In</Button></Link>
      </div>
    );
  }

  // Folder detail view
  if (openFolder !== null) {
    const isUnsorted = (openFolder as any)._unsorted;
    return (
      <div className="container px-4 py-8 mx-auto max-w-7xl bareter-slide-in">
        <div className="flex items-center gap-3 mb-6">
          <button type="button" onClick={() => setOpenFolder(null)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium">All folders</span>
          </button>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {isUnsorted ? <Folder className="h-5 w-5" /> : <span>{openFolder.emoji}</span>}
            {isUnsorted ? "Unsorted" : openFolder.name}
          </h1>
          {!isUnsorted && (
            <button
              type="button"
              onClick={() => { if (confirm("Delete this folder? Listings will move to Unsorted.")) deleteFolderMutation.mutate(openFolder.id); }}
              className="ms-auto p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {folderListingsLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : (
          <ListingGrid
            items={folderListings}
            onRemove={(id) => unlikeMutation.mutate(id)}
            onMoveToFolder={(listingId, folderId) => moveToFolderMutation.mutate({ listingId, folderId })}
            folders={foldersData?.folders}
            emptyTitle="Empty folder"
            emptyText="Move liked listings here using the arrow icon."
            emptyAction={<Link href="/browse"><Button variant="bareter" size="sm">Browse Listings</Button></Link>}
          />
        )}
      </div>
    );
  }

  const isLoading = likedLoading || foldersLoading;
  const folders = foldersData?.folders ?? [];
  const unsortedCount = foldersData?.unsortedCount ?? likedListings.length;

  return (
    <div className="container px-4 py-8 mx-auto max-w-7xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
            <Heart className="h-5 w-5 text-red-500 fill-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Favorites</h1>
            <p className="text-muted-foreground text-sm">
              {isLoading ? "Loading..." : `${likedListings.length} liked listings`}
            </p>
          </div>
        </div>

        {/* Create folder dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <FolderPlus className="h-4 w-4" />
              New Folder
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Create a folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="text-xl flex-shrink-0">{newFolderEmoji}</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="p-2">
                    <div className="grid grid-cols-5 gap-1">
                      {FOLDER_EMOJIS.map(e => (
                        <button key={e} type="button" onClick={() => setNewFolderEmoji(e)}
                          className={`text-xl p-1 rounded hover:bg-muted transition-colors ${newFolderEmoji === e ? "bg-primary/10" : ""}`}>{e}</button>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Input
                  placeholder="Folder name (e.g. Want Soon)"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && newFolderName.trim() && createFolderMutation.mutate()}
                  maxLength={50}
                  className="flex-1"
                />
              </div>
              <Button
                className="w-full" variant="bareter"
                disabled={!newFolderName.trim() || createFolderMutation.isPending}
                onClick={() => createFolderMutation.mutate()}
              >
                {createFolderMutation.isPending ? "Creating…" : "Create folder"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : (
        <Tabs defaultValue="folders">
          <TabsList className="mb-6">
            <TabsTrigger value="folders" className="gap-2">
              <Folder className="h-4 w-4" />
              Folders
              {folders.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{folders.length + 1}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              <Heart className="h-4 w-4" />
              All Liked
              {likedListings.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{likedListings.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="folders">
            {folders.length === 0 && unsortedCount === 0 ? (
              <div className="rounded-xl border border-dashed border-bareter-border p-12 text-center">
                <Folder className="h-12 w-12 mx-auto mb-4 text-bareter-muted" />
                <h2 className="text-lg font-semibold mb-1">No folders yet</h2>
                <p className="text-sm text-muted-foreground mb-4">Create folders to organise your saved listings by goal — want soon, gifting, longshot, etc.</p>
                <Button variant="bareter" size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> Create your first folder
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {/* Unsorted virtual folder */}
                <button
                  type="button"
                  onClick={() => setOpenFolder({ id: "unsorted", name: "Unsorted", emoji: "📁", listingCount: unsortedCount, createdAt: "" } as any)}
                  className="flex flex-col items-start gap-2 rounded-xl border border-bareter-border bg-card p-4 hover:shadow-bareter-hover transition-shadow text-left"
                >
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-2xl">
                    <Folder className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Unsorted</p>
                    <p className="text-xs text-muted-foreground">{unsortedCount} listings</p>
                  </div>
                </button>

                {folders.map(folder => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setOpenFolder(folder)}
                    className="flex flex-col items-start gap-2 rounded-xl border border-bareter-border bg-card p-4 hover:shadow-bareter-hover transition-shadow text-left"
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/5 flex items-center justify-center text-2xl">
                      {folder.emoji}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{folder.name}</p>
                      <p className="text-xs text-muted-foreground">{folder.listingCount} listings</p>
                    </div>
                  </button>
                ))}

                {/* Add folder button */}
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-bareter-border p-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <FolderPlus className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-muted-foreground">New folder</p>
                  </div>
                </button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            <ListingGrid
              items={likedListings}
              onRemove={(id) => unlikeMutation.mutate(id)}
              onMoveToFolder={(listingId, folderId) => moveToFolderMutation.mutate({ listingId, folderId })}
              folders={folders}
              emptyTitle="No liked listings yet"
              emptyText="Tap the heart icon on any listing to like it. Liked listings appear here."
              emptyAction={<Link href="/browse"><Button variant="bareter" size="sm">Browse Listings</Button></Link>}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
