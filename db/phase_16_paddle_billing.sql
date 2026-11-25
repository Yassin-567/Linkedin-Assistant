-- Phase 16: Paddle Billing sandbox integration.
-- Apply only to an isolated development/preview database, never to production before go-live.

CREATE TABLE IF NOT EXISTS paddle_customers (
  paddle_customer_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paddle_customers_user_idx ON paddle_customers(user_id);

CREATE TABLE IF NOT EXISTS paddle_checkout_transactions (
  paddle_transaction_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  paddle_customer_id text,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS paddle_checkout_transactions_user_created_idx
  ON paddle_checkout_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS paddle_checkout_transactions_customer_idx
  ON paddle_checkout_transactions(paddle_customer_id);

CREATE TABLE IF NOT EXISTS paddle_subscriptions (
  paddle_subscription_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  paddle_customer_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','trialing','past_due','paused','canceled')),
  price_id text NOT NULL DEFAULT '',
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  scheduled_change jsonb,
  event_occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paddle_subscriptions_user_status_idx
  ON paddle_subscriptions(user_id, status, event_occurred_at DESC);
CREATE INDEX IF NOT EXISTS paddle_subscriptions_customer_idx
  ON paddle_subscriptions(paddle_customer_id);

CREATE TABLE IF NOT EXISTS paddle_webhook_events (
  paddle_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paddle_webhook_events_unprocessed_idx
  ON paddle_webhook_events(created_at)
  WHERE processed_at IS NULL;
