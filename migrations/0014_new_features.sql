-- ── Barter Credits ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "barter_credits" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL UNIQUE REFERENCES "users"("id"),
  "balance_aed" decimal(12, 2) NOT NULL DEFAULT 0,
  "lifetime_earned_aed" decimal(12, 2) NOT NULL DEFAULT 0,
  "updated_at" timestamp DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "barter_credit_transactions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "amount_aed" decimal(12, 2) NOT NULL,
  "type" text NOT NULL,
  "deal_id" varchar(36) REFERENCES "deals"("id"),
  "note" text,
  "created_at" timestamp DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "bct_user_id_idx" ON "barter_credit_transactions"("user_id");
CREATE INDEX IF NOT EXISTS "bct_deal_id_idx" ON "barter_credit_transactions"("deal_id");

-- ── WhatsApp Settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_whatsapp_settings" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL UNIQUE REFERENCES "users"("id"),
  "phone" text,
  "opted_in" boolean NOT NULL DEFAULT false,
  "notify_deal_proposals" boolean NOT NULL DEFAULT true,
  "notify_messages" boolean NOT NULL DEFAULT true,
  "notify_matches" boolean NOT NULL DEFAULT true,
  "opted_in_at" timestamp,
  "created_at" timestamp DEFAULT NOW(),
  "updated_at" timestamp DEFAULT NOW()
);

-- ── Deal Success Stories ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "success_stories" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id" varchar(36) NOT NULL UNIQUE REFERENCES "deals"("id"),
  "author_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "partner_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "caption" text,
  "image_url" text,
  "seeker_item" text,
  "provider_item" text,
  "is_featured" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp DEFAULT NOW(),
  "updated_at" timestamp DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "ss_status_idx" ON "success_stories"("status");
CREATE INDEX IF NOT EXISTS "ss_author_id_idx" ON "success_stories"("author_id");

-- ── Match Digest Log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "match_digest_log" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "listing_id" varchar(36) REFERENCES "listings"("id"),
  "matches_count" integer NOT NULL DEFAULT 0,
  "email_sent" boolean NOT NULL DEFAULT false,
  "sent_at" timestamp DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "mdl_user_id_idx" ON "match_digest_log"("user_id");
CREATE INDEX IF NOT EXISTS "mdl_sent_at_idx" ON "match_digest_log"("sent_at");
