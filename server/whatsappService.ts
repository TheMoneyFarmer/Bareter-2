// Baileys is ESM-only. Dynamic import at runtime avoids the CJS bundling
// issue where esbuild compiles `import makeWASocket from "..."` into
// `ba.default()` which fails when the module's default export isn't hoisted.
import type { WASocket } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as QRCode from "qrcode";
import * as path from "path";
import * as fs from "fs";
import { EventEmitter } from "events";
import { gzipSync, gunzipSync } from "zlib";
import { createHash } from "crypto";
import P from "pino";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";

const AUTH_DIR = path.join(process.cwd(), "whatsapp-auth");
const BUCKET = process.env.REPLIT_OBJECT_STORE_BUCKET ?? "replit-objstore-7e5628f2-57c3-4e06-a847-99cef1d8fb27";
const SESSION_PREFIX = "whatsapp-session/";

// Baileys' multi-file auth state writes one file per pre-key, sender-key and
// signal session — roughly 180 of them on a live session. Backing those up
// file-by-file cost 1 advanced PUT op *each*, which at one backup per minute
// billed ~259k advanced ops/day on Replit object storage.
//
// Instead the whole directory is bundled into a single gzipped JSON blob and
// written to ONE key. That makes a backup cost exactly 1 advanced op no matter
// how many key files Baileys has produced. The auth files are small JSON
// documents, so the bundle compresses to a few hundred KB at most.
const SESSION_BLOB_KEY = `${SESSION_PREFIX}session.json.gz`;

// sha256 of the last bundle we successfully uploaded. Baileys re-emits
// creds.update constantly (keepalive-driven key rotation) but the on-disk
// bytes are frequently identical, so hashing lets us skip the write entirely
// and drop the op count to zero for idle sessions.
let lastBackupHash: string | null = null;

/** Read AUTH_DIR into a single gzipped JSON bundle: { name: base64 }. */
function buildSessionBundle(): { buf: Buffer; hash: string; count: number } | null {
  if (!fs.existsSync(AUTH_DIR)) return null;
  const names = fs.readdirSync(AUTH_DIR).filter((n) =>
    fs.statSync(path.join(AUTH_DIR, n)).isFile()
  );
  if (names.length === 0) return null;
  const payload: Record<string, string> = {};
  for (const name of names.sort()) {
    payload[name] = fs.readFileSync(path.join(AUTH_DIR, name)).toString("base64");
  }
  const buf = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  return { buf, hash: createHash("sha256").update(buf).digest("hex"), count: names.length };
}

async function restoreSessionFromStorage(): Promise<void> {
  const bucket = objectStorageClient.bucket(BUCKET);

  // Preferred path: one GET (a *basic* op, effectively free) for the bundle.
  try {
    const [contents] = await bucket.file(SESSION_BLOB_KEY).download();
    const payload = JSON.parse(gunzipSync(contents).toString("utf8")) as Record<string, string>;
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    for (const [name, b64] of Object.entries(payload)) {
      if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) continue;
      fs.writeFileSync(path.join(AUTH_DIR, name), Buffer.from(b64, "base64"));
    }
    lastBackupHash = createHash("sha256").update(contents).digest("hex");
    console.log(`[whatsapp] Restored ${Object.keys(payload).length} session file(s) from session bundle`);
    return;
  } catch (err: any) {
    if (err?.code !== 404) {
      console.warn("[whatsapp] Session bundle restore failed:", err?.message);
    }
  }

  // One-time migration path: an older deploy left per-file objects behind.
  // Costs 1 LIST, but only until the first bundle backup lands.
  try {
    console.log("[whatsapp] No session bundle — falling back to legacy per-file restore (1 LIST op)");
    const [files] = await bucket.getFiles({ prefix: SESSION_PREFIX });
    const legacy = files.filter((f) => f.name !== SESSION_BLOB_KEY);
    if (legacy.length === 0) return;
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    await Promise.all(legacy.map(async (file) => {
      const localName = file.name.slice(SESSION_PREFIX.length);
      if (!localName || localName.includes("/")) return;
      const [contents] = await file.download();
      fs.writeFileSync(path.join(AUTH_DIR, localName), contents);
    }));
    console.log(`[whatsapp] Restored ${legacy.length} legacy session file(s) — will re-save as a bundle`);
  } catch (err: any) {
    console.warn("[whatsapp] Could not restore session from Object Storage:", err?.message);
  }
}

async function backupSessionToStorage(): Promise<void> {
  try {
    const bundle = buildSessionBundle();
    if (!bundle) return;
    if (bundle.hash === lastBackupHash) {
      // Nothing on disk actually changed — skip the write and the op entirely.
      return;
    }
    console.log(`[objstore-audit] backupSessionToStorage: 1 advanced op — ${bundle.count} file(s), ${(bundle.buf.length / 1024).toFixed(1)} KB bundled`);
    await objectStorageClient
      .bucket(BUCKET)
      .file(SESSION_BLOB_KEY)
      .save(bundle.buf, { contentType: "application/gzip", resumable: false });
    lastBackupHash = bundle.hash;
    console.log(`[whatsapp] Backed up ${bundle.count} session file(s) as one bundle`);
  } catch (err: any) {
    console.warn("[whatsapp] Could not backup session to Object Storage:", err?.message);
  }
}

async function clearSessionFromStorage(): Promise<void> {
  try {
    const bucket = objectStorageClient.bucket(BUCKET);
    const [files] = await bucket.getFiles({ prefix: SESSION_PREFIX });
    await Promise.all(files.map(f => f.delete().catch(() => {})));
    lastBackupHash = null;
    console.log("[whatsapp] Cleared session from Object Storage");
  } catch (err: any) {
    console.warn("[whatsapp] Could not clear session from Object Storage:", err?.message);
  }
}

const logger = P({ level: "silent" });

// How many consecutive OTP send failures before we log an alert event
const FAILURE_ALERT_THRESHOLD = 3;

// In-memory circular event log — keeps the last MAX_EVENTS entries
const MAX_EVENTS = 100;

export interface WhatsAppEvent {
  id: number;
  at: string;   // ISO timestamp
  type: "connected" | "disconnected" | "logged_out" | "otp_failed" | "reconnecting" | "error";
  message: string;
}

let _eventSeq = 0;
const _eventLog: WhatsAppEvent[] = [];

function addEvent(type: WhatsAppEvent["type"], message: string) {
  _eventLog.push({ id: ++_eventSeq, at: new Date().toISOString(), type, message });
  if (_eventLog.length > MAX_EVENTS) _eventLog.shift();
}

export function getWhatsAppEvents(): WhatsAppEvent[] {
  return [..._eventLog].reverse(); // newest first
}

// Reconnect backoff: 5s → 10s → 20s → 30s → 60s (max). Resets to 5s after
// a successful connection so a single drop never waits more than 5 seconds.
const RECONNECT_DELAYS_MS = [5000, 10000, 20000, 30000, 60000];

// Watchdog: if we've been disconnected for longer than this, force a reconnect
// regardless of any pending timers. Catches stuck states where the timer fired
// but connect() silently failed.
const WATCHDOG_INTERVAL_MS = 45_000;
const WATCHDOG_MAX_DISCONNECTED_MS = 90_000;

// Periodic session backup when connected (every 30 min — reduced from 5 min
// to avoid runaway object storage advanced-ops costs).
const SESSION_BACKUP_INTERVAL_MS = 30 * 60 * 1000;

// Debounce window for creds.update → backup. Baileys fires creds.update
// hundreds of times per session (pre-key refresh, signal-key rotation, etc.)
// so a per-event backup generates millions of PUT ops. One write per
// CREDS_BACKUP_DEBOUNCE_MS window is more than sufficient.
//
// 60s was still firing ~1440 backups/day. Since a backup only exists to
// survive a container restart — and Baileys regenerates pre-keys on demand
// after a restore — a 10-minute window loses nothing in practice while
// cutting the worst-case op count by 10x on top of the bundling change.
const CREDS_BACKUP_DEBOUNCE_MS = 10 * 60 * 1000;

type ConnectionState = "disconnected" | "connecting" | "connected";


class WhatsAppService extends EventEmitter {
  private sock: WASocket | null = null;
  private state: ConnectionState = "disconnected";
  private qrBase64: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private lastError: string | null = null;
  private totalConnectAttempts = 0;   // lifetime counter for admin display only
  private consecutiveDrops = 0;       // resets on successful connect — drives backoff
  private pairingCode: string | null = null;
  private disconnectedSince: number | null = null; // timestamp of last disconnect
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private sessionBackupTimer: ReturnType<typeof setInterval> | null = null;
  private credsBackupDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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
    return this.totalConnectAttempts;
  }

  isReady(): boolean {
    return this.state === "connected";
  }

  async requestPairingCode(phone: string): Promise<string> {
    if (!this.sock) throw new Error("Not connected — wait for the socket to initialise first");
    if (this.state === "connected") throw new Error("Already linked — no pairing needed");
    const digits = phone.replace(/\D/g, "");
    if (!digits) throw new Error("Invalid phone number");
    try {
      const code: string = await (this.sock as any).requestPairingCode(digits);
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

  private triggerFailureAlert() {
    const now = Date.now();
    if (this.alertSentAt && now - this.alertSentAt < 60 * 60 * 1000) return;
    this.alertSentAt = now;

    const msg = `${this.consecutiveFailures} consecutive OTP messages failed — connection state: ${this.state}`;
    console.error(`\n⚠️  WHATSAPP OTP ALERT: ${msg}\n`);
    addEvent("otp_failed", msg);
  }

  async start() {
    if (this.state === "connecting" || this.state === "connected") return;
    this.stopped = false;
    this.startWatchdog();
    await this.connect();
  }

  stop() {
    this.stopped = true;
    this.stopWatchdog();
    this.stopSessionBackup();
    if (this.credsBackupDebounceTimer) { clearTimeout(this.credsBackupDebounceTimer); this.credsBackupDebounceTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.sock?.end(undefined);
    this.sock = null;
    this.state = "disconnected";
    this.qrBase64 = null;
  }

  async logout() {
    if (this.credsBackupDebounceTimer) { clearTimeout(this.credsBackupDebounceTimer); this.credsBackupDebounceTimer = null; }
    try {
      await this.sock?.logout();
    } catch {}
    this.sock?.end(undefined);
    this.sock = null;
    this.state = "disconnected";
    this.qrBase64 = null;
    this.consecutiveDrops = 0;
    this.disconnectedSince = null;
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

  // Watchdog: runs every WATCHDOG_INTERVAL_MS and forces a reconnect if we've
  // been disconnected for longer than WATCHDOG_MAX_DISCONNECTED_MS. This catches
  // stuck states where the reconnect timer fired but connect() silently failed.
  private startWatchdog() {
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(() => {
      if (this.stopped) return;
      if (this.state === "connected") return;
      if (this.state === "connecting") return;
      const stuckFor = this.disconnectedSince ? Date.now() - this.disconnectedSince : 0;
      if (stuckFor >= WATCHDOG_MAX_DISCONNECTED_MS) {
        console.warn(`[whatsapp] Watchdog: disconnected for ${Math.round(stuckFor / 1000)}s — forcing reconnect`);
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        this.connect().catch((e) => console.error("[whatsapp] Watchdog reconnect failed:", e));
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog() {
    if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = null; }
  }

  // Periodic session backup while connected, so Object Storage always has a
  // fresh copy even if the process is killed before creds.update fires.
  private startSessionBackup() {
    if (this.sessionBackupTimer) return;
    this.sessionBackupTimer = setInterval(() => {
      if (this.state === "connected") {
        backupSessionToStorage().catch(() => {});
      }
    }, SESSION_BACKUP_INTERVAL_MS);
  }

  private stopSessionBackup() {
    if (this.sessionBackupTimer) { clearInterval(this.sessionBackupTimer); this.sessionBackupTimer = null; }
  }

  private scheduleReconnect(loggedOut: boolean) {
    if (this.stopped) return;
    if (this.reconnectTimer) return; // already scheduled

    // Use a bounded step from RECONNECT_DELAYS_MS based on consecutive drops.
    // This resets to index 0 (5s) after every successful connection, so a
    // single transient drop always recovers fast.
    const stepIndex = Math.min(this.consecutiveDrops, RECONNECT_DELAYS_MS.length - 1);
    const delay = loggedOut ? 3000 : RECONNECT_DELAYS_MS[stepIndex];

    console.log(`[whatsapp] Reconnecting in ${Math.round(delay / 1000)}s (consecutiveDrops=${this.consecutiveDrops})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.connect().catch((e) => console.error("[whatsapp] Reconnect failed:", e));
    }, delay);
  }

  private notifyDisconnect(reason: string, loggedOut: boolean) {
    const type: WhatsAppEvent["type"] = loggedOut ? "logged_out" : "disconnected";
    const msg = loggedOut
      ? `Logged out / possibly banned (code ${reason})`
      : `Connection dropped (code ${reason}) — reconnecting automatically`;
    console.error(`\n⚠️  WHATSAPP DISCONNECT: ${msg}\n`);
    addEvent(type, msg);
  }

  private async connect() {
    // Guard: don't stack concurrent connect attempts
    if (this.state === "connecting" || this.state === "connected") return;

    this.state = "connecting";
    this.qrBase64 = null;
    this.totalConnectAttempts++;
    this.emit("state", this.state);
    console.log(`[whatsapp] connect() attempt #${this.totalConnectAttempts} (consecutiveDrops=${this.consecutiveDrops})`);

    try {
      if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
      // Only restore from object storage on first start (no local files).
      // On reconnects after a drop the files are still in AUTH_DIR — re-listing
      // storage on every reconnect generates a LIST advanced op each time.
      const hasLocalSession = fs.readdirSync(AUTH_DIR).length > 0;
      if (!hasLocalSession) {
        await restoreSessionFromStorage();
      } else {
        console.log(`[whatsapp] Auth files already present locally — skipping object storage restore`);
      }
    } catch (err: any) {
      this.lastError = `Cannot create auth dir: ${err?.message}`;
      console.error("[whatsapp]", this.lastError);
      this.state = "disconnected";
      this.disconnectedSince = Date.now();
      this.emit("state", this.state);
      this.consecutiveDrops++;
      this.scheduleReconnect(false);
      return;
    }

    // Hard timeout: if connect() hangs, force a retry
    const hardTimeout = setTimeout(() => {
      if (this.state !== "connected") {
        this.lastError = `Connection timed out after 90s on attempt #${this.totalConnectAttempts}`;
        console.warn("[whatsapp]", this.lastError);
        this.sock?.end(undefined);
        this.sock = null;
        this.state = "disconnected";
        this.disconnectedSince = Date.now();
        this.emit("state", this.state);
        this.consecutiveDrops++;
        this.scheduleReconnect(false);
      }
    }, 90000);

    let sock: WASocket;
    try {
      if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

      console.log("[whatsapp] Loading Baileys module…");
      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default ?? (baileys as any);
      const { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = baileys;
      console.log("[whatsapp] Baileys loaded");

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
      } catch {
        console.warn("[whatsapp] fetchLatestBaileysVersion failed — using fallback:", FALLBACK_VERSION);
      }

      console.log("[whatsapp] Creating socket…");
      sock = makeWASocket({
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
        // Ping every 10s to keep the WebSocket alive through Replit's proxy.
        // 15s was leaving gaps — 10s gives a tighter heartbeat.
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: false,
      });

      this.sock = sock;
      console.log("[whatsapp] Socket created — waiting for QR or connection…");

      sock.ev.on("creds.update", async () => {
        await saveCreds();
        // Baileys fires creds.update hundreds of times per session (pre-key
        // refresh, signal-key rotation). Debounce the object storage backup to
        // at most once per CREDS_BACKUP_DEBOUNCE_MS to prevent runaway PUT costs.
        if (this.credsBackupDebounceTimer) clearTimeout(this.credsBackupDebounceTimer);
        this.credsBackupDebounceTimer = setTimeout(() => {
          this.credsBackupDebounceTimer = null;
          backupSessionToStorage().catch(() => {});
        }, CREDS_BACKUP_DEBOUNCE_MS);
      });
    } catch (err: any) {
      clearTimeout(hardTimeout);
      this.lastError = `Socket init failed: ${err?.message ?? String(err)}`;
      console.error("[whatsapp]", this.lastError);
      this.sock = null;
      this.state = "disconnected";
      this.disconnectedSince = Date.now();
      this.emit("state", this.state);
      this.consecutiveDrops++;
      this.scheduleReconnect(false);
      return;
    }

    let wasConnected = false;

    sock.ev.on("connection.update", async (update) => {
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

        // ── KEY FIX: reset consecutive-drop counter on every successful connect ──
        // Previously this was never reset, so backoff grew unboundedly after
        // each drop. Now a single transient drop always recovers in ~5s.
        this.consecutiveDrops = 0;

        this.state = "connected";
        this.qrBase64 = null;
        this.pairingCode = null;
        this.lastError = null;
        this.consecutiveFailures = 0;
        this.alertSentAt = null;
        this.disconnectedSince = null;
        console.log("[whatsapp] Connected and stable");
        addEvent("connected", "WhatsApp connected and stable");
        this.emit("state", this.state);
        this.startSessionBackup();
      }

      if (connection === "close") {
        clearTimeout(hardTimeout);
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = code === 401;

        console.warn(`[whatsapp] Connection closed — code: ${code}, loggedOut: ${loggedOut}`);

        this.stopSessionBackup();
        this.sock = null;
        this.state = "disconnected";
        this.qrBase64 = null;
        this.disconnectedSince = Date.now();
        this.consecutiveDrops++;
        this.emit("state", this.state);

        // Only alert if we were previously connected — skip alerts on first-boot
        // before scan (which always closes with code 515 or similar).
        if (wasConnected) {
          this.notifyDisconnect(String(code), loggedOut);
        }

        if (loggedOut) {
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          clearSessionFromStorage().catch(() => {});
        }

        this.scheduleReconnect(loggedOut);
      }
    });
  }
}

export const whatsappService = new WhatsAppService();
