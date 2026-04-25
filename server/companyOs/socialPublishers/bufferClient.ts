// Buffer publisher — single OAuth token covers IG, LinkedIn, X, FB.
//
// The founder's preferred entry point because Buffer brokers all four
// channels behind one credential. We POST to the legacy v1 update API
// (`/1/updates/create.json`) which is still the documented endpoint
// for "post now to N profiles" — the v2 schema is locked behind the
// Buffer team's preview.
//
// Required env:
//   • BUFFER_ACCESS_TOKEN    — long-lived OAuth token
//   • BUFFER_PROFILE_IDS     — comma-separated profile ids to fan out to
//
// Failure-mode design: never throws on import. Config is checked
// lazily at call time so the rest of the Company OS keeps running
// even when Buffer hasn't been wired up yet.

const BUFFER_API = "https://api.bufferapp.com/1/updates/create.json";

export function isBufferConfigured(): boolean {
  return Boolean(
    (process.env.BUFFER_ACCESS_TOKEN || "").trim() &&
      (process.env.BUFFER_PROFILE_IDS || "").trim(),
  );
}

export interface BufferPublishResult {
  channel: "buffer";
  externalId?: string;
  externalUrl?: string;
  message: string;
}

function bufferProfileIds(): string[] {
  return (process.env.BUFFER_PROFILE_IDS || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export async function publishViaBuffer(text: string): Promise<BufferPublishResult> {
  const token = (process.env.BUFFER_ACCESS_TOKEN || "").trim();
  const profiles = bufferProfileIds();
  if (!token || profiles.length === 0) {
    throw new Error(
      "Buffer not configured (BUFFER_ACCESS_TOKEN / BUFFER_PROFILE_IDS missing)",
    );
  }
  const body = new URLSearchParams();
  body.set("access_token", token);
  body.set("text", text);
  body.set("now", "true");
  for (const id of profiles) body.append("profile_ids[]", id);

  const res = await fetch(BUFFER_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const err = new Error(
      `Buffer publish failed: HTTP ${res.status} ${t.slice(0, 200)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    updates?: { id?: string; service_link?: string }[];
    message?: string;
  };
  if (json.success === false) {
    throw new Error(`Buffer publish rejected: ${json.message || "unknown"}`);
  }
  const first = json.updates?.[0];
  return {
    channel: "buffer",
    externalId: first?.id,
    externalUrl: first?.service_link,
    message: `Buffered to ${profiles.length} profile${profiles.length === 1 ? "" : "s"}.`,
  };
}
