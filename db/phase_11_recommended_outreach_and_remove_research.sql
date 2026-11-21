-- Phase 11: persist AI-generated outreach recommendations and remove retired in-app Intelligence reports.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS recommended_outreach text NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recommended_outreach text NOT NULL DEFAULT '';
ALTER TABLE business_leads ADD COLUMN IF NOT EXISTS recommended_outreach text NOT NULL DEFAULT '';

-- Only the obsolete report archive is removed. Saved records and outreach history remain.
DROP TABLE IF EXISTS prospect_intelligence;
