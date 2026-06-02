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
- `hero_tagline`: "UAE's First AI-powered barter marketplace. No cash. Just value."
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

## Webhook Configuration (Task #213)

**Registered webhook:** `https://bareter.com/api/webhooks/sanity`
**Trigger:** On publish
**Secret:** Stored as `SANITY_WEBHOOK_SECRET` in Replit secrets

**Local verification (2026-05-08):**
- Valid HMAC-SHA256 signature → `{"received":true}` + cache cleared
- Stale timestamp (>5 min) → `401 {"message":"Request timestamp out of range"}`
- Bad signature → `401 {"message":"Invalid signature"}`

**Rotation procedure:** If `SANITY_WEBHOOK_SECRET` is ever compromised:
1. Delete the webhook in sanity.io/manage/project/ho605hmx/api → Webhooks
2. Re-create it to get a new signing secret
3. Update `SANITY_WEBHOOK_SECRET` in Replit secrets
4. Restart the application workflow

## Studio Deployment (Task #214)

**Deployed at:** https://bareter.sanity.studio/
**Deployed:** 2026-05-08
**Studio hostname:** bareter (configured in sanity/sanity.cli.ts)
**Build:** Successful (sanity v3, ~30s build time)
**Schemas deployed:** 4 types (heroSection, howItWorksStep, faqEntry, helpArticle)

**To redeploy after schema changes:**
1. Run from `sanity/` directory: `SANITY_AUTH_TOKEN=<personal-token> npx sanity deploy`
2. Or: `npx sanity login && npx sanity deploy` (interactive OAuth)

## Deploy Output (captured)

```
✓ Checking project info
Creating https://bareter.sanity.studio
✓ Creating studio hostname
✓ Clean output folder (20ms)
✓ Build Sanity Studio (28854ms)
✓ Extracted manifest (7996ms)
✓ Deployed 1/1 schemas
✓ Verifying local content
✓ Deploying to sanity.studio
Success! Studio deployed to https://bareter.sanity.studio/
```

## Content Edit Propagation

Content published in Sanity Studio fires the webhook at `https://bareter.com/api/webhooks/sanity`,
which calls `clearSanityCache()` immediately. The next request to `/api/public/settings` or
`/api/public/help-articles` fetches fresh content from Sanity (no 60s wait).
Verified locally: webhook returns `{"received":true}` within ~50ms of a valid publish event.

## Schema Types Confirmed in Deployed Studio

All 4 types compiled and deployed successfully:
- `heroSection` — Hero Section (headline, tagline, CTA button text/URL)
- `howItWorksStep` — How It Works Step (order, title, description, icon)
- `faqEntry` — FAQ Category (category name, questions array with q/a pairs)
- `helpArticle` — Help Article (title, slug, rich-text body)
