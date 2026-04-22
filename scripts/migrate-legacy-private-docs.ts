/**
 * One-off (and idempotent) backfill: move pre-audit KYC/KYB documents
 * from the public ./uploads folder into the private object-storage
 * bucket, mirroring the live `/api/upload?type=verification|business_license`
 * code path in server/routes.ts.
 *
 * For every user with a legacy `/uploads/...` value in
 * `verificationDocUrl` or `businessLicenseUrl` this script:
 *   1. Reads the local file from ./uploads/<filename>.
 *   2. Magic-byte-validates it (allow-list: jpeg/png/gif/webp/pdf).
 *   3. Uploads it to <PRIVATE_OBJECT_DIR>/private-docs/<userId>/<random>.<ext>
 *      with the same `owner=userId / visibility=private` ACL the live
 *      upload route writes.
 *   4. Updates the user row to point at the new `/api/private-docs/...` URL.
 *   5. Deletes the local file.
 *
 * Idempotent: rows whose URLs already start with `/api/private-docs/`
 * are skipped, and a missing local file is logged and skipped (the URL
 * is left untouched so the run can be retried after the file is found).
 *
 * Run:  npx tsx scripts/migrate-legacy-private-docs.ts
 *       npx tsx scripts/migrate-legacy-private-docs.ts --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { or, like } from "drizzle-orm";
import { db } from "../server/db";
import { users } from "../shared/schema";
import {
  objectStorageClient,
  ObjectStorageService,
} from "../server/replit_integrations/object_storage/objectStorage";
import { storage as appStorage } from "../server/storage";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const DRY_RUN = process.argv.includes("--dry-run");

type Field = "verificationDocUrl" | "businessLicenseUrl";

interface Outcome {
  userId: string;
  field: Field;
  oldUrl: string;
  newUrl?: string;
  status:
    | "migrated"
    | "skipped_already_private"
    | "skipped_not_local"
    | "missing_local_file"
    | "rejected_file_type"
    | "error";
  detail?: string;
}

function isLegacyLocalUrl(url: string | null | undefined): url is string {
  return !!url && url.startsWith("/uploads/");
}

async function migrateOne(
  userId: string,
  field: Field,
  url: string,
): Promise<Outcome> {
  if (url.startsWith("/api/private-docs/")) {
    return { userId, field, oldUrl: url, status: "skipped_already_private" };
  }
  if (!isLegacyLocalUrl(url)) {
    return { userId, field, oldUrl: url, status: "skipped_not_local" };
  }

  const filename = url.replace(/^\/uploads\//, "");
  // Reject any traversal attempt before we touch the filesystem.
  if (filename.includes("/") || filename.includes("..") || filename.includes("\\")) {
    return {
      userId,
      field,
      oldUrl: url,
      status: "error",
      detail: "suspicious filename, refusing to read",
    };
  }
  const localPath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(localPath)) {
    return { userId, field, oldUrl: url, status: "missing_local_file" };
  }

  const buf = fs.readFileSync(localPath);
  const detected = await fileTypeFromBuffer(buf);
  if (!detected || !ALLOWED[detected.mime]) {
    return {
      userId,
      field,
      oldUrl: url,
      status: "rejected_file_type",
      detail: detected?.mime ?? "unknown",
    };
  }
  const ext = ALLOWED[detected.mime];

  const svc = new ObjectStorageService();
  const privateDir = svc.getPrivateObjectDir().replace(/\/+$/, "");
  const random = crypto.randomBytes(24).toString("hex");
  const objectPath = `${privateDir}/private-docs/${userId}/${random}.${ext}`;
  const parts = objectPath.replace(/^\/+/, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const newUrl = `/api/private-docs/${userId}/${random}.${ext}`;

  if (DRY_RUN) {
    return { userId, field, oldUrl: url, newUrl, status: "migrated", detail: "dry-run" };
  }

  await objectStorageClient
    .bucket(bucketName)
    .file(objectName)
    .save(buf, {
      contentType: detected.mime,
      metadata: {
        metadata: {
          "custom:aclPolicy": JSON.stringify({
            owner: userId,
            visibility: "private",
          }),
        },
      },
    });

  await appStorage.updateUser(userId, { [field]: newUrl } as any);

  // Only unlink AFTER both the upload and the DB update have succeeded.
  try {
    fs.unlinkSync(localPath);
  } catch (err) {
    return {
      userId,
      field,
      oldUrl: url,
      newUrl,
      status: "migrated",
      detail: `migrated, but failed to delete local file: ${(err as Error).message}`,
    };
  }

  return { userId, field, oldUrl: url, newUrl, status: "migrated" };
}

async function main() {
  console.log(
    `[migrate-private-docs] starting${DRY_RUN ? " (DRY RUN)" : ""} — uploads dir: ${UPLOADS_DIR}`,
  );

  const rows = await db
    .select({
      id: users.id,
      verificationDocUrl: users.verificationDocUrl,
      businessLicenseUrl: users.businessLicenseUrl,
    })
    .from(users)
    .where(
      or(
        like(users.verificationDocUrl, "/uploads/%"),
        like(users.businessLicenseUrl, "/uploads/%"),
      ),
    );

  console.log(`[migrate-private-docs] candidate users: ${rows.length}`);

  const outcomes: Outcome[] = [];
  for (const row of rows) {
    if (isLegacyLocalUrl(row.verificationDocUrl)) {
      outcomes.push(
        await migrateOne(row.id, "verificationDocUrl", row.verificationDocUrl),
      );
    }
    if (isLegacyLocalUrl(row.businessLicenseUrl)) {
      outcomes.push(
        await migrateOne(row.id, "businessLicenseUrl", row.businessLicenseUrl),
      );
    }
  }

  const summary: Record<Outcome["status"], number> = {
    migrated: 0,
    skipped_already_private: 0,
    skipped_not_local: 0,
    missing_local_file: 0,
    rejected_file_type: 0,
    error: 0,
  };
  for (const o of outcomes) {
    summary[o.status]++;
    console.log(
      `  user=${o.userId} field=${o.field} status=${o.status}` +
        (o.detail ? ` detail="${o.detail}"` : "") +
        (o.newUrl ? ` newUrl=${o.newUrl}` : ""),
    );
  }
  console.log("[migrate-private-docs] summary:", summary);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate-private-docs] FATAL:", err);
    process.exit(1);
  });
