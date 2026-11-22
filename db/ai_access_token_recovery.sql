-- Store an encrypted recovery copy while retaining the one-way validation hash.
ALTER TABLE ai_access_tokens ADD COLUMN IF NOT EXISTS token_encrypted text;
