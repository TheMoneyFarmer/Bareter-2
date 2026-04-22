import type { Request, Response } from "express";
import type { User, InsertNotification } from "@shared/schema";

export interface DiditWebhookPayload {
  session_id?: string;
  status?: string;
  user_data?: unknown;
  verification?: unknown;
  vendor_data?: unknown;
}

export type DiditUserProjection = Pick<User, "id" | "accountType">;

export type DiditUserUpdate = Partial<
  Pick<
    User,
    | "kycStatus"
    | "kybStatus"
    | "isVerified"
    | "diditVerifiedAt"
    | "diditVerificationData"
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
      console.log("Didit webhook received:", data);

      const sessionId = data.session_id;
      const status = data.status;

      if (!sessionId) {
        return res.status(400).json({ message: "Missing session_id" });
      }

      const user = await deps.storage.getUserByDiditSessionId(sessionId);

      if (!user) {
        console.log("User not found for session:", sessionId);
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
        updateData.diditVerifiedAt = new Date();
        updateData.diditVerificationData =
          (data.user_data ?? data.verification ?? {}) as Record<
            string,
            unknown
          >;

        await deps.storage.createNotification({
          userId: user.id,
          type: "system",
          title: "Verification Complete",
          message:
            "Your identity has been verified. You can now start bartering!",
        });
      } else if (status === "DECLINED") {
        updateData.isVerified = false;

        await deps.storage.createNotification({
          userId: user.id,
          type: "system",
          title: "Verification Failed",
          message:
            "Your identity verification was declined. Please try again or contact support.",
        });
      }

      await deps.storage.updateUser(user.id, updateData);
      return res.json({ received: true });
    } catch (error) {
      console.error("Didit webhook error:", error);
      return res.status(500).json({ message: "Webhook processing failed" });
    }
  };
}
