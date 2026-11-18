"use client";

import ApiEndpoints from "@/components/ApiEndpoints";

export default function ApiSettingsPage() {
  return <main className="workspace">
    <header className="topbar">
      <div><div className="eyebrow">SETTINGS / API</div><h1>ChatGPT API connection</h1>
        <p className="muted">Endpoint reference for Quick Session and Permanent Token prompts.</p></div>
      <div className="row"><a className="button secondary" href="/settings">Back to settings</a><a className="button" href="/chatgpt">Generate ChatGPT prompt</a></div>
    </header>
    <ApiEndpoints />
  </main>;
}
