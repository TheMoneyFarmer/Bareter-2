# Founder Launch Checklist — actions only humans can do

This is the consolidated, founder-and-team checklist of everything the
agent **cannot** perform on your behalf before you announce Bareter.
Each item is something that requires a real human inbox, a real phone,
DNS access, a third-party dashboard login, your own ID document, or a
publish click. They're listed in the order you should do them — earlier
items unlock later ones.

For each item:
- **Who** — who on your team should own it.
- **Why it matters** — what breaks if you skip it.
- **Steps** — exactly what to click / type.
- **Done when** — the checkable proof.
- **Evidence file** — where to commit the audit record (most have a
  filled-in template under `docs/launch-evidence/`).

If a row is red on launch day, **do not announce**. Fix it first.

---

## Stage 0 — Decisions to make before you click anything

### 0.1 Confirm the launch geography
- **Who:** Founder.
- **Why:** Bareter currently gates non-UAE traffic into the waitlist
  and AI features assume AED valuation.
- **Steps:** Decide explicitly: "Launch is UAE-only. Other countries
  go to the waitlist." If you want a different policy, file a task
  before continuing.
- **Done when:** You can state the launch country list out loud to a
  teammate without hedging.

### 0.2 Confirm the free-launch promise
- **Who:** Founder.
- **Why:** The pricing page now says "Free during launch — no fees,
  no commission, no subscription." If that's not what you want to
  promise publicly, the page must change before announce.
- **Steps:** Re-read `https://bareter.com/pricing` end-to-end. If
  the wording matches your stance → tick. If not → file a hot-fix
  task before announcing.
- **Done when:** You're comfortable defending the page on the record.

---

## Stage 1 — Replit / Deployment plumbing

### 1.1 Pick the right deployment plan & confirm DB recovery window
- **Who:** Founder.
- **Why:** Day-one data loss (accounts, listings, signed contracts)
  would be unrecoverable without point-in-time restore.
- **Steps:**
  1. Open Replit *Account → Billing*. Note the plan.
  2. Open *Deployments → [Bareter] → Database*. Confirm a managed
     PostgreSQL is attached and shows a recent "last write".
  3. Record the recovery window (Core = 7 days, Pro = 28 days).
- **Done when:** Recovery window noted in
  `docs/launch-evidence/backup-restore-test.md`.
- **Evidence file:** `docs/launch-evidence/backup-restore-test.md`
  (full procedure: `docs/LAUNCH_BACKUP_CHECKLIST.md`).

### 1.2 Run a real point-in-time restore drill
- **Who:** Founder + one teammate (so two humans know how).
- **Why:** Restore is theoretical until you've actually clicked it
  once on this exact deployment.
- **Steps:**
  1. *Deployments → Database → Point-in-time restore.*
  2. Pick any timestamp inside the recovery window.
  3. Confirm restore. Screenshot the success.
  4. Run the verification SQL from
     `docs/LAUNCH_BACKUP_CHECKLIST.md` §1.
  5. Roll forward to the most recent timestamp so production is
     current again.
- **Done when:** Screenshot saved to
  `docs/launch-evidence/screenshots/pitr-test-YYYYMMDD.png` and the
  evidence file is filled in and committed.
- **Names of people who can do this in an emergency:**
  `__________`, `__________`.

### 1.3 Verify production secrets are set in the deployment (not just dev)
- **Who:** Founder.
- **Why:** Dev env vars don't carry into production. A missing
  secret on prod will silently break email, Didit, or sessions.
- **Steps:** Open *Deployments → [Bareter] → Secrets*. Confirm
  every one of these is present and non-empty:
  - `SESSION_SECRET` (long random string; rotating it logs everyone
    out, so don't change it on launch day).
  - `DATABASE_URL` (auto-managed by Replit; just confirm it's there).
  - `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (= `hello@bareter.com`).
  - `DIDIT_API_KEY`, `DIDIT_KYC_WORKFLOW_ID`,
    `DIDIT_KYB_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`.
  - `PUBLIC_APP_URL` = `https://bareter.com` (no trailing slash).
  - `ADMIN_EMAIL_ALLOWLIST` — comma-separated lower-case emails of
    every human who is allowed to use the admin panel. Defense-in-
    depth: even a stale `is_admin=true` row in the DB is rejected
    if the email isn't on this list.
  - `BOOTSTRAP_ADMIN_PASSWORD`, `FOUNDER_EMAIL` (founder bootstrap).
  - `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`,
    `DEFAULT_OBJECT_STORAGE_BUCKET_ID` (Object Storage; pre-set).
- **Done when:** Every name above is present in the production
  secrets pane and you've personally confirmed `PUBLIC_APP_URL`
  matches the live custom domain exactly.
- **Evidence file:** `docs/launch-evidence/public-app-url.md`
  (already started for `PUBLIC_APP_URL`).

---

## Stage 2 — Custom domain & TLS

### 2.1 Wire up `bareter.com` to the deployment
- **Who:** Founder (needs domain registrar login).
- **Why:** Without the custom domain, share/referral links and the
  Didit webhook all point at the wrong host and look unprofessional.
- **Steps:**
  1. Replit *Deployments → [Bareter] → Domains → Add custom domain*
     → `bareter.com` and `www.bareter.com`.
  2. At your registrar, add the exact records Replit shows
     (typically an `A`/`AAAA` + a `CNAME` for `www`).
  3. Wait for the green "Verified" + "TLS active" state in Replit.
- **Done when:** `https://bareter.com` loads with a valid padlock,
  no certificate warning, in an incognito tab on a phone you've
  never used to view the site.
- **Evidence file:** `docs/launch-evidence/custom-domain.md`
  (procedure: `docs/LAUNCH_CUSTOM_DOMAIN.md`).

### 2.2 Set `PUBLIC_APP_URL` and redeploy
- **Who:** Founder.
- **Why:** Several server-side modules (waitlist share links,
  marketing PDFs, email templates) read this to build absolute URLs.
- **Steps:** *Deployments → Secrets* → set
  `PUBLIC_APP_URL=https://bareter.com` (no trailing slash). Click
  *Redeploy*.
- **Done when:** `curl https://bareter.com/api/waitlist/mode | jq .`
  returns an `appUrl` of exactly `https://bareter.com`.
- **Evidence file:** `docs/launch-evidence/public-app-url.md`.

---

## Stage 3 — Email deliverability (Resend)

### 3.1 Verify the sending domain in Resend
- **Who:** Founder (needs registrar DNS access + Resend login).
- **Why:** Without DKIM/SPF/DMARC the welcome email lands in spam
  or gets rejected outright. That kills sign-up conversion silently.
- **Steps:**
  1. Resend dashboard → *Domains* → *Add domain* → `bareter.com`.
  2. At your registrar, add **exactly** the records Resend shows:
     1× SPF `TXT`, 2–3× DKIM `CNAME`, 1× DMARC `TXT`
     (start with `p=none` for monitoring; tighten later).
  3. Click *Verify*. Wait for all rows to flip green
     (DNS can take 5–60 min).
- **Done when:** Every row in Resend → `bareter.com` is green.
- **Evidence file:** `docs/launch-evidence/email-deliverability.md`
  (procedure: `docs/LAUNCH_EMAIL_DELIVERABILITY.md`).

### 3.2 Send a real test from the deployed site
- **Who:** Founder.
- **Why:** "Verified in Resend" ≠ "lands in inbox". Deliverability
  depends on your specific From address and recipient provider.
- **Steps:**
  1. From `https://bareter.com`, register an account with a real
     Gmail and a real Outlook inbox (use `+test` aliases).
  2. Within 2 minutes, the welcome email must land in **Inbox**,
     not Promotions / Updates / Spam.
  3. Repeat for *Forgot password*.
- **Done when:** Both emails are in Inbox on both providers.
  Screenshot each into `docs/launch-evidence/screenshots/`.

---

## Stage 4 — Identity verification (Didit)

### 4.1 Point Didit webhooks at production
- **Who:** Founder (needs Didit dashboard login).
- **Why:** Without this, users finish KYC/KYB on Didit but their
  Bareter profile never flips to Verified — they'll be stuck.
- **Prerequisites:** Stages 1, 2, 3 above must be done.
- **Steps:**
  1. Didit dashboard → KYC workflow → *Webhook URL* →
     `https://bareter.com/api/webhooks/didit`.
  2. Same for the KYB workflow.
  3. Confirm the signing secret in Didit matches the value already
     set as `DIDIT_WEBHOOK_SECRET` in the deployment secrets. If
     it doesn't: regenerate in Didit and update the secret in
     Replit, then redeploy.
- **Done when:** A test KYC run on `https://bareter.com` flips a
  test profile to "Verified" within 60 seconds of finishing on
  Didit.
- **Evidence file:** `docs/launch-evidence/didit-webhook.md`
  (procedure: `docs/LAUNCH_DIDIT_WEBHOOK.md`).

---

## Stage 5 — Social, contact, and brand placeholders

### 5.1 Replace the social-link placeholders in the footer
- **Who:** Founder / marketing.
- **Why:** Right now Instagram, LinkedIn, TikTok, and Facebook
  links in the footer are all `href="#"` — they go nowhere.
- **Steps:** Once the official handles exist, ask the agent (or
  edit `client/src/components/layout/footer.tsx` directly) to swap
  each `href: "#"` for the real URL.
- **Done when:** Every social icon in the footer opens the
  corresponding live profile.

### 5.2 Confirm the public phone, email, and physical address
- **Who:** Founder.
- **Why:** The footer + Help + Terms currently show
  `+971 52 313 3512`, `hello@bareter.com`, and "Dubai, United Arab
  Emirates". If any of these are placeholders, fix them before
  announcing — they appear on legal pages.
- **Steps:** Open `/help`, `/terms`, `/privacy`, footer of any
  page. Confirm every contact value is one a real person /
  inbox monitors.
- **Done when:** Calling the number reaches a real human in
  business hours, the email is monitored, and the address is one
  you're willing to publish.

### 5.3 WhatsApp business number for the support FAB
- **Who:** Founder.
- **Why:** The "Need help?" floating button deeplinks to
  `wa.me/971523133512`. If that number is placeholder, every help
  click goes to the wrong WhatsApp.
- **Steps:** Same number as 5.2. If different, ask the agent to
  update it.

---

## Stage 6 — Founder admin & access control

### 6.1 Confirm the founder admin login works on production
- **Who:** Founder.
- **Why:** If you can't get into `/admin`, you can't moderate
  content or download signed contracts after launch.
- **Steps:**
  1. Visit `https://bareter.com/admin`.
  2. Log in with `FOUNDER_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD`.
  3. Immediately change the password from the profile page.
  4. Verify your admin sidebar shows: Users, Listings, Reports,
     Contracts, Consent log.
- **Done when:** You're logged in, the password has been rotated,
  and every admin nav item loads without 403.

### 6.2 Lock down `ADMIN_EMAIL_ALLOWLIST`
- **Who:** Founder.
- **Why:** Belt-and-braces: even if a stale `is_admin=true` row
  ends up in the DB, only emails on this allowlist are honoured.
- **Steps:** *Deployments → Secrets* → set
  `ADMIN_EMAIL_ALLOWLIST` to a comma-separated list of every real
  human admin email (lower-case). Redeploy.
- **Done when:** Removing yourself from the list (temporarily) and
  refreshing `/admin` returns 403 — then put yourself back.

### 6.3 Decide who else gets admin
- **Who:** Founder.
- **Why:** Avoid sharing your account.
- **Steps:** For each teammate who needs admin: have them register
  on the live site, add their email to `ADMIN_EMAIL_ALLOWLIST`,
  then run this in the SQL console (or ask the agent):
  ```sql
  UPDATE users SET is_admin = true WHERE email = 'teammate@bareter.com';
  ```
- **Done when:** Every teammate can reach `/admin` from their own
  account, and any non-admin email correctly gets 403.

---

## Stage 7 — Waitlist mode decision (toggle for launch)

### 7.1 Pick the launch posture
- **Who:** Founder.
- **Why:** Right now the site can run in two modes — open
  registration, or waitlist-only. You should announce in one
  posture, not flip mid-day.
- **Steps:** From `/admin` → Waitlist → toggle on or off
  according to your launch plan. (Soft launch → leave waitlist
  on; hard launch → off.)
- **Done when:** The homepage CTA reads "Join the waitlist" or
  "Sign up" matching your decision, on both desktop and mobile.

---

## Stage 8 — The full pre-announce smoke test

### 8.1 Walk the critical path on the live domain (desktop + mobile)
- **Who:** Founder, ideally with one teammate as the second user.
- **Why:** Production-only failures (env vars, webhooks, email
  deliverability, Didit, signed cookies) will only show up here.
  This is your formal go / no-go.
- **Prerequisites:** Every previous stage must be green.
- **Steps:** Follow `docs/LAUNCH_SMOKE_TEST.md` end-to-end:
  homepage + cookie banner + i18n + dark mode → register A +
  welcome email lands in inbox → KYC via Didit flips to verified
  → create listing → register B + propose deal → A accepts →
  contract generated → both parties e-sign → admin shows signed
  contract + downloadable PDF → 404 page + tappable mobile phone.
- **Done when:** Every required row in
  `docs/launch-evidence/smoke-test.md` is ticked, screenshots are
  saved to `docs/launch-evidence/screenshots/`, and the sign-off
  block at the bottom is filled in with your name + the prod
  commit SHA.
- **Evidence file:** `docs/launch-evidence/smoke-test.md`.

---

## Stage 9 — Announcement readiness (off-platform)

These are launch-comms tasks the agent can't do for you.

### 9.1 Prepare your announcement copy
- **Who:** Founder / marketing.
- **Steps:** Draft a launch post for LinkedIn / Instagram. Include
  the live URL `https://bareter.com`, the free-during-launch
  promise, and (if waitlist mode is off) a direct sign-up CTA.

### 9.2 Brief your support inbox / WhatsApp
- **Who:** Whoever monitors `hello@bareter.com` and the support
  WhatsApp number.
- **Steps:** Make sure they're available for the first 48 hours
  post-announce, with the Help center and FAQ open as references.

### 9.3 Prepare a rollback plan
- **Who:** Founder.
- **Why:** If the launch goes badly you should know your
  fall-back without thinking about it.
- **Steps:** Write down: who can pause new registrations
  (`/admin` → Waitlist → enable), who can take the site offline
  (Replit *Deployments → Stop*), and who can run a PITR (Stage
  1.2). One paragraph is enough.

### 9.4 Cleanly archive the launch-evidence folder
- **Who:** Founder.
- **Why:** This is your audit trail if a regulator, investor, or
  acquirer ever asks how you launched.
- **Steps:** Once announcement is live, commit one final state of
  `docs/launch-evidence/` and tag the git commit `launch-day`.

---

## Quick "must be green to announce" summary

If you're short on time, these are the absolute non-negotiables:

| # | Item | Done? |
| --- | --- | --- |
| 1 | DB restore drill done, evidence committed | ☐ |
| 2 | All production secrets set, including `PUBLIC_APP_URL` and `ADMIN_EMAIL_ALLOWLIST` | ☐ |
| 3 | Custom domain `bareter.com` live with valid TLS | ☐ |
| 4 | Resend domain verified (SPF + DKIM + DMARC green) | ☐ |
| 5 | Real welcome email lands in inbox (not spam) on Gmail + Outlook | ☐ |
| 6 | Didit KYC + KYB webhooks point at `https://bareter.com/api/webhooks/didit` and a live test flips a profile to Verified | ☐ |
| 7 | Founder admin login works on prod, password rotated from bootstrap | ☐ |
| 8 | Waitlist posture (on / off) chosen and matches the homepage CTA | ☐ |
| 9 | Full smoke test (`docs/LAUNCH_SMOKE_TEST.md`) green on both desktop and mobile | ☐ |
| 10 | Sign-off block in `docs/launch-evidence/smoke-test.md` signed | ☐ |

When every box above is ticked → you're cleared to announce.
