-- Proposal expiry: auto-decline pending proposals after 48h
ALTER TABLE listing_comments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Listing bundles: additional own-listing IDs offered alongside the main item
ALTER TABLE listing_comments ADD COLUMN IF NOT EXISTS bundled_listing_ids JSONB DEFAULT '[]';

-- Back-fill expiresAt for existing pending proposals (48h from creation)
UPDATE listing_comments
SET expires_at = created_at + INTERVAL '48 hours'
WHERE status = 'pending' AND expires_at IS NULL;
