"use client";
import { useEffect, useMemo, useState } from "react";
import { buildChatGptPrompt, buildJobChatGptPrompt, type JobSearchDepth, type PromptKind, type ScheduleFrequency, type ScheduleTimeChoice } from "@/lib/chatgpt-prompts";

type Status = { enabled: boolean; createdAt: string };
type AccessToken = { token: string; origin: string };

const KINDS: { id: PromptKind; title: string; hint: string }[] = [
  { id: "research", title: "Research now", hint: "ChatGPT researches public sources and saves qualified jobs or prospects, depending on the selected research type." },
  { id: "scheduled", title: "Recurring (scheduled)", hint: "Uses the same long-lived Access Token for every scheduled run." }
];

function mask(prompt: string, token: string) {
  return token ? prompt.split(token).join("••••••••••••••••") : prompt;
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ChatGptSettings({ prospectCount, jobCount }: { prospectCount: number; jobCount: number }) {
  const [researchArea, setResearchArea] = useState<"leads" | "jobs">("jobs");
  const [status, setStatus] = useState<Status>({ enabled: false, createdAt: "" });
  const [kind, setKind] = useState<PromptKind>("research");
  const [jobSearchDepth, setJobSearchDepth] = useState<JobSearchDepth>("standard");
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>("daily");
  const [scheduleTimeChoice, setScheduleTimeChoice] = useState<ScheduleTimeChoice>("morning");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleTimezone, setScheduleTimezone] = useState("Africa/Cairo");
  const [scheduleEndEnabled, setScheduleEndEnabled] = useState(false);
  const [scheduleEndDate, setScheduleEndDate] = useState("");
  const [access, setAccess] = useState<AccessToken | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [deploymentShareToken, setDeploymentShareToken] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Reuse the previous permanent token where available: it is already a
    // non-expiring token in ai_access_tokens and can directly access Context/Save.
    const savedToken = localStorage.getItem("inlinked_access_token")
      || localStorage.getItem("inlinked_permanent_token");
    if (savedToken) {
      setAccess({ token: savedToken, origin: window.location.origin });
      localStorage.setItem("inlinked_access_token", savedToken);
    }
    localStorage.removeItem("inlinked_quick_session");
    localStorage.removeItem("inlinked_permanent_token");

    fetch("/api/assistant-access", { cache: "no-store" })
      .then(async r => {
        if (r.status === 401) {
          setMessage("Please sign in to manage your Inlinked Access Token.");
          return;
        }
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not check the Access Token.");
        setStatus({ enabled: Boolean(d.enabled), createdAt: d.createdAt || "" });
        setDeploymentShareToken(typeof d.vercelShareToken === "string" ? d.vercelShareToken : "");
        if (!d.enabled) {
          setAccess(null);
          localStorage.removeItem("inlinked_access_token");
        }
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Could not check the Access Token."));
  }, []);

  const activeToken = access?.token || "";
  const activeOrigin = access?.origin || "";
  const scheduleReady = kind !== "scheduled" || !scheduleEndEnabled || Boolean(scheduleEndDate);
  const prompt = useMemo(
    () => (activeToken && activeOrigin && scheduleReady
      ? researchArea === "jobs"
        ? buildJobChatGptPrompt({
            kind, token: activeToken, origin: activeOrigin, jobCount, searchDepth: jobSearchDepth, deploymentShareToken,
            scheduleFrequency, scheduleTimeChoice, scheduleTime, scheduleTimezone,
            scheduleEndEnabled, scheduleEndDate
          })
        : buildChatGptPrompt({
            kind, token: activeToken, origin: activeOrigin, prospectCount, deploymentShareToken,
            scheduleFrequency, scheduleTimeChoice, scheduleTime, scheduleTimezone,
            scheduleEndEnabled, scheduleEndDate
          })
      : ""),
    [researchArea, kind, activeToken, activeOrigin, prospectCount, jobCount, jobSearchDepth,
      scheduleFrequency, scheduleTimeChoice, scheduleTime, scheduleTimezone,
      scheduleEndEnabled, scheduleEndDate, scheduleReady, deploymentShareToken]
  );

  function useExistingAccessToken() {
    const value = tokenDraft.trim();
    if (!value) return;
    setAccess({ token: value, origin: window.location.origin });
    localStorage.setItem("inlinked_access_token", value);
    localStorage.removeItem("inlinked_permanent_token");
    localStorage.removeItem("inlinked_quick_session");
    setTokenDraft("");
    setMessage("Existing Access Token loaded in this preview browser. It was not regenerated or changed in your Inlinked account.");
  }

  async function generateAccessToken() {
    if (status.enabled && !window.confirm("Regenerate the Access Token? The current token will stop working immediately, including in previously copied prompts.")) return;
    setBusy("generate");
    setMessage("");
    try {
      const r = await fetch("/api/assistant-access", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not generate the Access Token.");
      const next = { token: d.accessToken, origin: d.origin || window.location.origin };
      setAccess(next);
      setDeploymentShareToken(typeof d.vercelShareToken === "string" ? d.vercelShareToken : "");
      localStorage.setItem("inlinked_access_token", d.accessToken);
      localStorage.removeItem("inlinked_permanent_token");
      localStorage.removeItem("inlinked_quick_session");
      setStatus({ enabled: true, createdAt: d.createdAt || new Date().toISOString() });
      setMessage("Access Token generated. It does not expire automatically. Copy a new prompt for ChatGPT and keep the token private.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate the Access Token.");
    } finally {
      setBusy("");
    }
  }

  async function revokeAccessToken() {
    if (!window.confirm("Revoke the Access Token? ChatGPT prompts using it will stop working immediately.")) return;
    setBusy("revoke");
    setMessage("");
    try {
      const r = await fetch("/api/assistant-access", { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not revoke the Access Token.");
      setStatus({ enabled: false, createdAt: "" });
      setAccess(null);
      localStorage.removeItem("inlinked_access_token");
      localStorage.removeItem("inlinked_permanent_token");
      localStorage.removeItem("inlinked_quick_session");
      setMessage("Access Token revoked. Previously copied prompts can no longer access your Inlinked account.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke the Access Token.");
    } finally {
      setBusy("");
    }
  }

  async function copyAccessToken() {
    if (!activeToken) return;
    try {
      await navigator.clipboard.writeText(activeToken);
      setMessage("Access Token copied. Treat it like a password.");
    } catch {
      setMessage("Your browser blocked copying. Select the token and copy it manually.");
    }
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("Prompt copied. It contains your Inlinked Access Token and preview access link. Keep it private.");
    } catch {
      setMessage("Your browser blocked copying. Select the prompt text below and copy it manually.");
    }
  }

  return <>
    <section className="panel">
      <h2>1. What should ChatGPT research?</h2>
      <div className="method-grid">
        <button type="button" className={"method-card" + (researchArea === "jobs" ? " active" : "")} onClick={() => setResearchArea("jobs")} aria-pressed={researchArea === "jobs"}><strong>Find jobs</strong><span className="muted">Search vacancies across job boards, employers, LinkedIn and public social posts.</span></button>
        <button type="button" className={"method-card" + (researchArea === "leads" ? " active" : "")} onClick={() => setResearchArea("leads")} aria-pressed={researchArea === "leads"}><strong>Find leads</strong><span className="muted">Discover relevant people and decision-makers using your lead preferences.</span></button>
      </div>
      {researchArea === "jobs" && <div className="search-depth-section">
        <h3>Job search mode</h3>
        <div className="method-grid">
          <button
            type="button"
            className={"method-card" + (jobSearchDepth === "standard" ? " active" : "")}
            onClick={() => setJobSearchDepth("standard")}
            aria-pressed={jobSearchDepth === "standard"}
          >
            <strong>Standard search</strong>
            <span className="muted">Use the existing research prompt and search approach.</span>
          </button>
          <button
            type="button"
            className={"method-card" + (jobSearchDepth === "deep" ? " active" : "")}
            onClick={() => setJobSearchDepth("deep")}
            aria-pressed={jobSearchDepth === "deep"}
          >
            <strong>Deep &amp; Broad Search</strong>
            <span className="muted">Run more research passes, explore alternative role titles and search more source types while keeping your saved preferences.</span>
          </button>
          <button
            type="button"
            className={"method-card" + (jobSearchDepth === "loose" ? " active" : "")}
            onClick={() => setJobSearchDepth("loose")}
            aria-pressed={jobSearchDepth === "loose"}
          >
            <strong>Loose Mode</strong>
            <span className="muted">Discover opportunities through transferable skills and equivalent tools. Keep relevant jobs with experience or schedule gaps, clearly flagged for review.</span>
          </button>
        </div>
        <p className="footnote">Standard and Deep &amp; Broad keep your saved eligibility filters. Loose Mode relaxes soft matching requirements but preserves hard restrictions, exclusions and duplicate checks. Standard remains the default.</p>
      </div>}
      <div className="method-grid">
        {KINDS.map(k => (
          <button
            key={k.id}
            type="button"
            className={"method-card" + (kind === k.id ? " active" : "")}
            onClick={() => setKind(k.id)}
            aria-pressed={kind === k.id}
          >
            <strong>{k.title}</strong>
            <span className="muted">{k.hint}</span>
          </button>
        ))}
      </div>
    </section>

    {kind === "scheduled" && <section className="panel">
      <h2>Recurring schedule</h2>
      <p className="muted">Choose the repeat pattern, preferred time and optional end date. These settings will be included in the generated prompt.</p>
      <div className="lead-form">
        <label>Repeat<select value={scheduleFrequency} onChange={e => setScheduleFrequency(e.target.value as ScheduleFrequency)}>
          <option value="daily">Daily</option>
          <option value="weekdays">Weekdays (Monday–Friday)</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select></label>
        <label>Time<select value={scheduleTimeChoice} onChange={e => setScheduleTimeChoice(e.target.value as ScheduleTimeChoice)}>
          <option value="morning">Morning (flexible)</option>
          <option value="afternoon">Afternoon (flexible)</option>
          <option value="evening">Evening (flexible)</option>
          <option value="night">Night (flexible)</option>
          <option value="specific">Specific time</option>
        </select></label>
        {scheduleTimeChoice === "specific" && <label>Specific time<input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} /></label>}
        <label className="wide">Timezone<select value={scheduleTimezone} onChange={e => setScheduleTimezone(e.target.value)}>
          <option value="Africa/Cairo">Egypt (Africa/Cairo)</option>
          <option value="Europe/London">United Kingdom (Europe/London)</option>
          <option value="UTC">UTC</option>
          <option value="America/New_York">US Eastern (America/New_York)</option>
        </select></label>
        <label>End repeat<select value={scheduleEndEnabled ? "on" : "off"} onChange={e => setScheduleEndEnabled(e.target.value === "on")}>
          <option value="off">Off (no end date)</option>
          <option value="on">On (end on a date)</option>
        </select></label>
        {scheduleEndEnabled && <label>End date<input type="date" value={scheduleEndDate} min={localDateValue()} onChange={e => setScheduleEndDate(e.target.value)} required /></label>}
      </div>
      {scheduleTimeChoice === "specific"
        ? <p className="muted">Specific-time scheduling requests the exact selected time in the selected timezone. ChatGPT may only support flexible timing; the prompt tells it not to silently change your choice.</p>
        : <p className="muted">The selected time of day is a flexible window in the selected timezone, not a guaranteed exact minute.</p>}
      {scheduleEndEnabled && !scheduleEndDate && <p className="footnote" role="alert">Choose an end date before copying the scheduled prompt.</p>}
      <p className="footnote">ChatGPT must tell you when it cannot apply a selected repeat option or end date. It should not silently change your schedule or claim the task was created unless confirmed.</p>
    </section>}

    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>2. Inlinked Access Token</h2>
          <p className="muted">One token works directly with both Context and Save. It has no automatic expiry and remains valid until you revoke or regenerate it.</p>
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void generateAccessToken()} disabled={Boolean(busy)}>
          {busy === "generate" ? "Generating..." : status.enabled ? "Regenerate Access Token" : "Generate Access Token"}
        </button>
        {status.enabled && <button type="button" className="secondary" onClick={() => void revokeAccessToken()} disabled={Boolean(busy)}>
          {busy === "revoke" ? "Revoking..." : "Revoke"}
        </button>}
      </div>
      <p className="muted" role="status">
        {status.enabled
          ? "An Access Token is active" + (status.createdAt ? " since " + new Date(status.createdAt).toLocaleString() : "") + "."
          : "No active Access Token."}
      </p>
      {activeToken
        ? <label className="wide">Your Access Token
            <input type="text" readOnly value={activeToken} autoComplete="off" spellCheck={false} />
            <button type="button" className="secondary" onClick={() => void copyAccessToken()}>Copy Access Token</button>
          </label>
        : status.enabled
          ? <div className="wide token-import">
              <label>Use your existing long-lived Access Token
                <input type="password" value={tokenDraft} onChange={e => setTokenDraft(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste the token from your current Inlinked session or saved prompt" />
              </label>
              <button type="button" className="secondary" onClick={useExistingAccessToken} disabled={!tokenDraft.trim()}>Use existing Access Token</button>
              <p className="footnote">This only loads the existing token into this preview browser. It does not create, regenerate or revoke any token in your Inlinked account.</p>
            </div>
          : <p className="footnote">Generate a token to build either prompt below. The token is shown only once and is not recoverable from the database.</p>}
    </section>

    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>3. Copy the prompt into ChatGPT</h2>
          <p className="muted">Both prompts use the same Access Token. Job discovery uses ChatGPT web search first; Firecrawl is optional. Inlinked only provides context and receives saved results.</p>
        </div>
        <button type="button" onClick={() => void copyPrompt()} disabled={!prompt || Boolean(busy)}>{researchArea === "jobs" && jobSearchDepth === "deep" ? "Copy deep-search prompt" : researchArea === "jobs" && jobSearchDepth === "loose" ? "Copy Loose Mode prompt" : "Copy prompt"}</button>
      </div>
      {prompt
        ? <pre className="prompt-box" aria-label="Prompt preview">{mask(mask(prompt, activeToken), deploymentShareToken)}</pre>
        : <div className="empty"><strong>No prompt yet</strong><p>Generate an Access Token above to build your prompt.</p></div>}
      <p className="muted" role="status">{message}</p>
      <p className="footnote">Anyone with the copied prompt can read the selected research context and save results to your account. The prompt also contains the preview's Vercel access link when needed. Keep it private; never paste it anywhere public.</p>
    </section>
  </>;
}
