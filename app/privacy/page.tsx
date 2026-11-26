import LegalPage from "@/components/LegalPage";
import { LEGAL, val } from "@/lib/legal-config";

export const metadata = {
  title: "Privacy Notice | Inlinked",
};

export default function Privacy() {
  return (
    <LegalPage title="Privacy Notice">
      <p>
        Effective date:{" "}
        {val(LEGAL.effectiveDate)}
        {" "}(date of publication).
      </p>

      <h2>1. Who is responsible</h2>

      <p>
        Inlinked is operated by Yassin Alaa Aly,
        an individual seller trading as Inlinked.
      </p>

      <p>
        Postal address:{" "}
        {val(LEGAL.postalAddress)}
        {" "}(seller's full postal address).
      </p>

      <p>
        Privacy contact:{" "}
        {val(LEGAL.contactEmail)}
        {" "}(public privacy contact email).
      </p>

      <p>
        Yassin Alaa Aly is the controller of personal data
        processed through Inlinked for operating your account
        and workspace.
      </p>

      <p>
        Paddle acts as an independent controller in relation
        to buyer information it processes for its own services
        as Merchant of Record. This is described in Section 14
        of Paddle's{" "}
        <a href="https://www.paddle.com/legal/terms">
          Master Services Agreement
        </a>.
        For information about Paddle's own processing, see
        its{" "}
        <a href="https://www.paddle.com/legal/privacy">
          Privacy Notice
        </a>.
      </p>

      <h2>2. Personal data we store</h2>

      <ul>
        <li>
          <strong>Google sign-in and account information:</strong>
          {" "}email address, name and profile picture obtained
          through Google sign-in.
          The application requests the OpenID Connect scopes
          openid, email and profile.
          We use this information to identify you, create
          your account, authenticate sign-in and administer
          your account.
        </li>

        <li>
          <strong>Workspace information:</strong>
          {" "}professional context, prospect and lead records,
          job records and outreach logs that you enter or
          authorize an outside AI assistant to save to
          your account.
          These records may contain information about other
          individuals that you choose to enter.
          We use this information to store, organize and
          display the records and workspace functions
          you request.
        </li>

        <li>
          <strong>AI access tokens:</strong>
          {" "}access tokens used to authorize record-saving
          requests.
          These tokens are stored as hashes and are used
          to authenticate authorized requests to save
          records to your account.
        </li>

        <li>
          <strong>Billing and subscription information:</strong>
          {" "}Paddle customer and subscription identifiers,
          email address, name, plan, subscription status
          and renewal dates.
          We use these details to administer subscriptions
          and determine the access level associated with
          your account.
          Inlinked does not store payment-card details.
        </li>

        <li>
          <strong>Session information:</strong>
          {" "}the application uses one encrypted session
          cookie to maintain your signed-in session.
        </li>
      </ul>

      <h2>3. Why we use personal data</h2>

      <p>
        We use account information to create and administer
        your account, authenticate sign-in and provide
        the service you request.
      </p>

      <p>
        We use workspace information to store, organize
        and display the professional context, prospects,
        leads, jobs and outreach records associated with
        your account.
      </p>

      <p>
        We use access tokens to authenticate authorized
        record-saving requests and protect your workspace
        against unauthorized requests.
      </p>

      <p>
        We use billing and subscription information to
        administer subscriptions, determine plan access
        and maintain necessary billing information.
      </p>

      <p>
        Where a legal basis is required by applicable law,
        the relevant basis depends on the processing purpose.
        These purposes commonly include:
      </p>

      <ul>
        <li>
          Providing the service and account functions
          you request, including taking steps necessary
          to provide those services.
        </li>
        <li>
          Maintaining service security, preventing misuse
          and protecting accounts and systems, based on
          legitimate interests where recognized by
          applicable law.
        </li>
        <li>
          Meeting applicable legal obligations, including
          obligations relating to required records and
          transactions.
        </li>
      </ul>

      <h2>4. Services and recipients</h2>

      <p>
        We use the following services to operate Inlinked:
      </p>

      <ul>
        <li>
          <strong>Vercel:</strong>
          {" "}hosting service provider.
          Vercel provides the hosting infrastructure used
          to operate Inlinked.
          Its published{" "}
          <a href="https://vercel.com/legal/dpa">
            Data Processing Addendum
          </a>
          {" "}describes its data-processing commitments
          and subprocessor arrangements.
        </li>

        <li>
          <strong>Neon:</strong>
          {" "}database service provider.
          Neon provides the PostgreSQL database used
          by Inlinked.
          Its published{" "}
          <a href="https://neon.com/pdf/DPA.pdf">
            Data Processing Agreement
          </a>
          {" "}describes its data-processing commitments
          and subprocessor arrangements.
        </li>

        <li>
          <strong>Google:</strong>
          {" "}provides Google sign-in.
          Google receives the information required for
          the authentication process.
          The application requests the openid, email
          and profile scopes.
        </li>

        <li>
          <strong>Paddle:</strong>
          {" "}acts as our online reseller and Merchant
          of Record.
          Paddle independently handles buyer information
          for its own services.
          Its{" "}
          <a href="https://www.paddle.com/legal/privacy">
            Privacy Notice
          </a>
          {" "}explains its handling of that information.
        </li>
      </ul>

      <p>
        When you use an outside AI assistant, its provider
        handles information you submit to it under its
        own terms and privacy practices.
        Inlinked receives authenticated record-saving
        requests made through the access token you authorize.
      </p>

      <p>
        We may also disclose personal data where disclosure
        is required by applicable law.
      </p>

      <h2>5. International processing</h2>

      <p>
        Our hosting and database service providers may
        process data in the United States and other
        jurisdictions where they or their subprocessors
        maintain operations.
      </p>

      <p>
        Vercel's published{" "}
        <a href="https://vercel.com/legal/dpa">
          Data Processing Addendum
        </a>
        {" "}states that its primary processing facilities
        are in the United States.
        It also explains that Vercel may transfer and
        process customer data in other locations where
        Vercel or its subprocessors maintain data-processing
        operations.
      </p>

      <p>
        Neon's published{" "}
        <a href="https://neon.com/pdf/DPA.pdf">
          Data Processing Agreement
        </a>
        {" "}states that personal data may be transferred
        to and processed by Neon, Inc. in the United States
        and in other jurisdictions where Neon and its
        subprocessors operate.
        The agreement describes applicable international
        transfer mechanisms, including the Data Privacy
        Framework and Standard Contractual Clauses where
        relevant.
      </p>

      <h2>6. Data retention</h2>

      <p>
        We retain personal data for as long as necessary
        to provide the service and meet applicable legal
        obligations.
        The specific retention periods are:
      </p>

      <ul>
        <li>
          While an account is active:
          {" "}{val(LEGAL.retentionWhileAccountActive)}
          {" "}(retention period).
        </li>

        <li>
          Following account closure:
          {" "}{val(LEGAL.retentionAfterAccountClosure)}
          {" "}(deletion or retention period).
        </li>

        <li>
          Backups and retained copies:
          {" "}{val(LEGAL.backupRetention)}
          {" "}(backup retention period).
        </li>

        <li>
          Billing information held by Inlinked:
          {" "}{val(LEGAL.billingRetention)}
          {" "}(billing retention period).
        </li>
      </ul>

      <h2>7. Your privacy rights</h2>

      <p>
        Depending on the laws applicable to you, you may
        have rights to request access to, correction of
        or deletion of personal data, restriction of
        processing, data portability and objection to
        certain processing.
      </p>

      <p>
        You may also have the right to withdraw consent
        where consent is the basis for processing and
        to complain to a relevant data protection authority.
      </p>

      <p>
        To exercise a privacy right or ask a question,
        contact{" "}
        {val(LEGAL.contactEmail)}
        {" "}(public privacy contact email).
        Requests will be handled in accordance with
        applicable law.
      </p>

      <h2>8. Cookies and similar technologies</h2>

      <p>
        Inlinked's application code uses one encrypted
        session cookie to maintain your signed-in session.
      </p>

      <p>
        No analytics or advertising scripts are configured
        in the application's code.
      </p>

      <p>
        Whether additional cookies or storage technologies
        are introduced by external services or integrations:
        {" "}{val(LEGAL.additionalCookieDetails)}
        {" "}(confirm whether any additional technologies
        are used).
      </p>

      <h2>9. Security</h2>

      <p>
        Confirmed application-level safeguards include
        storing AI access tokens as hashes and using
        an encrypted session cookie.
      </p>

      <p>
        Our hosting and database providers publish
        information about their own security and
        data-protection practices:
        {" "}
        <a href="https://security.vercel.com">
          Vercel Trust Center
        </a>
        {" "}and{" "}
        <a href="https://neon.com/pdf/DPA.pdf">
          Neon Data Processing Agreement
        </a>.
      </p>

      <p>
        No internet-based system can be guaranteed
        to be completely secure.
      </p>

      <h2>10. Contact</h2>

      <p>
        For privacy questions or requests, contact:
        {" "}{val(LEGAL.contactEmail)}
        {" "}(public privacy contact email).
      </p>
    </LegalPage>
  );
}
