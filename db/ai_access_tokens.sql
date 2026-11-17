CREATE TABLE IF NOT EXISTS ai_access_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_access_tokens_user_active_idx
  ON ai_access_tokens(user_id, created_at DESC)
  WHERE revoked_at IS NULL;
