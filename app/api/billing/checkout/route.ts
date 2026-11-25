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

    // The server chooses the one allowed catalog price. The browser cannot submit price, user or customer IDs.
    const priceId = interval === "monthly" ? PADDLE_MONTHLY_PRICE_ID : PADDLE_YEARLY_PRICE_ID;
    const transaction = await paddleApiRequest<PaddleResponse<{ id: string; status: string }>>("/transactions", {
      method: "POST",
      body: {
        items: [{ price_id: priceId, quantity: 1 }],
        collection_mode: "automatic"
      }
    });
    if (!transaction.data?.id) throw new Error("Paddle did not return a transaction ID.");

    // Create a draft transaction without customer/address fields so Paddle Checkout can collect them.
    // Persist its owner mapping before the transaction ID reaches the browser. Paddle's subscription.created
    // event includes the originating transaction ID; the signed webhook then binds the generated customer ID.
    const sql = db();
    await sql`INSERT INTO paddle_checkout_transactions(
      paddle_transaction_id, user_id, price_id, status
    ) VALUES (
      ${transaction.data.id}, ${user.userId}, ${priceId}, 'pending'
    )`;

    return NextResponse.json({
      transactionId: transaction.data.id,
      status: transaction.data.status,
      email: user.email
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Paddle sandbox checkout preparation failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Could not prepare Paddle sandbox checkout. Check the preview environment configuration." }, { status: 503 });
  }
}
