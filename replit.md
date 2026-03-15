# BarterGram - UAE Barter Marketplace

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
- **Direct Messaging Inbox**: `/inbox` page with conversation list and thread view; routes: `GET /api/inbox`, `GET /api/inbox/:userId`, `GET /api/inbox-unread-count`; unread badge in header and mobile nav; pre-selects conversation when opened from profile via `?userId=` query param.
- **Listing Intelligence**: `server/marketValues.ts` with UAE market averages and `isValueFlagged()` (flags if value < 70% of category average); `valueFlagged` computed on listing creation; market value warning badges on browse cards and listing detail; live market average hint in create-listing form; `server/visionClient.ts` for Google Vision image scanning (silent when `GOOGLE_VISION_KEY` not set); scan results stored in `image_scans` table; `imageFlagged` set on listing; admin listings table shows both value and image flagged badges.

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