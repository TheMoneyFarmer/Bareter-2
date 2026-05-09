-- Task #248: Save user progress + completion reminders
-- Net-new schema only. Other tables/columns shown by `drizzle-kit
-- generate` against this baseline (broadcast_jobs, support_tickets,
-- support_messages, messages.warning, users.password_change_otp*) were
-- already applied via earlier migrations / db:push and must not be
-- re-created here.

CREATE TABLE IF NOT EXISTS "engagement_events" (
"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"user_id" varchar(36) NOT NULL,
"listing_id" varchar(36),
"event_type" text NOT NULL,
"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listing_drafts" (
"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"user_id" varchar(36) NOT NULL,
"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
"title" text,
"created_at" timestamp DEFAULT now(),
"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reminder_log" (
"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"user_id" varchar(36) NOT NULL,
"kind" text NOT NULL,
"target_id" varchar(36),
"sent_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verification_session_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reminder_preferences" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "unsubscribe_token" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engagement_events_user_idx" ON "engagement_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "engagement_events_listing_idx" ON "engagement_events" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_drafts_user_idx" ON "listing_drafts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminder_log_user_kind_idx" ON "reminder_log" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminder_log_user_kind_target_idx" ON "reminder_log" USING btree ("user_id","kind","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_unsubscribe_token_idx" ON "users" USING btree ("unsubscribe_token");
