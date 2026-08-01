# Bareter Security Audit Report

**Date:** 2026-06-29 | **Scope:** Full codebase | **Auditor:** Senior Security Engineer

---

## Remediation Status (2026-06-29)

15 of 16 findings patched on branch `bill/launch-fixes`. Vuln 16 left as a
documented product decision (see note below).

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | CRITICAL | CSRF bypass via `X-Forwarded-Host` | ✅ Fixed |
| 2 | CRITICAL | Full user rows in followers/following API | ✅ Fixed |
| 3 | CRITICAL | SQL injection via `sql.raw()` | ✅ Fixed |
| 4 | CRITICAL | OTP generated with `Math.random()` | ✅ Fixed |
| 5 | CRITICAL | KYC docs to public dir off-Replit | ✅ Fixed |
| 6 | CRITICAL | `dev-set-password` exposed if `NODE_ENV` unset | ✅ Fixed (fail-closed) |
| 7 | HIGH | IDOR — mark any user's notifications read | ✅ Fixed |
| 8 | HIGH | Sensitive fields on public profile (exploited) | ✅ Fixed |
| 9 | HIGH | Deal enrichment leaks user rows | ✅ Fixed (+ message sender) |
| 10 | MEDIUM | Session fixation on login | ✅ Fixed (login/register/OAuth) |
| 11 | MEDIUM | Open redirect via `//` in OAuth | ✅ Fixed |
| 12 | MEDIUM | Presigned URL bypasses file-type check | ✅ Fixed (contentType allowlist) |
| 13 | MEDIUM | OTPs stored plaintext | ✅ Fixed (SHA-256 hashed) |
| 14 | MEDIUM | Admin creators endpoint returns hashes | ✅ Fixed |
| 15 | MEDIUM | Collab applications leak creator rows | ✅ Fixed |
| 16 | MEDIUM | Account enumeration via registration | ⚠️ Accepted risk |

Also hardened (same root cause as Vuln 4): referral codes and beta-invite codes
now use CSPRNG (`crypto.randomBytes`) instead of `Math.random()`.

**Vuln 16 note:** Distinct "email/phone already registered" messages enable
enumeration, but the registration route is already rate-limited to 5/hour per IP,
and a generic message degrades signup UX. Left as-is pending a product call. To
close it, return a uniform response and confirm existence out-of-band via email.

**User sanitization:** reconciled onto `main`, which already added
`sanitizePublicUser()` in `server/security.ts` (strips password, all tokens/OTPs,
OAuth IDs, didit data, unsubscribe token, verification timestamps, plus admin/ban
flags and notification prefs; honours `showEmail`/`showPhone`). It is applied at
every storage join that embeds a user and on the public profile route. This
branch reuses that helper — the earlier standalone `server/sanitize.ts` was
dropped to avoid duplication. The only user-embedding path `main` had missed,
`searchCreators` (admin), is now sanitized too.

> ⚠️ **Deployment requirement:** the dev auth endpoints are now fail-closed and
> only enable when `ENABLE_DEV_AUTH_ENDPOINTS=true` **and** `NODE_ENV !== production`.
> Local dev that relies on `/api/auth/dev-set-password` must set that env var.

---

## CRITICAL — Fix Immediately

---

### Vuln 1: CSRF Bypass via `X-Forwarded-Host` Header Forgery
**File:** `server/security.ts:59–62`
**Severity:** CRITICAL | **Confidence:** 85%

**Description:** `getAllowedOriginHosts()` reads `x-forwarded-host` and adds it directly to the trusted-origin allowlist. If the Replit proxy does not strip this header from incoming client requests, an attacker can forge it:

```ts
const selfHost = (req.headers["x-forwarded-host"] as string) || req.headers.host;
if (selfHost) allowed.add(selfHost);  // attacker controls this
```

**Exploit:** Send any state-changing POST with `X-Forwarded-Host: attacker.com` and `Origin: https://attacker.com`. The server adds `attacker.com` to its own allowlist, then passes its own CSRF check. Every write endpoint (`POST /api/listings`, `PATCH /api/deals/:id`, etc.) becomes CSRF-able.

**Fix:** Never use `x-forwarded-host` as a trusted origin source. Only use `req.headers.host` or environment-defined `ALLOWED_ORIGINS`.

---

### Vuln 2: Full User Rows (Including Password Hash) Leaked via Followers/Following API
**File:** `server/routes.ts:2871–2882`, `server/storage.ts:730–756`
**Severity:** CRITICAL | **Confidence:** 99%

**Description:** `getFollowers()` and `getFollowing()` return full raw `User` DB rows embedded as `.follower`/`.following`. The routes do zero stripping before `res.json()`. Any authenticated user gets `password` (bcrypt hash), `googleId`, `appleId`, `unsubscribeToken`, plaintext OTP codes, and phone numbers for every person in any user's social graph.

**Exploit:** Call `GET /api/users/<victim-id>/followers` — receive full DB rows for all followers including their password hashes and live OTP codes. This is effectively a partial user-table dump via the social graph.

**Fix:** Apply `sanitizePublicUser()` in `getFollowers()`/`getFollowing()` before returning user objects.

---

### Vuln 3: SQL Injection via `sql.raw()` with User-Controlled Category Values
**File:** `server/storage.ts:1382`
**Severity:** CRITICAL | **Confidence:** 85%

**Description:** The category search uses `sql.raw()` with a manual single-quote escape that bypasses Drizzle's parameterization entirely:

```ts
sql`${listings.categories} ?| array[${sql.raw(
  cats.map(c => `'${c.replace(/'/g, "''")}'`).join(",")
)}]`
```

`sql.raw()` is never safe for user-originated data. Category values are set by users at listing creation and stored in a JSON column — they flow directly into this `sql.raw()` call. PostgreSQL backslash-escape sequences or multi-byte encoding tricks can defeat the naive `replace(/'/g, "''")` defense.

**Exploit:** Create a listing with a crafted category string containing a SQL escape sequence → trigger the search path → break out of the SQL string literal → arbitrary SQL execution.

**Fix:** Replace with Drizzle's `sql.join()` with proper parameterized values, or use a PostgreSQL `ANY($1::text[])` bind with a proper array parameter.

---

### Vuln 4: OTP Generated with `Math.random()` (Not CSPRNG)
**File:** `server/routes.ts:915`, `server/routes.ts:1711`
**Severity:** CRITICAL | **Confidence:** 100%

**Description:** Both phone verification and password-change OTPs use V8's `Math.random()` (xorshift128+), whose internal state can be reconstructed from ~512 observed outputs from the same process:

```ts
const code = Math.floor(100000 + Math.random() * 900000).toString();
```

**Exploit:** An attacker who can trigger OTPs (or observe any `Math.random()` output from the server process) can reconstruct the PRNG state and predict the next OTP value for any target account — enabling account takeover via phone verification bypass.

**Fix:** Replace with `crypto.randomInt(100000, 1000000)`.

---

### Vuln 5: KYC/Verification Documents Written to Public Directory in Non-Replit Environments
**File:** `server/routes.ts:1429`, `server/routes.ts:1459–1492`
**Severity:** CRITICAL | **Confidence:** 92%

**Description:** The private-document upload path only routes to the private object storage bucket when `isOnReplit` is true. In any other environment (local dev, staging, CI), it falls through to writing the file to `./uploads/` which is served publicly via `express.static` with no auth:

```ts
if (isOnReplit) {
  // private bucket path
} else {
  // falls through to public /uploads/ dir
}
```

**Exploit:** On any non-Replit deployment, uploading a KYC document or business license writes it to a publicly accessible URL. The URL is stored in the DB and can appear in admin API responses, making sensitive ID documents fully public.

**Fix:** Fail explicitly when `isOnReplit` is false and the upload type is private. Never silently fall back to a public path for private documents.

---

### Vuln 6: `dev-set-password` Endpoint Allows Unauthenticated Password Reset for Any Account
**File:** `server/routes.ts:1082–1123`
**Severity:** CRITICAL | **Confidence:** 90%

**Description:** A `POST /api/auth/dev-set-password` endpoint allows password changes for any account by email with zero authentication, gated only by `NODE_ENV !== "production"`. On Replit and similar platforms, `NODE_ENV` is frequently unset or misconfigured on live deployments.

**Exploit:** If `NODE_ENV` is unset on any live environment, an attacker hits this endpoint with any target email and immediately takes over that account without knowing the original password.

**Fix:** Remove these endpoints entirely from production builds, or guard them behind a `ADMIN_DEV_SECRET` environment variable in addition to the `NODE_ENV` check.

---

## HIGH — Fix Before Next Release

---

### Vuln 7: IDOR — Any User Can Mark Another User's Notifications as Read
**File:** `server/routes.ts:3716–3724`
**Severity:** HIGH | **Confidence:** 92%

**Description:** `PATCH /api/notifications/:id/read` calls `storage.markNotificationAsRead(id)` with no check that the notification belongs to `req.session.userId`. The sibling `DELETE` endpoint at line 3736 correctly includes the ownership check — this asymmetry confirms it's an oversight.

**Exploit:** Attacker enumerates notification UUIDs and silently clears the victim's unread deal alerts, security warnings, or payment notifications, causing them to miss critical events.

**Fix:** Add `eq(notifications.userId, req.session.userId)` to `markNotificationAsRead`.

---

### Vuln 8: Sensitive Fields Exposed on Public Profile Endpoint
**File:** `server/routes.ts:6428`
**Severity:** HIGH | **Confidence:** 95%

**Description:** The `/api/users/:id` endpoint strips only `password`, `emailVerificationToken`, and `passwordResetToken` — returning everything else including `phone`, `googleId`, `appleId`, `unsubscribeToken`, `passwordChangeOtp`, `phoneVerificationCode`, `diditSessionId`, and KYC metadata to any authenticated caller.

**Exploit (unsubscribeToken):** Fetch any user's profile → extract `unsubscribeToken` → hit the unsubscribe endpoint → victim stops receiving all email notifications without their knowledge.

**Fix:** Implement a strict `sanitizePublicUser()` allowlist applied consistently at the storage layer.

> **Note:** This is the vulnerability confirmed to have been exploited by the attacker who sent the sample user files.

---

### Vuln 9: Full User Rows Returned by Deal Enrichment (Including Password Hash)
**File:** `server/storage.ts:630–636`
**Severity:** HIGH | **Confidence:** 92%

**Description:** `_enrichDealsWithUsers()` attaches raw DB user rows as `.seeker` and `.provider` on deal objects with no sanitization. Any user party to a deal receives the counterparty's full user row including their bcrypt password hash, OAuth IDs, plaintext OTP codes, and unsubscribe token.

**Fix:** Apply `sanitizePublicUser()` inside `_enrichDealsWithUsers()` before populating the user map.

---

## MEDIUM — Fix Soon

---

### Vuln 10: Session Fixation — Session ID Not Regenerated on Login
**File:** `server/routes.ts:1007`, `server/routes.ts:821`
**Severity:** MEDIUM | **Confidence:** 85%

On login and registration, the code sets `req.session.userId` but never calls `req.session.regenerate()`. An attacker who obtains a pre-login session ID can fix it before the victim authenticates, then use that same session as the now-authenticated user.

**Fix:** Call `req.session.regenerate()` before setting `req.session.userId` on all auth flows (login, register, Google OAuth, Apple OAuth).

---

### Vuln 11: Open Redirect via Protocol-Relative URL in OAuth `redirect` Parameter
**File:** `server/routes.ts:399–401`, `server/routes.ts:481`
**Severity:** MEDIUM | **Confidence:** 85%

```ts
const redirect = (req.query.redirect as string) || "/browse";
(req.session as any).oauthRedirect = redirect.startsWith("/") ? redirect : "/browse";
```

`//attacker.com/path` passes the `startsWith("/")` check but is treated by browsers as `https://attacker.com/path`. The same pattern exists in the Apple OAuth flow.

**Exploit:** `https://bareter.com/auth/google?redirect=//attacker.com` → after login, victim is redirected to attacker's domain.

**Fix:** Validate redirects are same-origin: `redirect.startsWith("/") && !redirect.startsWith("//")`.

---

### Vuln 12: Presigned Upload URL Bypasses File-Type Validation
**File:** `server/replit_integrations/object_storage/routes.ts:47–68`
**Severity:** MEDIUM | **Confidence:** 88%

`POST /api/uploads/request-url` issues a signed GCS PUT URL accepting any `contentType` from the client without validation. An authenticated user can upload arbitrary HTML/JS (`contentType: "text/html"`) directly to object storage, bypassing the magic-byte check on the main `/api/upload` path. Combined with the unauthenticated `/objects/` route, this enables stored XSS if the storage domain is shared.

**Fix:** Validate `contentType` against an allowlist of permitted MIME types. Verify content server-side after upload.

---

### Vuln 13: OTP Stored Plaintext in Database
**File:** `server/routes.ts:918–923`, `server/routes.ts:1714–1717`
**Severity:** MEDIUM | **Confidence:** 100%

Phone and password-change OTPs are stored as plaintext in `phoneVerificationCode` and `passwordChangeOtp` columns. Password reset tokens (line 1043) are correctly hashed with SHA-256 — OTPs should receive the same treatment. A DB breach or SQL injection (see Vuln 3) exposes all pending OTPs.

**Fix:** Store `HMAC-SHA256(otp, APP_SECRET)` instead of the raw code.

---

### Vuln 14: Admin `creators` Endpoint Returns Password Hashes for All Creator Accounts
**File:** `server/routes.ts:9385–9397`
**Severity:** MEDIUM | **Confidence:** 95%

`GET /api/admin/creators` calls `storage.searchCreators()` which returns full `User` rows including `password` (bcrypt hash). A compromised admin account receives hashes for all creators in a single request, enabling offline cracking. The public `/api/creators` endpoint correctly field-selects a safe subset — the admin version does not.

**Fix:** Apply `sanitizePublicUser()` in `searchCreators()` or at the route layer.

---

### Vuln 15: Collab Applications Leak Full Creator User Rows
**File:** `server/routes.ts:9220`, `server/storage.ts:2700–2708`
**Severity:** MEDIUM | **Confidence:** 95%

`getCollabApplicationsByListing()` returns full `User` rows as `.creator` on each application. Any brand viewing collab applicants receives sensitive fields for each applying creator.

**Fix:** Apply `sanitizePublicUser()` in `getCollabApplicationsByListing()`.

---

### Vuln 16: Account Existence Enumeration via Registration API
**File:** `server/routes.ts:745`, `server/routes.ts:757`
**Severity:** MEDIUM | **Confidence:** 90%

Registration returns distinct error messages — `"Email already registered"` and `"Phone number already registered"` — allowing unauthenticated enumeration of every registered email address and phone number on the platform.

**Fix:** Return a generic message regardless of whether the email/phone is taken.

---

## Summary Table

| # | File | Severity | Finding |
|---|------|----------|---------|
| 1 | `server/security.ts:59` | **CRITICAL** | CSRF bypass via forged `X-Forwarded-Host` |
| 2 | `server/storage.ts:730` | **CRITICAL** | Full user rows (incl. password hash) in followers API |
| 3 | `server/storage.ts:1382` | **CRITICAL** | SQL injection via `sql.raw()` in category search |
| 4 | `server/routes.ts:915,1711` | **CRITICAL** | OTP generated with `Math.random()` (not CSPRNG) |
| 5 | `server/routes.ts:1429` | **CRITICAL** | KYC docs fall through to public dir in non-Replit envs |
| 6 | `server/routes.ts:1082` | **CRITICAL** | `dev-set-password` takes over any account if `NODE_ENV` unset |
| 7 | `server/routes.ts:3716` | **HIGH** | IDOR — mark any user's notifications as read |
| 8 | `server/routes.ts:6428` | **HIGH** | Sensitive fields on public profile (confirmed exploited) |
| 9 | `server/storage.ts:630` | **HIGH** | Deal enrichment leaks full user rows to counterparties |
| 10 | `server/routes.ts:1007,821` | **MEDIUM** | Session fixation — no regeneration on login |
| 11 | `server/routes.ts:399` | **MEDIUM** | Open redirect via `//attacker.com` in OAuth flow |
| 12 | `object_storage/routes.ts:47` | **MEDIUM** | Presigned URL bypasses file-type check |
| 13 | `server/routes.ts:918,1714` | **MEDIUM** | OTPs stored plaintext in DB |
| 14 | `server/routes.ts:9385` | **MEDIUM** | Admin creators endpoint returns password hashes |
| 15 | `server/routes.ts:9220` | **MEDIUM** | Collab applications leak full creator user rows |
| 16 | `server/routes.ts:745,757` | **MEDIUM** | Account enumeration via registration error messages |
