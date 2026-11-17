CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  google_sub text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  picture text,
  profile_summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
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
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS linkedin_profile_url text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  company text NOT NULL,
  linkedin_url text NOT NULL,
  normalized_linkedin_url text NOT NULL,
  status text NOT NULL DEFAULT 'To research',
  follow_up text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  connected boolean NOT NULL DEFAULT false,
  connected_on text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospects_user_profile_unique UNIQUE (user_id, normalized_linkedin_url)
);
CREATE INDEX IF NOT EXISTS prospects_user_company_idx ON prospects(user_id, lower(company));
CREATE INDEX IF NOT EXISTS prospects_user_created_idx ON prospects(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS assistant_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  batches_remaining integer NOT NULL DEFAULT 1 CHECK (batches_remaining >= 0),
  max_leads integer NOT NULL DEFAULT 50 CHECK (max_leads BETWEEN 1 AND 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS assistant_tokens_user_idx ON assistant_tokens(user_id);
ALTER TABLE assistant_tokens ADD COLUMN IF NOT EXISTS read_used_at timestamptz;
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
CREATE INDEX IF NOT EXISTS ai_access_tokens_user_active_idx ON ai_access_tokens(user_id, created_at DESC) WHERE revoked_at IS NULL;
