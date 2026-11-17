"use client";
import { useEffect, useState } from "react";

type Lead = { id: string; name: string; company: string; url: string; status: string; followUp: string; notes: string; connected?: boolean; connectedOn?: string };
const statuses = ["To research", "Ready to contact", "Contacted", "Replied", "Call booked", "Client", "Not a fit"];

export default function Home() {
  const [account, setAccount] = useState<{connected:boolean; profile?:{name?:string;email?:string}}>({connected:false});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cloudStorage, setCloudStorage] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState(statuses[0]);
  const [followUp, setFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [post, setPost] = useState("");
  const [message, setMessage] = useState("");
  const [aiToken, setAiToken] = useState("");
  const [aiEndpoint, setAiEndpoint] = useState("");
  const [aiTokenEnabled, setAiTokenEnabled] = useState(false);
  const [aiTokenBusy, setAiTokenBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadAccountData() {
      try {
        const accountResponse = await fetch("/api/auth/me", {cache:"no-store"});
        const data = await accountResponse.json();
        if (cancelled) return;
        setAccount(data);
        if (data.connected) {
          // Authenticated data must come only from this account's database records.
          // Never import the shared legacy browser key into a newly signed-in account.
          const response = await fetch("/api/prospects", {cache:"no-store"});
          if (!response.ok) throw new Error("Could not load private prospects.");
          const cloud = await response.json();
          if (cancelled) return;
          setLeads(Array.isArray(cloud.leads) ? cloud.leads : []);
          setCloudStorage(true);
        } else {
          // Browser-only prospects are available only while signed out.
          const parsed = JSON.parse(localStorage.getItem("linkedin-assistant-leads") || "[]");
          if (!cancelled) setLeads(Array.isArray(parsed) ? parsed : []);
        }
      } catch (error) {
        console.error("Could not load account prospects", error);
        if (!cancelled) setLeads([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void loadAccountData();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!account.connected) { setAiTokenEnabled(false); return; }
    fetch("/api/assistant-ai-token", {cache:"no-store"}).then(r=>r.json()).then(data=>setAiTokenEnabled(!!data.enabled)).catch(()=>{});
  }, [account.connected]);
  useEffect(() => {
    // Keep the legacy browser list separate from authenticated cloud accounts.
    if (loaded && !account.connected) {
      localStorage.setItem("linkedin-assistant-leads", JSON.stringify(leads));
    }
  }, [leads, loaded, account.connected]);
  useEffect(() => {
    if (!loaded || !cloudStorage) return;
    fetch("/api/prospects", {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({leads})
    }).catch(() => {});
  }, [leads, loaded, cloudStorage]);

  function addLead(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !company.trim()) return;
    setLeads([{id:crypto.randomUUID(),name:name.trim(),company:company.trim(),url,status,followUp,notes},...leads]);
    setName(""); setCompany(""); setUrl(""); setStatus(statuses[0]); setFollowUp(""); setNotes("");
  }
  function exportCsv() {
    const q = (s:string) => '"' + s.replace(/"/g,'""') + '"';
    const rows = [["Name","Company","LinkedIn URL","Status","Follow-up","Notes","Connected","Connected on"], ...leads.map(x => [x.name,x.company,x.url,x.status,x.followUp,x.notes,x.connected ? "Yes" : "No",x.connectedOn || ""])];
    const blob = new Blob([rows.map(row => row.map(q).join(",")).join("\n")], {type:"text/csv"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "prospects.csv"; a.click(); URL.revokeObjectURL(a.href);
  }
  async function publish() {
    const r = await fetch("/api/linkedin/post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:post})});
    const data = await r.json(); setMessage(r.ok ? "Post published." : (data.error || "Post failed."));
    if (r.ok) setPost("");
  }
  const shown = leads.filter(x => (filter === "All" || x.status === filter) && (x.name+" "+x.company+" "+x.notes).toLowerCase().includes(search.toLowerCase()));

  return <main className="workspace">
    <header className="topbar"><div><div className="eyebrow">YOUR CLIENT PIPELINE</div><h1>LinkedIn Assistant</h1><p className="muted">Find, organize and follow up with prospects in any country or industry.</p></div><div className="row"><span className={account.connected ? "connection connected" : "connection"}>{account.connected ? "● Account connected" : "○ Sign in required"}</span>{!account.connected&&<a className="button" href="/api/auth/google">Sign in with Google</a>}</div></header>
    <section className="stats">
      <div className="stat"><span>Total prospects</span><strong>{leads.length}</strong></div>
      <div className="stat"><span>Ready to contact</span><strong>{leads.filter(x=>x.status==="Ready to contact").length}</strong></div>
      <div className="stat"><span>Awaiting replies</span><strong>{leads.filter(x=>x.status==="Contacted").length}</strong></div>
      <div className="stat"><span>Clients won</span><strong>{leads.filter(x=>x.status==="Client").length}</strong></div>
    </section>
    <section className="panel">
      <div className="section-heading"><div><h2>Prospect tracker</h2><p className="muted">Add businesses and decision-makers you find. Keep outreach personal.</p></div><div className="row"><a className="button" href="/search">Find clients automatically</a><a className="button secondary" href="/connections">Import connections</a><a className="button secondary" href="/settings">Search settings</a><button onClick={exportCsv} disabled={!leads.length}>Export CSV</button></div></div>
      <form className="lead-form" onSubmit={addLead}>
        <label>Contact name *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Jane Smith"/></label>
        <label>Company *<input required value={company} onChange={e=>setCompany(e.target.value)} placeholder="ABC Appliance Repairs"/></label>
        <label>LinkedIn URL<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.linkedin.com/..."/></label>
        <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>
        <label>Next follow-up<input type="date" value={followUp} onChange={e=>setFollowUp(e.target.value)}/></label>
        <label className="wide">Notes<textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Why are they a good fit? What should you mention?"/></label>
        <div className="wide form-footer"><span className="muted">* Required</span><button type="submit">+ Save prospect</button></div>
      </form>
      <div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search prospects..."/><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
      {shown.length ? <div className="lead-list">{shown.map(x=><article className="lead" key={x.id}><div><strong>{x.name}</strong><div>{x.company}</div>{x.connected && <span className="connected-tag">✓ Connected{x.connectedOn ? ` · ${x.connectedOn}` : ""}</span>}{x.followUp && <small>Follow up: {x.followUp}</small>}{x.notes && <p>{x.notes}</p>}{x.url && <a href={x.url} target="_blank" rel="noreferrer">Open LinkedIn ↗</a>}</div><div className="lead-controls"><select value={x.status} onChange={e=>setLeads(old=>old.map(y=>y.id===x.id?{...y,status:e.target.value}:y))}>{statuses.map(s=><option key={s}>{s}</option>)}</select><button className="delete" onClick={()=>setLeads(old=>old.filter(y=>y.id!==x.id))}>×</button></div></article>)}</div> : <div className="empty"><strong>{leads.length ? "No matching prospects" : "Your pipeline starts here"}</strong><p>Add a business and decision-maker from any country or industry to track your next step.</p></div>}
      <p className="storage-note">{cloudStorage ? "Synced to your private cloud storage and mirrored in this browser." : "Saved in this browser until you sign in to enable private database sync."} Export CSV regularly for backup.</p>
    </section>
    <section className="panel"><div className="section-heading"><div><h2>ChatGPT AI Access</h2><p className="muted">Generate a reusable token for this account. ChatGPT can save prospects to this account until you revoke the token.</p></div><span className={aiTokenEnabled ? "connection connected" : "connection"}>{aiTokenEnabled ? "● AI access active" : "○ Not connected"}</span></div><div className="row"><button disabled={!account.connected || aiTokenBusy} onClick={async()=>{setAiTokenBusy(true);setAiToken("");setAiEndpoint("");try{const r=await fetch("/api/assistant-ai-token",{method:"POST"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not generate AI token.");setAiToken(d.token);setAiEndpoint(d.endpoint);setAiTokenEnabled(true);await navigator.clipboard?.writeText(d.token);}catch(e){setMessage(e instanceof Error?e.message:"Could not generate AI token.");}finally{setAiTokenBusy(false);}}}>{aiTokenBusy?"Generating...":aiTokenEnabled?"Regenerate AI token":"Generate AI token"}</button><button className="button secondary" disabled={!account.connected || !aiTokenEnabled || aiTokenBusy} onClick={async()=>{setAiTokenBusy(true);try{const r=await fetch("/api/assistant-ai-token",{method:"DELETE"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not revoke token.");setAiTokenEnabled(false);setAiToken("");setAiEndpoint("");setMessage("AI Access Token revoked.");}catch(e){setMessage(e instanceof Error?e.message:"Could not revoke token.");}finally{setAiTokenBusy(false);}}}>Revoke token</button></div>{aiToken&&<div className="status" role="status"><p><strong>Your new AI Access Token (shown once):</strong></p><code>{aiToken}</code><p><button className="button secondary" onClick={()=>void navigator.clipboard?.writeText(aiToken)}>Copy token</button></p><p><strong>ChatGPT save endpoint:</strong></p><code>{aiEndpoint}</code><p><button className="button secondary" onClick={()=>void navigator.clipboard?.writeText(aiEndpoint)}>Copy endpoint</button></p></div>}<p className="footnote">The token remains active until revoked or regenerated and is scoped to this signed-in account. It only allows prospect creation, not reading or editing account data. Use POST with a JSON leads array for up to 50 records, or build a URL with a base64url-encoded data parameter for GET requests (maximum 6,500 encoded characters). Existing LinkedIn profile URLs are skipped automatically. Keep the token private.</p></section>
    <section className="panel"><h2>Your account</h2>{account.connected?<><p className="muted">Signed in as <strong>{account.profile?.name || "Google user"}</strong> {account.profile?.email || ""}</p><div className="row"><a className="button secondary" href="/settings">Edit search preferences</a><button className="text-button" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});setAccount({connected:false});window.location.href="/login";}}>Sign out</button></div></>:<><p className="muted">Sign in to save prospects privately, configure your target markets and connect ChatGPT.</p><a className="button" href="/api/auth/google">Continue with Google</a></>}{message && <p className="status">{message}</p>}</section>
    <footer>LinkedIn Assistant · Early build</footer>
  </main>;
}
