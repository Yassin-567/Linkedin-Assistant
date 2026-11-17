"use client";
import { useEffect, useState } from "react";
type Connection={id:string;name:string;url:string;email:string;company:string;position:string;connectedOn:string};
function parseCsv(text:string):string[][]{const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=!quoted;else if(ch===","&&!quoted){row.push(cell);cell="";}else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(cell);cell="";if(row.some(x=>x.trim()))rows.push(row);row=[];}else cell+=ch;}row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;}
function canonicalUrl(value:string){try{const u=new URL(value.trim());if(!/(^|\.)linkedin\.com$/i.test(u.hostname)||!u.pathname.toLowerCase().startsWith("/in/"))return "";return "https://www.linkedin.com"+u.pathname.replace(/\/$/,"").toLowerCase();}catch{return "";}}
export default function ConnectionsPage(){
 const[count,setCount]=useState(0),[importedAt,setImportedAt]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[connected,setConnected]=useState(false);
 useEffect(()=>{fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.json()).then(d=>setConnected(!!d.connected)).catch(()=>{});fetch("/api/connections",{cache:"no-store"}).then(async r=>{if(!r.ok)return;const d=await r.json();setCount(d.count||0);setImportedAt(d.importedAt||"");}).catch(()=>{});},[]);
 async function importFile(file?:File){if(!file)return;setBusy(true);setMessage("");try{
  if(!file.name.toLowerCase().endsWith(".csv"))throw new Error("Please upload the Connections.csv file exported by LinkedIn.");
  const rows=parseCsv((await file.text()).replace(/^\uFEFF/,""));if(rows.length<2)throw new Error("The CSV appears to be empty.");
  const headers=rows[0].map(x=>x.trim().toLowerCase());const index=(...names:string[])=>headers.findIndex(h=>names.includes(h));
  const first=index("first name"),last=index("last name"),urlIndex=index("url","profile url");if(first<0||last<0||urlIndex<0)throw new Error("Expected LinkedIn CSV columns: First Name, Last Name and URL.");
  const email=index("email address","email"),company=index("company"),position=index("position"),date=index("connected on");const map=new Map<string,Connection>();
  for(const row of rows.slice(1)){const url=canonicalUrl(row[urlIndex]||"");if(!url)continue;map.set(url,{id:url,name:[row[first],row[last]].filter(Boolean).join(" ").trim(),url,email:email>=0?row[email]||"":"",company:company>=0?row[company]||"":"",position:position>=0?row[position]||"":"",connectedOn:date>=0?row[date]||"":""});}
  const connections=[...map.values()];if(!connections.length)throw new Error("No LinkedIn profile URLs were found in this file.");
  const response=await fetch("/api/connections",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({connections})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Import failed.");
  setCount(result.count);setImportedAt(result.importedAt);
  const pr=await fetch("/api/prospects",{cache:"no-store"});let marked=0;
  if(pr.ok){const cloud=await pr.json();const leads=Array.isArray(cloud.leads)?cloud.leads:[];const byUrl=new Map(connections.map(c=>[c.url,c]));for(const lead of leads){const match=byUrl.get(canonicalUrl(lead.url||""));if(!match)continue;marked++;if(lead.connected&&lead.connectedOn===(match.connectedOn||""))continue;const w=await fetch("/api/prospects",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...lead,connected:true,connectedOn:match.connectedOn||lead.connectedOn||""})});if(!w.ok)throw new Error("Connections imported, but a matching prospect could not be updated. Reload and retry.");}}

  setMessage("Imported "+result.count.toLocaleString()+" connections. "+marked+" saved prospects marked Connected; pipeline statuses and notes were preserved.");
 }catch(e){setMessage(e instanceof Error?e.message:"Import failed.");}finally{setBusy(false);}}
 return <main className="workspace"><div className="topbar"><div><div className="eyebrow">DUPLICATE PROTECTION</div><h1>Existing connections</h1><p className="muted">Import your LinkedIn connections so prospects can be checked before saving.</p></div><a className="button secondary" href="/">Back to pipeline</a></div>
 <section className="panel">{!connected&&<p className="status">Sign in with Google from the main page to enable private cloud storage.</p>}<h2>Upload LinkedIn Connections.csv</h2>
 <p className="muted">Matching uses LinkedIn profile URLs. Saved prospects that match are marked Connected without changing their pipeline status, notes or follow-up date.</p>
 <label className="upload-box"><span>{busy?"Importing...":"Choose Connections.csv"}<input type="file" accept=".csv,text/csv" disabled={busy||!connected} onChange={e=>{void importFile(e.target.files?.[0]);e.currentTarget.value="";}}/></span></label>
 <div className="stats"><div className="stat"><span>Imported connections</span><strong>{count.toLocaleString()}</strong></div><div className="stat"><span>Last import</span><strong style={{fontSize:14}}>{importedAt?new Date(importedAt).toLocaleString():"Not imported yet"}</strong></div></div>
 {message&&<p className="status" role="status">{message}</p>}<p className="footnote">Each upload replaces the previous connection snapshot. Export and upload the full Connections.csv file. Your file remains private.</p></section><footer>No connection requests are sent automatically.</footer></main>;
}