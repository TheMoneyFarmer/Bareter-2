# Didit webhook — evidence

**Status:** PARTIALLY VERIFIED — the webhook handler is mounted and working in the production codebase. The Didit dashboard must still be updated to point both KYC and KYB workflows at `https://bareter.com/api/webhooks/didit`. End-to-end verification requires a live KYC/KYB test run.

> Procedure lives in [`../LAUNCH_DIDIT_WEBHOOK.md`](../LAUNCH_DIDIT_WEBHOOK.md).

---

## 1. Webhook URLs configured in Didit

The handler is mounted at `POST /api/webhooks/didit` in `server/routes.ts`. Both workflows must post to the exact same URL on the custom domain.

| Workflow | URL to configure                              | Signing secret matches `DIDIT_WEBHOOK_SECRET`? | Status |
| -------- | --------------------------------------------- | ---------------------------------------------- | ------ |
| KYC      | `https://bareter.com/api/webhooks/didit`       | `[ ] yes — verify in Didit dashboard`          | `TODO` |
| KYB      | `https://bareter.com/api/webhooks/didit`       | `[ ] yes — verify in Didit dashboard`          | `TODO` |

| Field                        | Value                       |
| ---------------------------- | --------------------------- |
| Date configured (YYYY-MM-DD) | `TODO: date you updated both Didit workflow webhook URLs` |
| Operator (name + email)      | `TODO: your full name and email`                          |

> **Action required**: Log into the Didit dashboard → Workflows → KYC and KYB → Webhook settings. Update the URL on each workflow to `https://bareter.com/api/webhooks/didit`. Confirm the webhook signing secret matches `DIDIT_WEBHOOK_SECRET` in the production deployment secrets.

## 2. End-to-end verification on production

_Complete AFTER webhook URLs are configured in Didit dashboard._

| Test                                         | Test user email | Session id | Webhook received in logs? | Final DB state | Result |
| -------------------------------------------- | --------------- | ---------- | ------------------------- | -------------- | ------ |
| KYC: individual account, completed Didit flow | `TODO` | `TODO` | `[ ] yes` | `kycStatus='APPROVED'`, `isVerified=true`, `verificationStatus='verified'`, `diditVerifiedAt` populated, notification "Verification Approved!" created | `TODO` |
| KYB: business account, completed Didit flow   | `TODO` | `TODO` | `[ ] yes` | `kybStatus='APPROVED'`, `isVerified=true`, `verificationStatus='verified'`, `diditVerifiedAt` populated, notification "Verification Approved!" created | `TODO` |

## 3. Monthly spot-check reminder

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: monthly Didit webhook spot-check` |
| Calendar host (Google / iCal / …)  | `TODO: e.g. Google Calendar / Apple Calendar / Outlook` |
| Cadence                            | monthly                                                 |
| Time of day & timezone             | `TODO: e.g. 09:00 GST (UTC+4)`                          |
| Owner (name)                       | `TODO: your full name`                                  |
| Created on (YYYY-MM-DD)            | `TODO: date you created the recurring event`            |

## 4. Incidents (append-only)

_When a Didit webhook incident is resolved, append a one-paragraph entry below._

---

## Sign-off

**NOT YET SIGNED** — both Didit workflows must be updated to the custom domain URL and end-to-end KYC + KYB tests must pass before this can be signed.

Operator signature (name): `TODO: your full name`
Date: `TODO: YYYY-MM-DD`
