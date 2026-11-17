-- Phase 4: verified per-user profile data and private lead intelligence reports.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS linkedin_profile_extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_profile_source text NOT NULL DEFAULT 'not_verified',
  ADD COLUMN IF NOT EXISTS linkedin_profile_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS prospect_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  company text NOT NULL,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  researched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_intelligence_user_prospect_unique UNIQUE (user_id, prospect_id)
);
CREATE INDEX IF NOT EXISTS prospect_intelligence_user_researched_idx
  ON prospect_intelligence(user_id, researched_at DESC);
