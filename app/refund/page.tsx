import LegalPage from "@/components/LegalPage";
import { LEGAL, val } from "@/lib/legal-config";

export const metadata = {
  title: "Refund Policy | Inlinked",
};

export default function Refund() {
  return (
    <LegalPage title="Refund Policy">
      <p>
        Effective date:{" "}
        {val(LEGAL.effectiveDate)}
        {" "}(date of publication).
      </p>

      <p>
        Our order process is conducted by our online reseller Paddle.com.
        Paddle.com is the Merchant of Record for all our orders.
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
    </LegalPage>
  );
}
