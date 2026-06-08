# End-to-end smoke test on the published domain — launch checklist

This is the founder-run checklist for **Task #159**: walking the full
critical path on the production custom domain (`https://bareter.com`)
right before announcing, so production-only failures (env vars,
webhooks, email deliverability, Didit, signed cookies, custom domain
routing) are caught before real users see them.

The audit artifact for this task is
[`launch-evidence/smoke-test.md`](launch-evidence/smoke-test.md). Copy
the template, fill it in as you walk the steps, drop screenshots into
[`launch-evidence/screenshots/`](launch-evidence/screenshots/), and
commit it. That file is the go / no-go evidence.

> **Prerequisites — all must be green before you start:**
> - Task #150 (Resend domain verified) → DKIM/SPF/DMARC pass.
> - Task #151 (DB backup + restore proven) → restore drill on file.
> - Task #154 (custom domain `bareter.com` live, TLS valid).
> - Task #155 (`PUBLIC_APP_URL=https://bareter.com` on production).
> - Task #156 (Didit KYC + KYB webhooks point at
>   `https://bareter.com/api/webhooks/didit`).
> - Task #157 (branded 404 + ErrorBoundary deployed).
> - Task #158 (pricing page reflects free-launch decision).
>
> If any prerequisite is red, **do not announce** — fix it first.

---

## What you'll need

- **Two real test inboxes** you control (e.g. `founder+smoke1@…`,
  `founder+smoke2@…`). Gmail / Outlook are fine; avoid disposable
  inboxes — Resend / spam-folder behavior won't reflect real users.
- **Two phones**: one desktop browser + one mobile browser is the
  required surface (per task scope; broader cross-browser is out).
- **Two real UAE mobile numbers** that can receive SMS — phone
  verification has replaced Didit KYC as the primary identity gate
  before listing creation.
- **Founder admin login** to `https://bareter.com/admin`.
- A way to capture screenshots on both desktop and mobile.

---

## The walk — in order

> Do steps 1–8 on **desktop first** (one full pass), then repeat the
> same flow on **mobile** in a separate run. Capture a screenshot for
> every checkbox; file each into `launch-evidence/screenshots/` named
> `desktop-NN-short-label.png` or `mobile-NN-short-label.png`.

### 1. Land on the homepage
- [ ] `https://bareter.com` loads with valid TLS (padlock, no warning).
- [ ] No console errors in DevTools (Cmd-Option-J / Ctrl-Shift-J).
- [ ] Cookie banner appears on first visit; "Reject non-essential"
      dismisses it and the choice persists on reload.
- [ ] Language toggle (header → globe icon) flips EN ↔ AR and the
      layout mirrors LTR ↔ RTL.
- [ ] Dark-mode toggle (header → moon/sun) flips theme and persists.

### 2. Register account A (the offerer)
- [ ] `/register` accepts inbox A; form submits without 500.
- [ ] Welcome email **lands in the inbox, not spam**, within 2 minutes.
- [ ] The email's "From" matches `RESEND_FROM_EMAIL`, the link host is
      `https://bareter.com`, and clicking the link opens the live site.

### 3. Phone OTP verification (account A)
- [ ] From the profile / "List a barter" CTA, the phone verification
      modal opens (Didit KYC is archived — phone is the gate now).
- [ ] Enter a real UAE mobile number. SMS arrives within ~30s.
- [ ] Enter the 6-digit OTP. Bareter profile flips to **Phone
      verified** (badge or attribute visible). This proves
      `/api/auth/phone/send-otp` and `/api/auth/phone/verify-otp`
      are reachable on production.
- [ ] If the SMS does not arrive within 2 min, check Twilio →
      Programmable Messaging → Logs for a delivery error and confirm
      `TWILIO_*` Secrets are set on production.

### 4. Create a listing (account A)
- [ ] `/create-listing` accepts a title, description, image, value,
      and category; submits without error.
- [ ] The new listing appears on `/browse` (and on the public landing
      page's trending strip if it qualifies) within 30 seconds.
- [ ] Open the listing detail page in an incognito tab — it loads
      without auth.

### 5. Register account B (the requester) and propose a deal
- [ ] Repeat step 2 with inbox B (welcome email lands).
- [ ] From account B, open account A's listing and propose a barter.
- [ ] Account A receives a notification (in-app + email if enabled).

### 6. Accept and generate the contract (account A)
- [ ] Account A accepts the proposal in the deal thread.
- [ ] A **barter contract** is generated (PDF preview visible).

### 7. Both parties e-sign
- [ ] Account A's signing link works: name + signature → "Signed".
- [ ] Account B's signing link works the same way.
- [ ] After both sign, the contract status flips to **Signed**.

### 8. Admin verification of the signed contract
- [ ] Founder admin login at `https://bareter.com/admin` succeeds.
- [ ] The signed contract appears in the admin contracts view with
      both parties marked signed.
- [ ] The signed PDF is **downloadable** from admin and opens
      correctly (both signatures visible, watermark not corrupt).

### 9. Cross-cutting UI checks (desktop + mobile)
- [ ] Cookie banner: "Manage" opens the preference dialog; toggling
      analytics + saving records a fresh consent row.
- [ ] Language toggle: confirm at least one Arabic page renders RTL.
- [ ] Dark mode: every page from steps 1–8 is legible in dark mode
      (no white-on-white, no broken contrast).
- [ ] Footer phone number: on **mobile**, tapping the number opens
      the dialer with `+971523133512` pre-filled.
- [ ] 404: visit `https://bareter.com/this-route-does-not-exist` —
      branded 404 page renders with search + Home/Browse/Help.

### 10. Production-only sanity
- [ ] Hit `https://bareter.com/api/config` directly — JSON response
      with `passwordResetEnabled: true` and a `cookiePolicyVersion`.
- [ ] Production logs (Replit deployments → Logs) show **no** new
      `ERROR` lines from the smoke run beyond expected 4xx.
- [ ] No `[client-error]` lines from your own walk-through (those
      would mean a render crash hit the ErrorBoundary).

---

## Recording results

For each step:
- ✅ **PASS** — tick it in `launch-evidence/smoke-test.md` and link
  the screenshot.
- ❌ **FAIL** — tick "fail", note the symptom in one line, and **file
  a hot-fix project task immediately** (title prefix
  `Smoke-test blocker:`). Do not announce until every blocker is
  green.
- ⚠️ **DEGRADED** — works but ugly (e.g. email landed in Promotions
  tab, not Spam; mobile layout cramped). File a follow-up task but
  this does **not** block launch.

## Out of scope (per task)
- Load / performance testing.
- Cross-browser matrix beyond one desktop + one mobile browser.

## Sign-off
Once every required box on both desktop and mobile is ticked, fill in
the sign-off block at the bottom of
[`launch-evidence/smoke-test.md`](launch-evidence/smoke-test.md) with
your name, the date, and the deployment commit SHA from
`https://bareter.com/admin` → Deployments. That signature is the
formal launch go.
