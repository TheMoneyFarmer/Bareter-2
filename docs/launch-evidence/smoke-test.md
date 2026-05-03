# Smoke-test evidence — production launch

> Template for **Task #159**. The procedure lives in
> [`../LAUNCH_SMOKE_TEST.md`](../LAUNCH_SMOKE_TEST.md). Walk it on
> `https://bareter.com` once on desktop, once on mobile. Copy this file
> in place (keep filename), fill in every row, drop screenshots into
> `screenshots/`, then commit. This file IS the launch go / no-go
> record.

## Run metadata

| Field | Value |
| --- | --- |
| Run date (UTC) | _e.g. 2026-05-04T09:30Z_ |
| Run by | _founder name_ |
| Production commit SHA | _from `bareter.com/admin` → Deployments_ |
| Desktop browser + version | _e.g. Chrome 124 on macOS 14_ |
| Mobile browser + device | _e.g. Safari on iPhone 15, iOS 17_ |
| Test inbox A | _e.g. founder+smokeA@…_ |
| Test inbox B | _e.g. founder+smokeB@…_ |

## Prerequisite gate

| Task | Status (✅ / ❌) | Evidence link |
| --- | --- | --- |
| #150 Resend domain verified |  | `email-deliverability.md` |
| #151 DB backup + restore drill |  | `backup-restore-test.md` |
| #154 Custom domain + TLS live |  | `custom-domain.md` |
| #155 `PUBLIC_APP_URL` set in prod |  | `public-app-url.md` |
| #156 Didit webhooks point at prod |  | `didit-webhook.md` |
| #157 Branded 404 + ErrorBoundary |  | _merged in main_ |
| #158 Pricing reflects free launch |  | _merged in main_ |

If any row is ❌, **stop**. Do not run the smoke test until it's green.

## Desktop run

| # | Step | Status | Screenshot | Notes |
| --- | --- | --- | --- | --- |
| 1 | Homepage loads, TLS, no console errors |  | `desktop-01-home.png` |  |
| 1 | Cookie banner shown + persists |  | `desktop-01-cookies.png` |  |
| 1 | EN ↔ AR language toggle (RTL) |  | `desktop-01-rtl.png` |  |
| 1 | Dark-mode toggle persists |  | `desktop-01-dark.png` |  |
| 2 | Account A registers |  | `desktop-02-register.png` |  |
| 2 | Welcome email A lands in inbox |  | `desktop-02-email.png` |  |
| 3 | KYC starts (Didit) |  | `desktop-03-kyc-start.png` |  |
| 3 | KYC completes + profile flips Verified |  | `desktop-03-kyc-verified.png` |  |
| 4 | Listing created |  | `desktop-04-listing.png` |  |
| 4 | Listing visible on /browse |  | `desktop-04-browse.png` |  |
| 5 | Account B registers |  | `desktop-05-register-b.png` |  |
| 5 | Welcome email B lands in inbox |  | `desktop-05-email-b.png` |  |
| 5 | Account B proposes deal |  | `desktop-05-propose.png` |  |
| 6 | Account A accepts + contract generated |  | `desktop-06-contract.png` |  |
| 7 | Account A signs |  | `desktop-07-sign-a.png` |  |
| 7 | Account B signs |  | `desktop-07-sign-b.png` |  |
| 7 | Contract flips to Signed |  | `desktop-07-signed.png` |  |
| 8 | Admin login at /admin |  | `desktop-08-admin.png` |  |
| 8 | Signed contract listed in admin |  | `desktop-08-admin-contract.png` |  |
| 8 | Signed PDF downloadable + valid |  | `desktop-08-pdf.png` |  |
| 9 | Cookie "Manage" + analytics toggle |  | `desktop-09-consent.png` |  |
| 9 | Branded 404 page |  | `desktop-09-404.png` |  |
| 10 | `/api/config` JSON sane |  | `desktop-10-config.png` |  |
| 10 | No new ERROR in prod logs |  | `desktop-10-logs.png` |  |
| 10 | No `[client-error]` from this run |  | _grep prod logs_ |  |

## Mobile run

| # | Step | Status | Screenshot | Notes |
| --- | --- | --- | --- | --- |
| 1 | Homepage loads, mobile layout OK |  | `mobile-01-home.png` |  |
| 1 | Cookie banner usable on small screen |  | `mobile-01-cookies.png` |  |
| 1 | RTL layout intact in Arabic |  | `mobile-01-rtl.png` |  |
| 1 | Dark mode legible |  | `mobile-01-dark.png` |  |
| 2 | Register flows on mobile |  | `mobile-02-register.png` |  |
| 3 | KYC completes on mobile (Didit) |  | `mobile-03-kyc.png` |  |
| 4 | Create listing from mobile |  | `mobile-04-listing.png` |  |
| 5 | Propose deal from mobile |  | `mobile-05-propose.png` |  |
| 6 | Accept + contract on mobile |  | `mobile-06-contract.png` |  |
| 7 | E-sign on mobile (touch signature) |  | `mobile-07-sign.png` |  |
| 8 | Admin readable on mobile |  | `mobile-08-admin.png` |  |
| 9 | Branded 404 on mobile |  | `mobile-09-404.png` |  |
| 9 | Footer phone number opens dialer |  | `mobile-09-tel.png` |  |
| 9 | Bottom nav reachable + works |  | `mobile-09-nav.png` |  |

## Failures filed as hot-fix tasks

> One row per ❌ above. Project-task title must start with
> `Smoke-test blocker:`. Leave empty if every step passed.

| Step ref | Symptom (one line) | Hot-fix task # |
| --- | --- | --- |
|  |  |  |

## Degraded (non-blocking) follow-ups

> One row per ⚠️ above.

| Step ref | Symptom | Follow-up task # |
| --- | --- | --- |
|  |  |  |

## Sign-off (the formal launch go)

By signing below I confirm I personally walked every required step
above on the production custom domain, both desktop and mobile, that
no row in the **Failures** table is open, and that Bareter is cleared
for public announcement.

| Field | Value |
| --- | --- |
| Signed by | _founder name_ |
| Date (UTC) | _YYYY-MM-DD_ |
| Production commit SHA | _matches Run metadata above_ |
| Cleared for announce? | _YES / NO_ |
