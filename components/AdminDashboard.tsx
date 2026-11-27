"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
const ADMIN_EMAIL = "yassinalaa3310@gmail.com";

type AccountStatus = "active" | "frozen" | "banned";
type PlanSource = "none" | "paddle_subscription" | "manual_grant";
type Grant = { id: string; startsAt: string; endsAt: string; active: boolean } | null;
type LatestJob = { title?: string; company?: string; status?: string; updatedAt?: string } | null;
type UserRow = {
  id: string; email: string; name: string; picture?: string | null; createdAt: string;
  accountStatus: AccountStatus; statusChangedAt?: string | null;
  jobsCount: number; latestJob: LatestJob; leadsCount: number;
  linkedinProspectsCount: number; importedConnectionsCount: number;
  plan: "free" | "pro"; planSource: PlanSource; grant: Grant;
};
type AuditRow = { id: string; action: string; adminEmail: string; targetEmail?: string | null; targetName?: string | null; createdAt: string };
type Subscriber = {
  subscriptionId: string; userId: string; userEmail: string; userName: string;
  status: string; priceId: string; currentPeriodStartsAt?: string | null;
  currentPeriodEndsAt?: string | null; scheduledChange?: unknown;
};
type Price = { interval: string; priceId: string; name: string; amount: string | null; currency: string; billingInterval?: { interval: string | null; frequency: number | null } | null };
type BillingData = { grants: any[]; subscribers: Subscriber[]; summary: { total: number; free: number; paid: number; manualGrant: number } };

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function planLabel(user: UserRow) {
  if (user.planSource === "manual_grant" && user.grant?.endsAt) return "Free until " + new Date(user.grant.endsAt).toLocaleDateString();
  return user.planSource === "paddle_subscription" ? "Paid" : "Free";
}
function localEndOfDayIso(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

export default function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [auditLog, setAuditLog] = useState<AuditRow[]>([]);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [pricesMessage, setPricesMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});
  const [grantNotes, setGrantNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [usersResponse, billingResponse, pricesResponse] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/billing", { cache: "no-store" }),
        fetch("/api/admin/prices", { cache: "no-store" }),
      ]);
      const [usersData, billingData, pricesData] = await Promise.all([
        usersResponse.json(), billingResponse.json(), pricesResponse.json(),
      ]);
      if (!usersResponse.ok) throw new Error(usersData.error || "Could not load users.");
      setUsers(Array.isArray(usersData.users) ? usersData.users : []);
      setAuditLog(Array.isArray(usersData.auditLog) ? usersData.auditLog : []);
      if (!billingResponse.ok) throw new Error(billingData.error || "Could not load billing administration.");
      setBilling(billingData);
      setPrices(Array.isArray(pricesData.prices) ? pricesData.prices : []);
      setPricesMessage(pricesData.ok ? "" : (pricesData.message || "Paddle prices are currently unavailable."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the admin dashboard.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesTerm = !term || [user.name, user.email, user.latestJob?.title, user.latestJob?.company]
        .some((value) => String(value || "").toLowerCase().includes(term));
      const matchesStatus = statusFilter === "all" || user.accountStatus === statusFilter;
      const matchesPlan = planFilter === "all" ||
        (planFilter === "free" && user.plan === "free") ||
        (planFilter === "paid" && user.planSource === "paddle_subscription") ||
        (planFilter === "grant" && user.planSource === "manual_grant");
      return matchesTerm && matchesStatus && matchesPlan;
    });
  }, [users, search, statusFilter, planFilter]);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.accountStatus === "active").length,
    frozen: users.filter((user) => user.accountStatus === "frozen").length,
    banned: users.filter((user) => user.accountStatus === "banned").length,
  }), [users]);

  async function runAction(user: UserRow, action: "freeze" | "unfreeze" | "ban" | "unban" | "logout") {
    const actionText: Record<string, string> = {
      freeze: "Freeze this account? The user can still sign in, but all InLinked features and AI access will be blocked.",
      unfreeze: "Unfreeze this account and restore its saved workspace and AI integration?",
      ban: "Ban this account? The user will be blocked from signing in, all sessions and AI credentials will be revoked. A new AI Access Token will be needed if the account is later unbanned.",
      unban: "Unban this account? The user will be able to sign in again. They can generate a new AI Access Token in Settings.",
      logout: "Log this user out of all InLinked sessions and revoke their permanent AI Access Token? They will need to generate a new AI connection after signing in again.",
    };
    if (!window.confirm(actionText[action] + "\n\n" + user.email)) return;
    setBusyUserId(user.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The account action failed.");
      setNotice(titleCase(action) + " completed for " + user.email + ".");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "The account action failed."); }
    finally { setBusyUserId(""); }
  }

  async function grantPro(user: UserRow) {
    const expiry = expiryDates[user.id] || "";
    if (!expiry) { setError("Choose an expiry date first."); return; }
    const expiresAt = localEndOfDayIso(expiry);
    if (new Date(expiresAt).getTime() <= Date.now()) { setError("Choose a future expiry date."); return; }
    setBusyUserId(user.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/billing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, expiresAt, note: grantNotes[user.id] || "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not grant Pro.");
      setNotice("Manual Pro access granted to " + user.email + " until " + formatDate(data.grant.endsAt) + ".");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not grant Pro."); }
    finally { setBusyUserId(""); }
  }

  async function revokeGrant(user: UserRow) {
    if (!user.grant?.id || !window.confirm("Revoke this active manual Pro grant for " + user.email + "?")) return;
    setBusyUserId(user.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/billing?grantId=" + encodeURIComponent(user.grant.id), { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not revoke grant.");
      setNotice("Manual Pro grant revoked for " + user.email + ".");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not revoke grant."); }
    finally { setBusyUserId(""); }
  }

  return (
    <main className="workspace admin-workspace">
      <header className="admin-header">
        <div><div className="eyebrow">OWNER CONTROL CENTER</div><h1>InLinked Admin</h1>
          <p className="muted">Manage registered accounts, plans, grants, subscribers and workspace activity.</p></div>
        <div className="admin-owner"><span className="admin-owner-label">Signed in as owner</span>
          <strong>{adminEmail}</strong><button className="button secondary" onClick={() => void load()} disabled={loading}>Refresh data</button></div>
      </header>

      <section className="admin-stats-grid" aria-label="Account summary">
        <div className="admin-stat"><span>Total users</span><strong>{counts.total}</strong></div>
        <div className="admin-stat"><span>Active</span><strong>{counts.active}</strong></div>
        <div className="admin-stat"><span>Frozen</span><strong>{counts.frozen}</strong></div>
        <div className="admin-stat"><span>Banned</span><strong>{counts.banned}</strong></div>
      </section>
      {billing?.summary && <section className="admin-stats-grid" aria-label="Plan summary">
        <div className="admin-stat"><span>Free</span><strong>{billing.summary.free}</strong></div>
        <div className="admin-stat"><span>Paid subscribers</span><strong>{billing.summary.paid}</strong></div>
        <div className="admin-stat"><span>Manual grants</span><strong>{billing.summary.manualGrant}</strong></div>
        <div className="admin-stat"><span>Total accounts</span><strong>{billing.summary.total}</strong></div>
      </section>}
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {notice && <div className="admin-alert success" role="status">{notice}</div>}

      <section className="panel admin-users-panel">
        <div className="admin-section-heading"><div><h2>Users and plans</h2>
          <p className="muted">Latest saved job is shown because InLinked does not store a separate current-employer field. Grant expiry is the administrator's local end of day.</p></div>
          <span className="admin-result-count">{filteredUsers.length} of {users.length}</span></div>
        <div className="admin-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or latest job…" aria-label="Search users" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by account status">
            <option value="all">All account statuses</option><option value="active">Active</option><option value="frozen">Frozen</option><option value="banned">Banned</option>
          </select>
          <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} aria-label="Filter by plan">
            <option value="all">All plans</option><option value="free">Free</option><option value="paid">Paid subscribers</option><option value="grant">Manual Pro grants</option>
          </select>
        </div>
        {loading ? <div className="admin-empty">Loading user accounts…</div> :
          filteredUsers.length === 0 ? <div className="admin-empty">No users match this search.</div> :
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr>
            <th>User</th><th>Plan</th><th>Latest saved job</th><th>Jobs</th><th>Leads</th><th>LinkedIn prospects</th><th>Imported connections</th><th>Status</th><th>Plan controls</th><th>Account controls</th>
          </tr></thead><tbody>
            {filteredUsers.map((user) => {
              const isOwner = user.email.toLowerCase() === ADMIN_EMAIL;
              const busy = busyUserId === user.id;
              return <tr key={user.id}>
                <td><div className="admin-user-cell">{user.picture ? <img src={user.picture} alt="" /> : <span className="admin-avatar">{(user.name || user.email).charAt(0).toUpperCase()}</span>}
                  <div><strong>{user.name || "Unnamed user"}</strong><small>{user.email}</small><small>Joined {formatDate(user.createdAt)}</small></div></div></td>
                <td><strong>{planLabel(user)}</strong><small>{user.planSource === "paddle_subscription" ? "Paddle subscription" : user.planSource === "manual_grant" ? "Manual grant" : "No active Pro access"}</small></td>
                <td>{user.latestJob?.title ? <div className="admin-job-cell"><strong>{user.latestJob.title}</strong><small>{user.latestJob.company || "Company not provided"}</small><small>{user.latestJob.status || "Saved"}</small></div> : <span className="admin-muted-cell">No saved jobs</span>}</td>
                <td className="admin-number">{user.jobsCount}</td><td className="admin-number">{user.leadsCount}</td><td className="admin-number">{user.linkedinProspectsCount}</td><td className="admin-number">{user.importedConnectionsCount}</td>
                <td><span className={"admin-status " + user.accountStatus}>{titleCase(user.accountStatus)}</span></td>
                <td><div className="admin-actions" style={{ minWidth: 220, flexDirection: "column", alignItems: "stretch" }}>
                  {user.grant?.active ? <><small>Expires {formatDate(user.grant.endsAt)}</small>
                    <button className="admin-action ban" disabled={busy} onClick={() => void revokeGrant(user)}>Revoke grant</button></> : null}
                  <input type="date" aria-label={"Pro expiry date for " + user.email} min={new Date().toISOString().slice(0,10)} value={expiryDates[user.id] || ""} onChange={(event) => setExpiryDates((old) => ({ ...old, [user.id]: event.target.value }))} />
                  <input type="text" aria-label={"Grant note for " + user.email} placeholder="Optional note" maxLength={500} value={grantNotes[user.id] || ""} onChange={(event) => setGrantNotes((old) => ({ ...old, [user.id]: event.target.value }))} />
                  <button className="admin-action unfreeze" disabled={busy || !expiryDates[user.id]} onClick={() => void grantPro(user)}>Give free Pro until {expiryDates[user.id] || "date"}</button>
                </div></td>
                <td>{isOwner ? <span className="admin-muted-cell">Protected owner</span> : <div className="admin-actions">
                  {user.accountStatus === "active" && <button className="admin-action freeze" disabled={busy} onClick={() => void runAction(user, "freeze")}>Freeze</button>}
                  {user.accountStatus === "frozen" && <button className="admin-action unfreeze" disabled={busy} onClick={() => void runAction(user, "unfreeze")}>Unfreeze</button>}
                  {user.accountStatus === "banned" ? <button className="admin-action unfreeze" disabled={busy} onClick={() => void runAction(user, "unban")}>Unban</button> : <button className="admin-action ban" disabled={busy} onClick={() => void runAction(user, "ban")}>Ban</button>}
                  <button className="admin-action logout" disabled={busy} onClick={() => void runAction(user, "logout")}>Logout all</button>
                </div>}</td>
              </tr>;
            })}
          </tbody></table></div>}
      </section>

      <section className="panel admin-users-panel">
        <div className="admin-section-heading"><div><h2>Subscribers</h2><p className="muted">Paddle subscription records, including their latest status and billing period.</p></div>
          <span className="admin-result-count">{billing?.subscribers.length || 0}</span></div>
        {!billing?.subscribers.length ? <div className="admin-empty">No Paddle subscription records.</div> :
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Status</th><th>Price ID</th><th>Period starts</th><th>Period ends</th><th>Subscription ID</th></tr></thead><tbody>
            {billing.subscribers.map((sub) => <tr key={sub.subscriptionId}><td><strong>{sub.userName || sub.userEmail}</strong><small>{sub.userEmail}</small></td><td>{titleCase(sub.status)}</td><td>{sub.priceId}</td><td>{formatDate(sub.currentPeriodStartsAt)}</td><td>{formatDate(sub.currentPeriodEndsAt)}</td><td><small>{sub.subscriptionId}</small></td></tr>)}
          </tbody></table></div>}
      </section>

      <section className="panel admin-users-panel">
        <div className="admin-section-heading"><div><h2>Paddle prices</h2><p className="muted">Read-only values fetched server-side from the configured Paddle environment. No price editing is available.</p></div></div>
        {pricesMessage ? <div className="admin-empty">{pricesMessage}</div> :
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Interval</th><th>Name</th><th>Amount</th><th>Currency</th><th>Price ID</th></tr></thead><tbody>
            {prices.map((price) => <tr key={price.priceId}><td>{titleCase(price.interval)}</td><td>{price.name}</td><td>{price.amount || "—"}</td><td>{price.currency}</td><td><small>{price.priceId}</small></td></tr>)}
          </tbody></table></div>}
      </section>

      <section className="panel admin-audit-panel"><div className="admin-section-heading"><div><h2>Recent admin actions</h2><p className="muted">The latest 30 account-control and Pro-grant actions are recorded here.</p></div></div>
        {auditLog.length === 0 ? <div className="admin-empty">No administrative actions yet.</div> :
          <div className="admin-audit-list">{auditLog.map((entry) => <div className="admin-audit-row" key={entry.id}>
            <div><strong>{titleCase(entry.action)}</strong><span>{entry.targetName || entry.targetEmail || "Account"}</span><small>{entry.targetEmail || "User record unavailable"}</small></div>
            <div><small>By {entry.adminEmail}</small><small>{formatDate(entry.createdAt)}</small></div>
          </div>)}</div>}
      </section>
    </main>
  );
}
