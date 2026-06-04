ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_google_id_idx" ON "users" USING btree ("google_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_apple_id_idx" ON "users" USING btree ("apple_id");--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_google_id_unique') THEN ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id"); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_apple_id_unique') THEN ALTER TABLE "users" ADD CONSTRAINT "users_apple_id_unique" UNIQUE("apple_id"); END IF; END $$;
