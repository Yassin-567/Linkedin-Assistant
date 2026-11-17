-- Phase 3: add per-user profile context and LinkedIn URL preferences safely.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS profile_summary text NOT NULL DEFAULT '';

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS linkedin_profile_url text NOT NULL DEFAULT '';

ALTER TABLE user_preferences
  ALTER COLUMN countries SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN industries SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN keywords SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN job_titles SET DEFAULT ARRAY[]::text[];
