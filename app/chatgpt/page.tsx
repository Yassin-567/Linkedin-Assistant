"use client";
import { useEffect, useMemo, useState } from "react";
import { buildChatGptPrompt, type PromptKind, type PromptMode } from "@/lib/chatgpt-prompts";

type Status = { enabled: boolean; createdAt: string };
type Session = { token: string; expiresAt: string; origin: string };
type Permanent = { token: string; origin: string };

const KINDS: { id: PromptKind; title: string; hint: string }[] = [
  { id: "research", title: "Research now", hint: "ChatGPT finds and saves up to 50 prospects, then reports back." },
  { id: "scheduled", title: "Recurring (scheduled)", hint: "ChatGPT asks you for a schedule first, then repeats the research." }
];

function mask(prompt: string, token: string) {
  return token ? prompt.split(token).join("••••••••••••••••") : prompt;
}

export default function ChatGptPage() {
  const [status, setStatus] = useState<Status>({ enabled: false, createdAt: "" });
  const [signedIn, setSignedIn] = useState(true);
  const [kind, setKind] = useState<PromptKind>("research");
  const [mode, setMode] = useState<PromptMode>("session");
  const [session, setSession] = useState<Session | null>(null);
  const [permanent, setPermanent] = useState<Permanent | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/assistant-ai-token", { cache: "no-store" })
      .then(async r => {
        if (r.status === 401) { setSignedIn(false); return; }
        const d = await r.json();
        if (r.ok) setStatus({ enabled: Boolean(d.enabled), createdAt: d.createdAt || "" });
        else setMessage(d.error || "Could not check the connection status.");
      })
      .catch(() => setMessage("Could not check the connection status."));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = session ? Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - now) / 1000)) : 0;
  const sessionLive = Boolean(session) && secondsLeft > 0;
  const activeToken = mode === "session" ? (sessionLive ? session!.token : "") : permanent?.token || "";
  const activeOrigin = mode === "session" ? session?.origin || "" : permanent?.origin || "";

  const prompt = useMemo(
    () => (activeToken && activeOrigin ? buildChatGptPrompt({ mode, kind, token: activeToken, origin: activeOrigin }) : ""),
    [mode, kind, activeToken, activeOrigin]
  );

  async function createSession() {
    setBusy("session"); setMessage(""); setMode("session");
    try {
      const r = await fetch("/api/assistant-access", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not create the prompt.");
      setSession({ token: d.accessToken, expiresAt: d.expiresAt, origin: d.origin });
      setNow(Date.now());
      setMessage("Prompt ready. Copy it and paste it into ChatGPT within 10 minutes.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the prompt."); }
    finally { setBusy(""); }
  }

  async function createPermanent() {
    if (status.enabled && !window.confirm("Generate a new token? The old one stops working immediately.")) return;
    setBusy("permanent"); setMessage(""); setMode("permanent");
    try {
      const r = await fetch("/api/assistant-ai-token", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not generate the token.");
      setPermanent({ token: d.aiAuthToken, origin: new URL(d.credentialsEndpoint).origin });
      setStatus({ enabled: true, createdAt: d.createdAt || new Date().toISOString() });
      setMessage("Token created. It is shown only once, so copy the prompt now.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not generate the token."); }
    finally { setBusy(""); }
  }

  async function revoke() {
    if (!window.confirm("Revoke the permanent token? ChatGPT will stop working until you create a new one.")) return;
    setBusy("revoke"); setMessage("");
    try {
      const r = await fetch("/api/assistant-ai-token", { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not revoke the token.");
      setStatus({ enabled: false, createdAt: "" }); setPermanent(null); setSession(null);
      setMessage("Token revoked. Any active 10-minute tokens were revoked too.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not revoke the token."); }
    finally { setBusy(""); }
  }

  async function copyPrompt() {
    if (!prompt) return;
    try { await navigator.clipboard.writeText(prompt); setMessage("Copied. Paste it into a new ChatGPT chat. Treat it like a password."); }
    catch { setMessage("Your browser blocked copying. Select the prompt text below and copy it manually."); }
  }

  if (!signedIn) {
    return <main className="workspace"><section className="panel"><h1>Connect ChatGPT</h1><p className="muted">Sign in to connect ChatGPT to your account.</p><a className="button" href="/login">Sign in</a></section></main>;
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return <main className="workspace">
    <header className="topbar"><div><div className="eyebrow">CHATGPT</div><h1>Connect ChatGPT</h1><p className="muted">Give ChatGPT a ready-made prompt. It researches prospects for you and saves them straight to your Prospects list.</p></div><div className="row"><a className="button secondary" href="/prospects">View prospects</a></div></header>

    <section className="panel">
      <h2>1. What should ChatGPT do?</h2>
      <div className="method-grid">
        {KINDS.map(k => <button key={k.id} type="button" className={"method-card" + (kind === k.id ? " active" : "")} onClick={() => setKind(k.id)} aria-pressed={kind === k.id}><strong>{k.title}</strong><span className="muted">{k.hint}</span></button>)}
      </div>
    </section>

    <section className="panel">
      <h2>2. Choose how to connect</h2>
      <div className="method-grid">
        <div className={"method-card" + (mode === "session" ? " active" : "")}>
          <strong>Quick session <span className="pill">Recommended</span></strong>
          <span className="muted">One prompt that works for 10 minutes. Nothing permanent is stored in ChatGPT.</span>
          <button type="button" onClick={() => void createSession()} disabled={Boolean(busy)}>{busy === "session" ? "Creating..." : sessionLive ? "Create a new prompt" : "Create 10-minute prompt"}</button>
          {session && <small className={sessionLive ? "muted" : "expired"}>{sessionLive ? `Expires in ${mm}:${ss}` : "Expired. Create a new prompt."}</small>}
        </div>
        <div className={"method-card" + (mode === "permanent" ? " active" : "")}>
          <strong>Permanent token</strong>
          <span className="muted">Save once in ChatGPT. It requests its own 10-minute access each run, which suits recurring tasks.</span>
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <button type="button" className={status.enabled ? "secondary" : ""} onClick={() => void createPermanent()} disabled={Boolean(busy)}>{busy === "permanent" ? "Creating..." : status.enabled ? "Generate a new token" : "Generate token"}</button>
            {status.enabled && <button type="button" className="secondary" onClick={() => void revoke()} disabled={Boolean(busy)}>Revoke</button>}
          </div>
          <small className="muted">{status.enabled ? `Active since ${new Date(status.createdAt).toLocaleString()}${permanent ? "" : ". The token is hidden; generate a new one to get a prompt."}` : "No active token."}</small>
        </div>
      </div>
    </section>

    <section className="panel">
      <div className="section-heading"><div><h2>3. Copy the prompt into ChatGPT</h2><p className="muted">ChatGPT must use Firecrawl's browser interaction capability to send the requests.</p></div><button type="button" onClick={() => void copyPrompt()} disabled={!prompt}>Copy prompt</button></div>
      {prompt
        ? <pre className="prompt-box" aria-label="Prompt preview">{mask(prompt, activeToken)}</pre>
        : <div className="empty"><strong>No prompt yet</strong><p>{mode === "session" ? "Create a 10-minute prompt above." : "Generate a token above to build the prompt."}</p></div>}
      <p className="muted" role="status">{message}</p>
      <p className="footnote">The preview hides your token; the copied prompt contains it. Anyone with the prompt can read your search context and save prospects to your account until it expires or you revoke it. Never paste it anywhere public.</p>
    </section>
  </main>;
}
