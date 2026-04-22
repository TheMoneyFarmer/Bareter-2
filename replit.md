# Bareter - Worldwide Barter Marketplace

## Overview

Bareter is a full-stack barter marketplace platform designed for businesses in the UAE and GCC regions to trade goods and services without cash. Its primary purpose is to facilitate a cashless economy, enhance liquidity, and foster a collaborative business environment. Key capabilities include creating listings, negotiating trades via real-time chat, generating binding barter contracts, and processing transactions with integrated success fees. The platform supports global expansion with multi-country/city support and robust user verification systems (KYC/KYB).

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

## External Dependencies

- **Database**: PostgreSQL.
- **Authentication & Security**: bcryptjs, express-session.
- **Payment Processing**: Stripe for success fees and webhooks.
- **Identity Verification**: Didit (KYC/KYB) for user and business verification.
- **Email Services**: Nodemailer.
- **AI Integration**: OpenAI for various AI agents.
- **File Handling**: Multer for uploads.
- **Document Generation**: jsPDF for barter contracts.
- **Third-Party UI Libraries**: Radix UI, react-icons, embla-carousel, react-day-picker, recharts.