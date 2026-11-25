"use client";
import { useEffect, useMemo, useState } from "react";

type Lead = { id: string; name: string; company: string; url?: string; industry?: string; status: string; followUp?: string; notes?: string };
type Activity = { id: string; prospectId: string; name?: string; company?: string; channel: string; activityType: string; messageType: string; subject: string; message: string; notes: string; followUpDate: string; createdAt: string };
type Reminder = { id: string; name: string; company: string; status: string; followUp: string; daysUntil: number | null };
const messageLabels: Record<string,string> = { connection_request:"LinkedIn connection request", linkedin_follow_up:"LinkedIn follow-up", email_intro:"Email introduction", email_follow_up:"Email follow-up", other:"Other" };

export default function OutreachPage() {
  const [leads,setLeads]=useState<Lead[]>([]);
  const [activities,setActivities]=useState<Activity[]>([]);
  const [reminders,setReminders]=useState<Reminder[]>([]);
  const [prospectId,setProspectId]=useState("");
  const [prospectSearch,setProspectSearch]=useState("");
  const [channel,setChannel]=useState("linkedin");
  const [messageType,setMessageType]=useState("connection_request");
  const [reason,setReason]=useState("");
  const [subject,setSubject]=useState("");
  const [message,setMessage]=useState("");
  const [followUpDate,setFollowUpDate]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState("");

  const selected=useMemo(()=>leads.find(x=>x.id===prospectId),[leads,prospectId]);
  const filteredLeads=useMemo(()=>leads.filter(x=>(x.name+" "+x.company).toLowerCase().includes(prospectSearch.toLowerCase())),[leads,prospectSearch]);
  async function load() {
    const [p,a]=await Promise.all([fetch("/api/prospects",{cache:"no-store"}),fetch("/api/outreach",{cache:"no-store"})]);
    if(p.status===401){location.href="/login";return;}
    const pd=await p.json(), ad=await a.json();
    if(!p.ok)throw new Error(pd.error||"Could not load prospects.");
    if(!a.ok)throw new Error(ad.error||"Could not load outreach.");
    setLeads(pd.leads||[]);setActivities(ad.activities||[]);setReminders(ad.reminders||[]);
    if(!prospectId && pd.leads?.length)setProspectId(pd.leads[0].id);
  }
  useEffect(()=>{load().catch(e=>setNotice(e instanceof Error?e.message:"Could not load outreach.")).finally(()=>setLoading(false));},[]);

  function makeDraft(){
    if(!selected){setNotice("Choose a saved prospect first.");return;}
    const first=selected.name.split(/\s+/)[0]||selected.name;
    const why=reason.trim()||"I thought it could be useful to connect and learn more about your work.";
    if(messageType==="connection_request"){
      setChannel("linkedin");setSubject("");
      setMessage("Hi "+first+", I came across your work at "+selected.company+" and thought it would be good to connect.");
    } else if(messageType==="linkedin_follow_up"){
      setChannel("linkedin");setSubject("");
      setMessage("Hi "+first+", thanks for connecting. "+why+" Would you be open to a brief conversation?");
    } else if(messageType==="email_intro"){
      setChannel("email");setSubject("A quick introduction");
      setMessage("Hi "+first+",\n\nI came across "+selected.company+" and wanted to introduce myself. "+why+"\n\nWould you be open to a brief conversation?\n\nBest,\n[Your name]");
    } else if(messageType==="email_follow_up"){
      setChannel("email");setSubject("Following up");
      setMessage("Hi "+first+",\n\nI wanted to follow up on my previous message. "+why+"\n\nWould a short conversation be useful?\n\nBest,\n[Your name]");
    }
    setNotice("Draft created. Review and edit it before using it.");
  }

  async function record(activityType:string){
    if(!selected){setNotice("Choose a saved prospect first.");return;}
    if((activityType==="draft"||activityType==="sent")&&!message.trim()){setNotice("Write or generate a message first.");return;}
    if(activityType==="sent"&&!window.confirm("Have you already sent this message yourself? This only records the action; LinkedIn Assistant will not send it."))return;
    setBusy(true);setNotice("");
    try{
      const response=await fetch("/api/outreach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        prospectId:selected.id,channel,messageType,activityType,subject,message,followUpDate,
        notes:reason,idempotencyKey:crypto.randomUUID()
      })});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Could not save outreach activity.");
      await load();
      setNotice(activityType==="sent"?"Sent activity recorded. Follow-up reminder saved if you entered a date.":activityType==="draft"?"Draft saved to your private outreach history.":activityType==="replied"?"Reply recorded and prospect status updated.":"Meeting recorded and prospect status updated.");
    }catch(e){setNotice(e instanceof Error?e.message:"Could not save activity.");}
    finally{setBusy(false);}
  }

  async function logSimple(type:string){
    if(!selected){setNotice("Choose a saved prospect first.");return;}
    setBusy(true);setNotice("");
    try{
      const response=await fetch("/api/outreach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        prospectId:selected.id,channel,messageType,activityType:type,subject:"",message:"",notes:reason,followUpDate,idempotencyKey:crypto.randomUUID()
      })});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not record activity.");
      await load();setNotice(type==="replied"?"Reply recorded.":"Meeting recorded.");
    }catch(e){setNotice(e instanceof Error?e.message:"Could not record activity.");}
    finally{setBusy(false);}
  }

  const labelType=(v:string)=>messageLabels[v]||v.replaceAll("_"," ");
  return <main className="workspace">
    <header className="topbar"><div><div className="eyebrow">PHASE 5 · OUTREACH & RELATIONSHIPS</div><h1>Outreach workspace</h1><p className="muted">Prepare messages, approve them yourself, and keep every interaction in one private timeline.</p></div><a className="button secondary" href="/">Back to dashboard</a></header>
    <section className="panel">
      <div className="section-heading"><div><h2>Compose outreach</h2><p className="muted">Messages are drafts only. You send them manually after reviewing.</p></div><span className="connection">Human approval required</span></div>
      {loading?<p className="muted">Loading your prospects...</p>:!leads.length?<div className="empty"><strong>No saved prospects yet</strong><p>Find and save a prospect before composing outreach.</p><a className="button" href="/prospects">Open LinkedIn prospects</a></div>:<form className="lead-form" onSubmit={e=>{e.preventDefault();void record("draft");}}>
        <label className="wide">Search prospects<input type="search" value={prospectSearch} onChange={e=>setProspectSearch(e.target.value)} placeholder="Search by name or company..."/></label><label className="wide">Prospect<select aria-label="Choose outreach prospect" value={prospectId} onChange={e=>setProspectId(e.target.value)}>{filteredLeads.map(x=><option key={x.id} value={x.id}>{x.name} · {x.company}</option>)}</select><small className="muted">{filteredLeads.length} matching prospects</small></label>
        {selected&&<div className="wide status"><strong>{selected.company}</strong> · {selected.status}{selected.url&&<> · <a href={selected.url} target="_blank" rel="noreferrer">Open LinkedIn profile ↗</a></>}</div>}
        <label>Channel<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="linkedin">LinkedIn</option><option value="email">Email</option><option value="other">Other</option></select></label>
        <label>Message type<select value={messageType} onChange={e=>setMessageType(e.target.value)}>{Object.entries(messageLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label className="wide">Reason for contacting / relevant context<textarea rows={2} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Add a genuine reason based on what you know about this business. Avoid unverified claims."/></label>
        <div className="wide"><button type="button" className="button secondary" onClick={makeDraft} disabled={!selected}>Create editable draft</button></div>
        {channel==="email"&&<label className="wide">Email subject<input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject"/></label>}
        <label className="wide">Message<textarea rows={8} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Generate a draft or write your own message."/></label>
        <label>Next follow-up date<input type="date" value={followUpDate} onChange={e=>setFollowUpDate(e.target.value)}/></label>
        <div className="wide form-footer"><span className="muted">Nothing is sent from this app.</span><div className="row"><button type="button" className="button secondary" disabled={!message.trim()} onClick={()=>void navigator.clipboard?.writeText((subject?subject+"\n\n":"")+message)}>Copy message</button><button type="submit" disabled={busy||!message.trim()}>Save draft</button><button type="button" disabled={busy||!message.trim()} onClick={()=>void record("sent")}>I sent this</button></div></div>
        <div className="wide row"><button type="button" className="button secondary" disabled={busy} onClick={()=>void logSimple("replied")}>Log a reply</button><button type="button" className="button secondary" disabled={busy} onClick={()=>void logSimple("meeting")}>Log a meeting</button></div>
      </form>}
      {notice&&<p className="status" role="status">{notice}</p>}
    </section>
    <section className="panel"><div className="section-heading"><div><h2>Follow-up reminders</h2><p className="muted">Upcoming and overdue follow-ups from your prospect pipeline.</p></div><span className="connection">{reminders.length} due soon</span></div>
      {reminders.length?<div className="lead-list">{reminders.map(x=><article className="lead" key={x.id}><div><strong>{x.name}</strong><div>{x.company}</div><small>{x.daysUntil!==null&&x.daysUntil<0?"Overdue by "+Math.abs(x.daysUntil)+" days":x.daysUntil===0?"Due today":"Due "+x.followUp} · {x.status}</small></div><button className="button secondary" onClick={()=>{setProspectId(x.id);window.scrollTo({top:0,behavior:"smooth"});}}>Open prospect</button></article>)}</div>:<div className="empty"><strong>No upcoming follow-ups</strong><p>Add a follow-up date when saving or recording an outreach activity.</p></div>}
    </section>
    <section className="panel"><div className="section-heading"><div><h2>Outreach history</h2><p className="muted">Private activity log for your account.</p></div><span className="connection">{activities.length} records</span></div>
      {activities.length?<div className="lead-list">{activities.map(x=><article className="lead" key={x.id}><div><strong>{x.name} · {x.company}</strong><small>{new Date(x.createdAt).toLocaleString()} · {x.channel} · {labelType(x.messageType)} · {x.activityType}</small>{x.subject&&<p><strong>{x.subject}</strong></p>}{x.message&&<p style={{whiteSpace:"pre-wrap"}}>{x.message}</p>}{x.notes&&<p className="muted">{x.notes}</p>}{x.followUpDate&&<small>Follow-up: {x.followUpDate}</small>}</div></article>)}</div>:<div className="empty"><strong>No outreach recorded yet</strong><p>Save your first draft or log a sent message to start the timeline.</p></div>}
    </section>
    <footer>Drafts are not delivered automatically. Confirm that you have actually sent a message before using “I sent this”.</footer>
  </main>;
}
