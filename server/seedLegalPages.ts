import { storage } from "./storage";
import {
  LEGAL_DOCS,
  LEGAL_EFFECTIVE_DATE,
} from "../client/src/content/legal";
import { LEGAL_DOCS_AR } from "../client/src/content/legal.ar";

// Idempotently backfill the database with the static legal pack so the DB
// becomes the source of truth on first boot. Subsequent edits flow through
// the admin UI; we never overwrite an existing (slug, language) row here.
export async function seedLegalPages(): Promise<void> {
  const existing = await storage.countLegalPages();
  if (existing > 0) return;

  const enEntries = Object.values(LEGAL_DOCS);
  for (const doc of enEntries) {
    await storage.upsertLegalPage(
      {
        slug: doc.slug,
        language: "en",
        title: doc.title,
        subtitle: doc.subtitle ?? "",
        blocks: doc.blocks as unknown as any,
        effectiveDate: LEGAL_EFFECTIVE_DATE,
        version: 1,
        updatedBy: null,
      },
      null,
    );
    const ar = LEGAL_DOCS_AR[doc.slug];
    if (ar) {
      await storage.upsertLegalPage(
        {
          slug: ar.slug,
          language: "ar",
          title: ar.title,
          subtitle: ar.subtitle ?? "",
          blocks: ar.blocks as unknown as any,
          effectiveDate: LEGAL_EFFECTIVE_DATE,
          version: 1,
          updatedBy: null,
        },
        null,
      );
    }
  }
  console.log(
    `[seedLegalPages] Seeded ${enEntries.length} EN + ${enEntries.filter((d) => LEGAL_DOCS_AR[d.slug]).length} AR legal pages.`,
  );
}
