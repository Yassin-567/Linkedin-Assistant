"use client";
import { useEffect, useState } from "react";
import JsonImportPanel, { type JsonImportValidation } from "@/components/JsonImportPanel";

type Lead = { id: string; name: string; company: string; url: string; industry?: string; status: string; followUp: string; notes: string; connected?: boolean; connectedOn?: string; connectedAt?: string | null; connectionSentAt?: string | null; discoverySource?: string; savedVia?: string; researchTool?: string; recommendedOutreach?: string };
const toLocalDateTime = (value?: string) => { if (!value) return ""; const d = new Date(value); return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); };
const statuses = ["To research", "Ready to contact", "Connection Sent", "Connected", "Contacted", "Replied", "Call booked", "Client", "Not a fit"];
const JSON_FENCE_INSTRUCTION = "Return exactly one JSON object inside a single fenced code block (```json ... ```), with nothing before or after the block, no splitting across multiple blocks, never as plain text or a file download.";
const prospectsImportPrompt = [
  "Prepare LinkedIn prospect records for my Inlinked Connections importer. Use only real professionals and public LinkedIn profile URLs; do not invent names, companies or profile links.",
  "Return one object with researchTool and leads. Each lead uses name, company, linkedin and optional recommendedOutreach. The importer accepts the same lead fields as /api/assistant-save.",
  'Example shape: {"researchTool":"ChatGPT","leads":[{"name":"Jane Smith","company":"ABC Repairs","linkedin":"https://www.linkedin.com/in/jane-smith","recommendedOutreach":"A short relevant connection note."}]}',
  "Include 1–50 records. Every record needs name, company and a personal LinkedIn URL under linkedin.com/in/. Put the AI application name in researchTool or use Unknown.",
  JSON_FENCE_INSTRUCTION,
].join("\n");

function validateProspectsImport(value: unknown): JsonImportValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value, error: "Provide one JSON object with researchTool and a leads array." };
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.leads) || input.leads.length < 1 || input.leads.length > 50) return { value, error: "Provide between 1 and 50 prospects in the leads array." };
  if (input.researchTool !== undefined && typeof input.researchTool !== "string") return { value, error: "researchTool must be a string." };
  for (let index = 0; index < input.leads.length; index++) {
    const lead = input.leads[index];
    if (!lead || typeof lead !== "object" || Array.isArray(lead)) return { value, error: "Prospect " + (index + 1) + " must be a JSON object." };
    const record = lead as Record<string, unknown>;
    const url = typeof record.linkedin === "string" ? record.linkedin : typeof record.url === "string" ? record.url : "";
    let validProfile = false;
    try { const parsed = new URL(url); validProfile = /(^|\.)linkedin\.com$/i.test(parsed.hostname) && parsed.pathname.toLowerCase().startsWith("/in/"); } catch {}
    if (typeof record.name !== "string" || !record.name.trim() || typeof record.company !== "string" || !record.company.trim() || !validProfile) {
      return { value, error: "Prospect " + (index + 1) + " needs a name, company and a personal LinkedIn profile URL (linkedin.com/in/...)."};
    }
  }
  return { value: input };
}


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
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [post, setPost] = useState("");
  const [message, setMessage] = useState("");
  const [pasted, setPasted] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);

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
          if (!response.ok) throw new Error("Could not load private LinkedIn connections.");
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
        console.error("Could not load account connections", error);
        if (!cancelled) setLeads([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void loadAccountData();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    // Keep the legacy browser list separate from authenticated cloud accounts.
    if (loaded && !account.connected) {
      localStorage.setItem("linkedin-assistant-leads", JSON.stringify(leads));
    }
  }, [leads, loaded, account.connected]);

  async function addLead(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !company.trim()) return;
    const payload={name:name.trim(),company:company.trim(),url,status,followUp,notes,discoverySource:"Manual",savedVia:"Manual entry"};
    if(cloudStorage){
      const r=await fetch("/api/prospects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const d=await r.json();if(!r.ok){setMessage(d.error||"Could not save LinkedIn connection.");return;}setLeads(old=>[d.lead,...old]);
    } else setLeads(old=>[{id:crypto.randomUUID(),...payload},...old]);
    setName("");setCompany("");setUrl("");setStatus(statuses[0]);setFollowUp("");setNotes("");
  }
  async function importPasted() {
    if (!cloudStorage) { setMessage("Sign in to import LinkedIn connections."); return; }
    const rows = pasted.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).slice(0,50);
    if (!rows.length) return;
    setPasteBusy(true);
    let saved=0, dupes=0, bad=0; const added:Lead[]=[];
    for (const row of rows) {
      const parts=row.replace(/^[-*\d.)\s]+/,"").split("|").map(s=>s.trim());
      const url=parts[parts.length-1]||"", name=parts[0]||"", company=parts.slice(1,-1).join(" | ");
      if(!name||!company||!/linkedin\.com\/in\//i.test(url)){bad++;continue;}
      const r=await fetch("/api/prospects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,company,url,status:statuses[0],notes:"Pasted from ChatGPT.",discoverySource:"ChatGPT research",savedVia:"ChatGPT AI Token"})});
      if(r.ok){const d=await r.json();added.push(d.lead);saved++;} else if(r.status===409)dupes++; else bad++;
    }
    if(added.length)setLeads(old=>[...added,...old]);
    setMessage(`Pasted import: saved ${saved}, duplicates ${dupes}, invalid or failed ${bad}.`);
    if(!bad)setPasted("");
    setPasteBusy(false);
  }
  async function importJsonProspects(value: unknown): Promise<string> {
    if (!cloudStorage) throw new Error("Sign in to your Inlinked account before importing LinkedIn prospects.");
    const input = value as { researchTool?: string; leads: Record<string, unknown>[] };
    let saved = 0, duplicates = 0, invalid = 0, limitSkipped = 0;
    const added: Lead[] = [];
    for (let index = 0; index < input.leads.length; index++) {
      const item = input.leads[index];
      const response = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          company: item.company,
          url: item.linkedin ?? item.url,
          status: statuses[0],
          notes: typeof item.notes === "string" ? item.notes : "Imported from ChatGPT JSON.",
          recommendedOutreach: item.recommendedOutreach,
          discoverySource: "ChatGPT research",
          savedVia: "ChatGPT AI Token",
          researchTool: item.researchTool ?? input.researchTool
        })
      });
      const data = await response.json();
      if (response.status === 402) {
        limitSkipped = input.leads.length - index;
        if (added.length) setLeads(old => [...added, ...old]);
        const limitMessage = (data.error || "The Free plan limit prevents adding more LinkedIn prospects.") + " " + limitSkipped + " prospect(s) skipped due to the plan limit.";
        setMessage(limitMessage);
        throw new Error(limitMessage + " Saved " + saved + " before the limit.");
      }
      if (response.status === 409) { duplicates++; continue; }
      if (!response.ok) {
        if (response.status === 401) throw new Error(data.error || "Sign in again before importing prospects.");
        invalid++;
        continue;
      }
      if (data.lead) { added.push(data.lead); saved++; }
      else invalid++;
    }
    if (added.length) setLeads(old => [...added, ...old]);
    const summary = "JSON import complete: saved " + saved + ", duplicates " + duplicates + ", invalid " + invalid + ".";
    setMessage(summary);
    return summary;
  }

  async function updateLead(id:string, changes:Partial<Lead>) {
    const current=leads.find(x=>x.id===id);if(!current)return;const next={...current,...changes};
    if(cloudStorage){const r=await fetch("/api/prospects",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)});const d=await r.json();if(!r.ok){setMessage(d.error||"Could not update LinkedIn connection.");return;}setLeads(old=>old.map(x=>x.id===id?d.lead:x));}
    else setLeads(old=>old.map(x=>x.id===id?next:x));
  }
  async function removeLead(id:string) {
    if(cloudStorage){const r=await fetch("/api/prospects?id="+encodeURIComponent(id),{method:"DELETE"});const d=await r.json();if(!r.ok){setMessage(d.error||"Could not delete prospect.");return;}}
    setLeads(old=>old.filter(x=>x.id!==id));
  }
  function exportCsv() {
    const q = (s:string) => '"' + s.replace(/"/g,'""') + '"';
    const rows = [["Name","Company","LinkedIn URL","Status","Follow-up","Notes","Recommended Outreach","Connected","Connected at","Legacy connected date","Connection request sent at","Discovery source","Saved via","AI research tool"], ...leads.map(x => [x.name,x.company,x.url,x.status,x.followUp,x.notes,x.recommendedOutreach || "",x.connected ? "Yes" : "No",x.connectedAt || "",x.connectedOn || "",x.connectionSentAt || "",x.discoverySource || "",x.savedVia || "",x.researchTool && x.researchTool !== "Unknown" ? x.researchTool : ""])];
    const blob = new Blob([rows.map(row => row.map(q).join(",")).join("\n")], {type:"text/csv"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "linkedin-connections.csv"; a.click(); URL.revokeObjectURL(a.href);
  }
  async function copyRecommended(text:string) { try { await navigator.clipboard.writeText(text); setMessage("Recommended message copied."); } catch { setMessage("Could not copy the message. Select and copy it manually."); } }
  async function publish() {
    const r = await fetch("/api/linkedin/post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:post})});
    const data = await r.json(); setMessage(r.ok ? "Post published." : (data.error || "Post failed."));
    if (r.ok) setPost("");
  }
  const filtered = leads.filter(x => (filter === "All" || x.status === filter) && (x.name+" "+x.company+" "+x.notes).toLowerCase().includes(search.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize);

  return <main className="workspace">
    <header className="topbar"><div><div className="eyebrow">LINKEDIN CONNECTION PIPELINE</div><h1>LinkedIn Connections</h1><p className="muted">Manage professionals and decision-makers you want to connect with. Track follow-ups and keep relationship-building organized.</p></div><div className="row"><span className={account.connected ? "connection connected" : "connection"}>{account.connected ? "● Account connected" : "○ Sign in required"}</span>{!account.connected&&<a className="button" href="/api/auth/google">Sign in with Google</a>}</div></header>
    <section className="stats">
      <div className="stat"><span>Total connections</span><strong>{leads.length}</strong></div>
      <div className="stat"><span>Ready to contact</span><strong>{leads.filter(x=>x.status==="Ready to contact").length}</strong></div>
      <div className="stat"><span>Connection requests sent</span><strong>{leads.filter(x=>x.status==="Connection Sent").length}</strong></div>
      <div className="stat"><span>Awaiting replies</span><strong>{leads.filter(x=>x.status==="Contacted").length}</strong></div>
      <div className="stat"><span>Clients won</span><strong>{leads.filter(x=>x.status==="Client").length}</strong></div>
    </section>
    <section className="panel">
      <div className="section-heading"><div><h2>Connection tracker</h2><p className="muted">Add professionals and decision-makers you discover. Keep relationship-building personal.</p></div><div className="row"><a className="button secondary" href="/connections">Import connections</a><a className="button secondary" href="/settings">Research preferences</a><button onClick={exportCsv} disabled={!leads.length}>Export CSV</button></div></div>
      <form className="lead-form" onSubmit={addLead}>
        <label>Contact name *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Jane Smith"/></label>
        <label>Company *<input required value={company} onChange={e=>setCompany(e.target.value)} placeholder="ABC Appliance Repairs"/></label>
        <label>LinkedIn URL<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.linkedin.com/..."/></label>
        <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>
        <label>Next follow-up<input type="date" value={followUp} onChange={e=>setFollowUp(e.target.value)}/></label>
        <label className="wide">Notes<textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Why are they a good fit? What should you mention?"/></label>
        <div className="wide form-footer"><span className="muted">* Required</span><button type="submit">+ Save connection</button></div>
      </form>
      <div className="toolbar"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search LinkedIn connections..."/><select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option>All</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
      {shown.length ? <><div className="lead-list">{shown.map(x=><article className="lead" key={x.id}><div className="prospect-summary"><strong>{x.name}</strong><div>{x.company}</div><small className="muted">{[x.discoverySource, x.savedVia, x.researchTool && x.researchTool !== "Unknown" ? "Research: " + x.researchTool : ""].filter(Boolean).join(" · ")}</small>{x.connected && <span className="connected-tag">✓ Connected{x.connectedAt ? ` · ${new Date(x.connectedAt).toLocaleString()}` : x.connectedOn ? ` · Legacy date ${x.connectedOn} (time not verified)` : " · date not recorded"}</span>}{x.followUp && <small>Follow up: {x.followUp}</small>}{x.notes && <p>{x.notes}</p>}{x.url && <a href={x.url} target="_blank" rel="noreferrer">Open LinkedIn ↗</a>}</div><aside className="recommended-outreach"><label>Recommended outreach<textarea rows={4} defaultValue={x.recommendedOutreach || ""} onBlur={e=>{const value=e.target.value;if(value!==(x.recommendedOutreach||""))void updateLead(x.id,{recommendedOutreach:value});}} placeholder="A personalized message will appear here after AI research."/></label><button type="button" className="secondary" disabled={!x.recommendedOutreach?.trim()} onClick={()=>void copyRecommended(x.recommendedOutreach||"")}>Copy message</button></aside><div className="lead-controls"><label className="sr-only" htmlFor={"status-"+x.id}>Status for {x.name}</label><select id={"status-"+x.id} value={x.status} onChange={e=>void updateLead(x.id,{status:e.target.value})}>{statuses.map(s=><option key={s}>{s}</option>)}</select>{x.status==="Connection Sent" && <label>Invitation sent at<input aria-label={"Connection request sent date and time for "+x.name} key={x.id + ":" + (x.connectionSentAt || "")} type="datetime-local" defaultValue={toLocalDateTime(x.connectionSentAt || undefined)} onBlur={e=>{const value=e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : "";if(value!==(x.connectionSentAt || ""))void updateLead(x.id,{connectionSentAt:value});}}/><small className="muted">Enter when you actually sent the invitation. Blank means not known.</small></label>}{x.status==="Connected" && <><label>Connection accepted on (date only)<input aria-label={"Connection accepted date for "+x.name} key={x.id + ":" + (x.connectedOn || "")} type="date" defaultValue={x.connectedOn || ""} onBlur={e=>{const value=e.currentTarget.value;if(value!==(x.connectedOn || ""))void updateLead(x.id,{connectedOn:value});}}/><small className="muted">The actual acceptance date. No time is assumed by this field.</small></label><label>Exact acceptance date and time (optional)<input aria-label={"Exact connection accepted date and time for "+x.name} key={x.id + ":" + (x.connectedAt || "")} type="datetime-local" defaultValue={toLocalDateTime(x.connectedAt || undefined)} onBlur={e=>{const value=e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : "";if(value!==(x.connectedAt || ""))void updateLead(x.id,{connectedAt:value});}}/><small className="muted">{x.connectedAt ? "Exact acceptance time saved." : "Leave blank when the time is not known. Do not use the date you recorded the connection."}</small></label></>}<button className="delete" onClick={()=>void removeLead(x.id)}>×</button></div></article>)}</div><div className="row" aria-label="Prospect pages"><span className="muted">Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,filtered.length)} of {filtered.length}</span><button type="button" className="secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" className="secondary" disabled={page>=pageCount} onClick={()=>setPage(p=>p+1)}>Next</button></div></> : <div className="empty"><strong>{leads.length ? "No matching connections" : "Your connection list starts here"}</strong><p>Add a professional or decision-maker from any country or industry to track your next relationship-building step.</p></div>}
      <p className="storage-note">{cloudStorage ? "Synced to your private cloud storage and mirrored in this browser." : "Saved in this browser until you sign in to enable private database sync."} Export CSV regularly for backup.</p>
    </section>
    {account.connected&&<><JsonImportPanel title="Import from ChatGPT" description="Import up to 50 LinkedIn prospects using the same leads schema as the assistant save endpoint. The existing line-by-line paste importer remains available below." prompt={prospectsImportPrompt} placeholder={'{"researchTool":"ChatGPT","leads":[{"name":"Jane Smith","company":"ABC Repairs","linkedin":"https://www.linkedin.com/in/jane-smith"}]}'} validate={validateProspectsImport} onImport={importJsonProspects} importLabel="Import prospects" />
    <section className="panel"><h2>Paste from ChatGPT</h2><p className="muted">Ask ChatGPT to list LinkedIn connections one per line as <code>Name | Company | LinkedIn profile URL</code>, then paste them here (up to 50). Duplicates are skipped.</p><textarea rows={5} value={pasted} onChange={e=>setPasted(e.target.value)} placeholder={"Jane Smith | ABC Appliance Repairs | https://www.linkedin.com/in/jane-smith"}/><div className="row"><button onClick={()=>void importPasted()} disabled={pasteBusy||!pasted.trim()}>{pasteBusy?"Importing...":"Import pasted connections"}</button></div></section></>}
    <section className="panel"><h2>Your account</h2>{account.connected?<><p className="muted">Signed in as <strong>{account.profile?.name || "Google user"}</strong> {account.profile?.email || ""}</p><div className="row"><a className="button secondary" href="/settings">Edit search preferences</a><button className="text-button" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});setAccount({connected:false});window.location.href="/login";}}>Sign out</button></div></>:<><p className="muted">Sign in to save LinkedIn connections privately, configure your target markets and connect ChatGPT.</p><a className="button" href="/api/auth/google">Continue with Google</a></>}{message && <p className="status">{message}</p>}</section>
    <footer>Inlinked · LinkedIn Connections</footer>
  </main>;
}
