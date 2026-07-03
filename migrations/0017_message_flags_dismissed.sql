ALTER TABLE message_flags
  ADD COLUMN IF NOT EXISTS dismissed_at timestamp,
  ADD COLUMN IF NOT EXISTS reviewed_by varchar(36) REFERENCES users(id);
