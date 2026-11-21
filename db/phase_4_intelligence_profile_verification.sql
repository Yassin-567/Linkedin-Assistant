-- Phase 4: verified per-user profile data and private lead intelligence reports.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS linkedin_profile_extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_profile_source text NOT NULL DEFAULT 'not_verified',
  ADD COLUMN IF NOT EXISTS linkedin_profile_verified_at timestamptz;


