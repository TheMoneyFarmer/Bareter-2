import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

// Empty string on web → all paths stay relative (same-origin, no change).
// "https://bareter.com" in native builds → absolute URL to the production API.
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

// Prefix relative paths (e.g. /objects/...) with API_BASE so images load
// correctly in the Capacitor WebView, which has no same-origin server.
export function assetUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  return `${API_BASE}${path}`;
}

/**
 * Grid/card variant of an uploaded image.
 *
 * The upload pipeline writes a ~600px WebP thumbnail beside every image at a
 * predictable `thumbs/<stem>.webp` key on the same host, so the thumbnail URL is
 * derived from the display URL by string rewrite — no extra field on the row and
 * no request to look it up.
 *
 * Returns the ORIGINAL url unchanged when it isn't a recognised upload URL
 * (data: URIs, external images, and older `/objects/...` images the backfill
 * hasn't reached). Callers should additionally fall back to the original on a
 * load error, since a thumbnail is not guaranteed to exist for older rows —
 * see `useThumbWithFallback`.
 */
export function thumbUrl(path: string | null | undefined): string {
  const full = assetUrl(path);
  if (!full || full.startsWith("data:")) return full;
  // https://<host>/<public-uploads|business|portfolio>/<stem>.<ext>
  //   -> https://<host>/thumbs/<stem>.webp
  return full.replace(
    /^(https?:\/\/[^/]+)\/(?:public-uploads|business|portfolio)\/([^/?#]+?)\.[a-z0-9]+(\?[^#]*)?$/i,
    "$1/thumbs/$2.webp",
  );
}

const MOBILE_TOKEN_KEY = "bareter_mobile_token";

export async function storeMobileToken(token: string): Promise<void> {
  await Preferences.set({ key: MOBILE_TOKEN_KEY, value: token });
}

export async function clearMobileToken(): Promise<void> {
  await Preferences.remove({ key: MOBILE_TOKEN_KEY });
}

// Returns extra headers to add on native. Returns {} on web — no change to web behavior.
export async function mobileHeaders(): Promise<Record<string, string>> {
  if (!Capacitor.isNativePlatform()) return {};
  const headers: Record<string, string> = { "X-Client": "capacitor-app" };
  const { value } = await Preferences.get({ key: MOBILE_TOKEN_KEY });
  if (value) headers["Authorization"] = `Bearer ${value}`;
  return headers;
}

// When the app believes the user is signed in (the cached /api/auth/me is a
// real user) but the server starts rejecting requests with 401, the session
// has expired or was never persisted (e.g. cookies blocked in an in-app
// browser). Without this, the SPA keeps showing a logged-in UI and every
// action fails with a raw "Unauthorized" toast. Instead, clear the stale auth
// state and send the user to sign in again so they get a clear path forward.
let redirectingForAuth = false;

export function handleAuthExpiry(status: number) {
  if (status !== 401) return;
  // Only react when we *thought* we were logged in. Public browsing where a
  // background authed query 401s for a logged-out visitor must NOT redirect.
  const cachedUser = queryClient.getQueryData(["/api/auth/me"]);
  if (!cachedUser) return;

  queryClient.setQueryData(["/api/auth/me"], null);

  if (redirectingForAuth) return;
  redirectingForAuth = true;
  const current = window.location.pathname + window.location.search;
  if (!current.startsWith("/login")) {
    window.location.href = `/login?expired=1&redirect=${encodeURIComponent(current)}`;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    handleAuthExpiry(res.status);
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Compress an image to max 1200px on the longest side before upload.
// Non-image files (video, pdf, etc.) are returned as-is.
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const MAX = 1200;
  const QUALITY = 0.82;
  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width: w, height: h } = img;
      const scale = Math.min(1, MAX / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, cw, ch);
      const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) return resolve(file); // keep original if bigger
          resolve(new File([blob], file.name, { type: outType, lastModified: Date.now() }));
        },
        outType,
        outType === "image/jpeg" ? QUALITY : undefined,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// Upload a file to /api/upload with bearer auth — use this instead of raw fetch.
export async function uploadFile(file: File, type: string): Promise<string> {
  file = await compressImage(file);
  const extra = await mobileHeaders();
  const fd = new FormData();
  fd.append("file", file);
  fd.append("type", type);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: fd,
    credentials: "include",
    headers: extra,
  });
  if (!res.ok) {
    handleAuthExpiry(res.status);
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || "Upload failed");
  }
  return ((await res.json()) as { url: string }).url;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const extra = await mobileHeaders();
  const res = await fetch(API_BASE + url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...extra,
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const extra = await mobileHeaders();
    const res = await fetch(API_BASE + (queryKey.join("/") as string), {
      credentials: "include",
      headers: extra,
    });

    if (res.status === 401) {
      handleAuthExpiry(res.status);
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
