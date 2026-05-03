# Custom domain — evidence

**Status:** _UNFILLED — must be completed by the founder before public launch._

Audit artifact for Task #154 (attach `bareter.com` custom domain with
valid TLS). Procedure lives in
[`../LAUNCH_CUSTOM_DOMAIN.md`](../LAUNCH_CUSTOM_DOMAIN.md).

---

## 1. Domains attached

| Field                          | Value                          |
| ------------------------------ | ------------------------------ |
| Apex domain                    | `bareter.com`                  |
| Subdomain                      | `www.bareter.com`              |
| Replit deployment name         | `____________`                 |
| Date attached (YYYY-MM-DD)     | `____________`                 |
| Operator (name + email)        | `____________`                 |

## 2. DNS records added (paste actual values from registrar)

| Type  | Host                | Value (truncated ok)              | Status |
| ----- | ------------------- | --------------------------------- | ------ |
| A     | `bareter.com`       | `____.____.____.____`             | `[ ]`  |
| AAAA  | `bareter.com`       | `____:____:____:____`             | `[ ]`  |
| CNAME | `www.bareter.com`   | `____________.replit.app` (or as Replit instructs) | `[ ]` |
| TXT   | `_replit-verify…`   | `____________` (only if Replit asks for ownership proof) | `[ ]` |

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
| Issuer                   | `____________`                   |
| Subject                  | `____________`                   |
| SAN list (must include both `bareter.com` and `www.bareter.com`) | `____________` |
| Issued on (YYYY-MM-DD)   | `____________`                   |
| Expires on (YYYY-MM-DD)  | `____________`                   |

All four browser checks must say **Pass** and the SAN list must include
both hosts before the launch can proceed.

## 4. Quarterly TLS spot-check reminder

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: quarterly custom-domain TLS spot-check` |
| Calendar host (Google / iCal / …)  | `____________`       |
| Cadence                            | quarterly            |
| Time of day & timezone             | `____________`       |
| Owner (name)                       | `____________`       |
| Created on (YYYY-MM-DD)            | `____________`       |
| Screenshot of created event        | `screenshots/custom-domain-reminder-YYYYMMDD.png` |

## 5. Incidents (append-only)

_When a domain / TLS incident is resolved, append a one-paragraph entry
below: date, symptom, root cause, fix, prevention._

---

## Sign-off

By filling in the fields above and committing this file, the operator
confirms that `bareter.com` and `www.bareter.com` are both attached to
the production deployment with valid TLS, that HTTP redirects to HTTPS,
and that the recurring quarterly spot-check reminder exists.

Operator signature (name): `____________`
Date: `____________`
