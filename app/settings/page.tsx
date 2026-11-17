"use client";
import { useEffect, useState } from "react";

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
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiCreatedAt, setAiCreatedAt] = useState("");
  const [aiEndpoint, setAiEndpoint] = useState("");
  const [aiContextEndpoint, setAiContextEndpoint] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("");

  useEffect(() => {
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

  useEffect(() => {
    fetch("/api/assistant-ai-token", { cache: "no-store" })
      .then(async r => {
        if (r.status === 401) return;
        const d = await r.json();
        if (r.ok) { setAiEnabled(Boolean(d.enabled)); setAiCreatedAt(d.createdAt || ""); }
      })
      .catch(() => setAiMessage("Could not check AI connection status."));
  }, []);

  async function generateAiConnection() {
    setAiBusy(true); setAiMessage(""); setAiEndpoint(""); setAiContextEndpoint("");
    try {
      const r = await fetch("/api/assistant-ai-token", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not generate the connection.");
      setAiEnabled(true); setAiCreatedAt(new Date().toISOString()); setAiEndpoint(d.endpoint); setAiContextEndpoint(d.contextEndpoint);
      setAiMessage("Connection created. Copy the endpoint now; the token is shown only once.");
    } catch (error) { setAiMessage(error instanceof Error ? error.message : "Could not generate the connection."); }
    finally { setAiBusy(false); }
  }

  async function revokeAiConnection() {
    if (!window.confirm("Revoke this AI connection? ChatGPT will no longer be able to save prospects using it.")) return;
    setAiBusy(true); setAiMessage("");
    try {
      const r = await fetch("/api/assistant-ai-token", { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not revoke the connection.");
      setAiEnabled(false); setAiCreatedAt(""); setAiEndpoint(""); setAiContextEndpoint("");
      setAiMessage("AI connection revoked.");
    } catch (error) { setAiMessage(error instanceof Error ? error.message : "Could not revoke the connection."); }
    finally { setAiBusy(false); }
  }

  async function copyAiEndpoint() {
    try { await navigator.clipboard.writeText(aiEndpoint); setAiMessage("Endpoint copied. Paste it into your ChatGPT instructions."); }
    catch { setAiMessage("Copy was blocked by your browser. Select and copy the endpoint manually."); }
  }

  async function copyAiContextEndpoint() {
    try { await navigator.clipboard.writeText(aiContextEndpoint); setAiMessage("Search context endpoint copied."); }
    catch { setAiMessage("Copy was blocked by your browser. Select and copy the endpoint manually."); }
  }

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

  return <main className="workspace">
    <header className="topbar"><div><div className="eyebrow">PERSONALIZE DISCOVERY</div><h1>Search settings</h1><p className="muted">Your settings guide searches by default. You can still narrow or change each search.</p></div><div className="row"><a className="button secondary" href="/intelligence">AI Lead Intelligence</a><a className="button secondary" href="/">Back to workspace</a></div></header>
    <section className="panel">
      <div className="eyebrow">CHATGPT CONNECTION</div>
      <h2>Connect ChatGPT to your prospect list</h2>
      <p className="muted">Create a private connection for this account. ChatGPT can read your search context and save prospects without access to your Vercel project or login password.</p>
      <div className="row">
        <span className="muted">{aiEnabled ? "Connection active" : "No active AI connection"}</span>
        {aiEnabled ? <button type="button" className="secondary" onClick={() => void revokeAiConnection()} disabled={aiBusy}>{aiBusy ? "Please wait..." : "Revoke connection"}</button> : <button type="button" onClick={() => void generateAiConnection()} disabled={aiBusy}>{aiBusy ? "Creating..." : "Generate ChatGPT connection"}</button>}
      </div>
      {aiCreatedAt && <p className="muted">Active since: {new Date(aiCreatedAt).toLocaleString()}</p>}
      {aiEndpoint && <label className="wide">Prospect save endpoint<textarea rows={2} readOnly value={aiEndpoint} /><button type="button" className="secondary" onClick={() => void copyAiEndpoint()}>Copy save endpoint</button></label>}
      {aiContextEndpoint && <label className="wide">Search context endpoint<textarea rows={2} readOnly value={aiContextEndpoint} /><button type="button" className="secondary" onClick={() => void copyAiContextEndpoint()}>Copy context endpoint</button><small className="muted">ChatGPT calls this before searching to retrieve your LinkedIn profile, confirmed profile details and saved search preferences.</small></label>}
      <p className="footnote">Keep this endpoint private. Anyone who has it can add prospects to this account. You can revoke it at any time. Generating a new connection automatically revokes the previous one.</p>
      <p className="muted">{aiMessage}</p>
    </section>

    <section className="panel"><form className="lead-form" onSubmit={save}>
      <label className="wide">Your LinkedIn profile URL<input type="url" value={p.linkedinProfileUrl} onChange={e => setP(old => ({ ...old, linkedinProfileUrl: e.target.value }))} placeholder="https://www.linkedin.com/in/your-profile/" /><small className="muted">The app checks public search results for this exact profile. A URL does not grant access to private LinkedIn content.</small></label>
      {field("countries", "Target countries and locations", "One country or area per line. Leave blank if you want to enter a location for each search.")}
      {field("industries", "Target industries", "One industry per line. These become your default search topics.")}
      {field("keywords", "Interests and search keywords", "Skills, services, topics or phrases that should guide discovery.")}
      {field("jobTitles", "People and job titles", "Examples: Founder, Owner, Managing Director, Recruiter, Engineer.")}
      {field("excludedKeywords", "Exclude keywords", "Profiles or companies containing these terms will be filtered out where possible.")}
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
  </main>;
}
