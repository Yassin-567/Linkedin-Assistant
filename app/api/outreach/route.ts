import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const channels = ["linkedin", "email", "other"];
const activityTypes = ["draft", "sent", "replied", "meeting", "note"];
const messageTypes = ["connection_request", "linkedin_follow_up", "email_intro", "email_follow_up", "other"];

export async function GET() {
  const user = await currentUser({ allowFrozen: true });
  if (!user) return fail("Sign in required.", 401);
  try {
    const sql = db();
    const [activities, reminders]: any = await Promise.all([
      sql`SELECT a.id::text, a.prospect_id::text AS "prospectId", p.name, p.company, p.linkedin_url AS "profileUrl",
        a.channel, a.activity_type AS "activityType", a.message_type AS "messageType", a.subject, a.message,
        a.notes, a.follow_up_date::text AS "followUpDate", a.created_at AS "createdAt"
        FROM outreach_activities a JOIN prospects p ON p.id = a.prospect_id AND p.user_id = a.user_id
        WHERE a.user_id = ${user.userId} ORDER BY a.created_at DESC LIMIT 500`,
      sql`SELECT id::text, name, company, linkedin_url AS "profileUrl", status,
        CASE WHEN follow_up ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN follow_up ELSE '' END AS "followUp",
        CASE WHEN follow_up ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (CASE WHEN pg_input_is_valid(follow_up, 'date') THEN follow_up::date ELSE NULL END - CURRENT_DATE) ELSE NULL END AS "daysUntil"
        FROM prospects WHERE user_id = ${user.userId}
        AND follow_up ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND CASE WHEN pg_input_is_valid(follow_up, 'date') THEN follow_up::date ELSE NULL END <= CURRENT_DATE + 14
        ORDER BY CASE WHEN pg_input_is_valid(follow_up, 'date') THEN follow_up::date ELSE NULL END ASC LIMIT 100`
    ]);
    return NextResponse.json({ activities, reminders }, { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("Outreach history read failed", error);
    return fail("Could not load outreach history. Apply the Phase 5 and 6 database migration first.", 503);
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("An outreach activity is required.", 400);

  const prospectId = clean(body.prospectId, 50);
  const channel = clean(body.channel, 20);
  const activityType = clean(body.activityType, 20);
  const messageType = clean(body.messageType, 40);
  const subject = clean(body.subject, 300);
  const message = clean(body.message, 12000);
  const notes = clean(body.notes, 3000);
  const followUpDate = clean(body.followUpDate, 10);
  const idempotencyKey = clean(body.idempotencyKey, 80);

  if (!uuid.test(prospectId)) return fail("Choose a valid saved prospect.", 400);
  if (!channels.includes(channel)) return fail("Choose a valid outreach channel.", 400);
  if (!activityTypes.includes(activityType)) return fail("Choose a valid activity type.", 400);
  if (!messageTypes.includes(messageType)) return fail("Choose a valid message type.", 400);
  if (["draft", "sent"].includes(activityType) && !message) return fail("Write or generate a message first.", 400);
  if (followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) return fail("Use a valid follow-up date.", 400);

  try {
    const sql = db();
    const owned: any = await sql`SELECT id FROM prospects WHERE id = ${prospectId}::uuid AND user_id = ${user.userId} LIMIT 1`;
    if (!owned.length) return fail("That prospect does not belong to your account.", 404);

    if (activityType === "sent") {
      const duplicate: any = await sql`SELECT id FROM outreach_activities
        WHERE user_id = ${user.userId} AND prospect_id = ${prospectId}::uuid
          AND activity_type = 'sent' AND channel = ${channel}
          AND message_type = ${messageType} AND message = ${message}
          AND created_at > now() - interval '10 minutes' LIMIT 1`;
      if (duplicate.length) return fail("This exact message was already marked as sent in the last 10 minutes. Check the history before logging it again.", 409);
    }

    const rows: any = await sql`INSERT INTO outreach_activities
      (user_id, prospect_id, channel, activity_type, message_type, subject, message, notes, follow_up_date, idempotency_key)
      VALUES (${user.userId}, ${prospectId}::uuid, ${channel}, ${activityType}, ${messageType},
        ${subject}, ${message}, ${notes}, ${followUpDate || null}::date, ${idempotencyKey || null})
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING id::text, prospect_id::text AS "prospectId", channel, activity_type AS "activityType",
        message_type AS "messageType", subject, message, notes, follow_up_date::text AS "followUpDate", created_at AS "createdAt"`;
    if (!rows.length) return fail("This action was already recorded. Refresh the history before trying again.", 409);

    if (activityType === "sent") {
      await sql`UPDATE prospects SET status = CASE WHEN status IN ('To research','Ready to contact') THEN 'Contacted' ELSE status END,
        follow_up = CASE WHEN ${followUpDate} <> '' THEN ${followUpDate} ELSE follow_up END,
        updated_at = now() WHERE id = ${prospectId}::uuid AND user_id = ${user.userId}`;
    } else if (activityType === "replied") {
      await sql`UPDATE prospects SET status = 'Replied',
        follow_up = CASE WHEN ${followUpDate} <> '' THEN ${followUpDate} ELSE follow_up END,
        updated_at = now() WHERE id = ${prospectId}::uuid AND user_id = ${user.userId}`;
    } else if (activityType === "meeting") {
      await sql`UPDATE prospects SET status = 'Call booked',
        follow_up = CASE WHEN ${followUpDate} <> '' THEN ${followUpDate} ELSE follow_up END,
        updated_at = now() WHERE id = ${prospectId}::uuid AND user_id = ${user.userId}`;
    } else if (followUpDate) {
      await sql`UPDATE prospects SET follow_up = ${followUpDate}, updated_at = now()
        WHERE id = ${prospectId}::uuid AND user_id = ${user.userId}`;
    }
    return NextResponse.json({ ok: true, activity: rows[0] }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Outreach activity save failed", error);
    return fail("Could not save this outreach activity. Check the Phase 5 and 6 database migration.", 503);
  }
}
