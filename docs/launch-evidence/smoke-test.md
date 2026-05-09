# Smoke-test evidence — production launch

**Status:** _IN PROGRESS — all prerequisite evidence files must be ✅ before the smoke test begins. Founder fills in Status column (✅ / ❌ / ⚠️) and drops actual screenshots into `screenshots/` for each row._

> Procedure lives in [`../LAUNCH_SMOKE_TEST.md`](../LAUNCH_SMOKE_TEST.md).
> Walk it on `https://bareter.com` once on desktop, once on mobile. Fill
> in every row, drop screenshots into `screenshots/`, then commit. This
> file IS the launch go / no-go record.

## Run metadata

| Field | Value |
| --- | --- |
| Run date (UTC) | `TODO: e.g. 2026-05-15T09:30Z` |
| Run by | `TODO: founder full name` |
| Production commit SHA | `TODO: copy from bareter.com/admin → Deployments` |
| Desktop browser + version | `TODO: e.g. Chrome 124 on macOS 14` |
| Mobile browser + device | `TODO: e.g. Safari on iPhone 15, iOS 17` |
| Test inbox A | `TODO: e.g. founder+smokeA@gmail.com — fresh account, never registered` |
| Test inbox B | `TODO: e.g. founder+smokeB@gmail.com — fresh account, never registered` |

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

| # | Step | Status | Screenshot | Notes (expected pass criteria) |
| --- | --- | --- | --- | --- |
| 1 | Homepage loads, TLS, no console errors |  | `desktop-01-home.png` | Green padlock on `https://bareter.com`; hero section visible; browser console shows 0 errors |
| 1 | Cookie banner shown + persists |  | `desktop-01-cookies.png` | Banner appears on first load; "Accept all" dismisses it; banner absent on refresh |
| 1 | EN ↔ AR language toggle (RTL) |  | `desktop-01-rtl.png` | Clicking language toggle switches UI to Arabic; layout mirrors right-to-left; toggle switches back to English |
| 1 | Dark-mode toggle persists |  | `desktop-01-dark.png` | Dark mode activates and persists across a page refresh |
| 2 | Account A registers |  | `desktop-02-register.png` | Registration form submits; account created; redirected to onboarding or dashboard |
| 2 | Welcome email A lands in inbox |  | `desktop-02-email.png` | Email from `hello@bareter.com` arrives in Inbox (not Spam); referral link contains `https://bareter.com` |
| 3 | KYC starts (Didit) |  | `desktop-03-kyc-start.png` | Clicking "Verify Identity" opens Didit iframe or redirect; no JS error |
| 3 | KYC completes + profile flips Verified |  | `desktop-03-kyc-verified.png` | Within ~60 s of completing Didit flow: profile badge shows Verified; notification "Verification Approved!" visible |
| 4 | Listing created |  | `desktop-04-listing.png` | New listing saved; redirected to listing detail page; title and images visible |
| 4 | Listing visible on /browse |  | `desktop-04-browse.png` | Listing appears on `/browse` or Explore page without page refresh or admin approval needed |
| 5 | Account B registers |  | `desktop-05-register-b.png` | Fresh account created with inbox B email; same flow as Account A |
| 5 | Welcome email B lands in inbox |  | `desktop-05-email-b.png` | Email from `hello@bareter.com` in Inbox; referral link contains `https://bareter.com` |
| 5 | Account B proposes deal |  | `desktop-05-propose.png` | Account B opens Account A's listing and submits a deal proposal; deal created in "Proposed" state |
| 6 | Account A accepts + contract generated |  | `desktop-06-contract.png` | Account A accepts the proposal; deal moves to "Accepted"; contract PDF generated and linked |
| 7 | Account A signs |  | `desktop-07-sign-a.png` | Account A signature captured; contract status shows one of two parties signed |
| 7 | Account B signs |  | `desktop-07-sign-b.png` | Account B signature captured; both parties now signed |
| 7 | Contract flips to Signed |  | `desktop-07-signed.png` | Contract status shows "Fully Signed"; both parties can download the PDF |
| 8 | Admin login at /admin |  | `desktop-08-admin.png` | Founder logs in at `/admin`; admin dashboard loads with no errors |
| 8 | Signed contract listed in admin |  | `desktop-08-admin-contract.png` | The test deal appears in Admin → Deals/Contracts with correct status |
| 8 | Signed PDF downloadable + valid |  | `desktop-08-pdf.png` | PDF opens in browser; both signatures visible; parties' names correct |
| 9 | Cookie "Manage" + analytics toggle |  | `desktop-09-consent.png` | "Manage" in cookie banner opens preference panel; analytics toggle saves and persists |
| 9 | Branded 404 page |  | `desktop-09-404.png` | `/this-page-does-not-exist` shows the branded 404 component, not a generic error |
| 10 | `/api/config` JSON sane |  | `desktop-10-config.png` | Response contains `passwordResetEnabled: true`, `cookiePolicyVersion` (non-empty string), `maintenanceMode: false` |
| 10 | No new ERROR in prod logs |  | `desktop-10-logs.png` | Deployment logs show no `[ERROR]` lines introduced during this run |
| 10 | No `[client-error]` from this run |  | _grep prod logs_ | `grep "[client-error]"` in deployment logs returns nothing new from this session |

## Mobile run

| # | Step | Status | Screenshot | Notes (expected pass criteria) |
| --- | --- | --- | --- | --- |
| 1 | Homepage loads, mobile layout OK |  | `mobile-01-home.png` | Page renders correctly at 390 px width; no horizontal scroll; hero CTA visible without scrolling |
| 1 | Cookie banner usable on small screen |  | `mobile-01-cookies.png` | Banner buttons ("Accept all", "Reject", "Manage") all tappable without zooming |
| 1 | RTL layout intact in Arabic |  | `mobile-01-rtl.png` | Language toggle switches to Arabic; bottom nav icons/labels align right-to-left; no overlapping elements |
| 1 | Dark mode legible |  | `mobile-01-dark.png` | Dark mode colours render; text contrast is readable; no white flash on toggle |
| 2 | Register flows on mobile |  | `mobile-02-register.png` | All form fields reachable; virtual keyboard does not obscure CTA; account created successfully |
| 3 | KYC completes on mobile (Didit) |  | `mobile-03-kyc.png` | Didit flow opens on device camera; completes end-to-end; profile badge flips to Verified |
| 4 | Create listing from mobile |  | `mobile-04-listing.png` | Image upload works from camera roll; all required fields reachable; listing saved successfully |
| 5 | Propose deal from mobile |  | `mobile-05-propose.png` | Deal proposal form submits; deal created in "Proposed" state |
| 6 | Accept + contract on mobile |  | `mobile-06-contract.png` | Deal acceptance completes; contract PDF link visible on deal detail page |
| 7 | E-sign on mobile (touch signature) |  | `mobile-07-sign.png` | Touch/finger signature captured in canvas; signature saved; contract status updates |
| 8 | Admin readable on mobile |  | `mobile-08-admin.png` | `/admin` loads on mobile; key tables horizontally scrollable; no layout breakage |
| 9 | Branded 404 on mobile |  | `mobile-09-404.png` | Branded 404 page renders correctly at mobile width |
| 9 | Footer phone number opens dialer |  | `mobile-09-tel.png` | Tapping the phone number in the footer opens the native phone dialler with the number pre-filled (+971 52 313 3512) |
| 9 | Bottom nav reachable + works |  | `mobile-09-nav.png` | All 5 bottom-nav items tappable; each navigates to correct page |

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
| Signed by | `TODO: founder full name` |
| Date (UTC) | `TODO: YYYY-MM-DD` |
| Production commit SHA | `TODO: must match the SHA in Run metadata above` |
| Cleared for announce? | `TODO: YES / NO` |
