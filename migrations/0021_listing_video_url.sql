-- Listing video clip.
--
-- The create-listing form has offered a "Short video clip" field (and a
-- creator "Demo Reel") for some time, and the client has been POSTing a
-- `videoUrl` with the listing. The listings table had no matching column, so
-- insertListingSchema (built from the table) silently stripped the key and the
-- uploaded video was discarded — the upload succeeded, the video vanished.
--
-- Additive and idempotent: nullable, no default, no backfill needed.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS video_url text;
