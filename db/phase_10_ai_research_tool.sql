-- Phase 10: attribute each saved record to the AI research application.
-- Safe to run on existing databases; existing records remain labelled Unknown.

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS research_tool text NOT NULL DEFAULT 'Unknown';

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS research_tool text NOT NULL DEFAULT 'Unknown';

ALTER TABLE business_leads
  ADD COLUMN IF NOT EXISTS research_tool text NOT NULL DEFAULT 'Unknown';
