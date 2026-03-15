import nodemailer from "nodemailer";

function createTransport() {
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

const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER || "noreply@bartergram.ae";
const APP_NAME = "BarterGram";

export async function sendPasswordResetEmail(toEmail: string, resetToken: string, baseUrl: string): Promise<void> {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  const transport = createTransport();

  if (!transport) {
    console.log(`[EMAIL] Password reset requested for ${toEmail}`);
    console.log(`[EMAIL] Reset URL: ${resetUrl}`);
    console.log(`[EMAIL] To send real emails, set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.`);
    return;
  }

  await transport.sendMail({
    from: `"${APP_NAME}" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: `Reset your ${APP_NAME} password`,
    html: `
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
    `,
    text: `Reset your ${APP_NAME} password\n\nClick this link to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`,
  });
}

export async function sendWelcomeEmail(toEmail: string, fullName: string): Promise<void> {
  const transport = createTransport();

  if (!transport) {
    console.log(`[EMAIL] Welcome email for ${toEmail} (SMTP not configured — skipping)`);
    return;
  }

  await transport.sendMail({
    from: `"${APP_NAME}" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: `Welcome to ${APP_NAME}!`,
    html: `
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
          <a href="https://bartergram.ae/browse" style="display: block; text-align: center; background: #1a1a2e; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0;">
            Explore Listings
          </a>
          <p style="color: #d1d5db; font-size: 11px; text-align: center; margin: 0;">
            ${APP_NAME} · UAE Barter Marketplace
          </p>
        </div>
      </body>
      </html>
    `,
    text: `Welcome to ${APP_NAME}, ${fullName}! Your account is ready. Start browsing at https://bartergram.ae/browse`,
  });
}
