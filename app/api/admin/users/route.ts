import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, ADMIN_EMAIL } from "@/lib/admin";
import { db } from "@/lib/db";
import { getBillingState } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store, no-cache, must-revalidate" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });
const actions = ["freeze", "unfreeze", "ban", "unban", "logout"] as const;
type AdminAction = typeof actions[number];

export async function GET() {
  const admin = await currentAdmin();
  if (!admin) return fail("Admin access is restricted.", 403);

  try {
    const sql = db();
    const [users, auditLog]: any = await Promise.all([
      sql`SELECT
        u.id::text AS id,
        u.email,
        u.name,
        u.picture,
        u.created_at AS "createdAt",
        u.account_status AS "accountStatus",
        u.account_status_changed_at AS "statusChangedAt",
        COALESCE(job_stats.job_count, 0)::int AS "jobsCount",
        job_stats.latest_job AS "latestJob",
        COALESCE(lead_stats.lead_count, 0)::int AS "leadsCount",
        COALESCE(prospect_stats.prospect_count, 0)::int AS "linkedinProspectsCount",
        COALESCE(connection_stats.connection_count, 0)::int AS "importedConnectionsCount"
      FROM app_users u
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS job_count,
          (SELECT jsonb_build_object(
            'title', j2.title,
            'company', j2.company,
            'status', j2.status,
            'updatedAt', j2.updated_at
          ) FROM jobs j2 WHERE j2.user_id = u.id ORDER BY j2.updated_at DESC LIMIT 1) AS latest_job
        FROM jobs j WHERE j.user_id = u.id
      ) job_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS lead_count FROM business_leads b WHERE b.user_id = u.id
      ) lead_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS prospect_count FROM prospects p WHERE p.user_id = u.id
      ) prospect_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS connection_count FROM linkedin_connections c WHERE c.user_id = u.id
      ) connection_stats ON TRUE
      ORDER BY u.created_at DESC, u.email ASC`,
      sql`SELECT
        l.id::text AS id,
        l.action,
        l.admin_email AS "adminEmail",
        l.created_at AS "createdAt",
        l.details,
        u.email AS "targetEmail",
        u.name AS "targetName"
      FROM admin_audit_log l
      LEFT JOIN app_users u ON u.id = l.target_user_id
      ORDER BY l.created_at DESC
      LIMIT 30`
    ]);

    const usersWithBilling = await Promise.all(users.map(async (user: any) => {
      try {
        const billing = await getBillingState(String(user.id));
        return { ...user, plan: billing.plan, planSource: billing.planSource, grant: billing.grant };
      } catch (billingError) {
        console.error("Admin user billing summary failed", billingError);
        return { ...user, plan: "free", planSource: "none", grant: null };
      }
    }));
    return NextResponse.json({ users: usersWithBilling, auditLog }, { headers: noStore });
  } catch (error) {
    console.error("Admin dashboard read failed", error);
    return fail("Could not load the admin dashboard. Check the Phase 13 admin migration.", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return fail("Admin access is restricted.", 403);

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const actionValue = typeof body?.action === "string" ? body.action : "";
  if (!userId || userId.length > 100 || !actions.some((allowed) => allowed === actionValue)) {
    return fail("Provide a valid user and action.", 400);
  }
  const action = actionValue as AdminAction;
  if (userId === admin.userId) {
    return fail("The owner account cannot be frozen, banned or remotely logged out.", 403);
  }

  try {
    const sql = db();
    const rows: any = await sql`
      WITH updated AS (
        UPDATE app_users
        SET
          account_status = CASE
            WHEN ${action} = 'freeze' THEN 'frozen'
            WHEN ${action} IN ('unfreeze', 'unban') THEN 'active'
            WHEN ${action} = 'ban' THEN 'banned'
            ELSE account_status
          END,
          account_status_changed_at = CASE
            WHEN ${action} IN ('freeze', 'unfreeze', 'ban', 'unban') THEN now()
            ELSE account_status_changed_at
          END,
          account_status_changed_by = CASE
            WHEN ${action} IN ('freeze', 'unfreeze', 'ban', 'unban') THEN ${admin.email}
            ELSE account_status_changed_by
          END,
          session_version = CASE
            WHEN ${action} IN ('ban', 'unban', 'logout') THEN session_version + 1
            ELSE session_version
          END,
          updated_at = now()
        WHERE id = ${userId}
          AND lower(email) <> ${ADMIN_EMAIL}
          AND (
            (${action} = 'freeze' AND account_status = 'active') OR
            (${action} = 'unfreeze' AND account_status = 'frozen') OR
            (${action} = 'ban' AND account_status IN ('active', 'frozen')) OR
            (${action} = 'unban' AND account_status = 'banned') OR
            ${action} = 'logout'
          )
        RETURNING id::text AS id, email, name, account_status AS "accountStatus"
      ),
      revoked_ai_access AS (
        UPDATE ai_access_tokens token
        SET revoked_at = now(), token_encrypted = NULL
        FROM updated
        WHERE token.user_id = updated.id
          AND ${action} IN ('ban', 'logout')
          AND token.revoked_at IS NULL
        RETURNING token.token_hash
      ),
      revoked_assistant_sessions AS (
        UPDATE assistant_session_tokens token
        SET revoked_at = now()
        FROM updated
        WHERE token.user_id = updated.id
          AND ${action} IN ('ban', 'logout')
          AND token.revoked_at IS NULL
        RETURNING token.token_hash
      ),
      revoked_scoped_tokens AS (
        UPDATE assistant_scoped_tokens token
        SET revoked_at = now()
        FROM updated
        WHERE token.user_id = updated.id
          AND ${action} IN ('ban', 'logout')
          AND token.revoked_at IS NULL
        RETURNING token.token_hash
      ),
      revoked_legacy_tokens AS (
        UPDATE assistant_tokens token
        SET expires_at = now(),
            batches_remaining = 0,
            read_used_at = COALESCE(read_used_at, now())
        FROM updated
        WHERE token.user_id = updated.id
          AND ${action} IN ('ban', 'logout')
          AND token.expires_at > now()
        RETURNING token.token_hash
      ),
      audit AS (
        INSERT INTO admin_audit_log(admin_email, target_user_id, action, details)
        SELECT
          ${admin.email},
          updated.id,
          ${action},
          jsonb_build_object(
            'targetEmail', updated.email,
            'accountStatus', updated."accountStatus",
            'aiCredentialsRevoked', ${action} IN ('ban', 'logout')
          )
        FROM updated
        RETURNING id
      )
      SELECT
        updated.*,
        (SELECT COUNT(*)::int FROM audit) AS "auditRecorded",
        (SELECT COUNT(*)::int FROM revoked_ai_access) AS "revokedAiAccessTokens",
        (SELECT COUNT(*)::int FROM revoked_assistant_sessions) AS "revokedAssistantSessions",
        (SELECT COUNT(*)::int FROM revoked_scoped_tokens) AS "revokedScopedTokens",
        (SELECT COUNT(*)::int FROM revoked_legacy_tokens) AS "revokedLegacyTokens"
      FROM updated
    `;

    if (!rows.length) {
      const existing: any = await sql`SELECT email, account_status FROM app_users WHERE id = ${userId} LIMIT 1`;
      if (!existing.length) return fail("User not found.", 404);
      if (String(existing[0].email).toLowerCase() === ADMIN_EMAIL) return fail("The owner account is protected.", 403);
      return NextResponse.json({
        error: "That action is not valid for the user's current account status.",
        currentStatus: existing[0].account_status
      }, { status: 409, headers: noStore });
    }

    return NextResponse.json({ ok: true, user: rows[0] }, { headers: noStore });
  } catch (error) {
    console.error("Admin account action failed", error);
    return fail("Could not apply this account action.", 503);
  }
}
