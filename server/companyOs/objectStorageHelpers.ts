// Object-storage helpers for the Company OS.
//
// The shared `ObjectStorageService` only exposes random-key uploads
// (intended for user file uploads with ACL gating). The Company OS
// agents need to upload to deterministic keys (so the row in
// `content_briefs` / `board_reports` can pin the storage path) and
// hand a signed GET URL to the founder over WhatsApp without going
// through a Replit session. This module wraps the same Replit sidecar
// that powers `ObjectStorageService` for those two operations only.

import { objectStorageClient } from "../replit_integrations/object_storage";
import { withRetry } from "./retry";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  const parts = normalised.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Invalid object path: ${path}`);
  }
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

function privateRoot(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR not set — cannot upload Company OS artifacts to object storage.",
    );
  }
  return dir.replace(/\/$/, "");
}

/**
 * Reject anything that could escape the `companyOs/` prefix or smuggle
 * shell/URL nasties into the object name. Keys are always system-generated
 * (e.g. `companyOs/briefs/<uuid>.pdf`) so legitimate inputs never trip
 * these checks.
 */
function assertSafeRelativeKey(relativeKey: string): void {
  if (typeof relativeKey !== "string" || relativeKey.length === 0) {
    throw new Error("Object storage key must be a non-empty string");
  }
  const trimmed = relativeKey.replace(/^\//, "");
  if (trimmed.length > 512) {
    throw new Error("Object storage key too long");
  }
  if (!trimmed.startsWith("companyOs/")) {
    throw new Error("Object storage key must start with 'companyOs/'");
  }
  for (const seg of trimmed.split("/")) {
    if (!seg || seg === "." || seg === "..") {
      throw new Error("Object storage key contains an invalid path segment");
    }
    if (seg.includes("\\") || seg.includes("\0")) {
      throw new Error("Object storage key contains forbidden characters");
    }
  }
}

/**
 * Resolve a Company-OS-relative key (e.g. "companyOs/briefs/xyz.pdf") to
 * the absolute `<bucket>/<object>` path inside the Replit private bucket.
 */
function resolveFullPath(relativeKey: string): string {
  assertSafeRelativeKey(relativeKey);
  return `${privateRoot()}/${relativeKey.replace(/^\//, "")}`;
}

/**
 * Upload a Buffer to a deterministic key inside `PRIVATE_OBJECT_DIR`.
 * Returns the same `relativeKey` so callers can persist it on a DB row.
 */
export async function uploadPrivateBuffer(
  relativeKey: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const fullPath = resolveFullPath(relativeKey);
  const { bucketName, objectName } = parseObjectPath(fullPath);
  console.log(`[objstore-audit] uploadPrivateBuffer: 1 advanced op — key=${relativeKey} size=${buffer.length}`);
  await withRetry(
    () =>
      objectStorageClient
        .bucket(bucketName)
        .file(objectName)
        .save(buffer, { contentType, resumable: false }),
    { agentName: "objectStorage", opName: "uploadPrivateBuffer" },
  );
  return relativeKey;
}

/**
 * Generate a time-bounded GET URL for a previously uploaded private object.
 * The default TTL is 7 days — long enough for a WhatsApp recipient to open
 * the link at their leisure but short enough that leaked links expire.
 */
export async function getSignedDownloadUrl(
  relativeKey: string,
  ttlSec = 7 * 24 * 60 * 60,
): Promise<string> {
  const fullPath = resolveFullPath(relativeKey);
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const res = await withRetry(
    async () => {
      const r = await fetch(
        `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket_name: bucketName,
            object_name: objectName,
            method: "GET",
            expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
          }),
        },
      );
      if (!r.ok) {
        const err = new Error(
          `Replit sidecar signed URL failed: HTTP ${r.status} for ${relativeKey}`,
        ) as Error & { status: number };
        err.status = r.status;
        throw err;
      }
      return r;
    },
    { agentName: "objectStorage", opName: "getSignedDownloadUrl" },
  );
  const json = (await res.json()) as { signed_url?: string };
  if (!json.signed_url) {
    throw new Error("Replit sidecar response missing signed_url field");
  }
  return json.signed_url;
}
