import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as QRCode from "qrcode";
import * as path from "path";
import * as fs from "fs";
import { EventEmitter } from "events";
import P from "pino";

const AUTH_DIR = path.join(process.cwd(), "whatsapp-auth");
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

  // Consecutive OTP failure tracking
  private consecutiveFailures = 0;
  private alertSentAt: number | null = null;

  getState(): ConnectionState {
    return this.state;
  }

  getQR(): string | null {
    return this.qrBase64;
  }

  isReady(): boolean {
    return this.state === "connected";
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
    this.emit("state", this.state);

    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: () => false,
    });

    this.sock.ev.on("creds.update", saveCreds);

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
        wasConnected = true;
        this.state = "connected";
        this.qrBase64 = null;
        this.consecutiveFailures = 0;
        this.alertSentAt = null;
        console.log("[whatsapp] Connected");
        this.emit("state", this.state);
      }

      if (connection === "close") {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;

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
