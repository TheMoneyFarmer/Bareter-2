# Custom domain — evidence

**Status:** _PARTIALLY FILLED — founder must complete TODO fields before sign-off._

Audit artifact for Task #154 (attach `bareter.com` custom domain with
valid TLS). Procedure lives in
[`../LAUNCH_CUSTOM_DOMAIN.md`](../LAUNCH_CUSTOM_DOMAIN.md).

---

## 1. Domains attached

| Field                          | Value                          |
| ------------------------------ | ------------------------------ |
| Apex domain                    | `bareter.com`                  |
| Subdomain                      | `www.bareter.com`              |
| Replit deployment name         | `TODO: copy from Publishing → Deployments (e.g. bareter-prod)` |
| Date attached (YYYY-MM-DD)     | `TODO: date you completed the Replit custom-domain wizard`      |
| Operator (name + email)        | `TODO: your full name and email`                                |

## 2. DNS records added (paste actual values from registrar)

| Type  | Host                | Value (truncated ok)              | Status |
| ----- | ------------------- | --------------------------------- | ------ |
| A     | `bareter.com`       | `TODO: IPv4 address from Replit custom-domains panel`                          | `[ ]`  |
| AAAA  | `bareter.com`       | `TODO: IPv6 address from Replit panel (omit row if not provided)`              | `[ ]`  |
| CNAME | `www.bareter.com`   | `TODO: CNAME target from Replit panel (e.g. <id>.replit.app)`                 | `[ ]`  |
| TXT   | `_replit-verify…`   | `TODO: ownership-verification token from Replit (omit row if not requested)`  | `[ ]`  |

> Do NOT replace existing email records (`resend*._domainkey`,
> `_dmarc.bareter.com`, `send.bareter.com` MX, the SPF `TXT` on the
> apex) — those belong to Task #152.

Replit *Custom domains* dashboard screenshot showing both hosts *Active*:
`screenshots/custom-domain-active-YYYYMMDD.png`

## 3. Browser TLS verification

| Check                                         | URL                          | Result            | Screenshot |
| --------------------------------------------- | ---------------------------- | ----------------- | ---------- |
| HTTPS loads + green padlock                   | `https://bareter.com`        | `[Pass] / [Fail]` | `screenshots/custom-domain-apex-https-YYYYMMDD.png` |
| HTTPS loads + green padlock                   | `https://www.bareter.com`    | `[Pass] / [Fail]` | `screenshots/custom-domain-www-https-YYYYMMDD.png`  |
| HTTP → HTTPS redirect                         | `http://bareter.com`         | `[Pass] / [Fail]` | `screenshots/custom-domain-apex-redirect-YYYYMMDD.png` |
| HTTP → HTTPS redirect                         | `http://www.bareter.com`     | `[Pass] / [Fail]` | `screenshots/custom-domain-www-redirect-YYYYMMDD.png`  |

| Certificate field        | Value (from browser cert viewer) |
| ------------------------ | -------------------------------- |
| Issuer                   | `TODO: e.g. "Let's Encrypt" — from browser padlock → Certificate → Issuer`        |
| Subject                  | `TODO: e.g. "bareter.com" — from Certificate → Subject`                            |
| SAN list (must include both `bareter.com` and `www.bareter.com`) | `TODO: paste full SAN list from Certificate → Subject Alternative Names` |
| Issued on (YYYY-MM-DD)   | `TODO: from Certificate → Valid From`  |
| Expires on (YYYY-MM-DD)  | `TODO: from Certificate → Valid Until` |

All four browser checks must say **Pass** and the SAN list must include
both hosts before the launch can proceed.

## 4. Quarterly TLS spot-check reminder

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: quarterly custom-domain TLS spot-check` |
| Calendar host (Google / iCal / …)  | `TODO: e.g. Google Calendar / Apple Calendar / Outlook` |
| Cadence                            | quarterly                                               |
| Time of day & timezone             | `TODO: e.g. 09:00 GST (UTC+4)`                          |
| Owner (name)                       | `TODO: your full name`                                  |
| Created on (YYYY-MM-DD)            | `TODO: date you created the recurring event`            |
| Screenshot of created event        | `screenshots/custom-domain-reminder-YYYYMMDD.png` — `TODO: capture and rename with actual date` |

## 5. Incidents (append-only)

_When a domain / TLS incident is resolved, append a one-paragraph entry
below: date, symptom, root cause, fix, prevention._

---

## Sign-off

By filling in the fields above and committing this file, the operator
confirms that `bareter.com` and `www.bareter.com` are both attached to
the production deployment with valid TLS, that HTTP redirects to HTTPS,
and that the recurring quarterly spot-check reminder exists.

Operator signature (name): `TODO: your full name`
Date: `TODO: YYYY-MM-DD`
