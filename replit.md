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
- **Company OS (WhatsApp control plane)**: Founder-only WhatsApp number that exposes `help`, `revenue`, `revenue week`, `status`, `agents`, `costs`, plus free-form questions answered by the LLM (gated by a monthly AED budget). Inbound webhook lives at `/api/company-os/whatsapp`.

## Verifying the WhatsApp control plane after deploy

1. In the Twilio Console, open **Messaging → Try it out → Send a WhatsApp message** and copy the join code (e.g. `join orange-zebra`).
2. From the founder phone (the number set in `FOUNDER_WHATSAPP_NUMBER`, including the `whatsapp:` prefix), send the join code to the Twilio sandbox number `+1 415 523 8886`. You should get a confirmation reply within a few seconds.
3. In the Twilio Console, set the sandbox **"WHEN A MESSAGE COMES IN"** webhook to `https://<your-domain>/api/company-os/whatsapp` (HTTP POST). The handler responds 200 immediately and dispatches the actual reply over the REST API, so Twilio never times out.
4. From the founder phone, send `help`. You should receive the Bareter Company OS menu. Then verify each command returns a sensible reply: `revenue`, `revenue week`, `status`, `agents`, `costs`, and a free-form question like "How are we doing this month?".
5. Send a message from any other WhatsApp number to the sandbox — it should be silently ignored (no reply, 200 in the Twilio logs).
6. Required production secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (e.g. `whatsapp:+14155238886`), `FOUNDER_WHATSAPP_NUMBER` (e.g. `whatsapp:+9715XXXXXXXX`). Optional: `COMPANY_OS_MONTHLY_BUDGET_AED` (default 400), `USD_TO_AED_RATE` (default 3.6725).

The end-to-end behaviour above is also covered by `tests/companyOs.whatsapp.test.ts` — running `npx vitest run tests/companyOs.whatsapp.test.ts` exercises the signature gate, founder ACL, and every command before deploy.

## External Dependencies

- **Database**: PostgreSQL.
- **Authentication & Security**: bcryptjs, express-session.
- **Payment Processing**: Stripe SDK integration and plumbing exists in the codebase but is not used by any user-facing flow.
- **Identity Verification**: Didit (KYC/KYB) for user and business verification.
- **Email Services**: Nodemailer.
- **AI Integration**: OpenAI for various AI agents.
- **File Handling**: Multer for uploads.
- **Document Generation**: jsPDF for barter contracts.
- **Third-Party UI Libraries**: Radix UI, react-icons, embla-carousel, react-day-picker, recharts.