import { QueryClient, QueryFunction } from "@tanstack/react-query";

// When the app believes the user is signed in (the cached /api/auth/me is a
// real user) but the server starts rejecting requests with 401, the session
// has expired or was never persisted (e.g. cookies blocked in an in-app
// browser). Without this, the SPA keeps showing a logged-in UI and every
// action fails with a raw "Unauthorized" toast. Instead, clear the stale auth
// state and send the user to sign in again so they get a clear path forward.
//
// We verify the session is truly gone before redirecting — a single background
// query returning 401 (server blip, rate-limit, etc.) must not log the user
// out. Only redirect if /api/auth/me itself confirms the session is gone.
let redirectingForAuth = false;
let authExpiryCheckPending = false;

export function handleAuthExpiry(status: number) {
  if (status !== 401) return;
  const cachedUser = queryClient.getQueryData(["/api/auth/me"]);
  if (!cachedUser) return;
  if (redirectingForAuth || authExpiryCheckPending) return;

  authExpiryCheckPending = true;
  // Confirm the session is truly gone by probing /api/auth/me directly.
  // If the session is still valid the 401 was a one-off — skip the redirect.
  fetch("/api/auth/me", { credentials: "include" })
    .then(async (res) => {
      if (res.ok) {
        // Session is alive — update the cache and bail.
        try {
          const userData = await res.json();
          queryClient.setQueryData(["/api/auth/me"], userData);
        } catch { /* ignore */ }
        return;
      }
      // Session truly gone — clear cache and redirect.
      queryClient.setQueryData(["/api/auth/me"], null);
      if (redirectingForAuth) return;
      redirectingForAuth = true;
      const current = window.location.pathname + window.location.search;
      if (!current.startsWith("/login")) {
        window.location.href = `/login?expired=1&redirect=${encodeURIComponent(current)}`;
      }
    })
    .catch(() => { /* network error — do nothing, don't log out */ })
    .finally(() => { authExpiryCheckPending = false; });
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    handleAuthExpiry(res.status);
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
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
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
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
      staleTime: 60_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
