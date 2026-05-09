import { CATEGORIES, POST_SUBTYPES } from "./schema";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const categoryBySlug = new Map<string, string>();
for (const c of CATEGORIES) categoryBySlug.set(slugify(c), c);
for (const c of Object.keys(POST_SUBTYPES)) {
  if (!categoryBySlug.has(slugify(c))) categoryBySlug.set(slugify(c), c);
}

const subcategoryAllSlugs: Array<{ category: string; subcategory: string; categorySlug: string; subcategorySlug: string }> = [];
for (const [cat, subs] of Object.entries(POST_SUBTYPES)) {
  for (const sub of subs as readonly string[]) {
    subcategoryAllSlugs.push({
      category: cat,
      subcategory: sub,
      categorySlug: slugify(cat),
      subcategorySlug: slugify(sub),
    });
  }
}

export function categoryFromSlug(slug: string): string | null {
  return categoryBySlug.get(slug.toLowerCase()) ?? null;
}

export function subcategoryFromSlug(catSlug: string, subSlug: string): string | null {
  const cat = catSlug.toLowerCase();
  const sub = subSlug.toLowerCase();
  const m = subcategoryAllSlugs.find(
    (e) => e.categorySlug === cat && e.subcategorySlug === sub,
  );
  return m ? m.subcategory : null;
}

export function allCategorySlugs(): Array<{ category: string; slug: string }> {
  return CATEGORIES.map((c) => ({ category: c, slug: slugify(c) }));
}

export function allSubcategorySlugs(): Array<{
  category: string;
  subcategory: string;
  categorySlug: string;
  subcategorySlug: string;
}> {
  return subcategoryAllSlugs.slice();
}
