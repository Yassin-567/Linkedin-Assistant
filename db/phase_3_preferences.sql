-- Phase 3: store each user's LinkedIn profile URL and use neutral defaults for new accounts.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS linkedin_profile_url text NOT NULL DEFAULT '';

ALTER TABLE user_preferences
  ALTER COLUMN countries SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN industries SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN keywords SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN job_titles SET DEFAULT ARRAY[]::text[];
