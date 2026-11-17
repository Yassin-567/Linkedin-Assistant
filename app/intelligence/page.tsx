"use client";
import { useEffect, useState } from "react";

type Lead = { id: string; name: string; company: string; url: string; notes?: string };
type Report = {
  companySnapshot?: string;
  signals?: { category?: string; observation?: string; whyItMatters?: string; evidenceUrls?: string[]; confidence?: string }[];
  likelyPainPoints?: { hypothesis?: string; reason?: string; evidenceUrls?: string[]; confidence?: string }[];
  opportunities?: { opportunity?: string; whyNow?: string; evidenceUrls?: string[] }[];
  personalizedReasonToContact?: string;
  valueProposition?: string;
  outreachAngle?: string;
  researchGaps?: string[];
};
type Source = { category: string; title: string; url: string; snippet: string };

export default function IntelligencePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [prospectId, setProspectId] = useState("");
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    fetch("/api/prospects", { cache: "no-store" }).then(async r => {
      if (r.status === 401) { location.href = "/login"; return; }
      const data = await r.json();
      if (r.ok) setLeads(Array.isArray(data.leads) ? data.leads : []);
      else setError(data.error || "Could not load prospects.");
    }).catch(() => setError("Could not load prospects.")).finally(() => setLoading(false));
  }, []);

  async function loadSaved(id: string) {
    if (!id) return;
    try {
      const r = await fetch("/api/lead-intelligence?prospectId=" + encodeURIComponent(id), { cache: "no-store" });
      const d = await r.json();
      if (r.ok && d.intelligence) {
        setReport(d.intelligence.report || null);
        setSources(Array.isArray(d.intelligence.sources) ? d.intelligence.sources : []);
        setSavedAt(d.intelligence.researched_at || "");
      } else { setReport(null); setSources([]); setSavedAt(""); }
    } catch { setReport(null); setSources([]); setSavedAt(""); }
  }

  function selectLead(id: string) {
    setProspectId(id);
    const lead = leads.find(x => x.id === id);
    if (lead) {
      setCompany(lead.company || "");
      setContactName(lead.name || "");
      setProfileUrl(lead.url || "");
      setError("");
      setReport(null); setSources([]); setSavedAt("");
      void loadSaved(id);
    } else {
      setCompany(""); setContactName(""); setProfileUrl("");
      setReport(null); setSources([]); setSavedAt("");
    }
  }

  async function research(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setReport(null); setSources([]);
    try {
      const response = await fetch("/api/lead-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: prospectId || undefined, company, contactName, profileUrl })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Research failed.");
      setReport(data.report || null);
      setSources(Array.isArray(data.sources) ? data.sources : []);
      setSavedAt(data.researchedAt || "");
    } catch (err) { setError(err instanceof Error ? err.message : "Research failed."); }
    finally { setBusy(false); }
  }

  function sourceLinks(urls?: string[]) {
    if (!urls?.length) return null;
    return <div className="suggestions">{urls.map(url => {
      const source = sources.find(x => x.url === url);
      return <a className="suggestion" href={url} target="_blank" rel="noreferrer" key={url}>{source?.title || url} ↗</a>;
    })}</div>;
  }

  return <main className="workspace">
    <header className="topbar"><div><div className="eyebrow">PHASE 4 · COMPANY RESEARCH</div><h1>AI Lead Intelligence</h1><p className="muted">Understand the business before contacting its decision-makers.</p></div><a className="button secondary" href="/">Back to pipeline</a></header>
    <section className="panel">
      <h2>Research a company</h2>
      <p className="muted">Choose a saved prospect or enter a company manually. The app searches public company, hiring, growth and operational signals, then creates an evidence-led report.</p>
      <form className="lead-form" onSubmit={research}>
        <label className="wide">Saved prospect (optional)<select value={prospectId} onChange={e => selectLead(e.target.value)}><option value="">Enter a company manually</option>{leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name} · {lead.company}</option>)}</select></label>
        <label>Company name *<input required value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" /></label>
        <label>Decision-maker name<input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Optional" /></label>
        <label className="wide">Public LinkedIn profile URL<input value={profileUrl} onChange={e => setProfileUrl(e.target.value)} placeholder="https://www.linkedin.com/in/..." /></label>
        <div className="wide form-footer"><span className="muted">Research uses public search results and your confirmed professional context.</span><button disabled={busy || loading || !company.trim()}>{busy ? "Researching company..." : "Research this lead"}</button></div>
      </form>
      {error && <p className="status" role="alert">{error}</p>}
      {savedAt && <p className="status">Report last researched: {new Date(savedAt).toLocaleString()}</p>}
    </section>

    {report && <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">RESEARCH REPORT</div><h2>{company}</h2></div><span className="muted">Evidence-led AI analysis</span></div>
      <h3>Company snapshot</h3><p>{report.companySnapshot || "Not enough public evidence to summarize this company."}</p>
      <h3>Business signals</h3>
      {report.signals?.length ? <div className="lead-list">{report.signals.map((item, i) => <article className="lead" key={i}><div><strong>{item.category || "Signal"} · {item.confidence || "Unrated"} confidence</strong><p>{item.observation}</p><p className="muted">{item.whyItMatters}</p>{sourceLinks(item.evidenceUrls)}</div></article>)}</div> : <p className="muted">No strong public signals were identified.</p>}
      <h3>Possible pain points (hypotheses, not confirmed facts)</h3>
      {report.likelyPainPoints?.length ? <div className="lead-list">{report.likelyPainPoints.map((item, i) => <article className="lead" key={i}><div><strong>{item.hypothesis}</strong><p>{item.reason}</p><small className="muted">{item.confidence || "Unrated"} confidence</small>{sourceLinks(item.evidenceUrls)}</div></article>)}</div> : <p className="muted">No evidence-backed hypotheses yet.</p>}
      <h3>Where you could add value</h3>
      {report.opportunities?.length ? <div className="lead-list">{report.opportunities.map((item, i) => <article className="lead" key={i}><div><strong>{item.opportunity}</strong><p>{item.whyNow}</p>{sourceLinks(item.evidenceUrls)}</div></article>)}</div> : <p className="muted">No specific opportunity could be supported by the available evidence.</p>}
      <h3>Why contact this company?</h3><p>{report.personalizedReasonToContact || "Not established by the available evidence."}</p>
      <h3>Your tailored value proposition</h3><p>{report.valueProposition || "Add and confirm your professional profile context in Search settings."}</p>
      <h3>Suggested outreach angle</h3><p>{report.outreachAngle || "Not available."}</p>
      {report.researchGaps?.length ? <><h3>What still needs checking</h3><ul>{report.researchGaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></> : null}
      <div className="divider"></div>
      <h3>Public sources reviewed ({sources.length})</h3>
      <div className="lead-list">{sources.map((source, i) => <article className="lead" key={source.url}><div><small className="muted">{source.category}</small><p><a href={source.url} target="_blank" rel="noreferrer">{i + 1}. {source.title} ↗</a></p><p className="muted">{source.snippet}</p></div></article>)}</div>
      <p className="footnote">Public search snippets may be incomplete or outdated. Signals are not proof of internal problems. Verify the evidence before contacting anyone.</p>
    </section>}
    <footer><a href="/settings">Review your verified profile and search preferences ↗</a> · <a href="/search">Find more prospects ↗</a></footer>
  </main>;
}
