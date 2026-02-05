# Recipro - UAE Barter Marketplace

## Overview

Recipro is a full-stack barter marketplace platform designed for UAE and GCC businesses to trade goods and services without cash. The platform enables verified businesses to create listings (offers and requests), propose trades, negotiate via real-time chat, generate binding barter contracts, and complete transactions with integrated payment processing for success fees.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state management and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Design**: RESTful JSON API endpoints under `/api/*`
- **Session Management**: Express-session with in-memory store (MemoryStore)
- **Authentication**: Custom email/password authentication with bcryptjs for password hashing

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` - shared between frontend and backend
- **Migrations**: Drizzle Kit for database migrations (`./migrations` directory)
- **Validation**: Zod schemas generated from Drizzle schemas using drizzle-zod

### Build System
- **Development**: Vite dev server with HMR, proxied through Express
- **Production**: esbuild bundles server code, Vite builds client to `dist/public`
- **Path Aliases**: `@/*` maps to `client/src/*`, `@shared/*` maps to `shared/*`

### Key Design Patterns
- **Shared Types**: Schema definitions in `shared/` are imported by both client and server
- **Storage Interface**: `server/storage.ts` abstracts all database operations behind an interface
- **API Request Helper**: `client/src/lib/queryClient.ts` provides typed fetch wrappers
- **Context Providers**: Auth, Theme, and I18n contexts wrap the application for global state

### Internationalization (i18n)
- **Languages**: English (LTR) and Arabic (RTL) supported
- **Provider**: `client/src/lib/i18n.tsx` - I18nProvider context
- **Storage**: Language preference persisted in localStorage
- **RTL Support**: Document direction automatically switches based on language
- **Translations**: Key-value pairs in `translations` object in i18n.tsx

### Onboarding Flow
- **4-Step Wizard**: Basic Info → Offers → Needs → Profile Photo
- **Progress Tracking**: `onboardingStep` and `onboardingCompleted` fields on User model
- **Route**: `/onboarding` page

### Core Domain Models
- **Users**: Profile data, verification status, what they offer/need
- **Listings**: Offers or requests with categories, values in AED, locations
- **Deals**: Trade proposals with state machine (draft → proposed → accepted → in_progress → completed)
- **Messages**: Real-time chat messages per deal
- **Ratings**: Post-completion reviews
- **Notifications**: In-app notification system

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connected via `DATABASE_URL` environment variable
- **Connection**: Uses `pg` package with connection pooling

### Authentication & Security
- **bcryptjs**: Password hashing
- **express-session**: Session management
- **Session Secret**: Configured via `SESSION_SECRET` environment variable

### Payment Processing
- **Stripe**: Payment integration for success fees (12% of smaller deal value, min AED 100)
- **Checkout Flow**: `/api/deals/:id/checkout` creates Stripe checkout session
- **Webhook**: Stripe webhooks handled at `/api/webhooks/stripe` (raw body required)
- **Fee Calculation**: 12% of smaller deal value, minimum AED 100

### Identity Verification (Didit KYC/KYB)
- **Provider**: Didit (https://didit.me) for identity verification
- **KYC**: Know Your Customer verification for individuals (Emirates ID/Passport)
- **KYB**: Know Your Business verification for businesses (Trade License)
- **Session Flow**: `/api/verification/session` creates a Didit verification session
- **Status Check**: `/api/verification/status` returns current verification status
- **Webhook**: Didit webhooks handled at `/api/webhooks/didit` (raw body, HMAC-SHA256 signature)
- **Trading Block**: Users must be verified (KYC or KYB approved) before creating listings or deals
- **Required Environment Variables**:
  - `DIDIT_API_KEY`: API key from Didit Business Console
  - `DIDIT_WEBHOOK_SECRET`: Webhook secret for signature verification
  - `DIDIT_KYC_WORKFLOW_ID`: Workflow ID for individual verification
  - `DIDIT_KYB_WORKFLOW_ID`: Workflow ID for business verification

### Email Services
- **Nodemailer**: Email sending capability for notifications

### AI Integration
- **OpenAI**: AI-powered matching suggestions
- **Google Generative AI**: Additional AI capabilities

### File Handling
- **Multer**: File upload handling for images and documents

### Document Generation
- **jsPDF**: PDF generation for barter contracts

### Third-Party UI Libraries
- **Radix UI**: Accessible component primitives (dialogs, dropdowns, tooltips, etc.)
- **react-icons**: Icon library for social media icons
- **embla-carousel**: Carousel component
- **react-day-picker**: Date picker component
- **recharts**: Charting library for admin analytics