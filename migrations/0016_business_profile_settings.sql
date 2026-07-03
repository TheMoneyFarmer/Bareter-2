-- migrations/0016_business_profile_settings.sql
-- Extend business_profiles with storefront and admin-control fields.
-- All additive. All new columns are nullable or carry safe defaults.
-- Zero existing rows modified.

ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS cover_image_url  text,
  ADD COLUMN IF NOT EXISTS logo_url         text,
  ADD COLUMN IF NOT EXISTS description      text,
  ADD COLUMN IF NOT EXISTS business_hours   jsonb,
  ADD COLUMN IF NOT EXISTS location         text,
  ADD COLUMN IF NOT EXISTS website_display  text,
  ADD COLUMN IF NOT EXISTS is_featured      boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active        boolean  NOT NULL DEFAULT true;

-- cover_image_url / logo_url: paths on Bareter's own storage only.
-- Same upload pipeline as listing photos. NEVER a user-supplied external URL.

-- business_hours jsonb shape (enforced by app layer, not DB):
-- { mon: {open:"09:00", close:"18:00", closed:false},
--   tue: ..., sat: {open:"10:00", close:"14:00"},
--   sun: {closed:true} }
-- All time values are wall-clock strings. Asia/Dubai timezone.

-- website_display is plain text only.
-- MUST NEVER be rendered as <a href> anywhere in the application.

-- is_featured: admin-controlled. Default false.
--   Used to surface businesses in featured rows on Browse/Directory.
--   Business owners cannot set their own is_featured.

-- is_active: admin-controlled. Default true.
--   When false: business does not appear in any discovery surface,
--   storefront returns 404 to the public, owner can still view it.
--   Existing deals are unaffected.
