-- Canonical schema for the current Inlinked application.
-- Fresh installations should run this file once.
-- Existing installations should use the ordered migrations in README.md.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  google_sub text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  picture text,
  profile_summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  linkedin_profile_extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  linkedin_profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  linkedin_profile_source text NOT NULL DEFAULT 'not_verified',
  linkedin_profile_verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id text PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  countries text[] NOT NULL DEFAULT ARRAY[]::text[],
  industries text[] NOT NULL DEFAULT ARRAY[]::text[],
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  job_titles text[] NOT NULL DEFAULT ARRAY[]::text[],
  excluded_keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  language text NOT NULL DEFAULT 'English',
  linkedin_profile_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  company text NOT NULL,
  linkedin_url text,
  normalized_linkedin_url text,
  status text NOT NULL DEFAULT 'To research',
  follow_up text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  connected boolean NOT NULL DEFAULT false,
  connected_on text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  discovery_source text NOT NULL DEFAULT 'Unknown',
  saved_via text NOT NULL DEFAULT 'Unknown',
  industry text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS prospects_user_company_idx
  ON prospects(user_id, lower(company));
CREATE INDEX IF NOT EXISTS prospects_user_created_idx
  ON prospects(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prospects_user_follow_up_idx
  ON prospects(user_id, follow_up);
CREATE UNIQUE INDEX IF NOT EXISTS prospects_user_profile_unique
  ON prospects(user_id, normalized_linkedin_url)
  WHERE normalized_linkedin_url IS NOT NULL AND normalized_linkedin_url <> '';

-- Retained for compatibility with the original short-lived assistant token flow.
CREATE TABLE IF NOT EXISTS assistant_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  batches_remaining integer NOT NULL DEFAULT 1 CHECK (batches_remaining >= 0),
  max_leads integer NOT NULL DEFAULT 50 CHECK (max_leads BETWEEN 1 AND 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  read_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS assistant_tokens_user_idx ON assistant_tokens(user_id);

CREATE TABLE IF NOT EXISTS linkedin_connections (
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  normalized_linkedin_url text NOT NULL,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  connected_on text NOT NULL DEFAULT '',
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, normalized_linkedin_url)
);
CREATE INDEX IF NOT EXISTS linkedin_connections_user_idx ON linkedin_connections(user_id);

CREATE TABLE IF NOT EXISTS ai_access_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_access_tokens_user_active_idx
  ON ai_access_tokens(user_id, created_at DESC)
  WHERE revoked_at IS NULL;

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
