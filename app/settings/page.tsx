"use client";
import { useEffect, useState } from "react";
import ChatGptSettings from "@/components/ChatGptSettings";
import JobPreferencesSettings from "@/components/JobPreferencesSettings";
import CvImportSettings from "@/components/CvImportSettings";
import JsonPreferencesImport from "@/components/JsonPreferencesImport";
import LeadProfileSettings, { defaultPreferences, type Preferences as LeadPreferences, type Profile as LeadProfile } from "@/components/LeadProfileSettings";

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
  return value === "user_entered_or_edited" ? "Entered by you" : "";
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
  const [activeTab, setActiveTab] = useState<"preferences" | "jobs" | "cv" | "chatgpt" | "leads">("preferences");
  const [prospectCount, setProspectCount] = useState(50);
  const [isFrozen, setIsFrozen] = useState(false);
  const [commercialLeadsLocked, setCommercialLeadsLocked] = useState(false);
  const [billingStatusLoaded, setBillingStatusLoaded] = useState(false);
  const [leadProfiles, setLeadProfiles] = useState<LeadProfile[]>([]);
  const [leadProfileId, setLeadProfileId] = useState("");
  const [leadProfileName, setLeadProfileName] = useState("My first business profile");
  const [leadProfileDescription, setLeadProfileDescription] = useState("");
  const [leadProfilePreferences, setLeadProfilePreferences] = useState<LeadPreferences>(defaultPreferences);
  const [leadProfileEditing, setLeadProfileEditing] = useState(true);
  const [leadProfilesLoading, setLeadProfilesLoading] = useState(true);
  const [leadProfileSaving, setLeadProfileSaving] = useState(false);
  const [leadProfileMessage, setLeadProfileMessage] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/preferences", { cache: "no-store" }),
      fetch("/api/profile-verification", { cache: "no-store" }),
      fetch("/api/auth/me", { cache: "no-store" }),
      fetch("/api/lead-profiles", { cache: "no-store" }),
      fetch("/api/billing/status", { cache: "no-store" })
    ]).then(async ([preferencesResponse, profileResponse, accountResponse, leadProfilesResponse, billingResponse]) => {
      const accountData = await accountResponse.json();
      setIsFrozen(accountData.accountStatus === "frozen");
      if (billingResponse.ok) {
        const billing = await billingResponse.json();
        setCommercialLeadsLocked(billing.enforced === true && billing.plan === "free");
      }
      setBillingStatusLoaded(true);
      if (leadProfilesResponse.status === 401) { location.href = "/login"; return; }
      const leadProfilesData = await leadProfilesResponse.json();
      if (leadProfilesResponse.ok) {
        const rows: LeadProfile[] = Array.isArray(leadProfilesData.profiles) ? leadProfilesData.profiles : [];
        setLeadProfiles(rows);
        if (rows.length) {
          const active = rows.find(item => item.isActive) || rows[0];
          setLeadProfileId(active.id); setLeadProfileName(active.name); setLeadProfileDescription(active.description || "");
          setLeadProfilePreferences({ ...defaultPreferences, ...active.preferences }); setLeadProfileEditing(false);
        }
      } else setLeadProfileMessage(leadProfilesData.error || "Could not load lead profiles.");
      if (preferencesResponse.status === 401 || profileResponse.status === 401) { location.href = "/login"; return; }
      const [preferencesData, profileData] = await Promise.all([preferencesResponse.json(), profileResponse.json()]);
      if (preferencesResponse.ok) { setP({ ...defaults, ...preferencesData.preferences }); const target = Number(preferencesData.preferences?.connectionTargetCount || 50); if (Number.isInteger(target) && target >= 1 && target <= 50) setProspectCount(target); }
      else setMessage(preferencesData.error || "Could not load preferences.");
      if (profileResponse.ok) {
        setProfile({ ...emptyProfile, ...(profileData.fields || {}) });
        setSources(profileData.fieldSources || {});
        setVerifiedAt(profileData.savedAt || "");
      } else setProfileMessage(profileData.error || "Could not load profile verification.");
    }).catch(() => setMessage("Could not load settings.")).finally(() => { setBusy(false); setLeadProfilesLoading(false); setBillingStatusLoaded(true); });
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



  async function chooseLeadProfile(id: string) {
    let profile = leadProfiles.find(item => item.id === id); if (!profile) return;
    if (!profile.isActive) {
      try {
        const response = await fetch("/api/lead-profiles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: profile.id, name: profile.name, description: profile.description, preferences: profile.preferences, isActive: true }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not activate this profile.");
        profile = data.profile as LeadProfile; setLeadProfiles(old => old.map(item => item.id === profile!.id ? profile! : { ...item, isActive: false }));
      } catch (error) { setLeadProfileMessage(error instanceof Error ? error.message : "Could not activate this profile."); return; }
    }
    setLeadProfileId(profile.id); setLeadProfileName(profile.name); setLeadProfileDescription(profile.description || "");
    setLeadProfilePreferences({ ...defaultPreferences, ...profile.preferences }); setLeadProfileEditing(false); setLeadProfileMessage("");
  }
  function newLeadProfile() { setLeadProfileId(""); setLeadProfileName(""); setLeadProfileDescription(""); setLeadProfilePreferences(defaultPreferences); setLeadProfileEditing(true); setLeadProfileMessage("Create a profile for one business, service or customer segment."); }
  function updateLeadProfileList(key: keyof LeadPreferences, value: string) {
    setLeadProfilePreferences(old => { const next = { ...old }; if (["serviceDescription","idealCustomerDescription","problemsSolved","projectType","minimumBudget","budgetCurrency","preferredCustomerValue","language"].includes(key)) (next as any)[key] = value; else (next as any)[key] = value.split(/\r?\n/).map(item => item.trim()).filter(Boolean); return next; });
  }
  function toggleLeadProfilePreference(key: "discoveryEngines" | "sourceCategories", value: string) { setLeadProfilePreferences(old => ({ ...old, [key]: old[key].includes(value) ? old[key].filter(item => item !== value) : [...old[key], value] })); }
  function importLeadProfile(value: unknown): string {
    const input = value as { name: string; description: string; preferences: LeadPreferences };
    setLeadProfileName(input.name); setLeadProfileDescription(input.description); setLeadProfilePreferences(input.preferences); setLeadProfileEditing(true);
    setLeadProfileMessage("Profile JSON loaded into the form. Review the details and save the profile to apply them.");
    return "Profile details loaded into the form. Review them and click Create profile or Save profile.";
  }
  async function saveLeadProfile(event: React.FormEvent) {
    event.preventDefault(); if (!leadProfileName.trim()) { setLeadProfileMessage("Give this profile a name."); return; }
    setLeadProfileSaving(true); setLeadProfileMessage("");
    try {
      const payload = { name: leadProfileName.trim(), description: leadProfileDescription, preferences: leadProfilePreferences, isActive: true };
      const response = await fetch("/api/lead-profiles", { method: leadProfileId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(leadProfileId ? { ...payload, id: leadProfileId } : payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save profile.");
      const saved: LeadProfile = data.profile;
      setLeadProfiles(old => { const next = old.some(item => item.id === saved.id) ? old.map(item => item.id === saved.id ? saved : { ...item, isActive: false }) : [...old.map(item => ({ ...item, isActive: false })), saved]; return next.sort((a,b)=>Number(b.isActive)-Number(a.isActive)); });
      setLeadProfileId(saved.id); setLeadProfilePreferences({ ...defaultPreferences, ...saved.preferences }); setLeadProfileEditing(false);
      setLeadProfileMessage("Profile saved. Your preferences are shared with the Commercial Leads workspace.");
    } catch (error) { setLeadProfileMessage(error instanceof Error ? error.message : "Could not save profile."); }
    finally { setLeadProfileSaving(false); }
  }
  async function deleteLeadProfile() {
    if (!leadProfileId || !window.confirm("Delete this profile? Saved leads will be kept without a profile assignment.")) return;
    try {
      const response = await fetch("/api/lead-profiles?id=" + encodeURIComponent(leadProfileId), { method: "DELETE" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete profile.");
      const remaining = leadProfiles.filter(item => item.id !== leadProfileId); setLeadProfiles(remaining);
      if (remaining.length) void chooseLeadProfile(remaining[0].id); else newLeadProfile();
      setLeadProfileMessage("Profile deleted. Existing leads were preserved.");
    } catch (error) { setLeadProfileMessage(error instanceof Error ? error.message : "Could not delete profile."); }
  }

  return <main className={isFrozen ? "workspace frozen-readonly" : "workspace"}>
    <header className="topbar"><div><div className="eyebrow">WORKSPACE CONFIGURATION</div><h1>Settings</h1><p className="muted">Manage research preferences, professional background and your AI prompt connection.</p></div><div className="row"><a className="button secondary" href="/">Back to workspace</a></div></header>
    <nav className="settings-tabs" aria-label="Settings sections">
      <button className="settings-tab" type="button" onClick={() => setActiveTab("preferences")} aria-selected={activeTab === "preferences"}>LinkedIn preferences</button>
      <button className="settings-tab" type="button" onClick={() => setActiveTab("jobs")} aria-selected={activeTab === "jobs"}>Job preferences</button>
      <button className="settings-tab" type="button" onClick={() => setActiveTab("cv")} aria-selected={activeTab === "cv"}>AI imports</button>
      <button className="settings-tab" type="button" onClick={() => setActiveTab("leads")} aria-selected={activeTab === "leads"}>Commercial leads</button>
      {!isFrozen && <button className="settings-tab" type="button" onClick={() => setActiveTab("chatgpt")} aria-selected={activeTab === "chatgpt"}>ChatGPT connection</button>}
    </nav>
    {!isFrozen && activeTab === "chatgpt" && <>
    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">CHATGPT INTEGRATION</div><h2>ChatGPT connection and prompt builder</h2><p className="muted">Manage one Access Token and generate job-discovery and LinkedIn connection-research prompts. The commercial Leads workspace has its own ChatGPT research prompt and save workflow.</p></div></div>


      <ChatGptSettings prospectCount={prospectCount} />
    </section>

    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">PROMPT GATEWAY</div><h2>How the connection works</h2><p className="muted">Copy a workflow link from the ChatGPT connection panel. The permanent AI token is used only to open that link. Inlinked then returns the selected research prompt and a temporary 15-minute session token. Context, Save and Update APIs accept the temporary token, not the permanent credential.</p></div></div>
      <p className="footnote">The prompt link is a secret: anyone who has it can open it from a browser and create a temporary session for this account. Regenerating or revoking the permanent AI token invalidates future prompt-link requests and revokes active sessions.</p>
    </section>
    </>}

    {activeTab === "jobs" && <JobPreferencesSettings />}
    {activeTab === "leads" && <>
      {commercialLeadsLocked && <section className="panel commercial-leads-banner" role="status"><div><strong>Commercial leads are available in the Pro plan.</strong><p>Upgrade to create profiles, import leads and use the commercial lead prompt.</p></div><a className="button" href="/billing">Upgrade to Pro</a></section>}
      <fieldset disabled={!billingStatusLoaded || commercialLeadsLocked} aria-disabled={!billingStatusLoaded || commercialLeadsLocked} className="commercial-leads-fieldset">
        <LeadProfileSettings profiles={leadProfiles} selectedId={leadProfileId} profileName={leadProfileName} profileDescription={leadProfileDescription} preferences={leadProfilePreferences}
          editing={leadProfileEditing} loading={leadProfilesLoading} saving={leadProfileSaving} message={leadProfileMessage}
          onSelect={id=>void chooseLeadProfile(id)} onNew={newLeadProfile} onToggleEditing={()=>setLeadProfileEditing(old=>!old)}
          onNameChange={setLeadProfileName} onDescriptionChange={setLeadProfileDescription} onUpdateList={updateLeadProfileList}
          onTogglePreference={toggleLeadProfilePreference} onSave={saveLeadProfile} onDelete={()=>void deleteLeadProfile()} onImportProfile={importLeadProfile}/>
      </fieldset>
    </>}

    {activeTab === "cv" && <>
      <section className="panel">
        <div className="section-heading"><div><div className="eyebrow">AI IMPORTS</div><h2>Import your information</h2>
          <p className="muted">Use either option below: import structured details from your CV, or ask ChatGPT to prepare preferences from information you have provided and paste the JSON response.</p>
        </div></div>
      </section>
      <CvImportSettings />
      <JsonPreferencesImport />
    </>}

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
      <div className="wide form-footer"><span className="muted">{busy ? "Loading settings..." : message}</span><button disabled={busy || saving}>{saving ? "Saving..." : "Save preferences"}</button></div>
    </form></section>

    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">YOUR PROFESSIONAL BACKGROUND</div><h2>Your professional background</h2><p className="muted">Review and update these seven details. Your professional summary is the single About field used by your AI prompts for personalized research and outreach.</p></div></div>
      <div className="lead-form">
        {(Object.keys(profileLabels) as (keyof ProfileFields)[]).map(key => <label key={key}>{profileLabels[key]}<textarea rows={key === "about" || key === "experience" ? 4 : 2} value={profile[key]} onChange={e => setProfile(old => ({ ...old, [key]: e.target.value }))} placeholder="Add or update this detail." />{sourceLabel(sources[key]) && <small className="muted">{sourceLabel(sources[key])}</small>}</label>)}
      </div>
      <div className="form-footer"><span className="muted">{profileMessage}{verifiedAt ? " · Last saved: " + new Date(verifiedAt).toLocaleString() : ""}</span><button type="button" onClick={() => void saveProfileContext()} disabled={confirming}>{confirming ? "Saving professional context..." : "Save professional context"}</button></div>
      <p className="footnote">These details are supplied by you and are not independently verified by Inlinked. Keep them accurate; AI assistants must not claim experience or qualifications you have not confirmed.</p>
    </section>
    </>}
  </main>;
}
