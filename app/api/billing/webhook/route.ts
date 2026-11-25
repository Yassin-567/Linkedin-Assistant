import { NextRequest, NextResponse } from "next/server";
import { createPaddleServerClient, getPaddleWebhookSecret, PADDLE_ALLOWED_PRICE_IDS } from "@/lib/paddle-config";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type EventPayload = { eventId?: string; eventType?: string; occurredAt?: string; data?: any };

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("paddle-signature") || "";
  if (!signature) return NextResponse.json({ error: "Missing Paddle signature." }, { status: 400 });
  const rawBody = await request.text();
  if (!rawBody) return NextResponse.json({ error: "Empty webhook body." }, { status: 400 });

  let event: EventPayload;
  try {
    // The SDK verifies the signature against the untouched raw request body and enforces replay tolerance.
    const paddle = createPaddleServerClient();
    event = await paddle.webhooks.unmarshal(rawBody, getPaddleWebhookSecret(), signature) as unknown as EventPayload;
  } catch {
    return NextResponse.json({ error: "Invalid Paddle webhook signature." }, { status: 400 });
  }

  const eventId = String(event.eventId || "");
  const eventType = String(event.eventType || "");
  const occurredAt = validDate(event.occurredAt);
  const data = event.data || {};
  if (!eventId || !eventType || !occurredAt) {
    return NextResponse.json({ error: "Malformed Paddle event." }, { status: 400 });
  }

  try {
    const sql = db();
    await sql`INSERT INTO paddle_webhook_events(paddle_event_id, event_type, occurred_at)
      VALUES(\${eventId}, \${eventType}, \${occurredAt}::timestamptz)
      ON CONFLICT(paddle_event_id) DO NOTHING`;
    const seen: any = await sql`SELECT processed_at FROM paddle_webhook_events WHERE paddle_event_id = \${eventId} LIMIT 1`;
    if (seen[0]?.processed_at) {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    if (eventType === "transaction.completed") {
      const transactionId = String(data.id || "");
      if (transactionId) {
        await sql`UPDATE paddle_checkout_transactions
          SET status = 'completed', completed_at = \${occurredAt}::timestamptz
          WHERE paddle_transaction_id = \${transactionId}`;
      }
    }

    if (eventType === "customer.created" || eventType === "customer.updated") {
      const customerId = String(data.id || "");
      if (customerId) {
        await sql`UPDATE paddle_customers
          SET email = \${String(data.email || "")},
              customer_name = \${String(data.name || "")},
              updated_at = now()
          WHERE paddle_customer_id = \${customerId}`;
      }
    }

    if (["subscription.created", "subscription.updated", "subscription.canceled"].includes(eventType)) {
      const subscriptionId = String(data.id || "");
      const customerId = String(data.customerId || data.customer_id || "");
      const status = String(data.status || "");
      const allowedStatuses = new Set(["active", "trialing", "past_due", "paused", "canceled"]);
      if (!subscriptionId || !customerId || !allowedStatuses.has(status)) {
        throw new Error("Paddle subscription event is missing required fields.");
      }
      const owners: any = await sql`SELECT user_id FROM paddle_customers
        WHERE paddle_customer_id = \${customerId} LIMIT 1`;
      if (!owners.length) throw new Error("Paddle customer is not mapped to an Inlinked account yet.");
      const userId = String(owners[0].user_id);
      const items = Array.isArray(data.items) ? data.items : [];
      const allowedItem = items.find((item: any) => {
        const id = String(item?.price?.id || item?.priceId || item?.price_id || "");
        return PADDLE_ALLOWED_PRICE_IDS.has(id);
      });
      const priceId = allowedItem
        ? String(allowedItem.price?.id || allowedItem.priceId || allowedItem.price_id)
        : "";
      const period = data.currentBillingPeriod || data.current_billing_period || {};
      const startsAt = validDate(period.startsAt || period.starts_at);
      const endsAt = validDate(period.endsAt || period.ends_at);
      const scheduledChange = data.scheduledChange ?? data.scheduled_change ?? null;

      await sql`INSERT INTO paddle_subscriptions(
        paddle_subscription_id, user_id, paddle_customer_id, status, price_id,
        current_period_starts_at, current_period_ends_at, scheduled_change, event_occurred_at
      ) VALUES (
        \${subscriptionId}, \${userId}, \${customerId}, \${status}, \${priceId},
        \${startsAt}::timestamptz, \${endsAt}::timestamptz,
        \${JSON.stringify(scheduledChange)}::jsonb, \${occurredAt}::timestamptz
      )
      ON CONFLICT(paddle_subscription_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        paddle_customer_id = EXCLUDED.paddle_customer_id,
        status = EXCLUDED.status,
        price_id = EXCLUDED.price_id,
        current_period_starts_at = EXCLUDED.current_period_starts_at,
        current_period_ends_at = EXCLUDED.current_period_ends_at,
        scheduled_change = EXCLUDED.scheduled_change,
        event_occurred_at = EXCLUDED.event_occurred_at,
        updated_at = now()
      WHERE paddle_subscriptions.user_id = EXCLUDED.user_id
        AND EXCLUDED.event_occurred_at >= paddle_subscriptions.event_occurred_at`;
    }

    await sql`UPDATE paddle_webhook_events SET processed_at = now()
      WHERE paddle_event_id = \${eventId} AND processed_at IS NULL`;
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Paddle webhook processing failed", {
      eventId,
      eventType,
      message: error instanceof Error ? error.message : "unknown error"
    });
    return NextResponse.json({ error: "Webhook processing failed; Paddle may retry this event." }, { status: 500 });
  }
}
