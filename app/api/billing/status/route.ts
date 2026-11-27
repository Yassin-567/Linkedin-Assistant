import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { getBillingState } from "@/lib/billing";
import { getPaddleClientConfig } from "@/lib/paddle-client-config";
import { getPaddlePriceIds, getPaddleWebhookSecret } from "@/lib/paddle-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasCompletePaddleConfiguration(): boolean {
  try {
    getPaddlePriceIds();
    getPaddleWebhookSecret();
    return getPaddleClientConfig().ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const user = await currentUser({ allowFrozen: true });

  if (!user) {
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401 },
    );
  }

  try {
    const billing = await getBillingState(user.userId);
    // Keep the billing-off response exactly as it was. Provider availability
    // is only reported while paid billing enforcement is enabled.
    const responseBody = billing.enforced
      ? { ...billing, paddleConfigured: hasCompletePaddleConfiguration() }
      : billing;

    return NextResponse.json(
      responseBody,
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("Billing status read failed", error);

    return NextResponse.json(
      {
        error:
          "Billing is not configured yet. Apply the Phase 16 migration to the preview database.",
      },
      { status: 503 },
    );
  }
}
