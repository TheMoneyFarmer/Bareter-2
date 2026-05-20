/**
 * Attach cover images to the three seeded blog posts.
 *
 * Run with:
 *   npm run blogs:covers
 *
 * Idempotent: downloads each image once, uploads it as a Sanity asset
 * (Sanity dedupes uploads by SHA-1 hash on the server side), and patches
 * the blogPost document's `coverImage` field to reference the asset.
 * Safe to re-run.
 */

import { createClient } from "@sanity/client";
import { Buffer } from "node:buffer";

const cleanEnv = (v: string | undefined) =>
  (v ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/[,;]+$/, "");

const projectId = cleanEnv(process.env.SANITY_PROJECT_ID);
const dataset = cleanEnv(process.env.SANITY_DATASET);
const token = cleanEnv(process.env.SANITY_SEED_TOKEN);

if (!projectId || !dataset || !token) {
  console.error(
    "[seedBlogCovers] missing env: need SANITY_PROJECT_ID, SANITY_DATASET, SANITY_SEED_TOKEN",
  );
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2024-01-01",
  useCdn: false,
});

// Cover image source URLs (Higgsfield CDN). Each maps to the
// blogPost document _id created by seedBlogs.ts.
const covers: Array<{
  blogPostId: string;
  imageUrl: string;
  filename: string;
  alt: string;
}> = [
  {
    blogPostId: "blogPost-how-to-barter-business-services-dubai-2026",
    imageUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3DDqRMoWAHd5HQ1hFlOiysjL9NU/hf_20260511_160458_8225cc52-0032-4f43-92f4-fb29f569f545.png",
    filename: "bareter-blog-cover-how-to-barter.png",
    alt: "Editorial illustration of two hands exchanging a balanced set of business assets and services (office, briefcase, paintbrush, document) in front of a full-width Dubai skyline, signalling B2B barter between services and assets.",
  },
  {
    blogPostId: "blogPost-uae-vat-barter-transactions-vatp042-explained",
    imageUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3DDqRMoWAHd5HQ1hFlOiysjL9NU/hf_20260511_154804_302a6295-9c23-46d6-86ee-a2ede6f75ff9.png",
    filename: "bareter-blog-cover-vat-barter.png",
    alt: "Editorial illustration of a deep-teal balance scale with documents on one side and service icons on the other, representing equal open-market value in UAE VAT barter rules.",
  },
  {
    blogPostId: "blogPost-best-uae-barter-platform-comparison-2026",
    imageUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3DDqRMoWAHd5HQ1hFlOiysjL9NU/hf_20260511_154809_95e86246-ad1d-4104-8b48-e16b0568590a.png",
    filename: "bareter-blog-cover-platform-comparison.png",
    alt: "Editorial illustration of three platform badges compared side by side, with the deep-teal verified-platform badge elevated, representing a UAE barter platform comparison.",
  },
];

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function main() {
  console.log(
    `[seedBlogCovers] uploading ${covers.length} covers to ${projectId}/${dataset}...`,
  );
  for (const cover of covers) {
    if (cover.imageUrl.startsWith("PLACEHOLDER")) {
      console.warn(
        `  ! skipping ${cover.blogPostId} (placeholder URL — fill in before running)`,
      );
      continue;
    }
    console.log(`  -> ${cover.blogPostId}`);
    console.log(`     downloading...`);
    const buf = await fetchImage(cover.imageUrl);

    console.log(`     uploading to Sanity (${buf.byteLength} bytes)...`);
    const asset = await client.assets.upload("image", buf, {
      filename: cover.filename,
      contentType: "image/png",
    });

    console.log(`     patching blogPost.coverImage -> ${asset._id}`);
    await client
      .patch(cover.blogPostId)
      .set({
        coverImage: {
          _type: "image",
          asset: { _type: "reference", _ref: asset._id },
          alt: cover.alt,
        },
      })
      .commit();
    console.log(`     ✓ done`);
  }
  console.log("[seedBlogCovers] complete.");
}

main().catch((err) => {
  console.error("[seedBlogCovers] failed:", err);
  process.exit(1);
});
