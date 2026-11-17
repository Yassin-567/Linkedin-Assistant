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
