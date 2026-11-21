"use client";

import { useEffect, useMemo, useState } from "react";

type Workflow = "connections" | "jobs" | "record_update";
type JobMode = "standard" | "deep" | "loose";
type Status = { enabled: boolean; createdAt: string };

export default function ChatGptSettings() {
  const [workflow, setWorkflow] = useState<Workflow>("jobs");
  const [jobMode, setJobMode] = useState<JobMode>("standard");
  const [status, setStatus] = useState<Status>({ enabled: false, createdAt: "" });
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

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
        }
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Could not check the permanent AI token."));
  }, []);

  const mode = workflow === "jobs" ? jobMode : "standard";
  const promptLink = useMemo(() => {
    if (!token || !origin) return "";
    const url = new URL("/api/assistant-prompt", origin);
    url.searchParams.set("type", workflow);
    url.searchParams.set("mode", mode);
    url.searchParams.set("ai", token);
    return url.toString();
  }, [token, origin, workflow, mode]);

  function loadExistingToken() {
    const value = tokenDraft.trim();
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(value)) {
      setMessage("Paste a valid existing Inlinked permanent AI token.");
      return;
    }
    setToken(value);
    localStorage.setItem("inlinked_access_token", value);
    setTokenDraft("");
    setMessage("Existing permanent AI token loaded in this browser. It was not regenerated.");
  }

  async function generateToken() {
    if (status.enabled && !window.confirm("Regenerate the permanent AI token? All old prompt links and active temporary sessions will stop working.")) return;
    setBusy("generate");
    setMessage("");
    try {
      const response = await fetch("/api/assistant-access", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate the permanent AI token.");
      const nextToken = String(data.accessToken || "");
      setToken(nextToken);
      setOrigin(data.origin || window.location.origin);
      localStorage.setItem("inlinked_access_token", nextToken);
      setStatus({ enabled: true, createdAt: data.createdAt || new Date().toISOString() });
      setMessage("Permanent AI token generated. Use it only in private prompt links; it is not accepted by Context, Save or Update endpoints.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate the permanent AI token.");
    } finally {
      setBusy("");
    }
  }

  async function revokeToken() {
    if (!window.confirm("Revoke the permanent AI token? All prompt links and temporary sessions created from it will stop working.")) return;
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
      setMessage("Permanent AI token revoked. Existing sessions created from it have also been revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke the token.");
    } finally {
      setBusy("");
    }
  }

  async function copyPromptLink() {
    if (!promptLink) return;
    try {
      await navigator.clipboard.writeText(promptLink);
      setMessage("Prompt link copied. Opening it in a browser generates a fresh 15-minute session and displays the complete prompt.");
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
      <h2>1. Choose the prompt workflow</h2>
      <div className="method-grid">
        <button type="button" className={"method-card" + (workflow === "jobs" ? " active" : "")} onClick={() => setWorkflow("jobs")} aria-pressed={workflow === "jobs"}>
          <strong>Find jobs</strong><span className="muted">Search vacancies using your saved job preferences.</span>
        </button>
        <button type="button" className={"method-card" + (workflow === "connections" ? " active" : "")} onClick={() => setWorkflow("connections")} aria-pressed={workflow === "connections"}>
          <strong>Find LinkedIn connections</strong><span className="muted">Discover professionals using your saved LinkedIn research preferences.</span>
        </button>
        <button type="button" className={"method-card" + (workflow === "record_update" ? " active" : "")} onClick={() => setWorkflow("record_update")} aria-pressed={workflow === "record_update"}>
          <strong>Update saved records</strong><span className="muted">Give an assistant the instructions and endpoint needed to update Jobs, Connections and Commercial Leads.</span>
        </button>
      </div>
      {workflow === "jobs" && <div className="search-depth-section">
        <h3>Job search mode</h3>
        <div className="method-grid">
          <button type="button" className={"method-card" + (jobMode === "standard" ? " active" : "")} onClick={() => setJobMode("standard")} aria-pressed={jobMode === "standard"}>
            <strong>Standard search</strong><span className="muted">Use saved eligibility preferences and the standard research approach.</span>
          </button>
          <button type="button" className={"method-card" + (jobMode === "deep" ? " active" : "")} onClick={() => setJobMode("deep")} aria-pressed={jobMode === "deep"}>
            <strong>Deep &amp; Broad Search</strong><span className="muted">Run additional research passes and explore alternative role titles while keeping saved eligibility preferences.</span>
          </button>
          <button type="button" className={"method-card" + (jobMode === "loose" ? " active" : "")} onClick={() => setJobMode("loose")} aria-pressed={jobMode === "loose"}>
            <strong>Loose Mode</strong><span className="muted">Include adjacent roles, transferable skills and equivalent tools, clearly flagging practical gaps.</span>
          </button>
        </div>
      </div>}
    </section>

    <section className="panel">
      <div className="section-heading">
        <div><h2>2. Permanent AI token</h2><p className="muted">This credential only opens the prompt gateway. The gateway creates a separate 15-minute session token for Context, Save and Update requests.</p></div>
      </div>
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
              <button type="button" className="secondary" onClick={loadExistingToken} disabled={!tokenDraft.trim()}>Load existing token</button>
            </div>
          : <p className="footnote">Generate a permanent token first. It is stored as a SHA-256 hash and shown only when generated.</p>}
    </section>

    <section className="panel">
      <div className="section-heading"><div><h2>3. Copy the prompt link</h2><p className="muted">Send this link to the AI assistant instead of copying a long prompt. Opening it in any browser validates the permanent token, generates a new 15-minute session and returns the complete prompt.</p></div></div>
      <div className="lead-form">
        <label className="wide">Generated prompt URL
          <input type="text" readOnly value={promptLink} placeholder="Generate or load your permanent AI token first." />
        </label>
      </div>
      <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void copyPromptLink()} disabled={!promptLink || Boolean(busy)}>Copy prompt link</button>
        {promptLink && <a className="button secondary" href={promptLink} target="_blank" rel="noreferrer">Open prompt in browser</a>}
      </div>
      <p className="footnote">Each time the link is opened successfully, a fresh temporary session token is issued for 15 minutes. The same temporary token is used for all Context, Save and Update endpoints. Reopening the link creates another session.</p>
      <p className="footnote">The link contains your permanent credential. Anyone who receives it can open the prompt and create temporary sessions for your Inlinked account. Keep it private; revoke or regenerate the token if it is exposed.</p>
      <p className="muted" role="status">{message}</p>
    </section>
  </>;
}
