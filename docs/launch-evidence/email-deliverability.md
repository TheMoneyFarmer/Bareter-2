# Email deliverability — evidence

**Status:** _UNFILLED — must be completed by the founder before public launch._

Audit artifact for Task #152 (verify Resend sending domain). Procedure
lives in [`../LAUNCH_EMAIL_DELIVERABILITY.md`](../LAUNCH_EMAIL_DELIVERABILITY.md).

---

## 1. Sending identity

| Field                      | Value                |
| -------------------------- | -------------------- |
| Sending domain             | `bareter.com`        |
| Primary `RESEND_FROM_EMAIL`| `hello@bareter.com`  |
| Bounce / no-reply alias    | `noreply@bareter.com`|
| Date verified (YYYY-MM-DD) | `____________`       |
| Operator (name + email)    | `____________`       |

## 2. DNS records added (paste actual values from registrar)

| Type  | Host                       | Value (truncated ok)             | Status |
| ----- | -------------------------- | -------------------------------- | ------ |
| TXT   | `bareter.com`              | `v=spf1 include:____ ~all`       | `[ ]`  |
| CNAME | `resend._domainkey`        | `____________.dkim.amazonses.com`| `[ ]`  |
| CNAME | `resend2._domainkey`       | `____________.dkim.amazonses.com`| `[ ]`  |
| CNAME | `resend3._domainkey`       | `____________.dkim.amazonses.com`| `[ ]`  |
| MX    | `send.bareter.com`         | `feedback-smtp.____.amazonses.com` | `[ ]` |
| TXT   | `_dmarc.bareter.com`       | `v=DMARC1; p=quarantine; rua=...`| `[ ]`  |

Resend dashboard screenshot showing all green:
`screenshots/resend-domain-green-YYYYMMDD.png`

## 3. Test sends

| Provider | Test address | Sent at (UTC) | Resend message id | Inbox / Spam | Screenshot |
| -------- | ------------ | ------------- | ------------------ | ------------ | ---------- |
| Gmail    | `____`       | `____`        | `____`             | `Inbox / Spam` | `screenshots/email-gmail-YYYYMMDD.png` |
| Outlook  | `____`       | `____`        | `____`             | `Inbox / Spam` | `screenshots/email-outlook-YYYYMMDD.png` |
| iCloud   | `____`       | `____`        | `____`             | `Inbox / Spam` | `screenshots/email-icloud-YYYYMMDD.png` |

All three must say **Inbox** before the launch can proceed.

## 4. Monthly spot-check reminder

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: monthly Resend domain spot-check` |
| Calendar host (Google / iCal / …)  | `____________`       |
| Cadence                            | monthly              |
| Time of day & timezone             | `____________`       |
| Owner (name)                       | `____________`       |
| Created on (YYYY-MM-DD)            | `____________`       |
| Screenshot of created event        | `screenshots/email-reminder-YYYYMMDD.png` |

## 5. Incidents (append-only)

_When an email-deliverability incident is resolved, append a one-paragraph
entry below: date, symptom, root cause, fix, prevention._

---

## Sign-off

By filling in the fields above and committing this file, the operator
confirms that the Bareter sending domain is verified end-to-end and that
the recurring spot-check reminder exists.

Operator signature (name): `____________`
Date: `____________`
