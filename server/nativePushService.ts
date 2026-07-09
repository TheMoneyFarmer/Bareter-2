import { GoogleAuth } from "google-auth-library";
import { db } from "./db";
import { devicePushTokens } from "@shared/schema";
import { eq } from "drizzle-orm";

let authClient: GoogleAuth | null = null;

function getAuthClient(): GoogleAuth | null {
  if (authClient) return authClient;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const credentials = JSON.parse(raw);
    authClient = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    return authClient;
  } catch {
    return null;
  }
}

async function getAccessToken(): Promise<string | null> {
  const client = getAuthClient();
  if (!client) return null;
  try {
    const result = await client.getAccessToken();
    // getAccessToken() may return string | null | { token: string } depending on version
    if (typeof result === "string") return result;
    if (result && typeof result === "object" && "token" in result) return (result as { token: string | null }).token;
    return null;
  } catch {
    return null;
  }
}

export async function saveDeviceToken(userId: string, token: string, platform: string) {
  const existing = await db
    .select({ id: devicePushTokens.id })
    .from(devicePushTokens)
    .where(eq(devicePushTokens.token, token))
    .limit(1);

  if (existing[0]) {
    // Re-assign to this user if the token was registered before (e.g. re-login)
    await db
      .update(devicePushTokens)
      .set({ userId })
      .where(eq(devicePushTokens.token, token));
  } else {
    await db.insert(devicePushTokens).values({ userId, token, platform });
  }
}

export async function removeDeviceToken(token: string) {
  await db.delete(devicePushTokens).where(eq(devicePushTokens.token, token));
}

export async function removeAllDeviceTokensForUser(userId: string) {
  await db.delete(devicePushTokens).where(eq(devicePushTokens.userId, userId));
}

export async function sendNativePushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string },
) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return; // FCM not configured — silently skip

  const accessToken = await getAccessToken();
  if (!accessToken) return;

  const tokens = await db
    .select()
    .from(devicePushTokens)
    .where(eq(devicePushTokens.userId, userId));

  if (!tokens.length) return;

  await Promise.allSettled(
    tokens.map(async (row) => {
      const body = {
        message: {
          token: row.token,
          notification: { title: payload.title, body: payload.body },
          ...(payload.url ? { data: { url: payload.url } } : {}),
          apns: {
            payload: { aps: { sound: "default", badge: 1 } },
          },
          android: {
            notification: { sound: "default" },
          },
        },
      };

      const resp = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { error?: { status?: string } };
        // Stale / invalid token — clean it up so we don't keep trying
        if (
          err?.error?.status === "UNREGISTERED" ||
          err?.error?.status === "INVALID_ARGUMENT"
        ) {
          await db
            .delete(devicePushTokens)
            .where(eq(devicePushTokens.id, row.id));
        }
      }
    }),
  );
}
