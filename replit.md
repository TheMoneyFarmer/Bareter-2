# Bareter - Worldwide Barter Marketplace

## Overview

Bareter is a full-stack barter marketplace platform designed for businesses in the UAE and GCC regions to trade goods and services without cash. Its primary purpose is to facilitate a cashless economy, enhance liquidity, and foster a collaborative business environment. The platform is free for all users. Key capabilities include creating listings, negotiating trades via real-time chat, generating binding barter contracts, and managing the full deal lifecycle from proposal to completion. The platform supports global expansion with multi-country/city support and robust user verification systems (KYC/KYB).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, using Vite.
- **Routing**: Wouter.
- **State Management**: TanStack React Query.
- **UI Components**: shadcn/ui built on Radix UI.
- **Styling**: Tailwind CSS with CSS variables (light/dark mode).
- **Forms**: React Hook Form with Zod validation.
- **UI/UX Decisions**: Mobile-first responsive design featuring Instagram-style bottom navigation, responsive headers, and adaptive content layouts. Supports English (LTR) and Arabic (RTL) with language preference persistence. Brand identity uses a deep-teal color scheme (`hsl(177 70% 25%)`).
- **Brand design system (UAE marketplace baseline)**: Token set in `client/src/index.css` (`--bareter-teal #1A7272`, `--bareter-navy #1C2D4A`, `--bareter-navy-deep #0F1923`, `--bareter-gold #D4A843` (used **only** on Featured badges/glow), `--bareter-off-white` page surface), exposed to Tailwind via `tailwind.config.ts` `colors.bareter.*` plus `boxShadow.bareter-*` and `backgroundImage.bareter-hero`. Reusable utilities: `.bareter-gradient`, `.bareter-noise`, `.bareter-card-hover`, `.bareter-press`, `.bareter-shimmer`, `.bareter-img-blur`, `.bareter-route-fade`, `.uae-strip` (3-band UAE accent). Typography classes: `.text-headline`, `.text-subheadline`, `.text-price`, `.text-caption`. AED is always prefixed (`AED 1,234`); never `1234 AED` or "$". `#000` pure black is forbidden — use `--bareter-navy-deep` instead. New shared `<ListingCard />` component (`client/src/components/ListingCard.tsx`) and `<Button variant="bareter|bareter-outline|bareter-ghost|bareter-pill">` variants enforce the look. Header carries the UAE accent strip + 64px navy bar + white logo (`/logo-full-white.png` served from `client/public/`); mobile bottom nav has 5 items + centered teal "+List" FAB. Page transitions use `<RouteTransition>` (in `App.tsx`) keyed on `useLocation()`. Search wiring: header pill and landing hero navigate to `/browse?q=&category=&location=`; `browse.tsx` reads those params on mount and on URL change to preselect search/category/location and switch to the "Search & Filter" tab automatically.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ES modules.
- **API Design**: RESTful JSON API.
- **Session Management**: Express-session backed by Postgres via `connect-pg-simple`.
- **Authentication**: Custom email/password with bcryptjs, including a secure password reset flow.
- **Geolocation**: IP geolocation services via ip-api.com and ipapi.co.
- **Uploads**: Secure handling of private and public documents with magic-byte verification and access control.

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL.
- **Schema**: Shared between frontend and backend in `shared/schema.ts`.
- **Migrations**: Drizzle Kit.
- **Validation**: Zod schemas generated from Drizzle, enforcing strict validation for security.

### Key Design Patterns
- **Shared Types**: Centralized schema definitions for consistency across client and server.
- **Storage Interface**: Abstracted database operations.
- **API Request Helper**: Typed fetch wrappers for robust API interaction.
- **Context Providers**: For managing global state like authentication, theme, and internationalization.

### Core Features
- **User Management**: Onboarding wizard, user profiles with `VerifiedBadge` for KYC/KYB status, account safety controls (pausing accounts).
- **Content & Discovery**: Explore/Discover hub with advanced search, Instagram-style feed with stories and rich post cards, post creation wizard.
- **Marketplace Functionality**: Listing creation, AI-powered matching, valuation, and moderation for listings and posts. Supports value flagging and image scanning for quality control.
- **Communication & Deals**: Real-time direct messaging inbox, deal negotiation, and contract generation. Off-platform keyword detection for safety.
- **Admin & Analytics**: Professional Dashboard for users, comprehensive Admin Dashboard for platform management, moderation, and analytics, including AI logs and waitlist management.
- **Waitlist Mode**: Configurable waitlist system with referral tracking and automatic founder badge assignment upon conversion.
- **AI Agents Platform**: Integration of 6 specialized AI agents (Moderation, Support, Matching, Valuation, Engagement, Admin) powered by OpenAI for various platform functions.
- **Company OS (WhatsApp control plane)**: Founder-only WhatsApp number that exposes `help`, `revenue`, `revenue week`, `status`, `agents`, `costs`, `marketing`, `draft post <topic>`, `publish post <topic>` → `send`/`skip`/`edit <new body>`/`tweak <hint>` to iterate before publishing, `campaign update <name> ctr=X spend=Y conversions=Z`, plus free-form questions answered by the LLM (gated by a monthly AED budget). Inbound webhook lives at `/api/company-os/whatsapp`. The `edit` command swaps in a new body without spending tokens; `tweak` re-prompts the LLM with the parked draft + your hint. Parked drafts also surface in the admin Company OS dashboard ("Pending publish drafts" panel — Task #112) with topic, body, expiry countdown, and Send/Discard buttons so the founder can act when WhatsApp is unreliable; backed by `GET/POST /api/company-os/marketing/pending-publish` (admin-gated).
- **Marketing Agent (Week 2a)**: Generates a weekly campaign brief from real platform data (post categories, top cities, listing/post counts, average value), renders it as a PDF stored in private object storage at `companyOs/briefs/<id>.pdf`, and pushes it to the founder over WhatsApp every Monday 09:30 Asia/Dubai. Manual campaign metric capture replaces Meta Graph auto-pull until Meta API access is approved. No Buffer/Meta/Airtable integrations — internal stubs only. Admin endpoints: `GET /api/company-os/briefs`, `GET /api/company-os/briefs/:id/pdf`, `POST /api/company-os/generate-brief`, `GET /api/company-os/campaigns`.

## Founder admin account (single-tenant admin panel)

The admin panel is single-tenant — only the founder (`thando@bareter.com`)
can reach `/admin`, `/admin/company-os`, `/admin/marketing`, and any
`/api/admin/*` or `/api/company-os/*` route. Two layers enforce this:

1. **Bootstrap on startup** (`server/bootstrapAdmin.ts`): on every server
   boot, reads `BOOTSTRAP_ADMIN_EMAIL` (env var) and
   `BOOTSTRAP_ADMIN_PASSWORD` (secret). Upserts that user with
   `isAdmin=true`, `role=super_admin`, `isVerified=true`,
   `founderBadge=true`. Then **demotes every other admin** in the DB to
   `isAdmin=false`, `role=user`. Idempotent. Refreshing the password
   secret rotates the live password on the next deploy.
2. **Allowlist gate** (`requireAdmin` middleware + `sanitizeAdminFlag`
   helper in `server/routes.ts`): `ADMIN_EMAIL_ALLOWLIST`
   (comma-separated, case-insensitive) is checked at request time. Even
   if a stray row has `isAdmin=true`, the middleware rejects with 403
   and `/api/auth/me` strips `isAdmin` from the response so the client
   never shows the admin nav. When the allowlist env var is unset the
   middleware falls back to the legacy `isAdmin`-only behavior so dev
   environments without the env var keep working.

Required env (shared, already set): `BOOTSTRAP_ADMIN_EMAIL=thando@bareter.com`,
`ADMIN_EMAIL_ALLOWLIST=thando@bareter.com`.
Required secret: `BOOTSTRAP_ADMIN_PASSWORD`.

Waitlist mode does not block this account — the client-side waitlist gate
(`client/src/lib/waitlist.tsx`) already exempts admins (`!user || !isAdmin`)
and `/login` is always reachable regardless of waitlist state.

If you need to give a second person admin access, add their email to
`ADMIN_EMAIL_ALLOWLIST` (e.g. `thando@bareter.com,cofounder@bareter.com`)
**and** manually flip `isAdmin=true` on their user row — the bootstrap
script will not touch users whose email is in the allowlist but is not
the bootstrap email.

## Why the scheduler needs production deploy

The Company OS cron jobs in `server/companyOs/scheduler.ts` only start when `NODE_ENV === "production"` (or with the `COMPANY_OS_SCHEDULER_FORCE` flag). The Replit dev workflow runs in development, so the 08:00 Asia/Dubai daily briefing, the hourly finance snapshot (zero revenue while Stripe is disabled), and the 09:00 budget-warning job will **not** fire from the dev preview — they only fire from a published deployment. Do not "fix" the dev-mode skip; it is intentional so dev restarts don't spam the founder phone.

Deploy as **Reserved VM** or **Background Worker**, not Autoscale, so the Node process stays resident long enough for `node-cron` to fire on time.

## Verifying the WhatsApp control plane after deploy

1. In the Twilio Console, open **Messaging → Try it out → Send a WhatsApp message** and copy the join code (e.g. `join orange-zebra`).
2. From the founder phone (the number set in `FOUNDER_WHATSAPP_NUMBER`, including the `whatsapp:` prefix), send the join code to the Twilio sandbox number `+1 415 523 8886`. You should get a confirmation reply within a few seconds.
3. In the Twilio Console, set the sandbox **"WHEN A MESSAGE COMES IN"** webhook to `https://<your-domain>/api/company-os/whatsapp` (HTTP POST). The handler responds 200 immediately and dispatches the actual reply over the REST API, so Twilio never times out.
4. From the founder phone, send `help`. You should receive the Bareter Company OS menu. Then verify each command returns a sensible reply: `revenue`, `revenue week`, `status`, `agents`, `costs`, and a free-form question like "How are we doing this month?".
5. Send a message from any other WhatsApp number to the sandbox — it should be silently ignored (no reply, 200 in the Twilio logs).
6. Required production secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (e.g. `whatsapp:+14155238886`), `FOUNDER_WHATSAPP_NUMBER` (e.g. `whatsapp:+9715XXXXXXXX`). Optional: `COMPANY_OS_MONTHLY_BUDGET_AED` (default 400), `USD_TO_AED_RATE` (default 3.6725), `FOUNDER_EMAIL` (founder's address that receives the Friday weekly dispute-risk PDF — falls back to a WhatsApp-only ping when unset).

The end-to-end behaviour above is also covered by `tests/companyOs.whatsapp.test.ts` — running `npx vitest run tests/companyOs.whatsapp.test.ts` exercises the signature gate, founder ACL, and every command before deploy.

## External Dependencies

- **Database**: PostgreSQL.
- **Authentication & Security**: bcryptjs, express-session.
- **Payment Processing**: Disabled. Stripe SDK and the `/api/company-os/stripe-webhook` route were removed during pre-publish hardening so the deploy preflight wouldn't demand a Stripe sandbox connection. `server/companyOs/stripeClient.ts` is a no-op stub that always returns `null`/`false`. To re-enable, reinstall `stripe`, restore the SDK import in `stripeClient.ts`, re-add the webhook route in `server/companyOs/router.ts`, and re-add `/api/company-os/stripe-webhook` to the raw-body parser in `server/index.ts` and the CSRF allowlist in `server/security.ts`.
- **Identity Verification**: Didit (KYC/KYB) for user and business verification.
- **Email Services**: Nodemailer.
- **AI Integration**: OpenAI for various AI agents.
- **File Handling**: Multer for uploads.
- **Document Generation**: jsPDF for barter contracts. The Legal Agent supports English, Arabic (RTL with Noto Sans Arabic + arabic-persian-reshaper for letter joining and run-level bidi), and bilingual (EN+AR) PDFs. WhatsApp `contract <a> | <b> | <exchange> | <value> [| <lang>]` accepts `en` (default), `ar`, or `bilingual`.
- **Contract E-Signature**: Each contract row carries per-party signature tokens. Lifecycle: `draft → sent` (PDF uploaded) `→ signed` (one party) `→ active` (both signed). Public per-party signing page at `GET /contract/sign/:token`; founder shortcut via WhatsApp `sign <token> <signer name>`. Once both parties sign, a signed-PDF revision is rendered and uploaded to `companyOs/legal/<id>-signed.pdf`, linked from the row's `signedObjectStorageKey`.
- **Third-Party UI Libraries**: Radix UI, react-icons, embla-carousel, react-day-picker, recharts.