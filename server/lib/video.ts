import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);

// Generous for a clip capped at 100MB / ~30s at "veryfast" preset — this is
// short user-recorded footage, not archival transcoding.
const TRANSCODE_TIMEOUT_MS = 120_000;

// Caps the long edge; keeps output size and encode time reasonable while
// staying comfortably HD. A smaller source is never upscaled — see the
// scale filter's min(...) below.
const MAX_DIMENSION = 1280;

export interface TranscodedVideo {
  buffer: Buffer;
  mime: "video/mp4";
  ext: "mp4";
}

/**
 * Re-encode any uploaded video to H.264/AAC MP4 with the moov atom moved to
 * the front (`+faststart`) — the one combination every major browser
 * (Safari, Chrome, Firefox, Edge) and both mobile OSes can decode.
 *
 * Without this: an iPhone's default HEVC/.MOV recording uploads fine and is
 * then simply unplayable outside Safari — the upload "worked" and the clip
 * never displays for most visitors. That was the actual production bug this
 * exists to fix, not a hypothetical.
 *
 * Returns null — never throws — on any failure (malformed input, ffmpeg
 * missing, timeout). Callers are expected to fall back to storing the
 * original upload, so a transcode problem degrades to "Safari-only, like
 * before this feature existed" rather than blocking the upload outright.
 */
export async function transcodeToMp4(input: Buffer): Promise<TranscodedVideo | null> {
  if (!ffmpegPath) {
    console.error("[video] ffmpeg-static did not resolve a binary path");
    return null;
  }

  const stamp = crypto.randomBytes(8).toString("hex");
  const inPath = path.join(os.tmpdir(), `bareter-video-in-${stamp}`);
  const outPath = path.join(os.tmpdir(), `bareter-video-out-${stamp}.mp4`);

  try {
    await fs.writeFile(inPath, input);

    // -vf scale: caps the long edge at MAX_DIMENSION, keeps aspect ratio.
    //   '-2' forces the short edge to an even number, required by yuv420p.
    //   This filter pass is also what makes ffmpeg respect an iPhone clip's
    //   rotation metadata (Display Matrix side data) when re-encoding, so
    //   portrait clips don't come out sideways.
    // -c:v libx264 -profile:v main -preset veryfast -crf 23: universally
    //   playable, fast encode, reasonable size/quality for a short
    //   user-recorded clip — not archival-quality work.
    // -pix_fmt yuv420p: without this, some HEVC/10-bit iPhone sources encode
    //   into a pixel format that even Safari itself won't play back.
    // -c:a aac -b:a 128k: universal audio codec.
    // -movflags +faststart: moves the moov atom to the front so playback can
    //   start before the whole file has downloaded — required for anything
    //   served progressively from R2/a CDN rather than a local disk.
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-i", inPath,
        "-vf", `scale='min(${MAX_DIMENSION},iw)':'-2'`,
        "-c:v", "libx264",
        "-profile:v", "main",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outPath,
      ],
      { timeout: TRANSCODE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
    );

    const buffer = await fs.readFile(outPath);
    if (buffer.length === 0) throw new Error("ffmpeg produced an empty output file");
    return { buffer, mime: "video/mp4", ext: "mp4" };
  } catch (err: any) {
    console.error("[video] transcode failed, falling back to the original upload:", err?.message ?? err);
    return null;
  } finally {
    await Promise.all([
      fs.unlink(inPath).catch(() => {}),
      fs.unlink(outPath).catch(() => {}),
    ]);
  }
}

export interface DetectedUpload {
  buffer: Buffer;
  mime: string;
  ext: string;
}

/**
 * If the detected upload is a video, replace it with a browser-universal MP4
 * via {@link transcodeToMp4}. Every other MIME type — and any video that
 * fails to transcode — passes through unchanged, so calling this can only
 * ever improve compatibility, never break an upload that used to work.
 */
export async function maybeTranscodeVideo(file: DetectedUpload): Promise<DetectedUpload> {
  if (!file.mime.startsWith("video/")) return file;
  const transcoded = await transcodeToMp4(file.buffer);
  return transcoded ?? file;
}
