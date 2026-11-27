import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { isBillingEnforced } from "@/lib/billing";
import {
  getPayPalPublicConfig,
  paypalApiRequest,
} from "@/lib/paypal-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayPalSubscription = {
  id?: string;
  status?: string;
  plan_id?: string;
  custom_id?: string;
  billing_info?: {
    next_billing_time?: string;
  };
};

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!isBillingEnforced()) {
    return NextResponse.json(
      { error: "Paid checkout is currently unavailable." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { subscriptionID?: unknown }
    | null;
  const subscriptionId =
    typeof body?.subscriptionID === "string"
      ? body.subscriptionID.trim()
      : "";

  if (!/^I-[A-Z0-9]+$/.test(subscriptionId)) {
    return NextResponse.json(
      { error: "A valid PayPal subscription ID is required." },
      { status: 400 },
    );
  }

  try {
    const config = getPayPalPublicConfig();
    const remote = await paypalApiRequest<PayPalSubscription>(
      `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "GET" },
    );

    if (
      remote.id !== subscriptionId ||
      !["ACTIVE", "APPROVED"].includes(String(remote.status || "").toUpperCase())
    ) {
      return NextResponse.json(
        { error: "PayPal has not confirmed an approved subscription." },
        { status: 409 },
      );
    }

    const planId = String(remote.plan_id || "");
    const interval =
      planId === config.monthlyPlanId
        ? "monthly"
        : planId === config.yearlyPlanId
          ? "yearly"
          : null;

    if (!interval) {
      return NextResponse.json(
        { error: "The PayPal subscription is not for an Inlinked Pro plan." },
        { status: 403 },
      );
    }

    if (String(remote.custom_id || "") !== user.userId) {
      return NextResponse.json(
        { error: "The PayPal subscription does not match this Inlinked account." },
        { status: 403 },
      );
    }

    const sql = db();
    // A PayPal checkout cannot be attached while this account already has
    // an active Paddle subscription. Paddle's own records remain untouched.
    const paddleRows = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM paddle_subscriptions
        WHERE user_id = ${user.userId}
          AND status IN ('active', 'trialing')
      ) AS has_paddle_subscription
    ` as unknown as { has_paddle_subscription: boolean }[];

    if (paddleRows[0]?.has_paddle_subscription) {
      return NextResponse.json(
        { error: "This account already has an active subscription with another provider." },
        { status: 409 },
      );
    }

    await sql`
      UPDATE paypal_subscriptions
      SET status = 'expired', updated_at = now()
      WHERE user_id = ${user.userId}
        AND status = 'cancelled'
        AND current_period_ends_at IS NOT NULL
        AND current_period_ends_at <= now()
    `;

    const existing = await sql`
      SELECT paypal_subscription_id
      FROM paypal_subscriptions
      WHERE user_id = ${user.userId}
        AND paypal_subscription_id <> ${subscriptionId}
        AND (
          status IN ('active', 'approved')
          OR (
            status = 'cancelled'
            AND current_period_ends_at IS NOT NULL
            AND current_period_ends_at > now()
          )
        )
      LIMIT 1
    ` as unknown as { paypal_subscription_id: string }[];

    if (existing.length) {
      return NextResponse.json(
        { error: "This account already has an active PayPal subscription." },
        { status: 409 },
      );
    }

    const periodEnd = validDate(remote.billing_info?.next_billing_time);
    const status = String(remote.status).toLowerCase();

    const saved = await sql`
      INSERT INTO paypal_subscriptions (
        provider,
        paypal_subscription_id,
        user_id,
        plan_id,
        status,
        interval,
        current_period_ends_at,
        event_occurred_at
      )
      VALUES (
        'paypal',
        ${subscriptionId},
        ${user.userId},
        ${planId},
        ${status},
        ${interval},
        ${periodEnd}::timestamptz,
        now()
      )
      ON CONFLICT (paypal_subscription_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        interval = EXCLUDED.interval,
        current_period_ends_at = COALESCE(
          EXCLUDED.current_period_ends_at,
          paypal_subscriptions.current_period_ends_at
        ),
        event_occurred_at = now(),
        updated_at = now()
      WHERE paypal_subscriptions.user_id = EXCLUDED.user_id
        AND paypal_subscriptions.provider = 'paypal'
      RETURNING paypal_subscription_id
    ` as unknown as { paypal_subscription_id: string }[];

    if (!saved.length) {
      return NextResponse.json(
        { error: "This PayPal subscription is already linked to another account." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { verified: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "PayPal subscription confirmation failed.",
      error instanceof Error ? error.message : "Unknown error.",
    );
    return NextResponse.json(
      { error: "Could not verify the PayPal subscription. Please refresh and try again." },
      { status: 503 },
    );
  }
}
