"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Account = { connected: boolean; profile?: { name?: string; email?: string } };
const items = [
  { label: "Dashboard", href: "/", icon: "⌂" },
  { label: "Prospects", href: "/#prospects", icon: "◎" },
  { label: "Find Leads", href: "/search", icon: "⌕" },
  { label: "Outreach", href: "/outreach", icon: "✉" },
  { label: "Analytics", href: "/analytics", icon: "▥" },
  { label: "AI Intelligence", href: "/intelligence", icon: "✦" },
  { label: "Connections", href: "/connections", icon: "↗" },
  { label: "Settings", href: "/settings", icon: "⚙" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [account, setAccount] = useState<Account>({ connected: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [hash, setHash] = useState("");

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setAccount(data);
      })
      .catch(() => {
        if (!cancelled) setAccount({ connected: false });
      });
    return () => { cancelled = true; };
  }, []);

  if (pathname === "/login") return <>{children}</>;

  const displayName = account.profile?.name || account.profile?.email || "Workspace account";

  return (
    <div className="app-shell">
      <button
        className={menuOpen ? "sidebar-backdrop visible" : "sidebar-backdrop"}
        aria-label="Close navigation"
        onClick={() => setMenuOpen(false)}
        tabIndex={menuOpen ? 0 : -1}
      />
      <aside className={menuOpen ? "app-sidebar open" : "app-sidebar"}>
        <Link className="brand" href="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">in</span>
          <span><strong>LinkedIn Assistant</strong><small>Prospecting workspace</small></span>
        </Link>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {items.map((item) => {
            const active = item.href === "/#prospects"
              ? pathname === "/" && hash === "#prospects"
              : pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={active ? "nav-link active" : "nav-link"}
                aria-current={active ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
                {active && <span className="nav-indicator" />}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-account">
            <span className="account-avatar">{account.connected ? displayName.charAt(0).toUpperCase() : "?"}</span>
            <span className="account-copy">
              <strong>{account.connected ? displayName : "Not signed in"}</strong>
              <small>{account.connected ? "Google account connected" : "Sign in to sync your data"}</small>
            </span>
          </div>
          {account.connected ? (
            <button className="sidebar-signout" onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}>Sign out</button>
          ) : (
            <a className="sidebar-signin" href="/api/auth/google">Sign in with Google</a>
          )}
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-header">
          <button className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open navigation">☰</button>
          <span className="mobile-brand">LinkedIn Assistant</span>
          <span className={account.connected ? "mobile-account connected" : "mobile-account"} aria-label={account.connected ? "Account connected" : "Not signed in"} />
        </header>
        <div className="app-page">{children}</div>
      </div>
    </div>
  );
}
