import { useEffect } from "react";

interface SeoOptions {
  title: string;
  description?: string;
  canonical?: string;
  /** Absolute URL of a cover/social image. Used for og:image and twitter:image. */
  image?: string;
  /** og:type. Defaults to "website". Use "article" for blog posts. */
  type?: "website" | "article" | "profile";
  /** Article-only metadata. Ignored when type !== "article". */
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    author?: string;
    section?: string;
    tags?: string[];
  };
  /** Site name for og:site_name. Defaults to "Bareter". */
  siteName?: string;
  /** Optional JSON-LD structured-data object to inject. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Per-page SEO: sets <title>, meta description, canonical, Open Graph,
 * Twitter Card, and (optionally) JSON-LD structured data. Restores
 * previous values on unmount so cross-page navigation does not bleed.
 *
 * Open Graph and Twitter tags are written into <meta> nodes flagged
 * with data-seo-managed so we can clean up our own additions without
 * touching tags that came from the static HTML.
 */
export function useSeo({
  title,
  description,
  canonical,
  image,
  type = "website",
  article,
  siteName = "Bareter",
  jsonLd,
}: SeoOptions) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    // --- description -------------------------------------------------------
    const descSnapshot = upsertMetaByName("description", description);

    // --- canonical ---------------------------------------------------------
    const canonicalSnapshot = upsertCanonical(canonical);

    // --- Open Graph + Twitter ---------------------------------------------
    const fullUrl =
      canonical && /^https?:\/\//.test(canonical)
        ? canonical
        : `${window.location.origin}${
            canonical ?? window.location.pathname
          }`;

    const ogManaged: HTMLMetaElement[] = [];
    const ogManagedName: HTMLMetaElement[] = [];

    ogManaged.push(upsertMetaByProperty("og:title", title));
    ogManaged.push(upsertMetaByProperty("og:type", type));
    ogManaged.push(upsertMetaByProperty("og:url", fullUrl));
    ogManaged.push(upsertMetaByProperty("og:site_name", siteName));
    if (description) {
      ogManaged.push(upsertMetaByProperty("og:description", description));
    }
    if (image) {
      ogManaged.push(upsertMetaByProperty("og:image", image));
      ogManaged.push(
        upsertMetaByProperty("og:image:alt", title.slice(0, 160)),
      );
    }
    if (type === "article" && article) {
      if (article.publishedTime) {
        ogManaged.push(
          upsertMetaByProperty(
            "article:published_time",
            article.publishedTime,
          ),
        );
      }
      if (article.modifiedTime) {
        ogManaged.push(
          upsertMetaByProperty("article:modified_time", article.modifiedTime),
        );
      }
      if (article.author) {
        ogManaged.push(upsertMetaByProperty("article:author", article.author));
      }
      if (article.section) {
        ogManaged.push(
          upsertMetaByProperty("article:section", article.section),
        );
      }
      if (article.tags) {
        for (const tag of article.tags) {
          ogManaged.push(upsertMetaByProperty("article:tag", tag));
        }
      }
    }

    ogManagedName.push(
      upsertMetaByName(
        "twitter:card",
        image ? "summary_large_image" : "summary",
      ).el!,
    );
    ogManagedName.push(upsertMetaByName("twitter:title", title).el!);
    if (description) {
      ogManagedName.push(upsertMetaByName("twitter:description", description).el!);
    }
    if (image) {
      ogManagedName.push(upsertMetaByName("twitter:image", image).el!);
    }

    // --- JSON-LD -----------------------------------------------------------
    const jsonLdEl = jsonLd ? injectJsonLd(jsonLd) : null;

    return () => {
      document.title = prevTitle;
      restoreMeta(descSnapshot);
      restoreCanonical(canonicalSnapshot);
      for (const el of ogManaged) el.remove();
      for (const el of ogManagedName) el.remove();
      if (jsonLdEl) jsonLdEl.remove();
    };
  }, [
    title,
    description,
    canonical,
    image,
    type,
    siteName,
    // article + jsonLd intentionally stringified so React's dep check works
    // for callers that build these objects inline.
    JSON.stringify(article ?? null),
    JSON.stringify(jsonLd ?? null),
  ]);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface MetaSnapshot {
  el: HTMLMetaElement | null;
  injected: boolean;
  prevContent: string | null;
  hadContent: boolean;
}

function upsertMetaByName(name: string, content?: string): MetaSnapshot {
  if (content === undefined) return { el: null, injected: false, prevContent: null, hadContent: false };
  let el = document.querySelector(
    `meta[name="${name}"]`,
  ) as HTMLMetaElement | null;
  const prevContent = el?.getAttribute("content") ?? null;
  const hadContent = el !== null;
  const injected = !el;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    el.setAttribute("data-seo-managed", "true");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return { el, injected, prevContent, hadContent };
}

function upsertMetaByProperty(property: string, content: string): HTMLMetaElement {
  // og:* and article:* can repeat (article:tag), so we append fresh elements
  // tagged as managed instead of trying to dedupe. Cleanup removes them all.
  const el = document.createElement("meta");
  el.setAttribute("property", property);
  el.setAttribute("content", content);
  el.setAttribute("data-seo-managed", "true");
  document.head.appendChild(el);
  return el;
}

function restoreMeta(snap: MetaSnapshot) {
  if (!snap.el) return;
  if (snap.injected) {
    snap.el.remove();
    return;
  }
  if (snap.hadContent && snap.prevContent !== null) {
    snap.el.setAttribute("content", snap.prevContent);
  } else {
    snap.el.removeAttribute("content");
  }
}

interface CanonicalSnapshot {
  el: HTMLLinkElement;
  injected: boolean;
  prevHref: string | null;
}

function upsertCanonical(canonical?: string): CanonicalSnapshot {
  let el = document.querySelector(
    'link[rel="canonical"]',
  ) as HTMLLinkElement | null;
  const prevHref = el?.getAttribute("href") ?? null;
  const injected = !el;
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href =
    canonical ?? `${window.location.origin}${window.location.pathname}`;
  return { el, injected, prevHref };
}

function restoreCanonical(snap: CanonicalSnapshot) {
  if (snap.injected) {
    snap.el.remove();
    return;
  }
  if (snap.prevHref !== null) {
    snap.el.href = snap.prevHref;
  } else {
    snap.el.removeAttribute("href");
  }
}

function injectJsonLd(
  data: Record<string, unknown> | Record<string, unknown>[],
): HTMLScriptElement {
  const el = document.createElement("script");
  el.type = "application/ld+json";
  el.setAttribute("data-seo-managed", "true");
  el.textContent = JSON.stringify(data);
  document.head.appendChild(el);
  return el;
}
