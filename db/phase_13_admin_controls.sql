-- Phase 13: owner-only account management and account restrictions.
-- Run once on existing installations. Fresh installations should use db/schema.sql.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS account_status_changed_at timestamptz;
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS account_status_changed_by text;
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_users_account_status_check'
      AND conrelid = 'app_users'::regclass
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_account_status_check
      CHECK (account_status IN ('active', 'frozen', 'banned'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS app_users_account_status_created_idx
  ON app_users(account_status, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigserial PRIMARY KEY,
  admin_email text NOT NULL,
  target_user_id text NOT NULL REFERENCES app_users(id),
  action text NOT NULL CHECK (action IN ('freeze', 'unfreeze', 'ban', 'unban', 'logout')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_created_idx
  ON admin_audit_log(target_user_id, created_at DESC);
