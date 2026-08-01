-- Saved listing folders — lets users group saved/liked listings into named collections
CREATE TABLE IF NOT EXISTS saved_folders (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  emoji VARCHAR(10) DEFAULT '📁',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_folders_user_id_idx ON saved_folders(user_id);

-- Add optional folder reference to existing listing_likes table
ALTER TABLE listing_likes
  ADD COLUMN IF NOT EXISTS folder_id VARCHAR(36) REFERENCES saved_folders(id) ON DELETE SET NULL;
