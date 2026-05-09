# Search Console submission — evidence

**Status:** PARTIAL — production endpoints verified programmatically (2026-05-09).
GSC property verification and Bing submission require founder browser action (see
[`../LAUNCH_SEARCH_CONSOLE.md`](../LAUNCH_SEARCH_CONSOLE.md) for step-by-step
instructions and the `GOOGLE_SITE_VERIFICATION` Replit secret setup).

---

## 1. Setup metadata

| Field | Value |
| --- | --- |
| Google account used for GSC | `TODO: e.g. founder@gmail.com` |
| GSC property (apex) | `https://bareter.com` |
| GSC property (www) | `https://www.bareter.com` |
| Verification method | HTML file route (`/google<CODE>.html`) + meta tag backup |
| `GOOGLE_SITE_VERIFICATION` secret set in Replit | `TODO: YES / NO — set before clicking Verify in GSC` |
| `VITE_GOOGLE_SITE_VERIFICATION` secret set in Replit | `TODO: YES / NO — set for meta-tag backup; requires redeploy` |
| Date apex verified (YYYY-MM-DD) | `TODO` |
| Date www verified (YYYY-MM-DD) | `TODO — blocked until www.bareter.com CNAME is configured (#154)` |
| Operator (name + email) | `TODO: your full name and email` |

---

## 2. Production endpoint verification (automated — 2026-05-09)

### sitemap.xml

Verified via `curl https://bareter.com/sitemap.xml`:

| Check | Result |
| --- | --- |
| HTTP status | ✅ 200 OK |
| Content-Type | ✅ `application/xml; charset=utf-8` |
| XML schema namespace | ✅ `http://www.sitemaps.org/schemas/sitemap/0.9` |
| URL count (production deployment as of 2026-05-09) | ✅ 9 static pages |
| Static pages present | ✅ `/`, `/browse`, `/map`, `/register`, `/login`, `/how-it-works`, `/waitlist`, `/faq`, `/help` |

> Note: the production deployment pre-dates the latest `server/routes.ts` commit which adds
> more static paths (browse-public, legal pages, pricing). URL count will increase to 20+
> static pages on the next redeploy, plus all approved active listings.

### robots.txt

Verified via `curl https://bareter.com/robots.txt`:

| Check | Result |
| --- | --- |
| HTTP status | ✅ 200 OK |
| `User-agent: *` | ✅ Present |
| `Allow: /` | ✅ Present |
| `Disallow: /admin` | ✅ Present |
| `Disallow: /api/` | ✅ Present |
| `Sitemap:` line | ✅ `Sitemap: https://bareter.com/sitemap.xml` |

---

## 3. GSC HTML verification file route

The server serves `GET /google<CODE>.html` and returns the correct verification
body (`google-site-verification: google<CODE>.html`) when the request code
matches the `GOOGLE_SITE_VERIFICATION` env var.

**Founder action required:**
1. Open GSC → Add property → URL prefix → `https://bareter.com`.
2. Choose *HTML file* verification method; copy the hex code shown.
3. Add Replit secret `GOOGLE_SITE_VERIFICATION` = `<hex code>`.
4. Redeploy (Publishing → Deploy).
5. Open `https://bareter.com/google<CODE>.html` — confirm response matches.
6. Click *Verify* in GSC.

| Step | Status |
| --- | --- |
| GSC property created | `TODO: YES / NO` |
| `GOOGLE_SITE_VERIFICATION` secret set | `TODO: YES / NO` |
| `/google<CODE>.html` returns correct body | `TODO: YES / NO` |
| GSC verification status | `TODO: Verified / Failed` |
| Screenshot | `screenshots/gsc-verified-YYYYMMDD.png` |

---

## 4. GSC sitemap submission

**Founder action required:** GSC → Indexing → Sitemaps → Submit `https://bareter.com/sitemap.xml`.

| Field | Value |
| --- | --- |
| Sitemap URL submitted | `https://bareter.com/sitemap.xml` |
| Submission date (YYYY-MM-DD) | `TODO` |
| GSC Status after crawl | `TODO: Success / Pending / Error` |
| URL count reported by GSC | `TODO: expected ≥ 20 static pages + all approved listings after redeploy` |
| Screenshot | `screenshots/gsc-sitemap-YYYYMMDD.png` |

---

## 5. robots.txt validation in GSC

**Founder action required:** GSC → Settings → robots.txt tester.

| Check | Result | Screenshot |
| --- | --- | --- |
| robots.txt fetched without error | `TODO: Pass / Fail` | `screenshots/gsc-robots-YYYYMMDD.png` |
| `Sitemap:` line shows `https://bareter.com/sitemap.xml` | `TODO: Pass / Fail` | |
| No pages blocked unexpectedly | `TODO: Pass / Fail` | |

---

## 6. Bing Webmaster Tools (bonus)

**Fastest path:** Bing → Add site → Import from Google Search Console (requires GSC verified first).

| Field | Value |
| --- | --- |
| Bing Webmaster account | `TODO: e.g. founder@outlook.com` |
| Verification method | `TODO: GSC import / XML file / meta tag` |
| `VITE_BING_SITE_VERIFICATION` secret set | `TODO: YES / NO / N/A` |
| Date verified (YYYY-MM-DD) | `TODO` |
| Sitemap submitted | `TODO: YES / NO` |
| Bing sitemap Status | `TODO: Success / Pending / Error` |
| Screenshot | `screenshots/bing-sitemap-YYYYMMDD.png` |

---

## 7. Quarterly check reminder

| Field | Value |
| --- | --- |
| Reminder title | `Bareter: quarterly GSC + Bing indexing check` |
| Calendar host | `TODO: e.g. Google Calendar / Apple Calendar` |
| Cadence | quarterly |
| Time of day & timezone | `TODO: e.g. 09:00 GST (UTC+4)` |
| Owner (name) | `TODO: your full name` |
| Created on (YYYY-MM-DD) | `TODO` |

---

## 8. Incidents (append-only)

_When a GSC/Bing incident is resolved, append a one-paragraph entry below._

---

## Sign-off

**NOT YET SIGNED** — production endpoints confirmed working (2026-05-09). Pending:
founder must set `GOOGLE_SITE_VERIFICATION` secret, verify GSC property, submit
sitemap, validate robots.txt in GSC console, and complete Bing (bonus).

Operator signature (name): `TODO: your full name`
Date: `TODO: YYYY-MM-DD`
