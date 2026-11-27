import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import { getPaddlePriceIds, paddleApiRequest } from "@/lib/paddle-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaddlePrice = {
  id?: string; name?: string; description?: string; product_id?: string;
  unit_price?: { amount?: string; currency_code?: string };
  billing_cycle?: { interval?: string; frequency?: number };
};
type PaddlePriceResponse = { data?: PaddlePrice };

export async function GET() {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access is restricted." }, { status: 403 });
  try {
    const ids = getPaddlePriceIds();
    const environment = process.env.PADDLE_ENVIRONMENT?.trim() || "unknown";
    const entries = [
      { interval: "monthly", priceId: ids.monthlyPriceId },
      { interval: "yearly", priceId: ids.yearlyPriceId },
    ];
    const prices = await Promise.all(entries.map(async (entry) => {
      const response = await paddleApiRequest<PaddlePriceResponse>(
        "/prices/" + encodeURIComponent(entry.priceId), { method: "GET" },
      );
      const price = response.data;
      if (!price?.id || price.unit_price?.amount === undefined || !price.unit_price.currency_code) {
        throw new Error("Paddle returned incomplete price information.");
      }
      const amount = Number(price.unit_price.amount);
      const currency = price.unit_price.currency_code;
      const formatter = new Intl.NumberFormat("en", { style: "currency", currency });
      const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
      const formattedAmount = Number.isFinite(amount)
        ? formatter.format(amount / (10 ** fractionDigits))
        : null;
      return {
        interval: entry.interval, priceId: price.id,
        name: price.name || price.description || entry.interval,
        amount: formattedAmount, currency,
        billingInterval: price.billing_cycle
          ? { interval: price.billing_cycle.interval || null, frequency: price.billing_cycle.frequency || null }
          : null,
        productId: price.product_id || null,
      };
    }));
    return NextResponse.json({ ok: true, environment, prices }, {
      headers: { "Cache-Control": "private, no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Admin Paddle price lookup unavailable", error);
    return NextResponse.json({
      ok: false, environment: process.env.PADDLE_ENVIRONMENT?.trim() || "unknown",
      prices: [],
      message: "Paddle prices are currently unavailable. Check the server-side Paddle configuration and try again.",
    }, { headers: { "Cache-Control": "private, no-store, no-cache, must-revalidate" } });
  }
}
