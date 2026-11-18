"use client";
import { useEffect, useState } from "react";
import ChatGptSettings from "@/components/ChatGptSettings";

type Prefs = {
  linkedinProfileUrl: string; countries: string[]; industries: string[]; keywords: string[];
  jobTitles: string[]; excludedKeywords: string[]; language: string; profileSummary: string;
};
type ProfileFields = { name: string; headline: string; company: string; about: string; skills: string; experience: string; education: string };
type ProfileSource = Record<string, string>;
const defaults: Prefs = { linkedinProfileUrl: "", countries: [], industries: [], keywords: [], jobTitles: [], excludedKeywords: [], language: "English", profileSummary: "" };
const emptyProfile: ProfileFields = { name: "", headline: "", company: "", about: "", skills: "", experience: "", education: "" };
const assistantSaveExample = JSON.stringify({ leads: [{ name: "Full name", company: "Company name", linkedin: "https://www.linkedin.com/in/profile-slug/" }] }, null, 2);
const profileLabels: Record<keyof ProfileFields, string> = {
  name: "Full name", headline: "Professional headline", company: "Current company",
  about: "Public search snippet / About context", skills: "Skills", experience: "Experience", education: "Education"
};
function lines(value: string) { return value.split("\n").map(x => x.trim()).filter(Boolean); }
function sourceLabel(value?: string) {
  if (value === "public_linkedin_index") return "Public LinkedIn search result";
  if (value === "user_entered_or_edited") return "Entered or edited by you";
  return "Not found";
}

export default function SettingsPage() {
  const [p, setP] = useState<Prefs>(defaults);
  const [profile, setProfile] = useState<ProfileFields>(emptyProfile);
  const [sources, setSources] = useState<ProfileSource>({});
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [verifiedAt, setVerifiedAt] = useState("");
  const [activeTab, setActiveTab] = useState<"preferences" | "chatgpt">("preferences");
  const [prospectCount, setProspectCount] = useState(50);

  useEffect(() => {
    const savedCount = Number(localStorage.getItem("inlinked_prospect_count"));
    if (Number.isInteger(savedCount) && savedCount >= 1 && savedCount <= 50) setProspectCount(savedCount);
    Promise.all([
      fetch("/api/preferences", { cache: "no-store" }),
      fetch("/api/profile-verification", { cache: "no-store" })
    ]).then(async ([preferencesResponse, profileResponse]) => {
      if (preferencesResponse.status === 401 || profileResponse.status === 401) { location.href = "/login"; return; }
      const [preferencesData, profileData] = await Promise.all([preferencesResponse.json(), profileResponse.json()]);
      if (preferencesResponse.ok) setP({ ...defaults, ...preferencesData.preferences });
      else setMessage(preferencesData.error || "Could not load preferences.");
      if (profileResponse.ok) {
        setProfile({ ...emptyProfile, ...(profileData.fields || {}) });
        setSources(profileData.fieldSources || {});
        setVerifiedAt(profileData.verifiedAt || "");
      } else setProfileMessage(profileData.error || "Could not load profile verification.");
    }).catch(() => setMessage("Could not load settings.")).finally(() => setBusy(false));
  }, []);

  function field(key: "countries" | "industries" | "keywords" | "jobTitles" | "excludedKeywords", label: string, hint: string) {
    return <label className="wide">{label}<textarea rows={3} value={p[key].join("\n")} onChange={e => setP(old => ({ ...old, [key]: lines(e.target.value) }))} /><small className="muted">{hint}</small></label>;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage("");
    try {
      const r = await fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Save failed.");
      setMessage("Your preferences have been saved. You can now inspect the LinkedIn profile URL.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); }
    finally { setSaving(false); }
  }

  async function inspectProfile() {
    setInspecting(true); setProfileMessage("");
    try {
      const r = await fetch("/api/profile-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "inspect" }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not inspect profile.");
      setProfile({ ...emptyProfile, ...(d.fields || {}) }); setSources(d.fieldSources || {});
      setProfileMessage(d.message || "Inspection complete. Review every field before confirming.");
    } catch (error) { setProfileMessage(error instanceof Error ? error.message : "Could not inspect profile."); }
    finally { setInspecting(false); }
  }

  async function confirmProfile() {
    setConfirming(true); setProfileMessage("");
    try {
      const r = await fetch("/api/profile-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", fields: profile }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not confirm profile.");
      setSources(d.fieldSources || {}); setVerifiedAt(d.verifiedAt || "");
      setP(old => ({ ...old, profileSummary: d.summary || old.profileSummary }));
      setProfileMessage("Profile details confirmed and saved. Lead matching will now use this summary.");
    } catch (error) { setProfileMessage(error instanceof Error ? error.message : "Could not confirm profile."); }
    finally { setConfirming(false); }
  }


  async function copyText(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("Copied endpoint. Replace the token placeholder before sending."); }
    catch { setMessage("Copy was blocked. Select the endpoint text and copy it manually."); }
  }

  return <main className="workspace">
    <header className="topbar"><div><div className="eyebrow">WORKSPACE CONFIGURATION</div><h1>Settings</h1><p className="muted">Manage your prospecting preferences separately from your ChatGPT connection and API tools.</p></div><div className="row"><a className="button secondary" href="/intelligence">AI Lead Intelligence</a><a className="button secondary" href="/">Back to workspace</a></div></header>
    <nav aria-label="Settings sections" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, padding: 5, border: "1px solid #e1e8e9", borderRadius: 12, background: "#fff" }}>
      <button type="button" onClick={() => setActiveTab("preferences")} aria-selected={activeTab === "preferences"} style={{ flex: 1, minWidth: 150, background: activeTab === "preferences" ? "#087b5b" : "transparent", color: activeTab === "preferences" ? "#fff" : "#52635b" }}>Preferences</button>
      <button type="button" onClick={() => setActiveTab("chatgpt")} aria-selected={activeTab === "chatgpt"} style={{ flex: 1, minWidth: 150, background: activeTab === "chatgpt" ? "#087b5b" : "transparent", color: activeTab === "chatgpt" ? "#fff" : "#52635b" }}>ChatGPT connection</button>
    </nav>
    {activeTab === "chatgpt" && <>
    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">CHATGPT INTEGRATION</div><h2>ChatGPT connection and prompt builder</h2><p className="muted">Manage tokens, generate research prompts, choose a prospect target, and configure recurring schedules here.</p></div></div>
      <label className="wide">Prospects to target per prompt
        <input type="number" min={1} max={50} step={1} value={prospectCount} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 50) { setProspectCount(n); localStorage.setItem("inlinked_prospect_count", String(n)); } }} />
        <small className="muted">Choose 1–50. This count is included in both Quick Session and Permanent Token prompts, for one-time or recurring research. ChatGPT may save fewer if fewer qualified prospects are found.</small>
      </label>
      <ChatGptSettings prospectCount={prospectCount} />
    </section>

    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">API REFERENCE</div><h2>Endpoints and request examples</h2><p className="muted">Copy these examples into your HTTP client. Replace the placeholder token with your own token. Use the permanent token exchange to obtain temporary URLs for the context and save requests.</p></div></div>
      <div className="lead-form">
        <label className="wide">1. Exchange your permanent token for temporary access
          <pre className="prompt-box">POST https://inlinked.vercel.app/api/assistant-credentials
Authorization: Bearer YOUR_PERMANENT_AI_TOKEN</pre><button type="button" className="secondary" onClick={() => void copyText("https://inlinked.vercel.app/api/assistant-credentials")}>Copy POST URL</button>
          <small className="muted">POST only. Returns contextEndpoint and saveEndpoint URLs containing a 10-minute access token.</small>
        </label>
        <label className="wide">2. Read your search context
          <pre className="prompt-box">GET https://inlinked.vercel.app/api/assistant-context?access=YOUR_10_MINUTE_ACCESS_TOKEN</pre><button type="button" className="secondary" onClick={() => void copyText("https://inlinked.vercel.app/api/assistant-context?access=YOUR_10_MINUTE_ACCESS_TOKEN")}>Copy GET URL</button>
          <small className="muted">GET only. Alternatively send the token in the Authorization: Bearer YOUR_10_MINUTE_ACCESS_TOKEN header.</small>
        </label>
        <label className="wide">3. Save prospects
          <pre className="prompt-box">POST https://inlinked.vercel.app/api/assistant-save?access=YOUR_10_MINUTE_ACCESS_TOKEN
Content-Type: application/json

{assistantSaveExample}</pre>
          <button type="button" className="secondary" onClick={() => void copyText("https://inlinked.vercel.app/api/assistant-save?access=YOUR_10_MINUTE_ACCESS_TOKEN")}>Copy POST URL</button><small className="muted">POST only. Send the same token in the Authorization: Bearer header if you prefer. Accepts 1–50 leads.</small>
        </label>
        <label className="wide">4. Example permanent-token exchange response
          <pre className="prompt-box">&#123;
  "ok": true,
  "contextEndpoint": "https://inlinked.vercel.app/api/assistant-context?access=TEMPORARY_TOKEN",
  "saveEndpoint": "https://inlinked.vercel.app/api/assistant-save?access=TEMPORARY_TOKEN",
  "expiresInSeconds": 600
&#125;</pre>
          <small className="muted">The temporary token expires after 10 minutes. Never share a real token or paste it into a public URL.</small>
        </label>
      </div>
      {message && <p className="muted" role="status">{message}</p>}
    </section>
    </>}

    {activeTab === "preferences" && <>
    <section className="panel"><form className="lead-form" onSubmit={save}>
      <label className="wide">Your LinkedIn profile URL<input type="url" value={p.linkedinProfileUrl} onChange={e => setP(old => ({ ...old, linkedinProfileUrl: e.target.value }))} placeholder="https://www.linkedin.com/in/your-profile/" /><small className="muted">The app checks public search results for this exact profile. A URL does not grant access to private LinkedIn content.</small></label>
      {field("countries", "Target countries and locations", "One country or area per line. Leave blank if you want to enter a location for each search.")}
      {field("industries", "Target industries", "One industry per line. These become your default search topics.")}
      {field("keywords", "Interests and search keywords", "Skills, services, topics or phrases that should guide discovery.")}
      {field("jobTitles", "People and job titles", "Examples: Founder, Owner, Managing Director, Recruiter, Engineer.")}
      {field("excludedKeywords", "Exclude keywords", "Profiles or companies containing these terms will be filtered out where possible.")}
      <label className="wide">Prospects to target per research run<input type="number" min={1} max={50} step={1} value={prospectCount} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 50) { setProspectCount(n); localStorage.setItem("inlinked_prospect_count", String(n)); } }} /><small className="muted">Choose 1–50. ChatGPT may return fewer when fewer qualified prospects are available. This preference is saved in this browser.</small></label>
      <label className="wide">Preferred language<input value={p.language} onChange={e => setP(old => ({ ...old, language: e.target.value }))} /></label>
      <label className="wide">About me / additional interests<textarea rows={5} value={p.profileSummary} onChange={e => setP(old => ({ ...old, profileSummary: e.target.value }))} placeholder="Add a short description of your background, skills, interests or the people you want to meet." /><small className="muted">This is your editable context for lead matching. Confirmed profile details below can update this summary.</small></label>
      <div className="wide form-footer"><span className="muted">{busy ? "Loading settings..." : message}</span><button disabled={busy || saving}>{saving ? "Saving..." : "Save preferences"}</button></div>
    </form></section>

    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">PROFILE VERIFICATION</div><h2>Check what LinkedIn information was actually found</h2><p className="muted">The app only uses public search results. It will show missing sections instead of filling them with guesses.</p></div></div>
      <div className="row"><button type="button" onClick={() => void inspectProfile()} disabled={busy || inspecting || !p.linkedinProfileUrl.trim()}>{inspecting ? "Checking public results..." : "Inspect my LinkedIn profile"}</button><span className="muted">Save your LinkedIn URL above before inspecting.</span></div>
      <div className="lead-form">
        {(Object.keys(profileLabels) as (keyof ProfileFields)[]).map(key => <label key={key}>{profileLabels[key]}<textarea rows={key === "about" || key === "experience" ? 4 : 2} value={profile[key]} onChange={e => setProfile(old => ({ ...old, [key]: e.target.value }))} placeholder={sources[key] === "not_found" ? "Not found. You can enter this manually." : "Review and correct this information."} /><small className="muted">Source: {sourceLabel(sources[key])}</small></label>)}
      </div>
      <div className="form-footer"><span className="muted">{profileMessage}{verifiedAt ? " · Last confirmed: " + new Date(verifiedAt).toLocaleString() : ""}</span><button type="button" onClick={() => void confirmProfile()} disabled={confirming || inspecting}>{confirming ? "Saving confirmed details..." : "Confirm and save profile details"}</button></div>
      <p className="footnote">The name and headline may come from a public LinkedIn search result. The snippet is not necessarily the full About section. Skills, experience and education may not be publicly indexed. Fields you change or enter are labelled as user-provided.</p>
    </section>
    </>}
  </main>;
}
