---
name: Auth session / stale-login UX
description: Why a logged-in UI can keep failing every action with raw "Unauthorized", and the client invariants that fix it.
---

# Auth session / stale-login UX

The React Query default in this app is `staleTime: Infinity`. Once `["/api/auth/me"]`
caches a user, the SPA never re-checks, so a dead/never-established session leaves the
UI looking logged in while every protected request 401s with a raw "Unauthorized" toast.

**Invariants to keep:**
- The auth query (`/api/auth/me`) must override the global staleTime (finite + refetch
  on window focus) so dead sessions self-heal instead of lingering forever.
- On any 401 *while a user is already cached*, clear the auth cache and route to
  `/login?expired=1&redirect=<path>` (`handleAuthExpiry` in `client/src/lib/queryClient.ts`,
  wired into `apiRequest`, the global query fetcher, AND raw `fetch` upload paths like
  create-listing). Guard against redirect loops (skip when already on `/login`) and against
  false positives (only redirect when a user was actually cached — anonymous public
  browsing legitimately gets 401s).
- After a successful login, verify the session actually persisted by refetching
  `/api/auth/me`; if it comes back empty the cookie was blocked — keep the user on login.

**Why:** the production symptom was login returning 200 but every subsequent authed
request 401ing for minutes. Server was correct (session saved before responding, cookies
worked for other sessions). Root cause was the browser not sending the session cookie
back — typically an in-app browser (WhatsApp/Instagram webview) silently blocking cookies.
The only safe client fix is to detect the failure cleanly and tell the user to open the
site directly in Safari/Chrome.

**How to apply:** any time you add a protected request path or a raw `fetch` that can
401, route its failure through `handleAuthExpiry`; never assume a cached auth user is
still valid for a write action.

**Do NOT "fix" this by widening the session cookie domain.** The session cookie is
intentionally host-only (no `cookie.domain`). The admin panel lives on a separate
subdomain (`admin.bareter.com`) and relies on the apex cookie NOT being sent there for
isolation; admins sign in directly on the admin host. Setting `cookie.domain=".bareter.com"`
would leak the apex session to the admin subdomain and break that isolation. The server
config (trust proxy 1, secure in prod, sameSite lax, httpOnly, PgSession) is correct and
works for the general user base — confirmed when this symptom was investigated. When a
specific user hits "login 200 then every request 401 for minutes", treat it as their
browser blocking/not returning the first-party cookie (strict privacy / "block all
cookies" / in-app webview), not a server bug.
