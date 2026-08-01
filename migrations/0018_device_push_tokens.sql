CREATE TABLE IF NOT EXISTS "device_push_tokens" (
  "id"         varchar(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"    varchar(36)  NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token"      text         NOT NULL UNIQUE,
  "platform"   text         NOT NULL,
  "created_at" timestamp    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dpt_user_id_idx" ON "device_push_tokens"("user_id");
