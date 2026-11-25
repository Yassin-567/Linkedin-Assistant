import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { paddleApiRequest } from "@/lib/paddle-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type PortalResponse = { data: { urls?: { general?: { overview?: string } } } };

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const sql = db();
    // Resolve the customer ID from this authenticated account; never accept one from the client.
    const customers: any = await sql`SELECT paddle_customer_id FROM paddle_customers WHERE user_id = ${user.userId} LIMIT 1`;
    const customerId = String(customers[0]?.paddle_customer_id || "");
    if (!customerId) return NextResponse.json({ error: "No Paddle customer is linked to this account." }, { status: 404 });
    const subscriptions: any = await sql`SELECT paddle_subscription_id FROM paddle_subscriptions
      WHERE user_id = ${user.userId} ORDER BY event_occurred_at DESC LIMIT 25`;
    const result = await paddleApiRequest<PortalResponse>(
      "/customers/" + encodeURIComponent(customerId) + "/portal-sessions",
      { method: "POST", body: { subscription_ids: subscriptions.map((row: any) => String(row.paddle_subscription_id)) } }
    );
    const url = result.data?.urls?.general?.overview;
    if (!url) throw new Error("Paddle did not return a customer portal URL.");
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Paddle customer portal request failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Could not open subscription management." }, { status: 503 });
  }
}
