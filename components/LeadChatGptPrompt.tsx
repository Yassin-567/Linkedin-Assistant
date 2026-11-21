"use client";

import { useEffect, useMemo, useState } from "react";

type Props = { profileId: string; profileName: string; profileSaved: boolean };

export default function LeadChatGptPrompt({ profileId, profileName, profileSaved }: Props) {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [origin, setOrigin] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    const saved = localStorage.getItem("inlinked_access_token") || "";
    if (saved) setToken(saved);
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
    if (!token || !origin || !profileId || !profileSaved) return "";
    const url = new URL("/api/assistant-prompt", origin);
    url.searchParams.set("type", "leads");
    url.searchParams.set("mode", "standard");
    url.searchParams.set("ai", token);
    return url.toString();
  }, [token, origin, profileId, profileSaved]);

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
      setMessage("Commercial Leads prompt link copied. Opening it creates a fresh 15-minute AI session.");
    } catch {
      setMessage("Your browser blocked copying. Select and copy the prompt link manually.");
    }
  }

  return <div className="lead-chatgpt-prompt wide">
    <div className="wide form-footer">
      <span className="muted">{profileSaved ? "Selected Lead Profile: " + profileName : "Save and activate the intended Lead Profile first."}</span>
      <div className="row">
        <button type="button" onClick={() => void copyLink()} disabled={!promptLink || checking || !profileSaved}>Copy Leads prompt link</button>
        {promptLink && <a className="button secondary" href={promptLink} target="_blank" rel="noreferrer">Open prompt in browser</a>}
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
    {!profileSaved && <p className="footnote">Save your current profile changes and make it active before copying this link. The gateway uses the active saved profile and its discovery engines.</p>}
    <p className="muted" role="status">{message}</p>
    <p className="footnote">The link contains your permanent credential. Anyone with it can open the prompt, read the selected profile instructions and generate a temporary session. Keep it private. Revoke or regenerate the permanent token if the link is exposed.</p>
  </div>;
}
