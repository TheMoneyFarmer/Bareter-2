# Email deliverability — evidence

**Status:** _PARTIALLY FILLED — founder must complete TODO fields before sign-off._

Audit artifact for Task #152 (verify Resend sending domain). Procedure
lives in [`../LAUNCH_EMAIL_DELIVERABILITY.md`](../LAUNCH_EMAIL_DELIVERABILITY.md).

---

## 1. Sending identity

| Field                      | Value                |
| -------------------------- | -------------------- |
| Sending domain             | `bareter.com`        |
| Primary `RESEND_FROM_EMAIL`| `hello@bareter.com`  |
| Bounce / no-reply alias    | `noreply@bareter.com`|
| Date verified (YYYY-MM-DD) | `TODO: date Resend shows all DNS records green`    |
| Operator (name + email)    | `TODO: your full name and email`                   |

## 2. DNS records added (paste actual values from registrar)

| Type  | Host                       | Value (truncated ok)             | Status |
| ----- | -------------------------- | -------------------------------- | ------ |
| TXT   | `bareter.com`              | `v=spf1 include:amazonses.com ~all` — `TODO: paste exact value Resend shows` | `[ ]`  |
| CNAME | `resend._domainkey`        | `TODO: DKIM CNAME value from Resend dashboard (format: <id>.dkim.amazonses.com)` | `[ ]`  |
| CNAME | `resend2._domainkey`       | `TODO: DKIM CNAME value from Resend dashboard`                                   | `[ ]`  |
| CNAME | `resend3._domainkey`       | `TODO: DKIM CNAME value from Resend dashboard (if a third record is shown)`      | `[ ]`  |
| MX    | `send.bareter.com`         | `TODO: MX value from Resend dashboard (format: feedback-smtp.<region>.amazonses.com)` | `[ ]` |
| TXT   | `_dmarc.bareter.com`       | `v=DMARC1; p=quarantine; rua=mailto:dmarc@bareter.com; pct=100; adkim=s; aspf=s` | `[ ]`  |

Resend dashboard screenshot showing all green:
`screenshots/resend-domain-green-YYYYMMDD.png`

## 3. Test sends

| Provider | Test address | Sent at (UTC) | Resend message id | Inbox / Spam | Screenshot |
| -------- | ------------ | ------------- | ------------------ | ------------ | ---------- |
| Gmail    | `TODO: gmail test address`   | `TODO: HH:MM UTC` | `TODO: re_xxxx Resend message id` | `Inbox / Spam` | `screenshots/email-gmail-YYYYMMDD.png` |
| Outlook  | `TODO: outlook test address` | `TODO: HH:MM UTC` | `TODO: re_xxxx Resend message id` | `Inbox / Spam` | `screenshots/email-outlook-YYYYMMDD.png` |
| iCloud   | `TODO: icloud test address`  | `TODO: HH:MM UTC` | `TODO: re_xxxx Resend message id` | `Inbox / Spam` | `screenshots/email-icloud-YYYYMMDD.png` |

All three must say **Inbox** before the launch can proceed.

## 4. Monthly spot-check reminder

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: monthly Resend domain spot-check` |
| Calendar host (Google / iCal / …)  | `TODO: e.g. Google Calendar / Apple Calendar / Outlook` |
| Cadence                            | monthly                                                 |
| Time of day & timezone             | `TODO: e.g. 09:00 GST (UTC+4)`                          |
| Owner (name)                       | `TODO: your full name`                                  |
| Created on (YYYY-MM-DD)            | `TODO: date you created the recurring event`            |
| Screenshot of created event        | `screenshots/email-reminder-YYYYMMDD.png` — `TODO: capture and rename with actual date` |

## 5. Incidents (append-only)

_When an email-deliverability incident is resolved, append a one-paragraph
entry below: date, symptom, root cause, fix, prevention._

---

## Sign-off

By filling in the fields above and committing this file, the operator
confirms that the Bareter sending domain is verified end-to-end and that
the recurring spot-check reminder exists.

Operator signature (name): `TODO: your full name`
Date: `TODO: YYYY-MM-DD`
