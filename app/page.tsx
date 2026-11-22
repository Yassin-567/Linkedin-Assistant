"use client";

import { useEffect, useState } from "react";

type Lead = { status: string };
type BusinessLead = { status: string };
type Account = { connected: boolean; profile?: { name?: string; email?: string } };

export default function Home() {
  const [account, setAccount] = useState<Account>({ connected: false });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [businessLeads, setBusinessLeads] = useState<BusinessLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const user = await response.json();
        if (cancelled) return;
        setAccount(user);
        if (user.connected) {
          const [prospectsResponse, leadsResponse] = await Promise.all([
            fetch("/api/prospects", { cache: "no-store" }),
            fetch("/api/leads", { cache: "no-store" })
          ]);
          if (prospectsResponse.ok) {
            const data = await prospectsResponse.json();
            if (!cancelled) setLeads(Array.isArray(data.leads) ? data.leads : []);
          }
          if (leadsResponse.ok) {
            const data = await leadsResponse.json();
            if (!cancelled) setBusinessLeads(Array.isArray(data.leads) ? data.leads : []);
          }
        } else {
          const stored = JSON.parse(localStorage.getItem("linkedin-assistant-leads") || "[]");
          if (!cancelled) setLeads(Array.isArray(stored) ? stored : []);
        }
      } catch (error) {
        console.error("Could not load dashboard summary", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const firstName = account.profile?.name?.split(" ")[0] || "there";
  const ready = leads.filter(item => item.status === "Ready to contact").length;
  const contacted = leads.filter(item => item.status === "Contacted").length;
  const meetings = leads.filter(item => item.status === "Call booked").length;
  const qualified = businessLeads.filter(item => item.status === "Qualified").length;
  const inDiscussion = businessLeads.filter(item => item.status === "In discussion" || item.status === "Proposal").length;
  const won = businessLeads.filter(item => item.status === "Won").length;

  return (
    <main className="workspace dashboard-workspace">
      <header className="dashboard-welcome">
        <div>
          <div className="eyebrow">WORKSPACE OVERVIEW</div>
          <h1>Good to see you, {firstName}</h1>
          <p className="muted">A clear view of your relationships, opportunities and next steps.</p>
        </div>
        <div className="dashboard-welcome-actions">
          <span className={account.connected ? "connection connected" : "connection"}>{account.connected ? "Account connected" : "Sign in required"}</span>
          {!account.connected && <a className="button" href="/api/auth/google">Sign in with Google</a>}
        </div>
      </header>

      <section className="dashboard-section" aria-labelledby="prospect-pipeline-title">
        <div className="dashboard-section-heading">
          <div><h2 id="prospect-pipeline-title">LinkedIn prospect pipeline</h2><p>Track the people you have discovered and the conversations you are building.</p></div>
          <a className="text-link" href="/prospects">View prospects <span aria-hidden="true">→</span></a>
        </div>
        <div className="stats dashboard-kpis">
          <div className="stat"><span>Saved prospects</span><strong>{loading ? "—" : leads.length}</strong></div>
          <div className="stat"><span>Ready to contact</span><strong>{loading ? "—" : ready}</strong></div>
          <div className="stat"><span>Contacted</span><strong>{loading ? "—" : contacted}</strong></div>
          <div className="stat"><span>Calls booked</span><strong>{loading ? "—" : meetings}</strong></div>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="commercial-pipeline-title">
        <div className="dashboard-section-heading">
          <div><h2 id="commercial-pipeline-title">Commercial opportunities</h2><p>Keep business leads separate from individual LinkedIn prospects.</p></div>
          <a className="text-link" href="/leads">Open commercial leads <span aria-hidden="true">→</span></a>
        </div>
        <div className="stats dashboard-kpis dashboard-kpis-secondary">
          <div className="stat"><span>All opportunities</span><strong>{loading ? "—" : businessLeads.length}</strong></div>
          <div className="stat"><span>Qualified</span><strong>{loading ? "—" : qualified}</strong></div>
          <div className="stat"><span>In discussion</span><strong>{loading ? "—" : inDiscussion}</strong></div>
          <div className="stat"><span>Customers won</span><strong>{loading ? "—" : won}</strong></div>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="next-work-title">
        <div className="dashboard-section-heading">
          <div><h2 id="next-work-title">Where would you like to focus?</h2><p>Go straight to the part of your workflow you want to move forward.</p></div>
        </div>
        <div className="dashboard-actions">
          <a className="dashboard-action primary" href="/leads">
            <span className="dashboard-action-icon" aria-hidden="true">01</span>
            <strong>Find commercial leads</strong>
            <small>Discover businesses that may need your product or service. Build a focused, qualified pipeline.</small>
            <span className="dashboard-action-link">Explore leads <span aria-hidden="true">→</span></span>
          </a>
          <a className="dashboard-action" href="/prospects">
            <span className="dashboard-action-icon" aria-hidden="true">02</span>
            <strong>Manage LinkedIn prospects</strong>
            <small>Review saved professionals, update relationship stages and keep important context together.</small>
            <span className="dashboard-action-link">Open prospects <span aria-hidden="true">→</span></span>
          </a>
          <a className="dashboard-action" href="/outreach">
            <span className="dashboard-action-icon" aria-hidden="true">03</span>
            <strong>Plan your outreach</strong>
            <small>Prepare messages, record conversations and keep follow-up activity organised.</small>
            <span className="dashboard-action-link">Open outreach <span aria-hidden="true">→</span></span>
          </a>
          <a className="dashboard-action" href="/jobs">
            <span className="dashboard-action-icon" aria-hidden="true">04</span>
            <strong>Review job opportunities</strong>
            <small>Keep relevant roles, applications and hiring progress in one place.</small>
            <span className="dashboard-action-link">View jobs <span aria-hidden="true">→</span></span>
          </a>
        </div>
      </section>

      <section className="dashboard-bottom-row">
        <div><h2>Make the workspace yours</h2><p>Set your target markets, research preferences, professional context and assistant connection.</p></div>
        <a className="button secondary" href="/settings">Review settings</a>
      </section>
      <footer>Inlinked · Business development workspace</footer>
    </main>
  );
}
