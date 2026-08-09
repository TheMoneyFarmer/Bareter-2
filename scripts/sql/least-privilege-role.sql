-- Least-privilege application database role.
--
-- WHY THIS AND NOT ROW-LEVEL SECURITY
--
-- The app connects as `neondb_owner`, which OWNS all 80 tables. Postgres table
-- owners bypass RLS unless every table is switched to FORCE ROW LEVEL SECURITY,
-- so simply enabling RLS today would change nothing at all.
--
-- Making RLS real also needs per-user context on every query
-- (`SET LOCAL app.current_user_id`), and that is only safe inside a transaction.
-- This codebase issues ~374 queries outside transactions over a connection
-- POOL — setting the context per connection would leak one user's identity into
-- the next request that reuses that connection, which is a worse bug than the
-- one RLS is meant to prevent. Retrofitting it means wrapping the entire data
-- layer in transactions, which also raises Neon compute time.
--
-- What actually contains a SQL-injection or a logic bug here is removing the
-- app's ability to do damage in the first place. Authorization is already
-- enforced in queries and covered by tests; what is missing is that the runtime
-- role can DROP, TRUNCATE or ALTER anything it likes.
--
-- After this, the application role can read and write rows, and nothing else:
-- no DROP, no TRUNCATE, no ALTER, no CREATE. Schema migrations continue to use
-- the owner credentials, which stay out of the running app.
--
-- SAFETY
--   * Additive only — creates a new role, changes no existing data or schema.
--   * The app keeps working on the owner URL until DATABASE_URL is switched.
--   * Reversible: DROP OWNED BY bareter_app; DROP ROLE bareter_app;
--
-- Run as the owner (neondb_owner). Replace the password before running.

BEGIN;

-- 1. The role. LOGIN only; no CREATEDB, no CREATEROLE, no BYPASSRLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bareter_app') THEN
    CREATE ROLE bareter_app LOGIN PASSWORD 'REPLACE_ME';
  END IF;
END
$$;

-- 2. Reach the schema, but not modify it.
GRANT USAGE ON SCHEMA public TO bareter_app;
REVOKE CREATE ON SCHEMA public FROM bareter_app;

-- 3. Row-level DML on existing tables. Deliberately NOT: TRUNCATE, REFERENCES,
--    TRIGGER — TRUNCATE in particular is the one-statement way to lose a table's
--    contents, and the app has no legitimate need for it.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bareter_app;

-- 4. Sequences, so INSERT can allocate ids.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bareter_app;

-- 5. Same grants for tables created later by migrations, so a new table is not
--    silently unreadable by the app after the next deploy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bareter_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bareter_app;

COMMIT;

-- Verify (expect: rolsuper=f, rolcreatedb=f, rolcreaterole=f, rolbypassrls=f)
-- SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
--   FROM pg_roles WHERE rolname = 'bareter_app';
