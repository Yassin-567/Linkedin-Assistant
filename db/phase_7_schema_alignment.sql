-- Phase 7: align older installations with the current application schema.
-- Safe to re-run. This migration changes structure only and does not rewrite prospect data.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS linkedin_profile_extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_profile_source text NOT NULL DEFAULT 'not_verified',
  ADD COLUMN IF NOT EXISTS linkedin_profile_verified_at timestamptz;

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS discovery_source text NOT NULL DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS saved_via text NOT NULL DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT '';

-- LinkedIn URLs are optional for prospects entered manually or imported from other sources.
ALTER TABLE prospects
  ALTER COLUMN linkedin_url DROP NOT NULL,
  ALTER COLUMN normalized_linkedin_url DROP NOT NULL;

-- Replace the original full unique constraint with the current partial unique index.
ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_user_profile_unique;
CREATE UNIQUE INDEX IF NOT EXISTS prospects_user_profile_unique
  ON prospects(user_id, normalized_linkedin_url)
  WHERE normalized_linkedin_url IS NOT NULL AND normalized_linkedin_url <> '';

CREATE INDEX IF NOT EXISTS prospects_user_follow_up_idx
  ON prospects(user_id, follow_up);

ALTER TABLE assistant_tokens
  ADD COLUMN IF NOT EXISTS read_used_at timestamptz;

CREATE TABLE IF NOT EXISTS assistant_scoped_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('context', 'save')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS assistant_scoped_tokens_user_scope_idx
  ON assistant_scoped_tokens(user_id, scope, expires_at DESC)
  WHERE revoked_at IS NULL;

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

CREATE TABLE IF NOT EXISTS outreach_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('linkedin', 'email', 'other')),
  activity_type text NOT NULL CHECK (activity_type IN ('draft', 'sent', 'replied', 'meeting', 'note')),
  message_type text NOT NULL DEFAULT 'other'
    CHECK (message_type IN ('connection_request', 'linkedin_follow_up', 'email_intro', 'email_follow_up', 'other')),
  subject text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  follow_up_date date,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_activity_idempotency_unique UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS outreach_activities_user_created_idx
  ON outreach_activities(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outreach_activities_prospect_created_idx
  ON outreach_activities(user_id, prospect_id, created_at DESC);
