CREATE TABLE "collab_applications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" varchar(36) NOT NULL,
	"creator_id" varchar(36) NOT NULL,
	"brand_id" varchar(36) NOT NULL,
	"pitch" text NOT NULL,
	"social_handle" text,
	"follower_count" integer,
	"engagement_rate" numeric(5, 2),
	"portfolio_link" text,
	"status" text DEFAULT 'pending',
	"brand_note" text,
	"deal_id" varchar(36),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reviewer_id" varchar(36) NOT NULL,
	"reviewee_id" varchar(36) NOT NULL,
	"listing_comment_id" varchar(36),
	"listing_id" varchar(36),
	"rating" integer NOT NULL,
	"comment" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "search_query_history" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"query" text NOT NULL,
	"category" text,
	"result_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" varchar(36) NOT NULL,
	"blocked_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "signup_type" SET DEFAULT 'personal';--> statement-breakpoint
ALTER TABLE "deal_milestones" ADD COLUMN "milestone_type" text DEFAULT 'delivery';--> statement-breakpoint
ALTER TABLE "deal_milestones" ADD COLUMN "content_link" text;--> statement-breakpoint
ALTER TABLE "deal_milestones" ADD COLUMN "content_approved" boolean;--> statement-breakpoint
ALTER TABLE "deal_milestones" ADD COLUMN "content_approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "deal_milestones" ADD COLUMN "revision_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "offer_description" text;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "images" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "valuation_min_aed" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "valuation_max_aed" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "valuation_fair_aed" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "valuation_confidence" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "counter_offer_name" varchar(255);--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "counter_offer_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "counter_offer_description" text;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "counter_offer_images" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "counter_offer_status" text;--> statement-breakpoint
ALTER TABLE "listing_comments" ADD COLUMN "counter_offered_at" timestamp;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "valuation_min_aed" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "valuation_max_aed" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "valuation_fair_aed" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "valuation_confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "valuation_reasoning" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "valuation_market_note" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "valuation_currency" text DEFAULT 'AED';--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "valuation_at" timestamp;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "is_collab" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "collab_details" jsonb;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "is_bulk_deal" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "bulk_quantity" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "bulk_unit" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "bulk_min_order" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "bulk_max_partners" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "related_listing_id" varchar(36);--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "related_post_id" varchar(36);--> statement-breakpoint
ALTER TABLE "post_comments" ADD COLUMN "offer_description" text;--> statement-breakpoint
ALTER TABLE "post_comments" ADD COLUMN "images" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "creator_profile" jsonb;--> statement-breakpoint
ALTER TABLE "collab_applications" ADD CONSTRAINT "collab_applications_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_applications" ADD CONSTRAINT "collab_applications_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_applications" ADD CONSTRAINT "collab_applications_brand_id_users_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_applications" ADD CONSTRAINT "collab_applications_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewee_id_users_id_fk" FOREIGN KEY ("reviewee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_listing_comment_id_listing_comments_id_fk" FOREIGN KEY ("listing_comment_id") REFERENCES "public"."listing_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_query_history" ADD CONSTRAINT "search_query_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collab_apps_listing_idx" ON "collab_applications" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "collab_apps_creator_idx" ON "collab_applications" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "collab_apps_brand_idx" ON "collab_applications" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collab_apps_unique" ON "collab_applications" USING btree ("listing_id","creator_id");--> statement-breakpoint
CREATE INDEX "push_subs_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_subs_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "reviews_reviewee_idx" ON "reviews" USING btree ("reviewee_id");--> statement-breakpoint
CREATE INDEX "reviews_reviewer_idx" ON "reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "reviews_comment_idx" ON "reviews" USING btree ("listing_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_blocks_unique" ON "user_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocker_idx" ON "user_blocks" USING btree ("blocker_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_listing_id_listings_id_fk" FOREIGN KEY ("related_listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_post_id_posts_id_fk" FOREIGN KEY ("related_post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_milestones_deal_id_idx" ON "deal_milestones" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "deals_seeker_id_idx" ON "deals" USING btree ("seeker_id");--> statement-breakpoint
CREATE INDEX "deals_provider_id_idx" ON "deals" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "deals_state_idx" ON "deals" USING btree ("state");--> statement-breakpoint
CREATE INDEX "followers_follower_id_idx" ON "followers" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "followers_following_id_idx" ON "followers" USING btree ("following_id");--> statement-breakpoint
CREATE UNIQUE INDEX "followers_pair_unique" ON "followers" USING btree ("follower_id","following_id");--> statement-breakpoint
CREATE INDEX "listing_comments_listing_id_idx" ON "listing_comments" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_comments_user_id_idx" ON "listing_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listings_user_id_idx" ON "listings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listings_is_active_idx" ON "listings" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "listings_moderation_status_idx" ON "listings" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "listings_created_at_idx" ON "listings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "listings_is_collab_idx" ON "listings" USING btree ("is_collab");--> statement-breakpoint
CREATE INDEX "listings_is_bulk_idx" ON "listings" USING btree ("is_bulk_deal");--> statement-breakpoint
CREATE INDEX "messages_deal_id_idx" ON "messages" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "portfolio_items_user_id_idx" ON "portfolio_items" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_bookmarks_unique" ON "post_bookmarks" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "post_comments_post_id_idx" ON "post_comments" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_likes_unique" ON "post_likes" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "posts_user_id_idx" ON "posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "posts_is_active_is_story_idx" ON "posts" USING btree ("is_active","is_story");--> statement-breakpoint
CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "quick_inquiries_from_user_id_idx" ON "quick_inquiries" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "quick_inquiries_to_user_id_idx" ON "quick_inquiries" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "saved_searches_user_id_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wishlists_user_id_idx" ON "wishlists" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_user_listing_unique" ON "wishlists" USING btree ("user_id","listing_id");