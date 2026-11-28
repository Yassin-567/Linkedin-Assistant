import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { getBillingState, isBillingEnforced } from "@/lib/billing";
import {
  getPayPalEnvironment,
  getPayPalPublicConfig,
  paypalApiRequest,
  PayPalConfigurationError,
} from "@/lib/paypal-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayPalCreateSubscriptionResponse = {
  id?: string;
  status?: string;
  plan_id?: string;
  links?: Array<{
    href?: string;
    rel?: string;
    method?: string;
  }>;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function isAllowedApprovalUrl(value: string, environment: "sandbox" | "live") {
  try {
    const url = new URL(value);
    const allowedHosts =
      environment === "sandbox"
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

export async function POST(request: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return errorResponse("Sign in required.", 401);
  }

  if (!isBillingEnforced()) {
    return errorResponse("Paid checkout is currently unavailable.", 403);
  }

  const body = (await request.json().catch(() => null)) as
    | { interval?: unknown }
    | null;
  const interval = body?.interval;

  if (interval !== "monthly" && interval !== "yearly") {
    return errorResponse("Choose a valid billing interval.", 400);
  }

  try {
    const billing = await getBillingState(user.userId);
    if (billing.plan === "pro") {
      return errorResponse("Your account already has Pro access.", 409);
    }

    const sql = db();
    const existingRows = await sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM paddle_subscriptions
          WHERE user_id = ${user.userId}
            AND status IN ('active', 'trialing')
        ) AS has_active_paddle,
        EXISTS (
          SELECT 1
          FROM paypal_subscriptions
          WHERE user_id = ${user.userId}
            AND provider = 'paypal'
            AND (
              status IN ('active', 'approved')
              OR (
                status = 'cancelled'
                AND current_period_ends_at IS NOT NULL
                AND current_period_ends_at > now()
              )
            )
        ) AS has_current_paypal
    ` as unknown as {
      has_active_paddle: boolean;
      has_current_paypal: boolean;
    }[];

    if (
      existingRows[0]?.has_active_paddle ||
      existingRows[0]?.has_current_paypal
    ) {
      return errorResponse(
        "This account already has a current subscription. Manage that subscription instead of starting another one.",
        409,
      );
    }

    const config = getPayPalPublicConfig();
    const environment = getPayPalEnvironment();
    const planId =
      interval === "monthly"
        ? config.monthlyPlanId
        : config.yearlyPlanId;

    const origin = request.nextUrl.origin;
    const returnUrl = new URL(
      "/billing/paypal-redirect/return",
      origin,
    ).toString();
    const cancelUrl = new URL(
      "/billing/paypal-redirect?status=cancelled",
      origin,
    ).toString();

    const created =
      await paypalApiRequest<PayPalCreateSubscriptionResponse>(
        "/v1/billing/subscriptions",
        {
          method: "POST",
          prefer: "return=representation",
          body: {
            plan_id: planId,
            custom_id: user.userId,
            application_context: {
              brand_name: "Inlinked",
              locale: "en-US",
              shipping_preference: "NO_SHIPPING",
              user_action: "SUBSCRIBE_NOW",
              return_url: returnUrl,
              cancel_url: cancelUrl,
            },
          },
        },
      );

    const subscriptionId = String(created.id || "");
    const status = String(created.status || "").toUpperCase();
    const approvalUrl = String(
      created.links?.find((link) => link.rel === "approve")?.href || "",
    );

    if (
      !/^I-[A-Z0-9]+$/.test(subscriptionId) ||
      status !== "APPROVAL_PENDING" ||
      String(created.plan_id || "") !== planId ||
      !isAllowedApprovalUrl(approvalUrl, environment)
    ) {
      console.error(
        "PayPal redirect checkout returned an unexpected subscription response.",
      );
      return errorResponse(
        "PayPal did not return a valid approval link. No checkout redirect was started.",
        502,
      );
    }

    return NextResponse.json(
      { approvalUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PayPalConfigurationError) {
      return errorResponse(
        "PayPal checkout is not configured for this deployment yet.",
        503,
      );
    }

    console.error(
      "PayPal redirect checkout preparation failed.",
      error instanceof Error ? error.message : "Unknown error.",
    );
    return errorResponse(
      "Could not prepare PayPal checkout. Please try again later.",
      503,
    );
  }
}
