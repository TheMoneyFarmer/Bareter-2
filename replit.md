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

## External Dependencies

- **Database**: PostgreSQL.
- **Authentication & Security**: bcryptjs, express-session.
- **Identity Verification**: Didit (KYC/KYB).
- **Email Services**: Nodemailer.
- **AI Integration**: OpenAI.
- **File Handling**: Multer.
- **Document Generation**: jsPDF for multi-language (English, Arabic, bilingual) barter contracts with e-signature functionality.
- **Third-Party UI Libraries**: Radix UI, react-icons, embla-carousel, react-day-picker, recharts.