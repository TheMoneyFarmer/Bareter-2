import { QueryClient, QueryFunction } from "@tanstack/react-query";

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
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
