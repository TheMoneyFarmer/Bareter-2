# Didit webhook — evidence

**Status:** _UNFILLED — must be completed by the founder before public launch._

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
| Date configured (YYYY-MM-DD) | `____________`              |
| Operator (name + email)      | `____________`              |

Screenshot of Didit dashboard showing the URL on each workflow:
`screenshots/didit-webhook-kyc-YYYYMMDD.png`,
`screenshots/didit-webhook-kyb-YYYYMMDD.png`.

## 2. End-to-end verification on production

| Test                                         | Test user email | Session id | Webhook received in logs? | Final DB state                           | Result            |
| -------------------------------------------- | --------------- | ---------- | ------------------------- | ---------------------------------------- | ----------------- |
| KYC: individual account, completed Didit flow | `____`          | `____`     | `[ ] yes`                 | `kyc_status=APPROVED`, `is_verified=true`, `didit_verified_at` set, "Verification Complete" notification created | `[Pass] / [Fail]` |
| KYB: business account, completed Didit flow   | `____`          | `____`     | `[ ] yes`                 | `kyb_status=APPROVED`, `is_verified=true`, `didit_verified_at` set, "Verification Complete" notification created | `[Pass] / [Fail]` |

Screenshots:
- `screenshots/didit-webhook-kyc-approved-YYYYMMDD.png` — admin dashboard
  or DB row showing the KYC test user at `APPROVED`.
- `screenshots/didit-webhook-kyb-approved-YYYYMMDD.png` — same for KYB.

Both rows must say **Pass** before the launch announcement.

## 3. Monthly spot-check reminder

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: monthly Didit webhook spot-check` |
| Calendar host (Google / iCal / …)  | `____________`       |
| Cadence                            | monthly              |
| Time of day & timezone             | `____________`       |
| Owner (name)                       | `____________`       |
| Created on (YYYY-MM-DD)            | `____________`       |
| Screenshot of created event        | `screenshots/didit-webhook-reminder-YYYYMMDD.png` |

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

Operator signature (name): `____________`
Date: `____________`
