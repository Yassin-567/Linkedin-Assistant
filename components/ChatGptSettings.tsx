"use client";

import { useEffect, useMemo, useState } from "react";

type Workflow = "connections" | "jobs" | "record_update";
type JobMode = "standard" | "deep" | "loose";
type PromptKind = "research" | "scheduled";
type ScheduleFrequency = "daily" | "weekdays" | "weekly" | "monthly";
type ScheduleTimeChoice = "morning" | "afternoon" | "evening" | "night" | "specific";
type Status = { enabled: boolean; createdAt: string };

type Props = {
  prospectCount: number;
  onProspectCountChange: (value: number) => void;
};

const localDateValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
};

export default function ChatGptSettings({ prospectCount, onProspectCountChange }: Props) {
  const [workflow, setWorkflow] = useState<Workflow>("jobs");
  const [jobMode, setJobMode] = useState<JobMode>("standard");
  const [kind, setKind] = useState<PromptKind>("research");
  const [jobCount, setJobCount] = useState(30);
  const [status, setStatus] = useState<Status>({ enabled: false, createdAt: "" });
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState("");
  const [savingCount, setSavingCount] = useState("");
  const [message, setMessage] = useState("");
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>("daily");
  const [scheduleTimeChoice, setScheduleTimeChoice] = useState<ScheduleTimeChoice>("morning");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleTimezone, setScheduleTimezone] = useState("Africa/Cairo");
  const [scheduleEndEnabled, setScheduleEndEnabled] = useState(false);
  const [scheduleEndDate, setScheduleEndDate] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    const saved = localStorage.getItem("inlinked_access_token") || localStorage.getItem("inlinked_permanent_token") || "";
    if (saved) {
      setToken(saved);
      localStorage.setItem("inlinked_access_token", saved);
    }
    localStorage.removeItem("inlinked_permanent_token");
    localStorage.removeItem("inlinked_quick_session");

    fetch("/api/assistant-access", { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (response.status === 401) throw new Error("Please sign in to manage your permanent AI token.");
        if (!response.ok) throw new Error(data.error || "Could not check the permanent AI token.");
        setStatus({ enabled: Boolean(data.enabled), createdAt: data.createdAt || "" });

        if (!data.enabled) {
          setToken("");
          localStorage.removeItem("inlinked_access_token");
          return;
        }

        // Restore the exact same credential from encrypted database storage on every signed-in browser.
        const recovered = typeof data.accessToken === "string" ? data.accessToken : "";
        if (recovered) {
          setToken(recovered);
          localStorage.setItem("inlinked_access_token", recovered);
          return;
        }

        // Backfill tokens created before this recovery feature, if this browser still holds the original.
        if (saved) {
          const upgrade = await fetch("/api/assistant-access", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: saved })
          });
          const upgradeData = await upgrade.json();
          if (!upgrade.ok) throw new Error(upgradeData.error || "The saved browser token could not be linked to the active account token.");
          setToken(saved);
          setMessage("Your existing permanent token has been securely saved to your account. It will now restore on other browsers too.");
          return;
        }

        setToken("");
        setMessage("A permanent token is active, but it was created before cross-browser recovery was enabled. To fix this once, use Regenerate permanent token. After that, the same token will restore on every browser where you sign in.");
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Could not check the permanent AI token."));

    fetch("/api/job-preferences", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) return;
        const data = await response.json();
        const count = Number(data.preferences?.targetCount || 30);
        if (Number.isInteger(count) && count >= 1 && count <= 50) setJobCount(count);
      })
      .catch(() => undefined);
  }, []);

  const scheduledAvailable = workflow !== "record_update";
  const scheduleReady = kind !== "scheduled" || !scheduleEndEnabled || Boolean(scheduleEndDate);
  const promptLink = useMemo(() => {
    if (!token || !origin || (scheduledAvailable && kind === "scheduled" && !scheduleReady)) return "";
    const url = new URL("/api/assistant-prompt", origin);
    url.searchParams.set("type", workflow);
    url.searchParams.set("mode", workflow === "jobs" ? jobMode : "standard");
    url.searchParams.set("kind", workflow === "record_update" ? "research" : kind);

    if (workflow === "connections") url.searchParams.set("targetCount", String(prospectCount));
    if (workflow === "jobs") url.searchParams.set("targetCount", String(jobCount));
    if (kind === "scheduled" && workflow !== "record_update") {
      url.searchParams.set("frequency", scheduleFrequency);
      url.searchParams.set("timeChoice", scheduleTimeChoice);
      url.searchParams.set("time", scheduleTime);
      url.searchParams.set("timezone", scheduleTimezone);
      url.searchParams.set("endEnabled", scheduleEndEnabled ? "true" : "false");
      if (scheduleEndEnabled && scheduleEndDate) url.searchParams.set("endDate", scheduleEndDate);
    }
    url.searchParams.set("ai", token);
    return url.toString();
  }, [token, origin, workflow, jobMode, kind, prospectCount, jobCount, scheduleFrequency,
    scheduleTimeChoice, scheduleTime, scheduleTimezone, scheduleEndEnabled, scheduleEndDate, scheduleReady]);

  async function loadExistingToken() {
    const value = tokenDraft.trim();
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(value)) {
      setMessage("Paste a valid existing Inlinked permanent AI token.");
      return;
    }
    setBusy("recover");
    try {
      const response = await fetch("/api/assistant-access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this token to your account.");
      setToken(value);
      localStorage.setItem("inlinked_access_token", value);
      setTokenDraft("");
      setMessage("Existing permanent token securely saved to your account. It was not regenerated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the existing token.");
    } finally {
      setBusy("");
    }
  }

  async function generateToken() {
    if (status.enabled && !window.confirm("Regenerate the permanent AI token? Existing prompt links and active temporary sessions will stop working.")) return;
    setBusy("generate");
    setMessage("");
    try {
      const response = await fetch("/api/assistant-access", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate the permanent AI token.");
      const nextToken = String(data.accessToken || "");
      setToken(nextToken);
      localStorage.setItem("inlinked_access_token", nextToken);
      setStatus({ enabled: true, createdAt: data.createdAt || new Date().toISOString() });
      setMessage("Permanent AI token generated. Use it only in private prompt links.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate the permanent AI token.");
    } finally {
      setBusy("");
    }
  }

  async function revokeToken() {
    if (!window.confirm("Revoke the permanent AI token? All prompt links and active sessions created from it will stop working.")) return;
    setBusy("revoke");
    setMessage("");
    try {
      const response = await fetch("/api/assistant-access", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not revoke the token.");
      setStatus({ enabled: false, createdAt: "" });
      setToken("");
      localStorage.removeItem("inlinked_access_token");
      localStorage.removeItem("inlinked_permanent_token");
      setMessage("Permanent AI token and its active sessions have been revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke the token.");
    } finally {
      setBusy("");
    }
  }

  async function saveConnectionCount() {
    setSavingCount("connections");
    try {
      const response = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionTargetCount: prospectCount })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the LinkedIn connection target.");
      setMessage("LinkedIn connection target saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the LinkedIn connection target.");
    } finally {
      setSavingCount("");
    }
  }

  async function saveJobCount() {
    setSavingCount("jobs");
    try {
      const response = await fetch("/api/job-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCount: jobCount })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the job target.");
      setMessage("Job target saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the job target.");
    } finally {
      setSavingCount("");
    }
  }

  async function copyPromptLink() {
    if (!promptLink) return;
    try {
      await navigator.clipboard.writeText(promptLink);
      setMessage(kind === "scheduled"
        ? "Scheduled prompt link copied. Open it with your AI assistant to create the recurring task using your selected schedule."
        : "Prompt link copied. Opening it returns the complete prompt and creates a fresh 15-minute session.");
    } catch {
      setMessage("Your browser blocked copying. Select and copy the prompt link manually.");
    }
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setMessage("Permanent AI token copied. Treat it like a password.");
    } catch {
      setMessage("Your browser blocked copying. Select and copy the token manually.");
    }
  }



  return <>
    <section className="panel">
      <h2>1. Choose what the AI assistant should do</h2>
      <div className="method-grid">
        <button type="button" className={"method-card" + (workflow === "jobs" ? " active" : "")} onClick={() => setWorkflow("jobs")} aria-pressed={workflow === "jobs"}>
          <strong>Find jobs</strong><span className="muted">Search vacancies using your saved job-search filters.</span>
        </button>
        <button type="button" className={"method-card" + (workflow === "connections" ? " active" : "")} onClick={() => setWorkflow("connections")} aria-pressed={workflow === "connections"}>
          <strong>Find LinkedIn connections</strong><span className="muted">Discover people using your saved LinkedIn research preferences.</span>
        </button>
        <button type="button" className={"method-card" + (workflow === "record_update" ? " active" : "")} onClick={() => { setWorkflow("record_update"); setKind("research"); }} aria-pressed={workflow === "record_update"}>
          <strong>Update saved records</strong><span className="muted">Give an assistant instructions to update Jobs, Connections and Commercial Leads.</span>
        </button>
      </div>

      {workflow === "jobs" && <div className="search-depth-section">
        <h3>Job search mode</h3>
        <div className="method-grid">
          <button type="button" className={"method-card" + (jobMode === "standard" ? " active" : "")} onClick={() => setJobMode("standard")} aria-pressed={jobMode === "standard"}>
            <strong>Standard search</strong><span className="muted">Keep all saved job-search eligibility filters.</span>
          </button>
          <button type="button" className={"method-card" + (jobMode === "deep" ? " active" : "")} onClick={() => setJobMode("deep")} aria-pressed={jobMode === "deep"}>
            <strong>Deep &amp; Broad Search</strong><span className="muted">Run more research passes and explore alternative role titles without removing saved eligibility requirements.</span>
          </button>
          <button type="button" className={"method-card" + (jobMode === "loose" ? " active" : "")} onClick={() => setJobMode("loose")} aria-pressed={jobMode === "loose"}>
            <strong>Loose Mode</strong><span className="muted">Include adjacent roles, transferable skills and equivalent tools, while clearly flagging experience or schedule gaps.</span>
          </button>
        </div>
        <p className="footnote">Standard and Deep &amp; Broad preserve saved filters. Loose Mode relaxes soft matching only; hard exclusions, country restrictions and duplicate checks remain in force.</p>
      </div>}

      {scheduledAvailable && <div className="method-grid" style={{ marginTop: 16 }}>
        <button type="button" className={"method-card" + (kind === "research" ? " active" : "")} onClick={() => setKind("research")} aria-pressed={kind === "research"}>
          <strong>Research now</strong><span className="muted">Generate a prompt for a one-time research run.</span>
        </button>
        <button type="button" className={"method-card" + (kind === "scheduled" ? " active" : "")} onClick={() => setKind("scheduled")} aria-pressed={kind === "scheduled"}>
          <strong>Recurring (scheduled)</strong><span className="muted">Create a recurring ChatGPT task with your selected repeat, time, timezone and optional end date.</span>
        </button>
      </div>}
    </section>

    {workflow !== "record_update" && <section className="panel">
      <h2>2. Search target</h2>
      {workflow === "connections"
        ? <label className="wide">LinkedIn connections to target per research run
            <input type="number" min={1} max={50} step={1} value={prospectCount}
              onChange={event => { const n = Number(event.target.value); if (Number.isInteger(n) && n >= 1 && n <= 50) onProspectCountChange(n); }}
              onBlur={() => void saveConnectionCount()} />
            <small className="muted">Choose 1–50. The selected target is saved to your account. The assistant may return fewer only when fewer qualified candidates can be verified.</small>
            {savingCount === "connections" && <small className="muted">Saving target…</small>}
          </label>
        : <label className="wide">Jobs to target per research run
            <input type="number" min={1} max={50} step={1} value={jobCount}
              onChange={event => { const n = Number(event.target.value); if (Number.isInteger(n) && n >= 1 && n <= 50) setJobCount(n); }}
              onBlur={() => void saveJobCount()} />
            <small className="muted">Choose 1–50. Your job target is saved with your job-search preferences.</small>
            {savingCount === "jobs" && <small className="muted">Saving target…</small>}
          </label>}
    </section>}

    {kind === "scheduled" && scheduledAvailable && <section className="panel">
      <h2>3. Recurring schedule</h2>
      <p className="muted">These settings are included in the scheduled prompt link. When the AI assistant opens it, it receives instructions to create a recurring ChatGPT task. Each scheduled run must obtain a fresh 15-minute session from the permanent prompt link.</p>
      <div className="lead-form">
        <label>Repeat<select value={scheduleFrequency} onChange={event => setScheduleFrequency(event.target.value as ScheduleFrequency)}>
          <option value="daily">Daily</option>
          <option value="weekdays">Weekdays (Monday–Friday)</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select></label>
        <label>Time<select value={scheduleTimeChoice} onChange={event => setScheduleTimeChoice(event.target.value as ScheduleTimeChoice)}>
          <option value="morning">Morning (flexible)</option>
          <option value="afternoon">Afternoon (flexible)</option>
          <option value="evening">Evening (flexible)</option>
          <option value="night">Night (flexible)</option>
          <option value="specific">Specific time</option>
        </select></label>
        {scheduleTimeChoice === "specific" && <label>Specific time<input type="time" value={scheduleTime} onChange={event => setScheduleTime(event.target.value)} /></label>}
        <label className="wide">Timezone<select value={scheduleTimezone} onChange={event => setScheduleTimezone(event.target.value)}>
          <option value="Africa/Cairo">Egypt (Africa/Cairo)</option>
          <option value="Europe/London">United Kingdom (Europe/London)</option>
          <option value="UTC">UTC</option>
          <option value="America/New_York">US Eastern (America/New_York)</option>
        </select></label>
        <label>End repeat<select value={scheduleEndEnabled ? "on" : "off"} onChange={event => setScheduleEndEnabled(event.target.value === "on")}>
          <option value="off">Off (no end date)</option>
          <option value="on">On (end on a date)</option>
        </select></label>
        {scheduleEndEnabled && <label>End date<input type="date" value={scheduleEndDate} min={localDateValue()} onChange={event => setScheduleEndDate(event.target.value)} required /></label>}
      </div>
      {scheduleTimeChoice === "specific"
        ? <p className="muted">Specific-time scheduling requests the exact selected time in the selected timezone. The AI platform must confirm whether it supports the exact minute.</p>
        : <p className="muted">Morning, afternoon, evening and night are flexible time windows, not guaranteed exact minutes.</p>}
      {scheduleEndEnabled && !scheduleEndDate && <p className="footnote" role="alert">Choose an end date before copying the scheduled prompt link.</p>}
      <p className="footnote">The assistant must preserve the repeat pattern, time, timezone and end date. It must tell you if ChatGPT Tasks cannot support any selected option, and must not claim the task was created without platform confirmation.</p>
    </section>}

    <section className="panel">
      <h2>{workflow === "record_update" ? "2. Permanent AI token" : kind === "scheduled" ? "4. Permanent AI token" : "3. Permanent AI token"}</h2>
      <p className="muted">This permanent credential is stored in your account database as a validation hash plus an encrypted recovery copy. When you sign in on another browser, Inlinked restores the same token. It does not expire or rotate automatically; only your explicit Regenerate or Revoke action changes it.</p>
      <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void generateToken()} disabled={Boolean(busy)}>
          {busy === "generate" ? "Generating..." : status.enabled ? "Regenerate permanent token" : "Generate permanent token"}
        </button>
        {status.enabled && <button type="button" className="secondary" onClick={() => void revokeToken()} disabled={Boolean(busy)}>
          {busy === "revoke" ? "Revoking..." : "Revoke token"}
        </button>}
      </div>
      <p className="muted" role="status">{status.enabled ? "A permanent AI token is active" + (status.createdAt ? " since " + new Date(status.createdAt).toLocaleString() : "") + "." : "No active permanent AI token."}</p>
      {token
        ? <label className="wide">Your permanent AI token
            <input type="password" readOnly value={token} autoComplete="off" spellCheck={false} />
            <button type="button" className="secondary" onClick={() => void copyToken()}>Copy token</button>
          </label>
        : status.enabled
          ? <div className="wide token-import">
              <label>Load your existing permanent AI token
                <input type="password" value={tokenDraft} onChange={event => setTokenDraft(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste the permanent token you previously generated" />
              </label>
              <button type="button" className="secondary" onClick={() => void loadExistingToken()} disabled={!tokenDraft.trim()}>Load existing token</button>
            </div>
          : <p className="footnote">Generate a permanent token first. Inlinked keeps a SHA-256 validation hash and an encrypted recovery copy in your account database, so you can restore it after signing in on another browser.</p>}
    </section>

    <section className="panel">
      <div className="section-heading"><div><h2>{workflow === "record_update" ? "3. Record Update prompt link" : kind === "scheduled" ? "5. Copy scheduled prompt link" : "4. Copy the prompt link"}</h2>
        <p className="muted">Opening this URL in any browser validates the permanent credential and returns the selected prompt with a new temporary session. It does not expose the prompt through a logged-in settings page.</p></div></div>
      <label className="wide">Generated prompt URL<input type="text" readOnly value={promptLink} placeholder="Generate or load your permanent AI token first." /></label>
      <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void copyPromptLink()} disabled={!promptLink || Boolean(busy)}>Copy prompt link</button>
        {promptLink && <a className="button secondary" href={promptLink} target="_blank" rel="noreferrer">Open prompt in browser</a>}
      </div>
      {workflow === "record_update"
        ? <p className="footnote">The Record Update prompt covers Jobs, LinkedIn research prospects and Commercial Leads. It uses the 15-minute session token and the POST /api/assistant-update endpoint.</p>
        : kind === "scheduled"
          ? <p className="footnote">Each recurring occurrence must reopen the private prompt link to exchange the permanent token for a fresh 15-minute session before using the Context, Save or Update endpoints.</p>
          : <p className="footnote">The same short-lived session token is used for all relevant Context, Save and Update endpoints. It expires 15 minutes after the URL is opened.</p>}
      <p className="footnote">Anyone who receives the link can open it and create a temporary session for this account. Keep it private. Revoke or regenerate the permanent token if it is exposed.</p>
      <p className="muted" role="status">{message}</p>
    </section>
  </>;
}
