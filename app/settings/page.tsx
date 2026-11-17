"use client";
import { useEffect,useState } from "react";
type Prefs={linkedinProfileUrl:string;countries:string[];industries:string[];keywords:string[];jobTitles:string[];excludedKeywords:string[];language:string;profileSummary:string};
const defaults:Prefs={linkedinProfileUrl:"",countries:[],industries:[],keywords:[],jobTitles:[],excludedKeywords:[],language:"English",profileSummary:""};
function lines(v:string){return v.split("\n").map(x=>x.trim()).filter(Boolean);}
export default function SettingsPage(){
 const [p,setP]=useState<Prefs>(defaults),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{fetch("/api/preferences",{cache:"no-store"}).then(async r=>{if(r.status===401){location.href="/login";return;}const d=await r.json();if(r.ok)setP({...defaults,...d.preferences});else setMessage(d.error||"Could not load preferences.");}).catch(()=>setMessage("Could not load preferences.")).finally(()=>setBusy(false));},[]);
 function field(key:"countries"|"industries"|"keywords"|"jobTitles"|"excludedKeywords",label:string,hint:string){return <label className="wide">{label}<textarea rows={3} value={p[key].join("\n")} onChange={e=>setP(old=>({...old,[key]:lines(e.target.value)}))}/><small className="muted">{hint}</small></label>;}
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setMessage("");try{const r=await fetch("/api/preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Save failed.");setMessage("Your preferences have been saved.");}catch(e){setMessage(e instanceof Error?e.message:"Save failed.");}finally{setSaving(false);}}
 return <main className="workspace"><header className="topbar"><div><div className="eyebrow">PERSONALIZE DISCOVERY</div><h1>Search settings</h1><p className="muted">Your settings guide searches by default. You can still narrow or change each search.</p></div><a className="button secondary" href="/">Back to workspace</a></header><section className="panel"><form className="lead-form" onSubmit={save}>
 <label className="wide">Your LinkedIn profile URL<input type="url" value={p.linkedinProfileUrl} onChange={e=>setP(old=>({...old,linkedinProfileUrl:e.target.value}))} placeholder="https://www.linkedin.com/in/your-profile/"/><small className="muted">The assistant will look for publicly indexed information from this profile to understand your professional interests. A URL does not grant access to private LinkedIn content.</small></label>
 {field("countries","Target countries and locations","One country or area per line. Leave blank if you want to enter a location for each search.")}
 {field("industries","Target industries","One industry per line. These become your default search topics.")}
 {field("keywords","Interests and search keywords","Skills, services, topics or phrases that should guide discovery.")}
 {field("jobTitles","People and job titles","Examples: Founder, Owner, Managing Director, Recruiter, Engineer.")}
 {field("excludedKeywords","Exclude keywords","Profiles or companies containing these terms will be filtered out where possible.")}
 <label className="wide">Preferred language<input value={p.language} onChange={e=>setP(old=>({...old,language:e.target.value}))}/></label>
 <label className="wide">About me / additional interests<textarea rows={5} value={p.profileSummary} onChange={e=>setP(old=>({...old,profileSummary:e.target.value}))} placeholder="Add a short description of your background, skills, interests or the people you want to meet. This is optional."/><small className="muted">Use this if your LinkedIn profile is not publicly indexed or you want to give the assistant more context.</small></label>
 <div className="wide form-footer"><span className="muted">{busy?"Loading settings...":message}</span><button disabled={busy||saving}>{saving?"Saving...":"Save preferences"}</button></div>
 </form></section></main>;
}
