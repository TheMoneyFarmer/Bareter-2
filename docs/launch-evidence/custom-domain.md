# Custom domain — evidence

**Status:** PARTIAL — apex domain (`bareter.com`) is live with valid TLS. `www.bareter.com` CNAME is NOT yet configured (NXDOMAIN). Founder must complete `www` setup and fill in TODO fields.

> Procedure lives in [`../LAUNCH_CUSTOM_DOMAIN.md`](../LAUNCH_CUSTOM_DOMAIN.md).
> Walk it on `https://bareter.com` once on desktop, once on mobile. Fill
> in every row, drop screenshots into `screenshots/`, then commit. This
> file IS the launch go / no-go record.

---

## 1. Domains attached

| Field                          | Value                          |
| ------------------------------ | ------------------------------ |
| Apex domain                    | `bareter.com`                  |
| Subdomain                      | `www.bareter.com`              |
| Replit deployment name         | `TODO: copy from Publishing → Deployments (e.g. bareter-prod)` |
| Date attached (YYYY-MM-DD)     | `TODO: date you completed the Replit custom-domain wizard`      |
| Operator (name + email)        | `TODO: your full name and email`                                |

## 2. DNS records added

Verified via DNS-over-HTTPS (Google) on 2026-05-09:

| Type  | Host                | Value                              | Status |
| ----- | ------------------- | ---------------------------------- | ------ |
| A     | `bareter.com`       | `34.111.179.208`                   | ✅ Active |
| AAAA  | `bareter.com`       | _not present_                      | N/A    |
| CNAME | `www.bareter.com`   | ❌ NXDOMAIN — NOT configured yet   | ❌ Missing |
| TXT   | `bareter.com`       | `replit-verify=b90c04cb-368d-4ca0-a663-65ae496811e0` | ✅ Present |

> **Action required**: Add the `www.bareter.com` CNAME record pointing to the Replit deployment target (e.g. `<id>.replit.app`) to make `https://www.bareter.com` resolve.

## 3. Browser TLS verification

Verified via `curl -sv https://bareter.com` on 2026-05-09:

| Check                                         | URL                          | Result | Notes |
| --------------------------------------------- | ---------------------------- | ------ | ----- |
| HTTPS loads + green padlock                   | `https://bareter.com`        | ✅ Pass | HTTP/2 200, strict-transport-security set |
| HTTPS loads + green padlock                   | `https://www.bareter.com`    | ❌ Fail | NXDOMAIN — CNAME not configured |
| HTTP → HTTPS redirect                         | `http://bareter.com`         | ✅ Pass | 301 redirect to `https://bareter.com:443/` |
| HTTP → HTTPS redirect                         | `http://www.bareter.com`     | ❌ Fail | NXDOMAIN — cannot redirect |

| Certificate field        | Value |
| ------------------------ | ----- |
| Issuer                   | Let's Encrypt (E7) |
| Subject                  | `CN=bareter.com` |
| SAN list                 | `bareter.com` (www not in SAN — www CNAME not set) |
| Issued on (YYYY-MM-DD)   | `TODO: check cert viewer for exact issue date` |
| Expires on (YYYY-MM-DD)  | `2026-07-30` |

> **Blocker**: `www.bareter.com` CNAME and corresponding SAN entry must be added before launch.

## 4. Quarterly TLS spot-check reminder

| Field                              | Value                |
| ---------------------------------- | -------------------- |
| Reminder title                     | `Bareter: quarterly custom-domain TLS spot-check` |
| Calendar host (Google / iCal / …)  | `TODO: e.g. Google Calendar / Apple Calendar / Outlook` |
| Cadence                            | quarterly                                               |
| Time of day & timezone             | `TODO: e.g. 09:00 GST (UTC+4)`                          |
| Owner (name)                       | `TODO: your full name`                                  |
| Created on (YYYY-MM-DD)            | `TODO: date you created the recurring event`            |

## 5. Incidents (append-only)

_When a domain / TLS incident is resolved, append a one-paragraph entry below._

---

## Sign-off

**NOT YET SIGNED** — `www.bareter.com` CNAME must be configured, TLS verified on both hosts, and operator fields completed before this can be signed.

Operator signature (name): `TODO: your full name`
Date: `TODO: YYYY-MM-DD`
