CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_number" text NOT NULL UNIQUE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "subject" text NOT NULL,
  "category" text NOT NULL DEFAULT 'other',
  "priority" text NOT NULL DEFAULT 'normal',
  "status" text NOT NULL DEFAULT 'open',
  "assigned_to" varchar(36) REFERENCES "users"("id"),
  "resolved_at" timestamp,
  "closed_at" timestamp,
  "last_activity_at" timestamp DEFAULT now(),
  "ai_handled" boolean DEFAULT false,
  "escalated_at" timestamp,
  "internal_note" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" varchar(36) NOT NULL REFERENCES "support_tickets"("id"),
  "sender_id" varchar(36) REFERENCES "users"("id"),
  "sender_type" text NOT NULL DEFAULT 'user',
  "content" text NOT NULL,
  "is_internal" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "support_tickets_user_idx" ON "support_tickets"("user_id");
CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets"("status");
CREATE INDEX IF NOT EXISTS "support_tickets_created_at_idx" ON "support_tickets"("created_at");
CREATE INDEX IF NOT EXISTS "support_messages_ticket_idx" ON "support_messages"("ticket_id");
