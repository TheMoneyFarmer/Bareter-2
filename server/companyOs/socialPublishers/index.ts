// Social publisher dispatcher.
//
// Picks a single connector based on env config so the WhatsApp
// `publish post <topic>` command "just works" once the founder
// finishes the OAuth dance for one of the supported channels.
//
// Channel priority (overridable via SOCIAL_PUBLISH_CHANNEL):
//   1. buffer   — preferred because one Buffer OAuth covers IG, LI, X, FB
//   2. linkedin — direct UGC posts
//   3. meta     — IG (with image) or FB page text fallback
//
// None of the connectors throw on import — they read env at call time
// and surface a typed `PublishOutcome` so the Marketing Agent can
// render a clean WhatsApp reply rather than crashing.

import { isBufferConfigured, publishViaBuffer } from "./bufferClient";
import {
  isLinkedInConfigured,
  publishViaLinkedIn,
} from "./linkedinClient";
import { isMetaConfigured, publishViaMeta } from "./metaClient";

export type PublishChannel = "buffer" | "linkedin" | "meta";

export interface PublishSuccess {
  ok: true;
  channel: PublishChannel;
  externalId?: string;
  externalUrl?: string;
  message: string;
}

export interface PublishFailure {
  ok: false;
  reason: "not_configured" | "channel_unavailable" | "publish_failed";
  channel?: PublishChannel;
  detail: string;
}

export type PublishOutcome = PublishSuccess | PublishFailure;

const ALL_CHANNELS: PublishChannel[] = ["buffer", "linkedin", "meta"];

function isChannelConfigured(ch: PublishChannel): boolean {
  if (ch === "buffer") return isBufferConfigured();
  if (ch === "linkedin") return isLinkedInConfigured();
  return isMetaConfigured();
}

export function getConfiguredChannels(): PublishChannel[] {
  return ALL_CHANNELS.filter(isChannelConfigured);
}

export function selectChannel(): PublishChannel | null {
  const explicit = (process.env.SOCIAL_PUBLISH_CHANNEL || "")
    .toLowerCase()
    .trim() as PublishChannel | "";
  if (explicit) {
    if (!ALL_CHANNELS.includes(explicit as PublishChannel)) return null;
    return isChannelConfigured(explicit as PublishChannel)
      ? (explicit as PublishChannel)
      : null;
  }
  for (const ch of ALL_CHANNELS) {
    if (isChannelConfigured(ch)) return ch;
  }
  return null;
}

export async function publishPost(text: string): Promise<PublishOutcome> {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return { ok: false, reason: "publish_failed", detail: "Empty post body" };
  }
  const explicit = (process.env.SOCIAL_PUBLISH_CHANNEL || "")
    .toLowerCase()
    .trim();
  const ch = selectChannel();
  if (!ch) {
    if (explicit) {
      return {
        ok: false,
        reason: "channel_unavailable",
        detail: `SOCIAL_PUBLISH_CHANNEL=${explicit} but the matching credentials are missing.`,
      };
    }
    return {
      ok: false,
      reason: "not_configured",
      detail:
        "No social publisher configured. Set SOCIAL_PUBLISH_CHANNEL=buffer|linkedin|meta and the matching credentials.",
    };
  }
  try {
    const result =
      ch === "buffer"
        ? await publishViaBuffer(trimmed)
        : ch === "linkedin"
          ? await publishViaLinkedIn(trimmed)
          : await publishViaMeta(trimmed);
    return { ok: true, ...result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "publish_failed",
      channel: ch,
      detail: msg.slice(0, 400),
    };
  }
}

export {
  isBufferConfigured,
  isLinkedInConfigured,
  isMetaConfigured,
};
