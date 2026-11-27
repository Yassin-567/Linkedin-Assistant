import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getPayPalWebhookId,
  getPayPalPublicConfig,
  paypalApiRequest,
  PayPalConfigurationError,
} from "@/lib/paypal-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  create_time?: string;
  resource?: Record<string, unknown>;
};

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

function sameBillingInstant(first: string | null, second: string | null) {
  if (!first || !second) return false;
  return Math.abs(Date.parse(first) - Date.parse(second)) <= 60_000;
}

function subscriptionIdForEvent(
  eventType: string,
  resource: Record<string, unknown>,
): string {
  if (eventType === "PAYMENT.SALE.COMPLETED") {
    return String(resource.billing_agreement_id || "");
  }
  return String(
    resource.id ||
      resource.billing_agreement_id ||
      (resource.subscription as Record<string, unknown> | undefined)?.id ||
      "",
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!rawBody) {
    return NextResponse.json({ error: "Empty webhook body." }, { status: 400 });
  }

  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Malformed webhook body." }, { status: 400 });
  }

  const transmissionId = request.headers.get("paypal-transmission-id") || "";
  const transmissionTime = request.headers.get("paypal-transmission-time") || "";
  const certUrl = request.headers.get("paypal-cert-url") || "";
  const authAlgo = request.headers.get("paypal-auth-algo") || "";
  const transmissionSig = request.headers.get("paypal-transmission-sig") || "";

  if (
    !transmissionId ||
    !transmissionTime ||
    !certUrl ||
    !authAlgo ||
    !transmissionSig
  ) {
    return NextResponse.json(
      { error: "Missing PayPal webhook signature headers." },
      { status: 400 },
    );
  }

  try {
    const webhookId = getPayPalWebhookId();
    // PayPal requires webhook_event to be posted back with exactly the
    // original request bytes. Do not parse and re-stringify this field.
    const verificationFields = JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
    });
    const verificationBody =
      verificationFields.slice(0, -1) +
      ',"webhook_event":' +
      rawBody +
      "}";

    const verification = await paypalApiRequest<{
      verification_status?: string;
    }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      rawBody: verificationBody,
    });

    if (verification.verification_status !== "SUCCESS") {
      return NextResponse.json(
        { error: "Invalid PayPal webhook signature." },
        { status: 400 },
      );
    }
  } catch (error) {
    if (error instanceof PayPalConfigurationError) {
      return NextResponse.json(
        { error: "PayPal webhook verification is not configured." },
        { status: 503 },
      );
    }
    console.error("PayPal webhook signature verification failed.");
    return NextResponse.json(
      { error: "Could not verify the PayPal webhook signature." },
      { status: 503 },
    );
  }

  const eventId = String(event.id || "");
  const eventType = String(event.event_type || "");
  const occurredAt =
    validDate(event.create_time) || new Date().toISOString();
  const resource = event.resource || {};

  if (!eventId || !eventType) {
    return NextResponse.json(
      { error: "Malformed PayPal webhook event." },
      { status: 400 },
    );
  }

  const handledTypes = new Set([
    "BILLING.SUBSCRIPTION.ACTIVATED",
    "BILLING.SUBSCRIPTION.UPDATED",
    "PAYMENT.SALE.COMPLETED",
    "BILLING.SUBSCRIPTION.CANCELLED",
    "BILLING.SUBSCRIPTION.EXPIRED",
    "BILLING.SUBSCRIPTION.SUSPENDED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  ]);

  const sql = db();
  try {
    await sql`
      INSERT INTO paypal_webhook_events (
        paypal_event_id, event_type, occurred_at
      )
      VALUES (${eventId}, ${eventType}, ${occurredAt}::timestamptz)
      ON CONFLICT (paypal_event_id) DO NOTHING
    `;

    const seen = await sql`
      SELECT processed_at
      FROM paypal_webhook_events
      WHERE paypal_event_id = ${eventId}
      LIMIT 1
    ` as unknown as { processed_at: string | null }[];

    if (seen[0]?.processed_at) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (handledTypes.has(eventType)) {
      const subscriptionId = subscriptionIdForEvent(eventType, resource);
      if (!subscriptionId) {
        return NextResponse.json(
          { error: "PayPal event did not identify a subscription." },
          { status: 400 },
        );
      }

      const rows = await sql`
        SELECT user_id, plan_id, status, interval, current_period_ends_at
        FROM paypal_subscriptions
        WHERE provider = 'paypal'
          AND paypal_subscription_id = ${subscriptionId}
        LIMIT 1
      ` as unknown as {
        user_id: string;
        plan_id: string;
        status: string;
        interval: string;
        current_period_ends_at: string | null;
      }[];

      if (!rows.length) {
        // The user-to-subscription mapping is created only by the
        // authenticated confirmation endpoint. A retry is safe if
        // PayPal delivers ACTIVATED immediately before that write.
        return NextResponse.json(
          { error: "PayPal subscription is not linked to an Inlinked account yet." },
          { status: 500 },
        );
      }

      const subscription = rows[0];

      if (eventType === "BILLING.SUBSCRIPTION.UPDATED") {
        const config = getPayPalPublicConfig();
        const verified = await paypalApiRequest<PayPalSubscription>(
          `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
          { method: "GET" },
        );

        if (
          verified.id !== subscriptionId ||
          String(verified.status || "").toUpperCase() !== "ACTIVE" ||
          String(verified.custom_id || "") !== subscription.user_id
        ) {
          return NextResponse.json(
            { error: "PayPal subscription details do not match the verified Inlinked record." },
            { status: 400 },
          );
        }

        const verifiedPlanId = String(verified.plan_id || "");
        if (verifiedPlanId === subscription.plan_id) {
          // PayPal also emits UPDATED for non-plan changes. Keep the row
          // unchanged when the verified plan has not changed.
        } else if (
          subscription.plan_id === config.monthlyPlanId &&
          subscription.interval === "monthly" &&
          verifiedPlanId === config.yearlyPlanId
        ) {
          const savedNextBilling = validDate(subscription.current_period_ends_at);
          const verifiedNextBilling = validDate(
            verified.billing_info?.next_billing_time,
          );

          if (!sameBillingInstant(savedNextBilling, verifiedNextBilling)) {
            return NextResponse.json(
              { error: "PayPal changed the next billing date during the plan revision; the Inlinked plan record was not updated." },
              { status: 409 },
            );
          }

          const conflicts = await sql`
            SELECT (
              EXISTS (
                SELECT 1
                FROM paddle_subscriptions
                WHERE user_id = ${subscription.user_id}
                  AND status IN ('active', 'trialing')
              )
              OR EXISTS (
                SELECT 1
                FROM paypal_subscriptions
                WHERE user_id = ${subscription.user_id}
                  AND provider = 'paypal'
                  AND paypal_subscription_id <> ${subscriptionId}
                  AND (
                    status IN ('approved', 'active')
                    OR (
                      status = 'cancelled'
                      AND current_period_ends_at IS NOT NULL
                      AND current_period_ends_at > now()
                    )
                  )
              )
            ) AS has_other_current_subscription
          ` as unknown as { has_other_current_subscription: boolean }[];

          if (conflicts[0]?.has_other_current_subscription) {
            return NextResponse.json(
              { error: "Another current subscription exists; the Yearly revision was not applied to Inlinked." },
              { status: 409 },
            );
          }

          const updated = await sql`
            UPDATE paypal_subscriptions
            SET plan_id = ${config.yearlyPlanId},
                interval = 'yearly',
                event_occurred_at = ${occurredAt}::timestamptz,
                updated_at = now()
            WHERE provider = 'paypal'
              AND paypal_subscription_id = ${subscriptionId}
              AND user_id = ${subscription.user_id}
              AND status = 'active'
              AND plan_id = ${config.monthlyPlanId}
              AND interval = 'monthly'
              AND event_occurred_at <= ${occurredAt}::timestamptz
            RETURNING paypal_subscription_id
          ` as unknown as { paypal_subscription_id: string }[];

          if (!updated.length) {
            return NextResponse.json(
              { error: "The Monthly subscription row changed before the verified Yearly event could be applied." },
              { status: 409 },
            );
          }
        } else {
          return NextResponse.json(
            { error: "PayPal reported an unsupported subscription plan transition." },
            { status: 409 },
          );
        }
      }

      if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
        const verified = await paypalApiRequest<PayPalSubscription>(
          `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
          { method: "GET" },
        );

        if (
          verified.id !== subscriptionId ||
          String(verified.plan_id || "") !== subscription.plan_id ||
          String(verified.status || "").toUpperCase() !== "ACTIVE"
        ) {
          return NextResponse.json(
            { error: "PayPal subscription details do not match the verified Inlinked record." },
            { status: 400 },
          );
        }

        const periodEnd = validDate(verified.billing_info?.next_billing_time);
        await sql`
          UPDATE paypal_subscriptions
          SET status = 'active',
              current_period_ends_at = COALESCE(
                ${periodEnd}::timestamptz,
                current_period_ends_at
              ),
              event_occurred_at = ${occurredAt}::timestamptz,
              updated_at = now()
          WHERE provider = 'paypal'
            AND paypal_subscription_id = ${subscriptionId}
            AND user_id = ${subscription.user_id}
            AND event_occurred_at <= ${occurredAt}::timestamptz
        `;
      }

      if (eventType === "PAYMENT.SALE.COMPLETED") {
        const details = await paypalApiRequest<PayPalSubscription>(
          `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
          { method: "GET" },
        );
        if (
          details.id !== subscriptionId ||
          String(details.plan_id || "") !== subscription.plan_id
        ) {
          return NextResponse.json(
            { error: "PayPal renewal details do not match the verified Inlinked subscription." },
            { status: 400 },
          );
        }
        const periodEnd = validDate(details.billing_info?.next_billing_time);
        await sql`
          UPDATE paypal_subscriptions
          SET last_payment_at = ${occurredAt}::timestamptz,
              current_period_ends_at = COALESCE(
                ${periodEnd}::timestamptz,
                current_period_ends_at
              ),
              payment_failed_at = NULL,
              payment_failure_reason = NULL,
              event_occurred_at = ${occurredAt}::timestamptz,
              updated_at = now()
          WHERE provider = 'paypal'
            AND paypal_subscription_id = ${subscriptionId}
            AND user_id = ${subscription.user_id}
            AND event_occurred_at <= ${occurredAt}::timestamptz
        `;
      }

      if (eventType === "BILLING.SUBSCRIPTION.CANCELLED") {
        let periodEnd: string | null = null;
        try {
          const details = await paypalApiRequest<PayPalSubscription>(
            `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
            { method: "GET" },
          );
          periodEnd = validDate(details.billing_info?.next_billing_time);
        } catch {
          // Keep the previously verified period end when PayPal no longer
          // exposes a next billing time after cancellation.
        }

        await sql`
          UPDATE paypal_subscriptions
          SET status = 'cancelled',
              current_period_ends_at = COALESCE(
                ${periodEnd}::timestamptz,
                current_period_ends_at
              ),
              event_occurred_at = ${occurredAt}::timestamptz,
              updated_at = now()
          WHERE provider = 'paypal'
            AND paypal_subscription_id = ${subscriptionId}
            AND user_id = ${subscription.user_id}
            AND event_occurred_at <= ${occurredAt}::timestamptz
        `;
      }

      if (eventType === "BILLING.SUBSCRIPTION.EXPIRED") {
        await sql`
          UPDATE paypal_subscriptions
          SET status = 'expired',
              event_occurred_at = ${occurredAt}::timestamptz,
              updated_at = now()
          WHERE provider = 'paypal'
            AND paypal_subscription_id = ${subscriptionId}
            AND user_id = ${subscription.user_id}
            AND event_occurred_at <= ${occurredAt}::timestamptz
        `;
      }

      if (eventType === "BILLING.SUBSCRIPTION.SUSPENDED") {
        await sql`
          UPDATE paypal_subscriptions
          SET status = 'suspended',
              event_occurred_at = ${occurredAt}::timestamptz,
              updated_at = now()
          WHERE provider = 'paypal'
            AND paypal_subscription_id = ${subscriptionId}
            AND user_id = ${subscription.user_id}
            AND event_occurred_at <= ${occurredAt}::timestamptz
        `;
      }

      if (eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
        await sql`
          UPDATE paypal_subscriptions
          SET payment_failed_at = ${occurredAt}::timestamptz,
              payment_failure_reason = 'PayPal reported a failed subscription payment.',
              event_occurred_at = ${occurredAt}::timestamptz,
              updated_at = now()
          WHERE provider = 'paypal'
            AND paypal_subscription_id = ${subscriptionId}
            AND user_id = ${subscription.user_id}
            AND event_occurred_at <= ${occurredAt}::timestamptz
        `;
      }
    }

    await sql`
      UPDATE paypal_webhook_events
      SET processed_at = now()
      WHERE paypal_event_id = ${eventId}
        AND processed_at IS NULL
    `;

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(
      "PayPal webhook processing failed.",
      error instanceof Error ? error.message : "Unknown error.",
    );
    return NextResponse.json(
      { error: "PayPal webhook processing failed; PayPal may retry the event." },
      { status: 500 },
    );
  }
}
