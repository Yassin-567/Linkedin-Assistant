"use client";
import { useEffect, useMemo, useState } from "react";

type Job = {
  id: string; title: string; company: string; description: string; salaryText: string;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string;
  workplaceType: string; employmentType: string; location: string; country: string;
  seniority: string; postedAt: string | null; postedAtText: string;
  sourcePlatform: string; researchTool: string; sourceType: string; sourceUrl: string; applicationUrl: string;
  matchReason: string; recommendedOutreach?: string; evidenceUrls: string[]; sourceMetadata: Record<string, unknown> | null; status: string; appliedAt?: string | null; notes: string;
  discoveredAt: string; createdAt: string;
};
const statuses = ["Saved", "Applied", "Interviewing", "Offer", "Rejected", "Closed", "Not interested"];
const label = (value: string) => value ? value.replace(/[_-]+/g, " ").replace(/\b\w/g, x => x.toUpperCase()) : "Not specified";
const safeDate = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString() : "";
const toLocalDateTime = (value?: string | null) => { if (!value) return ""; const d = new Date(value); return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); };
const metaList = (metadata: Record<string, unknown> | null, key: string) => {
  const value = metadata?.[key];
  if (Array.isArray(value)) return value.filter(item => typeof item === "string" && item.trim()).map(String);
  return typeof value === "string" && value.trim() ? [value] : [];
};
const metaLabel: Record<string, string> = {
  matchingSkills: "Matching skills", transferableSkills: "Transferable skills", equivalentTools: "Equivalent tools",
  missingRequirements: "Missing requirements", experienceGaps: "Experience gaps", scheduleConflicts: "Schedule conflicts",
  preferenceWarnings: "Preference warnings", inclusionReasons: "Reasons for inclusion"
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [message, setMessage] = useState("");
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  async function reload() {
    const response = await fetch("/api/jobs", { cache: "no-store" });
    if (response.status === 401) { location.href = "/login"; return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load saved jobs.");
    setJobs(Array.isArray(data.jobs) ? data.jobs : []);
  }

  useEffect(() => {
    reload().catch(error => setMessage(error instanceof Error ? error.message : "Could not load jobs."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => jobs.filter(job => {
    const text = [job.title, job.company, job.location, job.country, job.sourcePlatform, job.description, job.notes].join(" ").toLowerCase();
    return (filter === "All" || job.status === filter) && text.includes(search.toLowerCase());
  }), [jobs, filter, search]);

  async function update(job: Job, changes: { status?: string; notes?: string; recommendedOutreach?: string; appliedAt?: string | null }) {
    try {
      const response = await fetch("/api/jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: job.id, status: changes.status ?? job.status, notes: changes.notes ?? job.notes, recommendedOutreach: changes.recommendedOutreach ?? job.recommendedOutreach ?? "", appliedAt: changes.appliedAt ?? job.appliedAt ?? null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update this job.");
      setJobs(old => old.map(item => item.id === job.id ? { ...item, ...changes, appliedAt: changes.appliedAt ?? (changes.status === "Applied" ? job.appliedAt || new Date().toISOString() : job.appliedAt) } : item));
      setMessage("Job updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Update failed."); }
  }

  async function copyRecommended(text:string) { try { await navigator.clipboard.writeText(text); setMessage("Recommended message copied."); } catch { setMessage("Could not copy the message. Select and copy it manually."); } }

  async function remove(job: Job) {
    if (!window.confirm("Remove " + job.title + " from your saved jobs?")) return;
    try {
      const response = await fetch("/api/jobs?id=" + encodeURIComponent(job.id), { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove this job.");
      setJobs(old => old.filter(item => item.id !== job.id));
      setMessage("Job removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Remove failed."); }
  }

  async function importJobs() {
    setMessage("");
    let parsed: unknown;
    try { parsed = JSON.parse(importText); }
    catch { setMessage("Paste valid JSON containing a jobs array."); return; }
    const batch = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "jobs" in parsed ? (parsed as { jobs: unknown }).jobs : null);
    if (!Array.isArray(batch) || batch.length < 1 || batch.length > 50) { setMessage("Provide between 1 and 50 jobs in a jobs array."); return; }
    setImporting(true);
    try {
      const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobs: batch, researchTool: parsed && typeof parsed === "object" && "researchTool" in parsed ? (parsed as { researchTool?: string }).researchTool : undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed.");
      await reload();
      setImportText("");
      setMessage("Import complete: " + data.saved + " saved, " + data.duplicates + " duplicates, " + data.invalid + " invalid.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed."); }
    finally { setImporting(false); }
  }

  function exportCsv() {
    const fields = ["title","company","location","country","workplaceType","employmentType","salaryText","postedAtText","sourcePlatform","researchTool","sourceUrl","applicationUrl","status","appliedAt","notes","recommendedOutreach"];
    const quote = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const lines = [fields, ...shown.map(job => fields.map(field => (job as unknown as Record<string, unknown>)[field]))]
      .map(row => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([lines], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "inlinked-jobs.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  function toggleExpanded(id: string) {
    setExpanded(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  }

  return <main className="workspace jobs-workspace">
    <header className="topbar">
      <div><div className="eyebrow">OPPORTUNITY TRACKER</div><h1>Jobs</h1><p className="muted">Your saved vacancies from job boards, company websites, LinkedIn and public social-media posts. Use Settings → Job preferences and ChatGPT → Find jobs to discover more.</p></div>
      <div className="row"><a className="button secondary" href="/settings">Job preferences</a><button type="button" className="secondary" onClick={() => void reload()}>Refresh</button></div>
    </header>

    <section className="stats jobs-stats">
      <div className="stat"><small>Total saved</small><strong>{jobs.length}</strong></div>
      <div className="stat"><small>Applied</small><strong>{jobs.filter(x => x.status === "Applied").length}</strong></div>
      <div className="stat"><small>Interviewing</small><strong>{jobs.filter(x => x.status === "Interviewing").length}</strong></div>
      <div className="stat"><small>Offers</small><strong>{jobs.filter(x => x.status === "Offer").length}</strong></div>
    </section>

    <section className="panel">
      <div className="section-heading"><div><h2>Saved jobs</h2><p className="muted">Track each vacancy through your application process.</p></div><button type="button" className="secondary" onClick={exportCsv} disabled={!shown.length}>Export CSV</button></div>
      <div className="toolbar jobs-toolbar">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, company, location or source..." />
        <select value={filter} onChange={e => setFilter(e.target.value)}><option>All</option>{statuses.map(status => <option key={status}>{status}</option>)}</select>
      </div>
      {loading ? <div className="empty">Loading your saved jobs…</div> : shown.length ? <div className="job-list">
        {shown.map(job => <article className="job-card" key={job.id}>
          <div className="job-card-top">
            <div className="job-title-block"><h3>{job.title}</h3><strong>{job.company || "Employer not identified"}</strong><div className="job-meta">
              {[job.location, job.country, label(job.workplaceType), label(job.employmentType), job.seniority].filter(Boolean).join(" · ")}
            </div></div>
            <div className="job-status-outreach"><select aria-label={"Status for " + job.title} value={job.status} onChange={e => void update(job, { status: e.target.value })}>{statuses.map(status => <option key={status}>{status}</option>)}</select>{job.status === "Applied" && <label>Applied date and time<input aria-label={"Application date and time for " + job.title} type="datetime-local" value={toLocalDateTime(job.appliedAt)} onChange={e => void update(job, { appliedAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>}{job.appliedAt && <small>Applied: {new Date(job.appliedAt).toLocaleString()}</small>}<aside className="recommended-outreach"><label>Recommended outreach<textarea rows={4} defaultValue={job.recommendedOutreach || ""} onBlur={e=>{const value=e.target.value;if(value!==(job.recommendedOutreach||""))void update(job,{recommendedOutreach:value});}} placeholder="A tailored message to the recruiter or hiring team will appear here."/></label><button type="button" className="secondary" disabled={!job.recommendedOutreach?.trim()} onClick={()=>void copyRecommended(job.recommendedOutreach||"")}>Copy message</button></aside></div>
          </div>
          <div className="job-chip-row">
            <span className="job-chip">{job.sourcePlatform || "Other source"}</span>
            <span className="job-chip">AI research tool: {job.researchTool || "Unknown"}</span>
            {job.salaryText && <span className="job-chip salary">{job.salaryText}</span>}
            {(job.postedAtText || safeDate(job.postedAt)) && <span className="job-chip">Posted: {job.postedAtText || safeDate(job.postedAt)}</span>}
            {job.discoveredAt && <span className="job-chip">Found: {safeDate(job.discoveredAt)}</span>}
          </div>
          {job.matchReason && <p className="job-match">{job.matchReason}</p>}
          {job.sourceMetadata?.searchMode === "loose" && <div className="job-chip-row">
            <span className="job-chip">Loose Mode</span>
            {typeof job.sourceMetadata.skillMatchScore === "number" && <span className="job-chip">{job.sourceMetadata.skillMatchScore}% skill match</span>}
            {typeof job.sourceMetadata.practicalEligibility === "string" && <span className="job-chip">{job.sourceMetadata.practicalEligibility}</span>}
          </div>}
          {expanded.includes(job.id) && <div className="job-expanded">
            {job.description && <div><strong>Job description</strong><p>{job.description}</p></div>}
            {job.sourceMetadata?.searchMode === "loose" && <div>
              <strong>Loose Mode assessment</strong>
              {(["matchingSkills", "transferableSkills", "equivalentTools", "missingRequirements", "experienceGaps", "scheduleConflicts", "preferenceWarnings", "inclusionReasons"] as const).map(key => {
                const items = metaList(job.sourceMetadata, key);
                return items.length ? <div key={key}><strong>{metaLabel[key]}</strong><ul>{items.map((item, index) => <li key={key + index}>{item}</li>)}</ul></div> : null;
              })}
              {typeof job.sourceMetadata.countryEligibility === "string" && <p><strong>Country eligibility:</strong> {job.sourceMetadata.countryEligibility}</p>}
            </div>}
            {job.notes && <div><strong>Your notes</strong><p>{job.notes}</p></div>}
            {job.evidenceUrls?.length > 0 && <div><strong>Other evidence</strong><ul>{job.evidenceUrls.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul></div>}
            <label>Notes<textarea rows={2} value={job.notes || ""} onChange={e => setJobs(old => old.map(item => item.id === job.id ? { ...item, notes: e.target.value } : item))} onBlur={e => void update(job, { notes: e.target.value })} placeholder="Add your notes..." /></label>
          </div>}
          <div className="job-actions">
            <a href={job.sourceUrl} target="_blank" rel="noreferrer">Original listing ↗</a>
            {job.applicationUrl && <a href={job.applicationUrl} target="_blank" rel="noreferrer">Apply ↗</a>}
            <button type="button" className="text-button" onClick={() => toggleExpanded(job.id)}>{expanded.includes(job.id) ? "Hide details" : "Details and notes"}</button>
            <button type="button" className="text-button delete" onClick={() => void remove(job)}>Remove</button>
          </div>
        </article>)}
      </div> : <div className="empty"><strong>{jobs.length ? "No matching jobs" : "No jobs saved yet"}</strong><p>{jobs.length ? "Try another search or status filter." : "Set your job preferences, generate the Find jobs prompt, and let ChatGPT research vacancies across the public web."}</p><a className="button" href="/settings">Open job preferences</a></div>}
      <div className="row" aria-label="Job pages"><span className="muted">Showing {filtered.length ? (page-1)*pageSize+1 : 0}–{Math.min(page*pageSize,filtered.length)} of {filtered.length}</span><button type="button" className="secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" className="secondary" disabled={page>=pageCount} onClick={()=>setPage(p=>p+1)}>Next</button></div><p className="muted" role="status">{message}</p>
    </section>

    <section className="panel">
      <div className="section-heading"><div><h2>Import from ChatGPT</h2><p className="muted">Use this when ChatGPT cannot send the save request directly. Paste the JSON object it returns.</p></div></div>
      <textarea rows={8} value={importText} onChange={e => setImportText(e.target.value)} placeholder={'{"jobs":[{"title":"Example role","company":"Company","sourceUrl":"https://example.com/jobs/123"}]}'} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}><button type="button" onClick={() => void importJobs()} disabled={importing || !importText.trim()}>{importing ? "Importing..." : "Import jobs"}</button></div>
      <p className="footnote">Import accepts 1–50 jobs per batch. A valid title and original source URL are required. Duplicate source URLs are ignored.</p>
    </section>
  </main>;
}
