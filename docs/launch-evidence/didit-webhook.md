# Didit webhook — evidence

**Status:** _PARTIALLY FILLED — founder must complete TODO fields before sign-off._

Audit artifact for Task #156 (point Didit webhook at the production
domain). Procedure lives in
[`../LAUNCH_DIDIT_WEBHOOK.md`](../LAUNCH_DIDIT_WEBHOOK.md).

---

## 1. Webhook URLs configured in Didit

The handler is mounted at `POST /api/webhooks/didit` in
`server/routes.ts`. Both workflows must post to the exact same URL on
the custom domain.

| Workflow | URL configured                              | Signing secret matches `DIDIT_WEBHOOK_SECRET`? | Status |
| -------- | ------------------------------------------- | ---------------------------------------------- | ------ |
| KYC      | `https://bareter.com/api/webhooks/didit`    | `[ ] yes`                                      | `[ ]`  |
| KYB      | `https://bareter.com/api/webhooks/didit`    | `[ ] yes`                                      | `[ ]`  |

| Field                        | Value                       |
| ---------------------------- | --------------------------- |
| Date configured (YYYY-MM-DD) | `TODO: date you updated both Didit workflow webhook URLs` |
| Operator (name + email)      | `TODO: your full name and email`                          |

Screenshot of Didit dashboard showing the URL on each workflow:
`screenshots/didit-webhook-kyc-YYYYMMDD.png`,
`screenshots/didit-webhook-kyb-YYYYMMDD.png`.

## 2. End-to-end verification on production

| Test                                         | Test user email | Session id | Webhook received in logs? | Final DB state                           | Result            |
| -------------------------------------------- | --------------- | ---------- | ------------------------- | ---------------------------------------- | ----------------- |
| KYC: individual account, completed Didit flow | `TODO: test user email` | `TODO: Didit session_id from URL or Didit dashboard` | `[ ] yes` | `kycStatus='APPROVED'`, `isVerified=true`, `verificationStatus='verified'`, `diditVerifiedAt` populated, notification "Verification Approved!" created for user | `[Pass] / [Fail]` |
| KYB: business account, completed Didit flow   | `TODO: test business email` | `TODO: Didit session_id from URL or Didit dashboard` | `[ ] yes` | `kybStatus='APPROVED'`, `isVerified=true`, `verificationStatus='verified'`, `diditVerifiedAt` populated, notification "Verification Approved!" created for user | `[Pass] / [Fail]` |

Screenshots:
- `screenshots/didit-webhook-kyc-approved-YYYYMMDD.png` — admin dashboard
  or DB row showing the KYC test user at `APPROVED`.
- `screenshots/didit-webhook-kyb-approved-YYYYMMDD.png` — same for KYB.

Both rows must say **Pass** before the launch announcement.

## 3. Monthly spot-check reminder

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: monthly Didit webhook spot-check` |
| Calendar host (Google / iCal / …)  | `TODO: e.g. Google Calendar / Apple Calendar / Outlook` |
| Cadence                            | monthly                                                 |
| Time of day & timezone             | `TODO: e.g. 09:00 GST (UTC+4)`                          |
| Owner (name)                       | `TODO: your full name`                                  |
| Created on (YYYY-MM-DD)            | `TODO: date you created the recurring event`            |
| Screenshot of created event        | `screenshots/didit-webhook-reminder-YYYYMMDD.png` — `TODO: capture and rename with actual date` |

## 4. Incidents (append-only)

_When a Didit webhook incident is resolved, append a one-paragraph entry
below: date, symptom, root cause, fix, prevention._

---

## Sign-off

By filling in the fields above and committing this file, the operator
confirms that both Didit workflows post to
`https://bareter.com/api/webhooks/didit`, that the signing secret
matches `DIDIT_WEBHOOK_SECRET` on the production deployment, and that
end-to-end test verifications for a KYC user and a KYB business
correctly flip to `APPROVED` in the production database.

Operator signature (name): `TODO: your full name`
Date: `TODO: YYYY-MM-DD`
