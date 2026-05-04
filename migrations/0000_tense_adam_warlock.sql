CREATE TABLE "admin_audit_logs" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "admin_id" varchar(36) NOT NULL,
        "admin_email" text,
        "action" text NOT NULL,
        "target_type" text NOT NULL,
        "target_id" varchar(36),
        "details" jsonb,
        "ip_address" text,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_budgets" (
        "agent_name" text PRIMARY KEY NOT NULL,
        "monthly_cap_aed" numeric(10, 2) NOT NULL,
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_interactions" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36),
        "agent_type" text NOT NULL,
        "user_message" text,
        "agent_response" text,
        "metadata" jsonb,
        "tokens_used" integer DEFAULT 0,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_memory" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "agent_name" text NOT NULL,
        "memory_type" text NOT NULL,
        "key" text NOT NULL,
        "value" jsonb NOT NULL,
        "confidence" numeric(4, 3) DEFAULT '0.500' NOT NULL,
        "usage_count" integer DEFAULT 0 NOT NULL,
        "last_used_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
        "key" text PRIMARY KEY NOT NULL,
        "value" text NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "updated_by" varchar(36)
);
--> statement-breakpoint
CREATE TABLE "banned_emails" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "email" text NOT NULL,
        "banned_by" varchar(36),
        "reason" text,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "banned_emails_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "board_reports" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "report_month" text NOT NULL,
        "object_storage_key" text,
        "summary_text" text DEFAULT '' NOT NULL,
        "metrics_json" jsonb DEFAULT '{}'::jsonb,
        "pdf_size_bytes" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "board_reports_report_month_unique" UNIQUE("report_month")
);
--> statement-breakpoint
CREATE TABLE "campaign_performance" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "campaign_name" text NOT NULL,
        "channel" text,
        "ctr" numeric(6, 2) DEFAULT '0' NOT NULL,
        "spend_aed" numeric(12, 2) DEFAULT '0' NOT NULL,
        "conversions" integer DEFAULT 0 NOT NULL,
        "notes" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "campaign_performance_campaign_name_unique" UNIQUE("campaign_name")
);
--> statement-breakpoint
CREATE TABLE "company_os_logs" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "agent_name" text NOT NULL,
        "command" text,
        "input_preview" text,
        "output_preview" text,
        "model" text,
        "tokens_used" integer DEFAULT 0,
        "cost_aed" numeric(10, 6) DEFAULT '0',
        "status" text DEFAULT 'ok' NOT NULL,
        "error_message" text,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "consent_logs" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36),
        "anonymous_id" varchar(64),
        "policy_version" integer NOT NULL,
        "decision" text NOT NULL,
        "essential" boolean DEFAULT true NOT NULL,
        "analytics" boolean DEFAULT false NOT NULL,
        "marketing" boolean DEFAULT false NOT NULL,
        "ip_address" text,
        "user_agent" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_briefs" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "week_start" text NOT NULL,
        "theme" text NOT NULL,
        "audience" text NOT NULL,
        "hooks" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "suggested_budget_aed" numeric(12, 2) DEFAULT '0' NOT NULL,
        "recommendations" text,
        "pdf_storage_key" text,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_milestones" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "deal_id" varchar(36) NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "is_completed" boolean DEFAULT false,
        "completed_at" timestamp,
        "completed_by" varchar(36),
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deals" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "deal_number" text NOT NULL,
        "seeker_id" varchar(36) NOT NULL,
        "provider_id" varchar(36) NOT NULL,
        "seeker_listing_id" varchar(36),
        "provider_listing_id" varchar(36),
        "seeker_offer" text NOT NULL,
        "seeker_value" numeric(12, 2) NOT NULL,
        "provider_offer" text NOT NULL,
        "provider_value" numeric(12, 2) NOT NULL,
        "state" text DEFAULT 'draft' NOT NULL,
        "timeline" text,
        "deliverables" jsonb,
        "penalties" text,
        "seeker_proof_url" text,
        "provider_proof_url" text,
        "seeker_completed" boolean DEFAULT false,
        "provider_completed" boolean DEFAULT false,
        "contract_pdf_url" text,
        "proposed_at" timestamp,
        "accepted_at" timestamp,
        "completed_at" timestamp,
        "cancelled_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "deals_deal_number_unique" UNIQUE("deal_number")
);
--> statement-breakpoint
CREATE TABLE "disputes" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "report_id" varchar(36),
        "deal_id" varchar(36),
        "party_a_id" varchar(36) NOT NULL,
        "party_b_id" varchar(36) NOT NULL,
        "status" text DEFAULT 'open' NOT NULL,
        "subject" text NOT NULL,
        "description" text,
        "evidence" jsonb DEFAULT '[]'::jsonb,
        "decision" text,
        "decision_reasoning" text,
        "decision_by" varchar(36),
        "decision_at" timestamp,
        "outcome" text,
        "escalated_at" timestamp,
        "escalated_by" varchar(36),
        "resolved_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "endorsements" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "from_user_id" varchar(36) NOT NULL,
        "to_user_id" varchar(36) NOT NULL,
        "skill" text NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "failed_login_attempts" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "email" text NOT NULL,
        "ip_address" text,
        "user_agent" text,
        "reason" text DEFAULT 'invalid_credentials',
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "finance_snapshots" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "snapshot_date" text NOT NULL,
        "total_revenue_aed" numeric(12, 2) DEFAULT '0' NOT NULL,
        "transaction_count" integer DEFAULT 0 NOT NULL,
        "breakdown" jsonb DEFAULT '{}'::jsonb,
        "refunds_aed" numeric(12, 2) DEFAULT '0' NOT NULL,
        "refund_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "finance_snapshots_snapshot_date_unique" UNIQUE("snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "followers" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "follower_id" varchar(36) NOT NULL,
        "following_id" varchar(36) NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "image_scans" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "image_url" text NOT NULL,
        "listing_id" varchar(36),
        "flagged" boolean DEFAULT false,
        "reason" text,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kpi_snapshots" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "snapshot_date" text NOT NULL,
        "total_users" integer DEFAULT 0 NOT NULL,
        "new_users_today" integer DEFAULT 0 NOT NULL,
        "active_users_7d" integer DEFAULT 0 NOT NULL,
        "total_posts" integer DEFAULT 0 NOT NULL,
        "posts_today" integer DEFAULT 0 NOT NULL,
        "total_deals" integer DEFAULT 0 NOT NULL,
        "deals_completed_today" integer DEFAULT 0 NOT NULL,
        "gmv_aed_7d" numeric(12, 2) DEFAULT '0' NOT NULL,
        "completion_rate_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
        "top_category" text,
        "top_city" text,
        "ai_cost_aed_month_to_date" numeric(12, 2) DEFAULT '0' NOT NULL,
        "extras" jsonb DEFAULT '{}'::jsonb,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "kpi_snapshots_snapshot_date_unique" UNIQUE("snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "document_type" text NOT NULL,
        "title" text NOT NULL,
        "party_a" text,
        "party_b" text,
        "value_aed" numeric(12, 2),
        "body" text,
        "metadata" jsonb,
        "object_storage_key" text,
        "status" text DEFAULT 'draft' NOT NULL,
        "signature_token_a" text,
        "signature_token_b" text,
        "party_a_signed_at" timestamp,
        "party_b_signed_at" timestamp,
        "party_a_signed_name" text,
        "party_b_signed_name" text,
        "party_a_signed_ip" text,
        "party_b_signed_ip" text,
        "signed_object_storage_key" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "legal_page_versions" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "slug" text NOT NULL,
        "language" text NOT NULL,
        "version" integer NOT NULL,
        "title" text NOT NULL,
        "subtitle" text DEFAULT '' NOT NULL,
        "blocks" jsonb NOT NULL,
        "effective_date" text NOT NULL,
        "published_at" timestamp DEFAULT now() NOT NULL,
        "published_by" varchar(36)
);
--> statement-breakpoint
CREATE TABLE "legal_pages" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "slug" text NOT NULL,
        "language" text NOT NULL,
        "title" text NOT NULL,
        "subtitle" text DEFAULT '' NOT NULL,
        "blocks" jsonb NOT NULL,
        "effective_date" text NOT NULL,
        "version" integer DEFAULT 1 NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "updated_by" varchar(36)
);
--> statement-breakpoint
CREATE TABLE "listing_comments" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "listing_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "content" text,
        "offer_item_name" varchar(255) NOT NULL,
        "offer_item_value" numeric(12, 2) NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "listing_likes" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "listing_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "listings" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "type" text NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "categories" jsonb DEFAULT '[]'::jsonb,
        "retail_value" numeric(12, 2) NOT NULL,
        "images" jsonb DEFAULT '[]'::jsonb,
        "location" text,
        "country" text,
        "city" text,
        "tags" jsonb DEFAULT '[]'::jsonb,
        "is_active" boolean DEFAULT true,
        "view_count" integer DEFAULT 0,
        "wanted_categories" jsonb DEFAULT '[]'::jsonb,
        "exchange_items" jsonb DEFAULT '[]'::jsonb,
        "open_to_offers" boolean DEFAULT true,
        "category_details" jsonb,
        "condition" text DEFAULT 'like_new',
        "service_tiers" jsonb,
        "like_count" integer DEFAULT 0,
        "value_flagged" boolean DEFAULT false,
        "image_flagged" boolean DEFAULT false,
        "moderation_status" text DEFAULT 'pending',
        "ai_match_score" numeric(5, 2),
        "is_featured" boolean DEFAULT false,
        "featured_until" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_posts" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "channel" text,
        "topic" text NOT NULL,
        "body" text NOT NULL,
        "external_id" text,
        "external_url" text,
        "status" text NOT NULL,
        "error" text,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "deal_id" varchar(36) NOT NULL,
        "sender_id" varchar(36) NOT NULL,
        "content" text NOT NULL,
        "is_read" boolean DEFAULT false,
        "is_off_platform" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "moderation_logs" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "target_type" text NOT NULL,
        "target_id" varchar(36) NOT NULL,
        "action" text NOT NULL,
        "reason" text,
        "confidence" numeric(5, 2),
        "raw_response" jsonb,
        "reviewed_by_admin" boolean DEFAULT false,
        "admin_user_id" varchar(36),
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "type" text NOT NULL,
        "title" text NOT NULL,
        "message" text NOT NULL,
        "related_deal_id" varchar(36),
        "is_read" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "images" jsonb DEFAULT '[]'::jsonb,
        "deal_id" varchar(36),
        "category" text,
        "barter_value" numeric(12, 2),
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "post_bookmarks" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "post_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "post_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "content" text,
        "offer_item_name" varchar(255) NOT NULL,
        "offer_item_value" numeric(12, 2) NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "post_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "posts" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "title" text,
        "post_type" text DEFAULT 'offer',
        "caption" text NOT NULL,
        "media_urls" jsonb DEFAULT '[]'::jsonb,
        "media_type" text DEFAULT 'image',
        "offer_items" jsonb DEFAULT '[]'::jsonb,
        "want_items" jsonb DEFAULT '[]'::jsonb,
        "declared_value" numeric(12, 2),
        "hashtags" jsonb DEFAULT '[]'::jsonb,
        "feed_category" text DEFAULT 'Other',
        "sub_category" text,
        "category_details" jsonb,
        "market_valuation" text,
        "location" text,
        "country" text,
        "city" text,
        "condition" text,
        "video_url" text,
        "tagged_user_ids" jsonb DEFAULT '[]'::jsonb,
        "is_featured" boolean DEFAULT false,
        "featured_until" timestamp,
        "is_story" boolean DEFAULT false,
        "expires_at" timestamp,
        "like_count" integer DEFAULT 0,
        "moderation_status" text DEFAULT 'pending',
        "is_active" boolean DEFAULT true,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "proactive_alerts" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "alert_type" text NOT NULL,
        "severity" text NOT NULL,
        "title" text NOT NULL,
        "body" text NOT NULL,
        "data_json" jsonb DEFAULT '{}'::jsonb,
        "day_key" text NOT NULL,
        "acknowledged_at" timestamp,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quick_inquiries" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "from_user_id" varchar(36) NOT NULL,
        "to_user_id" varchar(36) NOT NULL,
        "listing_id" varchar(36),
        "post_id" varchar(36),
        "message" text DEFAULT 'Is this still available?' NOT NULL,
        "reply" text,
        "is_read" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ratings" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "deal_id" varchar(36) NOT NULL,
        "from_user_id" varchar(36) NOT NULL,
        "to_user_id" varchar(36) NOT NULL,
        "score" integer NOT NULL,
        "review" text,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referrals" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "referrer_id" varchar(36) NOT NULL,
        "referred_id" varchar(36) NOT NULL,
        "referrer_fee_waived" boolean DEFAULT false,
        "referred_fee_waived" boolean DEFAULT false,
        "referrer_deal_id" varchar(36),
        "referred_deal_id" varchar(36),
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reports" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "reporter_id" varchar(36) NOT NULL,
        "target_type" text NOT NULL,
        "target_id" varchar(36) NOT NULL,
        "reason" text NOT NULL,
        "notes" text,
        "status" text DEFAULT 'pending' NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sales_leads" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "email" text NOT NULL,
        "full_name" text NOT NULL,
        "user_type" text NOT NULL,
        "location" text,
        "lead_score" integer DEFAULT 0 NOT NULL,
        "status" text DEFAULT 'new' NOT NULL,
        "last_activity_at" timestamp,
        "first_deal_at" timestamp,
        "re_engagement_sent_at" timestamp,
        "notes" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sales_reengagement_events" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "lead_id" varchar(36) NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "event_type" text NOT NULL,
        "link_token" varchar(64) NOT NULL,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sales_sync_state" (
        "id" text PRIMARY KEY NOT NULL,
        "cursor_user_id" varchar(36),
        "last_run_at" timestamp,
        "wrap_count" integer DEFAULT 0 NOT NULL,
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "name" text NOT NULL,
        "filters" jsonb NOT NULL,
        "notify_enabled" boolean DEFAULT true,
        "last_notified_at" timestamp,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
        "sid" varchar PRIMARY KEY NOT NULL,
        "sess" json NOT NULL,
        "expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "email" text NOT NULL,
        "password" text NOT NULL,
        "full_name" text NOT NULL,
        "bio" text,
        "location" text,
        "country" text DEFAULT 'AE',
        "city" text,
        "location_prompted" boolean DEFAULT false,
        "avatar_url" text,
        "is_verified" boolean DEFAULT false,
        "is_admin" boolean DEFAULT false,
        "role" text DEFAULT 'user',
        "is_banned" boolean DEFAULT false,
        "banned_at" timestamp,
        "banned_reason" text,
        "is_paused" boolean DEFAULT false,
        "business_name" text,
        "business_license_url" text,
        "verification_doc_url" text,
        "verification_status" text DEFAULT 'pending',
        "profile_completed" boolean DEFAULT false,
        "onboarding_completed" boolean DEFAULT false,
        "onboarding_step" integer DEFAULT 1,
        "email_verified" boolean DEFAULT false,
        "email_verification_token" text,
        "email_verification_expires" timestamp,
        "password_reset_token" text,
        "password_reset_expires" timestamp,
        "what_i_offer" jsonb DEFAULT '[]'::jsonb,
        "what_i_need" jsonb DEFAULT '[]'::jsonb,
        "portfolio_images" jsonb DEFAULT '[]'::jsonb,
        "language" text DEFAULT 'en',
        "account_type" text DEFAULT 'individual',
        "kyc_status" text DEFAULT 'NOT_STARTED',
        "kyb_status" text DEFAULT 'NOT_STARTED',
        "didit_session_id" text,
        "didit_verified_at" timestamp,
        "didit_verification_data" jsonb,
        "email_notifications" boolean DEFAULT true,
        "deal_notifications" boolean DEFAULT true,
        "message_notifications" boolean DEFAULT true,
        "marketing_emails" boolean DEFAULT false,
        "profile_visibility" text DEFAULT 'public',
        "show_email" boolean DEFAULT false,
        "show_phone" boolean DEFAULT false,
        "allow_direct_messages" boolean DEFAULT true,
        "preferred_categories" jsonb DEFAULT '[]'::jsonb,
        "trading_radius" integer DEFAULT 0,
        "min_trade_value" numeric(12, 2) DEFAULT '0',
        "max_trade_value" numeric(12, 2),
        "auto_match_enabled" boolean DEFAULT true,
        "phone" text,
        "website" text,
        "social_links" jsonb,
        "timezone" text DEFAULT 'Asia/Dubai',
        "currency" text DEFAULT 'AED',
        "referral_code" text,
        "referred_by" varchar(36),
        "signup_type" text DEFAULT 'creator',
        "social_profiles" jsonb DEFAULT '[]'::jsonb,
        "avg_response_time" integer DEFAULT 0,
        "completion_rate" numeric(5, 2) DEFAULT '0',
        "credibility_score" integer DEFAULT 0,
        "total_completed_deals" integer DEFAULT 0,
        "last_active_at" timestamp,
        "founder_badge" boolean DEFAULT false,
        "founder_badge_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "users_email_unique" UNIQUE("email"),
        CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
        "id" serial PRIMARY KEY NOT NULL,
        "email" text NOT NULL,
        "name" text,
        "country" text,
        "city" text,
        "account_type" text,
        "business_name" text,
        "categories_of_interest" jsonb DEFAULT '[]'::jsonb,
        "source" text,
        "referral_code" varchar(16) NOT NULL,
        "referred_by_code" varchar(16),
        "referral_count" integer DEFAULT 0,
        "position" integer NOT NULL,
        "founder_badge_reserved" boolean DEFAULT true,
        "ip_address" text,
        "user_agent" text,
        "confirmed_at" timestamp,
        "converted_user_id" varchar(36),
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "waitlist_entries_email_unique" UNIQUE("email"),
        CONSTRAINT "waitlist_entries_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
        "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar(36) NOT NULL,
        "listing_id" varchar(36) NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banned_emails" ADD CONSTRAINT "banned_emails_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_milestones" ADD CONSTRAINT "deal_milestones_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_milestones" ADD CONSTRAINT "deal_milestones_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_seeker_listing_id_listings_id_fk" FOREIGN KEY ("seeker_listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_provider_listing_id_listings_id_fk" FOREIGN KEY ("provider_listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_party_a_id_users_id_fk" FOREIGN KEY ("party_a_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_party_b_id_users_id_fk" FOREIGN KEY ("party_b_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_decision_by_users_id_fk" FOREIGN KEY ("decision_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_escalated_by_users_id_fk" FOREIGN KEY ("escalated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_scans" ADD CONSTRAINT "image_scans_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD CONSTRAINT "listing_comments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD CONSTRAINT "listing_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_likes" ADD CONSTRAINT "listing_likes_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_likes" ADD CONSTRAINT "listing_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_deal_id_deals_id_fk" FOREIGN KEY ("related_deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_bookmarks" ADD CONSTRAINT "post_bookmarks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_bookmarks" ADD CONSTRAINT "post_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_inquiries" ADD CONSTRAINT "quick_inquiries_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_inquiries" ADD CONSTRAINT "quick_inquiries_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_inquiries" ADD CONSTRAINT "quick_inquiries_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_inquiries" ADD CONSTRAINT "quick_inquiries_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_users_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_deal_id_deals_id_fk" FOREIGN KEY ("referrer_deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_deal_id_deals_id_fk" FOREIGN KEY ("referred_deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_reengagement_events" ADD CONSTRAINT "sales_reengagement_events_lead_id_sales_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_reengagement_events" ADD CONSTRAINT "sales_reengagement_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_logs_admin_idx" ON "admin_audit_logs" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_agent_type_key_unique_idx" ON "agent_memory" USING btree ("agent_name","memory_type","key");--> statement-breakpoint
CREATE INDEX "agent_memory_agent_idx" ON "agent_memory" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "agent_memory_usage_idx" ON "agent_memory" USING btree ("usage_count");--> statement-breakpoint
CREATE INDEX "board_reports_month_idx" ON "board_reports" USING btree ("report_month");--> statement-breakpoint
CREATE INDEX "company_os_logs_created_at_idx" ON "company_os_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "consent_logs_user_id_idx" ON "consent_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consent_logs_anonymous_id_idx" ON "consent_logs" USING btree ("anonymous_id");--> statement-breakpoint
CREATE INDEX "consent_logs_created_at_idx" ON "consent_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "content_briefs_week_start_idx" ON "content_briefs" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "disputes_party_a_idx" ON "disputes" USING btree ("party_a_id");--> statement-breakpoint
CREATE INDEX "disputes_party_b_idx" ON "disputes" USING btree ("party_b_id");--> statement-breakpoint
CREATE INDEX "disputes_created_at_idx" ON "disputes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "failed_login_email_idx" ON "failed_login_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "failed_login_created_at_idx" ON "failed_login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "finance_snapshots_date_idx" ON "finance_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "kpi_snapshots_date_idx" ON "kpi_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "legal_documents_type_idx" ON "legal_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "legal_documents_created_at_idx" ON "legal_documents" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_documents_signature_token_a_idx" ON "legal_documents" USING btree ("signature_token_a");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_documents_signature_token_b_idx" ON "legal_documents" USING btree ("signature_token_b");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_page_versions_slug_language_version_unique" ON "legal_page_versions" USING btree ("slug","language","version");--> statement-breakpoint
CREATE INDEX "legal_page_versions_slug_language_idx" ON "legal_page_versions" USING btree ("slug","language");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_pages_slug_language_unique" ON "legal_pages" USING btree ("slug","language");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_likes_unique" ON "listing_likes" USING btree ("listing_id","user_id");--> statement-breakpoint
CREATE INDEX "marketing_posts_created_at_idx" ON "marketing_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "marketing_posts_status_idx" ON "marketing_posts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "proactive_alerts_type_day_unique_idx" ON "proactive_alerts" USING btree ("alert_type","day_key");--> statement-breakpoint
CREATE INDEX "proactive_alerts_created_at_idx" ON "proactive_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "proactive_alerts_ack_idx" ON "proactive_alerts" USING btree ("acknowledged_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_leads_user_id_unique_idx" ON "sales_leads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sales_leads_status_idx" ON "sales_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sales_leads_lead_score_idx" ON "sales_leads" USING btree ("lead_score");--> statement-breakpoint
CREATE INDEX "sales_leads_last_activity_idx" ON "sales_leads" USING btree ("last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_reengage_token_event_idx" ON "sales_reengagement_events" USING btree ("link_token","event_type");--> statement-breakpoint
CREATE INDEX "sales_reengage_user_created_idx" ON "sales_reengagement_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_reengage_event_created_idx" ON "sales_reengagement_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "users_didit_session_id_idx" ON "users" USING btree ("didit_session_id");--> statement-breakpoint
CREATE INDEX "waitlist_referral_code_idx" ON "waitlist_entries" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "waitlist_referred_by_idx" ON "waitlist_entries" USING btree ("referred_by_code");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_position_unique_idx" ON "waitlist_entries" USING btree ("position");