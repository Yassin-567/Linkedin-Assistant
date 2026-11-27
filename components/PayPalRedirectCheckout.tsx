"use client";

import { useEffect, useState } from "react";

type BillingStatus = {
  plan: "free" | "pro";
  enforced: boolean;
};

type Props = {
  cancelled: boolean;
};

export default function PayPalRedirectCheckout({ cancelled }: Props) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"monthly" | "yearly" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    cancelled ? "You cancelled the PayPal approval. No subscription was confirmed." : "",
  );

  useEffect(() => {
    let cancelledRequest = false;

    async function loadStatus() {
      try {
        const response = await fetch("/api/billing/status", {
          cache: "no-store",
        });
        const data = (await response.json()) as
          | BillingStatus
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in data
              ? data.error || "Could not load billing status."
              : "Could not load billing status.",
          );
        }

        if (!cancelledRequest) {
          setStatus(data as BillingStatus);
        }
      } catch (loadError) {
        if (!cancelledRequest) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load billing status.",
          );
        }
      } finally {
        if (!cancelledRequest) setLoading(false);
      }
    }

    void loadStatus();

    return () => {
      cancelledRequest = true;
    };
  }, []);

  async function startCheckout(interval: "monthly" | "yearly") {
    if (!status?.enforced || status.plan === "pro" || busy) return;

    setBusy(interval);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/billing/paypal/redirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = (await response.json()) as {
        approvalUrl?: string;
        error?: string;
      };

      if (!response.ok || !data.approvalUrl) {
        throw new Error(
          data.error || "PayPal did not return an approval link.",
        );
      }

      const approvalUrl = new URL(data.approvalUrl);
      if (
        approvalUrl.protocol !== "https:" ||
        !["www.paypal.com", "www.sandbox.paypal.com"].includes(
          approvalUrl.hostname.toLowerCase(),
        )
      ) {
        throw new Error("PayPal returned an unexpected approval address.");
      }

      window.location.assign(approvalUrl.toString());
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Could not open PayPal checkout.",
      );
      setBusy("");
    }
  }

  return (
    <main className="workspace billing-page">
      <header className="topbar">
        <div>
          <div className="eyebrow">PAYPAL CHECKOUT EXPERIMENT</div>
          <h1>PayPal full-page redirect</h1>
          <p className="muted">
            An isolated test of PayPal&apos;s server-created subscription approval flow.
          </p>
        </div>
        <a className="button secondary" href="/billing">
          Back to billing
        </a>
      </header>

      <section className="panel billing-current">
        <div>
          <div className="eyebrow">CONTROLLED EXPERIMENT</div>
          <h2>Inlinked Pro</h2>
          <p className="muted">
            Choose an interval to create a PayPal approval request and continue on PayPal&apos;s website.
            Inlinked verifies the subscription only after PayPal returns you here.
          </p>
          <p className="muted">
            This page is separate from the standard billing checkout. The normal /billing checkout remains unchanged.
          </p>
          {notice && <p className="billing-notice" role="status">{notice}</p>}
          {error && <p className="billing-error" role="alert">{error}</p>}
        </div>
      </section>

      <section className="billing-plans">
        <article className="panel billing-plan billing-plan-pro">
          <div className="eyebrow">PAYPAL REST SUBSCRIPTIONS API</div>
          <h2>Monthly</h2>
          <p className="billing-price-row">
            <strong>$8.00 USD</strong>
            <span className="muted"> / month</span>
          </p>
          <button
            className="button"
            type="button"
            onClick={() => void startCheckout("monthly")}
            disabled={
              loading ||
              !status?.enforced ||
              status.plan === "pro" ||
              busy !== ""
            }
          >
            {busy === "monthly" ? "Opening PayPal..." : "Continue with monthly"}
          </button>
        </article>

        <article className="panel billing-plan billing-plan-pro">
          <div className="eyebrow">PAYPAL REST SUBSCRIPTIONS API</div>
          <h2>Yearly</h2>
          <p className="billing-price-row">
            <strong>$79.00 USD</strong>
            <span className="muted"> / year</span>
          </p>
          <button
            className="button"
            type="button"
            onClick={() => void startCheckout("yearly")}
            disabled={
              loading ||
              !status?.enforced ||
              status.plan === "pro" ||
              busy !== ""
            }
          >
            {busy === "yearly" ? "Opening PayPal..." : "Continue with yearly"}
          </button>
        </article>
      </section>

      {loading && <p className="muted" role="status">Checking your billing status...</p>}
      {!loading && !status && !error && (
        <p className="billing-error" role="alert">Sign in to test the checkout flow.</p>
      )}
      {!loading && status?.enforced === false && (
        <p className="billing-warning" role="status">
          Paid checkout is disabled on this deployment. No PayPal request was created.
        </p>
      )}
      {!loading && status?.plan === "pro" && (
        <p className="billing-warning" role="status">
          This account already has Pro access. No additional subscription can be started here.
        </p>
      )}

      <section className="panel billing-legal-placeholder">
        <h3>Experiment safety</h3>
        <p className="muted">
          Opening this page does not create a subscription. Selecting an interval creates a PayPal approval-pending
          subscription request, but this page does not capture a payment. The buyer must review and approve on PayPal.
          Account access is updated only through Inlinked&apos;s existing verified confirmation and webhook flow.
        </p>
        <p className="muted">
          For testing, use a PayPal Sandbox Preview deployment and Sandbox buyer account.
        </p>
      </section>
    </main>
  );
}
