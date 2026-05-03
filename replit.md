# Bareter - Worldwide Barter Marketplace

## Overview

Bareter is a full-stack, cashless barter marketplace for businesses in the UAE. It aims to facilitate trade of goods and services without currency, enhance liquidity, and foster a collaborative business environment. Key features include listing creation, real-time negotiation, binding contract generation, and comprehensive deal lifecycle management. The platform is free, designed for global expansion with multi-country/city support, and includes robust user verification (KYC/KYB) and AI-powered functionalities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite, Wouter for routing, and TanStack React Query for state management.
- **UI/UX**: Mobile-first responsive design, Instagram-style navigation, and adaptive layouts. Supports English (LTR) and Arabic (RTL) with persistent language preference. Uses shadcn/ui (Radix UI based) and Tailwind CSS with a deep-teal color scheme and specific brand design tokens. Includes ambient animations, header shrinkage on scroll, and various custom UI components for a consistent brand experience.
- **Forms**: React Hook Form with Zod validation.

### Backend
- **Runtime**: Node.js with Express.js (TypeScript, ES modules).
- **API Design**: RESTful JSON API.
- **Authentication**: Custom email/password authentication with bcryptjs and secure password reset.
- **Session Management**: Express-session backed by PostgreSQL.
- **Geolocation**: Integrates with ip-api.com and ipapi.co.
- **Uploads**: Secure handling of private and public documents with magic-byte verification.

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL.
- **Schema**: Shared between frontend and backend using `shared/schema.ts`.
- **Migrations**: Drizzle Kit.
- **Validation**: Zod schemas derived from Drizzle.

### Key Design Patterns
- **Shared Types**: Ensures consistency across the platform.
- **Storage Interface**: Abstracted database operations.
- **API Request Helper**: Typed fetch wrappers.
- **Context Providers**: Manages global state (auth, theme, i18n).

### Core Features
- **User Management**: Onboarding, profiles with KYC/KYB verification, account safety.
- **Content & Discovery**: Explore/Discover hub, Instagram-style feed, advanced search.
- **Marketplace**: Listing creation, AI-powered matching, valuation, moderation, and quality control.
- **Communication & Deals**: Real-time direct messaging, deal negotiation, and contract generation with off-platform keyword detection.
- **Admin & Analytics**: User and Admin Dashboards for platform management, moderation, and analytics.
- **Waitlist Mode**: Configurable waitlist with referral tracking.
- **AI Agents Platform**: Integration of 6 specialized OpenAI-powered AI agents for moderation, support, matching, valuation, engagement, and administration.
- **Company OS (WhatsApp control plane)**: Founder-only WhatsApp interface for platform insights, marketing post drafting/publishing, campaign updates, and LLM-powered queries, with a corresponding admin dashboard.
- **Marketing Agent**: Generates weekly campaign briefs from platform data, delivered as PDFs via WhatsApp, with manual campaign metric capture.

## Custom Domain & Outbound Links

Production runs on the apex `bareter.com` and the `www.bareter.com`
subdomain, both attached to the Replit Deployment with auto-renewed
TLS certificates. Outbound links — e.g. waitlist welcome emails and
the in-app referral share link in the waitlist dialog — are built from
a server-trusted base URL so they always point at the canonical
(custom) production domain instead of whatever host happened to serve
the request.

Resolution order (in `server/waitlistRoutes.ts → baseUrlOf`):

1. `PUBLIC_APP_URL` secret (preferred for production)
2. `REPLIT_DOMAINS` (Replit deployment domain, set automatically)
3. `REPLIT_DEV_DOMAIN` (workspace dev URL)
4. `http://localhost:5000` (last-resort fallback)

To switch to a new custom domain:

1. Configure the custom domain on the Replit Deployment (Deployments → Settings → Custom domains).
2. Set the `PUBLIC_APP_URL` secret to the full HTTPS URL of the custom domain
   (e.g. `https://bareter.com`). No trailing slash.
3. Redeploy.

The audit artifact for the production `PUBLIC_APP_URL` rollout is
[`docs/launch-evidence/public-app-url.md`](docs/launch-evidence/public-app-url.md)
— the founder fills it in once the secret is set in production and
real outbound links (welcome email referral, in-app share dialog) have
been verified to render on `https://bareter.com`.

The frontend reads the canonical URL from the `appUrl` field of
`GET /api/waitlist/mode`, exposed via the `appUrl` value on `useWaitlist()`.
The waitlist dialog uses it for the share link so referrals always direct
visitors to the published custom domain.

### Pre-launch verification (founder)

- **Setup checklist:**
  [`docs/LAUNCH_CUSTOM_DOMAIN.md`](docs/LAUNCH_CUSTOM_DOMAIN.md) — the
  step-by-step founder runbook for attaching the domain, adding DNS
  records at the registrar, waiting for TLS issuance, and verifying the
  green padlock from a clean browser.
- **Audit artifact:**
  [`docs/launch-evidence/custom-domain.md`](docs/launch-evidence/custom-domain.md)
  — fill in the actual DNS values, certificate issuer / SAN / expiry,
  the four green-padlock screenshots, and the quarterly TLS
  spot-check calendar reminder before announcing publicly.
- **DNS hygiene:** the email records owned by Task #152
  (`resend*._domainkey`, `_dmarc`, `send.` MX, SPF on the apex) live on
  the same domain — do **not** replace any of them while attaching the
  custom domain. Add only what Replit's *Custom domains* tab asks for.

## Backups & Restore (Production Database)

The production database is a Replit-managed PostgreSQL (Neon-backed) attached
to the deployment. Replit provides **point-in-time restore (PITR)** out of
the box — there is no separate snapshot schedule we manage.

- **Recovery window**: 7 days on Core, 28 days on Pro. Confirm the active
  plan in *Account → Billing* before launch and re-confirm whenever the plan
  changes. Source: <https://docs.replit.com/cloud-services/storage-and-databases/production-databases>.
- **Granularity**: any point in time within the recovery window — not a
  fixed nightly snapshot.
- **Where it lives**: managed by Replit/Neon; nothing to copy off-box for the
  default policy. (Cross-region replication is explicitly out of scope.)
- **What restore covers**: the production database state only. It does NOT
  roll the application code back. To restore both code and data to a point
  in time, also use Replit's checkpoint *Rollback* on the App and then
  *Republish*.

### How to restore (production)

1. Open the deployed App in Replit → *Deployments* tab.
2. Open the production PostgreSQL database for that deployment.
3. Choose **Point-in-time restore** and pick the target timestamp (within the
   plan's recovery window).
4. Confirm. The production database is rolled back to that moment.
5. If application code also needs to match that point in time: use
   *Checkpoints → Rollback* on the App, then *Republish*.

### Launch-day check (founder)

Before announcing publicly, the founder must:

1. Run through `docs/LAUNCH_BACKUP_CHECKLIST.md` once and tick every box.
2. Fill in `docs/launch-evidence/backup-restore-test.md` with the actual
   values (plan, recovery window, restore timestamp, verification SQL
   output, operator names) and commit it. That file is the audit artifact
   that proves a real test restore happened and that the weekly spot-check
   reminder exists.
3. Drop the test-restore screenshot into
   `docs/launch-evidence/screenshots/pitr-test-YYYYMMDD.png` and the
   calendar-reminder screenshot into
   `docs/launch-evidence/screenshots/calendar-reminder-YYYYMMDD.png`.

Both `replit.md` and `docs/launch-evidence/backup-restore-test.md` should
be re-checked whenever the Replit plan changes (the recovery window value
needs updating).

## Email Deliverability (Resend)

All transactional and campaign email is sent through **Resend** from the
apex `bareter.com` sending domain.

- **From identity (production)**: `hello@bareter.com` (set via the
  `RESEND_FROM_EMAIL` secret).
- **Fallback `From`**: `noreply@bareter.com` — hardcoded as `FALLBACK_FROM`
  in `server/emailService.ts` so we never accidentally send from a
  non-`bareter.com` address even if the secret is missing.
- **DNS records that back the domain** (must all be green in Resend →
  *Domains* → `bareter.com`):
  - SPF `TXT` on `bareter.com` (Resend-issued `v=spf1 include:…`).
  - DKIM `CNAME`s under `resend*._domainkey.bareter.com` pointing at
    `*.dkim.amazonses.com`.
  - Bounce-handling `MX` on `send.bareter.com`.
  - DMARC `TXT` on `_dmarc.bareter.com` —
    `v=DMARC1; p=quarantine; rua=mailto:dmarc@bareter.com; pct=100; adkim=s; aspf=s`
    (move to `p=reject` once a week of clean DMARC aggregate reports has
    landed).
- **Pre-launch verification checklist**:
  [`docs/LAUNCH_EMAIL_DELIVERABILITY.md`](docs/LAUNCH_EMAIL_DELIVERABILITY.md).
- **Audit artifact** the founder fills in before launch:
  [`docs/launch-evidence/email-deliverability.md`](docs/launch-evidence/email-deliverability.md).
- **Deliverability test script**:
  `RESEND_TEST_TO=you@gmail.com npx tsx scripts/resend-send-test.mjs`
  — sends one mail through the live Resend credentials so the founder can
  verify Inbox vs Spam in gmail/outlook/icloud.

If we ever switch to a sub-domain (e.g. `mail.bareter.com`) for sending,
re-run the full Resend domain-add flow and update this section + the
checklist + the evidence template.

## Launch Seed (Curated Listings)

Production launches with a curated set of realistic UAE listings spanning
automotive, real estate, services, technology, hospitality, yachts, and home
across Dubai / Abu Dhabi / Sharjah, so the homepage's Trending / Just-listed /
Big-ticket rows are full from day one.

- Source of truth: `server/launchSeed.ts` (~25 listings under 5 editorial
  business accounts whose emails all live under `editorial*@bareter.com`).
- Every editorial listing carries the `editorial` tag and an explicit
  "Curated launch listing posted by the Bareter editorial team" line in the
  description — we never present these as listings owned by real partners.
- Runner is the one-shot script `scripts/seed-launch.ts`. It is idempotent
  (keyed by editorial email + listing title) and safe to re-run.
- Safety gates: `CONFIRM_SEED_LAUNCH=yes` is always required, and when the
  `DATABASE_URL` host is neither `localhost` nor `*.replit.dev` you must also
  set `CONFIRM_SEED_LAUNCH_PRODUCTION=yes`. The seed never auto-runs from
  server boot.
- Refuses to run twice: once everything is present, the script exits non-zero
  ("already applied") unless `ALLOW_RERUN=yes` is also set — useful when new
  editorial listings are appended to `SEED_LISTINGS` and need backfilling.

```
CONFIRM_SEED_LAUNCH=yes \
CONFIRM_SEED_LAUNCH_PRODUCTION=yes \
  npx tsx scripts/seed-launch.ts
```

## Cookie Consent Audit Log (UAE PDPL / GDPR)

Every cookie-banner decision (accept all, reject non-essential, custom save)
is recorded server-side in the append-only `consent_logs` table so we can
prove what a given subject agreed to, against which policy version, at
what time, from what IP and user-agent.

- **Schema**: `consent_logs` in `shared/schema.ts` — `userId` (when logged
  in) or `anonymousId` (UUID minted in localStorage as
  `bareter.consentAnonId`) identifies the subject. At least one is
  required; the API rejects payloads with neither.
- **Policy version**: `COOKIE_POLICY_VERSION` constant lives in
  `shared/schema.ts` and is mirrored in `client/src/lib/cookie-consent.tsx`.
  Bump both when the public Cookie Policy changes meaningfully — the
  banner automatically re-prompts any browser whose stored preferences
  carry an older version.
- **Frontend**: the cookie banner POSTs to `/api/consent` on every
  decision (best-effort, `keepalive: true`) in addition to writing
  localStorage. Failure to reach the server does not block the UI.
- **Admin export**: founders/admins can download the full log as CSV from
  *Admin → Settings → Compliance → Cookie Consent Log* (calls
  `GET /api/admin/consent/export.csv`, requires admin session). Optional
  `?since=<ISO timestamp>` query param to scope the export.
- **Migration**: applied via `npm run db:push` (Drizzle). The table is
  append-only — never UPDATE or DELETE rows; the audit trail is the
  whole point.

## External Dependencies

- **Database**: PostgreSQL.
- **Authentication & Security**: bcryptjs, express-session.
- **Identity Verification**: Didit (KYC/KYB).
- **Email Services**: Nodemailer.
- **AI Integration**: OpenAI.
- **File Handling**: Multer.
- **Document Generation**: jsPDF for multi-language (English, Arabic, bilingual) barter contracts with e-signature functionality.
- **Third-Party UI Libraries**: Radix UI, react-icons, embla-carousel, react-day-picker, recharts.