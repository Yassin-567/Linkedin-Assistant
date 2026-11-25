import { db } from "@/lib/db";
import { PADDLE_ALLOWED_PRICE_IDS } from "@/lib/paddle-config";

export type BillingPlan = "free" | "pro";

// null means the owner has not approved a limit yet. It must not be presented as "unlimited".
export const BILLING_ENTITLEMENTS = {
  free: {
    prospects: 100,
    savedJobs: null, // OWNER DECISION: set an approved Free saved-job limit.
    leadProfiles: null, // OWNER DECISION: set an approved Free lead-profile limit.
    features: {
      basicActivityTracking: true,
      csvExport: true,
      fullOutreachHistory: false,
      advancedAnalytics: false,
      multipleLeadProfiles: false,
      aiResearchHandoff: false,
      aiRecordUpdates: false,
      advancedFiltering: false
    }
  },
  pro: {
    prospects: null, // OWNER DECISION: do not market this as unlimited until approved.
    savedJobs: null, // OWNER DECISION: set an approved Pro saved-job limit.
    leadProfiles: null, // OWNER DECISION: set an approved Pro lead-profile limit.
    features: {
      basicActivityTracking: true,
      csvExport: true,
      fullOutreachHistory: true,
      advancedAnalytics: true,
      multipleLeadProfiles: true,
      aiResearchHandoff: true,
      aiRecordUpdates: true,
      advancedFiltering: true
    }
  }
} as const;

export async function getBillingState(userId: string) {
  const sql = db();
  const allowedIds = [...PADDLE_ALLOWED_PRICE_IDS];
  const rows: any = await sql`SELECT
    EXISTS (
      SELECT 1 FROM paddle_subscriptions s
      WHERE s.user_id = \${userId}
        AND s.status IN ('active','trialing')
        AND s.price_id = ANY(\${allowedIds}::text[])
    ) AS is_pro,
    (
      SELECT jsonb_build_object(
        'status', s.status,
        'currentPeriodEndsAt', s.current_period_ends_at,
        'scheduledChange', s.scheduled_change,
        'priceId', s.price_id
      )
      FROM paddle_subscriptions s
      WHERE s.user_id = \${userId}
      ORDER BY s.event_occurred_at DESC
      LIMIT 1
    ) AS subscription`;
  const isPro = Boolean(rows[0]?.is_pro);
  return {
    plan: (isPro ? "pro" : "free") as BillingPlan,
    subscription: rows[0]?.subscription || null,
    entitlements: isPro ? BILLING_ENTITLEMENTS.pro : BILLING_ENTITLEMENTS.free
  };
}

export async function isProUser(userId: string): Promise<boolean> {
  return (await getBillingState(userId)).plan === "pro";
}

export function proRequiredResponse() {
  return {
    error: "This feature is included with Inlinked Pro.",
    code: "PRO_REQUIRED",
    upgradeUrl: "/billing"
  };
}
