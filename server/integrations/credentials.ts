import crypto from "crypto";
import { storage } from "../storage";

const ALGO = "aes-256-cbc";
const IV_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.INTEGRATION_KEY || process.env.SESSION_SECRET || "bareter-integration-fallback-key";
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptCredential(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `enc:${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptCredential(stored: string): string {
  if (!stored.startsWith("enc:")) return stored;
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid credential format");
  const iv = Buffer.from(parts[1], "hex");
  const ciphertext = Buffer.from(parts[2], "hex");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

const SETTING_KEY_PREFIX = "integration_cred_";

export async function setIntegrationCredential(
  field: string,
  value: string,
  updatedBy?: string | null,
): Promise<void> {
  const encrypted = encryptCredential(value);
  await storage.setAppSetting(`${SETTING_KEY_PREFIX}${field}`, encrypted, updatedBy);
}

export async function getIntegrationCredential(field: string): Promise<string | null> {
  const raw = await storage.getAppSetting(`${SETTING_KEY_PREFIX}${field}`);
  if (!raw) return null;
  try {
    return decryptCredential(raw);
  } catch {
    return null;
  }
}

export async function isIntegrationConfigured(fields: string[]): Promise<boolean> {
  for (const f of fields) {
    const val = await getIntegrationCredential(f);
    if (!val) return false;
  }
  return true;
}
