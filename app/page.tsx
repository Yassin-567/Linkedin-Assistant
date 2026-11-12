"use client";
import { useEffect, useState } from "react";

type Lead = { id: string; name: string; company: string; url: string; status: string; followUp: string; notes: string };
const statuses = ["To research", "Ready to contact", "Contacted", "Replied", "Call booked", "Client", "Not a fit"];

export default function Home() {
  const [account, setAccount] = useState<{connected:boolean; profile?:{name?:string;email?:string}}>({connected:false});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loaded, setLoaded] = useState(false);
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

  useEffect(() => {
    fetch("/api/linkedin/me", {cache:"no-store"}).then(r => r.json()).then(setAccount).catch(() => {});
    try { setLeads(JSON.parse(localStorage.getItem("linkedin-assistant-leads") || "[]")); } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem("linkedin-assistant-leads", JSON.stringify(leads)); }, [leads, loaded]);

  function addLead(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !company.trim()) return;
    setLeads([{id:crypto.randomUUID(),name:name.trim(),company:company.trim(),url,status,followUp,notes},...leads]);
    setName(""); setCompany(""); setUrl(""); setStatus(statuses[0]); setFollowUp(""); setNotes("");
  }
  function exportCsv() {
    const q = (s:string) => '"' + s.replace(/"/g,'""') + '"';
    const rows = [["Name","Company","LinkedIn URL","Status","Follow-up","Notes"], ...leads.map(x => [x.name,x.company,x.url,x.status,x.followUp,x.notes])];
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
    <header className="topbar"><div><div className="eyebrow">YOUR CLIENT PIPELINE</div><h1>LinkedIn Assistant</h1><p className="muted">Find, organize and follow up with potential UK bookkeeping clients.</p></div><span className={account.connected ? "connection connected" : "connection"}>{account.connected ? "● LinkedIn connected" : "○ LinkedIn not connected"}</span></header>
    <section className="stats">
      <div className="stat"><span>Total prospects</span><strong>{leads.length}</strong></div>
      <div className="stat"><span>Ready to contact</span><strong>{leads.filter(x=>x.status==="Ready to contact").length}</strong></div>
      <div className="stat"><span>Awaiting replies</span><strong>{leads.filter(x=>x.status==="Contacted").length}</strong></div>
      <div className="stat"><span>Clients won</span><strong>{leads.filter(x=>x.status==="Client").length}</strong></div>
    </section>
    <section className="panel">
      <div className="section-heading"><div><h2>Prospect tracker</h2><p className="muted">Add businesses and decision-makers you find. Keep outreach personal.</p></div><div className="row"><a className="button" href="/search">Find clients automatically</a><button onClick={exportCsv} disabled={!leads.length}>Export CSV</button></div></div>
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
      {shown.length ? <div className="lead-list">{shown.map(x=><article className="lead" key={x.id}><div><strong>{x.name}</strong><div>{x.company}</div>{x.followUp && <small>Follow up: {x.followUp}</small>}{x.notes && <p>{x.notes}</p>}{x.url && <a href={x.url} target="_blank" rel="noreferrer">Open LinkedIn ↗</a>}</div><div className="lead-controls"><select value={x.status} onChange={e=>setLeads(old=>old.map(y=>y.id===x.id?{...y,status:e.target.value}:y))}>{statuses.map(s=><option key={s}>{s}</option>)}</select><button className="delete" onClick={()=>setLeads(old=>old.filter(y=>y.id!==x.id))}>×</button></div></article>)}</div> : <div className="empty"><strong>{leads.length ? "No matching prospects" : "Your pipeline starts here"}</strong><p>Add a UK appliance repair, HVAC or maintenance business to track your next step.</p></div>}
      <p className="storage-note">Saved in this browser only. Export CSV regularly for backup.</p>
    </section>
    <section className="panel"><h2>LinkedIn account</h2>{!account.connected ? <a className="button" href="/api/linkedin/login">Connect LinkedIn</a> : <><p className="muted">Connected as <strong>{account.profile?.name || "LinkedIn member"}</strong> {account.profile?.email || ""}</p><h3>Publish a text post</h3><textarea value={post} onChange={e=>setPost(e.target.value)} maxLength={3000} placeholder="Write your LinkedIn post..."/><div className="row"><span className="muted">{post.length}/3000 characters</span><button disabled={!post.trim()} onClick={publish}>Publish post</button></div><button className="text-button" onClick={async()=>{await fetch("/api/linkedin/logout",{method:"POST"});setAccount({connected:false});}}>Disconnect LinkedIn</button></>}{message && <p className="status">{message}</p>}<p className="muted footnote">No private inbox access, profile scraping or automated connection requests. Prospect details are entered by you.</p></section>
    <footer>LinkedIn Assistant · Early build</footer>
  </main>;
}
