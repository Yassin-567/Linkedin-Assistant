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
  const [aiTokenActive, setAiTokenActive] = useState(false);
  const [aiTokenCreatedAt, setAiTokenCreatedAt] = useState("");
  const [aiTokenValue, setAiTokenValue] = useState("");
  const [quickSessionValue, setQuickSessionValue] = useState<{token:string; expiresAt:string} | null>(null);
  const [aiTokenBusy, setAiTokenBusy] = useState(false);
  const [aiTokenMessage, setAiTokenMessage] = useState("");

  useEffect(() => {
    const savedPermanent = localStorage.getItem("inlinked_permanent_token");
    if (savedPermanent) setAiTokenValue(savedPermanent);
    try { const savedSession = JSON.parse(localStorage.getItem("inlinked_quick_session") || "null"); if (savedSession?.token && savedSession?.expiresAt && new Date(savedSession.expiresAt).getTime() > Date.now()) setQuickSessionValue(savedSession); } catch { localStorage.removeItem("inlinked_quick_session"); }
    fetch("/api/assistant-ai-token", { cache: "no-store" }).then(async r => {
      if (r.status === 401) return;
      const d = await r.json();
      if (r.ok) { setAiTokenActive(Boolean(d.enabled)); setAiTokenCreatedAt(d.createdAt || ""); }
    }).catch(() => {});
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


  async function generateAiToken() {
    if (aiTokenActive && !window.confirm("Generate a new token? The old token and all temporary access tokens will stop working immediately.")) return;
    setAiTokenBusy(true); setAiTokenMessage("");
    try {
      const r = await fetch("/api/assistant-ai-token", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not generate the token.");
      setAiTokenValue(d.aiAuthToken || "");
      localStorage.setItem("inlinked_permanent_token", d.aiAuthToken || "");
      setAiTokenActive(true);
      setAiTokenCreatedAt(d.createdAt || new Date().toISOString());
      setAiTokenMessage("New token generated. Copy it now; for security, it cannot be retrieved again after you leave this page.");
    } catch (error) { setAiTokenMessage(error instanceof Error ? error.message : "Could not generate the token."); }
    finally { setAiTokenBusy(false); }
  }

  async function revokeAiToken() {
    if (!window.confirm("Revoke the permanent ChatGPT token? Any saved ChatGPT prompt using it will stop working.")) return;
    setAiTokenBusy(true); setAiTokenMessage("");
    try {
      const r = await fetch("/api/assistant-ai-token", { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not revoke the token.");
      setAiTokenValue(""); localStorage.removeItem("inlinked_permanent_token"); setAiTokenActive(false); setAiTokenCreatedAt("");
      setAiTokenMessage("Token revoked successfully.");
    } catch (error) { setAiTokenMessage(error instanceof Error ? error.message : "Could not revoke the token."); }
    finally { setAiTokenBusy(false); }
  }

  async function copyAiToken() {
    if (!aiTokenValue) return;
    try { await navigator.clipboard.writeText(aiTokenValue); setAiTokenMessage("Token copied. Keep it private."); }
    catch { setAiTokenMessage("Copy was blocked by your browser. Select the token and copy it manually."); }
  }

  return <main className="workspace">
    <header className="topbar"><div><div className="eyebrow">PERSONALIZE DISCOVERY</div><h1>Search settings</h1><p className="muted">Your settings guide searches by default. You can still narrow or change each search.</p></div><div className="row"><a className="button secondary" href="/intelligence">AI Lead Intelligence</a><a className="button secondary" href="/">Back to workspace</a></div></header>
    <section className="panel"><div className="section-heading"><div><div className="eyebrow">CHATGPT</div><h2>Connect your ChatGPT assistant</h2><p className="muted">Create a ready-to-paste prompt so ChatGPT can research and save prospects for you.</p></div><a className="button" href="/chatgpt">Open ChatGPT connection</a></div></section>


    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">CHATGPT AUTHENTICATION</div><h2>Permanent AI access token</h2><p className="muted">Use this token for your recurring ChatGPT connection. It only grants access to your own Inlinked context and prospect-saving endpoints.</p></div><span className={aiTokenActive ? "pill" : "muted"}>{aiTokenActive ? "Active" : "Not connected"}</span></div>
      <div className="row" style={{ justifyContent: "flex-start" }}>
        <button type="button" onClick={() => void generateAiToken()} disabled={aiTokenBusy}>{aiTokenBusy ? "Working..." : aiTokenActive ? "Regenerate and reveal token" : "Generate token"}</button>
        {aiTokenActive && <button type="button" className="secondary" onClick={() => void revokeAiToken()} disabled={aiTokenBusy}>Revoke token</button>}
      </div>
      {aiTokenValue ? <label className="wide">Your permanent AI token<input type="text" readOnly value={aiTokenValue} autoComplete="off" spellCheck={false} /><button type="button" className="secondary" onClick={() => void copyAiToken()}>Copy token</button></label> : <p className="muted">{aiTokenActive ? "The active token is not saved in this browser. Regenerate it to display it here." : "Generate a token to display it here."}</p>}
      {quickSessionValue && <label className="wide">Current Quick Session token (expires {new Date(quickSessionValue.expiresAt).toLocaleString()})<input type="text" readOnly value={quickSessionValue.token} /><button type="button" className="secondary" onClick={() => void navigator.clipboard.writeText(quickSessionValue.token)}>Copy session token</button></label>}
      <p className="muted" role="status">{aiTokenMessage || (aiTokenActive ? "A token is active" + (aiTokenCreatedAt ? " · Created " + new Date(aiTokenCreatedAt).toLocaleString() : "") + ". The existing token is stored as a one-way hash and cannot be displayed again. Regenerate it to reveal a new token here." : "No permanent token is active.")}</p>
      <p className="footnote">Tokens generated in this browser remain visible here across reloads. They are kept in this browser's local storage, not retrievable from the server. Anyone with access to this browser profile can see them. Regenerating the permanent token invalidates the previous token and all temporary access grants.</p>
    </section>

    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">API REFERENCE</div><h2>Endpoints and request examples</h2><p className="muted">Use the placeholders below with your own tokens. These examples do not contain live credentials.</p></div></div>
      <div className="lead-form">
        <label className="wide">1. Create a Quick Session token (POST)<pre className="prompt-box">POST https://inlinked.vercel.app/api/assistant-access</pre><small className="muted">Requires your signed-in Inlinked browser session. Returns a 10-minute access token.</small></label>
        <label className="wide">2. Exchange Permanent Token for temporary access (POST)<pre className="prompt-box">POST https://inlinked.vercel.app/api/assistant-credentials
Authorization: Bearer &lt;PERMANENT_AI_TOKEN&gt;</pre><small className="muted">Returns contextEndpoint and saveEndpoint URLs containing the temporary access token.</small></label>
        <label className="wide">3. Read search context (GET)<pre className="prompt-box">GET https://inlinked.vercel.app/api/assistant-context?access=&lt;10_MINUTE_ACCESS_TOKEN&gt;

# Or send: Authorization: Bearer &lt;10_MINUTE_ACCESS_TOKEN&gt;</pre><small className="muted">Reads your owner profile, saved search preferences and exclusion lists.</small></label>
        <label className="wide">4. Save qualified prospects (POST)<pre className="prompt-box">POST https://inlinked.vercel.app/api/assistant-save?access=&lt;10_MINUTE_ACCESS_TOKEN&gt;
Content-Type: application/json

{
  "leads": [
    { "name": "Full name", "company": "Company name", "linkedin": "https://www.linkedin.com/in/profile-slug/" }
  ]
}</pre><small className="muted">Accepts 1–50 prospects. Response reports saved, duplicates and invalid counts.</small></label>
      </div>

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
