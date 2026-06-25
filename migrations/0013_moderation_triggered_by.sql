-- Add triggeredBy to moderation_logs so auto-AI actions can be
-- distinguished from manual admin overrides in the audit trail.
ALTER TABLE "moderation_logs" ADD COLUMN IF NOT EXISTS "triggered_by" text DEFAULT 'auto_ai';
