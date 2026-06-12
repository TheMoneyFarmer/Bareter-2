// Baileys is ESM-only. Dynamic import at runtime avoids the CJS bundling
// issue where esbuild compiles `import makeWASocket from "..."` into
// `ba.default()` which fails when the module's default export isn't hoisted.
import type { WASocket } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as QRCode from "qrcode";
import * as path from "path";
import * as fs from "fs";
import { EventEmitter } from "events";
import P from "pino";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";

const AUTH_DIR = path.join(process.cwd(), "whatsapp-auth");
const BUCKET = process.env.REPLIT_OBJECT_STORE_BUCKET ?? "replit-objstore-7e5628f2-57c3-4e06-a847-99cef1d8fb27";
const SESSION_PREFIX = "whatsapp-session/";

async function restoreSessionFromStorage(): Promise<void> {
  try {
    const bucket = objectStorageClient.bucket(BUCKET);
    const [files] = await bucket.getFiles({ prefix: SESSION_PREFIX });
    if (files.length === 0) return;
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    await Promise.all(files.map(async (file) => {
      const localName = file.name.slice(SESSION_PREFIX.length);
      if (!localName) return;
      const [contents] = await file.download();
      fs.writeFileSync(path.join(AUTH_DIR, localName), contents);
    }));
    console.log(`[whatsapp] Restored ${files.length} session file(s) from Object Storage`);
  } catch (err: any) {
    console.warn("[whatsapp] Could not restore session from Object Storage:", err?.message);
  }
}

async function backupSessionToStorage(): Promise<void> {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    const bucket = objectStorageClient.bucket(BUCKET);
    const files = fs.readdirSync(AUTH_DIR);
    await Promise.all(files.map(async (name) => {
      const contents = fs.readFileSync(path.join(AUTH_DIR, name));
      await bucket.file(`${SESSION_PREFIX}${name}`).save(contents, { resumable: false });
    }));
    console.log(`[whatsapp] Backed up ${files.length} session file(s) to Object Storage`);
  } catch (err: any) {
    console.warn("[whatsapp] Could not backup session to Object Storage:", err?.message);
  }
}

async function clearSessionFromStorage(): Promise<void> {
  try {
    const bucket = objectStorageClient.bucket(BUCKET);
    const [files] = await bucket.getFiles({ prefix: SESSION_PREFIX });
    await Promise.all(files.map(f => f.delete()));
    console.log("[whatsapp] Cleared session from Object Storage");
  } catch (err: any) {
    console.warn("[whatsapp] Could not clear session from Object Storage:", err?.message);
  }
}
const logger = P({ level: "silent" });

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || "thandolwenkosimceeyah@gmail.com";

// How many consecutive OTP send failures before we alert
const FAILURE_ALERT_THRESHOLD = 3;

type ConnectionState = "disconnected" | "connecting" | "connected";


async function sendFounderAlert(subject: string, body: string) {
  try {
    const { sendAdminEmail } = await import("./emailService");
    await sendAdminEmail(FOUNDER_EMAIL, { subject, body });
  } catch (err) {
    console.error("[whatsapp-alert] Failed to send founder alert:", err);
  }
}

class WhatsAppService extends EventEmitter {
  private sock: WASocket | null = null;
  private state: ConnectionState = "disconnected";
  private qrBase64: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private lastError: string | null = null;
  private connectAttempts = 0;
  private pairingCode: string | null = null;

  // Consecutive OTP failure tracking
  private consecutiveFailures = 0;
  private alertSentAt: number | null = null;

  getState(): ConnectionState {
    return this.state;
  }

  getQR(): string | null {
    return this.qrBase64;
  }

  getPairingCode(): string | null {
    return this.pairingCode;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getConnectAttempts(): number {
    return this.connectAttempts;
  }

  isReady(): boolean {
    return this.state === "connected";
  }

  async requestPairingCode(phone: string): Promise<string> {
    if (!this.sock) throw new Error("Not connected — wait for the socket to initialise first");
    if (this.state === "connected") throw new Error("Already linked — no pairing needed");
    // Digits only, no + or spaces
    const digits = phone.replace(/\D/g, "");
    if (!digits) throw new Error("Invalid phone number");
    try {
      const code: string = await (this.sock as any).requestPairingCode(digits);
      // Format as XXXX-XXXX for readability
      this.pairingCode = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
      console.log("[whatsapp] Pairing code issued for", digits);
      return this.pairingCode;
    } catch (err: any) {
      throw new Error(`Failed to get pairing code: ${err?.message ?? String(err)}`);
    }
  }

  // Called by the OTP route after each send attempt
  recordSendResult(success: boolean) {
    if (success) {
      this.consecutiveFailures = 0;
      this.alertSentAt = null;
      return;
    }
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= FAILURE_ALERT_THRESHOLD) {
      this.triggerFailureAlert();
    }
  }

  private async triggerFailureAlert() {
    // Throttle: don't spam more than once per hour
    const now = Date.now();
    if (this.alertSentAt && now - this.alertSentAt < 60 * 60 * 1000) return;
    this.alertSentAt = now;

    const subject = "⚠️ Bareter: WhatsApp OTP delivery is failing";
    const body = [
      `${this.consecutiveFailures} consecutive WhatsApp OTP messages have failed to send.`,
      "",
      "This means users are not receiving their verification codes and cannot complete sign-up.",
      "",
      "Possible causes:",
      "  • The WhatsApp number was banned by WhatsApp",
      "  • The session was logged out from the phone",
      "  • The server lost its WhatsApp connection",
      "",
      "What to do:",
      "  1. Go to Admin → Settings → Integrations",
      "  2. Check the WhatsApp connection status",
      "  3. If disconnected, scan the new QR code with your WhatsApp number",
      "  4. If the number is banned, use a different number and re-scan",
      "",
      `Current connection state: ${this.state}`,
      `Time: ${new Date().toUTCString()}`,
    ].join("\n");

    console.error(`\n⚠️  WHATSAPP OTP ALERT\n${body}\n`);
    await sendFounderAlert(subject, body);
  }

  async start() {
    if (this.state === "connecting" || this.state === "connected") return;
    this.stopped = false;
    await this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.sock?.end(undefined);
    this.sock = null;
    this.state = "disconnected";
    this.qrBase64 = null;
  }

  async logout() {
    try {
      await this.sock?.logout();
    } catch {}
    this.sock?.end(undefined);
    this.sock = null;
    this.state = "disconnected";
    this.qrBase64 = null;
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    await clearSessionFromStorage();
  }

  async sendMessage(to: string, body: string): Promise<boolean> {
    if (!this.sock || this.state !== "connected") {
      console.warn("[whatsapp] sendMessage skipped — not connected");
      return false;
    }
    try {
      const jid = this.toJid(to);
      await this.sock.sendMessage(jid, { text: body });
      return true;
    } catch (err) {
      console.error("[whatsapp] sendMessage failed:", err);
      return false;
    }
  }

  private toJid(phone: string): string {
    const digits = phone.replace(/^\+/, "").replace(/\s/g, "");
    return `${digits}@s.whatsapp.net`;
  }

  private async notifyDisconnect(reason: string, loggedOut: boolean) {
    // Only alert if we were previously connected (not on first boot before scan)
    const subject = loggedOut
      ? "⚠️ Bareter: WhatsApp number logged out / possibly banned"
      : "⚠️ Bareter: WhatsApp connection dropped";

    const body = [
      loggedOut
        ? "Your WhatsApp number was logged out. This can happen if WhatsApp banned the number for automated messaging, or if you manually logged out on the phone."
        : "The WhatsApp connection dropped unexpectedly. The server will attempt to reconnect automatically.",
      "",
      `Reason code: ${reason}`,
      `Time: ${new Date().toUTCString()}`,
      "",
      "What to do:",
      "  1. Go to Admin → Settings → Integrations",
      "  2. Check the WhatsApp status card",
      loggedOut
        ? "  3. Scan the new QR code — use a different number if the original was banned"
        : "  3. If still disconnected after 2 minutes, click Disconnect and re-scan the QR",
      "",
      "Until reconnected, users cannot receive WhatsApp verification codes.",
    ].join("\n");

    console.error(`\n⚠️  WHATSAPP DISCONNECT\n${body}\n`);
    await sendFounderAlert(subject, body);
  }

  private async connect() {
    this.state = "connecting";
    this.qrBase64 = null;
    this.connectAttempts++;
    this.emit("state", this.state);
    console.log(`[whatsapp] connect() attempt #${this.connectAttempts}`);

    try {
      if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
      await restoreSessionFromStorage();
    } catch (err: any) {
      this.lastError = `Cannot create auth dir: ${err?.message}`;
      console.error("[whatsapp]", this.lastError);
      this.state = "disconnected";
      this.emit("state", this.state);
      return;
    }

    // Hard timeout: if connect() hangs at any point, force a retry after 90s
    const hardTimeout = setTimeout(() => {
      if (this.state !== "connected") {
        this.lastError = `Connection timed out after 90s on attempt #${this.connectAttempts}`;
        console.warn("[whatsapp]", this.lastError);
        this.sock?.end(undefined);
        this.sock = null;
        this.state = "disconnected";
        this.emit("state", this.state);
        if (!this.stopped) setTimeout(() => this.connect(), 3000);
      }
    }, 90000);

    try {
      if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

      console.log("[whatsapp] Loading Baileys module…");
      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default ?? (baileys as any);
      const { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, DisconnectReason: DR } = baileys;
      console.log("[whatsapp] Baileys loaded, typeof makeWASocket:", typeof makeWASocket);

      console.log("[whatsapp] Loading auth state…");
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

      const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1023503901];
      let version: [number, number, number] = FALLBACK_VERSION;
      try {
        const result = await Promise.race([
          fetchLatestBaileysVersion(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
        ]) as { version: [number, number, number] };
        version = result.version;
        console.log("[whatsapp] WA version:", version);
      } catch (err: any) {
        console.warn("[whatsapp] fetchLatestBaileysVersion failed — using fallback:", FALLBACK_VERSION);
      }

      console.log("[whatsapp] Creating socket…");
      this.sock = makeWASocket({
        version,
        logger,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: false,
        shouldIgnoreJid: () => false,
        connectTimeoutMs: 60000,
        retryRequestDelayMs: 2000,
        // Send a ping every 15s to keep the WS alive through Replit's proxy
        keepAliveIntervalMs: 15000,
        // Don't mark messages as read — this is a send-only OTP account
        markOnlineOnConnect: false,
      });
      console.log("[whatsapp] Socket created — waiting for QR or connection…");

      this.sock.ev.on("creds.update", async () => {
        await saveCreds();
        backupSessionToStorage().catch(() => {});
      });
    } catch (err: any) {
      clearTimeout(hardTimeout);
      this.lastError = `Socket init failed: ${err?.message ?? String(err)}`;
      console.error("[whatsapp]", this.lastError);
      this.state = "disconnected";
      this.emit("state", this.state);
      if (!this.stopped) setTimeout(() => this.connect(), 10000);
      return;
    }

    // Track whether we were ever connected so we only alert on actual drops
    let wasConnected = false;

    this.sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          this.qrBase64 = await QRCode.toDataURL(qr);
          this.emit("qr", this.qrBase64);
        } catch (err) {
          console.error("[whatsapp] QR generation failed:", err);
        }
      }

      if (connection === "open") {
        clearTimeout(hardTimeout);
        wasConnected = true;
        this.state = "connected";
        this.qrBase64 = null;
        this.pairingCode = null;
        this.lastError = null;
        this.consecutiveFailures = 0;
        this.alertSentAt = null;
        console.log("[whatsapp] Connected and stable");
        this.emit("state", this.state);
      }

      if (connection === "close") {
        clearTimeout(hardTimeout);
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = code === 401; // DisconnectReason.loggedOut

        console.warn(`[whatsapp] Connection closed — code: ${code}, loggedOut: ${loggedOut}`);

        this.sock = null;
        this.state = "disconnected";
        this.qrBase64 = null;
        this.emit("state", this.state);

        if (wasConnected) {
          // Alert founder — connection was established before, now it's gone
          this.notifyDisconnect(String(code), loggedOut).catch(() => {});
        }

        if (loggedOut) {
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          clearSessionFromStorage().catch(() => {});
        }

        if (!this.stopped) {
          const delay = loggedOut ? 2000 : 8000;
          this.reconnectTimer = setTimeout(() => this.connect(), delay);
        }
      }
    });
  }
}

export const whatsappService = new WhatsAppService();
