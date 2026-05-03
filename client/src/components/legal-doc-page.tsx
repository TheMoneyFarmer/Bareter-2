import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import {
  LEGAL_DOCS,
  LEGAL_DOC_INDEX,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ENTITY_LINE,
  type LegalBlock,
  type LegalDoc,
} from "@/content/legal";
import { LEGAL_DOCS_AR, LEGAL_DOC_INDEX_AR } from "@/content/legal.ar";
import { useI18n } from "@/lib/i18n";

type LegalDocPageProps = {
  slug: string;
};

type ApiLegalDoc = {
  slug: string;
  language: "en" | "ar";
  title: string;
  subtitle: string;
  blocks: LegalBlock[];
  effectiveDate: string;
  entityLine: string;
};

type ApiLegalIndex = {
  language: "en" | "ar";
  entityLine: string;
  index: { slug: string; title: string; subtitle: string; effectiveDate: string }[];
};

function staticDoc(slug: string, language: "en" | "ar"): LegalDoc | undefined {
  const docs = language === "ar" ? LEGAL_DOCS_AR : LEGAL_DOCS;
  return docs[slug] || LEGAL_DOCS[slug];
}

export function LegalDocPage({ slug }: LegalDocPageProps) {
  const { language } = useI18n();

  // Fetch the live (admin-editable) version. While the request is in
  // flight, or if it fails, fall back to the static legal pack baked
  // into the bundle so users never see an empty legal page.
  const { data: apiDoc } = useQuery<ApiLegalDoc>({
    queryKey: ["/api/legal", slug, language],
    queryFn: async () => {
      const res = await fetch(
        `/api/legal/${encodeURIComponent(slug)}?lang=${language}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`Legal doc fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const fallback = staticDoc(slug, language);
  const doc: LegalDoc | undefined = apiDoc
    ? {
        slug: apiDoc.slug,
        title: apiDoc.title,
        subtitle: apiDoc.subtitle,
        blocks: apiDoc.blocks,
      }
    : fallback;

  const effectiveDate = apiDoc?.effectiveDate ?? LEGAL_EFFECTIVE_DATE;
  const entityLine = apiDoc?.entityLine ?? LEGAL_ENTITY_LINE;

  if (!doc) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16">
        <h1 className="text-2xl font-semibold">
          {language === "ar" ? "المستند غير موجود" : "Document not found"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {language === "ar"
            ? "هذا المستند القانوني غير متاح. "
            : "That legal document doesn’t exist. "}
          <Link href="/terms" className="text-primary underline">
            {language === "ar" ? "تصفّح حزمة المستندات القانونية" : "Browse our legal pack"}
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <LegalDocLayout
      doc={doc}
      language={language}
      effectiveDate={effectiveDate}
      entityLine={entityLine}
    />
  );
}

export function LegalDocLayout({
  doc,
  language,
  effectiveDate = LEGAL_EFFECTIVE_DATE,
  entityLine = LEGAL_ENTITY_LINE,
}: {
  doc: LegalDoc;
  language: "en" | "ar";
  effectiveDate?: string;
  entityLine?: string;
}) {
  const isAr = language === "ar";
  const tocItems = doc.blocks
    .map((b, idx) => (b.type === "h2" ? { id: `sec-${idx}`, text: b.text } : null))
    .filter((x): x is { id: string; text: string } => x !== null);

  // Cross-link index — prefer the live API list so newly published docs
  // (or renamed titles) appear immediately, fall back to the static index.
  const { data: apiIndex } = useQuery<ApiLegalIndex>({
    queryKey: ["/api/legal", language],
    queryFn: async () => {
      const res = await fetch(`/api/legal?lang=${language}`, { credentials: "include" });
      if (!res.ok) throw new Error("legal index failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const index =
    apiIndex?.index ?? (isAr ? LEGAL_DOC_INDEX_AR : LEGAL_DOC_INDEX);

  return (
    <div
      className="container mx-auto max-w-6xl px-4 py-12"
      data-testid={`legal-page-${doc.slug}`}
    >
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        data-testid={`legal-back-home-${doc.slug}`}
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {isAr ? "العودة إلى الرئيسية" : "Back to home"}
      </Link>

      <div className="mt-4 grid gap-10 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0">
          <header className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-bareter-teal">
              {isAr ? "بارتر — المستندات القانونية" : "Bareter Legal"}
            </p>
            <h1
              className="mt-2 text-3xl sm:text-4xl font-bold text-foreground"
              data-testid={`legal-title-${doc.slug}`}
            >
              {doc.title}
            </h1>
            {doc.subtitle && (
              <p className="mt-2 text-base text-muted-foreground">{doc.subtitle}</p>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              <span data-testid={`legal-effective-${doc.slug}`}>
                {isAr ? "تاريخ السريان: " : "Effective Date: "}
                {effectiveDate}
              </span>
              {" · "}
              <span data-testid={`legal-updated-${doc.slug}`}>
                {isAr ? "آخر تحديث: " : "Last updated: "}
                {effectiveDate}
              </span>
              {" · "}
              <span>{entityLine}</span>
            </p>
            {isAr && (
              <p
                className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
                data-testid={`legal-translation-notice-${doc.slug}`}
              >
                هذه الترجمة العربية مقدّمة لأغراض الراحة فقط. في حال وجود أي تعارض بين النصّين العربي
                والإنجليزي، يُعتدّ بالنص الإنجليزي.
              </p>
            )}
          </header>

          <article className="space-y-5 text-[15px] leading-relaxed text-foreground/90">
            {doc.blocks.map((block, idx) => (
              <BlockRenderer key={idx} block={block} anchorId={`sec-${idx}`} />
            ))}
          </article>

          <hr className="my-10 border-border" />

          <section aria-label={isAr ? "مستندات قانونية أخرى" : "Other legal documents"}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {isAr ? "مستندات قانونية أخرى" : "Other legal documents"}
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {index
                .filter((d) => d.slug !== doc.slug)
                .map((d) => (
                  <li key={d.slug}>
                    <Link
                      href={legalHref(d.slug)}
                      className="block rounded-md border border-border p-3 hover:border-bareter-teal hover:bg-muted/40 transition-colors"
                      data-testid={`legal-link-${d.slug}`}
                    >
                      <p className="text-sm font-medium text-foreground">{d.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {d.subtitle}
                      </p>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        </div>

        {tocItems.length > 0 && (
          <aside
            className="hidden lg:block"
            aria-label={isAr ? "في هذه الصفحة" : "On this page"}
            data-testid={`legal-toc-${doc.slug}`}
          >
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {isAr ? "في هذه الصفحة" : "On this page"}
              </p>
              <nav className="flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto pr-2">
                {tocItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="text-xs text-muted-foreground hover:text-bareter-teal transition-colors line-clamp-2"
                  >
                    {item.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function legalHref(slug: string): string {
  if (slug === "privacy") return "/privacy";
  if (slug === "terms") return "/terms";
  return `/legal/${slug}`;
}

function BlockRenderer({ block, anchorId }: { block: LegalBlock; anchorId: string }) {
  switch (block.type) {
    case "h2":
      return (
        <h2
          id={anchorId}
          className="mt-8 scroll-mt-24 text-xl sm:text-2xl font-semibold text-foreground"
        >
          {block.text}
        </h2>
      );
    case "h3":
      return (
        <h3 className="mt-6 text-base sm:text-lg font-semibold text-foreground">
          {block.text}
        </h3>
      );
    case "p":
      return <p className="text-foreground/85">{block.text}</p>;
    case "ul":
      return (
        <ul className="list-disc ps-6 space-y-1.5 text-foreground/85 marker:text-bareter-teal">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
  }
}
