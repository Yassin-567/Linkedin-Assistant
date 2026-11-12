"use client";

import { useEffect, useState } from "react";

type Account = {
  connected: boolean;
  profile?: { name?: string; email?: string; picture?: string };
};

export default function Home() {
  const [account, setAccount] = useState<Account>({ connected: false });
  const [post, setPost] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshAccount() {
    const response = await fetch("/api/linkedin/me", { cache: "no-store" });
    setAccount(await response.json());
  }

  useEffect(() => { void refreshAccount(); }, []);

  async function publish() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: post })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Post failed.");
      setMessage("Post published successfully.");
      setPost("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await fetch("/api/linkedin/logout", { method: "POST" });
    setAccount({ connected: false });
    setMessage("LinkedIn disconnected from this app.");
  }

  return (
    <main>
      <section className="panel">
        <div className="row">
          <div>
            <h1>LinkedIn Assistant</h1>
            <p className="muted">A private workspace for your LinkedIn account.</p>
          </div>
          <span className="muted">Early build</span>
        </div>

        {!account.connected ? (
          <>
            <p>Connect your LinkedIn account to enable the features currently approved for your developer app.</p>
            <a className="button" href="/api/linkedin/login">Connect LinkedIn</a>
          </>
        ) : (
          <>
            <div className="status">
              Connected as <strong>{account.profile?.name || "LinkedIn member"}</strong>
              {account.profile?.email ? <span> · {account.profile.email}</span> : null}
            </div>
            <h2>Publish a text post</h2>
            <p className="muted">This publishes publicly to your personal LinkedIn profile. Review the text before publishing.</p>
            <textarea value={post} onChange={(event) => setPost(event.target.value)} maxLength={3000} placeholder="Write your LinkedIn post..." />
            <div className="row" style={{ marginTop: 12 }}>
              <span className="muted">{post.length}/3000 characters</span>
              <button onClick={publish} disabled={busy || !post.trim()}>{busy ? "Publishing..." : "Publish post"}</button>
            </div>
            <hr />
            <button onClick={disconnect}>Disconnect LinkedIn</button>
          </>
        )}

        {message ? <div className="status" role="status">{message}</div> : null}
        <p className="muted" style={{ marginTop: 24 }}>This first version does not read private messages, automate connection requests, or scrape LinkedIn. Those capabilities are not included in the permissions currently enabled for this app.</p>
      </section>
    </main>
  );
}
