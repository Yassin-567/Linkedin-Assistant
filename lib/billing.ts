import { db } from "@/lib/db";
import { getPaddleAllowedPriceIds } from "@/lib/paddle-config";

export type BillingPlan = "free" | "pro";
export type BillingPlanSource =
  | "none"
  | "paddle_subscription"
  | "paypal_subscription"
  | "manual_grant";

export function isBillingEnforced(): boolean {
  return process.env.BILLING_ENFORCEMENT?.trim().toLowerCase() === "on";
}

export const BILLING_ENTITLEMENTS = {
  free: {
    prospects: 70, savedJobs: 30, commercialLeads: 0, leadProfiles: null,
    features: {
      basicActivityTracking: true, csvExport: true, fullOutreachHistory: false,
      advancedAnalytics: false, multipleLeadProfiles: false, aiResearchHandoff: false,
      aiRecordUpdates: false, advancedFiltering: false,
    },
  },
  pro: {
    prospects: null, savedJobs: null, commercialLeads: null, leadProfiles: null,
    features: {
      basicActivityTracking: true, csvExport: true, fullOutreachHistory: true,
      advancedAnalytics: true, multipleLeadProfiles: true, aiResearchHandoff: true,
      aiRecordUpdates: true, advancedFiltering: true,
    },
  },
} as const;

type BillingSubscription = {
  provider: "paddle" | "paypal";
  status: string;
  currentPeriodEndsAt?: string | null;
  scheduledChange?: unknown;
  priceId?: string;
  interval?: "monthly" | "yearly" | null;
  paymentFailedAt?: string | null;
};
type ManualGrant = { id: string; startsAt: string; endsAt: string; active: boolean };
type GrantRow = { id: string | number; startsAt: string; endsAt: string };

function isMissingManualGrantTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string };
  return value.code === "42P01" ||
    (typeof value.message === "string" && /relation ["']?manual_pro_grants["']? does not exist/i.test(value.message));
}

async function getActiveManualGrant(userId: string): Promise<ManualGrant | null> {
  try {
    const rows = await db()`
      SELECT id::text AS id, starts_at AS "startsAt", ends_at AS "endsAt"
      FROM manual_pro_grants
      WHERE user_id = ${userId}
        AND starts_at <= now() AND ends_at > now() AND revoked_at IS NULL
      ORDER BY ends_at DESC, created_at DESC
      LIMIT 1
    ` as unknown as GrantRow[];
    if (!rows.length) return null;
    return {
      id: String(rows[0].id),
      startsAt: new Date(rows[0].startsAt).toISOString(),
      endsAt: new Date(rows[0].endsAt).toISOString(),
      active: true,
    };
  } catch (error) {
    if (isMissingManualGrantTable(error)) return null;
    throw error;
  }
}

export async function getBillingState(userId: string) {
  const enforced = isBillingEnforced();
  const grant = await getActiveManualGrant(userId);
  if (!enforced) {
    const plan = grant ? "pro" as const : "free" as const;
    return {
      plan, enforced: false,
      planSource: grant ? "manual_grant" as const : "none" as const,
      grant, subscription: null,
      entitlements: plan === "pro" ? BILLING_ENTITLEMENTS.pro : BILLING_ENTITLEMENTS.free,
    };
  }

  // Keep Paddle and PayPal configuration independent. A missing Paddle
  // configuration must not prevent a verified PayPal subscription from
  // being recognized.
  let paddleAllowedIds: string[] = [];
  let paddleConfigurationError: unknown = null;
  try {
    paddleAllowedIds = [...getPaddleAllowedPriceIds()];
  } catch (error) {
    paddleConfigurationError = error;
  }

  const rows = await db()`
    WITH all_subscriptions AS (
      SELECT
        'paddle'::text AS provider,
        s.status,
        s.current_period_ends_at,
        s.scheduled_change,
        s.price_id AS plan_id,
        NULL::text AS interval,
        s.event_occurred_at,
        NULL::timestamptz AS payment_failed_at
      FROM paddle_subscriptions s
      WHERE s.user_id = ${userId}

      UNION ALL

      SELECT
        p.provider,
        p.status,
        p.current_period_ends_at,
        NULL::jsonb AS scheduled_change,
        p.plan_id,
        p.interval,
        p.event_occurred_at,
        p.payment_failed_at
      FROM paypal_subscriptions p
      WHERE p.user_id = ${userId}
        AND p.provider = 'paypal'
    ),
    eligible_subscriptions AS (
      SELECT *
      FROM all_subscriptions
      WHERE (
        provider = 'paddle'
        AND status IN ('active', 'trialing')
        AND plan_id = ANY(${paddleAllowedIds}::text[])
      ) OR (
        provider = 'paypal'
        AND (
          -- APPROVED means the buyer accepted; only ACTIVE grants Pro.
          status = 'active'
          OR (
            status = 'cancelled'
            AND current_period_ends_at IS NOT NULL
            AND current_period_ends_at > now()
          )
        )
      )
    )
    SELECT
      (SELECT count(*)::int FROM eligible_subscriptions) AS active_count,
      (SELECT provider FROM eligible_subscriptions
        ORDER BY event_occurred_at DESC LIMIT 1) AS active_provider,
      EXISTS (
        SELECT 1
        FROM paddle_subscriptions s
        WHERE s.user_id = ${userId}
          AND s.status IN ('active', 'trialing')
      ) AS has_active_paddle_records,
      COALESCE(
        (
          SELECT jsonb_build_object(
            'provider', provider,
            'status', status,
            'currentPeriodEndsAt', current_period_ends_at,
            'scheduledChange', scheduled_change,
            'priceId', plan_id,
            'interval', interval,
            'paymentFailedAt', payment_failed_at
          )
          FROM eligible_subscriptions
          ORDER BY event_occurred_at DESC
          LIMIT 1
        ),
        (
          SELECT jsonb_build_object(
            'provider', provider,
            'status', status,
            'currentPeriodEndsAt', current_period_ends_at,
            'scheduledChange', scheduled_change,
            'priceId', plan_id,
            'interval', interval,
            'paymentFailedAt', payment_failed_at
          )
          FROM all_subscriptions
          ORDER BY event_occurred_at DESC
          LIMIT 1
        )
      ) AS subscription
  ` as unknown as {
    active_count: number;
    active_provider: "paddle" | "paypal" | null;
    has_active_paddle_records: boolean;
    subscription: BillingSubscription | null;
  }[];

  const activeCount = Number(rows[0]?.active_count || 0);
  const hasActivePaddleRecords = Boolean(rows[0]?.has_active_paddle_records);
  const hasUnverifiedPaddleOverlap =
    Boolean(paddleConfigurationError) &&
    hasActivePaddleRecords &&
    activeCount > 0;

  // If Paddle has active records but its catalog is not configured, do not
  // silently ignore those records and grant a concurrent PayPal subscription.
  // When there are no active Paddle records, PayPal remains independent of
  // Paddle configuration and expired PayPal users can still fall back to Free.
  if (
    paddleConfigurationError &&
    hasActivePaddleRecords &&
    activeCount === 0 &&
    !grant
  ) {
    throw paddleConfigurationError;
  }

  const subscriptionConflict =
    activeCount > 1 || hasUnverifiedPaddleOverlap;
  const activeProvider =
    activeCount === 1 && !subscriptionConflict
      ? rows[0]?.active_provider
      : null;
  const planSource: BillingPlanSource =
    activeProvider === "paddle"
      ? "paddle_subscription"
      : activeProvider === "paypal"
        ? "paypal_subscription"
        : grant
          ? "manual_grant"
          : "none";
  const plan: BillingPlan = planSource === "none" ? "free" : "pro";

  return {
    plan,
    enforced: true,
    planSource,
    grant,
    subscription: rows[0]?.subscription || null,
    subscriptionConflict,
    entitlements: plan === "pro" ? BILLING_ENTITLEMENTS.pro : BILLING_ENTITLEMENTS.free,
  };
}

export async function isProUser(userId: string): Promise<boolean> {
  if (!isBillingEnforced()) return true;
  return (await getBillingState(userId)).plan === "pro";
}

export function proRequiredResponse() {
  return { error: "This feature is included with Inlinked Pro.", code: "PRO_REQUIRED", upgradeUrl: "/billing" };
}
