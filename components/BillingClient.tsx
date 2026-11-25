"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Paddle } from "@paddle/paddle-js";
import { PADDLE_MONTHLY_PRICE_ID, PADDLE_YEARLY_PRICE_ID } from "@/lib/paddle-client-config";

type BillingStatus = {
  plan: "free" | "pro";
  subscription: null | { status: string; currentPeriodEndsAt?: string | null; scheduledChange?: unknown; priceId?: string };
  entitlements: { prospects: number | null; savedJobs: number | null; leadProfiles: number | null; features: Record<string, boolean> };
};
type PriceDisplay = { monthly: string; yearly: string };

export default function BillingClient() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [prices, setPrices] = useState<PriceDisplay>({ monthly: "", yearly: "" });
  const [busy, setBusy] = useState<"monthly" | "yearly" | "portal" | "refresh" | "">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const paddleRef = useRef<Paddle | null>(null);
  const [paddleUnavailable, setPaddleUnavailable] = useState(false);
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "";

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/billing/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load billing status.");
    setStatus(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        if (!clientToken.startsWith("test_")) {
          setPaddleUnavailable(true);
          return;
        }
        const { initializePaddle } = await import("@paddle/paddle-js");
        const paddle = await initializePaddle({
          environment: "sandbox",
          token: clientToken,
          eventCallback: (event: any) => {
            if (event?.name === "checkout.completed") {
              setNotice("Payment completed in Paddle. Pro access will appear after the verified subscription webhook is processed.");
              void refreshStatus().catch(() => undefined);
            }
          }
        });
        if (cancelled) return;
        if (!paddle) throw new Error("Paddle.js could not be initialized.");
        paddleRef.current = paddle;
        // Preview each recurring interval separately; Paddle transactions require a single billing interval.
        const [monthlyPreview, yearlyPreview] = await Promise.all([
          paddle.PricePreview({ items: [{ priceId: PADDLE_MONTHLY_PRICE_ID, quantity: 1 }] }),
          paddle.PricePreview({ items: [{ priceId: PADDLE_YEARLY_PRICE_ID, quantity: 1 }] })
        ]);
        const monthlyLine = monthlyPreview?.data?.details?.lineItems?.[0];
        const yearlyLine = yearlyPreview?.data?.details?.lineItems?.[0];
        if (!cancelled) setPrices({
          monthly: String(monthlyLine?.formattedTotals?.total || ""),
          yearly: String(yearlyLine?.formattedTotals?.total || "")
        });
      } catch {
        if (!cancelled) setPaddleUnavailable(true);
      }
    }
    void initialize();
    void refreshStatus().catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load billing status."); });
    return () => { cancelled = true; };
  }, [clientToken, refreshStatus]);

  async function startCheckout(interval: "monthly" | "yearly") {
    setBusy(interval); setError(""); setNotice("");
    try {
      if (!paddleRef.current) throw new Error("Paddle sandbox is not configured yet.");
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create checkout.");
      paddleRef.current.Checkout.open({ transactionId: data.transactionId, customer: { email: data.email } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open checkout.");
    } finally { setBusy(""); }
  }

  async function openPortal() {
    setBusy("portal"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not open subscription management.");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open subscription management.");
    } finally { setBusy(""); }
  }

  async function refresh() {
    setBusy("refresh"); setError("");
    try { await refreshStatus(); setNotice("Plan status refreshed from Inlinked's verified subscription records."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not refresh plan status."); }
    finally { setBusy(""); }
  }

  return (
    <main className="workspace billing-page">
      <header className="topbar">
        <div><div className="eyebrow">ACCOUNT & SUBSCRIPTION</div><h1>Plans and billing</h1><p className="muted">Choose the workspace plan that fits how you work.</p></div>
        <a className="button secondary" href="/">Back to workspace</a>
      </header>

      <section className="panel billing-current">
        <div>
          <div className="eyebrow">CURRENT PLAN</div>
          <h2>{status?.plan === "pro" ? "Inlinked Pro" : status ? "Inlinked Free" : "Loading plan..."}</h2>
          <p className="muted">{status?.plan === "pro" ? "Your Pro access is active according to the latest verified Paddle subscription event." : "Your account is currently on the Free plan."}</p>
          {status?.subscription?.status && <p className="muted">Latest subscription status: {status.subscription.status}</p>}
          {status?.subscription?.currentPeriodEndsAt && <p className="muted">Current period ends: {new Date(status.subscription.currentPeriodEndsAt).toLocaleDateString()}</p>}
        </div>
        <div className="billing-current-actions">
          <button className="button secondary" onClick={() => void refresh()} disabled={busy === "refresh"}>{busy === "refresh" ? "Refreshing..." : "Refresh status"}</button>
          {status?.plan === "pro" && <button className="button secondary" onClick={() => void openPortal()} disabled={busy === "portal"}>{busy === "portal" ? "Opening..." : "Manage subscription"}</button>}
        </div>
      </section>

      {notice && <p className="billing-notice" role="status">{notice}</p>}
      {error && <p className="billing-error" role="alert">{error}</p>}
      {paddleUnavailable && <p className="billing-warning" role="status">Paddle sandbox is not configured for this preview yet. Add the sandbox client token to this preview deployment to load Paddle's current price previews and checkout.</p>}

      <section className="billing-plans">
        <article className="panel billing-plan">
          <div className="eyebrow">START HERE</div><h2>Free</h2>
          <p className="muted">For organising an early prospecting workflow.</p>
          <ul>
            <li>Up to 100 saved LinkedIn prospects</li>
            <li>Basic activity tracking</li><li>CSV export</li>
            <li>Saved-job and lead-profile limits are still being finalised</li>
          </ul>
          <div className="billing-plan-footer"><strong>Free</strong><span className="muted">No subscription required</span></div>
        </article>
        <article className="panel billing-plan billing-plan-pro">
          <div className="eyebrow">MORE CAPABILITY</div><h2>Pro</h2>
          <p className="muted">For people using Inlinked as an active business-development workspace.</p>
          <ul>
            <li>Higher prospect and saved-job limits (final caps to be confirmed)</li>
            <li>Multiple lead profiles</li>
            <li>Full outreach history and analytics</li>
            <li>AI research handoff and record updates</li>
            <li>Advanced filtering and exports</li>
            <li>More saved professional context</li>
          </ul>
          <div className="billing-price-row">
            <div><strong>{prices.monthly || "—"}</strong><span className="muted"> / month</span></div>
            <button className="button" onClick={() => void startCheckout("monthly")} disabled={!prices.monthly || busy !== "" || status?.plan === "pro"}>{busy === "monthly" ? "Opening..." : "Choose monthly"}</button>
          </div>
          <div className="billing-price-row">
            <div><strong>{prices.yearly || "—"}</strong><span className="muted"> / year</span></div>
            <button className="button secondary" onClick={() => void startCheckout("yearly")} disabled={!prices.yearly || busy !== "" || status?.plan === "pro"}>{busy === "yearly" ? "Opening..." : "Choose yearly"}</button>
          </div>
          <p className="footnote">Prices are displayed from Paddle's sandbox price preview, including localized totals and tax returned by Paddle.</p>
        </article>
      </section>

      <section className="panel billing-legal-placeholder">
        <h3>Subscription terms</h3>
        <p className="muted">Terms of Service, Privacy Policy and Refund Policy links are placeholders for the sandbox build. They must be completed and reviewed before a live launch.</p>
      </section>
    </main>
  );
}
