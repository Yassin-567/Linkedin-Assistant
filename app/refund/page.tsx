import LegalPage from "@/components/LegalPage";
import { LEGAL, val } from "@/lib/legal-config";

export const metadata = {
  title: "Refund Policy | Inlinked",
};

export default function Refund() {
  return (
    <LegalPage title="Refund Policy">
      <p>
        Effective date:{" "}November 27, 2026.
      </p>

      <p>
        For Paddle orders, our order process is conducted by our online reseller Paddle.com.
        Paddle.com is the Merchant of Record for Paddle orders.
      </p>

      <h2>1. Refund policy</h2>

      {LEGAL.refundPolicyMode === "paddle" ? (
        <p>
          Refund requests are handled in accordance with{" "}
          <a href="https://www.paddle.com/legal/refund-policy">
            Paddle's Refund Policy
          </a>.
          Nothing in this policy removes mandatory consumer
          rights that apply to your purchase.
        </p>
      ) : (
        <>
          <p>
            You may request a change-of-mind refund within
            30 days of the relevant purchase.
            This policy does not remove mandatory consumer
            rights that apply to your purchase.
          </p>

          <p>
            Treatment of subscription renewal payments:{" "}
            {LEGAL.refundRenewals === null
              ? "[OWNER TO CONFIRM] (decide whether the 30-day policy applies to renewals)."
              : LEGAL.refundRenewals
                ? "The 30-day refund period also applies to renewal payments."
                : "The 30-day change-of-mind period applies to initial purchases, not renewal payments. Mandatory consumer rights remain unaffected."}
          </p>
        </>
      )}

      <h2>2. How to request a refund</h2>

      <p>
        Submit a refund request through Paddle at{" "}
        <a href="https://paddle.net">paddle.net</a>,
        using the email address associated with your order.
      </p>

      <p>
        You can also contact us at{" "}
        {val(LEGAL.contactEmail)}
        {" "}(public contact email) if you need assistance
        locating the appropriate Paddle support channel.
      </p>

      <h2>3. Subscription cancellation</h2>

      <p>
        Open Plans &amp; billing in Inlinked and select
        Manage subscription to access Paddle's customer portal.
      </p>

      <p>
        Pro access follows the subscription status reported
        by Paddle. Active and trialing subscriptions receive
        Pro access. A scheduled cancellation remains active
        until the current subscription period ends.
      </p>

      <h2>4. PayPal subscriptions</h2>

      <p>
        If you choose PayPal at checkout, PayPal processes the
        recurring subscription payment. These payments are
        separate from Paddle orders.
      </p>

      <p>
        To stop future PayPal renewals, open your PayPal account,
        go to Settings, then Payments, then Subscriptions and saved
        businesses or Automatic Payments. Select Inlinked and cancel
        the automatic payment. Menu wording can vary by account.
      </p>

      <p>
        Inlinked updates the subscription after PayPal reports the
        cancellation. Where a current paid-through date is available,
        Pro access continues until that date. If no paid-through date
        is available, access may end when the cancellation is processed.
        Cancelling stops future renewals; it does not itself refund a
        payment that has already been completed.
      </p>

      <p>
        To ask about a refund for a completed PayPal payment, contact
        us at{" "}
        <a href={LEGAL.contactEmail ? `mailto:${LEGAL.contactEmail}` : undefined}>
          {val(LEGAL.contactEmail)}
        </a>
        . Include the email address for your Inlinked account and the
        relevant PayPal transaction details. PayPal refunds are not
        automatic, and this policy does not promise a refund or a
        particular processing time. Mandatory consumer rights remain
        unaffected.
      </p>
    </LegalPage>
  );
}
