import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, User, ArrowRight, BookOpen } from "lucide-react";
import { useSeo } from "@/hooks/use-seo";

export interface BlogPostSummary {
  slug: string;
  title: string;
  excerpt?: string;
  coverImageUrl?: string;
  author?: string;
  category?: string;
  publishedAt?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  "bartering-tips": "Bartering Tips",
  "business-insights": "Business Insights",
  "uae-market": "UAE Market",
  "success-stories": "Success Stories",
  "platform-updates": "Platform Updates",
};

function formatDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function PostCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      data-testid={`card-blog-${post.slug}`}
      className="group flex flex-col rounded-2xl border border-bareter-teal/15 dark:border-white/10 bg-white dark:bg-bareter-navy-deep overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      {post.coverImageUrl ? (
        <div className="aspect-[16/9] overflow-hidden">
          <img
            src={post.coverImageUrl}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="aspect-[16/9] bg-bareter-teal/10 dark:bg-bareter-teal/5 flex items-center justify-center">
          <BookOpen className="h-12 w-12 text-bareter-teal/30" />
        </div>
      )}

      <div className="flex flex-col flex-1 p-5 gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {post.category && (
            <Badge variant="secondary" className="text-xs" data-testid={`badge-category-${post.slug}`}>
              {CATEGORY_LABELS[post.category] ?? post.category}
            </Badge>
          )}
          {post.publishedAt && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDate(post.publishedAt)}
            </span>
          )}
        </div>

        <h2 className="font-semibold text-lg leading-snug group-hover:text-bareter-teal dark:group-hover:text-bareter-teal-light transition-colors line-clamp-2">
          {post.title}
        </h2>

        {post.excerpt && (
          <p className="text-sm text-muted-foreground line-clamp-3 flex-1">{post.excerpt}</p>
        )}

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-bareter-teal/10 dark:border-white/5">
          {post.author && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              {post.author}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs font-medium text-bareter-teal dark:text-bareter-teal-light ms-auto">
            Read more <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function PostCardSkeleton() {
  return (
    <div className="rounded-2xl border border-bareter-teal/15 dark:border-white/10 overflow-hidden">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="p-5 space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  );
}

export function BlogPage() {
  const { data: posts, isLoading, isError } = useQuery<BlogPostSummary[]>({
    queryKey: ["/api/blog"],
    staleTime: 60_000,
  });

  const ogImage = posts?.find((p) => p.coverImageUrl)?.coverImageUrl;

  useSeo({
    title: "Bareter Blog — UAE B2B Barter Insights",
    description:
      "Practical guides on bartering business services in the UAE: how-to playbooks, VATP042 compliance, and platform comparisons for SMEs, hotels, agencies, and luxury dealers.",
    canonical: "https://bareter.com/blog",
    image: ogImage,
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Bareter Blog",
      url: "https://bareter.com/blog",
      inLanguage: "en",
      publisher: {
        "@type": "Organization",
        name: "Bareter",
        url: "https://bareter.com",
      },
      blogPost: (posts ?? []).map((p) => ({
        "@type": "BlogPosting",
        headline: p.title,
        url: `https://bareter.com/blog/${p.slug}`,
        datePublished: p.publishedAt,
        author: p.author
          ? { "@type": "Organization", name: p.author }
          : undefined,
        image: p.coverImageUrl,
      })),
    },
  });

  return (
    <div className="container mx-auto max-w-6xl px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4" data-testid="heading-blog">
          Bareter Blog
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Insights, tips, and stories from the UAE's barter community.
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <div className="text-center py-20 text-muted-foreground" data-testid="text-blog-error">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Unable to load articles right now. Please try again shortly.</p>
        </div>
      )}

      {!isLoading && !isError && posts?.length === 0 && (
        <div className="text-center py-20 text-muted-foreground" data-testid="text-blog-empty">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-2">No articles yet</p>
          <p className="text-sm">
            Check back soon — we're working on some great content for you.
          </p>
        </div>
      )}

      {!isLoading && !isError && posts && posts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
