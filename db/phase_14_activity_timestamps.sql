-- Phase 14: explicit timestamps for LinkedIn connection requests and job applications.
-- Safe additive migration; existing records remain NULL when the actual event time is unknown.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS connection_sent_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS applied_at timestamptz;

CREATE INDEX IF NOT EXISTS prospects_user_connection_sent_idx
  ON prospects(user_id, connection_sent_at DESC)
  WHERE connection_sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_user_applied_idx
  ON jobs(user_id, applied_at DESC)
  WHERE applied_at IS NOT NULL;
