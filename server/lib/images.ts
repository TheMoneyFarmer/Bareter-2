// Image processing for uploads.
//
// Listing photos come straight off phone cameras — measured live in production,
// a single listing image was 3.1 MB and a browse page pulled ~38 MB, into grid
// tiles roughly 400px wide. That is ~100x more data than the slot needs and is
// what made image loads take a minute on mobile.
//
// Two derivatives are produced from every uploaded image:
//
//   1. A DISPLAY image  — the original, capped at MAX_DISPLAY_PX on the long
//      edge and re-encoded. This replaces the raw upload everywhere, so even
//      the full-size detail view stops shipping camera originals.
//   2. A THUMBNAIL      — THUMB_PX on the long edge, WebP, for grids and cards.
//
// Both are cheap to produce (sharp/libvips, a few ms) and are generated once at
// upload time rather than per request.

import sharp from "sharp";
import { uploadToR2, generateR2Key, r2PublicUrl } from "./r2";

/** Long-edge cap for the full-size image shown on a detail page. */
export const MAX_DISPLAY_PX = 1600;

/** Long-edge cap for grid/card thumbnails. */
export const THUMB_PX = 600;

/** Formats we re-encode. Anything else (PDF, GIF) is passed through untouched. */
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isResizableImage(mime: string): boolean {
  return RESIZABLE.has(mime);
}

export interface ProcessedImage {
  /** Re-encoded full-size image, capped at MAX_DISPLAY_PX. */
  display: { buffer: Buffer; mime: string; ext: string };
  /** WebP thumbnail capped at THUMB_PX, or null if the source wasn't resizable. */
  thumb: { buffer: Buffer; mime: string; ext: string } | null;
}

/**
 * Resize an uploaded image into a display copy and a thumbnail.
 *
 * `withoutEnlargement` means small images are never upscaled — a 200px avatar
 * stays 200px instead of being blown up to 1600px and gaining size. Animated
 * GIFs and PDFs are not resizable and pass through unchanged.
 *
 * EXIF is stripped by default by sharp, which also removes GPS coordinates from
 * phone photos — worth keeping, since listing images are public.
 */
export async function processImage(
  buffer: Buffer,
  mime: string,
): Promise<ProcessedImage> {
  if (!isResizableImage(mime)) {
    const ext = mime === "image/gif" ? "gif" : "bin";
    return { display: { buffer, mime, ext }, thumb: null };
  }

  // `failOn: "none"` keeps slightly-corrupt phone JPEGs from throwing outright;
  // libvips decodes what it can rather than rejecting the whole upload.
  const src = () => sharp(buffer, { failOn: "none" }).rotate();

  const [display, thumb] = await Promise.all([
    src()
      .resize({ width: MAX_DISPLAY_PX, height: MAX_DISPLAY_PX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(),
    src()
      .resize({ width: THUMB_PX, height: THUMB_PX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 74 })
      .toBuffer(),
  ]);

  return {
    display: { buffer: display, mime: "image/webp", ext: "webp" },
    thumb: { buffer: thumb, mime: "image/webp", ext: "webp" },
  };
}

/**
 * Derive the thumbnail storage key for a given display key.
 *
 * `public-uploads/abc123.webp` -> `thumbs/abc123.webp`
 *
 * Keeping thumbnails in their own prefix (rather than a `_thumb` suffix beside
 * the original) means the same rule maps BOTH new R2 uploads and the older
 * `/objects/public-uploads/...` images onto one predictable location, so the
 * backfill and the client can agree on where a thumbnail lives without a
 * schema change or a per-row lookup.
 */
export function thumbKeyFor(displayKey: string): string {
  const base = displayKey.split("/").pop() ?? displayKey;
  const stem = base.replace(/\.[^.]+$/, "");
  return `thumbs/${stem}.webp`;
}

/**
 * Process an uploaded image and push both derivatives to R2.
 *
 * Returns the URL of the DISPLAY image, which is what gets stored on the row —
 * so callers need no schema change. The thumbnail lands at the predictable
 * `thumbs/<stem>.webp` key that `thumbUrlFor` derives, and clients fall back to
 * the display URL if it is missing.
 *
 * A thumbnail failure never fails the upload: the display image is what the
 * product actually requires, and a missing thumbnail degrades to "client uses
 * the display image", which is exactly the pre-existing behaviour.
 */
export async function uploadPublicImageWithThumb(
  buffer: Buffer,
  mime: string,
  ext: string,
  folder = "public-uploads",
): Promise<string> {
  if (!isResizableImage(mime)) {
    return uploadToR2(generateR2Key(folder, ext), buffer, mime);
  }

  const processed = await processImage(buffer, mime);
  const displayKey = generateR2Key(folder, processed.display.ext);
  const url = await uploadToR2(displayKey, processed.display.buffer, processed.display.mime);

  if (processed.thumb) {
    try {
      await uploadToR2(thumbKeyFor(displayKey), processed.thumb.buffer, processed.thumb.mime);
    } catch (err: any) {
      console.warn(`[images] Thumbnail upload failed for ${displayKey}:`, err?.message);
    }
  }
  return url;
}

/**
 * Given any stored image URL, return the URL its thumbnail would live at.
 * Returns null when there is no configured R2 public base to build one from.
 *
 * The caller is expected to fall back to the original URL if the thumbnail
 * turns out not to exist (older images the backfill hasn't reached).
 */
export function thumbUrlFor(imageUrl: string, r2PublicBase: string): string | null {
  if (!imageUrl || !r2PublicBase) return null;
  const withoutQuery = imageUrl.split("?")[0];
  const base = withoutQuery.split("/").pop();
  if (!base) return null;
  const stem = base.replace(/\.[^.]+$/, "");
  if (!stem) return null;
  return `${r2PublicBase.replace(/\/$/, "")}/thumbs/${stem}.webp`;
}
