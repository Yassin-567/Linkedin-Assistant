import Link from "next/link";

export const metadata = {
  title: "Pricing | Inlinked",
  description: "Simple, transparent plans for the Inlinked prospect and outreach tracker.",
};

const freeFeatures = [
  "Up to 70 LinkedIn prospects",
  "Up to 30 saved jobs",
  "No commercial leads",
  "Basic activity tracking",
  "CSV export",
];

const proFeatures = [
  "Unlimited LinkedIn prospects",
  "Unlimited saved jobs",
  "Unlimited commercial leads",
  "Full outreach history and analytics",
  "Multiple lead profiles",
  "AI research handoff and record updates",
  "Advanced filtering and CSV export",
];

export default function PricingPage() {
  return (
    <main className="workspace billing-page">
      <header className="topbar">
        <div>
          <div className="eyebrow">SIMPLE, TRANSPARENT PLANS</div>
          <h1>Inlinked pricing</h1>
          <p className="muted">
            A tracker for saved public jobs, public profiles and leads, plus your own outreach log.
          </p>
        </div>
        <Link className="button secondary" href="/login">Sign in</Link>
      </header>

      <section className="panel">
        <h2>Keep your pipeline organised</h2>
        <p className="muted">
          Inlinked helps you save and organise information you find in public sources and record your own follow-ups.
          It is not connected to LinkedIn or any social network, and it does not send messages.
        </p>
      </section>

      <section className="billing-plans" aria-label="Available plans">
        <article className="panel billing-plan">
          <div>
            <div className="eyebrow">START FREE</div>
            <h2>Free</h2>
            <p className="muted">A practical starting point for keeping track of prospects and activity.</p>
            <div className="billing-price-row">
              <strong>$0</strong>
              <span className="muted">Forever</span>
            </div>
            <ul>
              {freeFeatures.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          </div>
          <div className="billing-plan-footer">
            <Link className="button secondary" href="/login">Get started</Link>
          </div>
        </article>

        <article className="panel billing-plan billing-plan-pro">
          <div>
            <div className="eyebrow">MORE ROOM TO GROW</div>
            <h2>Inlinked Pro</h2>
            <p className="muted">More insight and flexibility for a growing pipeline.</p>
            <div className="billing-price-row">
              <strong>$8 <small>/ month</small></strong>
              <span className="muted">or $79 / year</span>
            </div>
            <ul>
              {proFeatures.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          </div>
          <div className="billing-plan-footer">
            <Link className="button" href="/login">Get started</Link>
          </div>
        </article>
      </section>

      <section className="panel">
        <h2>Payments and policies</h2>
        <p className="muted">
          When paid subscriptions are available, billing and payment processing are handled by Paddle, our Merchant of Record.
        </p>
        <p className="muted">
          Review the <Link href="/terms">Terms</Link>, <Link href="/privacy">Privacy Notice</Link> and <Link href="/refund">Refund Policy</Link>.
        </p>
      </section>

      <footer className="login-footer">
        Inlinked <span>·</span> <Link href="/terms">Terms</Link> <span>·</span> <Link href="/privacy">Privacy</Link> <span>·</span> <Link href="/refund">Refunds</Link>
      </footer>
    </main>
  );
}
