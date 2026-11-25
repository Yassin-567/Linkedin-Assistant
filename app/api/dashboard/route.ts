import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export async function GET() {
  const user = await currentUser({ allowFrozen: true });
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const sql = db();
    const [overviewRows, industryRows, messageRows, weeklyRows, nextRows]: any = await Promise.all([
      sql`SELECT
        COUNT(*)::int AS discovered,
        COUNT(*) FILTER (WHERE status IN ('Ready to contact','Contacted','Replied','Call booked','Client'))::int AS qualified,
        COUNT(*) FILTER (WHERE status = 'Contacted')::int AS contacted,
        COUNT(*) FILTER (WHERE status = 'Replied')::int AS replies,
        COUNT(*) FILTER (WHERE status = 'Call booked')::int AS meetings,
        (SELECT COUNT(*)::int FROM outreach_activities WHERE user_id = ${user.userId} AND activity_type = 'meeting') AS "meetingsLogged",
        COUNT(*) FILTER (WHERE status = 'Client')::int AS clients
        FROM prospects WHERE user_id = ${user.userId}`,
      sql`SELECT industry, COUNT(*)::int AS prospects,
        COUNT(*) FILTER (WHERE status IN ('Replied','Call booked','Client'))::int AS responses,
        COUNT(*) FILTER (WHERE status = 'Client')::int AS clients
        FROM prospects WHERE user_id = ${user.userId} AND industry <> ''
        GROUP BY industry ORDER BY clients DESC, responses DESC, prospects DESC LIMIT 8`,
      sql`SELECT message_type AS "messageType",
        COUNT(*) FILTER (WHERE activity_type = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE activity_type = 'replied')::int AS replies
        FROM outreach_activities WHERE user_id = ${user.userId} AND activity_type IN ('sent','replied')
        GROUP BY message_type ORDER BY replies DESC, sent DESC LIMIT 8`,
      sql`SELECT activity_type AS type, COUNT(*)::int AS count
        FROM outreach_activities WHERE user_id = ${user.userId} AND occurred_at IS NOT NULL AND occurred_at >= now() - interval '7 days'
        GROUP BY activity_type ORDER BY count DESC`,
      sql`SELECT id::text, name, company, status,
        CASE WHEN follow_up ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN follow_up ELSE '' END AS "followUp",
        CASE WHEN follow_up ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (CASE WHEN pg_input_is_valid(follow_up, 'date') THEN follow_up::date ELSE NULL END - CURRENT_DATE) ELSE NULL END AS "daysUntil"
        FROM prospects WHERE user_id = ${user.userId}
          AND follow_up ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND CASE WHEN pg_input_is_valid(follow_up, 'date') THEN follow_up::date ELSE NULL END <= CURRENT_DATE + 14
        ORDER BY CASE WHEN pg_input_is_valid(follow_up, 'date') THEN follow_up::date ELSE NULL END ASC LIMIT 8`
    ]);
    const overview = overviewRows[0] || { discovered: 0, qualified: 0, contacted: 0, replies: 0, meetings: 0, meetingsLogged: 0, clients: 0 };
    const rate = (n: number, d: number) => d ? Math.round((n / d) * 100) : 0;
    return NextResponse.json({
      overview: {
        ...overview,
        replyRate: rate(Number(overview.replies), Number(overview.contacted)),
        meetingRate: rate(Number(overview.meetings), Number(overview.contacted)),
        clientRate: rate(Number(overview.clients), Number(overview.contacted))
      },
      industryPerformance: industryRows,
      messagePerformance: messageRows,
      weeklyActivity: weeklyRows,
      nextActions: nextRows
    }, { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("Dashboard analytics read failed", error);
    return NextResponse.json({ error: "Could not load analytics. Apply the Phase 5 and 6 database migration first." }, { status: 503 });
  }
}
