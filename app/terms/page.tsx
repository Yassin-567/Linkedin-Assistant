import LegalPage from "@/components/LegalPage";
import { LEGAL, val } from "@/lib/legal-config";

export const metadata = {
  title: "Terms of Service | Inlinked",
};

export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        Effective date:{" "}November 26, 2026.
      </p>

      <h2>1. Who we are</h2>

      <p>
        Inlinked is operated by Yassin Alaa Aly,
        trading as Inlinked ("we", "us" or "our").
      </p>

      <p>
        Contact:{" "}
        {val(LEGAL.contactEmail)}
        {" "}(public contact email).
      </p>

      <h2>2. Acceptance</h2>

      <p>
        By accessing or using Inlinked, you agree to these Terms.
        If you do not agree, do not use the service.
      </p>

      <h2>3. The service</h2>

      <p>
        Inlinked is a per-user workspace for managing professional
        context, prospects, commercial leads, jobs and outreach
        records. Each user's records are associated with their
        own account.
      </p>

      <p>
        Inlinked does not search LinkedIn or the web itself.
        It does not send messages automatically or on your behalf.
      </p>

      <p>
        You may authorize an outside AI assistant to save records
        to your Inlinked account using an access token.
        We do not operate or control that outside assistant
        or its outputs.
      </p>

      <p>
        Outside AI assistant providers have their own terms
        and privacy practices, which apply to your use of
        those services.
      </p>

      <h2>4. Your responsibilities and acceptable use</h2>

      <p>
        You are responsible for the information and records
        you submit, including information about other people,
        and for how you use that information in your professional
        activities and outreach.
      </p>

      <p>
        You must comply with applicable laws and third-party
        terms governing your activities and your use of
        information about other people.
      </p>

      <p>
        You must keep your access tokens private and must not
        share them with unauthorized people or services.
      </p>

      <p>You must not use Inlinked for:</p>

      <ul>
        <li>Unlawful activities, fraud or spam.</li>
        <li>
          Infringing intellectual property rights or
          violating other people's rights.
        </li>
        <li>
          Introducing malware or attempting unauthorized
          access to the service.
        </li>
        <li>
          Unauthorized security probing, scraping or
          overloading the service.
        </li>
        <li>
          Interfering with the security or normal operation
          of Inlinked.
        </li>
      </ul>

      <h2>5. Plans, payments and subscriptions</h2>

      <p>
        Inlinked offers a Free plan and a paid Pro plan.
        Pro is priced at $8 per month or $79 per year.
        The selected billing option and applicable checkout
        details are presented during purchase.
      </p>

      <p>
        Our order process is conducted by our online reseller Paddle.com.
        Paddle.com is the Merchant of Record for all our orders.
      </p>

      <p>
        Payment, billing, subscription renewal and cancellation
        terms are also governed by{" "}
        <a href="https://www.paddle.com/legal/checkout-buyer-terms">
          Paddle's Buyer Terms
        </a>.
      </p>

      <p>
        To manage your subscription, open Plans &amp; billing
        in Inlinked and select Manage subscription.
        This opens Paddle's customer portal.
      </p>

      <p>
        Pro access follows the subscription status received
        from Paddle. Active and trialing subscriptions receive
        Pro access. A scheduled cancellation remains active
        until the subscription period ends. Access changes
        when Paddle reports a subscription status that no
        longer qualifies for Pro.
      </p>

      <h2>6. Refunds</h2>

      <p>
        Please see our{" "}
        <a href="/refund">Refund Policy</a>.
        Nothing in that policy or these Terms excludes
        mandatory consumer rights.
      </p>

      <h2>7. Intellectual property and your content</h2>

      <p>
        Inlinked's software, interface, branding and other
        service materials are protected by applicable
        intellectual property rights. These Terms do not
        transfer ownership of those materials to you.
        Rights belonging to third parties remain with
        their respective rights holders.
      </p>

      <p>
        You retain the rights you hold in the information
        and content you submit to Inlinked.
      </p>

      <p>
        By submitting content, you authorize us to host,
        store, process and display it to the extent needed
        to provide and operate the service and the workspace
        functions you request.
      </p>

      <h2>8. Availability and service level</h2>

      <p>
        We do not guarantee uninterrupted availability
        or that Inlinked will always be free from errors
        or interruptions.
      </p>

      <p>
        No specific uptime percentage or support response
        time is promised by these Terms.
      </p>

      <h2>9. Suspension and termination</h2>

      <p>
        We may suspend or terminate access where reasonably
        necessary because of a material breach of these Terms,
        non-payment, suspected fraud, security risks, unlawful
        activity or repeated or serious violations of these
        Terms.
      </p>

      <h2>10. Changes to these Terms</h2>

      <p>
        We may update these Terms from time to time.
        Updated Terms will be published on this page.
      </p>

      <h2>11. Contact</h2>

      <p>
        Questions about these Terms can be sent to{" "}
        {val(LEGAL.contactEmail)}
        {" "}(public contact email).
      </p>
    </LegalPage>
  );
}
