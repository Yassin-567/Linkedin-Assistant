"use client";
import { useState } from "react";

type Result = { title: string; url: string; description: string };
type Lead = { id: string; name: string; company: string; url: string; status: string; followUp: string; notes: string };

function canonical(value: string) {
  try {
    const u = new URL(value);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname) || !u.pathname.toLowerCase().startsWith("/in/")) return "";
    return "https://www.linkedin.com" + u.pathname.replace(/\/$/, "").toLowerCase();
  } catch { return ""; }
}

export default function SearchClients() {
  const [niche, setNiche] = useState("appliance repair");
  const [location, setLocation] = useState("United Kingdom");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [excluded, setExcluded] = useState(0);

  async function search() {
    setBusy(true); setError(""); setResults([]); setSaved([]); setExcluded(0);
    try {
      const [response, connectionsResponse, prospectsResponse] = await Promise.all([
        fetch("/api/prospect-search", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({niche,location}) }),
        fetch("/api/connections", {cache:"no-store"}),
        fetch("/api/prospects", {cache:"no-store"})
      ]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed.");
      if (!connectionsResponse.ok || !prospectsResponse.ok) {
        throw new Error("Connect LinkedIn and import your Connections.csv first. This lets us exclude existing connections and previously saved prospects.");
      }
      const [connectionData, prospectData] = await Promise.all([connectionsResponse.json(), prospectsResponse.json()]);
      const known = new Set<string>();
      for (const item of connectionData.connections || []) { const url = canonical(item.url || ""); if (url) known.add(url); }
      for (const item of prospectData.leads || []) { const url = canonical(item.url || ""); if (url) known.add(url); }
      const fresh = (data.results || []).filter((item:Result) => {
        const url = canonical(item.url);
        if (!url || known.has(url)) return false;
        known.add(url);
        return true;
      });
      setExcluded((data.results || []).length - fresh.length);
      setResults(fresh);
      if (!fresh.length) setError("No new profiles found. All search results were already connected, saved, or did not contain a valid LinkedIn profile URL.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally { setBusy(false); }
  }

  async function save(item: Result) {
    try {
      const response = await fetch("/api/prospects", {cache:"no-store"});
      if (!response.ok) throw new Error("Could not load your saved prospect list.");
      const cloud = await response.json();
      const leads: Lead[] = Array.isArray(cloud.leads) ? cloud.leads : [];
      const url = canonical(item.url);
      if (leads.some(x => canonical(x.url) === url)) { setSaved(old => [...old, item.url]); return; }
      const name = item.title.split(/\s[-–|]\s/)[0].trim();
      leads.unshift({id:crypto.randomUUID(),name,company:item.title,url,status:"To research",followUp:"",notes:item.description});
      const write = await fetch("/api/prospects", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({leads})});
      if (!write.ok) throw new Error("Cloud save failed.");
      localStorage.setItem("linkedin-assistant-leads", JSON.stringify(leads));
      setSaved(old => [...old, item.url]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this prospect.");
    }
  }

  return <main className="workspace">
    <div className="topbar">
      <div><div className="eyebrow">PERSONALIZED PUBLIC PROFILE DISCOVERY</div><h1>Find business owners</h1><p className="muted">New profiles only. Existing connections and previously saved prospects are excluded.</p></div>
      <a className="button secondary" href="/">Back to pipeline</a>
    </div>
    <section className="panel">
      <p><a href="/connections">Manage imported connections ↗</a></p>
      <form className="lead-form" onSubmit={e => {e.preventDefault();void search();}}>
        <label>Industry or business type<input value={niche} onChange={e=>setNiche(e.target.value)} placeholder="e.g. HVAC, appliance repair, property maintenance"/></label>
        <label>Country or area<input value={location} onChange={e=>setLocation(e.target.value)} placeholder="United Kingdom"/></label>
        <div className="wide form-footer"><span className="muted">Uses public search results and your private duplicate database.</span><button disabled={busy || !niche.trim()}>{busy ? "Searching..." : "Find new LinkedIn profiles"}</button></div>
      </form>
      {error && <p className="status" role="status">{error}</p>}
      {results.length > 0 && <>
        <div className="section-heading"><h2>{results.length} new potential prospects</h2><span className="muted">{excluded} duplicates or invalid profiles excluded</span></div>
        <div className="lead-list">{results.map((item,i)=><article className="lead" key={item.url}>
          <div><strong>{i+1}. {item.title}</strong><p>{item.description}</p><a href={item.url} target="_blank" rel="noreferrer">Open LinkedIn profile ↗</a></div>
          <button disabled={saved.includes(item.url)} onClick={()=>void save(item)}>{saved.includes(item.url) ? "Saved" : "Save prospect"}</button>
        </article>)}</div>
      </>}
    </section>
    <footer>Results are publicly indexed and may be incomplete or outdated. Review each profile before contacting.</footer>
  </main>;
}
