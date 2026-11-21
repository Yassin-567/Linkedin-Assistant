"use client";
import { useEffect, useState } from "react";
import ChatGptSettings from "@/components/ChatGptSettings";
import JobPreferencesSettings from "@/components/JobPreferencesSettings";
import CvImportSettings from "@/components/CvImportSettings";
import JsonPreferencesImport from "@/components/JsonPreferencesImport";

type Prefs = {
  linkedinProfileUrl: string; countries: string[]; industries: string[]; keywords: string[];
  jobTitles: string[]; excludedKeywords: string[]; language: string; profileSummary: string;
};
type ProfileFields = { name: string; headline: string; company: string; about: string; skills: string; experience: string; education: string };
type ProfileSource = Record<string, string>;
const defaults: Prefs = { linkedinProfileUrl: "", countries: [], industries: [], keywords: [], jobTitles: [], excludedKeywords: [], language: "English", profileSummary: "" };
const emptyProfile: ProfileFields = { name: "", headline: "", company: "", about: "", skills: "", experience: "", education: "" };
const profileLabels: Record<keyof ProfileFields, string> = {
  name: "Full name", headline: "Professional headline", company: "Current company",
  about: "About / professional summary", skills: "Skills", experience: "Experience", education: "Education"
};
function lines(value: string) { return value.split("\n"); }
function cleanLines(values: string[]) { return values.map(value => value.trim()).filter(Boolean); }
function sourceLabel(value?: string) {
  if (value === "public_linkedin_index") return "Legacy public-index context";
  if (value === "user_entered_or_edited") return "Entered or edited by you";
  return "Not found";
}

export default function SettingsPage() {
  const [p, setP] = useState<Prefs>(defaults);
  const [profile, setProfile] = useState<ProfileFields>(emptyProfile);
  const [sources, setSources] = useState<ProfileSource>({});
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [verifiedAt, setVerifiedAt] = useState("");
  const [activeTab, setActiveTab] = useState<"preferences" | "jobs" | "cv" | "chatgpt">("preferences");
  const [prospectCount, setProspectCount] = useState(50);

  useEffect(() => {
    Promise.all([
      fetch("/api/preferences", { cache: "no-store" }),
      fetch("/api/profile-verification", { cache: "no-store" })
    ]).then(async ([preferencesResponse, profileResponse]) => {
      if (preferencesResponse.status === 401 || profileResponse.status === 401) { location.href = "/login"; return; }
      const [preferencesData, profileData] = await Promise.all([preferencesResponse.json(), profileResponse.json()]);
      if (preferencesResponse.ok) { setP({ ...defaults, ...preferencesData.preferences }); const target = Number(preferencesData.preferences?.connectionTargetCount || 50); if (Number.isInteger(target) && target >= 1 && target <= 50) setProspectCount(target); }
      else setMessage(preferencesData.error || "Could not load preferences.");
      if (profileResponse.ok) {
        setProfile({ ...emptyProfile, ...(profileData.fields || {}) });
        setSources(profileData.fieldSources || {});
        setVerifiedAt(profileData.savedAt || "");
      } else setProfileMessage(profileData.error || "Could not load profile verification.");
    }).catch(() => setMessage("Could not load settings.")).finally(() => setBusy(false));
  }, []);

  function field(key: "countries" | "industries" | "keywords" | "jobTitles" | "excludedKeywords", label: string, hint: string) {
    return <label className="wide">{label}<textarea rows={3} value={p[key].join("\n")} onChange={e => setP(old => ({ ...old, [key]: lines(e.target.value) }))} /><small className="muted">{hint}</small></label>;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage("");
    try {
      const r = await fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ...p,
        connectionTargetCount: prospectCount,
        countries: cleanLines(p.countries),
        industries: cleanLines(p.industries),
        keywords: cleanLines(p.keywords),
        jobTitles: cleanLines(p.jobTitles),
        excludedKeywords: cleanLines(p.excludedKeywords)
      }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Save failed.");
      setMessage("Your preferences have been saved and will be used by your external AI research prompts.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); }
    finally { setSaving(false); }
  }

  async function saveProfileContext() {
    setConfirming(true); setProfileMessage("");
    try {
      const r = await fetch("/api/profile-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: profile }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not confirm profile.");
      setSources(d.fieldSources || {}); setVerifiedAt(d.savedAt || "");
      setP(old => ({ ...old, profileSummary: d.summary || old.profileSummary }));
      setProfileMessage("Professional context saved. Your external AI research prompts can now use it to personalize outreach.");
    } catch (error) { setProfileMessage(error instanceof Error ? error.message : "Could not confirm profile."); }
    finally { setConfirming(false); }
  }



  return <main className="workspace">
    <header className="topbar"><div><div className="eyebrow">WORKSPACE CONFIGURATION</div><h1>Settings</h1><p className="muted">Manage research preferences, professional background and your AI prompt connection.</p></div><div className="row"><a className="button secondary" href="/">Back to workspace</a></div></header>
    <nav aria-label="Settings sections" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, padding: 5, border: "1px solid #e1e8e9", borderRadius: 12, background: "#fff" }}>
      <button type="button" onClick={() => setActiveTab("preferences")} aria-selected={activeTab === "preferences"} style={{ flex: 1, minWidth: 150, background: activeTab === "preferences" ? "#087b5b" : "transparent", color: activeTab === "preferences" ? "#fff" : "#52635b" }}>LinkedIn research preferences</button>
      <button type="button" onClick={() => setActiveTab("jobs")} aria-selected={activeTab === "jobs"} style={{ flex: 1, minWidth: 150, background: activeTab === "jobs" ? "#087b5b" : "transparent", color: activeTab === "jobs" ? "#fff" : "#52635b" }}>Job preferences</button>
      <button type="button" onClick={() => setActiveTab("cv")} aria-selected={activeTab === "cv"} style={{ flex: 1, minWidth: 150, background: activeTab === "cv" ? "#087b5b" : "transparent", color: activeTab === "cv" ? "#fff" : "#52635b" }}>AI Imports</button>
      <button type="button" onClick={() => setActiveTab("chatgpt")} aria-selected={activeTab === "chatgpt"} style={{ flex: 1, minWidth: 150, background: activeTab === "chatgpt" ? "#087b5b" : "transparent", color: activeTab === "chatgpt" ? "#fff" : "#52635b" }}>ChatGPT connection</button>
    </nav>
    {activeTab === "chatgpt" && <>
    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">CHATGPT INTEGRATION</div><h2>ChatGPT connection and prompt builder</h2><p className="muted">Manage one Access Token and generate job-discovery and LinkedIn connection-research prompts. The commercial Leads workspace has its own ChatGPT research prompt and save workflow.</p></div></div>


      <ChatGptSettings />
    </section>

    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">PROMPT GATEWAY</div><h2>How the connection works</h2><p className="muted">Copy a workflow link from the ChatGPT connection panel. The permanent AI token is used only to open that link. Inlinked then returns the selected research prompt and a temporary 15-minute session token. Context, Save and Update APIs accept the temporary token, not the permanent credential.</p></div></div>
      <p className="footnote">The prompt link is a secret: anyone who has it can open it from a browser and create a temporary session for this account. Regenerating or revoking the permanent AI token invalidates future prompt-link requests and revokes active sessions.</p>
    </section>
    </>}

    {activeTab === "jobs" && <JobPreferencesSettings />}

    {activeTab === "cv" && <><CvImportSettings /><JsonPreferencesImport /></>}

    {activeTab === "preferences" && <>
    <section className="panel"><form className="lead-form" onSubmit={save}>
      <label className="wide">Your LinkedIn profile URL<input type="url" value={p.linkedinProfileUrl} onChange={e => setP(old => ({ ...old, linkedinProfileUrl: e.target.value }))} placeholder="https://www.linkedin.com/in/your-profile/" /><small className="muted">This URL is provided as context to your external AI research assistant. Inlinked does not search LinkedIn or access private profile content.</small></label>
      {field("countries", "Target countries and locations", "One country or area per line. Leave blank if you want to enter a location for each search.")}
      {field("industries", "Target industries", "One industry per line. These become your default search topics.")}
      {field("keywords", "Interests and search keywords", "Skills, services, topics or phrases that should guide discovery.")}
      {field("jobTitles", "People and job titles", "Examples: Founder, Owner, Managing Director, Recruiter, Engineer.")}
      {field("excludedKeywords", "Exclude keywords", "Profiles or companies containing these terms will be filtered out where possible.")}
      <label className="wide">LinkedIn connections to target per research run<input type="number" min={1} max={50} step={1} value={prospectCount} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 50) { setProspectCount(n); } }} /><small className="muted">Choose 1–50. ChatGPT may return fewer when fewer qualified connection candidates are available. This target count is saved to your Inlinked account and loaded by the prompt gateway.</small></label>
      <label className="wide">Preferred language<input value={p.language} onChange={e => setP(old => ({ ...old, language: e.target.value }))} /></label>
      <label className="wide">About me / additional interests<textarea rows={5} value={p.profileSummary} onChange={e => setP(old => ({ ...old, profileSummary: e.target.value }))} placeholder="Add a short description of your background, skills, interests or the people you want to meet." /><small className="muted">This is your editable context for LinkedIn connection matching. Confirmed profile details below can update this summary.</small></label>
      <div className="wide form-footer"><span className="muted">{busy ? "Loading settings..." : message}</span><button disabled={busy || saving}>{saving ? "Saving..." : "Save preferences"}</button></div>
    </form></section>

    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">YOUR PROFESSIONAL CONTEXT</div><h2>Background for personalized outreach</h2><p className="muted">Enter or correct your professional background manually. External AI research prompts use this context to recommend relevant connection messages, commercial outreach and job application notes.</p></div></div>
      <div className="lead-form">
        {(Object.keys(profileLabels) as (keyof ProfileFields)[]).map(key => <label key={key}>{profileLabels[key]}<textarea rows={key === "about" || key === "experience" ? 4 : 2} value={profile[key]} onChange={e => setProfile(old => ({ ...old, [key]: e.target.value }))} placeholder={sources[key] === "not_found" ? "Not found. You can enter this manually." : "Review and correct this information."} /><small className="muted">Source: {sourceLabel(sources[key])}</small></label>)}
      </div>
      <div className="form-footer"><span className="muted">{profileMessage}{verifiedAt ? " · Last saved: " + new Date(verifiedAt).toLocaleString() : ""}</span><button type="button" onClick={() => void saveProfileContext()} disabled={confirming}>{confirming ? "Saving professional context..." : "Save professional context"}</button></div>
      <p className="footnote">These details are supplied by you and are not independently verified by Inlinked. Keep them accurate; AI assistants must not claim experience or qualifications you have not confirmed.</p>
    </section>
    </>}
  </main>;
}
