-- Make user_id nullable (guest tickets)
ALTER TABLE "support_tickets" ALTER COLUMN "user_id" DROP NOT NULL;

-- Add guest requester fields
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "requester_name" text;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "requester_email" text;
