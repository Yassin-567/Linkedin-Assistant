import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { getBillingState } from "@/lib/billing";
import { PADDLE_MONTHLY_PRICE_ID, PADDLE_YEARLY_PRICE_ID, paddleApiRequest } from "@/lib/paddle-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type PaddleResponse<T> = { data: T };

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const interval = body?.interval;
  if (interval !== "monthly" && interval !== "yearly") {
    return NextResponse.json({ error: "Choose a valid billing interval." }, { status: 400 });
  }

  try {
    const billing = await getBillingState(user.userId);
    if (billing.plan === "pro") {
      return NextResponse.json({ error: "Your account already has Pro access." }, { status: 409 });
    }

    // Do not accept a price ID or user/customer ID from the browser.
    const priceId = interval === "monthly" ? PADDLE_MONTHLY_PRICE_ID : PADDLE_YEARLY_PRICE_ID;
    const sql = db();
    let customerRows: any = await sql`SELECT paddle_customer_id FROM paddle_customers WHERE user_id = ${user.userId} LIMIT 1`;
    let customerId = customerRows[0]?.paddle_customer_id as string | undefined;

    if (!customerId) {
      const customer = await paddleApiRequest<PaddleResponse<{ id: string }>>("/customers", {
        method: "POST",
        body: {
          email: user.email,
          name: user.name || undefined,
          custom_data: { inlinked_account_created: true }
        }
      });
      await sql`INSERT INTO paddle_customers(user_id, paddle_customer_id, email, customer_name)
        VALUES(${user.userId}, ${customer.data.id}, ${user.email}, ${user.name || ""})
        ON CONFLICT(user_id) DO NOTHING`;
      customerRows = await sql`SELECT paddle_customer_id FROM paddle_customers WHERE user_id = ${user.userId} LIMIT 1`;
      customerId = customerRows[0]?.paddle_customer_id;
      if (!customerId) throw new Error("Could not bind the Paddle customer to this account.");
    }

    const transaction = await paddleApiRequest<PaddleResponse<{ id: string; status: string }>>("/transactions", {
      method: "POST",
      body: {
        items: [{ price_id: priceId, quantity: 1 }],
        customer_id: customerId,
        collection_mode: "automatic",
        enable_checkout: true,
        custom_data: { inlinked_checkout: "subscription" }
      }
    });
    if (!transaction.data?.id) throw new Error("Paddle did not return a transaction ID.");

    // Save the authenticated user's mapping before any checkout is opened in the browser.
    await sql`INSERT INTO paddle_checkout_transactions(
      paddle_transaction_id, user_id, paddle_customer_id, price_id, status
    ) VALUES (
      ${transaction.data.id}, ${user.userId}, ${customerId}, ${priceId}, 'pending'
    )`;

    return NextResponse.json({
      transactionId: transaction.data.id,
      status: transaction.data.status
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Paddle sandbox checkout preparation failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Could not prepare Paddle sandbox checkout. Check the preview environment configuration." }, { status: 503 });
  }
}
