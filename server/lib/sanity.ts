import { createClient } from "@sanity/client";

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET;
const token = process.env.SANITY_API_TOKEN;

const isConfigured = !!(projectId && dataset);

const sanityClient = isConfigured
  ? createClient({
      projectId,
      dataset,
      token: token || undefined,
      useCdn: true,
      apiVersion: "2024-01-01",
    })
  : null;

interface CacheEntry<T> {
  value: T;
  at: number;
}

const CACHE_TTL = 60_000;
const cache = new Map<string, CacheEntry<unknown>>();

async function fetchFromSanity<T>(query: string, cacheKey: string): Promise<T | null> {
  if (!sanityClient) return null;

  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < CACHE_TTL) {
    return hit.value as T;
  }

  try {
    const result = await sanityClient.fetch<T>(query);
    cache.set(cacheKey, { value: result, at: now });
    return result;
  } catch (err) {
    console.error(`[sanity] fetch failed for "${cacheKey}":`, err);
    return null;
  }
}

export interface SanityHeroSection {
  headline?: string;
  tagline?: string;
  ctaText?: string;
  ctaUrl?: string;
}

export interface SanityHowItWorksStep {
  n: number;
  title: string;
  desc: string;
  iconName?: string;
  emoji?: string;
}

export interface SanityFaqEntry {
  category: string;
  questions: { q: string; a: string }[];
}

export interface SanityHelpArticle {
  slug: string;
  title: string;
  body: string;
}

export async function getSanityHero(): Promise<SanityHeroSection | null> {
  return fetchFromSanity<SanityHeroSection>(
    `*[_type == "heroSection"][0]{ headline, tagline, ctaText, ctaUrl }`,
    "heroSection",
  );
}

export async function getSanityHowItWorksSteps(): Promise<SanityHowItWorksStep[] | null> {
  return fetchFromSanity<SanityHowItWorksStep[]>(
    `*[_type == "howItWorksStep"] | order(order asc) { "n": order, title, "desc": body, iconName, "emoji": iconName }`,
    "howItWorksSteps",
  );
}

export async function getSanityFaqEntries(): Promise<SanityFaqEntry[] | null> {
  return fetchFromSanity<SanityFaqEntry[]>(
    `*[_type == "faqEntry"] | order(order asc) {
      category,
      "questions": questions[]{ q, a }
    }`,
    "faqEntries",
  );
}

export async function getSanityHelpArticles(): Promise<SanityHelpArticle[] | null> {
  return fetchFromSanity<SanityHelpArticle[]>(
    `*[_type == "helpArticle"] | order(_createdAt asc) {
      "slug": slug.current,
      title,
      "body": pt::text(body)
    }`,
    "helpArticles",
  );
}

export interface SanityBlogPost {
  slug: string;
  title: string;
  excerpt?: string;
  coverImageUrl?: string;
  author?: string;
  category?: string;
  publishedAt?: string;
  body?: string;
}

const BLOG_FIELDS = `
  "slug": slug.current,
  title,
  excerpt,
  "coverImageUrl": coverImage.asset->url,
  author,
  category,
  publishedAt
`;

export async function getSanityBlogPosts(): Promise<SanityBlogPost[] | null> {
  return fetchFromSanity<SanityBlogPost[]>(
    `*[_type == "blogPost" && defined(publishedAt) && publishedAt <= now()] | order(publishedAt desc) {
      ${BLOG_FIELDS}
    }`,
    "blogPosts",
  );
}

export async function getSanityBlogPost(slug: string): Promise<SanityBlogPost | null> {
  const results = await fetchFromSanity<SanityBlogPost[]>(
    `*[_type == "blogPost" && slug.current == "${slug.replace(/"/g, "")}"] {
      ${BLOG_FIELDS},
      "body": pt::text(body)
    }`,
    `blogPost:${slug}`,
  );
  if (!results || results.length === 0) return null;
  return results[0];
}

export function isSanityConfigured(): boolean {
  return isConfigured;
}

export function clearSanityCache(keys?: string[]): void {
  if (keys && keys.length > 0) {
    for (const k of keys) cache.delete(k);
  } else {
    cache.clear();
  }
}
