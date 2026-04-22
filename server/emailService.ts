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

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
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
