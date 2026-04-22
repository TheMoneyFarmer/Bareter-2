import { db } from "./db";
import { imageScans } from "@shared/schema";
import dns from "node:dns/promises";
import net from "node:net";

interface ScanResult {
  flagged: boolean;
  reason: string | null;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

async function assertSafeImageUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("invalid_url");
  }
  if (parsed.protocol !== "https:") throw new Error("non_https_url");
  const host = parsed.hostname;
  if (!host) throw new Error("missing_host");

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("private_ip_literal");
    return parsed;
  }

  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length) throw new Error("dns_no_records");
  for (const r of records) {
    if (isPrivateAddress(r.address)) throw new Error("private_resolved_ip");
  }
  return parsed;
}

export async function scanImageUrl(imageUrl: string, listingId?: string): Promise<ScanResult> {
  const apiKey = process.env.GOOGLE_VISION_KEY;

  let result: ScanResult = { flagged: false, reason: null };

  if (apiKey) {
    try {
      await assertSafeImageUrl(imageUrl);
    } catch (err) {
      console.warn("[vision] rejected unsafe image URL:", (err as Error).message);
      if (listingId) {
        try {
          await db.insert(imageScans).values({
            imageUrl,
            listingId,
            flagged: false,
            reason: null,
          });
        } catch {}
      }
      return result;
    }

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
