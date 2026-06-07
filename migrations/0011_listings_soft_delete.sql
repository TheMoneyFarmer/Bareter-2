ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "deleted_by_user_id" varchar(36) REFERENCES "users"("id");
CREATE INDEX IF NOT EXISTS "listings_deleted_at_idx" ON "listings" ("deleted_at");
