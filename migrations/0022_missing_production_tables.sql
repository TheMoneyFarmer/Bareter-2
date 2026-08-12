-- Tables and columns that exist in the schema and in the workspace database
-- but never reached production. Every `db:push` during development landed on
-- the workspace DB; the deployment runs against a different one, so these
-- six tables and one column were never created there. Any code path touching
-- them has been failing in production since it shipped.
--
-- Generated from the live definitions in the workspace database rather than
-- hand-written, so types, defaults, constraints and indexes match exactly.
--
-- Purely additive: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Nothing is dropped, renamed or retyped, and re-running is a no-op.

CREATE TABLE IF NOT EXISTS barter_credits (
  id character varying(36) NOT NULL DEFAULT gen_random_uuid(),
  user_id character varying(36) NOT NULL,
  balance_aed numeric(12,2) NOT NULL DEFAULT '0'::numeric,
  lifetime_earned_aed numeric(12,2) NOT NULL DEFAULT '0'::numeric,
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT barter_credits_pkey PRIMARY KEY (id),
  CONSTRAINT barter_credits_user_id_unique UNIQUE (user_id),
  CONSTRAINT barter_credits_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS barter_credit_transactions (
  id character varying(36) NOT NULL DEFAULT gen_random_uuid(),
  user_id character varying(36) NOT NULL,
  amount_aed numeric(12,2) NOT NULL,
  type text NOT NULL,
  deal_id character varying(36),
  note text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT barter_credit_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT barter_credit_transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT barter_credit_transactions_deal_id_deals_id_fk FOREIGN KEY (deal_id) REFERENCES deals(id)
);
CREATE INDEX IF NOT EXISTS bct_user_id_idx ON public.barter_credit_transactions USING btree (user_id);
CREATE INDEX IF NOT EXISTS bct_deal_id_idx ON public.barter_credit_transactions USING btree (deal_id);

CREATE TABLE IF NOT EXISTS business_catalog_products (
  id character varying(36) NOT NULL DEFAULT gen_random_uuid(),
  business_id character varying(36) NOT NULL,
  name text NOT NULL,
  description text,
  price numeric(10,2),
  currency text NOT NULL DEFAULT 'AED'::text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT business_catalog_products_pkey PRIMARY KEY (id),
  CONSTRAINT business_catalog_products_business_id_business_profiles_id_fk FOREIGN KEY (business_id) REFERENCES business_profiles(id)
);
CREATE INDEX IF NOT EXISTS bcp_business_id_idx ON public.business_catalog_products USING btree (business_id);

CREATE TABLE IF NOT EXISTS match_digest_log (
  id character varying(36) NOT NULL DEFAULT gen_random_uuid(),
  user_id character varying(36) NOT NULL,
  listing_id character varying(36),
  matches_count integer NOT NULL DEFAULT 0,
  email_sent boolean NOT NULL DEFAULT false,
  sent_at timestamp without time zone DEFAULT now(),
  CONSTRAINT match_digest_log_pkey PRIMARY KEY (id),
  CONSTRAINT match_digest_log_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT match_digest_log_listing_id_listings_id_fk FOREIGN KEY (listing_id) REFERENCES listings(id)
);
CREATE INDEX IF NOT EXISTS mdl_user_id_idx ON public.match_digest_log USING btree (user_id);
CREATE INDEX IF NOT EXISTS mdl_sent_at_idx ON public.match_digest_log USING btree (sent_at);

CREATE TABLE IF NOT EXISTS success_stories (
  id character varying(36) NOT NULL DEFAULT gen_random_uuid(),
  deal_id character varying(36) NOT NULL,
  author_id character varying(36) NOT NULL,
  partner_id character varying(36) NOT NULL,
  caption text,
  image_url text,
  seeker_item text,
  provider_item text,
  is_featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT success_stories_pkey PRIMARY KEY (id),
  CONSTRAINT success_stories_deal_id_unique UNIQUE (deal_id),
  CONSTRAINT success_stories_deal_id_deals_id_fk FOREIGN KEY (deal_id) REFERENCES deals(id),
  CONSTRAINT success_stories_author_id_users_id_fk FOREIGN KEY (author_id) REFERENCES users(id),
  CONSTRAINT success_stories_partner_id_users_id_fk FOREIGN KEY (partner_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS ss_status_idx ON public.success_stories USING btree (status);
CREATE INDEX IF NOT EXISTS ss_author_id_idx ON public.success_stories USING btree (author_id);

CREATE TABLE IF NOT EXISTS user_whatsapp_settings (
  id character varying(36) NOT NULL DEFAULT gen_random_uuid(),
  user_id character varying(36) NOT NULL,
  phone text,
  opted_in boolean NOT NULL DEFAULT false,
  notify_deal_proposals boolean NOT NULL DEFAULT true,
  notify_messages boolean NOT NULL DEFAULT true,
  notify_matches boolean NOT NULL DEFAULT true,
  opted_in_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT user_whatsapp_settings_pkey PRIMARY KEY (id),
  CONSTRAINT user_whatsapp_settings_user_id_unique UNIQUE (user_id),
  CONSTRAINT user_whatsapp_settings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id)
);

ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS triggered_by character varying(36);
