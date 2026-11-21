-- Phase 9: independent commercial lead discovery and management.
-- Existing prospects and imported LinkedIn connections are intentionally untouched.

CREATE TABLE IF NOT EXISTS lead_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_profiles_user_created_idx
  ON lead_profiles(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS lead_profiles_one_active_per_user
  ON lead_profiles(user_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS business_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES lead_profiles(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  contact_role text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  profile_url text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  opportunity_summary text NOT NULL DEFAULT '',
  service_requested text NOT NULL DEFAULT '',
  discovery_engine text NOT NULL DEFAULT 'manual'
    CHECK (discovery_engine IN ('direct_demand','opportunity_signal','ideal_customer','manual')),
  buying_intent text NOT NULL DEFAULT 'Potential opportunity',
  confidence text NOT NULL DEFAULT 'Unreviewed',
  project_type text NOT NULL DEFAULT 'unknown',
  budget_text text NOT NULL DEFAULT '',
  estimated_value_min numeric(14,2),
  estimated_value_max numeric(14,2),
  value_currency text NOT NULL DEFAULT '',
  source_platform text NOT NULL DEFAULT 'Manual',
  research_tool text NOT NULL DEFAULT 'Unknown',
  source_type text NOT NULL DEFAULT 'manual',
  source_url text NOT NULL DEFAULT '',
  normalized_source_url text NOT NULL DEFAULT '',
  published_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'New'
    CHECK (status IN ('New','Qualified','Contacted','In discussion','Proposal','Won','Lost','Not relevant')),
  notes text NOT NULL DEFAULT '',
  recommended_outreach text NOT NULL DEFAULT '',
  next_follow_up date,
  won_value numeric(14,2),
  won_currency text NOT NULL DEFAULT '',
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_leads_user_profile_source_unique
  ON business_leads(user_id, profile_id, normalized_source_url)
  WHERE normalized_source_url <> '';
CREATE INDEX IF NOT EXISTS business_leads_user_created_idx
  ON business_leads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS business_leads_user_profile_idx
  ON business_leads(user_id, profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS business_leads_user_status_idx
  ON business_leads(user_id, status);
CREATE INDEX IF NOT EXISTS business_leads_user_company_idx
  ON business_leads(user_id, lower(company));
CREATE INDEX IF NOT EXISTS business_leads_user_follow_up_idx
  ON business_leads(user_id, next_follow_up);

CREATE TABLE IF NOT EXISTS lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES business_leads(id) ON DELETE CASCADE,
  activity_type text NOT NULL DEFAULT 'note'
    CHECK (activity_type IN ('note','contacted','reply','meeting','proposal','won','lost','follow_up')),
  notes text NOT NULL DEFAULT '',
  follow_up_date date,
  deal_value numeric(14,2),
  deal_currency text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_activities_user_lead_created_idx
  ON lead_activities(user_id, lead_id, created_at DESC);
