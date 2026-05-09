# Smoke-test evidence — production launch

**Status:** IN PROGRESS — prerequisite blockers found (see Prerequisite gate below). Automated checks completed 2026-05-09. Steps requiring physical founder presence are marked ⚠️ PENDING.

> Procedure lives in [`../LAUNCH_SMOKE_TEST.md`](../LAUNCH_SMOKE_TEST.md).
> Walk it on `https://bareter.com` once on desktop, once on mobile. Fill
> in every row, drop screenshots into `screenshots/`, then commit. This
> file IS the launch go / no-go record.

---

## Run metadata

| Field | Value |
| --- | --- |
| Run date (UTC) | `2026-05-09 (automated checks); TODO: add founder walk date` |
| Run by | `Automated pre-check by agent + TODO: founder full name (manual run)` |
| Production commit SHA | `TODO: copy from bareter.com/admin → Deployments` |
| Desktop browser + version | `TODO: e.g. Chrome 124 on macOS 14` |
| Mobile browser + device | `TODO: e.g. Safari on iPhone 15, iOS 17` |
| Test inbox A | `TODO: e.g. founder+smokeA@gmail.com — fresh account, never registered` |
| Test inbox B | `TODO: e.g. founder+smokeB@gmail.com — fresh account, never registered` |

---

## Prerequisite gate

| Task | Status | Evidence link | Notes |
| --- | --- | --- | --- |
| #152 Resend domain verified | ❌ | `email-deliverability.md` | SPF, DKIM (resend._domainkey, resend2._domainkey), and bounce MX all missing from DNS — verified via DNS-over-HTTPS 2026-05-09 |
| #151 DB backup + restore drill | ⚠️ PENDING | `backup-restore-test.md` | PITR drill not yet performed; requires founder action in Replit dashboard |
| #154 Custom domain + TLS live | ⚠️ PARTIAL | `custom-domain.md` | Apex `https://bareter.com` is live (Let's Encrypt, TLSv1.3, expires 2026-07-30); `www.bareter.com` CNAME is NXDOMAIN — not configured |
| #155 `PUBLIC_APP_URL` set in prod | ✅ | `public-app-url.md` | Confirmed: `/api/waitlist/mode` returns `appUrl: "https://bareter.com"` |
| #156 Didit webhooks point at prod | ⚠️ PENDING | `didit-webhook.md` | Handler is in the codebase; Didit dashboard must be updated to custom domain; E2E test not yet run |
| #157 Branded 404 + ErrorBoundary | ⚠️ PARTIAL | _merged in main_ | From UAE IPs, the branded 404 renders. From non-UAE IPs, the geo-gate shows instead (expected behavior). Founder to confirm from UAE device. |
| #158 Pricing reflects free launch | ✅ | _merged in main_ | No breaking changes observed on live site |

**STOP — do not run the smoke test until #152 (Resend DKIM/SPF), #151 (PITR drill), and #154 (www CNAME) are resolved.**

---

## Desktop run

| # | Step | Status | Screenshot | Notes |
| --- | --- | --- | --- | --- |
| 1 | Homepage loads, TLS, no console errors | ✅ | `desktop-01-home.png` | `https://bareter.com` HTTP/2 200; TLSv1.3; Let's Encrypt CN=bareter.com; HSTS set; hero section visible — confirmed 2026-05-09 |
| 1 | Cookie banner shown + persists | ✅ | `desktop-01-cookies.png` | Banner with "Accept all", "Reject non-essential", "Manage" visible on first load — confirmed in screenshot 2026-05-09 |
| 1 | EN ↔ AR language toggle (RTL) | ⚠️ PENDING | `desktop-01-rtl.png` | Toggle visible in header; RTL switch requires interactive browser session — founder to verify |
| 1 | Dark-mode toggle persists | ⚠️ PENDING | `desktop-01-dark.png` | Toggle visible in header; persistence requires interactive browser session — founder to verify |
| 2 | Account A registers | ⚠️ PENDING | `desktop-02-register.png` | Requires real email inbox A; founder to walk this step |
| 2 | Welcome email A lands in inbox | ⚠️ PENDING | `desktop-02-email.png` | Blocked by #152 (Resend DKIM missing) — complete email DNS setup first |
| 3 | KYC starts (Didit) | ⚠️ PENDING | `desktop-03-kyc-start.png` | Requires Didit dashboard webhook update (#156) and real KYC document |
| 3 | KYC completes + profile flips Verified | ⚠️ PENDING | `desktop-03-kyc-verified.png` | Requires live Didit flow with real document; webhook must be configured |
| 4 | Listing created | ⚠️ PENDING | `desktop-04-listing.png` | Requires logged-in session; founder to walk this step |
| 4 | Listing visible on /browse | ⚠️ PENDING | `desktop-04-browse.png` | Requires logged-in session; founder to walk this step |
| 5 | Account B registers | ⚠️ PENDING | `desktop-05-register-b.png` | Requires real email inbox B; founder to walk this step |
| 5 | Welcome email B lands in inbox | ⚠️ PENDING | `desktop-05-email-b.png` | Blocked by #152 (Resend DKIM missing) — complete email DNS setup first |
| 5 | Account B proposes deal | ⚠️ PENDING | `desktop-05-propose.png` | Requires both accounts active; founder to walk this step |
| 6 | Account A accepts + contract generated | ⚠️ PENDING | `desktop-06-contract.png` | Requires deal in Proposed state; founder to walk this step |
| 7 | Account A signs | ⚠️ PENDING | `desktop-07-sign-a.png` | Requires contract generated; founder to walk this step |
| 7 | Account B signs | ⚠️ PENDING | `desktop-07-sign-b.png` | Requires Account A signed; founder to walk this step |
| 7 | Contract flips to Signed | ⚠️ PENDING | `desktop-07-signed.png` | Requires both signatures; founder to walk this step |
| 8 | Admin login at /admin | ⚠️ PENDING | `desktop-08-admin.png` | Requires founder admin credentials; founder to walk this step |
| 8 | Signed contract listed in admin | ⚠️ PENDING | `desktop-08-admin-contract.png` | Requires completed deal; founder to walk this step |
| 8 | Signed PDF downloadable + valid | ⚠️ PENDING | `desktop-08-pdf.png` | Requires signed contract; founder to walk this step |
| 9 | Cookie "Manage" + analytics toggle | ⚠️ PENDING | `desktop-09-consent.png` | Requires interactive browser session; founder to verify |
| 9 | Branded 404 page | ⚠️ PENDING | `desktop-09-404.png` | Verify from UAE device; from non-UAE IPs the geo-gate shows (expected) |
| 10 | `/api/config` JSON sane | ✅ | `desktop-10-config.png` | `{"passwordResetEnabled":true,"cookiePolicyVersion":1,"maintenanceMode":false}` — confirmed 2026-05-09 |
| 10 | No new ERROR in prod logs | ⚠️ PENDING | `desktop-10-logs.png` | Founder to check Replit deployment logs after the walk |
| 10 | No `[client-error]` from this run | ⚠️ PENDING | _grep prod logs_ | Founder to grep deployment logs after the walk |

---

## Mobile run

| # | Step | Status | Screenshot | Notes |
| --- | --- | --- | --- | --- |
| 1 | Homepage loads, mobile layout OK | ⚠️ PENDING | `mobile-01-home.png` | Requires physical mobile device; founder to verify at 390 px width |
| 1 | Cookie banner usable on small screen | ⚠️ PENDING | `mobile-01-cookies.png` | Requires physical mobile device; all three buttons must be tappable |
| 1 | RTL layout intact in Arabic | ⚠️ PENDING | `mobile-01-rtl.png` | Requires physical mobile device with Arabic language toggle |
| 1 | Dark mode legible | ⚠️ PENDING | `mobile-01-dark.png` | Requires physical mobile device |
| 2 | Register flows on mobile | ⚠️ PENDING | `mobile-02-register.png` | Requires physical mobile device and real email inbox |
| 3 | KYC completes on mobile (Didit) | ⚠️ PENDING | `mobile-03-kyc.png` | Requires Didit webhook configured (#156) and physical device with camera |
| 4 | Create listing from mobile | ⚠️ PENDING | `mobile-04-listing.png` | Requires physical mobile device with camera roll access |
| 5 | Propose deal from mobile | ⚠️ PENDING | `mobile-05-propose.png` | Requires both accounts active on mobile |
| 6 | Accept + contract on mobile | ⚠️ PENDING | `mobile-06-contract.png` | Requires deal in Proposed state |
| 7 | E-sign on mobile (touch signature) | ⚠️ PENDING | `mobile-07-sign.png` | Requires touch-capable device; canvas signature flow |
| 8 | Admin readable on mobile | ⚠️ PENDING | `mobile-08-admin.png` | Requires founder admin credentials on mobile browser |
| 9 | Branded 404 on mobile | ⚠️ PENDING | `mobile-09-404.png` | Verify from UAE device; from non-UAE IPs geo-gate shows |
| 9 | Footer phone number opens dialer | ⚠️ PENDING | `mobile-09-tel.png` | Tap +971 52 313 3512 in footer; native dialer must open |
| 9 | Bottom nav reachable + works | ⚠️ PENDING | `mobile-09-nav.png` | All 5 bottom-nav items must navigate correctly |

---

## Failures filed as hot-fix tasks

> One row per ❌ above. Project-task title must start with `Smoke-test blocker:`.

| Step ref | Symptom (one line) | Hot-fix task # |
| --- | --- | --- |
| Prereq #152 | Resend DKIM records (`resend._domainkey`, `resend2._domainkey`) and SPF TXT not in DNS — emails cannot be delivered | File task: `Smoke-test blocker: add Resend DKIM + SPF DNS records` |
| Prereq #154 | `www.bareter.com` CNAME is NXDOMAIN — www subdomain does not resolve | File task: `Smoke-test blocker: configure www.bareter.com CNAME` |

---

## Degraded (non-blocking) follow-ups

> One row per ⚠️ above.

| Step ref | Symptom | Follow-up task # |
| --- | --- | --- |
| Prereq #154 | DMARC uses relaxed alignment (`adkim=r; aspf=r`) rather than strict — tighten after launch | Post-launch |

---

## Sign-off (the formal launch go)

**NOT SIGNED — launch prerequisites not yet complete.** The following blockers must be resolved first:
1. Resend DKIM + SPF DNS records missing (email delivery broken)
2. www.bareter.com CNAME not configured (www doesn't resolve)
3. DB backup + restore drill not yet performed
4. Didit webhooks not yet pointed at custom domain

By signing below I confirm I personally walked every required step above on the production custom domain, both desktop and mobile, that no row in the **Failures** table is open, and that Bareter is cleared for public announcement.

| Field | Value |
| --- | --- |
| Signed by | `TODO: founder full name` |
| Date (UTC) | `TODO: YYYY-MM-DD` |
| Production commit SHA | `TODO: must match the SHA in Run metadata above` |
| Cleared for announce? | `TODO: YES / NO` |
