import { getIntegrationCredential, isIntegrationConfigured } from "./credentials";

export async function isDriveConfigured(): Promise<boolean> {
  return isIntegrationConfigured(["google_access_token", "google_drive_folder_id"]);
}

async function getValidAccessToken(): Promise<string | null> {
  const accessToken = await getIntegrationCredential("google_access_token");
  if (!accessToken) return null;

  const refreshToken = await getIntegrationCredential("google_refresh_token");
  const clientId = await getIntegrationCredential("google_client_id");
  const clientSecret = await getIntegrationCredential("google_client_secret");

  if (refreshToken && clientId && clientSecret) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { access_token?: string };
        if (data.access_token) return data.access_token;
      }
    } catch { /* fall through to stored token */ }
  }

  return accessToken;
}

export async function uploadFileToDrive(
  filename: string,
  content: Buffer,
  mimeType = "application/pdf",
): Promise<{ fileId: string; webViewLink: string } | null> {
  const accessToken = await getValidAccessToken();
  const folderId = await getIntegrationCredential("google_drive_folder_id");
  if (!accessToken || !folderId) return null;

  try {
    const boundary = "bareter-multipart-boundary";
    const metadata = JSON.stringify({
      name: filename,
      parents: [folderId],
      mimeType,
    });

    const bodyParts = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      metadata,
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      "",
    ].join("\r\n");

    const bodyEnd = `\r\n--${boundary}--`;
    const bodyBuffer = Buffer.concat([
      Buffer.from(bodyParts, "utf8"),
      content,
      Buffer.from(bodyEnd, "utf8"),
    ]);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(bodyBuffer.length),
        },
        body: bodyBuffer,
      },
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text().catch(() => "");
      console.error(`[Drive] Upload failed (${uploadRes.status}):`, err);
      return null;
    }

    const result = await uploadRes.json() as { id?: string; webViewLink?: string };
    return result.id ? { fileId: result.id, webViewLink: result.webViewLink ?? "" } : null;
  } catch (err) {
    console.error("[Drive] uploadFileToDrive error:", err);
    return null;
  }
}
