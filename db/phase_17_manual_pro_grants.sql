-- Phase 17: owner-managed, time-limited manual Pro grants.
-- The production migration was applied on 2026-11-27.
-- Existing installations: do not rerun this as part of application deployment.

BEGIN;

CREATE TABLE IF NOT EXISTS manual_pro_grants (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    granted_by_email TEXT NOT NULL,
    revoked_by_email TEXT,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT manual_pro_grants_valid_period_check
        CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS manual_pro_grants_active_user_idx
    ON manual_pro_grants(user_id, ends_at DESC)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS manual_pro_grants_user_created_idx
    ON manual_pro_grants(user_id, created_at DESC);

ALTER TABLE admin_audit_log
    DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE admin_audit_log
    ADD CONSTRAINT admin_audit_log_action_check
    CHECK (
        action IN (
            'freeze',
            'unfreeze',
            'ban',
            'unban',
            'logout',
            'grant_pro',
            'revoke_pro_grant'
        )
    );

COMMIT;
