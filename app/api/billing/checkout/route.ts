import {
  NextResponse,
  type NextRequest,
} from "next/server";

import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { getBillingState } from "@/lib/billing";

import {
  getPaddlePriceIds,
  paddleApiRequest,
  PaddleConfigurationError,
} from "@/lib/paddle-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaddleResponse<T> = {
  data: T;
};

function unavailableResponse(
  message: string,
  code: string,
) {
  return NextResponse.json(
    {
      error: message,
      code,
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { interval?: unknown }
    | null;

  const interval = body?.interval;

  if (
    interval !== "monthly" &&
    interval !== "yearly"
  ) {
    return NextResponse.json(
      { error: "Choose a valid billing interval." },
      { status: 400 },
    );
  }

  try {
    // Validate the environment, server key, public environment
    // and both price IDs before attempting transaction creation.
    const prices = getPaddlePriceIds();

    const priceId =
      interval === "monthly"
        ? prices.monthlyPriceId
        : prices.yearlyPriceId;

    const billing = await getBillingState(user.userId);

    if (billing.plan === "pro") {
      return NextResponse.json(
        {
          error: "Your account already has Pro access.",
        },
        { status: 409 },
      );
    }

    // The server selects the catalog price.
    // The browser cannot submit a price, user or customer ID.
    const transaction =
      await paddleApiRequest<
        PaddleResponse<{
          id: string;
          status: string;
        }>
      >(
        "/transactions",
        {
          method: "POST",
          body: {
            items: [
              {
                price_id: priceId,
                quantity: 1,
              },
            ],
            collection_mode: "automatic",
          },
        },
      );

    if (!transaction.data?.id) {
      throw new Error(
        "Paddle did not return a transaction ID.",
      );
    }

    // Persist the transaction-to-user association before
    // returning the transaction ID to the browser.
    //
    // The signed Paddle webhook subsequently validates the
    // subscription event and associates the customer/subscription
    // with the correct Inlinked user.
    const sql = db();

    await sql`
      INSERT INTO paddle_checkout_transactions (
        paddle_transaction_id,
        user_id,
        price_id,
        status
      )
      VALUES (
        ${transaction.data.id},
        ${user.userId},
        ${priceId},
        'pending'
      )
    `;

    return NextResponse.json(
      {
        transactionId: transaction.data.id,
        status: transaction.data.status,
        email: user.email,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof PaddleConfigurationError) {
      return unavailableResponse(
        "Paddle billing is not configured correctly. Checkout is unavailable.",
        "PADDLE_CONFIGURATION_ERROR",
      );
    }

    // Do not log provider response bodies, credentials or
    // customer/payment information.
    console.error(
      "Paddle checkout preparation failed.",
      error instanceof Error
        ? error.message
        : "Unknown error.",
    );

    return unavailableResponse(
      "Could not prepare checkout. Please try again later.",
      "CHECKOUT_UNAVAILABLE",
    );
  }
}
