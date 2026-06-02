ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "contract_content" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "contract_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "seeker_signed_at" timestamp;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "seeker_signed_initials" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "provider_signed_at" timestamp;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "provider_signed_initials" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_waitlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"feature" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feature_waitlist_email_feature_idx" ON "feature_waitlists" USING btree ("email","feature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_waitlist_feature_idx" ON "feature_waitlists" USING btree ("feature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_comments_listing_created_idx" ON "listing_comments" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_city_idx" ON "listings" USING btree ("city");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_phone_idx" ON "users" USING btree ("phone");