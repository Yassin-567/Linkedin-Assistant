import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAssistantAuth } from "@/lib/assistant-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const validId = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const statuses: Record<string, string[]> = {
  linkedin_prospect: ["To research", "Ready to contact", "Connection Sent", "Connected", "Contacted", "Replied", "Call booked", "Client", "Not a fit"],
  job: ["Saved", "Applied", "Interviewing", "Offer", "Rejected", "Closed", "Not interested"],
  commercial_lead: ["New", "Qualified", "Contacted", "In discussion", "Proposal", "Won", "Lost", "Not relevant"]
};

type UpdateInput = {
  resource?: unknown;
  id?: unknown;
  status?: unknown;
  notes?: unknown;
  recommendedOutreach?: unknown;
};

export async function POST(request: NextRequest) {
  let body: { updates?: UpdateInput[] };
  try {
    body = await request.json() as { updates?: UpdateInput[] };
  } catch {
    return fail('Request body must be valid JSON: {"updates":[{"resource":"job","id":"...","status":"Applied"}]}.', 400);
  }

  if (!Array.isArray(body?.updates) || body.updates.length < 1 || body.updates.length > 50) {
    return fail("Provide between 1 and 50 updates in the updates array.", 400);
  }

  try {
    const auth = await resolveAssistantAuth(request);
    if (!auth) return fail("AI Access Token is missing, invalid or revoked.", 401);

    const sql = db();
    let updated = 0;
    let notFound = 0;
    let invalid = 0;
    const results: Record<string, unknown>[] = [];

    for (let index = 0; index < body.updates.length; index++) {
      const input: UpdateInput = body.updates[index] || {};
      const resource = typeof input.resource === "string" ? input.resource : "";
      const id = input.id;
      const statusProvided = Object.prototype.hasOwnProperty.call(input, "status");
      const status = typeof input.status === "string" ? input.status : "";
      const notesProvided = Object.prototype.hasOwnProperty.call(input, "notes");
      const notes = typeof input.notes === "string" ? input.notes.trim() : "";
      const outreachProvided = Object.prototype.hasOwnProperty.call(input, "recommendedOutreach");
      const recommendedOutreach = typeof input.recommendedOutreach === "string" ? input.recommendedOutreach.trim() : "";

      if (!Object.prototype.hasOwnProperty.call(statuses, resource) ||
          !validId(id) ||
          (statusProvided && (typeof input.status !== "string" || !statuses[resource].includes(status))) ||
          (!statusProvided && !notesProvided && !outreachProvided) ||
          (notesProvided && (typeof input.notes !== "string" || notes.length > 5000)) ||
          (outreachProvided && (typeof input.recommendedOutreach !== "string" || recommendedOutreach.length > 6000))) {
        invalid++;
        results.push({ index, status: "invalid", error: "Provide a valid resource and record ID, plus at least one allowed status, notes or recommendedOutreach. Notes must be 5,000 characters or fewer and recommendedOutreach 6,000 characters or fewer." });
        continue;
      }

      let rows: any;
      if (resource === "linkedin_prospect") {
        rows = await sql`
          UPDATE prospects
          SET status = CASE WHEN ${statusProvided} THEN ${status} ELSE status END,
              notes = CASE WHEN ${notesProvided} THEN ${notes} ELSE notes END,
              recommended_outreach = CASE WHEN ${outreachProvided} THEN ${recommendedOutreach} ELSE recommended_outreach END,
              connected = CASE WHEN ${statusProvided} AND ${status} = 'Connected' THEN true ELSE connected END,
              connection_sent_at = CASE WHEN ${statusProvided} AND ${status} = 'Connection Sent' THEN COALESCE(connection_sent_at, now()) ELSE connection_sent_at END,
              connected_on = CASE
                WHEN ${statusProvided} AND ${status} = 'Connected' AND COALESCE(connected_on, '') = ''
                  THEN to_char(current_date, 'YYYY-MM-DD')
                ELSE connected_on
              END,
              updated_at = now()
          WHERE id = ${id}::uuid AND user_id = ${auth.userId}
          RETURNING id::text, status, notes, recommended_outreach AS "recommendedOutreach", connected, connected_on AS "connectedOn", connection_sent_at AS "connectionSentAt", updated_at AS "updatedAt"
        `;
      } else if (resource === "job") {
        rows = await sql`
          UPDATE jobs
          SET status = CASE WHEN ${statusProvided} THEN ${status} ELSE status END,
              notes = CASE WHEN ${notesProvided} THEN ${notes} ELSE notes END,
              recommended_outreach = CASE WHEN ${outreachProvided} THEN ${recommendedOutreach} ELSE recommended_outreach END,
              updated_at = now()
          WHERE id = ${id}::uuid AND user_id = ${auth.userId}
          RETURNING id::text, status, applied_at AS "appliedAt", notes, recommended_outreach AS "recommendedOutreach", updated_at AS "updatedAt"
        `;
      } else {
        rows = await sql`
          UPDATE business_leads
          SET status = CASE WHEN ${statusProvided} THEN ${status} ELSE status END,
              notes = CASE WHEN ${notesProvided} THEN ${notes} ELSE notes END,
              recommended_outreach = CASE WHEN ${outreachProvided} THEN ${recommendedOutreach} ELSE recommended_outreach END,
              updated_at = now()
          WHERE id = ${id}::uuid AND user_id = ${auth.userId}
          RETURNING id::text, status, notes, recommended_outreach AS "recommendedOutreach", updated_at AS "updatedAt"
        `;
      }

      if (!rows.length) {
        notFound++;
        results.push({ index, resource, id, status: "not_found", error: "Record not found in this Inlinked account." });
        continue;
      }

      updated++;
      results.push({
        index,
        resource,
        id: String(rows[0].id),
        status: "updated",
        currentStatus: rows[0].status,
        recommendedOutreach: rows[0].recommendedOutreach || "",\n        ...(resource === "job" ? { appliedAt: rows[0].appliedAt || "" } : {}),
        ...(resource === "linkedin_prospect" ? {
          connected: Boolean(rows[0].connected),
          connectedOn: rows[0].connectedOn || "",\n          connectionSentAt: rows[0].connectionSentAt || ""
        } : {}),
        updatedAt: rows[0].updatedAt
      });
    }

    return NextResponse.json({ ok: true, total: body.updates.length, updated, notFound, invalid, results }, { headers });
  } catch (error) {
    console.error("Assistant record update failed", error);
    return fail("Could not update this batch. Do not report any records as updated unless this endpoint confirms it.", 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
