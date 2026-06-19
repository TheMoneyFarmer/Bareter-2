CREATE TABLE IF NOT EXISTS "mobile_tokens" (
  "id"           varchar(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      varchar(36)  NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash"   text         NOT NULL UNIQUE,
  "created_at"   timestamp    DEFAULT now(),
  "expires_at"   timestamp    NOT NULL,
  "last_used_at" timestamp,
  "device_info"  text
);

CREATE INDEX IF NOT EXISTS "mobile_tokens_user_id_idx" ON "mobile_tokens"("user_id");
