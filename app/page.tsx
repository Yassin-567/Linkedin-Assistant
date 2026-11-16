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
  const [assistantToken, setAssistantToken] = useState("");
  const [assistantReadUrl, setAssistantReadUrl] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);

  useEffect(() => {
    let localLeads: Lead[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem("linkedin-assistant-leads") || "[]");
      if (Array.isArray(parsed)) localLeads = parsed;
      setLeads(localLeads);
    } catch {}
    setLoaded(true);
    fetch("/api/auth/me", {cache:"no-store"})
      .then(r => r.json())
      .then(async data => {
        setAccount(data);
        if (data.connected) {
          const response = await fetch("/api/prospects", {cache:"no-store"});
          if (response.ok) {
            const cloud = await response.json();
            const cloudLeads: Lead[] = Array.isArray(cloud.leads) ? cloud.leads : [];
            if (cloudLeads.length) {
              setLeads(cloudLeads);
            } else if (localLeads.length) {
              // First cloud login: migrate existing browser prospects instead of overwriting them with an empty list.
              const migration = await fetch("/api/prospects", {
                method:"PUT",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({leads:localLeads})
              });
              if (migration.ok) setLeads(localLeads);
            } else {
              setLeads([]);
            }
            setCloudStorage(true);
          }
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem("linkedin-assistant-leads", JSON.stringify(leads));
  }, [leads, loaded]);
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
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "uk-bookkeeping-prospects.csv"; a.click(); URL.revokeObjectURL(a.href);
  }
  async function publish() {
    const r = await fetch("/api/linkedin/post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:post})});
    const data = await r.json(); setMessage(r.ok ? "Post published." : (data.error || "Post failed."));
    if (r.ok) setPost("");
  }
  const shown = leads.filter(x => (filter === "All" || x.status === filter) && (x.name+" "+x.company+" "+x.notes).toLowerCase().includes(search.toLowerCase()));

  return <main className="workspace">
    <header className="topbar"><div><div className="eyebrow">YOUR CLIENT PIPELINE</div><h1>LinkedIn Assistant</h1><p className="muted">Find, organize and follow up with prospects in any country or industry.</p></div><span className={account.connected ? "connection connected" : "connection"}>{account.connected ? "● Account connected" : "○ Sign in required"}</span></header>
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
    <section className="panel"><h2>Bulk ChatGPT prospect save</h2><p className="muted">Create a temporary ChatGPT connection. ChatGPT can read your existing prospects once, then save one batch of up to 50 new prospects. It cannot edit or delete your records.</p><div className="row"><button disabled={!account.connected || tokenBusy} onClick={async()=>{setTokenBusy(true);setAssistantToken("");setAssistantReadUrl("");try{const r=await fetch("/api/assistant-token",{method:"POST"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not create token.");setAssistantToken(d.saveUrl);setAssistantReadUrl(d.readUrl);await navigator.clipboard?.writeText(d.saveUrl);}catch(e){setMessage(e instanceof Error?e.message:"Could not create token.");}finally{setTokenBusy(false);}}}>{tokenBusy?"Creating...":"Generate bulk save link"}</button>{assistantToken&&<button className="button secondary" onClick={()=>void navigator.clipboard?.writeText(assistantToken)}>Copy bulk save link</button>}</div>{assistantToken&&<p className="status" role="status">Save link copied. Give ChatGPT both links: first use the read link to exclude existing prospects, then use the save link to save up to 50 new prospects. Read link: <code>{assistantReadUrl}</code> Save link: <code>{assistantToken}</code></p>}<p className="footnote">Both links expire after 10 minutes. The read link works once; the save link accepts one batch of up to 50. Duplicate profile URLs are blocked by a database uniqueness rule. Keep these temporary links private.</p></section>
    <section className="panel"><h2>Your account</h2><p className="muted">Signed in as <strong>{account.profile?.name || "Google user"}</strong> {account.profile?.email || ""}</p><div className="row"><a className="button secondary" href="/settings">Edit search preferences</a><button className="text-button" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});setAccount({connected:false});window.location.href="/login";}}>Sign out</button></div>{message && <p className="status">{message}</p>}</section>
    <footer>LinkedIn Assistant · Early build</footer>
  </main>;
}
