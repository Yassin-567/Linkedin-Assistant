"use client";
import { useState } from "react";

type Result = { title: string; url: string; description: string };
type Lead = { id: string; name: string; company: string; url: string; status: string; followUp: string; notes: string };

export default function SearchClients() {
  const [niche, setNiche] = useState("appliance repair");
  const [location, setLocation] = useState("United Kingdom");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string[]>([]);

  async function search() {
    setBusy(true); setError(""); setResults([]); setSaved([]);
    try {
      const response = await fetch("/api/prospect-search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, location })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed.");
      setResults(data.results || []);
      if (!data.results?.length) setError("No publicly indexed LinkedIn profiles found. Try a broader industry or location.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally { setBusy(false); }
  }

  function save(item: Result) {
    try {
      const key = "linkedin-assistant-leads";
      const leads: Lead[] = JSON.parse(localStorage.getItem(key) || "[]");
      if (leads.some(x => x.url === item.url)) { setSaved(old => [...old, item.url]); return; }
      const name = item.title.split(/\s[-–|]\s/)[0].trim();
      leads.unshift({
        id: crypto.randomUUID(), name, company: item.title, url: item.url,
        status: "To research", followUp: "", notes: item.description
      });
      localStorage.setItem(key, JSON.stringify(leads));
      setSaved(old => [...old, item.url]);
    } catch { setError("Could not save this result in your browser."); }
  }

  return <main className="workspace">
    <div className="topbar">
      <div><div className="eyebrow">PUBLIC LINKEDIN PROFILE DISCOVERY</div><h1>Find business owners</h1><p className="muted">Find publicly indexed LinkedIn profiles of owners, founders and directors at UK service businesses.</p></div>
      <a className="button secondary" href="/">Back to pipeline</a>
    </div>
    <section className="panel">
      <form className="lead-form" onSubmit={e => { e.preventDefault(); void search(); }}>
        <label>Industry or business type<input value={niche} onChange={e=>setNiche(e.target.value)} placeholder="e.g. HVAC, appliance repair, property maintenance"/></label>
        <label>Country or area<input value={location} onChange={e=>setLocation(e.target.value)} placeholder="United Kingdom"/></label>
        <div className="wide form-footer"><span className="muted">Searches public profile pages only, not LinkedIn's private member database.</span><button disabled={busy || !niche.trim()}>{busy ? "Searching profiles..." : "Find LinkedIn profiles"}</button></div>
      </form>
      {error && <p className="status" role="status">{error}</p>}
      {results.length > 0 && <>
        <div className="section-heading"><h2>{results.length} potential decision-makers</h2><span className="muted">Check each profile before connecting</span></div>
        <div className="lead-list">{results.map((item,i)=><article className="lead" key={item.url}>
          <div><strong>{i+1}. {item.title}</strong><p>{item.description}</p><a href={item.url} target="_blank" rel="noreferrer">Open LinkedIn profile ↗</a></div>
          <button disabled={saved.includes(item.url)} onClick={()=>save(item)}>{saved.includes(item.url) ? "Saved" : "Save prospect"}</button>
        </article>)}</div>
      </>}
    </section>
    <footer>Results come from public search indexing, so coverage is incomplete and some profiles may be outdated or outside the target industry. Review before outreach.</footer>
  </main>;
}
