# Email deliverability — evidence

**Status:** BLOCKED — DKIM and SPF DNS records are NOT yet present. Resend domain verification is incomplete. Do not send transactional emails until this is resolved.

> Procedure lives in [`../LAUNCH_EMAIL_DELIVERABILITY.md`](../LAUNCH_EMAIL_DELIVERABILITY.md).

---

## 1. Sending identity

| Field                      | Value                |
| -------------------------- | -------------------- |
| Sending domain             | `bareter.com`        |
| Primary `RESEND_FROM_EMAIL`| `hello@bareter.com`  |
| Bounce / no-reply alias    | `noreply@bareter.com`|
| Date verified (YYYY-MM-DD) | `TODO: date Resend shows all DNS records green`    |
| Operator (name + email)    | `TODO: your full name and email`                   |

## 2. DNS records — verified state (2026-05-09)

| Type  | Host                       | Value                            | Status |
| ----- | -------------------------- | -------------------------------- | ------ |
| TXT   | `bareter.com`              | SPF `v=spf1 ...`                 | ❌ Missing — no SPF TXT record found (only Google + Replit verify records present) |
| CNAME | `resend._domainkey`        | Resend DKIM target               | ❌ NXDOMAIN — not configured |
| CNAME | `resend2._domainkey`       | Resend DKIM target               | ❌ NXDOMAIN — not configured |
| MX    | `send.bareter.com`         | Resend bounce endpoint           | ❌ NXDOMAIN — not configured |
| TXT   | `_dmarc.bareter.com`       | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;` | ⚠️ Present but uses relaxed alignment (adkim=r/aspf=r) not strict as planned |

> **Action required**: Log into the Resend dashboard → Domains → bareter.com and add the SPF, DKIM (x2), and bounce MX records shown there to the registrar DNS. Once all records show green in Resend, re-run the test sends below.

## 3. Test sends

_Complete AFTER DNS records are green in Resend dashboard._

| Provider | Test address | Sent at (UTC) | Resend message id | Inbox / Spam | Screenshot |
| -------- | ------------ | ------------- | ------------------ | ------------ | ---------- |
| Gmail    | `TODO: gmail test address`   | `TODO: HH:MM UTC` | `TODO: re_xxxx` | `TODO: Inbox / Spam` | `screenshots/email-gmail-YYYYMMDD.png` |
| Outlook  | `TODO: outlook test address` | `TODO: HH:MM UTC` | `TODO: re_xxxx` | `TODO: Inbox / Spam` | `screenshots/email-outlook-YYYYMMDD.png` |
| iCloud   | `TODO: icloud test address`  | `TODO: HH:MM UTC` | `TODO: re_xxxx` | `TODO: Inbox / Spam` | `screenshots/email-icloud-YYYYMMDD.png` |

## 4. Monthly spot-check reminder

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: monthly Resend domain spot-check` |
| Calendar host (Google / iCal / …)  | `TODO: e.g. Google Calendar / Apple Calendar / Outlook` |
| Cadence                            | monthly                                                 |
| Time of day & timezone             | `TODO: e.g. 09:00 GST (UTC+4)`                          |
| Owner (name)                       | `TODO: your full name`                                  |
| Created on (YYYY-MM-DD)            | `TODO: date you created the recurring event`            |

## 5. Incidents (append-only)

_When an email-deliverability incident is resolved, append a one-paragraph entry below._

---

## Sign-off

**NOT YET SIGNED** — SPF, DKIM, and bounce MX records must be added to DNS and all test sends must land in Inbox before this can be signed.

Operator signature (name): `TODO: your full name`
Date: `TODO: YYYY-MM-DD`
