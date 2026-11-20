"use client";
import { useEffect, useState } from "react";
type Lead = { status: string };
type Account = { connected: boolean; profile?: { name?: string; email?: string } };
export default function Home() {
 const [account,setAccount]=useState<Account>({connected:false});
 const [leads,setLeads]=useState<Lead[]>([]);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{let cancelled=false;async function load(){try{const a=await fetch("/api/auth/me",{cache:"no-store"});const user=await a.json();if(cancelled)return;setAccount(user);if(user.connected){const r=await fetch("/api/prospects",{cache:"no-store"});if(r.ok){const d=await r.json();if(!cancelled)setLeads(Array.isArray(d.leads)?d.leads:[]);}}else{const stored=JSON.parse(localStorage.getItem("linkedin-assistant-leads")||"[]");if(!cancelled)setLeads(Array.isArray(stored)?stored:[]);}}catch(e){console.error("Could not load dashboard summary",e);}finally{if(!cancelled)setLoading(false);}}void load();return()=>{cancelled=true;}},[]);
 const firstName=account.profile?.name?.split(" ")[0]||"there";
 return <main className="workspace">
 <header className="topbar"><div><div className="eyebrow">YOUR CLIENT PIPELINE</div><h1>Welcome back, {firstName}</h1><p className="muted">Your workspace for finding the right businesses, building relationships, and turning conversations into clients.</p></div><div className="row"><span className={account.connected?"connection connected":"connection"}>{account.connected?"● Account connected":"○ Sign in required"}</span>{!account.connected&&<a className="button" href="/api/auth/google">Sign in with Google</a>}</div></header>
 <section className="stats" aria-label="Prospect pipeline summary">
 <div className="stat"><span>LinkedIn connections</span><strong>{loading?"—":leads.length}</strong></div><div className="stat"><span>Ready to contact</span><strong>{loading?"—":leads.filter(x=>x.status==="Ready to contact").length}</strong></div><div className="stat"><span>Awaiting replies</span><strong>{loading?"—":leads.filter(x=>x.status==="Contacted").length}</strong></div><div className="stat"><span>Clients won</span><strong>{loading?"—":leads.filter(x=>x.status==="Client").length}</strong></div></section>
 <section className="panel"><div className="section-heading"><div><h2>Build your pipeline</h2><p className="muted">Choose what you want to work on next.</p></div></div><div className="dashboard-actions">
 <a className="dashboard-action primary" href="/leads"><span className="dashboard-action-icon">◉</span><strong>Discover customer leads</strong><small>Find demand and potential customers for your products or services.</small><span className="dashboard-action-link">Open Leads →</span></a>
 <a className="dashboard-action" href="/prospects"><span className="dashboard-action-icon">◎</span><strong>Manage LinkedIn connections</strong><small>Review saved professionals, update statuses, and plan follow-ups.</small><span className="dashboard-action-link">Open connections →</span></a>
 <a className="dashboard-action" href="/outreach"><span className="dashboard-action-icon">✉</span><strong>Manage outreach</strong><small>Prepare and track messages and follow-up activity.</small><span className="dashboard-action-link">Open outreach →</span></a>
 <a className="dashboard-action" href="/analytics"><span className="dashboard-action-icon">▥</span><strong>View analytics</strong><small>Understand your pipeline and prospecting progress.</small><span className="dashboard-action-link">View insights →</span></a>
 </div></section>
 <section className="panel dashboard-settings"><div><h2>Workspace setup</h2><p className="muted">Configure your target markets, prospecting preferences, and ChatGPT connection in one place.</p></div><a className="button secondary" href="/settings">Open settings</a></section><footer>Inlinked · Business development workspace</footer></main>;
}