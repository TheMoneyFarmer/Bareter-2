# Sanity CMS Connection Evidence

**Task #207 — Connect Bareter to a real Sanity project**
**Date verified:** 2026-05-08

## Project Details
- Project ID: `ho605hmx`
- Dataset: `production`
- Token scope: Viewer (read-only)

## API Verification

`GET /api/public/settings` returns Sanity-backed content:
- `hero_headline`: "Barter what you have for what you need."
- `hero_tagline`: "UAE's AI-powered barter marketplace. No cash. Just value."
- `hero_cta`: "Start Bartering"
- `how_it_works_steps`: 3 steps (List, Match, Negotiate)
- `faq_entries`: 2 categories (General, Listings)

`GET /api/public/help-articles` returns:
- "Getting Started with Bareter" (slug: getting-started)
- "How Barter Deals Work" (slug: how-deals-work)

## Seeded Documents (8 total)
| Type | Count | IDs |
|------|-------|-----|
| heroSection | 1 | heroSection-singleton |
| howItWorksStep | 3 | howItWorksStep-1/2/3 |
| faqEntry | 2 | faqEntry-general, faqEntry-listings |
| helpArticle | 2 | helpArticle-getting-started, helpArticle-how-deals-work |

## Fallback Behaviour
If Sanity is unreachable, server falls back to `app_settings` values silently. No user-facing errors.

## Next Steps
- Task #212: Deploy schema to Sanity Studio (`npx sanity deploy` from `sanity/` dir)
- Task #213: Configure SANITY_WEBHOOK_SECRET for instant cache invalidation
