-- Store an encrypted recovery copy while retaining the one-way validation hash.
ALTER TABLE ai_access_tokens ADD COLUMN IF NOT EXISTS token_encrypted text;
CREATE UNIQUE INDEX IF NOT EXISTS ai_access_tokens_one_active_per_user_idx ON ai_access_tokens(user_id) WHERE revoked_at IS NULL;
