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
  connection_target_count integer NOT NULL DEFAULT 50 CHECK (connection_target_count BETWEEN 1 AND 50),
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
  recommended_outreach text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  discovery_source text NOT NULL DEFAULT 'Unknown',
  saved_via text NOT NULL DEFAULT 'Unknown',
  research_tool text NOT NULL DEFAULT 'Unknown',
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
  revoked_at timestamptz,
  token_encrypted text
);
ALTER TABLE ai_access_tokens ADD COLUMN IF NOT EXISTS token_encrypted text;
CREATE INDEX IF NOT EXISTS ai_access_tokens_user_active_idx
  ON ai_access_tokens(user_id, created_at DESC)
  WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ai_access_tokens_one_active_per_user_idx
  ON ai_access_tokens(user_id)
  WHERE revoked_at IS NULL;

-- Short-lived AI sessions issued by the permanent-token prompt gateway.
CREATE TABLE IF NOT EXISTS assistant_session_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  workflow text NOT NULL CHECK (workflow IN ('connections','jobs','leads','record_update')),
  search_mode text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS assistant_session_tokens_user_expiry_idx
  ON assistant_session_tokens(user_id, expires_at DESC)
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


-- Job discovery and tracking (Phase 8)
CREATE TABLE IF NOT EXISTS job_search_preferences (
  user_id text PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  target_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  countries text[] NOT NULL DEFAULT ARRAY[]::text[],
  locations text[] NOT NULL DEFAULT ARRAY[]::text[],
  work_modes text[] NOT NULL DEFAULT ARRAY['remote','hybrid','on-site']::text[],
  employment_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  seniority_levels text[] NOT NULL DEFAULT ARRAY[]::text[],
  excluded_keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  salary_currency text NOT NULL DEFAULT '',
  minimum_salary numeric(14,2),
  language text NOT NULL DEFAULT 'English',
  include_linkedin boolean NOT NULL DEFAULT true,
  include_social_media boolean NOT NULL DEFAULT true,
  include_company_sites boolean NOT NULL DEFAULT true,
  include_job_boards boolean NOT NULL DEFAULT true,
  target_count integer NOT NULL DEFAULT 30 CHECK (target_count BETWEEN 1 AND 50),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  company text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  salary_text text NOT NULL DEFAULT '',
  salary_min numeric(14,2),
  salary_max numeric(14,2),
  salary_currency text NOT NULL DEFAULT '',
  workplace_type text NOT NULL DEFAULT 'unknown'
    CHECK (workplace_type IN ('remote','hybrid','on-site','unknown')),
  employment_type text NOT NULL DEFAULT 'unknown',
  location text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  seniority text NOT NULL DEFAULT '',
  posted_at timestamptz,
  posted_at_text text NOT NULL DEFAULT '',
  source_platform text NOT NULL DEFAULT 'Other',
  research_tool text NOT NULL DEFAULT 'Unknown',
  source_type text NOT NULL DEFAULT 'other',
  source_url text NOT NULL,
  normalized_source_url text NOT NULL,
  application_url text NOT NULL DEFAULT '',
  match_reason text NOT NULL DEFAULT '',
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'Saved'
    CHECK (status IN ('Saved','Applied','Interviewing','Offer','Rejected','Closed','Not interested')),
  notes text NOT NULL DEFAULT '',
  recommended_outreach text NOT NULL DEFAULT '',
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_user_source_unique UNIQUE (user_id, normalized_source_url)
);

CREATE INDEX IF NOT EXISTS jobs_user_created_idx ON jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_user_status_idx ON jobs(user_id, status);
CREATE INDEX IF NOT EXISTS jobs_user_company_idx ON jobs(user_id, lower(company));
CREATE INDEX IF NOT EXISTS jobs_user_posted_idx ON jobs(user_id, posted_at DESC);


-- Phase 13: admin account controls (see db/phase_13_admin_controls.sql).
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS account_status_changed_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS account_status_changed_by text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_users_account_status_check'
      AND conrelid = 'app_users'::regclass
  ) THEN
    ALTER TABLE app_users ADD CONSTRAINT app_users_account_status_check
      CHECK (account_status IN ('active', 'frozen', 'banned'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS app_users_account_status_created_idx
  ON app_users(account_status, created_at DESC);
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigserial PRIMARY KEY,
  admin_email text NOT NULL,
  target_user_id text NOT NULL REFERENCES app_users(id),
  action text NOT NULL CHECK (action IN ('freeze', 'unfreeze', 'ban', 'unban', 'logout')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_created_idx ON admin_audit_log(target_user_id, created_at DESC);
