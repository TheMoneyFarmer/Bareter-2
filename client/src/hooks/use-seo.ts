import { useEffect } from "react";

interface SeoOptions {
  title: string;
  description?: string;
  canonical?: string;
}

export function useSeo({ title, description, canonical }: SeoOptions) {
  useEffect(() => {
    const prevTitle = document.title;

    const metaDescEl = document.querySelector(
      'meta[name="description"]'
    ) as HTMLMetaElement | null;
    const prevDesc = metaDescEl?.getAttribute("content") ?? null;
    const metaDescInjected = !metaDescEl;

    const canonicalEl = document.querySelector(
      'link[rel="canonical"]'
    ) as HTMLLinkElement | null;
    const prevCanonical = canonicalEl?.getAttribute("href") ?? null;
    const canonicalInjected = !canonicalEl;

    document.title = title;

    let metaDesc = metaDescEl;
    if (description !== undefined) {
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.name = "description";
        document.head.appendChild(metaDesc);
      }
      metaDesc.content = description;
    }

    let canonicalLink = canonicalEl;
    const resolvedCanonical =
      canonical ?? `${window.location.origin}${window.location.pathname}`;
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = resolvedCanonical;

    return () => {
      document.title = prevTitle;

      if (description !== undefined) {
        if (metaDescInjected && metaDesc) {
          metaDesc.remove();
        } else if (metaDesc) {
          if (prevDesc !== null) {
            metaDesc.content = prevDesc;
          } else {
            metaDesc.removeAttribute("content");
          }
        }
      }

      if (canonicalInjected && canonicalLink) {
        canonicalLink.remove();
      } else if (canonicalLink) {
        if (prevCanonical !== null) {
          canonicalLink.href = prevCanonical;
        } else {
          canonicalLink.removeAttribute("href");
        }
      }
    };
  }, [title, description, canonical]);
}
