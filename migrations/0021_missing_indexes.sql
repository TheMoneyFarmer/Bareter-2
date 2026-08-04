-- Add missing indexes to tables with high-frequency queries but no indexes

-- ratings: queried by toUserId on every profile load
CREATE INDEX IF NOT EXISTS ratings_to_user_id_idx ON ratings(to_user_id);
CREATE INDEX IF NOT EXISTS ratings_from_user_id_idx ON ratings(from_user_id);

-- reports: admin moderation panel filters by status and targetId
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status);
CREATE INDEX IF NOT EXISTS reports_target_id_idx ON reports(target_id);
CREATE INDEX IF NOT EXISTS reports_reporter_id_idx ON reports(reporter_id);

-- search_query_history: queried by userId on every search
CREATE INDEX IF NOT EXISTS search_query_history_user_id_idx ON search_query_history(user_id);

-- image_scans: queried by listingId and flagged in moderation pipeline
CREATE INDEX IF NOT EXISTS image_scans_listing_id_idx ON image_scans(listing_id);
CREATE INDEX IF NOT EXISTS image_scans_flagged_idx ON image_scans(flagged);
