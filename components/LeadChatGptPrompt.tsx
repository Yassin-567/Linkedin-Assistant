"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  profileId: string;
  profileName: string;
  profileSaved: boolean;
  engines: string[];
  locationOverride: string;
  queryOverride: string;
};

export default function LeadChatGptPrompt({
  profileId, profileName, profileSaved, engines, locationOverride, queryOverride
}: Props) {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [origin, setOrigin] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [targetCount, setTargetCount] = useState(20);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    const saved = localStorage.getItem("inlinked_access_token") || "";
    if (saved) setToken(saved);
    const savedTarget = Number(localStorage.getItem("inlinked_lead_target_count") || 20);
    if (Number.isInteger(savedTarget) && savedTarget >= 1 && savedTarget <= 50) setTargetCount(savedTarget);
    fetch("/api/assistant-access", { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (response.status === 401) throw new Error("Sign in to use the Inlinked prompt gateway.");
        if (!response.ok) throw new Error(data.error || "Could not check the permanent AI token.");
        setEnabled(Boolean(data.enabled));
        if (!data.enabled) {
          setToken("");
          localStorage.removeItem("inlinked_access_token");
        }
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Could not check the permanent AI token."))
      .finally(() => setChecking(false));
  }, []);

  const promptLink = useMemo(() => {
    if (!token || !origin || !profileId || !profileSaved || engines.length === 0) return "";
    const url = new URL("/api/assistant-prompt", origin);
    url.searchParams.set("type", "leads");
    url.searchParams.set("mode", "standard");
    url.searchParams.set("targetCount", String(targetCount));
    url.searchParams.set("engines", engines.join(","));
    if (locationOverride.trim()) url.searchParams.set("locationOverride", locationOverride.trim());
    if (queryOverride.trim()) url.searchParams.set("queryOverride", queryOverride.trim());
    url.searchParams.set("ai", token);
    return url.toString();
  }, [token, origin, profileId, profileSaved, targetCount, engines, locationOverride, queryOverride]);

  function changeTargetCount(value: string) {
    const next = Number(value);
    if (Number.isInteger(next) && next >= 1 && next <= 50) {
      setTargetCount(next);
      localStorage.setItem("inlinked_lead_target_count", String(next));
    }
  }

  function loadExistingToken() {
    const value = tokenDraft.trim();
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(value)) {
      setMessage("Paste a valid existing Inlinked permanent AI token.");
      return;
    }
    setToken(value);
    localStorage.setItem("inlinked_access_token", value);
    setTokenDraft("");
    setMessage("Existing permanent token loaded in this browser.");
  }

  async function copyLink() {
    if (!promptLink) return;
    try {
      await navigator.clipboard.writeText(promptLink);
      setMessage("Commercial Leads prompt link copied. Opening it creates a fresh 15-minute AI session with these search settings.");
    } catch {
      setMessage("Your browser blocked copying. Select and copy the prompt link manually.");
    }
  }

  return <div className="lead-chatgpt-prompt wide">
    <div className="lead-form">
      <label>Number of commercial leads to target
        <input type="number" min={1} max={50} step={1} value={targetCount} onChange={event => changeTargetCount(event.target.value)} />
        <small className="muted">Choose 1–50. The assistant returns fewer rather than inventing or padding weak opportunities.</small>
      </label>
      <div className="wide form-footer">
        <span className="muted">{profileSaved ? "Selected profile: " + profileName : "Save and activate the intended Lead Profile first."}</span>
        <div className="row">
          <button type="button" onClick={() => void copyLink()} disabled={!promptLink || checking}>Copy Leads prompt link</button>
          {promptLink && <a className="button secondary" href={promptLink} target="_blank" rel="noreferrer">Open prompt in browser</a>}
        </div>
      </div>
    </div>
    {!checking && !token && enabled && <div className="token-import">
      <label>Load your permanent AI token
        <input type="password" value={tokenDraft} onChange={event => setTokenDraft(event.target.value)}
          autoComplete="off" spellCheck={false} placeholder="Paste the token from Settings → ChatGPT connection" />
      </label>
      <button type="button" className="secondary" onClick={loadExistingToken} disabled={!tokenDraft.trim()}>Load existing token</button>
    </div>}
    {!checking && !enabled && <p className="footnote">No active permanent AI token was found. <a href="/settings">Open Settings → ChatGPT connection</a> and generate one first.</p>}
    {checking && <p className="muted">Checking your prompt gateway connection…</p>}
    {!engines.length && <p className="footnote">Choose at least one discovery engine above to generate the prompt.</p>}
    {!profileSaved && <p className="footnote">Save and activate a Lead Profile before copying this link. The gateway uses the active saved profile.</p>}
    <p className="muted" role="status">{message}</p>
    <p className="footnote">The gateway reads the active saved Lead Profile. Your selected discovery engines, target count, location override and extra search context are carried into this research run only.</p>
    <p className="footnote">The link contains your permanent credential. Anyone with it can open the prompt and generate a temporary session. Keep it private; revoke or regenerate the token if it is exposed.</p>
  </div>;
}
