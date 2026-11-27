"use client";

import { useCallback, useEffect, useState } from "react";

type BillingStatus = {
  plan?: "free" | "pro";
  planSource?: string;
  subscription?: {
    provider?: string;
    status?: string;
    interval?: "monthly" | "yearly" | null;
    currentPeriodEndsAt?: string | null;
  } | null;
};

export default function PayPalRevisionReturn() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/status", {
        cache: "no-store",
      });
      const data = await response.json() as BillingStatus & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not refresh billing status.");
      }
      setStatus(data);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Could not refresh billing status.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switched = status?.subscription?.provider === "paypal" &&
    status.subscription.interval === "yearly" &&
    status.planSource === "paypal_subscription";

  return (
    <main className="workspace billing-page">
      <header className="topbar">
        <div>
          <div className="eyebrow">PAYPAL PLAN CHANGE</div>
          <h1>Yearly plan approval</h1>
          <p className="muted">
            PayPal must confirm the revised plan before Inlinked changes your subscription record.
          </p>
        </div>
        <a className="button secondary" href="/billing">
          Back to billing
        </a>
      </header>

      <section className="panel billing-current" aria-live="polite">
        <div>
          <h2>
            {loading
              ? "Checking PayPal update..."
              : switched
                ? "Yearly plan confirmed"
                : "Waiting for PayPal confirmation"}
          </h2>
          <p className="muted">
            {loading
              ? "Reading the latest verified subscription status."
              : switched
                ? "PayPal confirmed the Yearly plan. The existing next billing date was retained; the $79 yearly price applies from that scheduled billing cycle."
                : "If you approved the change in PayPal, its signed BILLING.SUBSCRIPTION.UPDATED notification may still be processing. Your Monthly plan remains in Inlinked until PayPal confirms the change."}
          </p>
          {status?.subscription?.currentPeriodEndsAt && (
            <p className="muted">
              Next scheduled billing date:{" "}
              {new Date(status.subscription.currentPeriodEndsAt).toLocaleDateString()}
            </p>
          )}
          {error && <p className="billing-error" role="alert">{error}</p>}
          <button
            className="button secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh status"}
          </button>
        </div>
      </section>
    </main>
  );
}
