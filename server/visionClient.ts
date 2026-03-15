import { db } from "./db";
import { imageScans } from "@shared/schema";

interface ScanResult {
  flagged: boolean;
  reason: string | null;
}

export async function scanImageUrl(imageUrl: string, listingId?: string): Promise<ScanResult> {
  const apiKey = process.env.GOOGLE_VISION_KEY;

  let result: ScanResult = { flagged: false, reason: null };

  if (apiKey) {
    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [
              {
                image: { source: { imageUri: imageUrl } },
                features: [
                  { type: "SAFE_SEARCH_DETECTION" },
                  { type: "LABEL_DETECTION", maxResults: 10 },
                ],
              },
            ],
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const annotations = data.responses?.[0];
        const safeSearch = annotations?.safeSearchAnnotation;

        const dangerLevels = ["LIKELY", "VERY_LIKELY"];
        const adult = safeSearch?.adult;
        const violence = safeSearch?.violence;
        const spoof = safeSearch?.spoof;

        if (dangerLevels.includes(adult)) {
          result = { flagged: true, reason: "Adult content detected" };
        } else if (dangerLevels.includes(violence)) {
          result = { flagged: true, reason: "Violent content detected" };
        } else if (dangerLevels.includes(spoof) && spoof === "VERY_LIKELY") {
          result = { flagged: true, reason: "Possible fake/spoofed image detected" };
        }
      }
    } catch {
    }
  }

  if (listingId) {
    try {
      await db.insert(imageScans).values({
        imageUrl,
        listingId,
        flagged: result.flagged,
        reason: result.reason,
      });
    } catch {
    }
  }

  return result;
}

export async function scanListingImages(imageUrls: string[], listingId: string): Promise<boolean> {
  if (!imageUrls || imageUrls.length === 0) return false;

  const firstImage = imageUrls[0];
  const result = await scanImageUrl(firstImage, listingId);
  return result.flagged;
}
