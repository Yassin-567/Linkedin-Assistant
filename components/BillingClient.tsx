"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Paddle } from "@paddle/paddle-js";

import { getPaddleClientConfig } from "@/lib/paddle-client-config";

type BillingStatus = {
  plan: "free" | "pro";
  enforced: boolean;
  planSource?: "none" | "paddle_subscription" | "manual_grant";
  grant?: { id: string; startsAt: string; endsAt: string; active: boolean } | null;
  subscription:
    | null
    | {
        status: string;
        currentPeriodEndsAt?: string | null;
        scheduledChange?: unknown;
        priceId?: string;
      };
  entitlements: {
    prospects: number | null;
    savedJobs: number | null;
    commercialLeads: number | null;
    leadProfiles: number | null;
    features: Record<string, boolean>;
  };
};

type PriceDisplay = {
  monthly: string;
  yearly: string;
};

type PaddleClientConfig = ReturnType<
  typeof getPaddleClientConfig
>;

function getUnavailableMessage(
  config: PaddleClientConfig,
): string {
  if (
    config.ok &&
    config.environment === "sandbox"
  ) {
    return "Paddle sandbox is not available yet. Check the sandbox client token and configuration.";
  }

  return "Paddle billing is currently unavailable. Please try again later.";
}

export default function BillingClient() {
  const [status, setStatus] =
    useState<BillingStatus | null>(null);

  const [prices, setPrices] = useState<PriceDisplay>({
    monthly: "",
    yearly: "",
  });

  const [interval, setInterval] =
    useState<"monthly" | "yearly">("monthly");

  const [busy, setBusy] = useState<
    "monthly" | "yearly" | "portal" | "refresh" | ""
  >("");

  const [notice, setNotice] = useState("");

  const [error, setError] = useState("");

  const paddleRef = useRef<Paddle | null>(null);

  // Paddle configuration is deliberately loaded only after
  // the billing status confirms that enforcement is enabled.
  const [paddleConfig, setPaddleConfig] =
    useState<PaddleClientConfig | null>(null);

  const [paddleUnavailable, setPaddleUnavailable] =
    useState(false);

  const billingDormant = status?.enforced === false;

  const refreshStatus = useCallback(async (): Promise<BillingStatus> => {
    const response = await fetch(
      "/api/billing/status",
      { cache: "no-store" },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Could not load billing status.",
      );
    }

    const billingStatus = data as BillingStatus;

    setStatus(billingStatus);

    return billingStatus;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      let billingStatus: BillingStatus | null = null;

      // Always establish the server-side enforcement state
      // before accessing any Paddle client configuration.
      try {
        billingStatus = await refreshStatus();
      } catch (e: unknown) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not load billing status.",
          );
        }
      }

      if (cancelled) {
        return;
      }

      // Dormant billing must not initialize Paddle.js,
      // inspect Paddle configuration or request price previews.
      if (billingStatus?.enforced === false) {
        setPaddleConfig(null);
        setPaddleUnavailable(false);
        setError("");
        return;
      }

      // Paddle configuration is only accessed when billing
      // enforcement is enabled or the status request failed.
      const clientConfig = getPaddleClientConfig();

      if (cancelled) {
        return;
      }

      setPaddleConfig(clientConfig);

      if (!clientConfig.ok) {
        setPaddleUnavailable(true);
        setError(clientConfig.error);
        return;
      }

      try {
        const { initializePaddle } =
          await import("@paddle/paddle-js");

        if (cancelled) {
          return;
        }

        const paddle = await initializePaddle({
          environment: clientConfig.environment,
          token: clientConfig.clientToken,

          eventCallback: (event) => {
            if (
              event?.name === "checkout.completed"
            ) {
              setNotice(
                "Payment completed in Paddle. Pro access will appear after the verified subscription webhook is processed.",
              );

              void refreshStatus().catch(
                () => undefined,
              );
            }
          },
        });

        if (cancelled) {
          return;
        }

        if (!paddle) {
          throw new Error(
            "Paddle.js could not be initialized.",
          );
        }

        paddleRef.current = paddle;

        // Preview each recurring interval separately.
        // Paddle transactions require a single billing interval.
        const [
          monthlyPreview,
          yearlyPreview,
        ] = await Promise.all([
          paddle.PricePreview({
            items: [
              {
                priceId:
                  clientConfig.monthlyPriceId,
                quantity: 1,
              },
            ],
          }),

          paddle.PricePreview({
            items: [
              {
                priceId:
                  clientConfig.yearlyPriceId,
                quantity: 1,
              },
            ],
          }),
        ]);

        const monthlyLine =
          monthlyPreview?.data?.details?.lineItems?.[0];

        const yearlyLine =
          yearlyPreview?.data?.details?.lineItems?.[0];

        if (cancelled) {
          return;
        }

        setPrices({
          monthly: String(
            monthlyLine?.formattedTotals?.total || "",
          ),

          yearly: String(
            yearlyLine?.formattedTotals?.total || "",
          ),
        });

        setPaddleUnavailable(false);
      } catch {
        if (!cancelled) {
          setPaddleUnavailable(true);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [refreshStatus]);

  async function startCheckout(
    selectedInterval: "monthly" | "yearly",
  ) {
    if (status?.enforced === false) {
      return;
    }

    setBusy(selectedInterval);
    setError("");
    setNotice("");

    try {
      const clientConfig = paddleConfig;

      if (!clientConfig?.ok) {
        throw new Error(
          clientConfig?.error ||
            "Paddle billing is currently unavailable.",
        );
      }

      if (!paddleRef.current) {
        throw new Error(
          getUnavailableMessage(clientConfig),
        );
      }

      const response = await fetch(
        "/api/billing/checkout",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            interval: selectedInterval,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Could not create checkout.",
        );
      }

      if (!data.transactionId) {
        throw new Error(
          "Paddle did not return a valid transaction.",
        );
      }

      paddleRef.current.Checkout.open({
        transactionId: data.transactionId,
        customer: {
          email: data.email,
        },
      });
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not open checkout.",
      );
    } finally {
      setBusy("");
    }
  }

  async function openPortal() {
    if (status?.enforced === false) {
      return;
    }

    setBusy("portal");
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/billing/portal",
        { method: "POST" },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Could not open subscription management.",
        );
      }

      if (!data.url) {
        throw new Error(
          "Paddle did not return a subscription management URL.",
        );
      }

      window.location.assign(data.url);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not open subscription management.",
      );
    } finally {
      setBusy("");
    }
  }

  async function refresh() {
    setBusy("refresh");
    setError("");

    try {
      const refreshed = await refreshStatus();

      setNotice(
        refreshed.enforced === false
          ? "Billing status refreshed."
          : "Plan status refreshed from Inlinked's verified subscription records.",
      );
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not refresh plan status.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="workspace billing-page">
      <header className="topbar">
        <div>
          <div className="eyebrow">
            ACCOUNT &amp; SUBSCRIPTION
          </div>

          <h1>Plans and billing</h1>

          <p className="muted">
            Choose the workspace plan that fits how you work.
          </p>
        </div>

        <a className="button secondary" href="/">
          Back to workspace
        </a>
      </header>

      {billingDormant && (
        <section
          className="panel billing-availability-notice"
          role="status"
        >
          <p className="muted">
            Paid plans are not available yet. Your current access is unchanged.
          </p>
        </section>
      )}

      <section className="panel billing-current">
        <div>
          <div className="eyebrow">
            CURRENT PLAN
          </div>

          <h2>
            {status?.plan === "pro"
              ? "Inlinked Pro"
              : status
                ? "Inlinked Free"
                : "Loading plan..."}
          </h2>

          <p className="muted">
            {status?.plan === "pro"
              ? status.planSource === "manual_grant" && status.grant?.endsAt
                ? "Pro until " + new Date(status.grant.endsAt).toLocaleDateString() + " (granted)."
                : "Your Pro access is active according to the latest verified Paddle subscription event."
              : "Your account is currently on the Free plan."}
          </p>

          {status?.subscription?.status && (
            <p className="muted">
              Latest subscription status:{" "}
              {status.subscription.status}
            </p>
          )}

          {status?.subscription?.currentPeriodEndsAt && (
            <p className="muted">
              Current period ends:{" "}
              {new Date(
                status.subscription.currentPeriodEndsAt,
              ).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="billing-current-actions">
          <button
            className="button secondary"
            onClick={() => void refresh()}
            disabled={busy === "refresh"}
          >
            {busy === "refresh"
              ? "Refreshing..."
              : "Refresh status"}
          </button>

          {status?.subscription && (
            <button
              className="button secondary"
              onClick={() => void openPortal()}
              disabled={
                billingDormant ||
                busy === "portal"
              }
            >
              {busy === "portal"
                ? "Opening..."
                : "Manage subscription"}
            </button>
          )}
        </div>
      </section>

      {notice && (
        <p className="billing-notice" role="status">
          {notice}
        </p>
      )}

      {!billingDormant && error && (
        <p className="billing-error" role="alert">
          {error}
        </p>
      )}

      {!billingDormant &&
        paddleUnavailable &&
        !error && (
          <p className="billing-warning" role="status">
            {paddleConfig
              ? getUnavailableMessage(paddleConfig)
              : "Paddle billing is currently unavailable. Please try again later."}
          </p>
        )}

      <section className="billing-plans">
        <article className="panel billing-plan">
          <div className="eyebrow">
            START HERE
          </div>

          <h2>Free</h2>

          <p className="muted">
            For organising an early prospecting workflow.
          </p>

          <ul>
            <li>Up to 70 LinkedIn prospects</li>
            <li>Up to 30 saved jobs</li>
            <li>No commercial leads</li>
            <li>Basic activity tracking</li>
            <li>CSV export</li>
          </ul>

          <div className="billing-plan-footer">
            <strong>Free</strong>

            <span className="muted">
              No subscription required
            </span>
          </div>
        </article>

        <article className="panel billing-plan billing-plan-pro">
          <div className="eyebrow">
            MORE CAPABILITY
          </div>

          <h2>Pro</h2>

          <p className="muted">
            For people using Inlinked as an active
            business-development workspace.
          </p>

          <ul>
            <li>Unlimited LinkedIn prospects</li>
            <li>Unlimited saved jobs</li>
            <li>Unlimited commercial leads</li>
            <li>Multiple lead profiles</li>
            <li>
              Full outreach history and analytics
            </li>
            <li>
              AI research handoff and record updates
            </li>
            <li>Advanced filtering and CSV export</li>
          </ul>

          <div
            className="billing-interval-switch"
            role="group"
            aria-label="Billing interval"
          >
            <button
              type="button"
              className={
                interval === "monthly" ? "active" : ""
              }
              aria-pressed={interval === "monthly"}
              onClick={() => setInterval("monthly")}
              disabled={billingDormant}
            >
              Monthly
            </button>

            <button
              type="button"
              className={
                interval === "yearly" ? "active" : ""
              }
              aria-pressed={interval === "yearly"}
              onClick={() => setInterval("yearly")}
              disabled={billingDormant}
            >
              Yearly
            </button>
          </div>

          <div className="billing-price-row">
            <div>
              <strong>
                {interval === "monthly"
                  ? prices.monthly || "—"
                  : prices.yearly || "—"}
              </strong>

              <span className="muted">
                {" "}/{" "}
                {interval === "monthly"
                  ? "month"
                  : "year"}
              </span>
            </div>

            <button
              className="button"
              onClick={() =>
                void startCheckout(interval)
              }
              disabled={
                billingDormant ||
                !paddleConfig?.ok ||
                paddleUnavailable ||
                !(interval === "monthly"
                  ? prices.monthly
                  : prices.yearly) ||
                busy !== "" ||
                status?.plan === "pro"
              }
            >
              {busy === interval
                ? "Opening..."
                : "Choose " + interval}
            </button>
          </div>

          {!billingDormant &&
            paddleConfig?.ok && (
              <p className="footnote">
                {paddleConfig.environment === "sandbox"
                  ? "Prices are displayed from Paddle's sandbox price preview."
                  : "Prices are displayed from Paddle's price preview."}
              </p>
            )}
        </article>
      </section>

      <section className="panel billing-legal-placeholder">
        <h3>Subscription terms</h3>

        <p className="muted">
          Our order process is conducted by our online reseller
          Paddle.com, the Merchant of Record. See our{" "}
          <a href="/terms">Terms of Service</a>,{" "}
          <a href="/privacy">Privacy Notice</a> and{" "}
          <a href="/refund">Refund Policy</a>.
        </p>
      </section>
    </main>
  );
}
