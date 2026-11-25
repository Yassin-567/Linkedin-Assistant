"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Account = {
  connected: boolean;
  accountStatus?: "active" | "frozen" | "banned";
  isAdmin?: boolean;
  profile?: { name?: string; email?: string };
};

const groups = [
  {
    label: "OVERVIEW",
    items: [{ label: "Dashboard", href: "/", icon: "dashboard" }]
  },
  {
    label: "PIPELINE",
    items: [
      { label: "LinkedIn prospects", href: "/prospects", icon: "people" },
      { label: "Commercial leads", href: "/leads", icon: "briefcase" },
      { label: "Jobs", href: "/jobs", icon: "jobs" },
      { label: "Outreach", href: "/outreach", icon: "mail" }
    ]
  },
  {
    label: "INSIGHTS & TOOLS",
    items: [
      { label: "Analytics", href: "/analytics", icon: "chart" },
      { label: "Imported connections", href: "/connections", icon: "import" }
    ]
  },
  {
    label: "PREFERENCES",
    items: [
      { label: "Settings", href: "/settings", icon: "settings" },
      { label: "Plans & billing", href: "/billing", icon: "billing" }
    ]
  }
];

function NavIcon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (name) {
    case "dashboard": return <svg {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="4" rx="1.2"/><rect x="13.5" y="10.5" width="7" height="10" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/></svg>;
    case "people": return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3 2.3-4.5 5.5-4.5s5 1.5 5.5 4.5"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17 14.5c2.1.5 3.3 2 3.6 4.5"/></svg>;
    case "briefcase": return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>;
    case "jobs": return <svg {...common}><path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4M9 12h6M9 16h6"/></svg>;
    case "mail": return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>;
    case "chart": return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
    case "import": return <svg {...common}><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z"/></svg>;
  }
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [account, setAccount] = useState<Account>({ connected: false });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.accountStatus === "frozen") {
          try {
            localStorage.removeItem("inlinked_access_token");
            localStorage.removeItem("inlinked_permanent_token");
            localStorage.removeItem("inlinked_quick_session");
          } catch {}
        }
        if (!cancelled) setAccount(data);
      })
      .catch(() => { if (!cancelled) setAccount({ connected: false }); });
    return () => { cancelled = true; };
  }, []);

  if (pathname === "/login") return <>{children}</>;

  const displayName = account.profile?.name || account.profile?.email || "Workspace account";
  const navigationGroups = account.isAdmin
    ? [...groups, { label: "ADMINISTRATION", items: [{ label: "Admin panel", href: "/admin", icon: "settings" }] }]
    : groups;
  const pageLabel = navigationGroups.flatMap(group => group.items).find(item =>
    item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")
  )?.label || "Workspace";

  return (
    <div className="app-shell">
      <button className={menuOpen ? "sidebar-backdrop visible" : "sidebar-backdrop"} aria-label="Close navigation" onClick={() => setMenuOpen(false)} tabIndex={menuOpen ? 0 : -1} />
      <aside className={menuOpen ? "app-sidebar open" : "app-sidebar"}>
        <Link className="brand" href="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">in</span>
          <span><strong>Inlinked</strong><small>Business development</small></span>
        </Link>
        <nav className="sidebar-nav-groups" aria-label="Main navigation">
          {navigationGroups.map(group => (
            <section className="sidebar-nav-group" key={group.label}>
              <div className="sidebar-label">{group.label}</div>
              <div className="sidebar-nav">
                {group.items.map(item => {
                  const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link key={item.href} href={item.href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                      <span className="nav-icon"><NavIcon name={item.icon}/></span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-account">
            <span className="account-avatar">{account.connected ? displayName.charAt(0).toUpperCase() : "?"}</span>
            <span className="account-copy">
              <strong>{account.connected ? displayName : "Not signed in"}</strong>
              <small>{account.accountStatus === "frozen" ? "Read-only account" : account.connected ? "Workspace account" : "Sign in to sync your data"}</small>
            </span>
          </div>
          {account.connected ? <button className="sidebar-signout" onClick={signOut}>Sign out</button> : <a className="sidebar-signin" href="/api/auth/google">Sign in with Google</a>}
        </div>
      </aside>
      <div className="app-main">
        <header className="mobile-header">
          <button className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen}>☰</button>
          <span className="mobile-brand">Inlinked</span>
          <span className={account.connected ? "mobile-account connected" : "mobile-account"} aria-label={account.connected ? "Account connected" : "Not signed in"} />
        </header>
        <div className="workspace-topbar">
          <span className="workspace-topbar-label">{pageLabel}</span>
          <div className="workspace-topbar-right">
            <span className={account.connected ? "workspace-topbar-status connected" : "workspace-topbar-status"}>
              {account.accountStatus === "frozen" ? "Read-only access" : account.connected ? "Account connected" : "Not signed in"}
            </span>
            <span className="workspace-topbar-account">{displayName}</span>
          </div>
        </div>
        <div className={account.accountStatus === "frozen" ? "app-page frozen-readonly" : "app-page"}>
          {account.accountStatus === "frozen" && <section className="frozen-readonly-banner" role="status"><strong>Read-only access</strong><span>Your account is frozen. You can view and search existing records, but cannot add, edit, delete, import or run AI workflows.</span></section>}
          {children}
        </div>
      </div>
    </div>
  );
}
