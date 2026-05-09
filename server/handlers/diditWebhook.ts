import type { Request, Response } from "express";
import type { User, InsertNotification } from "@shared/schema";

export interface DiditWebhookPayload {
  session_id?: string;
  status?: string;
  user_data?: unknown;
  verification?: unknown;
  vendor_data?: unknown;
  decision?: string;
}

export type DiditUserProjection = Pick<User, "id" | "accountType" | "email" | "fullName">;

export type DiditUserUpdate = Partial<
  Pick<
    User,
    | "kycStatus"
    | "kybStatus"
    | "isVerified"
    | "verificationStatus"
    | "diditVerifiedAt"
    | "diditVerificationData"
    | "emailVerified"
    | "updatedAt"
  >
>;

export interface DiditWebhookStorage {
  getUserByDiditSessionId(
    sessionId: string,
  ): Promise<DiditUserProjection | undefined>;
  updateUser(
    id: string,
    data: DiditUserUpdate,
  ): Promise<DiditUserProjection | undefined>;
  createNotification(notification: InsertNotification): Promise<unknown>;
}

export interface DiditWebhookDeps {
  storage: DiditWebhookStorage;
  verifyWebhookSignature: (payload: string, signature: string) => boolean;
  sendApprovedEmail?: (toEmail: string, opts: { fullName?: string | null; accountType?: string }) => Promise<boolean>;
  sendDeclinedEmail?: (toEmail: string, opts: { fullName?: string | null; accountType?: string; reason?: string }) => Promise<boolean>;
  sendUnderReviewEmail?: (toEmail: string, opts: { fullName?: string | null; accountType?: string }) => Promise<boolean>;
}

export type DiditWebhookRequest = Request & { rawBody?: Buffer };

export function makeDiditWebhookHandler(deps: DiditWebhookDeps) {
  return async function diditWebhookHandler(
    req: Request,
    res: Response,
  ) {
    try {
      const signature = (req.headers["x-webhook-signature"] as string) ?? "";
      const rawBody = (req as DiditWebhookRequest).rawBody;

      if (!rawBody) {
        return res.status(400).json({ message: "Missing webhook payload" });
      }

      const payload = rawBody.toString();

      if (!deps.verifyWebhookSignature(payload, signature)) {
        console.error("Invalid Didit webhook signature");
        return res.status(401).json({ message: "Invalid signature" });
      }

      const data = JSON.parse(payload) as DiditWebhookPayload;
      console.log("Didit webhook received:", JSON.stringify({ session_id: data.session_id, status: data.status }));

      const sessionId = data.session_id;
      const status = data.status;

      if (!sessionId) {
        return res.status(400).json({ message: "Missing session_id" });
      }

      const user = await deps.storage.getUserByDiditSessionId(sessionId);

      if (!user) {
        console.log("User not found for Didit session:", sessionId);
        return res.json({ received: true });
      }

      const updateData: DiditUserUpdate = {
        updatedAt: new Date(),
      };

      if (user.accountType === "business") {
        updateData.kybStatus = status;
      } else {
        updateData.kycStatus = status;
      }

      if (status === "APPROVED") {
        updateData.isVerified = true;
        updateData.verificationStatus = "verified";
        updateData.diditVerifiedAt = new Date();
        updateData.emailVerified = true;
        updateData.diditVerificationData =
          (data.user_data ?? data.verification ?? {}) as Record<string, unknown>;

        await deps.storage.createNotification({
          userId: user.id,
          type: "system",
          title: "Verification Approved!",
          message: "Your identity has been verified. You can now create listings and start bartering!",
        });

        if (deps.sendApprovedEmail && user.email) {
          deps.sendApprovedEmail(user.email, { fullName: user.fullName ?? undefined, accountType: user.accountType ?? undefined }).catch((err) =>
            console.error("[EMAIL] Verification approved email failed:", err),
          );
        }
      } else if (status === "DECLINED" || status === "REJECTED") {
        updateData.isVerified = false;
        updateData.verificationStatus = "rejected";

        await deps.storage.createNotification({
          userId: user.id,
          type: "system",
          title: "Verification Not Approved",
          message: "Your verification was declined. Please try again or contact support.",
        });

        if (deps.sendDeclinedEmail && user.email) {
          deps.sendDeclinedEmail(user.email, { fullName: user.fullName ?? undefined, accountType: user.accountType ?? undefined }).catch((err) =>
            console.error("[EMAIL] Verification declined email failed:", err),
          );
        }
      } else if (status === "IN_REVIEW" || status === "PENDING_REVIEW") {
        updateData.verificationStatus = "submitted";

        await deps.storage.createNotification({
          userId: user.id,
          type: "system",
          title: "Documents Under Review",
          message: "We received your verification documents and are reviewing them. This usually takes just a few minutes.",
        });

        if (deps.sendUnderReviewEmail && user.email) {
          deps.sendUnderReviewEmail(user.email, { fullName: user.fullName ?? undefined, accountType: user.accountType ?? undefined }).catch((err) =>
            console.error("[EMAIL] Verification under review email failed:", err),
          );
        }
      } else if (status === "EXPIRED" || status === "ABANDONED") {
        updateData.verificationStatus = "pending";
      }

      await deps.storage.updateUser(user.id, updateData);
      return res.json({ received: true });
    } catch (error) {
      console.error("Didit webhook error:", error);
      return res.status(500).json({ message: "Webhook processing failed" });
    }
  };
}
