"use client";

const BASE = "https://inlinked.vercel.app";
const endpoints = [
  { name: "Quick Session token", method: "POST", path: "/api/assistant-access", auth: "Signed-in Inlinked session", purpose: "Issues a temporary access token valid for 10 minutes." },
  { name: "Permanent-token exchange", method: "POST", path: "/api/assistant-credentials", auth: "Authorization: Bearer <permanent token>", purpose: "Issues fresh temporary access and returns the Context and Save endpoint URLs." },
  { name: "Search context", method: "GET", path: "/api/assistant-context", auth: "Temporary or permanent AI token", purpose: "Reads your profile, search preferences, uploaded connections and saved-prospect exclusions." },
  { name: "Save prospects", method: "POST", path: "/api/assistant-save", auth: "Temporary or permanent AI token", purpose: "Saves up to 50 qualified personal LinkedIn profiles per request." },
];

export default function ApiEndpoints() {
  return <section className="panel">
    <div className="section-heading">
      <div><div className="eyebrow">API CONNECTION</div><h2>Inlinked assistant endpoints</h2>
      <p className="muted">These are the endpoints used by the two ChatGPT connection methods. The generated prompts contain the correct authentication instructions.</p></div>
    </div>
    <div style={{ display: "grid", gap: 14 }}>
      {endpoints.map((item) => <div key={item.path} style={{ border: "1px solid var(--border, #ddd)", borderRadius: 12, padding: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>{item.name}</strong><span className="pill">{item.method}</span>
        </div>
        <label className="wide" style={{ display: "block", marginTop: 8 }}>Endpoint URL
          <input readOnly value={BASE + item.path} onFocus={e => e.currentTarget.select()} />
        </label>
        <p className="muted" style={{ marginBottom: 4 }}>{item.purpose}</p>
        <small className="muted">Authentication: {item.auth}</small>
      </div>)}
    </div>
    <p className="footnote">The permanent token is only revealed when generated. It is stored as a one-way hash, so an existing token cannot be recovered or displayed after leaving the generation screen. Generate a replacement to reveal a new token; this revokes the previous token and existing temporary grants.</p>
    <a className="button secondary" href="/chatgpt">Open ChatGPT prompts and edit prospect count</a>
  </section>;
}
