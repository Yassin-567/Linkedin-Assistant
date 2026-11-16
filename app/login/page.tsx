"use client";
import { useSearchParams } from "next/navigation";
export default function LoginPage() {
  const params=useSearchParams();
  return <main className="workspace"><section className="panel" style={{maxWidth:520,margin:"10vh auto",textAlign:"center"}}><div className="eyebrow">GLOBAL PROSPECTING WORKSPACE</div><h1>LinkedIn Assistant</h1><p className="muted">Sign in to manage your private prospects, search preferences and ChatGPT bulk-save connection.</p>{params.get("error")&&<p className="status">{params.get("error")}</p>}<a className="button" href="/api/auth/google">Continue with Google</a><p className="footnote">Each account has its own private prospect list. No team sharing and no LinkedIn account connection required.</p></section></main>;
}
