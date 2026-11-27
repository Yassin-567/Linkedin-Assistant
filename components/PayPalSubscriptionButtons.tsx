"use client";

import { useEffect, useRef, useState } from "react";

type Interval = "monthly" | "yearly";

type PayPalClientConfig = {
  clientId: string;
  monthlyPlanId: string;
  yearlyPlanId: string;
  accountReference: string;
};

type PayPalActions = {
  subscription: {
    create: (input: {
      plan_id: string;
      custom_id: string;
    }) => Promise<string>;
  };
};

type PayPalButtonsInstance = {
  render: (container: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
  isEligible?: () => boolean;
};

type PayPalNamespace = {
  Buttons: (input: {
    createSubscription: (
      data: unknown,
      actions: PayPalActions,
    ) => Promise<string>;
    onApprove: (data: { subscriptionID?: string }) => Promise<void>;
    onError: (error: unknown) => void;
  }) => PayPalButtonsInstance;
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let sdkPromise: Promise<PayPalNamespace> | null = null;
let sdkClientId = "";

async function loadPayPalSdk(clientId: string): Promise<PayPalNamespace> {
  if (window.paypal) {
    if (sdkClientId && sdkClientId !== clientId) {
      throw new Error("A different PayPal application is already loaded.");
    }
    sdkClientId = clientId;
    return window.paypal;
  }

  if (sdkPromise) {
    if (sdkClientId !== clientId) {
      throw new Error("A different PayPal application is already loading.");
    }
    return sdkPromise;
  }

  sdkClientId = clientId;
  sdkPromise = new Promise<PayPalNamespace>((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      "client-id": clientId,
      vault: "true",
      intent: "subscription",
      components: "buttons",
      "disable-funding": "card",
      currency: "USD",
    });
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.dataset.paypalSubscriptionsSdk = "true";
    script.onload = () => {
      if (window.paypal) {
        resolve(window.paypal);
      } else {
        sdkPromise = null;
        reject(new Error("PayPal checkout could not be initialized."));
      }
    };
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("PayPal checkout could not be loaded."));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

type Props = {
  interval: Interval;
  onVerified: () => Promise<void>;
};

export default function PayPalSubscriptionButtons({
  interval,
  onVerified,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<PayPalButtonsInstance | null>(null);
  const [message, setMessage] = useState("Loading PayPal checkout...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setError("");
      setMessage("Loading PayPal checkout...");

      try {
        const configResponse = await fetch(
          "/api/billing/paypal/config",
          { cache: "no-store" },
        );
        const configData = (await configResponse.json()) as
          | PayPalClientConfig
          | { error?: string };

        if (!configResponse.ok) {
          throw new Error(
            "error" in configData
              ? configData.error || "PayPal checkout is not configured."
              : "PayPal checkout is not configured.",
          );
        }

        const config = configData as PayPalClientConfig;
        const paypal = await loadPayPalSdk(config.clientId);
        const container = containerRef.current;
        if (cancelled || !container) return;

        const planId =
          interval === "monthly"
            ? config.monthlyPlanId
            : config.yearlyPlanId;

        const buttons = paypal.Buttons({
          createSubscription: (_data, actions) =>
            actions.subscription.create({
              plan_id: planId,
              custom_id: config.accountReference,
            }),
          onApprove: async (data) => {
            const subscriptionID = String(data.subscriptionID || "");
            if (!subscriptionID) {
              setError("PayPal did not return a subscription ID.");
              return;
            }

            try {
              const response = await fetch(
                "/api/billing/paypal/confirm",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ subscriptionID }),
                },
              );
              const result = (await response.json()) as {
                error?: string;
                verified?: boolean;
              };

              if (!response.ok || result.verified !== true) {
                throw new Error(
                  result.error || "Inlinked could not verify the subscription.",
                );
              }

              setMessage("PayPal subscription verified. Refreshing plan...");
              await onVerified();
            } catch (confirmationError) {
              setError(
                confirmationError instanceof Error
                  ? confirmationError.message
                  : "Could not verify the PayPal subscription.",
              );
            }
          },
          onError: (checkoutError) => {
            setError(
              checkoutError instanceof Error
                ? checkoutError.message
                : "PayPal checkout could not be completed.",
            );
          },
        });

        buttonsRef.current = buttons;
        await buttons.render(container);
        if (!cancelled) setMessage("");
      } catch (initializationError) {
        if (!cancelled) {
          setError(
            initializationError instanceof Error
              ? initializationError.message
              : "PayPal checkout is currently unavailable.",
          );
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      const buttons = buttonsRef.current;
      buttonsRef.current = null;
      if (buttons?.close) void buttons.close().catch(() => undefined);
    };
  }, [interval, onVerified]);

  return (
    <div className="billing-paypal-buttons">
      {message && <p className="muted">{message}</p>}
      {error && <p className="billing-error" role="alert">{error}</p>}
      <div ref={containerRef} />
    </div>
  );
}
