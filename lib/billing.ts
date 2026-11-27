import { db } from "@/lib/db";
import { getPaddleAllowedPriceIds } from "@/lib/paddle-config";

export type BillingPlan = "free" | "pro";
export type BillingPlanSource = "none" | "paddle_subscription" | "manual_grant";

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
  status: string;
  currentPeriodEndsAt?: string | null;
  scheduledChange?: unknown;
  priceId?: string;
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

  let allowedIds: string[];
  try {
    allowedIds = [...getPaddleAllowedPriceIds()];
  } catch (error) {
    if (grant) {
      return {
        plan: "pro" as const, enforced: true, planSource: "manual_grant" as const,
        grant, subscription: null, entitlements: BILLING_ENTITLEMENTS.pro,
      };
    }
    throw error;
  }
  if (allowedIds.length !== 2) throw new Error("The configured Paddle price catalog is invalid.");

  const rows = await db()`
    SELECT
      EXISTS (
        SELECT 1 FROM paddle_subscriptions s
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
        ORDER BY s.event_occurred_at DESC LIMIT 1
      ) AS subscription
  ` as unknown as { is_pro: boolean; subscription: BillingSubscription | null }[];

  const paid = Boolean(rows[0]?.is_pro);
  const planSource: BillingPlanSource = paid ? "paddle_subscription" : grant ? "manual_grant" : "none";
  const plan: BillingPlan = planSource === "none" ? "free" : "pro";
  return {
    plan, enforced: true, planSource, grant,
    subscription: rows[0]?.subscription || null,
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
