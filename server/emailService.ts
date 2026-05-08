import nodemailer from "nodemailer";
import { getUncachableResendClient, isResendReady } from "./resendClient";
import { storage } from "./storage";

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

async function getCustomTemplate(key: string): Promise<string | null> {
  try {
    const val = await storage.getAppSetting(key);
    return val && val.trim() ? val : null;
  } catch {
    return null;
  }
}

export function applyTemplateVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

export function renderBroadcastEmailHtml(opts: {
  recipientName?: string | null;
  body: string;
  vars?: Record<string, string>;
}): string {
  const substituted = opts.vars ? applyTemplateVars(opts.body, opts.vars) : opts.body;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const escapedBody = substituted
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 22px; color: #136c68;">${APP_NAME}</h1>
    </div>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">${greeting}</p>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">${escapedBody}</p>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Worldwide Barter Marketplace</p>
  </div>
</body></html>`;
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

  const customTemplate = await getCustomTemplate("email_template_password_reset");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { resetUrl, appName: APP_NAME, baseUrl })
    : `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8" /></head>
      <body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${baseUrl}/logo-icon.png" alt="${APP_NAME}" width="52" height="52" style="display: inline-block; width: 52px; height: 52px; border-radius: 12px; margin-bottom: 12px; border: 0;" />
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
      <a href="${opts.baseUrl}/" style="text-decoration: none;">
        <img src="${opts.baseUrl}/logo-full-color.png" alt="${APP_NAME}" width="160" height="auto" style="display: inline-block; max-width: 160px; height: auto; border: 0;" />
      </a>
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

  const customTemplate = await getCustomTemplate("email_template_deal_completed");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, counterpartyName: opts.counterpartyName, dealUrl, appName: APP_NAME })
    : `<!DOCTYPE html>
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

export async function sendAdminEmail(
  toEmail: string,
  opts: { recipientName?: string | null; subject: string; body: string; vars?: Record<string, string> },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Admin email to ${toEmail} skipped (email not configured). Subject: ${opts.subject}`);
    return false;
  }
  const html = renderBroadcastEmailHtml({ recipientName: opts.recipientName, body: opts.body, vars: opts.vars });
  const substitutedBody = opts.vars ? applyTemplateVars(opts.body, opts.vars) : opts.body;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const text = `${greeting}\n\n${substitutedBody}\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: opts.subject, html, text });
}

export async function sendListingRejectionEmail(
  toEmail: string,
  opts: { recipientName?: string | null; listingTitle: string; reason: string; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Listing rejection email to ${toEmail} skipped (email not configured). Listing: ${opts.listingTitle}`);
    return false;
  }
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const escapedTitle = opts.listingTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedReason = opts.reason.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />");
  const customTemplate = await getCustomTemplate("email_template_listing_rejected");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, listingTitle: escapedTitle, reason: escapedReason, appName: APP_NAME, baseUrl: opts.baseUrl })
    : `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 22px; color: #136c68;">${APP_NAME}</h1>
    </div>
    <h2 style="font-size: 18px; color: #1a1a2e; margin-bottom: 8px;">Listing Not Approved</h2>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">
      ${greeting} your listing <strong>"${escapedTitle}"</strong> was reviewed by our moderation team and could not be approved at this time.
    </p>
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; margin: 16px 0;">
      <p style="margin: 0 0 4px; color: #991b1b; font-size: 13px; font-weight: 600;">Reason</p>
      <p style="margin: 0; color: #7f1d1d; font-size: 13px; line-height: 1.5;">${escapedReason}</p>
    </div>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">
      You can update your listing and resubmit it for review. If you believe this was a mistake, please contact our support team.
    </p>
    <a href="${opts.baseUrl}/my-listings" style="display: block; text-align: center; background: #136c68; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0 8px;">
      View My Listings
    </a>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Worldwide Barter Marketplace</p>
  </div>
</body></html>`;
  const text = `${greeting}\n\nYour listing "${opts.listingTitle}" was reviewed and could not be approved.\n\nReason: ${opts.reason}\n\nYou can update your listing and resubmit it for review.\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Listing Not Approved: ${opts.listingTitle}`, html, text });
}

export async function sendWaitlistLaunchEmail(
  toEmail: string,
  opts: { name?: string | null; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Launch email skipped for ${toEmail} (email not configured).`);
    return false;
  }
  const greeting = opts.name ? `Hi ${opts.name},` : "Hi there,";
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${opts.baseUrl}/" style="text-decoration: none;">
        <img src="${opts.baseUrl}/logo-full-color.png" alt="${APP_NAME}" width="160" height="auto" style="display: inline-block; max-width: 160px; height: auto; border: 0;" />
      </a>
    </div>
    <h2 style="font-size: 22px; color: #111; margin-bottom: 8px;">We're live! 🚀</h2>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">
      ${greeting} the wait is over — <strong>${APP_NAME}</strong> is now open for business! As an early supporter, you've earned a <strong>Founder Badge</strong> on your profile.
    </p>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">
      Create your account now and start bartering with verified businesses across the UAE.
    </p>
    <a href="${opts.baseUrl}/register?email=${encodeURIComponent(toEmail)}" style="display: block; text-align: center; background: #136c68; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0 8px;">
      Create Your Account
    </a>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Worldwide Barter Marketplace</p>
  </div>
</body></html>`;
  const text = `${greeting}\n\nThe wait is over — ${APP_NAME} is now open for business!\n\nAs an early supporter, you've earned a Founder Badge on your profile.\n\nCreate your account: ${opts.baseUrl}/register?email=${encodeURIComponent(toEmail)}\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `${APP_NAME} is live — claim your Founder Badge!`, html, text });
}

export async function sendSupportTicketConfirmationEmail(
  toEmail: string,
  opts: { recipientName?: string | null; ticketNumber: string; subject: string; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 22px; color: #136c68;">${APP_NAME}</h1>
    </div>
    <h2 style="font-size: 18px; color: #1a1a2e; margin-bottom: 8px;">Support Ticket Created</h2>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">${greeting} we've received your support request and a ticket has been created.</p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin: 16px 0;">
      <p style="margin: 0 0 4px; color: #166534; font-size: 13px; font-weight: 600;">Ticket Reference</p>
      <p style="margin: 0; color: #15803d; font-size: 15px; font-weight: 700;">${opts.ticketNumber}</p>
      <p style="margin: 4px 0 0; color: #374151; font-size: 13px;">${opts.subject}</p>
    </div>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">Our team will review your request and respond as soon as possible. You'll receive an email when we reply.</p>
    <a href="${opts.baseUrl}/support" style="display: block; text-align: center; background: #136c68; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0 8px;">View Ticket</a>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Support</p>
  </div>
</body></html>`;
  const text = `${greeting} your support ticket ${opts.ticketNumber} has been created: ${opts.subject}. We'll reply soon.\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `[${opts.ticketNumber}] Support Ticket Created: ${opts.subject}`, html, text });
}

export async function sendSupportReplyEmail(
  toEmail: string,
  opts: { recipientName?: string | null; ticketNumber: string; subject: string; replyContent: string; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const safeReply = opts.replyContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />");
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 22px; color: #136c68;">${APP_NAME}</h1>
    </div>
    <h2 style="font-size: 18px; color: #1a1a2e; margin-bottom: 4px;">New Reply on Your Support Ticket</h2>
    <p style="color: #6b7280; font-size: 13px; margin: 0 0 16px;">${opts.ticketNumber} — ${opts.subject}</p>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">${greeting} our support team has replied to your ticket:</p>
    <div style="background: #f9fafb; border-left: 4px solid #136c68; border-radius: 0 8px 8px 0; padding: 14px; margin: 16px 0;">
      <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">${safeReply}</p>
    </div>
    <a href="${opts.baseUrl}/support" style="display: block; text-align: center; background: #136c68; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0 8px;">Reply to Ticket</a>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Support</p>
  </div>
</body></html>`;
  const text = `${greeting} a support agent replied to ticket ${opts.ticketNumber}:\n\n${opts.replyContent}\n\nView ticket: ${opts.baseUrl}/support\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `[${opts.ticketNumber}] New Reply: ${opts.subject}`, html, text });
}

export async function sendSupportEscalationEmail(
  toEmail: string,
  opts: { adminName?: string; ticketNumber: string; subject: string; userName: string; userEmail: string; baseUrl: string; transcript?: Array<{ senderType: string; content: string }> },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.adminName ? `Hi ${opts.adminName},` : "Hi Admin,";

  const transcriptHtml = opts.transcript && opts.transcript.length > 0
    ? `<div style="margin: 16px 0;">
        <p style="margin: 0 0 8px; color: #374151; font-size: 13px; font-weight: 600;">Conversation Summary</p>
        ${opts.transcript.map(m => {
          const label = m.senderType === "user" ? opts.userName : m.senderType === "ai" ? "BarterBot" : "Admin";
          const bg = m.senderType === "user" ? "#f9fafb" : "#f0fdf4";
          const safeContent = m.content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br/>");
          return `<div style="background:${bg};border-radius:6px;padding:10px;margin-bottom:6px;"><p style="margin:0 0 2px;font-size:11px;color:#6b7280;font-weight:600;">${label}</p><p style="margin:0;font-size:13px;color:#374151;">${safeContent}</p></div>`;
        }).join("")}
      </div>`
    : "";

  const transcriptText = opts.transcript && opts.transcript.length > 0
    ? `\n\nConversation:\n${opts.transcript.map(m => {
        const label = m.senderType === "user" ? opts.userName : m.senderType === "ai" ? "BarterBot" : "Admin";
        return `[${label}]: ${m.content}`;
      }).join("\n\n")}`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 22px; color: #136c68;">${APP_NAME}</h1>
    </div>
    <h2 style="font-size: 18px; color: #1a1a2e; margin-bottom: 8px;">Support Ticket Escalated</h2>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">${greeting} a support ticket has been escalated and requires human attention.</p>
    <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 14px; margin: 16px 0;">
      <p style="margin: 0 0 4px; color: #92400e; font-size: 13px; font-weight: 600;">${opts.ticketNumber}</p>
      <p style="margin: 0 0 4px; color: #78350f; font-size: 14px; font-weight: 700;">${opts.subject}</p>
      <p style="margin: 0; color: #92400e; font-size: 13px;">From: ${opts.userName} (${opts.userEmail})</p>
    </div>
    ${transcriptHtml}
    <a href="${opts.baseUrl}/admin" style="display: block; text-align: center; background: #136c68; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0 8px;">Review in Admin Panel</a>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Admin Notification</p>
  </div>
</body></html>`;
  const text = `${greeting}\n\nTicket ${opts.ticketNumber} has been escalated.\nSubject: ${opts.subject}\nUser: ${opts.userName} (${opts.userEmail})${transcriptText}\n\nReview: ${opts.baseUrl}/admin\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `[ESCALATED] ${opts.ticketNumber}: ${opts.subject}`, html, text });
}

export async function sendTicketClosedEmail(
  toEmail: string,
  opts: { recipientName?: string | null; ticketNumber: string; subject: string; baseUrl: string; transcript?: Array<{ senderType: string; senderName: string; content: string }> },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";

  const transcriptHtml = opts.transcript && opts.transcript.length > 0
    ? `<div style="margin: 16px 0;">
        <p style="margin: 0 0 8px; color: #374151; font-size: 13px; font-weight: 600;">Conversation Transcript</p>
        ${opts.transcript.map(m => {
          const isUser = m.senderType === "user";
          const bg = isUser ? "#f9fafb" : "#f0fdf4";
          const safeContent = m.content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br/>");
          return `<div style="background:${bg};border-radius:6px;padding:10px;margin-bottom:6px;"><p style="margin:0 0 2px;font-size:11px;color:#6b7280;font-weight:600;">${m.senderName}</p><p style="margin:0;font-size:13px;color:#374151;">${safeContent}</p></div>`;
        }).join("")}
      </div>`
    : "";

  const transcriptText = opts.transcript && opts.transcript.length > 0
    ? `\n\nConversation Transcript:\n${opts.transcript.map(m => `[${m.senderName}]: ${m.content}`).join("\n\n")}`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 22px; color: #136c68;">${APP_NAME}</h1>
    </div>
    <h2 style="font-size: 18px; color: #1a1a2e; margin-bottom: 8px;">Ticket Resolved</h2>
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">${greeting} your support ticket has been resolved and closed.</p>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin: 16px 0;">
      <p style="margin: 0 0 4px; color: #166534; font-size: 13px; font-weight: 600;">${opts.ticketNumber}</p>
      <p style="margin: 0; color: #374151; font-size: 14px;">${opts.subject}</p>
    </div>
    ${transcriptHtml}
    <p style="color: #4b5563; font-size: 14px; line-height: 1.55;">If you have any further questions, feel free to open a new ticket. We're always here to help.</p>
    <a href="${opts.baseUrl}/support" style="display: block; text-align: center; background: #136c68; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0 8px;">Open New Ticket</a>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · Support</p>
  </div>
</body></html>`;
  const text = `${greeting} your support ticket ${opts.ticketNumber} has been resolved and closed.${transcriptText}\n\nIf you need more help, open a new ticket at ${opts.baseUrl}/support\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `[${opts.ticketNumber}] Ticket Resolved`, html, text });
}

export async function sendWelcomeEmail(toEmail: string, fullName: string): Promise<void> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Welcome email for ${toEmail} (email not configured — skipping)`);
    return;
  }

  const customTemplate = await getCustomTemplate("email_template_welcome");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { fullName, appName: APP_NAME, email: toEmail })
    : `
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
