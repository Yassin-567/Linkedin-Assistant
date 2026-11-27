import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { isBillingEnforced } from "@/lib/billing";
import {
  getPayPalEnvironment,
  getPayPalPublicConfig,
  paypalApiRequest,
  PayPalConfigurationError,
} from "@/lib/paypal-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayPalSubscription = {
  id?: string;
  status?: string;
  plan_id?: string;
  custom_id?: string;
  billing_info?: { next_billing_time?: string };
};

type PayPalPlan = {
  id?: string;
  product_id?: string;
  status?: string;
  billing_cycles?: Array<{
    tenure_type?: string;
    frequency?: { interval_unit?: string; interval_count?: number };
    pricing_scheme?: {
      fixed_price?: { value?: string; currency_code?: string };
    };
  }>;
};

type PayPalRevision = {
  id?: string;
  plan_id?: string;
  links?: Array<{ href?: string; rel?: string; method?: string }>;
};

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function sameBillingInstant(first: string | null, second: string | null) {
  if (!first || !second) return false;
  return Math.abs(Date.parse(first) - Date.parse(second)) <= 60_000;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function isAllowedApprovalUrl(value: string, environment: "sandbox" | "live") {
  try {
    const url = new URL(value);
    const allowedHosts = environment === "sandbox"
      ? ["www.sandbox.paypal.com"]
      : ["www.paypal.com"];
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      allowedHosts.includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function hasExpectedRegularPrice(
  plan: PayPalPlan,
  interval: "monthly" | "yearly",
  amount: string,
): boolean {
  return (plan.billing_cycles || [])
    .filter((cycle) => String(cycle.tenure_type || "").toUpperCase() === "REGULAR")
    .some((cycle) => {
      const unit = String(cycle.frequency?.interval_unit || "").toUpperCase();
      const count = Number(cycle.frequency?.interval_count || 0);
      const value = String(cycle.pricing_scheme?.fixed_price?.value || "");
      const currency = String(
        cycle.pricing_scheme?.fixed_price?.currency_code || "",
      ).toUpperCase();

      return (
        unit === (interval === "monthly" ? "MONTH" : "YEAR") &&
        count === 1 &&
        Number(value).toFixed(2) === amount &&
        currency === "USD"
      );
    });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return errorResponse("Sign in required.", 401);
  if (!isBillingEnforced()) {
    return errorResponse("Paid checkout is currently unavailable.", 403);
  }

  try {
    const config = getPayPalPublicConfig();
    const environment = getPayPalEnvironment();
    const sql = db();

    const subscriptions = await sql`
      SELECT
        paypal_subscription_id,
        user_id,
        plan_id,
        status,
        interval,
        current_period_ends_at
      FROM paypal_subscriptions
      WHERE provider = 'paypal'
        AND user_id = ${user.userId}
        AND status = 'active'
      ORDER BY event_occurred_at DESC
      LIMIT 2
    ` as unknown as Array<{
      paypal_subscription_id: string;
      user_id: string;
      plan_id: string;
      status: string;
      interval: string;
      current_period_ends_at: string | null;
    }>;

    if (subscriptions.length !== 1) {
      return errorResponse(
        "A single active PayPal subscription is required to switch plans.",
        409,
      );
    }

    const current = subscriptions[0];
    if (
      current.interval !== "monthly" ||
      current.plan_id !== config.monthlyPlanId
    ) {
      return errorResponse(
        "Only an active Monthly PayPal subscription can be switched to Yearly.",
        409,
      );
    }

    const paddleRows = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM paddle_subscriptions
        WHERE user_id = ${user.userId}
          AND status IN ('active', 'trialing')
      ) AS has_active_paddle
    ` as unknown as { has_active_paddle: boolean }[];

    if (paddleRows[0]?.has_active_paddle) {
      return errorResponse(
        "This account has another active subscription. Resolve that subscription before switching plans.",
        409,
      );
    }

    const remote = await paypalApiRequest<PayPalSubscription>(
      `/v1/billing/subscriptions/${encodeURIComponent(current.paypal_subscription_id)}`,
      { method: "GET" },
    );

    const remoteNextBilling = validDate(remote.billing_info?.next_billing_time);
    const savedNextBilling = validDate(current.current_period_ends_at);

    if (
      remote.id !== current.paypal_subscription_id ||
      String(remote.status || "").toUpperCase() !== "ACTIVE" ||
      remote.plan_id !== config.monthlyPlanId ||
      String(remote.custom_id || "") !== user.userId ||
      !sameBillingInstant(remoteNextBilling, savedNextBilling)
    ) {
      return errorResponse(
        "The PayPal subscription no longer matches Inlinked's verified Monthly record. Refresh billing status before retrying.",
        409,
      );
    }

    const [monthlyPlan, yearlyPlan] = await Promise.all([
      paypalApiRequest<PayPalPlan>(
        `/v1/billing/plans/${encodeURIComponent(config.monthlyPlanId)}`,
        { method: "GET" },
      ),
      paypalApiRequest<PayPalPlan>(
        `/v1/billing/plans/${encodeURIComponent(config.yearlyPlanId)}`,
        { method: "GET" },
      ),
    ]);

    if (
      monthlyPlan.id !== config.monthlyPlanId ||
      yearlyPlan.id !== config.yearlyPlanId ||
      String(monthlyPlan.status || "").toUpperCase() !== "ACTIVE" ||
      String(yearlyPlan.status || "").toUpperCase() !== "ACTIVE" ||
      !monthlyPlan.product_id ||
      monthlyPlan.product_id !== yearlyPlan.product_id ||
      !hasExpectedRegularPrice(monthlyPlan, "monthly", "8.00") ||
      !hasExpectedRegularPrice(yearlyPlan, "yearly", "79.00")
    ) {
      return errorResponse(
        "The configured PayPal plans are not the expected active Monthly and Yearly plans for the same product.",
        409,
      );
    }

    const returnUrl = new URL(
      "/billing/paypal-revise/return",
      request.nextUrl.origin,
    ).toString();
    const cancelUrl = new URL(
      "/billing?paypal_revise=cancelled",
      request.nextUrl.origin,
    ).toString();

    const revised = await paypalApiRequest<PayPalRevision>(
      `/v1/billing/subscriptions/${encodeURIComponent(current.paypal_subscription_id)}/revise`,
      {
        method: "POST",
        body: {
          plan_id: config.yearlyPlanId,
          application_context: {
            brand_name: "Inlinked",
            locale: "en-US",
            user_action: "SUBSCRIBE_NOW",
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    );

    const approvalUrl = String(
      revised.links?.find((link) => link.rel === "approve")?.href || "",
    );

    if (
      (revised.id && revised.id !== current.paypal_subscription_id) ||
      (revised.plan_id && revised.plan_id !== config.yearlyPlanId) ||
      !isAllowedApprovalUrl(approvalUrl, environment)
    ) {
      console.error("PayPal subscription revise did not return a valid approval link.");
      return errorResponse(
        "PayPal did not return a valid re-consent link. The existing Monthly subscription remains unchanged in Inlinked.",
        502,
      );
    }

    // The signed BILLING.SUBSCRIPTION.UPDATED webhook performs the
    // database update only after PayPal confirms the approved Yearly plan.
    return NextResponse.json(
      {
        approvalUrl,
        requiresReconsent: true,
        currentPeriodEndsAt: savedNextBilling,
        newInterval: "yearly",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PayPalConfigurationError) {
      return errorResponse(
        "PayPal billing is not configured for this deployment.",
        503,
      );
    }
    console.error(
      "PayPal subscription revision failed.",
      error instanceof Error ? error.message : "Unknown error.",
    );
    return errorResponse(
      "Could not prepare the PayPal plan change. Your current subscription remains unchanged.",
      503,
    );
  }
}
