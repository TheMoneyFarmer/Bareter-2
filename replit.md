# BarterGram - Worldwide Barter Marketplace

## Brand Identity
- Master logo SVGs in `attached_assets/brand/`: `logo-icon.svg` (white Lucide handshake on deep-teal #136c68 rounded square — exact match of header `bg-primary` = `hsl(177 70% 25%)`), `logo-icon-white.svg`, `logo-icon-black.svg`, plus horizontal lockups `logo-full-color.svg`, `logo-white.svg`/`logo-full-white.svg`, `logo-black.svg`/`logo-full-black.svg`. Each has a matching PNG export at 2000x500 (lockups) and 1024x1024 (icon).
- Social cards: `og-image.svg/png` (1200x630) and `social-square.svg/png` (1080x1080) with dark teal gradient background.
- Served from `client/public/`: `favicon.ico` (multi-size 16/32/48), `favicon-16/32/192/512.png`, `apple-touch-icon.png` (180), `og-image.png`, `social-square.png`, `manifest.json` (BarterGram name, 192/512 icons + maskable apple-touch).
- `client/index.html` wires multi-size favicons, apple-touch-icon, og:image (1200x630) + twitter:image, theme-color #136c68, apple-mobile-web-app-title. `manifest.json` theme_color also #136c68.
- Header still uses inline Lucide `Handshake` in teal rounded box (matches brand mark exactly).
- Regenerate PNGs: edit the SVGs then run the `magick -background none ...` commands documented in the task plan (`.local/tasks/task-9.md`).

## Worldwide Location Expansion
- `shared/schema.ts` exposes `COUNTRIES` (~38 countries with cities), helpers `getCountryByCode`, `getCitiesForCountry`.
- Users have `country`, `city`, `locationPrompted`; listings & posts have `country`, `city`. Legacy `location` column kept.
- `server/geoClient.ts` does IP geolocation via ip-api.com + ipapi.co fallback (Cloudflare/Vercel header hints, default AE).
- Routes: `GET /api/geo/lookup`, `POST /api/users/me/location-prompted`.
- `/api/listings` and `/api/posts` accept `country`/`city` query params; `/api/ai/matches` filters listings by user country.
- UI: `LocationPicker` dialog (header pill), `LocationMismatchBanner` (auto popup if IP country ≠ profile country), country/city selects in onboarding, settings, create-listing.
- `VerifiedBadge` — blue badge for verified KYC (individual) or KYB-approved (business), used in header avatar.


## Overview

BarterGram is a full-stack barter marketplace platform for UAE and GCC businesses to trade goods and services without cash. It enables verified businesses to create listings, propose and negotiate trades via real-time chat, generate binding barter contracts, and complete transactions with integrated payment processing for success fees. The platform aims to facilitate a cashless economy for businesses, enhancing liquidity and fostering a collaborative business environment.

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

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ES modules.
- **API Design**: RESTful JSON API.
- **Session Management**: Express-session.
- **Authentication**: Custom email/password with bcryptjs.

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL.
- **Schema**: Shared between frontend and backend in `shared/schema.ts`.
- **Migrations**: Drizzle Kit.
- **Validation**: Zod schemas generated from Drizzle.

### Build System
- **Development**: Vite dev server.
- **Production**: esbuild for server, Vite for client.
- **Path Aliases**: `@/*` for client, `@shared/*` for shared.

### Key Design Patterns
- **Shared Types**: Schema definitions are shared across client and server.
- **Storage Interface**: Abstracts database operations.
- **API Request Helper**: Provides typed fetch wrappers.
- **Context Providers**: For global state (Auth, Theme, I18n).

### Mobile-First Responsive Design
- Features Instagram-style bottom navigation, responsive headers, and adaptive content layouts.
- Utilizes CSS utilities for scrollbar hiding and safe-area support.

### Internationalization (i18n)
- Supports English (LTR) and Arabic (RTL) with language preference persisted in localStorage.

### Core Features
- **Onboarding Flow**: A 4-step wizard for user setup.
- **Explore/Discover Hub**: `/browse` route with curated content, advanced search, filtering, and category browsing.
- **Trust & Credibility System**: Credibility score, skill-based endorsements, and enhanced portfolio displays.
- **Instagram-Style Feed**: `/feed` route for personalized content discovery, including stories and rich post cards with dynamic category-specific details.
- **Post Creation**: `/create-post` with smart forms and dynamic fields based on category.
- **Creator/Brand Signup**: 3-step wizard for account type selection and social media integration.
- **Core Domain Models**: Comprehensive models for Users, Posts, Deals (with deliverable checklists), Messages, Ratings, Notifications, Followers, Referrals, and Wishlists.
- **WhatsApp Support**: Integrated floating button for direct chat.
- **Professional Dashboard**: `/dashboard` for analytics, follower management, and deal tracking.
- **Admin Dashboard**: `/admin` for platform management, user/listing/deal moderation, and analytics, protected by role-based access.
- **Listing Social Engagement**: Like/unlike listings with counts, barter proposal comments (offer name + value + message), share-to-clipboard on listing cards and detail pages. DB tables: `listing_likes` (unique per user/listing), `listing_comments`.
- **Trust & Safety Platform**: `reports` table for user-submitted reports (targetType: listing/post/deal/user); Admin Reports and Behavioral Flags tabs; `ReportModal` component at `@/components/report-modal`; flag/report buttons on feed posts and listing detail pages; dismissible safety education banner on feed; high-value trade warning (AED 5,000+) in propose dialog; off-platform keyword detection toast in deal chat.
- **Account Safety Controls**: `isPaused` on users (blocks listing creation and deal acceptance with 403); admin can pause accounts via `PATCH /api/admin/users/:id/pause`; `PATCH /api/admin/users/:id/kyb` for KYB status review.
- **Trade License Gate**: Business accounts require KYB status "APPROVED" to create listings or accept deals; license upload in Settings (`/api/upload?type=business_license`) sets `kybStatus` to "PENDING_REVIEW".
- **Password Reset Flow**: `/forgot-password` and `/reset-password` pages; `POST /api/auth/forgot-password` sends a 1-hour expiring token via email; `GET /api/auth/reset-password/validate` validates token on page load; `POST /api/auth/reset-password` updates password; `server/emailService.ts` uses nodemailer (graceful console fallback if `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` not set); "Forgot password?" link on login page.
- **Direct Messaging Inbox**: `/inbox` page with conversation list and thread view; routes: `GET /api/inbox`, `GET /api/inbox/:userId`, `GET /api/inbox-unread-count`; unread badge in header and mobile nav; pre-selects conversation when opened from profile via `?userId=` query param.
- **Listing Intelligence**: `server/marketValues.ts` with UAE market averages and `isValueFlagged()` (flags if value < 70% of category average); `valueFlagged` computed on listing creation; market value warning badges on browse cards and listing detail; live market average hint in create-listing form; `server/visionClient.ts` for Google Vision image scanning (silent when `GOOGLE_VISION_KEY` not set); scan results stored in `image_scans` table; `imageFlagged` set on listing; admin listings table shows both value and image flagged badges.
- **AI Agents Platform**: 6 specialized AI agents powered by OpenAI via Replit AI Integrations (`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`). Shared LLM client at `server/agents/llm.ts` using `openai/gpt-4o-mini` model. DB tables: `moderation_logs`, `agent_interactions`. Columns: `moderationStatus` and `aiMatchScore` on listings; `moderationStatus` on posts.
  - **Moderation Agent** (`server/agents/moderationAgent.ts`): Auto-moderates new listings AND posts (async, non-blocking on creation). Approved content goes live; flagged/rejected content is deactivated (`isActive = false`) and user is notified via notification system. Logs all decisions to `moderation_logs`.
  - **Support Agent** (`server/agents/supportAgent.ts`): BarterBot chat assistant. Floating chat widget at `client/src/components/ai-support-chat.tsx` (only for authenticated users). Features "AI Assisted" badge and "Escalate to Human" button. API: `POST /api/ai/support`.
  - **Matching Agent** (`server/agents/matchingAgent.ts`): Smart barter matching based on user offers/needs and available listings. "For You" section in feed (`client/src/components/ai-match-cards.tsx`) shows 3-5 AI match cards with scores and "Why this matches" explanations. "Escalate to Human" for manual curation. API: `GET /api/ai/matches`.
  - **Valuation Agent** (`server/agents/valuationAgent.ts`): AI pricing advisor for barter items. Panel at `client/src/components/ai-valuation-panel.tsx` integrated in create-listing form. Auto-triggers for high-value items (>AED 50,000). Features "AI Assisted" badge and "Escalate to Human" button. API: `POST /api/ai/valuation`.
  - **Engagement Agent** (`server/agents/engagementAgent.ts`): Suggests listing ideas, profile improvements, trade opportunities. API: `GET /api/ai/engagement`.
  - **Admin Agent** (`server/agents/adminAgent.ts`): Platform analytics insights and Q&A for admins. APIs: `GET /api/ai/admin/insights`, `POST /api/ai/admin/ask`.
  - **AI Logs Admin Tab**: Admin dashboard "AI Logs" section with moderation logs and agent interactions tables. Features filtering by action type (approved/flagged/rejected) and agent type (support/matching/valuation/engagement/admin). Shows total token usage. API: `GET /api/ai/logs`.
  - **AI Seed Processing**: First 5 seed posts are automatically processed through moderation agent during initial database seeding.
  - **Blueprint integration**: `server/replit_integrations/` contains OpenAI blueprint scaffolding (chat, audio, image, batch). Blueprint's `shared/models/chat.ts` defines separate `conversations`/`messages` tables (not in drizzle config, not used by main app schema).

## External Dependencies

- **Database**: PostgreSQL (via `pg` package).
- **Authentication & Security**: bcryptjs, express-session.
- **Payment Processing**: Stripe for success fees and webhooks.
- **Identity Verification**: Didit (KYC/KYB) for user and business verification, with webhook support.
- **Email Services**: Nodemailer.
- **AI Integration**: OpenAI and Google Generative AI for matching and other capabilities.
- **File Handling**: Multer for uploads.
- **Document Generation**: jsPDF for barter contracts.
- **Third-Party UI Libraries**: Radix UI, react-icons, embla-carousel, react-day-picker, recharts.