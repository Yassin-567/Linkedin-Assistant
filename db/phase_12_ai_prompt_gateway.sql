-- Phase 12: permanent-token prompt gateway and short-lived AI sessions.
-- The permanent ai_access_tokens credential is used only by /api/assistant-prompt.
-- All other AI endpoints authenticate through this 15-minute session table.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS connection_target_count integer NOT NULL DEFAULT 50
  CHECK (connection_target_count BETWEEN 1 AND 50);

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
