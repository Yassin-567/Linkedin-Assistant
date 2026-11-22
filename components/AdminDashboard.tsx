"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
const ADMIN_EMAIL = "yassinalaa3310@gmail.com";

type AccountStatus = "active" | "frozen" | "banned";
type LatestJob = { title?: string; company?: string; status?: string; updatedAt?: string } | null;
type UserRow = {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
  createdAt: string;
  accountStatus: AccountStatus;
  statusChangedAt?: string | null;
  jobsCount: number;
  latestJob: LatestJob;
  leadsCount: number;
  linkedinProspectsCount: number;
  importedConnectionsCount: number;
};
type AuditRow = {
  id: string;
  action: string;
  adminEmail: string;
  targetEmail?: string | null;
  targetName?: string | null;
  createdAt: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [auditLog, setAuditLog] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load users.");
      setUsers(Array.isArray(data.users) ? data.users : []);
      setAuditLog(Array.isArray(data.auditLog) ? data.auditLog : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesTerm = !term || [user.name, user.email, user.latestJob?.title, user.latestJob?.company]
        .some((value) => String(value || "").toLowerCase().includes(term));
      return matchesTerm && (statusFilter === "all" || user.accountStatus === statusFilter);
    });
  }, [users, search, statusFilter]);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.accountStatus === "active").length,
    frozen: users.filter((user) => user.accountStatus === "frozen").length,
    banned: users.filter((user) => user.accountStatus === "banned").length
  }), [users]);

  async function runAction(user: UserRow, action: "freeze" | "unfreeze" | "ban" | "unban" | "logout") {
    const actionText: Record<string, string> = {
      freeze: "Freeze this account? The user can still sign in, but all InLinked features and AI access will be blocked.",
      unfreeze: "Unfreeze this account and restore its saved workspace and AI integration?",
      ban: "Ban this account? The user will be blocked from signing in and all current sessions will be invalidated.",
      unban: "Unban this account? The user will be able to sign in again.",
      logout: "Log this user out of every active InLinked session?"
    };
    if (!window.confirm(actionText[action] + "\n\n" + user.email)) return;

    setBusyUserId(user.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The account action failed.");
      setNotice(titleCase(action) + " completed for " + user.email + ".");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The account action failed.");
    } finally {
      setBusyUserId("");
    }
  }

  return (
    <main className="workspace admin-workspace">
      <header className="admin-header">
        <div>
          <div className="eyebrow">OWNER CONTROL CENTER</div>
          <h1>InLinked Admin</h1>
          <p className="muted">Manage registered accounts, access restrictions and workspace activity.</p>
        </div>
        <div className="admin-owner">
          <span className="admin-owner-label">Signed in as owner</span>
          <strong>{adminEmail}</strong>
          <button className="button secondary" onClick={() => void load()} disabled={loading}>Refresh data</button>
        </div>
      </header>

      <section className="admin-stats-grid" aria-label="Account summary">
        <div className="admin-stat"><span>Total users</span><strong>{counts.total}</strong></div>
        <div className="admin-stat"><span>Active</span><strong>{counts.active}</strong></div>
        <div className="admin-stat"><span>Frozen</span><strong>{counts.frozen}</strong></div>
        <div className="admin-stat"><span>Banned</span><strong>{counts.banned}</strong></div>
      </section>

      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {notice && <div className="admin-alert success" role="status">{notice}</div>}

      <section className="panel admin-users-panel">
        <div className="admin-section-heading">
          <div>
            <h2>Users</h2>
            <p className="muted">Latest saved job is shown because InLinked does not store a separate current-employer field.</p>
          </div>
          <span className="admin-result-count">{filteredUsers.length} of {users.length}</span>
        </div>

        <div className="admin-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or latest job…" aria-label="Search users" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by account status">
            <option value="all">All account statuses</option>
            <option value="active">Active</option>
            <option value="frozen">Frozen</option>
            <option value="banned">Banned</option>
          </select>
        </div>

        {loading ? <div className="admin-empty">Loading user accounts…</div> :
          filteredUsers.length === 0 ? <div className="admin-empty">No users match this search.</div> :
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Latest saved job</th>
                  <th>Jobs</th>
                  <th>Leads</th>
                  <th>LinkedIn prospects</th>
                  <th>Imported connections</th>
                  <th>Status</th>
                  <th>Account controls</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const isOwner = user.email.toLowerCase() === ADMIN_EMAIL;
                  const busy = busyUserId === user.id;
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="admin-user-cell">
                          {user.picture ? <img src={user.picture} alt="" /> : <span className="admin-avatar">{(user.name || user.email).charAt(0).toUpperCase()}</span>}
                          <div><strong>{user.name || "Unnamed user"}</strong><small>{user.email}</small><small>Joined {formatDate(user.createdAt)}</small></div>
                        </div>
                      </td>
                      <td>
                        {user.latestJob?.title ?
                          <div className="admin-job-cell"><strong>{user.latestJob.title}</strong><small>{user.latestJob.company || "Company not provided"}</small><small>{user.latestJob.status || "Saved"}</small></div>
                          : <span className="admin-muted-cell">No saved jobs</span>}
                      </td>
                      <td className="admin-number">{user.jobsCount}</td>
                      <td className="admin-number">{user.leadsCount}</td>
                      <td className="admin-number">{user.linkedinProspectsCount}</td>
                      <td className="admin-number">{user.importedConnectionsCount}</td>
                      <td><span className={"admin-status " + user.accountStatus}>{titleCase(user.accountStatus)}</span></td>
                      <td>
                        {isOwner ? <span className="admin-muted-cell">Protected owner</span> :
                          <div className="admin-actions">
                            {user.accountStatus === "active" && <button className="admin-action freeze" disabled={busy} onClick={() => void runAction(user, "freeze")}>Freeze</button>}
                            {user.accountStatus === "frozen" && <button className="admin-action unfreeze" disabled={busy} onClick={() => void runAction(user, "unfreeze")}>Unfreeze</button>}
                            {user.accountStatus === "banned" ?
                              <button className="admin-action unfreeze" disabled={busy} onClick={() => void runAction(user, "unban")}>Unban</button> :
                              <button className="admin-action ban" disabled={busy} onClick={() => void runAction(user, "ban")}>Ban</button>}
                            <button className="admin-action logout" disabled={busy} onClick={() => void runAction(user, "logout")}>Logout all</button>
                          </div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
      </section>

      <section className="panel admin-audit-panel">
        <div className="admin-section-heading">
          <div><h2>Recent admin actions</h2><p className="muted">The latest 30 account-control actions are recorded here.</p></div>
        </div>
        {auditLog.length === 0 ? <div className="admin-empty">No administrative actions yet.</div> :
          <div className="admin-audit-list">
            {auditLog.map((entry) => (
              <div className="admin-audit-row" key={entry.id}>
                <div><strong>{titleCase(entry.action)}</strong><span>{entry.targetName || entry.targetEmail || "Account"}</span><small>{entry.targetEmail || "User record unavailable"}</small></div>
                <div><small>By {entry.adminEmail}</small><small>{formatDate(entry.createdAt)}</small></div>
              </div>
            ))}
          </div>}
      </section>
    </main>
  );
}
