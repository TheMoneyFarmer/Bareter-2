import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, User, ArrowLeft, BookOpen } from "lucide-react";
import { useSeo } from "@/hooks/use-seo";
import NotFound from "@/pages/not-found";

export interface BlogPostDetail {
  slug: string;
  title: string;
  excerpt?: string;
  coverImageUrl?: string;
  author?: string;
  category?: string;
  publishedAt?: string;
  body?: string;
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

function BlogPostSeo({ post }: { post: BlogPostDetail }) {
  const canonical = `https://bareter.com/blog/${post.slug}`;
  const description = post.excerpt ?? `Read ${post.title} on the Bareter Blog.`;
  const sectionLabel =
    post.category && CATEGORY_LABELS[post.category]
      ? CATEGORY_LABELS[post.category]
      : post.category;

  useSeo({
    title: `${post.title} — Bareter Blog`,
    description,
    canonical,
    image: post.coverImageUrl,
    type: "article",
    article: {
      publishedTime: post.publishedAt,
      author: post.author,
      section: sectionLabel,
    },
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description,
      url: canonical,
      mainEntityOfPage: canonical,
      datePublished: post.publishedAt,
      dateModified: post.publishedAt,
      image: post.coverImageUrl,
      articleSection: sectionLabel,
      inLanguage: "en",
      author: post.author
        ? { "@type": "Organization", name: post.author }
        : undefined,
      publisher: {
        "@type": "Organization",
        name: "Bareter",
        url: "https://bareter.com",
      },
    },
  });
  return null;
}

function BlogPostLoading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12 space-y-6">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-3/4" />
      <div className="flex gap-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className={`h-4 w-${i % 3 === 2 ? "3/4" : "full"}`} />
      ))}
    </div>
  );
}

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: post, isLoading, isError } = useQuery<BlogPostDetail | null>({
    queryKey: ["/api/blog", slug],
    staleTime: 60_000,
  });

  if (isLoading) return <BlogPostLoading />;

  if (isError || post === null) return <NotFound />;

  if (!post) return <BlogPostLoading />;

  const paragraphs = post.body
    ? post.body
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <article className="container mx-auto max-w-3xl px-4 py-12" data-testid="article-blog-post">
      {post && <BlogPostSeo post={post} />}

      <Link href="/blog">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 -ms-2 text-muted-foreground hover:text-foreground"
          data-testid="button-back-blog"
        >
          <ArrowLeft className="h-4 w-4 me-1.5" />
          Back to Blog
        </Button>
      </Link>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        {post.category && (
          <Badge variant="secondary" data-testid="badge-post-category">
            {CATEGORY_LABELS[post.category] ?? post.category}
          </Badge>
        )}
        {post.publishedAt && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(post.publishedAt)}
          </span>
        )}
        {post.author && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {post.author}
          </span>
        )}
      </div>

      <h1
        className="text-3xl sm:text-4xl font-bold leading-tight mb-6"
        data-testid="heading-post-title"
      >
        {post.title}
      </h1>

      {post.excerpt && (
        <p className="text-lg text-muted-foreground leading-relaxed mb-8 border-s-4 border-bareter-teal ps-4 italic">
          {post.excerpt}
        </p>
      )}

      {post.coverImageUrl && (
        <div className="mb-8 rounded-2xl overflow-hidden aspect-[16/9]">
          <img
            src={post.coverImageUrl}
            alt={post.title}
            className="w-full h-full object-cover"
            data-testid="img-cover"
          />
        </div>
      )}

      {!post.coverImageUrl && !post.body && (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Content coming soon.</p>
        </div>
      )}

      {paragraphs.length > 0 && (
        <div
          className="prose prose-slate dark:prose-invert max-w-none space-y-4"
          data-testid="div-post-body"
        >
          {paragraphs.map((para, i) => (
            <p key={i} className="leading-relaxed text-foreground/90">
              {para}
            </p>
          ))}
        </div>
      )}

      <div className="mt-12 pt-8 border-t border-bareter-teal/15 dark:border-white/10 text-center">
        <p className="text-muted-foreground mb-4">Want to barter smarter?</p>
        <Link href="/register">
          <Button data-testid="button-cta-register">Join Bareter free</Button>
        </Link>
      </div>
    </article>
  );
}
