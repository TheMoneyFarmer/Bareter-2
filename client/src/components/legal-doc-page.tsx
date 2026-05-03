import { Link } from "wouter";
import {
  LEGAL_DOCS,
  LEGAL_DOC_INDEX,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ENTITY_LINE,
  type LegalBlock,
  type LegalDoc,
} from "@/content/legal";

type LegalDocPageProps = {
  slug: string;
};

export function LegalDocPage({ slug }: LegalDocPageProps) {
  const doc = LEGAL_DOCS[slug];
  if (!doc) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Document not found</h1>
        <p className="mt-2 text-muted-foreground">
          That legal document doesn’t exist.{" "}
          <Link href="/legal/terms" className="text-primary underline">
            Browse our legal pack
          </Link>
          .
        </p>
      </div>
    );
  }

  return <LegalDocLayout doc={doc} />;
}

export function LegalDocLayout({ doc }: { doc: LegalDoc }) {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12" data-testid={`legal-page-${doc.slug}`}>
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-bareter-teal">
          Bareter Legal
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
            Effective Date: {LEGAL_EFFECTIVE_DATE}
          </span>
          {" · "}
          <span>{LEGAL_ENTITY_LINE}</span>
        </p>
      </header>

      <article className="space-y-5 text-[15px] leading-relaxed text-foreground/90">
        {doc.blocks.map((block, idx) => (
          <BlockRenderer key={idx} block={block} />
        ))}
      </article>

      <hr className="my-10 border-border" />

      <section aria-label="Other legal documents">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Other legal documents
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {LEGAL_DOC_INDEX.filter((d) => d.slug !== doc.slug).map((d) => (
            <li key={d.slug}>
              <Link
                href={legalHref(d.slug)}
                className="block rounded-md border border-border p-3 hover:border-bareter-teal hover:bg-muted/40 transition-colors"
                data-testid={`legal-link-${d.slug}`}
              >
                <p className="text-sm font-medium text-foreground">{d.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{d.subtitle}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function legalHref(slug: string): string {
  if (slug === "privacy") return "/privacy";
  if (slug === "terms") return "/terms";
  return `/legal/${slug}`;
}

function BlockRenderer({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "h2":
      return (
        <h2 className="mt-8 text-xl sm:text-2xl font-semibold text-foreground">
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
