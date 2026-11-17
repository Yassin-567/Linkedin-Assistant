"use client";
import { useEffect, useState } from "react";
type Overview={discovered:number;qualified:number;contacted:number;replies:number;meetings:number;clients:number;replyRate:number;meetingRate:number;clientRate:number};
type Breakdown={industry?:string;messageType?:string;prospects?:number;responses?:number;clients?:number;sent?:number;replies?:number;meetings?:number};
type NextAction={id:string;name:string;company:string;status:string;followUp:string;daysUntil:number|null};
const labels:Record<string,string>={connection_request:"LinkedIn connection request",linkedin_follow_up:"LinkedIn follow-up",email_intro:"Email introduction",email_follow_up:"Email follow-up",other:"Other"};
export default function AnalyticsPage(){
 const [data,setData]=useState<any>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch("/api/dashboard",{cache:"no-store"}).then(async r=>{if(r.status===401){location.href="/login";return;}const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load analytics.");setData(d);}).catch(e=>setError(e instanceof Error?e.message:"Could not load analytics.")).finally(()=>setLoading(false));},[]);
 const o:Overview=data?.overview||{discovered:0,qualified:0,contacted:0,replies:0,meetings:0,clients:0,replyRate:0,meetingRate:0,clientRate:0};
 const weeklyTotal=(data?.weeklyActivity||[]).reduce((n:number,x:any)=>n+Number(x.count||0),0);
 return <main className="workspace">
  <header className="topbar"><div><div className="eyebrow">PHASE 6 · CLIENT ACQUISITION</div><h1>Acquisition dashboard</h1><p className="muted">See how prospects move from discovery to conversations and clients.</p></div><a className="button secondary" href="/">Back to pipeline</a></header>
  {loading?<section className="panel">Loading your private metrics...</section>:error?<section className="panel"><p className="status">{error}</p></section>:<>
   <section className="stats">
    <div className="stat"><span>Discovered</span><strong>{o.discovered}</strong></div>
    <div className="stat"><span>Qualified</span><strong>{o.qualified}</strong></div>
    <div className="stat"><span>Contacted</span><strong>{o.contacted}</strong></div>
    <div className="stat"><span>Replies</span><strong>{o.replies}</strong></div>
    <div className="stat"><span>Meetings</span><strong>{o.meetings}</strong></div>
    <div className="stat"><span>Clients won</span><strong>{o.clients}</strong></div>
    <div className="stat"><span>Reply rate</span><strong>{o.replyRate}%</strong></div>
    <div className="stat"><span>Meeting rate</span><strong>{o.meetingRate}%</strong></div>
   </section>
   <section className="panel"><div className="section-heading"><div><h2>Conversion performance</h2><p className="muted">Rates are based on the current prospect statuses in your private pipeline.</p></div></div>
    <div className="stats"><div className="stat"><span>Contacted → reply</span><strong>{o.replyRate}%</strong></div><div className="stat"><span>Contacted → meeting</span><strong>{o.meetingRate}%</strong></div><div className="stat"><span>Contacted → client</span><strong>{o.clientRate}%</strong></div><div className="stat"><span>Activities this week</span><strong>{weeklyTotal}</strong></div></div>
   </section>
   <section className="panel"><h2>Industries in your pipeline</h2><p className="muted">Outcomes are grouped by the industry recorded on each prospect. Add industry details to improve this view.</p>
    {data.industryPerformance?.length?<div className="lead-list">{data.industryPerformance.map((x:Breakdown,i:number)=><article className="lead" key={x.industry}><div><strong>{x.industry}</strong><small>{x.prospects} prospects · {x.responses} replies/meetings · {x.clients} clients</small></div></article>)}</div>:<div className="empty">No industry data recorded yet. Add industries to prospects as you qualify them.</div>}
   </section>
   <section className="panel"><h2>Message performance</h2><p className="muted">Track which outreach formats are producing replies and meetings.</p>
    {data.messagePerformance?.length?<div className="lead-list">{data.messagePerformance.map((x:Breakdown)=><article className="lead" key={x.messageType}><div><strong>{labels[x.messageType||""]||x.messageType}</strong><small>{x.sent} sent · {x.replies} replies · {x.meetings} meetings</small></div></article>)}</div>:<div className="empty">No sent messages recorded yet.</div>}
   </section>
   <section className="panel"><h2>Weekly activity</h2><p className="muted">Outreach actions recorded in the last seven days.</p>
    {data.weeklyActivity?.length?<div className="lead-list">{data.weeklyActivity.map((x:any)=><article className="lead" key={x.type}><div style={{width:"100%"}}><div className="row"><strong>{String(x.type).charAt(0).toUpperCase()+String(x.type).slice(1)}</strong><strong>{x.count}</strong></div><div style={{height:8,background:"#edf3f0",borderRadius:8,overflow:"hidden"}}><div style={{height:8,width:Math.max(4,Math.round(Number(x.count)/weeklyTotal*100))+"%",background:"#087b5b",borderRadius:8}}/></div></div></article>)}</div>:<div className="empty">No activity recorded in the last seven days.</div>}
   </section>
   <section className="panel"><div className="section-heading"><div><h2>Next actions</h2><p className="muted">Overdue and upcoming follow-ups.</p></div><a className="button secondary" href="/outreach">Open outreach</a></div>
    {data.nextActions?.length?<div className="lead-list">{data.nextActions.map((x:NextAction)=><article className="lead" key={x.id}><div><strong>{x.name}</strong><div>{x.company}</div><small>{x.daysUntil!==null&&x.daysUntil<0?"Overdue by "+Math.abs(x.daysUntil)+" days":x.daysUntil===0?"Due today":"Due "+x.followUp} · {x.status}</small></div><a href="/outreach">Follow up ↗</a></article>)}</div>:<div className="empty">No upcoming follow-ups. Add dates in the outreach workspace.</div>}
   </section>
  </>}
  <footer>Metrics are based on information recorded in this workspace. They are not estimates of untracked activity.</footer>
 </main>;
}
