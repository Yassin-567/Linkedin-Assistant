"use client";

import { useEffect, useState } from "react";

type Props = {
  subscriptionId: string;
};

export default function PayPalRedirectReturn({ subscriptionId }: Props) {
  const [state, setState] = useState<"checking" | "verified" | "error">(
    "checking",
  );
  const [message, setMessage] = useState(
    "Verifying the PayPal subscription with Inlinked...",
  );

  useEffect(() => {
    let cancelled = false;

    async function verifySubscription() {
      if (!/^I-[A-Z0-9]+$/.test(subscriptionId)) {
        setState("error");
        setMessage(
          "PayPal did not return a valid subscription ID. Return to billing and refresh your status.",
        );
        return;
      }

      try {
        const response = await fetch("/api/billing/paypal/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionID: subscriptionId }),
        });
        const data = (await response.json()) as {
          verified?: boolean;
          error?: string;
        };

        if (!response.ok || data.verified !== true) {
          throw new Error(
            data.error || "Inlinked could not verify the PayPal subscription.",
          );
        }

        if (!cancelled) {
          setState("verified");
          setMessage(
            "PayPal approval was verified. Pro access will appear after PayPal confirms that the subscription is active.",
          );
        }
      } catch (verificationError) {
        if (!cancelled) {
          setState("error");
          setMessage(
            verificationError instanceof Error
              ? verificationError.message
              : "Could not verify the PayPal subscription.",
          );
        }
      }
    }

    void verifySubscription();

    return () => {
      cancelled = true;
    };
  }, [subscriptionId]);

  return (
    <main className="workspace billing-page">
      <header className="topbar">
        <div>
          <div className="eyebrow">PAYPAL CHECKOUT EXPERIMENT</div>
          <h1>Returning from PayPal</h1>
          <p className="muted">
            Inlinked checks the subscription directly with PayPal before linking it to your account.
          </p>
        </div>
        <a className="button secondary" href="/billing">
          Back to billing
        </a>
      </header>

      <section className="panel billing-current" aria-live="polite">
        <div>
          <h2>
            {state === "checking"
              ? "Verifying subscription"
              : state === "verified"
                ? "Approval verified"
                : "Verification needs attention"}
          </h2>
          <p className={state === "error" ? "billing-error" : "muted"}>
            {message}
          </p>
        </div>
      </section>
    </main>
  );
}
