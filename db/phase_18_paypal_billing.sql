-- Phase 18: PayPal subscriptions (sandbox-first integration).
-- Apply to the intended isolated preview database before testing.
-- This migration creates PayPal-owned tables and does not alter Paddle tables.

CREATE TABLE IF NOT EXISTS paypal_subscriptions (
  paypal_subscription_id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'paypal' CHECK (provider = 'paypal'),
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  plan_id text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('approved', 'active', 'cancelled', 'suspended', 'expired')
  ),
  interval text NOT NULL CHECK (interval IN ('monthly', 'yearly')),
  current_period_ends_at timestamptz,
  last_payment_at timestamptz,
  payment_failed_at timestamptz,
  payment_failure_reason text,
  event_occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paypal_subscriptions_user_status_idx
  ON paypal_subscriptions(user_id, status, event_occurred_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS paypal_subscriptions_one_current_per_user_idx
  ON paypal_subscriptions(user_id)
  WHERE status IN ('approved', 'active');

CREATE TABLE IF NOT EXISTS paypal_webhook_events (
  paypal_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paypal_webhook_events_unprocessed_idx
  ON paypal_webhook_events(created_at)
  WHERE processed_at IS NULL;
