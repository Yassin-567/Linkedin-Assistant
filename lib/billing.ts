import { db } from "@/lib/db";
import { getPaddleAllowedPriceIds } from "@/lib/paddle-config";

export type BillingPlan = "free" | "pro";

// null means the owner has not approved a limit yet.
// It must not be presented as "unlimited".
export const BILLING_ENTITLEMENTS = {
  free: {
    prospects: 100,
    savedJobs: null,
    leadProfiles: null,
    features: {
      basicActivityTracking: true,
      csvExport: true,
      fullOutreachHistory: false,
      advancedAnalytics: false,
      multipleLeadProfiles: false,
      aiResearchHandoff: false,
      aiRecordUpdates: false,
      advancedFiltering: false,
    },
  },

  pro: {
    prospects: null,
    savedJobs: null,
    leadProfiles: null,
    features: {
      basicActivityTracking: true,
      csvExport: true,
      fullOutreachHistory: true,
      advancedAnalytics: true,
      multipleLeadProfiles: true,
      aiResearchHandoff: true,
      aiRecordUpdates: true,
      advancedFiltering: true,
    },
  },
} as const;

type BillingSubscription = {
  status: string;
  currentPeriodEndsAt?: string | null;
  scheduledChange?: unknown;
  priceId?: string;
};

type BillingQueryRow = {
  is_pro: boolean;
  subscription: BillingSubscription | null;
};

export async function getBillingState(userId: string) {
  const sql = db();

  // Throws a PaddleConfigurationError if the server environment,
  // API key or selected environment's price IDs are invalid.
  const allowedIds = [
    ...getPaddleAllowedPriceIds(),
  ];

  if (allowedIds.length !== 2) {
    throw new Error(
      "The configured Paddle price catalog is invalid.",
    );
  }

  const rows = (await sql`
    SELECT
      EXISTS (
        SELECT 1
        FROM paddle_subscriptions s
        WHERE s.user_id = ${userId}
          AND s.status IN ('active', 'trialing')
          AND s.price_id = ANY(${allowedIds}::text[])
      ) AS is_pro,

      (
        SELECT jsonb_build_object(
          'status', s.status,
          'currentPeriodEndsAt', s.current_period_ends_at,
          'scheduledChange', s.scheduled_change,
          'priceId', s.price_id
        )
        FROM paddle_subscriptions s
        WHERE s.user_id = ${userId}
        ORDER BY s.event_occurred_at DESC
        LIMIT 1
      ) AS subscription
  `) as unknown as BillingQueryRow[];

  const isPro = Boolean(rows[0]?.is_pro);

  return {
    plan: (isPro ? "pro" : "free") as BillingPlan,
    subscription: rows[0]?.subscription || null,
    entitlements: isPro
      ? BILLING_ENTITLEMENTS.pro
      : BILLING_ENTITLEMENTS.free,
  };
}

export async function isProUser(
  userId: string,
): Promise<boolean> {
  return (await getBillingState(userId)).plan === "pro";
}

export function proRequiredResponse() {
  return {
    error: "This feature is included with Inlinked Pro.",
    code: "PRO_REQUIRED",
    upgradeUrl: "/billing",
  };
}
