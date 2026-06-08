ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verified" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verification_code" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verification_expires" timestamp;
