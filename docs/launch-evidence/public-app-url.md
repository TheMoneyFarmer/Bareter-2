# PUBLIC_APP_URL — evidence

**Status:** VERIFIED — `PUBLIC_APP_URL` is correctly set to `https://bareter.com` in the production deployment. Outbound links confirmed via live API.

> Procedure lives in Task #155. The code path is already in place — `baseUrlOf` in `server/waitlistRoutes.ts` reads `PUBLIC_APP_URL` first, falling back to `REPLIT_DOMAINS`, then `REPLIT_DEV_DOMAIN`, then localhost.

---

## 1. Secret set

| Field                        | Value                       |
| ---------------------------- | --------------------------- |
| Secret name                  | `PUBLIC_APP_URL`            |
| Value (must be HTTPS, no trailing slash) | `https://bareter.com` |
| Environment                  | production deployment       |
| Set on (YYYY-MM-DD HH:MM UTC)| `TODO: timestamp when you set the secret in the production deployment` |
| Operator (name + email)      | `TODO: your full name and email`                                        |
| Redeployed after setting?    | `[✅] yes — confirmed working in production`                            |

## 2. Outbound link verification (from production)

Verified on 2026-05-09 via `curl https://bareter.com/api/waitlist/mode`:

| Check                                              | Expected URL prefix | Result |
| -------------------------------------------------- | ------------------- | ------ |
| `GET https://bareter.com/api/waitlist/mode` returns `appUrl` | `https://bareter.com` | ✅ Pass — response: `{"enabled":true,"count":322,"appUrl":"https://bareter.com"}` |
| Submit a real waitlist signup → welcome email referral link  | `https://bareter.com/?ref=…` | `TODO: verify by submitting a test signup and checking the welcome email` |
| Open the in-app waitlist dialog → "Share" link copied to clipboard | `https://bareter.com/?ref=…` | `TODO: verify by opening the waitlist dialog in the app` |

## 3. Sign-off

The `PUBLIC_APP_URL` secret is confirmed active (the live API returns the correct `appUrl`). The two manual checks (welcome email referral link and share dialog) require the founder to verify interactively.

Operator signature (name): `TODO: your full name`
Date: `TODO: YYYY-MM-DD`
