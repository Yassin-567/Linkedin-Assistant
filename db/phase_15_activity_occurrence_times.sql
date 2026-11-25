-- Phase 15: distinguish event occurrence time from record creation time.
-- Existing rows intentionally remain NULL: their actual event times are not reliably known.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS connected_at timestamptz;
ALTER TABLE outreach_activities ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

CREATE INDEX IF NOT EXISTS prospects_user_connected_at_idx
  ON prospects(user_id, connected_at DESC)
  WHERE connected_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS outreach_activities_user_occurred_idx
  ON outreach_activities(user_id, occurred_at DESC)
  WHERE occurred_at IS NOT NULL;

-- Remove literal placeholder strings from stored data. Empty means not provided;
-- we do not infer or manufacture a source/tool/category.
ALTER TABLE prospects ALTER COLUMN discovery_source SET DEFAULT '';
ALTER TABLE prospects ALTER COLUMN saved_via SET DEFAULT '';
ALTER TABLE prospects ALTER COLUMN research_tool SET DEFAULT '';
ALTER TABLE jobs ALTER COLUMN research_tool SET DEFAULT '';
ALTER TABLE jobs ALTER COLUMN employment_type SET DEFAULT '';

UPDATE prospects SET discovery_source = '' WHERE lower(discovery_source) = 'unknown';
UPDATE prospects SET saved_via = '' WHERE lower(saved_via) = 'unknown';
UPDATE prospects SET research_tool = '' WHERE lower(research_tool) = 'unknown';
UPDATE jobs SET research_tool = '' WHERE lower(research_tool) = 'unknown';
UPDATE jobs SET employment_type = '' WHERE lower(employment_type) = 'unknown';
