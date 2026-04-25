import nodemailer from "nodemailer";
import { getUncachableResendClient, isResendReady } from "./resendClient";

function createSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const APP_NAME = "Bareter";
const FALLBACK_FROM = "noreply@bareter.com";

function smtpFromAddress() {
  return process.env.FROM_EMAIL || process.env.SMTP_USER || FALLBACK_FROM;
}

function hasSmtpConfig(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

// Real readiness check: actually verifies a Resend connection with an API key
// is available, or that full SMTP credentials are present.
export async function isEmailConfigured(): Promise<boolean> {
  if (hasSmtpConfig()) return true;
  return await isResendReady();
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

async function sendViaResend(opts: MailOptions): Promise<boolean> {
  const { client, fromEmail } = await getUncachableResendClient();
  const from = `${APP_NAME} <${fromEmail || process.env.FROM_EMAIL || FALLBACK_FROM}>`;
  const result = await client.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  if (result.error) {
    console.error("[EMAIL] Resend error:", result.error);
    return false;
  }
  return true;
}

async function sendViaSmtp(opts: MailOptions): Promise<boolean> {
  const transport = createSmtpTransport();
  if (!transport) return false;
  await transport.sendMail({
    from: `"${APP_NAME}" <${smtpFromAddress()}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return true;
}

async function sendMail(opts: MailOptions): Promise<boolean> {
  let resendAttempted = false;
  if (await isResendReady()) {
    resendAttempted = true;
    try {
      const ok = await sendViaResend(opts);
      if (ok) return true;
    } catch (err) {
      console.error("[EMAIL] Resend send failed:", err);
    }
    // Resend failed — fall through to SMTP if configured.
  }
  if (hasSmtpConfig()) {
    try {
      const ok = await sendViaSmtp(opts);
      if (ok) {
        if (resendAttempted) {
          console.warn("[EMAIL] Delivered via SMTP after Resend failure.");
        }
        return true;
      }
    } catch (err) {
      console.error("[EMAIL] SMTP send failed:", err);
    }
  }
  return false;
}

export async function sendPasswordResetEmail(toEmail: string, resetToken: string, baseUrl: string): Promise<void> {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  const isDev = process.env.NODE_ENV !== "production";

  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Password reset requested for ${toEmail}`);
    if (isDev) {
      console.log(`[EMAIL] Reset URL: ${resetUrl}`);
    }
    console.log(`[EMAIL] To send real emails, connect Resend or set SMTP_HOST/SMTP_USER/SMTP_PASS.`);
    return;
  }

  const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8" /></head>
      <body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-flex; align-items: center; justify-content: center; background: #1a1a2e; border-radius: 12px; width: 52px; height: 52px; margin-bottom: 12px;">
              <span style="color: white; font-size: 24px;">🤝</span>
            </div>
            <h1 style="margin: 0; font-size: 22px; color: #1a1a2e;">${APP_NAME}</h1>
          </div>

          <h2 style="font-size: 18px; color: #1a1a2e; margin-bottom: 8px;">Reset your password</h2>
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
            We received a request to reset your password. Click the button below to create a new one.
            This link expires in <strong>1 hour</strong>.
          </p>

          <a href="${resetUrl}" style="display: block; text-align: center; background: #1a1a2e; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin-bottom: 24px;">
            Reset Password
          </a>

          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
            If you didn't request this, you can safely ignore this email.<br />
            The link will expire in 1 hour.
          </p>

          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
          <p style="color: #d1d5db; font-size: 11px; text-align: center; margin: 0;">
            ${APP_NAME} · UAE Barter Marketplace
          </p>
        </div>
      </body>
      </html>
    `;
  const text = `Reset your ${APP_NAME} password\n\nClick this link to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`;

  const sent = await sendMail({
    to: toEmail,
    subject: `Reset your ${APP_NAME} password`,
    html,
    text,
  });

  if (!sent) {
    if (isDev) {
      console.log(`[EMAIL] Send failed. Dev reset URL for ${toEmail}: ${resetUrl}`);
    } else {
      console.error(`[EMAIL] Password reset email send failed for ${toEmail} (token redacted).`);
    }
  }
}

export async function sendWaitlistWelcomeEmail(
  toEmail: string,
  opts: { name?: string | null; referralCode: string; position: number; baseUrl: string }
): Promise<void> {
  const refUrl = `${opts.baseUrl}/?ref=${opts.referralCode}`;
  const greeting = opts.name ? `Hi ${opts.name},` : "Hi there,";

  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Waitlist confirmation for ${toEmail} (#${opts.position}) — share link: ${refUrl}`);
    return;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-flex; align-items: center; justify-content: center; background: #136c68; border-radius: 12px; width: 52px; height: 52px; margin-bottom: 12px;">
        <span style="color: white; font-size: 24px;">🤝</span>
      </div>
      <h1 style="margin: 0; font-size: 22px; color: #136c68;">${APP_NAME}</h1>
    </div>
    <h2 style="font-size: 20px; color: #111; margin-bottom: 8px;">You're on the list! 🎉</h2>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">
      ${greeting} thanks for joining the ${APP_NAME} waitlist. You're <strong>#${opts.position}</strong> in line, and as an early supporter you'll receive a <strong>Founder Badge</strong> on your profile when ${APP_NAME} launches.
    </p>
    <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 6px; color: #115e59; font-size: 13px; font-weight: 600;">Skip the line</p>
      <p style="margin: 0; color: #134e4a; font-size: 13px; line-height: 1.5;">Every friend who joins through your link moves you up the queue.</p>
      <a href="${refUrl}" style="display: inline-block; margin-top: 10px; color: #136c68; font-weight: 600; text-decoration: none; word-break: break-all; font-size: 13px;">${refUrl}</a>
    </div>
    <a href="${opts.baseUrl}/" style="display: block; text-align: center; background: #136c68; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0 8px;">
      Visit ${APP_NAME}
    </a>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Worldwide Barter Marketplace</p>
  </div>
</body></html>`;
  const text = `${greeting}\n\nYou're on the ${APP_NAME} waitlist — position #${opts.position}.\n\nAs an early supporter you'll get a Founder Badge on your profile at launch.\n\nSkip the line — share your invite link:\n${refUrl}\n\n— ${APP_NAME}`;

  await sendMail({
    to: toEmail,
    subject: `You're on the ${APP_NAME} waitlist`,
    html,
    text,
  });
}

export async function sendDealCompletedEmail(
  toEmail: string,
  opts: { recipientName?: string | null; counterpartyName: string; dealId: string; baseUrl: string },
): Promise<void> {
  const dealUrl = `${opts.baseUrl}/deals/${opts.dealId}`;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";

  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Deal completed for ${toEmail} (deal ${opts.dealId}) — link: ${dealUrl}`);
    return;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 22px; color: #136c68;">${APP_NAME}</h1>
    </div>
    <h2 style="font-size: 20px; color: #111; margin-bottom: 8px;">Your trade is complete 🎉</h2>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">
      ${greeting} your trade with <strong>${opts.counterpartyName}</strong> has been marked complete by both sides.
    </p>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">
      Take a moment to leave a rating — it helps build trust on ${APP_NAME} and improves your reputation as a trader.
    </p>
    <a href="${dealUrl}" style="display: block; text-align: center; background: #136c68; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0 8px;">
      Leave a rating
    </a>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Worldwide Barter Marketplace</p>
  </div>
</body></html>`;
  const text = `${greeting}\n\nYour trade with ${opts.counterpartyName} on ${APP_NAME} is complete.\n\nLeave a rating to help build trust on the platform:\n${dealUrl}\n\n— ${APP_NAME}`;

  await sendMail({
    to: toEmail,
    subject: `Your ${APP_NAME} trade with ${opts.counterpartyName} is complete`,
    html,
    text,
  });
}

/**
 * Send a re-engagement email for the Sales Agent. Caller supplies a
 * pre-rendered HTML body (typically LLM-drafted) and a fallback plain-text
 * version. Returns true if the underlying send succeeded.
 *
 * Centralised here so the agent never imports the Resend SDK directly —
 * retries / fallbacks / readiness checks all stay in one place.
 */
export async function sendReEngagementEmail(
  toEmail: string,
  opts: { subject: string; html: string; text: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Re-engagement skipped for ${toEmail} (email not configured).`);
    return false;
  }
  return sendMail({
    to: toEmail,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

/**
 * Send the weekly dispute-risk PDF report to the founder. The PDF is
 * attached so the founder has an archival copy alongside the WhatsApp
 * text rollup. Subject + preview text mirror the WhatsApp summary so
 * Inbox previews feel familiar.
 *
 * Returns true if the underlying send succeeded; false if email is not
 * configured or if Resend/SMTP both failed (the WhatsApp ping is the
 * primary channel so a failed email is logged but non-fatal).
 */
export async function sendDisputeRiskEmail(
  toEmail: string,
  opts: {
    subject: string;
    previewText: string;
    summaryText: string;
    pdf: Buffer;
    pdfFilename: string;
  },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Dispute-risk email skipped for ${toEmail} (email not configured).`);
    return false;
  }
  // Escape every user-derived value before splicing it into HTML.
  // Subject + previewText can contain report reasons (originally
  // user-supplied), so we escape them too — not just the body.
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const escapedSubject = escapeHtml(opts.subject);
  const escapedPreview = escapeHtml(opts.previewText);
  const escapedSummary = escapeHtml(opts.summaryText);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapedSubject}</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <!-- Hidden preview text — mirrors the WhatsApp summary so the inbox
       preview matches what the founder already saw on their phone. -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${escapedPreview}</div>
  <div style="max-width: 640px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <h1 style="margin: 0 0 16px; font-size: 20px; color: #136c68;">⚖️ Weekly dispute risk</h1>
    <p style="color: #4b5563; font-size: 14px; margin: 0 0 16px;">
      The weekly dispute-risk report is attached as a PDF. The text rollup below mirrors the WhatsApp message you already received.
    </p>
    <pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; color: #111827; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; white-space: pre-wrap; line-height: 1.5;">${escapedSummary}</pre>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Legal Agent · Friday weekly rollup</p>
  </div>
</body>
</html>`;
  const text = `${opts.previewText}\n\n${opts.summaryText}\n\n— ${APP_NAME} Legal Agent`;
  return sendMail({
    to: toEmail,
    subject: opts.subject,
    html,
    text,
    attachments: [
      {
        filename: opts.pdfFilename,
        content: opts.pdf,
        contentType: "application/pdf",
      },
    ],
  });
}

/**
 * Send a critical-severity proactive alert to the founder via email. This is
 * the fallback channel for the Intelligence Agent: WhatsApp (Twilio) is the
 * primary pager, but if Twilio is down / mis-configured / rate-limited the
 * sweep falls back here so a critical alert is never silently buried in the
 * database.
 *
 * Returns true if the underlying send succeeded; false if email is not
 * configured or both Resend and SMTP failed.
 */
export async function sendCriticalAlertEmail(
  toEmail: string,
  opts: {
    title: string;
    body: string;
    alertType: string;
    alertId: string;
  },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(
      `[EMAIL] Critical alert email skipped for ${toEmail} (email not configured).`,
    );
    return false;
  }
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const subject = `🚨 Critical alert: ${opts.title}`;
  const escapedTitle = escapeHtml(opts.title);
  const escapedBody = escapeHtml(opts.body);
  const escapedType = escapeHtml(opts.alertType);
  const shortId = (opts.alertId || "").slice(0, 8);
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <p style="margin: 0 0 8px; color: #b91c1c; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;">🚨 Critical · ${escapedType}</p>
    <h1 style="margin: 0 0 12px; font-size: 20px; color: #1a1a2e;">${escapedTitle}</h1>
    <p style="color: #374151; font-size: 14px; line-height: 1.55; white-space: pre-wrap; margin: 0 0 20px;">${escapedBody}</p>
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 14px; color: #7f1d1d; font-size: 13px;">
      WhatsApp delivery failed for this alert, so it was sent via email as a fallback. Ack with <code>ack ${escapeHtml(shortId)}</code> in WhatsApp once Twilio is healthy again.
    </div>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Intelligence Agent · alert ${escapeHtml(shortId)}</p>
  </div>
</body>
</html>`;
  const text = `🚨 CRITICAL ALERT (${opts.alertType})\n\n${opts.title}\n\n${opts.body}\n\nWhatsApp delivery failed — this alert was sent via email as a fallback.\nAck with: ack ${shortId}\n\n— ${APP_NAME} Intelligence Agent`;
  return sendMail({
    to: toEmail,
    subject,
    html,
    text,
  });
}

export async function sendWelcomeEmail(toEmail: string, fullName: string): Promise<void> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Welcome email for ${toEmail} (email not configured — skipping)`);
    return;
  }

  const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8" /></head>
      <body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="margin: 0; font-size: 22px; color: #1a1a2e;">${APP_NAME}</h1>
          </div>
          <h2 style="font-size: 18px; color: #1a1a2e; margin-bottom: 8px;">Welcome, ${fullName}!</h2>
          <p style="color: #6b7280; font-size: 14px;">
            Your account is ready. Start browsing listings and connect with UAE businesses to trade your products and services.
          </p>
          <a href="https://bareter.com/browse" style="display: block; text-align: center; background: #1a1a2e; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0;">
            Explore Listings
          </a>
          <p style="color: #d1d5db; font-size: 11px; text-align: center; margin: 0;">
            ${APP_NAME} · UAE Barter Marketplace
          </p>
        </div>
      </body>
      </html>
    `;
  const text = `Welcome to ${APP_NAME}, ${fullName}! Your account is ready. Start browsing at https://bareter.com/browse`;

  await sendMail({
    to: toEmail,
    subject: `Welcome to ${APP_NAME}!`,
    html,
    text,
  });
}
