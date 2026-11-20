"use client";
import { useEffect, useMemo, useState } from "react";
import { buildCommercialLeadPrompt } from "@/lib/lead-chatgpt-prompt";

type Props = {
  profileId: string;
  profileName: string;
  engines: string[];
  locationOverride: string;
  queryOverride: string;
};

function maskSecrets(value: string, token: string, shareToken: string) {
  let output = value;
  if (token) output = output.split(token).join("••••••••••••••••");
  if (shareToken) output = output.split(shareToken).join("••••••••••••••••");
  return output;
}

export default function LeadChatGptPrompt({
  profileId, profileName, engines, locationOverride, queryOverride
}: Props) {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [origin, setOrigin] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [targetCount, setTargetCount] = useState(20);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    const saved = localStorage.getItem("inlinked_access_token") || localStorage.getItem("inlinked_permanent_token") || "";
    if (saved) setToken(saved);
    fetch("/api/assistant-access", { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (response.status === 401) throw new Error("Sign in to use the ChatGPT connection.");
        if (!response.ok) throw new Error(data.error || "Could not check the Inlinked Access Token.");
        setEnabled(Boolean(data.enabled));
        setShareToken(typeof data.vercelShareToken === "string" ? data.vercelShareToken : "");
        if (!data.enabled && saved) {
          setToken("");
          localStorage.removeItem("inlinked_access_token");
          localStorage.removeItem("inlinked_permanent_token");
        }
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Could not check the Access Token."))
      .finally(() => setChecking(false));
  }, []);

  function loadExistingToken() {
    const value = tokenDraft.trim();
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(value)) {
      setMessage("Paste a valid existing Inlinked Access Token.");
      return;
    }
    setToken(value);
    localStorage.setItem("inlinked_access_token", value);
    localStorage.removeItem("inlinked_permanent_token");
    setTokenDraft("");
    setMessage("Existing Access Token loaded in this browser. It was not regenerated.");
  }

  const prompt = useMemo(() => {
    if (!token || !origin || !profileId || engines.length === 0) return "";
    return buildCommercialLeadPrompt({
      token, origin, deploymentShareToken: shareToken, profileId, profileName,
      targetCount, engines, locationOverride, queryOverride
    });
  }, [token, origin, shareToken, profileId, profileName, targetCount, engines, locationOverride, queryOverride]);

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("ChatGPT research prompt copied. It contains private Inlinked access details; keep it private.");
    } catch {
      setMessage("Your browser blocked copying. Select the prompt preview and copy it manually.");
    }
  }

  return <div className="lead-chatgpt-prompt wide">
    <div className="lead-form">
      <label>Number of commercial leads to target
        <input type="number" min={1} max={50} step={1} value={targetCount}
          onChange={event => {
            const next = Number(event.target.value);
            if (Number.isInteger(next) && next >= 1 && next <= 50) setTargetCount(next);
          }} />
        <small className="muted">Choose 1–50. ChatGPT will return fewer rather than inventing or padding weak opportunities.</small>
      </label>
      <div className="wide form-footer">
        <span className="muted">{profileId ? "Selected profile: " + profileName : "Save a Lead Profile first."}</span>
        <div className="row">
          <button type="button" onClick={() => void copyPrompt()} disabled={!prompt || checking}>Copy ChatGPT research prompt</button>
          <a className="button secondary" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT</a>
        </div>
      </div>
    </div>
    {!checking && !token && enabled && <div className="token-import">
      <label>Load your existing Inlinked Access Token
        <input type="password" value={tokenDraft} onChange={event => setTokenDraft(event.target.value)}
          autoComplete="off" spellCheck={false} placeholder="Paste the long-lived token from Settings or a saved prompt" />
      </label>
      <button type="button" className="secondary" onClick={loadExistingToken} disabled={!tokenDraft.trim()}>Use existing Access Token</button>
    </div>}
    {!checking && !enabled && <p className="footnote">No active ChatGPT Access Token was found. <a href="/settings">Open Settings → ChatGPT connection</a> and generate one first.</p>}
    {checking && <p className="muted">Checking your ChatGPT connection…</p>}
    {!engines.length && <p className="footnote">Choose at least one discovery engine above to generate the prompt.</p>}
    {!profileId && <p className="footnote">Save a Lead Profile before generating a research prompt.</p>}
    {prompt
      ? <pre className="prompt-box" aria-label="Commercial lead ChatGPT research prompt">{maskSecrets(prompt, token, shareToken)}</pre>
      : <div className="empty"><strong>No prompt yet</strong><p>Choose a saved Lead Profile and at least one discovery engine. Your existing Access Token is used; no new token is generated.</p></div>}
    <p className="muted" role="status">{message}</p>
    <p className="footnote">The prompt asks ChatGPT to research with its own web search, retrieve this profile's current preferences, then save qualified commercial leads into this pipeline. Anyone with the copied prompt can access your profile context and save records to your Inlinked account. Keep it private.</p>
  </div>;
}
