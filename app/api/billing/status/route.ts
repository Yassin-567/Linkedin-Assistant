import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { getBillingState } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser({ allowFrozen: true });
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const billing = await getBillingState(user.userId);
    return NextResponse.json(billing, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Billing status read failed", error);
    return NextResponse.json({ error: "Billing is not configured yet. Apply the Phase 16 migration to the preview database." }, { status: 503 });
  }
}
