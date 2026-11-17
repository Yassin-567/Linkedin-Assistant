-- Phases 5 and 6: outreach history, safe manual sending, and acquisition analytics.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS outreach_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('linkedin','email','other')),
  activity_type text NOT NULL CHECK (activity_type IN ('draft','sent','replied','meeting','note')),
  message_type text NOT NULL DEFAULT 'other' CHECK (message_type IN ('connection_request','linkedin_follow_up','email_intro','email_follow_up','other')),
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
CREATE INDEX IF NOT EXISTS prospects_user_follow_up_idx
  ON prospects(user_id, follow_up);
