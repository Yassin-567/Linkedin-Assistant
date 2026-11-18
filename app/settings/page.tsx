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
  const [aiAuthToken, setAiAuthToken] = useState("");
  const [aiAccessToken, setAiAccessToken] = useState("");
  const [contextEndpoint, setContextEndpoint] = useState("");
  const [saveEndpoint, setSaveEndpoint] = useState("");
  const [accessExpiresAt, setAccessExpiresAt] = useState("");
  const [aiEndpoint, setAiEndpoint] = useState("");
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
    if (aiEnabled && !window.confirm("Regenerate the AI Auth Token? The previous token will stop working immediately.")) return;
    setAiBusy(true); setAiMessage(""); setAiEndpoint(""); setAiAuthToken("");
    try {
      const r = await fetch("/api/assistant-ai-token", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not generate the connection.");
      setAiEnabled(true); setAiCreatedAt(d.createdAt || new Date().toISOString()); setAiEndpoint(d.credentialsEndpoint); setAiAuthToken(d.aiAuthToken);
      setAiMessage("AI Auth Token created. Copy it and save it in your ChatGPT Memory. It is shown only once.");
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
      setAiEnabled(false); setAiCreatedAt(""); setAiEndpoint(""); setAiAuthToken("");
      setAiMessage("AI connection revoked.");
    } catch (error) { setAiMessage(error instanceof Error ? error.message : "Could not revoke the connection."); }
    finally { setAiBusy(false); }
  }

  async function copyAiEndpoint() {
    try { await navigator.clipboard.writeText(aiEndpoint); setAiMessage("Endpoint copied. Paste it into your ChatGPT instructions."); }
    catch { setAiMessage("Copy was blocked by your browser. Select and copy the endpoint manually."); }
  }

  async function copyAiAuthToken() {
    try { await navigator.clipboard.writeText(aiAuthToken); setAiMessage("AI Auth Token copied. Save it in your ChatGPT Memory; treat it like a password."); }
    catch { setAiMessage("Copy was blocked by your browser. Select and copy the token manually."); }
  }

  async function generateTemporaryAccessToken() {
    if (!aiAuthToken || !aiEndpoint) { setAiMessage("Generate your permanent AI Auth Token first."); return; }
    setAiBusy(true); setAiMessage("");
    try {
      const r = await fetch(aiEndpoint, { method: "POST", headers: { Authorization: "Bearer " + aiAuthToken } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not generate temporary access.");
      setAiAccessToken(d.accessToken || ""); setContextEndpoint(d.contextEndpoint || "");
      setSaveEndpoint(d.saveEndpoint || ""); setAccessExpiresAt(d.expiresAt || "");
      setAiMessage("Temporary AI Access Token generated. Shared by Context and Save for 10 minutes.");
    } catch (error) { setAiMessage(error instanceof Error ? error.message : "Could not generate temporary access."); }
    finally { setAiBusy(false); }
  }

  async function copyTemporaryAccessToken() {
    try { await navigator.clipboard.writeText(aiAccessToken); setAiMessage("Temporary AI Access Token copied."); }
    catch { setAiMessage("Copy was blocked. Select and copy the token manually."); }
  }

  async function copyNormalPrompt() {
    if (!aiAccessToken || !contextEndpoint || !saveEndpoint) { setAiMessage("Generate an AI Access Token first."); return; }
    const prompt = [
      "You are my LinkedIn prospect research assistant.",
      "FIRECRAWL IS MANDATORY. Use connected Firecrawl for every HTTP request. If it is not installed and connected, stop and say: Connect Firecrawl, it is mandatory. Do not substitute another HTTP client.",
      "Temporary AI Access Token: " + aiAccessToken,
      "Context endpoint: " + contextEndpoint,
      "Save endpoint: " + saveEndpoint,
      "This same temporary token authorizes Context and Save and expires in 10 minutes. This prompt is for manual research only. Do not request or use a permanent token. If expired, stop and ask me to generate a fresh temporary token in Settings.",
      "Before every search, use Firecrawl browser interaction to GET Context. Context is the only source of my profile, preferences, exclusions, uploaded connections and already-saved prospects. Do not assume or hardcode criteria.",
      "Apply the latest Context preferences. Exclude uploaded connections and existing prospects. Normalize LinkedIn URLs by ignoring case and trailing slashes; deduplicate each batch.",
      "Verify each prospect's full name, current role, company, location, relevance and personal LinkedIn URL using current public evidence. Do not invent details or rely on snippets alone.",
      "Save up to 50 verified leads using Firecrawl browser interaction: POST to Save with Content-Type application/json and body:",
      "{\"leads\":[{\"name\":\"Full name\",\"company\":\"Company name\",\"linkedin\":\"https://www.linkedin.com/in/profile-slug/\"}]}",
      "Only save personal linkedin.com/in/ URLs. Read the actual API response and report saved, duplicate, invalid and failed counts. Include names, roles, companies, locations, evidence links and reasons for fit.",
      "Keep tokens and endpoint URLs private. Never claim a save succeeded unless the API confirms it."
    ].join("\n");
    try { await navigator.clipboard.writeText(prompt); setAiMessage("Normal Research Prompt copied."); }
    catch { setAiMessage("Copy was blocked. Select and copy the prompt manually."); }
  }

  async function copyAutomaticPrompt() {
    if (!aiAuthToken || !aiEndpoint) { setAiMessage("Generate your permanent AI Auth Token first."); return; }
    const prompt = [
      "You are my automated LinkedIn prospect research assistant.",
      "FIRECRAWL IS MANDATORY. Use connected Firecrawl for every HTTP request. If it is not installed and connected, stop and say: Connect Firecrawl, it is mandatory. Do not substitute another HTTP client.",
      "Permanent AI Auth Token: " + aiAuthToken,
      "Credential issuance endpoint: " + aiEndpoint,
      "Context endpoint: " + new URL("/api/assistant-context", aiEndpoint).toString(),
      "Save endpoint: " + new URL("/api/assistant-save", aiEndpoint).toString(),
      "Treat the permanent token as a password. Send it only in the Authorization: Bearer header to the credential issuance endpoint. Never put it in a URL, query string, body, logs or output. It is never accepted by Context or Save. The Context and Save endpoint URLs above are endpoint bases; use the full access-token URLs returned by credential issuance, or append the temporary access token as the access query parameter.",
      "BEFORE scheduling anything, ask me what time or times I want the task to run, which timezone to use, and what recurrence I want (for example daily, weekdays, twice daily, weekly, or a custom pattern). Do not assume times, timezone, frequency, or defaults. Wait for my answer, then summarize the proposed schedule and ask me to confirm it. Only after confirmation, create and enable the recurring ChatGPT task. Each run must research and attempt to save up to 50 NEW, VERIFIED, QUALIFIED leads. If recurring Tasks are unavailable, say so; never pretend it was scheduled.",
      "FOR EVERY RUN: use Firecrawl browser interaction to POST to the credential issuance endpoint with Authorization: Bearer <permanent token>. Read the response and use its temporary access token, Context endpoint and Save endpoint. The same temporary token works with both endpoints and expires after 10 minutes; obtain a fresh one whenever needed.",
      "GET Context through Firecrawl before every search. Context is the only source of current profile, search preferences, exclusions, uploaded connection URLs and already-saved prospect URLs. Do not hardcode or assume criteria.",
      "Exclude uploaded connections and all saved prospects. Normalize LinkedIn URLs by ignoring case and trailing slashes. Deduplicate across runs.",
      "Find up to 50 NEW leads per run. Fifty is a target, not a reason to lower quality. Save fewer if fewer qualify. Verify full name, current role, company, location, relevance and personal LinkedIn URL using current public evidence.",
      "Save verified leads with Firecrawl POST to Save, Content-Type application/json, body:",
      "{\"leads\":[{\"name\":\"Full name\",\"company\":\"Company name\",\"linkedin\":\"https://www.linkedin.com/in/profile-slug/\"}]}",
      "Read the actual Save response. Record timestamp, researched, saved, duplicate, invalid and failed counts, plus saved lead names and evidence links. Never claim success without API confirmation.",
      "Report errors accurately. Keep all tokens and endpoints private. If recurring Tasks are unavailable, do not claim the schedule exists."
    ].join("\n");
    try { await navigator.clipboard.writeText(prompt); setAiMessage("Automatic Prospecting Prompt copied."); }
    catch { setAiMessage("Copy was blocked. Select and copy the prompt manually."); }
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
      <div className="eyebrow">CHATGPT AI AUTHENTICATION</div>
      <h2>Connect your ChatGPT assistant</h2>
      <p className="muted">Generate one permanent AI Auth Token for this account. Save it privately in ChatGPT Memory. ChatGPT uses it only to request one shared temporary token for Context and Save, valid for 10 minutes.</p>
      <div className="row">
        <span className="muted">{aiEnabled ? "AI Auth Token active" : "No active AI Auth Token"}</span>
        <button type="button" onClick={() => void generateAiConnection()} disabled={aiBusy}>{aiBusy ? "Creating..." : aiEnabled ? "Regenerate AI Auth Token" : "Generate AI Auth Token"}</button>
        {aiEnabled && <button type="button" className="secondary" onClick={() => void revokeAiConnection()} disabled={aiBusy}>{aiBusy ? "Please wait..." : "Revoke token"}</button>}
      </div>
      {aiCreatedAt && <p className="muted">Active since: {new Date(aiCreatedAt).toLocaleString()}</p>}
      {aiAuthToken && <label className="wide">Permanent AI Auth Token<textarea rows={2} readOnly value={aiAuthToken} /><button type="button" className="secondary" onClick={() => void copyAiAuthToken()}>Copy AI Auth Token</button><small className="muted">Save this permanent token in ChatGPT Memory. It is shown only once; if lost, regenerate it. It is never accepted by Context or Save. Never share it publicly.</small></label>}
      {aiEndpoint && <label className="wide">Credential issuance endpoint<textarea rows={2} readOnly value={aiEndpoint} /><button type="button" className="secondary" onClick={() => void copyAiEndpoint()}>Copy credential endpoint</button><small className="muted">ChatGPT sends a Firecrawl POST with this token in the Authorization: Bearer header (not in the URL). The response contains one temporary token shared by Context and Save, expiring after 10 minutes.</small></label>}
      {aiAuthToken && aiEndpoint && <div className="wide"><strong>AI Access Token</strong><p className="muted">Generate a temporary token manually. The same token works with Context and Save for 10 minutes.</p><button type="button" className="secondary" onClick={() => void generateTemporaryAccessToken()} disabled={aiBusy}>{aiBusy ? "Generating..." : "Generate AI Access Token"}</button></div>}
      {aiAccessToken && <label className="wide">Temporary AI Access Token<textarea rows={2} readOnly value={aiAccessToken} /><button type="button" className="secondary" onClick={() => void copyTemporaryAccessToken()}>Copy AI Access Token</button><small className="muted">Expires: {accessExpiresAt ? new Date(accessExpiresAt).toLocaleString() : "10 minutes after generation"}</small></label>}
      {aiAccessToken && <div className="wide"><button type="button" onClick={() => void copyNormalPrompt()}>Copy Normal Research Prompt</button><small className="muted">Uses only the temporary token for research you start manually.</small></div>}
      {aiAuthToken && aiEndpoint && <div className="wide"><button type="button" onClick={() => void copyAutomaticPrompt()}>Copy Automatic Prospecting Prompt</button><small className="muted">Uses the permanent token only to issue temporary tokens. ChatGPT will ask you for the time, timezone and recurrence before scheduling. Each run targets up to 50 new leads.</small></div>}
      <p className="footnote">Treat the AI Auth Token as a password. It can only issue temporary access tokens. Revoke or regenerate it immediately if exposed; both actions invalidate all active temporary access tokens.</p>
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
