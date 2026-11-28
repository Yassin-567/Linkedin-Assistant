import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { isBillingEnforced } from "@/lib/billing";
import { db } from "@/lib/db";
import { getPayPalPublicConfig, PayPalConfigurationError } from "@/lib/paypal-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ManualGrantEndRow = { endsAt: string | Date };

function isMissingManualGrantTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string };
  return value.code === "42P01" ||
    (typeof value.message === "string" &&
      /relation ["']?manual_pro_grants["']? does not exist/i.test(value.message));
}

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
    let startTime: string | undefined;

    // Schedule the first PayPal billing cycle after an active manual Pro
    // grant ends. Re-read the grant for every config request; do not cache it.
    try {
      const grants = await db()`
        SELECT ends_at AS "endsAt"
        FROM manual_pro_grants
        WHERE user_id = ${user.userId}
          AND starts_at <= now() AND ends_at > now() AND revoked_at IS NULL
        ORDER BY ends_at DESC, created_at DESC
        LIMIT 1
      ` as unknown as ManualGrantEndRow[];

      const grantEnd = grants[0]?.endsAt;
      if (grantEnd) {
        const grantEndDate = new Date(grantEnd);
        // Keep a five-minute safety margin so PayPal never receives a start
        // time that has become imminent or stale while checkout is opened.
        if (
          Number.isFinite(grantEndDate.getTime()) &&
          grantEndDate.getTime() > Date.now() + 5 * 60 * 1000
        ) {
          startTime = grantEndDate.toISOString();
        }
      }
    } catch (error) {
      if (!isMissingManualGrantTable(error)) throw error;
    }

    // The user reference is attached to the PayPal subscription during
    // creation, then independently checked against the authenticated
    // session by the server-side confirmation endpoint.
    return NextResponse.json(
      {
        ...config,
        accountReference: user.userId,
        ...(startTime ? { startTime } : {}),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (!(error instanceof PayPalConfigurationError)) {
      console.error("PayPal checkout configuration lookup failed.");
    }
    return NextResponse.json(
      { error: "PayPal checkout is not configured yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
