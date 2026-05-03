import crypto from "crypto";

const DIDIT_API_BASE_URL = "https://verification.didit.me";

export interface DiditSession {
  session_id: string;
  verification_url: string;
  status: string;
}

export interface DiditSessionResponse {
  session_id: string;
  url: string;
  status: string;
}

export interface DiditWebhookPayload {
  session_id: string;
  status: string;
  decision?: string;
  timestamp?: string;
  vendor_data?: string;
  user_data?: {
    date_of_birth?: string;
    document_expires_at?: string;
    full_name?: string;
    document_number?: string;
    nationality?: string;
  };
  verification?: {
    id_document?: any;
    liveness?: any;
    face_match?: any;
    aml?: any;
  };
}

export async function createVerificationSession(
  workflowId: string,
  vendorData?: string,
  callbackUrl?: string
): Promise<DiditSessionResponse | null> {
  const apiKey = process.env.DIDIT_API_KEY;
  
  if (!apiKey) {
    console.error("DIDIT_API_KEY not configured");
    return null;
  }

  if (!workflowId) {
    console.error("Workflow ID is required");
    return null;
  }

  try {
    const body: Record<string, string> = {
      workflow_id: workflowId,
    };

    if (vendorData) {
      body.vendor_data = vendorData;
    }

    if (callbackUrl) {
      body.callback = callbackUrl;
    }

    const response = await fetch(`${DIDIT_API_BASE_URL}/v2/session/`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Didit session creation failed:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    return {
      session_id: data.session_id,
      url: data.url,
      status: data.status || "NOT_STARTED",
    };
  } catch (error) {
    console.error("Error creating Didit session:", error);
    return null;
  }
}

export async function getSessionStatus(sessionId: string): Promise<string | null> {
  const apiKey = process.env.DIDIT_API_KEY;
  
  if (!apiKey) {
    console.error("DIDIT_API_KEY not configured");
    return null;
  }

  try {
    const response = await fetch(`${DIDIT_API_BASE_URL}/v2/session/${sessionId}/`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
    });

    if (!response.ok) {
      console.error("Didit session status check failed:", response.status);
      return null;
    }

    const data = await response.json();
    return data.status;
  } catch (error) {
    console.error("Error getting Didit session status:", error);
    return null;
  }
}

export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined
): boolean {
  const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error("DIDIT_WEBHOOK_SECRET not configured");
    return false;
  }

  if (!signature) {
    console.error("No signature provided in webhook");
    return false;
  }

  try {
    const hmac = crypto.createHmac("sha256", webhookSecret);
    hmac.update(payload);
    const expectedSignature = hmac.digest("hex");
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
}

export function isUserVerified(
  accountType: string,
  kycStatus: string,
  kybStatus: string,
  manualVerifiedFlag?: boolean | null,
): boolean {
  // Admin-issued manual verification (the `users.is_verified` boolean)
  // is a first-class trust signal: founders verify partners and edge
  // cases out-of-band, and that decision must override Didit status.
  // Without this, manually-verified accounts are blocked at every gate
  // (proposing deals, contacting users, etc.) because their kycStatus
  // stays at NOT_STARTED.
  if (manualVerifiedFlag) return true;
  if (accountType === "business") {
    return kybStatus === "APPROVED";
  }
  return kycStatus === "APPROVED";
}

export function getVerificationStatus(
  accountType: string,
  kycStatus: string,
  kybStatus: string
): { status: string; label: string; color: string } {
  const status = accountType === "business" ? kybStatus : kycStatus;
  
  switch (status) {
    case "APPROVED":
      return { status, label: "Verified", color: "green" };
    case "IN_PROGRESS":
      return { status, label: "Verification In Progress", color: "yellow" };
    case "IN_REVIEW":
      return { status, label: "Under Review", color: "yellow" };
    case "DECLINED":
      return { status, label: "Verification Failed", color: "red" };
    case "EXPIRED":
      return { status, label: "Verification Expired", color: "red" };
    case "ABANDONED":
      return { status, label: "Verification Abandoned", color: "gray" };
    default:
      return { status, label: "Not Verified", color: "gray" };
  }
}
