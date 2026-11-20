"use client";
import { useEffect, useState } from "react";

type Preferences = {
  targetRoles: string[];
  keywords: string[];
  countries: string[];
  locations: string[];
  workModes: string[];
  employmentTypes: string[];
  seniorityLevels: string[];
  excludedKeywords: string[];
  salaryCurrency: string;
  minimumSalary: number | null;
  language: string;
  includeLinkedIn: boolean;
  includeSocialMedia: boolean;
  includeCompanySites: boolean;
  includeJobBoards: boolean;
  targetCount: number;
};

const defaults: Preferences = {
  targetRoles: [], keywords: [], countries: [], locations: [],
  workModes: ["remote", "hybrid", "on-site"], employmentTypes: [],
  seniorityLevels: [], excludedKeywords: [], salaryCurrency: "",
  minimumSalary: null, language: "English", includeLinkedIn: true,
  includeSocialMedia: true, includeCompanySites: true, includeJobBoards: true,
  targetCount: 30
};
const splitLines = (value: string) => value.split("\n");
const cleanLines = (values: string[]) => values.map(value => value.trim()).filter(Boolean);

export default function JobPreferencesSettings() {
  const [p, setP] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/job-preferences", { cache: "no-store" })
      .then(async r => {
        if (r.status === 401) { location.href = "/login"; return null; }
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load job preferences.");
        return d.preferences as Preferences;
      })
      .then(value => { if (value) setP({ ...defaults, ...value }); })
      .catch(error => setMessage(error instanceof Error ? error.message : "Could not load job preferences."))
      .finally(() => setLoading(false));
  }, []);

  function listField(key: keyof Preferences, label: string, hint: string) {
    const values = p[key] as string[];
    return <label className="wide">{label}
      <textarea rows={3} value={values.join("\n")} onChange={e => setP(old => ({ ...old, [key]: splitLines(e.target.value) }))} />
      <small className="muted">{hint}</small>
    </label>;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage("");
    try {
      const r = await fetch("/api/job-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ...p,
        targetRoles: cleanLines(p.targetRoles),
        keywords: cleanLines(p.keywords),
        countries: cleanLines(p.countries),
        locations: cleanLines(p.locations),
        employmentTypes: cleanLines(p.employmentTypes),
        seniorityLevels: cleanLines(p.seniorityLevels),
        excludedKeywords: cleanLines(p.excludedKeywords)
      }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not save preferences.");
      setMessage("Job-search preferences saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); }
    finally { setSaving(false); }
  }

  async function copyFromLeads() {
    setCopying(true); setMessage("");
    try {
      const r = await fetch("/api/preferences", { cache: "no-store" });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not read lead preferences.");
      const lead = d.preferences;
      setP(old => ({
        ...old,
        targetRoles: Array.from(new Set([...cleanLines(lead.jobTitles || []), ...cleanLines(old.targetRoles || [])])),
        keywords: Array.from(new Set([...cleanLines(lead.keywords || []), ...cleanLines(lead.industries || []), ...cleanLines(old.keywords || [])])),
        countries: Array.from(new Set([...cleanLines(lead.countries || []), ...cleanLines(old.countries || [])])),
        excludedKeywords: Array.from(new Set([...cleanLines(lead.excludedKeywords || []), ...cleanLines(old.excludedKeywords || [])])),
        language: lead.language || old.language
      }));
      setMessage("Copied lead preferences into the job form. Review and save them; existing job preferences were kept too.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not copy lead preferences."); }
    finally { setCopying(false); }
  }

  return <section className="panel">
    <div className="section-heading">
      <div><div className="eyebrow">JOB DISCOVERY</div><h2>Job-search preferences</h2>
        <p className="muted">These are independent from your lead preferences. Leave fields empty to keep that dimension broad.</p>
      </div>
      <button type="button" className="secondary" onClick={() => void copyFromLeads()} disabled={copying || loading}>
        {copying ? "Copying..." : "Copy from lead preferences"}
      </button>
    </div>
    <form className="lead-form" onSubmit={save}>
      {listField("targetRoles", "Roles and job titles", "Add as many different roles as you are open to. Do not enter only one profession unless you intend to narrow the search.")}
      {listField("keywords", "Skills, fields and keywords", "Technologies, skills, industries, responsibilities or topics.")}
      {listField("countries", "Target countries", "Leave blank for no country restriction.")}
      {listField("locations", "Cities, regions or other location preferences", "Leave blank to use target countries or keep the search broad.")}
      {listField("employmentTypes", "Employment types", "Examples: Full-time, Part-time, Contract, Freelance, Internship, Temporary.")}
      {listField("seniorityLevels", "Seniority levels", "Examples: Entry-level, Junior, Mid-level, Senior, Lead, Manager, Director.")}
      {listField("excludedKeywords", "Exclude keywords", "Terms that should disqualify a job where relevant.")}
      <label>Work modes
        <select multiple value={p.workModes} onChange={e => setP(old => ({ ...old, workModes: Array.from(e.target.selectedOptions).map(x => x.value) }))}>
          <option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="on-site">On-site</option>
        </select><small className="muted">Use Ctrl/Cmd to select multiple. All three are enabled by default.</small>
      </label>
      <label>Minimum salary<input type="number" min="0" step="any" value={p.minimumSalary ?? ""} onChange={e => setP(old => ({ ...old, minimumSalary: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="Any salary" /></label>
      <label>Salary currency<input value={p.salaryCurrency} onChange={e => setP(old => ({ ...old, salaryCurrency: e.target.value.toUpperCase() }))} placeholder="GBP, USD, EGP..." /></label>
      <label>Preferred language<input value={p.language} onChange={e => setP(old => ({ ...old, language: e.target.value }))} /></label>
      <p className="wide muted">Your result count is configured separately in Settings → ChatGPT connection. ChatGPT will never invent or pad results to meet a target.</p>
      <div className="wide job-source-options">
        <strong>Where should ChatGPT search?</strong>
        <label><input type="checkbox" checked={p.includeJobBoards} onChange={e => setP(old => ({ ...old, includeJobBoards: e.target.checked }))} /> Job boards and recruitment websites</label>
        <label><input type="checkbox" checked={p.includeCompanySites} onChange={e => setP(old => ({ ...old, includeCompanySites: e.target.checked }))} /> Employer websites and career pages</label>
        <label><input type="checkbox" checked={p.includeLinkedIn} onChange={e => setP(old => ({ ...old, includeLinkedIn: e.target.checked }))} /> Public LinkedIn job listings</label>
        <label><input type="checkbox" checked={p.includeSocialMedia} onChange={e => setP(old => ({ ...old, includeSocialMedia: e.target.checked }))} /> Public social-media posts and recruiter announcements</label>
      </div>
      <div className="wide form-footer"><span className="muted" role="status">{loading ? "Loading..." : message}</span><button disabled={loading || saving}>{saving ? "Saving..." : "Save job preferences"}</button></div>
    </form>
  </section>;
}
