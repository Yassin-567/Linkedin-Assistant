import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { getBillingState } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store, no-cache, must-revalidate" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });
const missingTable = (error: unknown) => !!error && typeof error === "object" &&
  ((error as { code?: string }).code === "42P01" ||
   /manual_pro_grants.*does not exist/i.test(String((error as { message?: string }).message || "")));

export async function GET() {
  const admin = await currentAdmin();
  if (!admin) return fail("Admin access is restricted.", 403);
  try {
    const sql = db();
    const [grants, subscribers, users] = await Promise.all([
      sql`SELECT g.id::text AS id, g.user_id::text AS "userId",
        u.email AS "userEmail", u.name AS "userName",
        g.granted_by_email AS "grantedByEmail", g.revoked_by_email AS "revokedByEmail",
        g.starts_at AS "startsAt", g.ends_at AS "endsAt", g.revoked_at AS "revokedAt",
        g.note, g.created_at AS "createdAt",
        (g.starts_at <= now() AND g.ends_at > now() AND g.revoked_at IS NULL) AS active
        FROM manual_pro_grants g LEFT JOIN app_users u ON u.id = g.user_id
        ORDER BY g.created_at DESC LIMIT 250`,
      sql`SELECT s.paddle_subscription_id AS "subscriptionId",
        s.user_id::text AS "userId", u.email AS "userEmail", u.name AS "userName",
        s.status, s.price_id AS "priceId",
        s.current_period_starts_at AS "currentPeriodStartsAt",
        s.current_period_ends_at AS "currentPeriodEndsAt",
        s.scheduled_change AS "scheduledChange", s.event_occurred_at AS "eventOccurredAt"
        FROM paddle_subscriptions s LEFT JOIN app_users u ON u.id = s.user_id
        ORDER BY s.event_occurred_at DESC LIMIT 250`,
      sql`SELECT id::text AS id FROM app_users`
    ]);
    const userRows = users as unknown as { id: string }[];
    const states = await Promise.all(userRows.map(async (user) => {
      try { return await getBillingState(String(user.id)); }
      catch { return { plan: "free", planSource: "none" }; }
    }));
    const paid = states.filter((state: any) => state.planSource === "paddle_subscription").length;
    const manualGrant = states.filter((state: any) => state.planSource === "manual_grant").length;
    const total = userRows.length;
    return NextResponse.json({
      grants, subscribers,
      summary: { total, free: total - paid - manualGrant, paid, manualGrant },
    }, { headers: noStore });
  } catch (error) {
    if (missingTable(error)) return fail("Manual Pro grants are not available. Apply Phase 17 first.", 503);
    console.error("Admin billing read failed", error);
    return fail("Could not load billing administration.", 503);
  }
}

export async function POST(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return fail("Admin access is restricted.", 403);
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const expiresAtValue = typeof body?.expiresAt === "string" ? body.expiresAt.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
  const expiresAt = new Date(expiresAtValue);
  if (!userId || userId.length > 100 || !expiresAtValue ||
      Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return fail("Choose an existing user and a future expiry date.", 400);
  }
  try {
    const rows: any = await db()`
      WITH inserted AS (
        INSERT INTO manual_pro_grants(user_id, granted_by_email, starts_at, ends_at, note)
        SELECT u.id, ${admin.email}, now(), ${expiresAt.toISOString()}::timestamptz, ${note}
        FROM app_users u WHERE u.id = ${userId}
        RETURNING id::text AS id, user_id::text AS "userId",
          starts_at AS "startsAt", ends_at AS "endsAt", note
      ), audit AS (
        INSERT INTO admin_audit_log(admin_email, target_user_id, action, details)
        SELECT ${admin.email}, i."userId", 'grant_pro',
          jsonb_build_object('grantId', i.id, 'startsAt', i."startsAt",
            'endsAt', i."endsAt", 'note', i.note)
        FROM inserted i RETURNING id
      )
      SELECT i.*, (SELECT count(*)::int FROM audit) AS "auditRecorded" FROM inserted i
    `;
    if (!rows.length) return fail("User not found.", 404);
    return NextResponse.json({ ok: true, grant: { ...rows[0], active: true } },
      { status: 201, headers: noStore });
  } catch (error) {
    if (missingTable(error)) return fail("Manual Pro grants are not available. Apply Phase 17 first.", 503);
    console.error("Manual Pro grant creation failed", error);
    return fail("Could not create this Pro grant.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return fail("Admin access is restricted.", 403);
  const grantId = request.nextUrl.searchParams.get("grantId") || "";
  if (!/^\\d+$/.test(grantId)) return fail("A valid grant ID is required.", 400);
  try {
    const rows: any = await db()`
      WITH revoked AS (
        UPDATE manual_pro_grants
        SET revoked_at = now(), revoked_by_email = ${admin.email}
        WHERE id = ${grantId}::bigint AND revoked_at IS NULL
          AND starts_at <= now() AND ends_at > now()
        RETURNING id::text AS id, user_id::text AS "userId",
          ends_at AS "endsAt", revoked_at AS "revokedAt"
      ), audit AS (
        INSERT INTO admin_audit_log(admin_email, target_user_id, action, details)
        SELECT ${admin.email}, r."userId", 'revoke_pro_grant',
          jsonb_build_object('grantId', r.id, 'originalEndsAt', r."endsAt",
            'revokedAt', r."revokedAt")
        FROM revoked r RETURNING id
      )
      SELECT r.*, (SELECT count(*)::int FROM audit) AS "auditRecorded" FROM revoked r
    `;
    if (!rows.length) return fail("No active grant was found to revoke.", 409);
    return NextResponse.json({ ok: true, revoked: true, grant: rows[0] }, { headers: noStore });
  } catch (error) {
    if (missingTable(error)) return fail("Manual Pro grants are not available. Apply Phase 17 first.", 503);
    console.error("Manual Pro grant revocation failed", error);
    return fail("Could not revoke this Pro grant.", 503);
  }
}
