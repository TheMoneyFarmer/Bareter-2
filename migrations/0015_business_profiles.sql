-- migrations/0015_business_profiles.sql
-- Business profiles, creator profiles, verification tiers,
-- split-quantity listings, contact-circumvention flags.
-- All additive. Zero existing rows modified.
-- Every new column is nullable or carries a safe default.

-- ══════════════════════════════════════════════════════════
-- 1. Extend users: verificationLevel + identityVerifiedAt
-- ══════════════════════════════════════════════════════════
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_level    integer   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS identity_verified_at  timestamp;

-- Existing rows: verification_level = 1 (email+phone tier, already live).
-- identity_verified_at stays NULL until Level 2 Didit KYC is approved.

-- ══════════════════════════════════════════════════════════
-- 2. New table: business_profiles
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS business_profiles (
  id                    varchar(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              varchar(36)  NOT NULL REFERENCES users(id),
  company_name          text         NOT NULL,
  trade_license_number  text,
  category              text,
  kyb_status            text         NOT NULL DEFAULT 'pending',
  kyb_verified_at       timestamp,
  didit_session_id      text,
  created_at            timestamp    NOT NULL DEFAULT now()
);
-- kyb_status: 'pending' | 'verified' | 'rejected'
-- didit_session_id: KYB session for this business profile,
--   distinct from users.didit_session_id (individual KYC).

-- ══════════════════════════════════════════════════════════
-- 3. New table: business_members
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS business_members (
  id           varchar(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  varchar(36)  NOT NULL REFERENCES business_profiles(id),
  user_id      varchar(36)  NOT NULL REFERENCES users(id),
  role         text         NOT NULL DEFAULT 'member',
  invited_at   timestamp    NOT NULL DEFAULT now(),
  joined_at    timestamp,
  UNIQUE (business_id, user_id)
);
-- role: 'admin' | 'member'

-- ══════════════════════════════════════════════════════════
-- 4. New table: creator_profiles
--    NO URL / LINK / HANDLE / EXTERNAL-REF FIELDS.
--    primary_platform: plain text label only ("Instagram").
--    audience_size: text string ("50K") — not a number, not a link.
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS creator_profiles (
  id               varchar(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          varchar(36)  NOT NULL UNIQUE REFERENCES users(id),
  display_name     text         NOT NULL,
  bio              text,
  niche            text,
  primary_platform text,
  audience_size    text,
  created_at       timestamp    NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════
-- 5. New table: creator_portfolio_items
--    media_url: path on Bareter's own storage only.
--    Same upload pipeline as listing photos.
--    NOT an external embed, NOT a user-supplied URL.
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS creator_portfolio_items (
  id          varchar(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  varchar(36)  NOT NULL REFERENCES creator_profiles(id),
  media_url   text         NOT NULL,
  media_type  text         NOT NULL DEFAULT 'image',
  caption     text,
  created_at  timestamp    NOT NULL DEFAULT now()
);
-- media_type: 'image' | 'video'

-- ══════════════════════════════════════════════════════════
-- 6. Extend listings: 7 new optional columns
--    listing_type DEFAULT 'individual_item' → all existing
--    rows get this value automatically, zero behaviour change.
--    All other new columns are nullable.
-- ══════════════════════════════════════════════════════════
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS listing_type       text        NOT NULL DEFAULT 'individual_item',
  ADD COLUMN IF NOT EXISTS business_id        varchar(36) REFERENCES business_profiles(id),
  ADD COLUMN IF NOT EXISTS creator_id         varchar(36) REFERENCES creator_profiles(id),
  ADD COLUMN IF NOT EXISTS total_quantity     integer,
  ADD COLUMN IF NOT EXISTS remaining_quantity integer,
  ADD COLUMN IF NOT EXISTS unit_label         text,
  ADD COLUMN IF NOT EXISTS claim_status       text;
-- listing_type: 'individual_item' | 'creator_service'
--               | 'business_product' | 'business_wholesale'
-- claim_status: NULL (not a split listing) | 'fully_claimed'

-- ══════════════════════════════════════════════════════════
-- 7. New table: listing_claims
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS listing_claims (
  id                 varchar(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id         varchar(36)  NOT NULL REFERENCES listings(id),
  claimant_user_id   varchar(36)  NOT NULL REFERENCES users(id),
  claimed_quantity   integer      NOT NULL DEFAULT 1,
  status             text         NOT NULL DEFAULT 'pending',
  linked_proposal_id varchar(36)  REFERENCES listing_comments(id),
  created_at         timestamp    NOT NULL DEFAULT now()
);
-- status: 'pending' | 'proposed' | 'accepted' | 'completed' | 'cancelled'
-- linked_proposal_id → existing proposals table (listing_comments)

-- ══════════════════════════════════════════════════════════
-- 8. New table: message_flags (contact-circumvention log)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS message_flags (
  id              varchar(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      varchar(36)  NOT NULL REFERENCES messages(id),
  conversation_id varchar(36)  NOT NULL REFERENCES deals(id),
  flag_type       text         NOT NULL,
  created_at      timestamp    NOT NULL DEFAULT now()
);
-- flag_type: 'phone' | 'email' | 'social_handle' | 'platform_url'
