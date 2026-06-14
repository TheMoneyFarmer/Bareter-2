import nodemailer from "nodemailer";
import { getUncachableResendClient, isResendReady } from "./resendClient";
import { storage } from "./storage";
import { db } from "./db";
import { emailLogs } from "@shared/schema";

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
  templateKey?: string;
  userId?: string;
}

async function sendViaResend(opts: MailOptions): Promise<{ ok: boolean; messageId?: string }> {
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
    return { ok: false };
  }
  return { ok: true, messageId: (result.data as any)?.id };
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

async function logEmailAttempt(opts: {
  to: string;
  subject: string;
  status: "sent" | "failed";
  source: "transactional" | "broadcast" | "test";
  templateKey?: string;
  userId?: string;
  resendMessageId?: string;
  errorMessage?: string;
}) {
  try {
    await db.insert(emailLogs).values({
      recipientEmail: opts.to,
      subject: opts.subject,
      status: opts.status,
      source: opts.source,
      templateKey: opts.templateKey ?? null,
      userId: opts.userId ?? null,
      resendMessageId: opts.resendMessageId ?? null,
      errorMessage: opts.errorMessage ?? null,
    });
  } catch (logErr) {
    console.error("[EMAIL] Failed to write to email_logs:", logErr);
  }
}

async function sendMail(opts: MailOptions): Promise<boolean> {
  console.log(`[EMAIL] Attempting ${opts.templateKey ?? "unknown"} → ${opts.to} | "${opts.subject}"`);
  let resendAttempted = false;
  if (await isResendReady()) {
    resendAttempted = true;
    try {
      const { ok, messageId } = await sendViaResend(opts);
      if (ok) {
        console.log(`[EMAIL] ✓ Resend OK ${opts.templateKey ?? ""} → ${opts.to} | msgId=${messageId ?? "?"}`);
        await logEmailAttempt({ to: opts.to, subject: opts.subject, status: "sent", source: "transactional", templateKey: opts.templateKey, userId: opts.userId, resendMessageId: messageId });
        return true;
      }
      await logEmailAttempt({ to: opts.to, subject: opts.subject, status: "failed", source: "transactional", templateKey: opts.templateKey, userId: opts.userId, errorMessage: "Resend returned error" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[EMAIL] Resend send failed:", err);
      await logEmailAttempt({ to: opts.to, subject: opts.subject, status: "failed", source: "transactional", templateKey: opts.templateKey, userId: opts.userId, errorMessage: `Resend exception: ${msg}` });
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
        await logEmailAttempt({ to: opts.to, subject: opts.subject, status: "sent", source: "transactional", templateKey: opts.templateKey, userId: opts.userId });
        return true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[EMAIL] SMTP send failed:", err);
      await logEmailAttempt({ to: opts.to, subject: opts.subject, status: "failed", source: "transactional", templateKey: opts.templateKey, userId: opts.userId, errorMessage: `SMTP exception: ${msg}` });
    }
  }
  if (!resendAttempted && !hasSmtpConfig()) {
    console.error(`[EMAIL] ✗ No mail provider configured — dropped ${opts.templateKey ?? ""} → ${opts.to}`);
    await logEmailAttempt({ to: opts.to, subject: opts.subject, status: "failed", source: "transactional", templateKey: opts.templateKey, userId: opts.userId, errorMessage: "No mail provider configured" });
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

function emailShell(content: string, opts?: { rtl?: boolean }): string {
  const dir = opts?.rtl ? "rtl" : "ltr";
  const align = opts?.rtl ? "right" : "left";
  const year = new Date().getFullYear();
  const BASE_URL = process.env.PUBLIC_APP_URL || "https://bareter.com";
  return `<!DOCTYPE html>
<html lang="${opts?.rtl ? "ar" : "en"}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f2f5;min-height:100%;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="background:#0f5f5a;border-radius:12px 12px 0 0;padding:22px 32px;text-align:center;">
            <a href="${BASE_URL}" style="text-decoration:none;">
              <span style="font-size:28px;font-weight:900;letter-spacing:0.14em;color:#ffffff;font-family:Arial,sans-serif;">${APP_NAME.toUpperCase()}</span>
            </a>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:36px 32px 28px;text-align:${align};">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="background:#1a2035;border-radius:0 0 12px 12px;padding:24px 28px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding-bottom:18px;">
                  <a href="https://www.instagram.com/bareterapp" target="_blank" style="display:inline-block;width:34px;height:34px;line-height:34px;background:rgba(255,255,255,0.1);border-radius:50%;text-align:center;color:#ffffff;text-decoration:none;font-size:11px;font-weight:700;margin:0 4px;font-family:Arial,sans-serif;">IG</a>
                  <a href="https://www.linkedin.com/company/bareter" target="_blank" style="display:inline-block;width:34px;height:34px;line-height:34px;background:rgba(255,255,255,0.1);border-radius:50%;text-align:center;color:#ffffff;text-decoration:none;font-size:11px;font-weight:700;margin:0 4px;font-family:Arial,sans-serif;">in</a>
                  <a href="https://x.com/bareterapp" target="_blank" style="display:inline-block;width:34px;height:34px;line-height:34px;background:rgba(255,255,255,0.1);border-radius:50%;text-align:center;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;margin:0 4px;font-family:Arial,sans-serif;">X</a>
                  <a href="https://www.tiktok.com/@bareter" target="_blank" style="display:inline-block;width:34px;height:34px;line-height:34px;background:rgba(255,255,255,0.1);border-radius:50%;text-align:center;color:#ffffff;text-decoration:none;font-size:11px;font-weight:700;margin:0 4px;font-family:Arial,sans-serif;">TT</a>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:8px;">
                  <span style="color:#9ca3af;font-size:12px;">Need help? </span><a href="mailto:hello@bareter.com" style="color:#34d399;font-size:12px;text-decoration:none;">hello@bareter.com</a>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:14px;">
                  <span style="color:#6b7280;font-size:11px;">Dubai, United Arab Emirates</span>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:10px;">
                  <a href="${BASE_URL}/privacy" style="color:#6b7280;font-size:11px;text-decoration:none;">Privacy Policy</a>
                  <span style="color:#4b5563;font-size:11px;"> &nbsp;&middot;&nbsp; </span>
                  <a href="${BASE_URL}/terms" style="color:#6b7280;font-size:11px;text-decoration:none;">Terms of Service</a>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:8px;">
                  <span style="color:#4b5563;font-size:11px;">&copy; ${year} ${APP_NAME}. All rights reserved.</span>
                </td>
              </tr>
              <tr>
                <td align="center">
                  <span style="color:#374151;font-size:10px;">This is an automated message &mdash; please do not reply to this email directly.</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
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
  return emailShell(`
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 12px;">${greeting}</p>
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0;">${escapedBody}</p>
  `);
}

export async function sendPasswordChangeOtpEmail(toEmail: string, otp: string, fullName?: string | null): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Password change OTP for ${toEmail}: ${otp}`);
    return false;
  }
  const greeting = fullName ? `Hi ${fullName},` : "Hi there,";
  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Password change request</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 22px;">${greeting} use the code below to confirm your password change. It expires in <strong>15 minutes</strong>.</p>
    <div style="background:#f0fdfa;border:1.5px solid #99f6e4;border-radius:12px;padding:28px 24px;text-align:center;margin:0 0 22px;">
      <p style="margin:0 0 10px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Verification Code</p>
      <p style="margin:0;font-size:44px;font-weight:700;letter-spacing:0.3em;color:#0f5f5a;font-family:'Courier New',Courier,monospace;">${otp}</p>
      <p style="margin:12px 0 0;color:#64748b;font-size:12px;">Valid for <strong>15 minutes</strong> &nbsp;&middot;&nbsp; Do not share this code</p>
    </div>
    <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0;text-align:center;">If you did not request this change, your password has not been changed. Contact <a href="mailto:hello@bareter.com" style="color:#136c68;text-decoration:none;">hello@bareter.com</a> if you have concerns.</p>
  `);
  const text = `${greeting}\n\nYour ${APP_NAME} password change verification code is: ${otp}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, your password has not been changed.`;
  return sendMail({ to: toEmail, subject: `Your ${APP_NAME} password change code`, html, text });
}

export async function sendPasswordChangedNotificationEmail(toEmail: string, fullName?: string | null): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Password changed notification for ${toEmail}`);
    return false;
  }
  const greeting = fullName ? `Hi ${fullName},` : "Hi there,";
  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Password changed successfully</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${greeting} your ${APP_NAME} account password was just changed.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:0 0 18px;">
      <p style="margin:0;color:#166534;font-size:13px;line-height:1.5;">Password updated successfully. All other active sessions have been signed out for your security.</p>
    </div>
    <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0;">If you did not make this change, <a href="mailto:hello@bareter.com" style="color:#136c68;text-decoration:none;">contact support immediately</a>.</p>
  `);
  const text = `${greeting}\n\nYour ${APP_NAME} account password was just changed successfully. All other active sessions have been signed out.\n\nIf you did not make this change, contact support immediately at hello@bareter.com.\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Your ${APP_NAME} password has been changed`, html, text });
}

export async function sendEmailVerificationEmail(toEmail: string, opts: { fullName?: string | null; verifyUrl: string }): Promise<boolean> {
  const greeting = opts.fullName ? `Hi ${opts.fullName},` : "Hi there,";
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Email verification for ${toEmail}: ${opts.verifyUrl}`);
    return false;
  }
  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Confirm your email address</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">${greeting} click the button below to verify your ${APP_NAME} account. This link expires in <strong>24 hours</strong>.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${opts.verifyUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Verify my email</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0 0 6px;">Or paste this link in your browser:</p>
    <p style="text-align:center;margin:0 0 18px;"><a href="${opts.verifyUrl}" style="color:#136c68;font-size:11px;word-break:break-all;">${opts.verifyUrl}</a></p>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">If you did not create a ${APP_NAME} account, you can safely ignore this email.</p>
  `);
  const text = `${greeting}\n\nVerify your ${APP_NAME} account by visiting:\n${opts.verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you did not create an account, ignore this email.\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Verify your ${APP_NAME} email`, html, text });
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
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Reset your password</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">We received a request to reset your ${APP_NAME} password. Click below to create a new one. This link expires in <strong>1 hour</strong>.</p>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${resetUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Reset Password</a>
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">If you didn't request this, you can safely ignore this email. The link will expire in 1 hour.</p>
    `);
  const text = `Reset your ${APP_NAME} password\n\nClick this link to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`;

  const sent = await sendMail({
    to: toEmail,
    subject: `Reset your ${APP_NAME} password`,
    html,
    text,
    templateKey: "email_template_password_reset",
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

  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">You're on the list!</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${greeting} thanks for joining the ${APP_NAME} waitlist. You're <strong>#${opts.position}</strong> in line, and as an early supporter you'll receive a <strong>Founder Badge</strong> on your profile when ${APP_NAME} launches.</p>
    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:16px;margin:0 0 20px;">
      <p style="margin:0 0 6px;color:#115e59;font-size:13px;font-weight:700;">Skip the line</p>
      <p style="margin:0 0 8px;color:#134e4a;font-size:13px;line-height:1.5;">Every friend who joins through your link moves you up the queue.</p>
      <a href="${refUrl}" style="color:#136c68;font-weight:600;text-decoration:none;font-size:13px;word-break:break-all;">${refUrl}</a>
    </div>
    <div style="text-align:center;">
      <a href="${opts.baseUrl}/" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Visit ${APP_NAME}</a>
    </div>
  `);
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
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Your trade is complete!</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">${greeting} your trade with <strong>${opts.counterpartyName}</strong> has been marked complete by both sides.</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">Take a moment to leave a rating — it helps build trust on ${APP_NAME} and strengthens your reputation as a trader.</p>
      <div style="text-align:center;">
        <a href="${dealUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Leave a Rating</a>
      </div>
    `);
  const text = `${greeting}\n\nYour trade with ${opts.counterpartyName} on ${APP_NAME} is complete.\n\nLeave a rating to help build trust on the platform:\n${dealUrl}\n\n— ${APP_NAME}`;

  await sendMail({
    to: toEmail,
    subject: `Your ${APP_NAME} trade with ${opts.counterpartyName} is complete`,
    html,
    text,
    templateKey: "email_template_deal_completed",
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
    templateKey: "email_template_re_engagement",
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
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Listing Not Approved</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${greeting} your listing <strong>"${escapedTitle}"</strong> was reviewed by our moderation team and could not be approved at this time.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 4px;color:#991b1b;font-size:13px;font-weight:700;">Reason</p>
        <p style="margin:0;color:#7f1d1d;font-size:13px;line-height:1.5;">${escapedReason}</p>
      </div>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">You can update your listing and resubmit it for review. If you believe this was a mistake, contact our support team.</p>
      <div style="text-align:center;">
        <a href="${opts.baseUrl}/my-listings" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">View My Listings</a>
      </div>
    `);
  const text = `${greeting}\n\nYour listing "${opts.listingTitle}" was reviewed and could not be approved.\n\nReason: ${opts.reason}\n\nYou can update your listing and resubmit it for review.\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Listing Not Approved: ${opts.listingTitle}`, html, text, templateKey: "email_template_listing_rejected" });
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
  const html = emailShell(`
    <h2 style="font-size:21px;font-weight:700;color:#1a2035;margin:0 0 12px;">We're live!</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">${greeting} the wait is over — <strong>${APP_NAME}</strong> is now open for business!</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">As an early supporter, you've earned a <strong>Founder Badge</strong> on your profile. Create your account now and start bartering with verified businesses worldwide.</p>
    <div style="text-align:center;margin:0 0 4px;">
      <a href="${opts.baseUrl}/register?email=${encodeURIComponent(toEmail)}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Create Your Account</a>
    </div>
  `);
  const text = `${greeting}\n\nThe wait is over — ${APP_NAME} is now open for business!\n\nAs an early supporter, you've earned a Founder Badge on your profile.\n\nCreate your account: ${opts.baseUrl}/register?email=${encodeURIComponent(toEmail)}\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `${APP_NAME} is live — claim your Founder Badge!`, html, text });
}

export async function sendSupportTicketConfirmationEmail(
  toEmail: string,
  opts: { recipientName?: string | null; ticketNumber: string; subject: string; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Support Ticket Created</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${greeting} we've received your support request and a ticket has been created.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 4px;color:#166534;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Ticket Reference</p>
      <p style="margin:0 0 2px;color:#15803d;font-size:16px;font-weight:700;">${opts.ticketNumber}</p>
      <p style="margin:0;color:#374151;font-size:13px;">${opts.subject}</p>
    </div>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">Our team will review your request and respond as soon as possible. You'll receive an email when we reply.</p>
    <div style="text-align:center;">
      <a href="${opts.baseUrl}/help" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">View Support &amp; Help</a>
    </div>
  `);
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
  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 4px;">New Reply on Your Support Ticket</h2>
    <p style="color:#6b7280;font-size:13px;margin:0 0 16px;">${opts.ticketNumber} &mdash; ${opts.subject}</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">${greeting} our support team has replied to your ticket:</p>
    <div style="background:#f9fafb;border-left:4px solid #0f5f5a;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 24px;">
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${safeReply}</p>
    </div>
    <div style="text-align:center;">
      <a href="${opts.baseUrl}/help" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">View Support &amp; Help</a>
    </div>
  `);
  const text = `${greeting} a support agent replied to ticket ${opts.ticketNumber}:\n\n${opts.replyContent}\n\nVisit help & support: ${opts.baseUrl}/help\n\n— ${APP_NAME}`;
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

  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Support Ticket Escalated</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${greeting} a support ticket has been escalated and requires human attention.</p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 2px;color:#92400e;font-size:13px;font-weight:700;">${opts.ticketNumber}</p>
      <p style="margin:0 0 4px;color:#78350f;font-size:15px;font-weight:700;">${opts.subject}</p>
      <p style="margin:0;color:#92400e;font-size:13px;">From: ${opts.userName} (${opts.userEmail})</p>
    </div>
    ${transcriptHtml}
    <div style="text-align:center;margin-top:24px;">
      <a href="${opts.baseUrl}/admin" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Review in Admin Panel</a>
    </div>
  `);
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

  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Ticket Resolved</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${greeting} your support ticket has been resolved and closed.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin:0 0 16px;">
      <p style="margin:0 0 2px;color:#166534;font-size:13px;font-weight:700;">${opts.ticketNumber}</p>
      <p style="margin:0;color:#374151;font-size:14px;">${opts.subject}</p>
    </div>
    ${transcriptHtml}
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:16px 0 24px;">If you have any further questions, feel free to open a new ticket. We're always here to help.</p>
    <div style="text-align:center;">
      <a href="${opts.baseUrl}/help" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Visit Help Centre</a>
    </div>
  `);
  const text = `${greeting} your support ticket ${opts.ticketNumber} has been resolved and closed.${transcriptText}\n\nIf you need more help, visit ${opts.baseUrl}/help\n\n— ${APP_NAME}`;
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
    : emailShell(`
      <h2 style="font-size:21px;font-weight:700;color:#1a2035;margin:0 0 12px;">Welcome to ${APP_NAME}, ${fullName}!</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 20px;">Your account is ready. Start browsing listings and connect with businesses worldwide to trade your products and services.</p>
      <div style="text-align:center;margin:0 0 4px;">
        <a href="https://bareter.com/browse" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Explore Listings</a>
      </div>
    `);
  const text = `Welcome to ${APP_NAME}, ${fullName}! Your account is ready. Start browsing at https://bareter.com/browse`;

  await sendMail({
    to: toEmail,
    subject: `Welcome to ${APP_NAME}!`,
    html,
    text,
    templateKey: "email_template_welcome",
  });
}

// ─── Verification Outcome Emails ─────────────────────────────────────────────

export async function sendVerificationApprovedEmail(
  toEmail: string,
  opts: { fullName?: string | null; accountType?: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Verification approved email to ${toEmail} skipped (email not configured)`);
    return false;
  }
  const greeting = opts.fullName ? `Hi ${opts.fullName},` : "Hi there,";
  const verType = opts.accountType === "business" ? "Business (KYB)" : "Identity (KYC)";
  const baseUrl = process.env.PUBLIC_APP_URL || "https://bareter.com";
  const customTemplate = await getCustomTemplate("email_template_verification_approved");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, fullName: opts.fullName || "there", appName: APP_NAME, baseUrl })
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#065f46;margin:0 0 10px;">Verification Approved!</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">${greeting}</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 18px;">Congratulations — your <strong>${verType}</strong> verification has been <strong>approved</strong>. Your account is now fully verified and you can start creating listings, accepting barter deals, and trading on ${APP_NAME}.</p>
      <div style="text-align:center;">
        <a href="${baseUrl}/browse" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Start Bartering</a>
      </div>
    `);
  const text = `${greeting}\n\nCongratulations! Your ${verType} verification has been approved. You can now start bartering on ${APP_NAME}.\n\nVisit ${baseUrl}/browse to get started.\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Verification Approved — Welcome to ${APP_NAME}!`, html, text, templateKey: "email_template_verification_approved" });
}

export async function sendVerificationDeclinedEmail(
  toEmail: string,
  opts: { fullName?: string | null; accountType?: string; reason?: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Verification declined email to ${toEmail} skipped (email not configured)`);
    return false;
  }
  const greeting = opts.fullName ? `Hi ${opts.fullName},` : "Hi there,";
  const verType = opts.accountType === "business" ? "Business (KYB)" : "Identity (KYC)";
  const reasonHtml = opts.reason
    ? `<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; margin: 16px 0;"><p style="margin: 0 0 4px; color: #991b1b; font-size: 13px; font-weight: 600;">Reason</p><p style="margin: 0; color: #7f1d1d; font-size: 13px;">${opts.reason}</p></div>`
    : "";
  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#991b1b;margin:0 0 10px;">Verification Not Approved</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 12px;">${greeting}</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">Unfortunately, your <strong>${verType}</strong> verification was not approved. This can happen if documents were unclear, expired, or did not match our requirements.</p>
    ${reasonHtml}
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:16px 0 24px;">You can try again by visiting your profile and restarting the verification process. If you believe this is an error, please contact <a href="mailto:hello@bareter.com" style="color:#136c68;text-decoration:none;">hello@bareter.com</a>.</p>
    <div style="text-align:center;">
      <a href="https://bareter.com/profile" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Try Again</a>
    </div>
  `);
  const text = `${greeting}\n\nYour ${verType} verification was not approved. You can try again at https://bareter.com/profile\n\n${opts.reason ? `Reason: ${opts.reason}\n\n` : ""}Contact support if you believe this is an error.\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Verification Update — Action Required`, html, text });
}

export async function sendVerificationUnderReviewEmail(
  toEmail: string,
  opts: { fullName?: string | null; accountType?: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Verification under review email to ${toEmail} skipped (email not configured)`);
    return false;
  }
  const greeting = opts.fullName ? `Hi ${opts.fullName},` : "Hi there,";
  const verType = opts.accountType === "business" ? "Business (KYB)" : "Identity (KYC)";
  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Documents Received — Under Review</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 12px;">${greeting}</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">We have received your <strong>${verType}</strong> verification documents. Our team is currently reviewing them — this usually takes just a few minutes. We will email you as soon as a decision has been made.</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">You can check your current verification status at any time by visiting your settings.</p>
    <div style="text-align:center;">
      <a href="https://bareter.com/settings" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Check Status</a>
    </div>
  `);
  const text = `${greeting}\n\nWe received your ${verType} documents and are reviewing them. This usually takes just a few minutes. We'll email you when a decision is made.\n\nCheck your status at https://bareter.com/settings\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Verification Documents Received — Under Review`, html, text });
}

// ─── Task #248 — Save progress + reminder emails ──────────────────────
//
// All three reminders share the same envelope: greeting → CTA → soft
// unsubscribe footer. The unsubscribe link is mandatory because these are
// behavioural nudges, not transactional mail — they fall under
// CAN-SPAM/GDPR/UAE PDPL "marketing-style" rules.

function buildAppBaseUrl(): string {
  // PUBLIC_APP_URL is the externally-reachable URL used in emails and links.
  // APP_BASE_URL may point to localhost — never use it for email links.
  const publicUrl = process.env.PUBLIC_APP_URL?.trim();
  if (publicUrl) return publicUrl.replace(/\/$/, "");
  if (process.env.REPLIT_DOMAINS) {
    const host = process.env.REPLIT_DOMAINS.split(",")[0]?.trim();
    if (host) return `https://${host}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "https://bareter.com";
}

function escapeReminderHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function reminderShell(opts: {
  language: "en" | "ar";
  heading: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  unsubscribeUrl: string;
  unsubscribeLabel: string;
}): string {
  const dir = opts.language === "ar" ? "rtl" : "ltr";
  const align = opts.language === "ar" ? "right" : "left";
  const heading = escapeReminderHtml(opts.heading);
  const body = escapeReminderHtml(opts.body);
  const ctaText = escapeReminderHtml(opts.ctaText);
  const ctaUrl = escapeReminderHtml(opts.ctaUrl);
  const unsubscribeUrl = escapeReminderHtml(opts.unsubscribeUrl);
  const unsubscribeLabel = escapeReminderHtml(opts.unsubscribeLabel);
  return emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 12px;">${heading}</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">${body}</p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${ctaUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">${ctaText}</a>
    </div>
    <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0;">
      <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">${unsubscribeLabel}</a>
    </p>
  `, { rtl: opts.language === "ar" });
}

const REMINDER_COPY = {
  verification: {
    en: {
      h: "Finish verifying your account",
      b: (n: string) => `${n}, you started verifying your identity but didn't finish. It only takes a couple of minutes — pick up right where you left off.`,
      cta: "Resume verification",
      sub: "Finish verifying your Bareter account",
    },
    ar: {
      h: "أكمل توثيق حسابك",
      b: (n: string) => `${n}، لقد بدأت في توثيق هويتك ولكن لم تكمل العملية. لا تستغرق سوى دقيقتين — تابع من حيث توقفت.`,
      cta: "متابعة التوثيق",
      sub: "أكمل توثيق حسابك على Bareter",
    },
  },
  draft: {
    en: {
      h: "Your listing is one step away from going live",
      b: (n: string, t: string) => `${n}, your draft "${t}" is saved but not yet published. Publish it now to start receiving barter offers.`,
      cta: "Finish your listing",
      sub: "Your saved Bareter listing is waiting",
    },
    ar: {
      h: "إعلانك على بُعد خطوة واحدة من النشر",
      b: (n: string, t: string) => `${n}، مسودتك "${t}" محفوظة ولكن لم يتم نشرها بعد. انشرها الآن لتلقي عروض المقايضة.`,
      cta: "أكمل إعلانك",
      sub: "مسودة إعلانك على Bareter في انتظارك",
    },
  },
  engagement: {
    en: {
      h: "Pick up where you left off",
      b: (n: string, t: string) => `${n}, you were just looking at "${t}" on Bareter. The lister is still active — send a message before someone else does.`,
      cta: "Open the listing",
      sub: "Continue where you left off on Bareter",
    },
    ar: {
      h: "تابع من حيث توقفت",
      b: (n: string, t: string) => `${n}، كنت تتصفح "${t}" على Bareter. صاحب الإعلان لا يزال نشطًا — أرسل رسالة قبل أن يسبقك أحد.`,
      cta: "افتح الإعلان",
      sub: "تابع من حيث توقفت على Bareter",
    },
  },
};

interface ReminderOpts {
  toEmail: string;
  fullName: string | null;
  language: "en" | "ar";
  unsubscribeToken: string;
  baseUrl?: string;
}

export async function sendVerificationReminderEmail(
  opts: ReminderOpts & { stage: "24h" | "72h" | "7d" },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Verification reminder (${opts.stage}) for ${opts.toEmail} skipped (email not configured)`);
    return false;
  }
  const base = opts.baseUrl || buildAppBaseUrl();
  const copy = REMINDER_COPY.verification[opts.language];
  const greeting = opts.fullName || (opts.language === "ar" ? "مرحباً" : "Hi there");
  const ctaUrl = `${base}/profile?resume=verification&utm_source=reminder&utm_medium=email&utm_campaign=verify_${opts.stage}`;
  const unsubUrl = `${base}/api/reminders/unsubscribe?token=${opts.unsubscribeToken}&kind=verification`;
  const unsubLabel = opts.language === "ar" ? "إلغاء الاشتراك" : "Unsubscribe from these reminders";
  const html = reminderShell({
    language: opts.language,
    heading: copy.h,
    body: copy.b(greeting),
    ctaText: copy.cta,
    ctaUrl,
    unsubscribeUrl: unsubUrl,
    unsubscribeLabel: unsubLabel,
  });
  const text = `${greeting}\n\n${copy.b(greeting)}\n\n${copy.cta}: ${ctaUrl}\n\n${unsubLabel}: ${unsubUrl}`;
  return sendMail({ to: opts.toEmail, subject: copy.sub, html, text });
}

export async function sendDraftReminderEmail(
  opts: ReminderOpts & { stage: "24h" | "72h"; draftTitle: string; draftId: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Draft reminder (${opts.stage}) for ${opts.toEmail} skipped`);
    return false;
  }
  const base = opts.baseUrl || buildAppBaseUrl();
  const copy = REMINDER_COPY.draft[opts.language];
  const greeting = opts.fullName || (opts.language === "ar" ? "مرحباً" : "Hi there");
  const ctaUrl = `${base}/create-listing?draft=${opts.draftId}&utm_source=reminder&utm_medium=email&utm_campaign=draft_${opts.stage}`;
  const unsubUrl = `${base}/api/reminders/unsubscribe?token=${opts.unsubscribeToken}&kind=drafts`;
  const unsubLabel = opts.language === "ar" ? "إلغاء الاشتراك" : "Unsubscribe from these reminders";
  const safeTitle = opts.draftTitle?.slice(0, 80) || (opts.language === "ar" ? "إعلان بدون عنوان" : "Untitled listing");
  const html = reminderShell({
    language: opts.language,
    heading: copy.h,
    body: copy.b(greeting, safeTitle),
    ctaText: copy.cta,
    ctaUrl,
    unsubscribeUrl: unsubUrl,
    unsubscribeLabel: unsubLabel,
  });
  const text = `${greeting}\n\n${copy.b(greeting, safeTitle)}\n\n${copy.cta}: ${ctaUrl}\n\n${unsubLabel}: ${unsubUrl}`;
  return sendMail({ to: opts.toEmail, subject: copy.sub, html, text });
}

export async function sendEngagementReminderEmail(
  opts: ReminderOpts & { listingTitle: string; listingId: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Engagement reminder for ${opts.toEmail} skipped`);
    return false;
  }
  const base = opts.baseUrl || buildAppBaseUrl();
  const copy = REMINDER_COPY.engagement[opts.language];
  const greeting = opts.fullName || (opts.language === "ar" ? "مرحباً" : "Hi there");
  const ctaUrl = `${base}/listings/${opts.listingId}?utm_source=reminder&utm_medium=email&utm_campaign=engagement_48h`;
  const unsubUrl = `${base}/api/reminders/unsubscribe?token=${opts.unsubscribeToken}&kind=engagement`;
  const unsubLabel = opts.language === "ar" ? "إلغاء الاشتراك" : "Unsubscribe from these reminders";
  const safeTitle = opts.listingTitle?.slice(0, 80) || (opts.language === "ar" ? "إعلان" : "a listing");
  const reEngagementTemplate = await getCustomTemplate("email_template_re_engagement");
  if (reEngagementTemplate) {
    const html = applyTemplateVars(reEngagementTemplate, { greeting, fullName: opts.fullName || "there", appName: APP_NAME, baseUrl: base });
    const text = `${greeting}\n\nCome back and check your listing "${safeTitle}" — you may have new activity.\n\n${ctaUrl}\n\n${unsubLabel}: ${unsubUrl}`;
    return sendMail({ to: opts.toEmail, subject: copy.sub, html, text });
  }
  const html = reminderShell({
    language: opts.language,
    heading: copy.h,
    body: copy.b(greeting, safeTitle),
    ctaText: copy.cta,
    ctaUrl,
    unsubscribeUrl: unsubUrl,
    unsubscribeLabel: unsubLabel,
  });
  const text = `${greeting}\n\n${copy.b(greeting, safeTitle)}\n\n${copy.cta}: ${ctaUrl}\n\n${unsubLabel}: ${unsubUrl}`;
  return sendMail({ to: opts.toEmail, subject: copy.sub, html, text });
}

// ─── Listing Published ────────────────────────────────────────────────────────

export async function sendListingPublishedEmail(
  toEmail: string,
  opts: { recipientName?: string | null; listingTitle: string; listingId: string; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Listing published email to ${toEmail} skipped`);
    return false;
  }
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const listingUrl = `${opts.baseUrl}/listings/${opts.listingId}`;
  const safeTitle = opts.listingTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const customTemplate = await getCustomTemplate("email_template_listing_approved");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, listingTitle: safeTitle, listingUrl, appName: APP_NAME, baseUrl: opts.baseUrl })
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#065f46;margin:0 0 10px;">Your listing is live!</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">${greeting}</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">Congratulations! Your listing <strong>"${safeTitle}"</strong> is now published on ${APP_NAME} and visible to verified traders worldwide. You will be notified as soon as someone sends you a barter offer.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin:0 0 24px;">
        <p style="margin:0;color:#166534;font-size:13px;line-height:1.5;">Tip: Share your listing link with your network to get more visibility and faster offers.</p>
      </div>
      <div style="text-align:center;">
        <a href="${listingUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">View My Listing</a>
      </div>
    `);
  const text = `${greeting}\n\nCongratulations! Your listing "${opts.listingTitle}" is now live on ${APP_NAME}.\n\nView it here: ${listingUrl}\n\nYou will be notified when someone sends a barter offer.\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Your listing "${opts.listingTitle}" is live on ${APP_NAME}!`, html, text, templateKey: "email_template_listing_approved" });
}

// ─── New Barter Proposal Notification ────────────────────────────────────────

export async function sendNewProposalEmail(
  toEmail: string,
  opts: {
    ownerName?: string | null;
    proposerName: string;
    listingTitle: string;
    offerItemName: string;
    offerItemValue: string;
    listingUrl: string;
  },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] New proposal email to ${toEmail} skipped (not configured)`);
    return false;
  }
  const greeting = opts.ownerName ? `Hi ${opts.ownerName},` : "Hi there,";
  const customTemplate = await getCustomTemplate("email_template_proposal_received") || await getCustomTemplate("email_template_new_proposal");
  if (customTemplate) {
    const safeProposer = opts.proposerName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeTitle = opts.listingTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const baseUrl = opts.listingUrl.replace(/\/listings\/.*$/, "");
    const html = applyTemplateVars(customTemplate, { greeting, proposerName: safeProposer, listingTitle: safeTitle, senderName: safeProposer, appName: APP_NAME, baseUrl });
    const text = `${greeting}\n\n${opts.proposerName} sent a barter proposal on your listing "${opts.listingTitle}".\n\nReview it here: ${opts.listingUrl}\n\n— ${APP_NAME}`;
    return sendMail({ to: toEmail, subject: `${opts.proposerName} sent a proposal on "${opts.listingTitle}"`, html, text, templateKey: "email_template_proposal_received" });
  }
  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">New Barter Proposal</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">${greeting}</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;"><strong>${opts.proposerName}</strong> has proposed a barter on your listing <strong>"${opts.listingTitle}"</strong>.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 4px;color:#166534;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">They're offering</p>
      <p style="margin:0;color:#166534;font-size:16px;font-weight:700;">${opts.offerItemName} &mdash; AED ${parseFloat(opts.offerItemValue).toLocaleString()}</p>
    </div>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">Head to your listing to review the proposal and accept or decline.</p>
    <div style="text-align:center;">
      <a href="${opts.listingUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">View Proposal</a>
    </div>
  `);
  const text = `${greeting}\n\n${opts.proposerName} proposed a barter on your listing "${opts.listingTitle}".\n\nThey're offering: ${opts.offerItemName} — AED ${parseFloat(opts.offerItemValue).toLocaleString()}\n\nView the proposal: ${opts.listingUrl}\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `${opts.proposerName} proposed a barter on "${opts.listingTitle}"`, html, text, templateKey: "email_template_new_proposal" });
}

// ─── Deal Status Emails ───────────────────────────────────────────────────────

export async function sendCounterOfferEmail(
  toEmail: string,
  opts: {
    recipientName?: string | null;
    counterpartyName: string;
    listingTitle: string;
    counterName: string;
    counterValue: string;
    listingUrl: string;
    direction: "received" | "responded";
    response?: "accepted" | "rejected";
  },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const isReceived = opts.direction === "received";
  const emoji = isReceived ? "↔️" : (opts.response === "accepted" ? "✅" : "❌");
  const title = isReceived
    ? "Counter-offer received"
    : opts.response === "accepted" ? "Counter-offer accepted!" : "Counter-offer declined";
  const body = isReceived
    ? `<strong>${opts.counterpartyName}</strong> sent a counter-offer on <strong>"${opts.listingTitle}"</strong>: <strong>${opts.counterName}</strong> valued at AED ${parseFloat(opts.counterValue).toLocaleString()}. Head over to review and respond.`
    : opts.response === "accepted"
      ? `<strong>${opts.counterpartyName}</strong> accepted your counter-offer on <strong>"${opts.listingTitle}"</strong>. You can now proceed to finalise the deal.`
      : `<strong>${opts.counterpartyName}</strong> declined your counter-offer on <strong>"${opts.listingTitle}"</strong>. You can send a new proposal or close the deal.`;
  const color = isReceived ? "#7c3aed" : (opts.response === "accepted" ? "#065f46" : "#991b1b");
  const subject = isReceived
    ? `Counter-offer from ${opts.counterpartyName} on "${opts.listingTitle}"`
    : opts.response === "accepted"
      ? `${opts.counterpartyName} accepted your counter-offer`
      : `${opts.counterpartyName} declined your counter-offer`;
  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:${color};margin:0 0 10px;">${title}</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">${greeting}</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">${body}</p>
    <div style="text-align:center;">
      <a href="${opts.listingUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">View Listing</a>
    </div>
  `);
  const text = `${greeting}\n\n${title}\n\n${body.replace(/<[^>]+>/g, "")}\n\nView listing: ${opts.listingUrl}\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject, html, text });
}

export async function sendDealStatusEmail(
  toEmail: string,
  opts: {
    recipientName?: string | null;
    counterpartyName: string;
    status: "proposed" | "accepted" | "cancelled";
    dealId: string;
    baseUrl: string;
  },
): Promise<boolean> {
  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Deal status (${opts.status}) email to ${toEmail} skipped`);
    return false;
  }
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const dealUrl = `${opts.baseUrl}/deals/${opts.dealId}`;

  const configs = {
    proposed: {
      emoji: "🤝",
      title: "New barter offer received!",
      body: `<strong>${opts.counterpartyName}</strong> has sent you a barter offer on ${APP_NAME}. Review the details and accept or decline.`,
      cta: "View Offer",
      ctaUrl: dealUrl,
      subject: `New barter offer from ${opts.counterpartyName} on ${APP_NAME}`,
      color: "#136c68",
    },
    accepted: {
      emoji: "✅",
      title: "Your offer was accepted!",
      body: `Great news! <strong>${opts.counterpartyName}</strong> has accepted your barter offer. Head over to the deal page to coordinate the exchange.`,
      cta: "View Deal",
      ctaUrl: dealUrl,
      subject: `${opts.counterpartyName} accepted your barter offer on ${APP_NAME}`,
      color: "#065f46",
    },
    cancelled: {
      emoji: "❌",
      title: "Barter deal cancelled",
      body: `Your barter deal with <strong>${opts.counterpartyName}</strong> has been cancelled. You can browse other listings or create a new offer at any time.`,
      cta: "Browse Listings",
      ctaUrl: `${opts.baseUrl}/browse`,
      subject: `Barter deal with ${opts.counterpartyName} was cancelled`,
      color: "#991b1b",
    },
  };

  const config = configs[opts.status];

  if (opts.status === "accepted") {
    const customTemplate = await getCustomTemplate("email_template_proposal_accepted");
    if (customTemplate) {
      const safeCounterparty = opts.counterpartyName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = applyTemplateVars(customTemplate, { greeting, counterpartyName: safeCounterparty, listingTitle: opts.counterpartyName, dealUrl, appName: APP_NAME, baseUrl: opts.baseUrl });
      const text = `${greeting}\n\n${opts.counterpartyName} accepted your barter offer. View deal: ${dealUrl}\n\n— ${APP_NAME}`;
      return sendMail({ to: toEmail, subject: config.subject, html, text, templateKey: "email_template_proposal_accepted" });
    }
  }

  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:${config.color};margin:0 0 10px;">${config.title}</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">${greeting}</p>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">${config.body}</p>
    <div style="text-align:center;">
      <a href="${config.ctaUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">${config.cta}</a>
    </div>
  `);
  const text = `${greeting}\n\n${config.title}\n\n${config.body.replace(/<[^>]+>/g, "")}\n\n${config.cta}: ${config.ctaUrl}\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: config.subject, html, text, templateKey: opts.status === "accepted" ? "email_template_proposal_accepted" : undefined });
}

// ─── Profile Updated ──────────────────────────────────────────────────────────

export async function sendProfileUpdatedEmail(
  toEmail: string,
  opts: { recipientName?: string | null },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const html = emailShell(`
    <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Profile updated</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${greeting} your ${APP_NAME} profile has been updated successfully.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;margin:0 0 16px;">
      <p style="margin:0;color:#166534;font-size:13px;line-height:1.5;">Your profile changes have been saved and are now visible to other traders.</p>
    </div>
    <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0;">If you did not make this change, <a href="mailto:hello@bareter.com" style="color:#136c68;text-decoration:none;">contact support</a> immediately.</p>
  `);
  const text = `${greeting}\n\nYour ${APP_NAME} profile has been updated successfully.\n\nIf you did not make this change, contact support at hello@bareter.com.\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Your ${APP_NAME} profile has been updated`, html, text });
}

// ── Feature interest / coming-soon waitlist emails ─────────────────────────
type FeatureVariant = "creators" | "brand-collabs";

const FEATURE_COPY: Record<FeatureVariant, { name: string; tagline: string; color: string; what: string }> = {
  creators: {
    name: "Creators Hub",
    tagline: "Where UAE creators get paid in products, not promises.",
    color: "#7c3aed",
    what: "curated brand deals, gifted products, and auto-generated barter contracts",
  },
  "brand-collabs": {
    name: "Brand Collabs",
    tagline: "Reach UAE audiences through authentic creator content.",
    color: "#136c68",
    what: "AI-matched creators, TikTok/Reels content campaigns, and zero-commission barter contracts",
  },
};

export async function sendFeatureWaitlistEmail(
  toEmail: string,
  feature: FeatureVariant,
  baseUrl: string,
): Promise<void> {
  const c = FEATURE_COPY[feature] ?? FEATURE_COPY["creators"];

  if (!(await isEmailConfigured())) {
    console.log(`[EMAIL] Feature waitlist (${feature}) confirmation for ${toEmail}`);
    return;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: Arial, sans-serif; background: #0f1f3d; margin: 0; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: #162040; border-radius: 16px; padding: 36px; box-shadow: 0 4px 24px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08);">
    <div style="text-align: center; margin-bottom: 28px;">
      <span style="display: inline-block; background: ${c.color}22; border: 1px solid ${c.color}55; border-radius: 999px; padding: 6px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${c.color};">${c.name} · Coming Soon</span>
    </div>
    <h2 style="font-size: 22px; color: #ffffff; margin: 0 0 12px; line-height: 1.2;">${c.tagline}</h2>
    <p style="color: rgba(255,255,255,0.6); font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
      You're on the early-access list for <strong style="color: white;">${c.name}</strong> — a dedicated space inside Bareter for ${c.what}.<br/><br/>
      We'll email you the moment doors open. Early members get priority access, special perks, and the best deals at launch.
    </p>
    <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 18px; margin-bottom: 28px;">
      <p style="margin: 0 0 8px; color: rgba(255,255,255,0.5); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;">While you wait</p>
      <p style="margin: 0; color: rgba(255,255,255,0.75); font-size: 13px; line-height: 1.5;">Browse live barter listings on ${APP_NAME} — from real estate and luxury cars to services and tech deals.</p>
    </div>
    <a href="${baseUrl}/browse" style="display: block; text-align: center; background: #136c68; color: white; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-size: 15px; font-weight: 700; margin-bottom: 28px;">Browse Live Listings →</a>
    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 0 0 20px;" />
    <p style="color: rgba(255,255,255,0.25); font-size: 11px; text-align: center; margin: 0;">${APP_NAME} · UAE's Barter Marketplace · <a href="${baseUrl}/privacy" style="color: rgba(255,255,255,0.35); text-decoration: none;">Privacy</a></p>
  </div>
</body></html>`;

  const text = `You're on the early-access list for ${c.name} on ${APP_NAME}!\n\n${c.tagline}\n\nWe'll email you the moment ${c.name} launches. In the meantime, browse live barter listings:\n${baseUrl}/browse\n\n— ${APP_NAME}`;

  await sendMail({
    to: toEmail,
    subject: `You're on the ${c.name} early-access list 🎉`,
    html,
    text,
  });
}

// ─── Match Found ──────────────────────────────────────────────────────────────

export async function sendMatchFoundEmail(
  toEmail: string,
  opts: { recipientName?: string | null; listingTitle: string; matchedListingTitle: string; matchScore: number; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const safeTitle = opts.listingTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeMatch = opts.matchedListingTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const scoreStr = String(Math.round(opts.matchScore));
  const customTemplate = await getCustomTemplate("email_template_match_found");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, listingTitle: safeTitle, matchedListingTitle: safeMatch, matchScore: scoreStr, appName: APP_NAME, baseUrl: opts.baseUrl })
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">We found a strong match for you</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${greeting} your listing <strong>"${safeTitle}"</strong> has a new potential match.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:0 0 24px;">
        <p style="margin:0 0 2px;color:#166534;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Matched with</p>
        <p style="margin:0 0 4px;color:#166534;font-size:16px;font-weight:700;">${safeMatch}</p>
        <p style="margin:0;color:#15803d;font-size:12px;">Match score: ${scoreStr}%</p>
      </div>
      <div style="text-align:center;">
        <a href="${opts.baseUrl}/feed" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">View Your Matches</a>
      </div>
    `);
  const text = `${greeting}\n\nYour listing "${opts.listingTitle}" has a new match: "${opts.matchedListingTitle}" (${scoreStr}% match).\n\nView your matches: ${opts.baseUrl}/feed\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `New match for your listing "${opts.listingTitle}"`, html, text, templateKey: "email_template_match_found" });
}

// ─── New Deal Message ─────────────────────────────────────────────────────────

export async function sendNewMessageEmail(
  toEmail: string,
  opts: { recipientName?: string | null; senderName: string; listingTitle: string; dealId: string; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const safeSender = opts.senderName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeTitle = opts.listingTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dealUrl = `${opts.baseUrl}/deals/${opts.dealId}`;
  const customTemplate = await getCustomTemplate("email_template_new_message");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, senderName: safeSender, listingTitle: safeTitle, appName: APP_NAME, baseUrl: opts.baseUrl })
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">New message from ${safeSender}</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">${greeting} <strong>${safeSender}</strong> sent you a message about <strong>"${safeTitle}"</strong>.</p>
      <div style="text-align:center;">
        <a href="${dealUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Read Message</a>
      </div>
    `);
  const text = `${greeting}\n\n${opts.senderName} sent you a message about "${opts.listingTitle}".\n\nReply: ${dealUrl}\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `New message from ${opts.senderName} on "${opts.listingTitle}"`, html, text, templateKey: "email_template_new_message" });
}

// ─── Proposal Received (template-driven alias for sendNewProposalEmail) ────────

export async function sendProposalReceivedEmail(
  toEmail: string,
  opts: { recipientName?: string | null; proposerName: string; listingTitle: string; listingUrl: string; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const safeProposer = opts.proposerName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeTitle = opts.listingTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const customTemplate = await getCustomTemplate("email_template_proposal_received");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, proposerName: safeProposer, listingTitle: safeTitle, appName: APP_NAME, baseUrl: opts.baseUrl })
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">New Proposal on Your Listing</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">${greeting} <strong>${safeProposer}</strong> has sent a barter proposal on your listing <strong>"${safeTitle}"</strong>.</p>
      <div style="text-align:center;">
        <a href="${opts.listingUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Review Proposal</a>
      </div>
    `);
  const text = `${greeting}\n\n${opts.proposerName} sent a barter proposal on your listing "${opts.listingTitle}".\n\nReview it here: ${opts.listingUrl}\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `${opts.proposerName} sent a proposal on "${opts.listingTitle}"`, html, text, templateKey: "email_template_proposal_received" });
}

// ─── Contract Ready for Signature ─────────────────────────────────────────────

export async function sendContractReadyEmail(
  toEmail: string,
  opts: { recipientName?: string | null; listingTitle: string; dealId: string; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const safeTitle = opts.listingTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dealUrl = `${opts.baseUrl}/deals/${opts.dealId}`;
  const customTemplate = await getCustomTemplate("email_template_contract_ready");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, listingTitle: safeTitle, appName: APP_NAME, baseUrl: opts.baseUrl })
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Your contract is ready to sign</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${greeting} the barter agreement for <strong>"${safeTitle}"</strong> is ready and waiting for your signature.</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin:0 0 24px;">
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">Sign the contract to finalise your deal and start the exchange.</p>
      </div>
      <div style="text-align:center;">
        <a href="${dealUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Sign Contract</a>
      </div>
    `);
  const text = `${greeting}\n\nYour barter contract for "${opts.listingTitle}" is ready. Sign it here: ${dealUrl}\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Action required: sign your barter contract for "${opts.listingTitle}"`, html, text, templateKey: "email_template_contract_ready" });
}

// ─── Proposal Declined ────────────────────────────────────────────────────────

export async function sendProposalDeclinedEmail(
  toEmail: string,
  opts: { recipientName?: string | null; listingTitle: string; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const safeTitle = opts.listingTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const customTemplate = await getCustomTemplate("email_template_proposal_declined");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, listingTitle: safeTitle, appName: APP_NAME, baseUrl: opts.baseUrl })
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#1a2035;margin:0 0 10px;">Your proposal was not accepted</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">${greeting} your barter proposal on <strong>"${safeTitle}"</strong> was declined by the listing owner.</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">Don't give up — browse other listings or post your offer as a listing of your own to reach more traders.</p>
      <div style="text-align:center;">
        <a href="${opts.baseUrl}/feed" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Browse Listings</a>
      </div>
    `);
  const text = `${greeting}\n\nYour proposal on "${opts.listingTitle}" was declined. Browse other listings: ${opts.baseUrl}/feed\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Your proposal on "${opts.listingTitle}" was not accepted`, html, text, templateKey: "email_template_proposal_declined" });
}

// ─── Listing Expiring Soon ────────────────────────────────────────────────────

export async function sendListingExpiringEmail(
  toEmail: string,
  opts: { recipientName?: string | null; listingTitle: string; daysLeft: number; listingId: string; baseUrl: string },
): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi there,";
  const safeTitle = opts.listingTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const daysLeftStr = String(opts.daysLeft);
  const listingUrl = `${opts.baseUrl}/listings/${opts.listingId}`;
  const customTemplate = await getCustomTemplate("email_template_listing_expiring");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, listingTitle: safeTitle, daysLeft: daysLeftStr, appName: APP_NAME, baseUrl: opts.baseUrl })
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#92400e;margin:0 0 10px;">Your listing expires in ${daysLeftStr} day${opts.daysLeft === 1 ? "" : "s"}</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 14px;">${greeting} your listing <strong>"${safeTitle}"</strong> will expire in <strong>${daysLeftStr} day${opts.daysLeft === 1 ? "" : "s"}</strong>.</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">Renew it to keep receiving barter proposals and stay visible to traders.</p>
      <div style="text-align:center;">
        <a href="${listingUrl}" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Renew Listing</a>
      </div>
    `);
  const text = `${greeting}\n\nYour listing "${opts.listingTitle}" expires in ${daysLeftStr} day${opts.daysLeft === 1 ? "" : "s"}. Renew it here: ${listingUrl}\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Your listing "${opts.listingTitle}" expires in ${daysLeftStr} day${opts.daysLeft === 1 ? "" : "s"}`, html, text, templateKey: "email_template_listing_expiring" });
}

export async function sendRawEmail(opts: { to: string; subject: string; html: string; text: string; templateKey?: string; userId?: string }): Promise<boolean> {
  return sendMail(opts);
}

// ─── Email Address Verified Confirmation ──────────────────────────────────────

export async function sendEmailVerifiedEmail(toEmail: string, fullName?: string | null): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = fullName ? `Hi ${fullName},` : "Hi there,";
  const baseUrl = process.env.PUBLIC_APP_URL || "https://bareter.com";
  const customTemplate = await getCustomTemplate("email_template_email_verified");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, fullName: fullName || "there", appName: APP_NAME, baseUrl })
    : emailShell(`
      <h2 style="font-size:19px;font-weight:700;color:#065f46;margin:0 0 10px;">Email verified</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 12px;">${greeting}</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">Your email address has been successfully verified. One more step — verify your WhatsApp number to unlock your full account and start trading on ${APP_NAME}.</p>
      <div style="text-align:center;">
        <a href="${baseUrl}/profile?tab=verify" style="display:inline-block;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">Complete Verification</a>
      </div>
    `);
  const text = `${greeting}\n\nYour email address has been successfully verified. Complete your WhatsApp verification to unlock your full account.\n\nGo to: ${baseUrl}/profile?tab=verify\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Email verified — one more step`, html, text, templateKey: "email_template_email_verified" });
}

// ─── Account Fully Ready (email + WhatsApp both verified) ────────────────────

export async function sendAccountReadyEmail(toEmail: string, fullName?: string | null): Promise<boolean> {
  if (!(await isEmailConfigured())) return false;
  const greeting = fullName ? `Hi ${fullName},` : "Hi there,";
  const baseUrl = process.env.PUBLIC_APP_URL || "https://bareter.com";
  const customTemplate = await getCustomTemplate("email_template_account_ready");
  const html = customTemplate
    ? applyTemplateVars(customTemplate, { greeting, fullName: fullName || "there", appName: APP_NAME, baseUrl })
    : emailShell(`
      <h2 style="font-size:21px;font-weight:700;color:#065f46;margin:0 0 12px;">You're all set!</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 12px;">${greeting}</p>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">Your account is fully verified — email and WhatsApp are both confirmed. You're ready to explore the marketplace, post your first listing, and start making deals.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:0 0 24px;">
        <p style="margin:0 0 8px;color:#166534;font-size:13px;font-weight:700;">What you can do now:</p>
        <ul style="margin:0;padding-left:18px;color:#166534;font-size:13px;line-height:1.9;">
          <li>Browse listings and find what your business needs</li>
          <li>Post your own listing and attract barter proposals</li>
          <li>Send proposals and start trading</li>
        </ul>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:6px;">
            <a href="${baseUrl}/browse" style="display:block;text-align:center;background:#0f5f5a;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:8px;font-size:14px;font-weight:700;">Explore the Marketplace</a>
          </td>
          <td style="padding-left:6px;">
            <a href="${baseUrl}/listings/new" style="display:block;text-align:center;background:#ffffff;color:#0f5f5a;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700;border:1.5px solid #0f5f5a;">Post a Listing</a>
          </td>
        </tr>
      </table>
    `);
  const text = `${greeting}\n\nYour account is fully verified — email and WhatsApp are both confirmed.\n\nBrowse the marketplace: ${baseUrl}/browse\nPost your first listing: ${baseUrl}/listings/new\n\n— ${APP_NAME}`;
  return sendMail({ to: toEmail, subject: `Your ${APP_NAME} account is ready — let's trade!`, html, text, templateKey: "email_template_account_ready" });
}
