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

  return <section className="panel">
    <div className="section-heading">
      <div><div className="eyebrow">JOB DISCOVERY</div><h2>Job preferences</h2>
        <p className="muted">These are independent from your lead preferences. Leave fields empty to keep that dimension broad.</p>
      </div>
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
      <label>Jobs to target per research run<input type="number" min={1} max={50} step={1} value={p.targetCount} onChange={e => { const count = Number(e.target.value); if (Number.isInteger(count) && count >= 1 && count <= 50) setP(old => ({ ...old, targetCount: count })); }} /><small className="muted">Choose 1–50. This target is saved with your job preferences and used in generated ChatGPT prompt links. ChatGPT will never invent or pad results to meet it.</small></label>
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
