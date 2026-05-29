import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, AlertTriangle, MapPin, Tag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function PostDetailPage() {
  const [, params] = useRoute("/posts/:id");
  const id = params?.id;

  const { data: post, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/posts/${id}`],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Post not found</h1>
        <p className="text-muted-foreground mb-4">This post may have been removed or is no longer available.</p>
        <Link href="/feed"><Button variant="outline">Back to Feed</Button></Link>
      </div>
    );
  }

  const isFlagged = post.moderationStatus === "flagged" || post.moderationStatus === "rejected";

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Link href="/feed">
        <Button variant="ghost" size="sm" className="gap-2 mb-6 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Feed
        </Button>
      </Link>

      {isFlagged && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-900 mb-6">
          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-orange-800 dark:text-orange-300 text-sm">
              {post.moderationStatus === "rejected" ? "Post Rejected" : "Post Under Review"}
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">
              This post has been flagged by our moderation system and is not publicly visible. If you believe this is a mistake, please contact support.
            </p>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {post.mediaUrls?.[0] && (
          <img
            src={post.mediaUrls[0]}
            alt="Post media"
            className="w-full max-h-96 object-cover"
          />
        )}

        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="h-9 w-9">
              <AvatarImage src={post.user?.avatarUrl} />
              <AvatarFallback>{post.user?.fullName?.[0] ?? "?"}</AvatarFallback>
            </Avatar>
            <div>
              <Link href={`/users/${post.userId}`}>
                <p className="text-sm font-semibold hover:underline">{post.user?.fullName ?? "Unknown"}</p>
              </Link>
              <p className="text-xs text-muted-foreground">
                {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : ""}
              </p>
            </div>
            {post.feedCategory && (
              <Badge variant="secondary" className="ml-auto text-xs">{post.feedCategory}</Badge>
            )}
          </div>

          {post.title && <h1 className="font-bold text-lg mb-2">{post.title}</h1>}
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{post.caption}</p>

          {(post.location || post.city) && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-3">
              <MapPin className="h-3 w-3" />
              {post.city ?? post.location}
            </p>
          )}

          {post.hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {post.hashtags.map((tag: string) => (
                <span key={tag} className="flex items-center gap-0.5 text-xs text-bareter-teal">
                  <Tag className="h-3 w-3" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
