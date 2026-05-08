# Bareter - Worldwide Barter Marketplace

## Overview

Bareter is a full-stack, cashless barter marketplace for businesses in the UAE. Its primary purpose is to facilitate the trade of goods and services without currency, thereby enhancing liquidity and fostering a collaborative business environment. The platform offers key capabilities such as listing creation, real-time negotiation, binding contract generation, and comprehensive deal lifecycle management. Bareter is designed for global expansion with multi-country/city support, includes robust user verification (KYC/KYB), and leverages AI-powered functionalities. It aims to revolutionize B2B trade by offering a free, efficient, and secure bartering ecosystem.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite, Wouter for routing, and TanStack React Query for state management.
- **UI/UX**: Mobile-first responsive design, Instagram-style navigation, and adaptive layouts. Supports English (LTR) and Arabic (RTL) with persistent language preference. Uses shadcn/ui (Radix UI based) and Tailwind CSS with a deep-teal color scheme and specific brand design tokens.
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

### Core Features
- **User Management**: Onboarding, profiles with KYC/KYB verification, account safety.
- **Content & Discovery**: Explore/Discover hub, Instagram-style feed, advanced search.
- **Marketplace**: Listing creation, AI-powered matching, valuation, moderation, and quality control.
- **Communication & Deals**: Real-time direct messaging, deal negotiation, and contract generation with off-platform keyword detection.
- **Admin & Analytics**: User and Admin Dashboards for platform management, moderation, and analytics. Admin panel includes comprehensive user management (status filters, detail drawer, CSV export, password reset, PDPL erasure, verification tier control, email compose, ban with re-registration prevention, session revocation, DSAR export, marketing consent management) and listing management (status/category filters, detail dialog with moderation history, approve/reject/edit/feature actions). Includes deal state management (complete/cancel), dispute lifecycle management (open→in_mediation→resolved with evidence, decisions, escalation), comprehensive admin audit log tracking all admin actions, failed login attempts viewer, and emergency data collection disable toggle. Email management section with bulk broadcast (city/accountType/verification filters), delivery tracking via `email_logs` table, and template editor (app_settings-backed). Enhanced analytics with user growth chart (30-day signups), new listings today KPI, and top listings ranking. Agent on/off toggles persisted in `agent_budgets.enabled` column with scheduler guard. CSV exports for deals and reports/disputes with formula-injection protection.
- **Platform Settings & Feature Flags**: Admin-configurable platform settings stored in app_settings table. Includes maintenance mode (503 middleware with 5s cache, blocks all API except admin/login/config during maintenance), registration toggle, invite-only mode (email-in-waitlist or valid referral/invite code), announcement banner (site-wide dismissible with optional link + localStorage persistence), CMS editors (hero headline/tagline/CTA, how-it-works steps, FAQ entries), active emirates enforcement on listing creation, high-value threshold (enforced server-side on listing creation for value flagging + displayed on ListingCard), max listings per user enforcement, waitlist enabled toggle (gates waitlist signups), disputes enabled toggle (gates dispute creation), AI matching enabled toggle (gates /api/ai/matches), contact/support email/phone settings, and waitlist launch email trigger. Public pages (landing, FAQ, help, footer) read from `/api/public/settings` with hardcoded fallbacks. Server-side validation on all settings updates (boolean/numeric/JSON/string type checks).
- **Waitlist Mode**: Configurable waitlist with referral tracking.
- **AI Agents Platform**: Integration of 6 specialized OpenAI-powered AI agents for moderation, support, matching, valuation, engagement, and administration.
- **Company OS (WhatsApp control plane)**: Founder-only WhatsApp interface for platform insights, marketing post drafting/publishing, campaign updates, and LLM-powered queries.
- **Marketing Agent**: Generates weekly campaign briefs from platform data, delivered as PDFs via WhatsApp.
- **Cookie Consent Audit Log**: Records all cookie banner decisions for compliance (UAE PDPL / GDPR).

## Launch Readiness

Production launch operations live under `docs/`:
- `LAUNCH_BACKUP_CHECKLIST.md` — DB backup + restore drill (Task #151).
- `LAUNCH_EMAIL_DELIVERABILITY.md` — Resend domain + DKIM/SPF/DMARC (Task #150).
- `LAUNCH_CUSTOM_DOMAIN.md` — `bareter.com` + TLS (Task #154).
- `LAUNCH_DIDIT_WEBHOOK.md` — Didit webhooks → production (Task #156).
- `LAUNCH_SMOKE_TEST.md` — final pre-announce go/no-go walk-through on the live domain (Task #159).

Audit evidence for each lives in `docs/launch-evidence/`. The smoke-test
template at `docs/launch-evidence/smoke-test.md` is the formal launch
sign-off record — every required row must be ticked before announcing.

## External Dependencies

- **Database**: PostgreSQL (Neon-backed).
- **Authentication & Security**: bcryptjs, express-session.
- **Identity Verification**: Didit (KYC/KYB).
- **Email Services**: Resend.
- **AI Integration**: OpenAI.
- **Geolocation**: ip-api.com, ipapi.co.
- **File Handling**: Multer.
- **Document Generation**: jsPDF for multi-language barter contracts with e-signature.
- **Third-Party UI Libraries**: Radix UI, react-icons, embla-carousel, react-day-picker, recharts.
- **CMS**: Sanity Studio (project ID: `ho605hmx`, dataset: `production`) for landing page content (hero, how-it-works, FAQ, help articles).
  - `SANITY_PROJECT_ID` — set to `ho605hmx` (sanity.io/manage/project/ho605hmx).
  - `SANITY_DATASET` — set to `production`.
  - `SANITY_API_TOKEN` — Viewer token with read-only access, set in Replit secrets.
  - All three vars are configured; the app falls back to `app_settings` if any are absent.
  - Initial seed content created: 1 heroSection, 3 howItWorksSteps, 2 faqEntries, 2 helpArticles.
  - To edit content: log into sanity.io/manage/project/ho605hmx and use Sanity Studio.
  - **Instant cache invalidation via webhook**: `POST /api/webhooks/sanity` receives Sanity publish events and immediately flushes the 60-second in-memory content cache so changes appear without delay.
    - `SANITY_WEBHOOK_SECRET` — the signing secret created in Sanity Studio → API → Webhooks. The endpoint rejects requests with a missing or invalid HMAC-SHA256 signature.
    - To configure: in Sanity Studio go to API → Webhooks → Add webhook. Set the URL to `https://<your-domain>/api/webhooks/sanity`, trigger on "Publish", enable HTTPS POST, copy the generated secret into `SANITY_WEBHOOK_SECRET`.