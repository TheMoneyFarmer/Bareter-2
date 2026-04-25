// LinkedIn publisher — direct text post via the UGC Posts API.
//
// Required env:
//   • LINKEDIN_ACCESS_TOKEN   — user/org token with `w_member_social`
//                               (or `w_organization_social` for company pages)
//   • LINKEDIN_AUTHOR_URN     — e.g. `urn:li:person:abc123` or
//                               `urn:li:organization:12345`

const LINKEDIN_API = "https://api.linkedin.com/v2/ugcPosts";

export function isLinkedInConfigured(): boolean {
  return Boolean(
    (process.env.LINKEDIN_ACCESS_TOKEN || "").trim() &&
      (process.env.LINKEDIN_AUTHOR_URN || "").trim(),
  );
}

export interface LinkedInPublishResult {
  channel: "linkedin";
  externalId?: string;
  externalUrl?: string;
  message: string;
}

export async function publishViaLinkedIn(text: string): Promise<LinkedInPublishResult> {
  const token = (process.env.LINKEDIN_ACCESS_TOKEN || "").trim();
  const author = (process.env.LINKEDIN_AUTHOR_URN || "").trim();
  if (!token || !author) {
    throw new Error(
      "LinkedIn not configured (LINKEDIN_ACCESS_TOKEN / LINKEDIN_AUTHOR_URN missing)",
    );
  }
  const payload = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
  const res = await fetch(LINKEDIN_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const err = new Error(
      `LinkedIn publish failed: HTTP ${res.status} ${t.slice(0, 200)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  // The UGC Posts endpoint returns the new post URN in the
  // `x-restli-id` header (and in the JSON body for newer API versions).
  let id: string | null = res.headers.get("x-restli-id");
  if (!id) {
    try {
      const body = (await res.json()) as { id?: string };
      id = body?.id ?? null;
    } catch {
      // Body might be empty — that's fine, the post still landed.
    }
  }
  return {
    channel: "linkedin",
    externalId: id || undefined,
    externalUrl: id ? `https://www.linkedin.com/feed/update/${id}` : undefined,
    message: "Posted to LinkedIn.",
  };
}
