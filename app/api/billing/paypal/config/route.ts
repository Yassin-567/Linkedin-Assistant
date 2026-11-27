import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { isBillingEnforced } from "@/lib/billing";
import { getPayPalPublicConfig, PayPalConfigurationError } from "@/lib/paypal-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

  try {
    const config = getPayPalPublicConfig();
    // The user reference is attached to the PayPal subscription during
    // creation, then independently checked against the authenticated
    // session by the server-side confirmation endpoint.
    return NextResponse.json(
      { ...config, accountReference: user.userId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (!(error instanceof PayPalConfigurationError)) {
      console.error("PayPal client configuration unavailable.");
    }
    return NextResponse.json(
      { error: "PayPal checkout is not configured yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
