-- Phase 8: independent job discovery preferences and saved job tracking.
-- Apply to the target Neon database before deploying a build that includes Jobs.

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
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_user_source_unique UNIQUE (user_id, normalized_source_url)
);

CREATE INDEX IF NOT EXISTS jobs_user_created_idx ON jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_user_status_idx ON jobs(user_id, status);
CREATE INDEX IF NOT EXISTS jobs_user_company_idx ON jobs(user_id, lower(company));
CREATE INDEX IF NOT EXISTS jobs_user_posted_idx ON jobs(user_id, posted_at DESC);
