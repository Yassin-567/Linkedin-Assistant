import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const statuses = ["To research", "Ready to contact", "Connection Sent", "Connected", "Contacted", "Replied", "Call booked", "Client", "Not a fit"];
const sources = ["Google/Serper", "LinkedIn", "Manual", "ChatGPT research", "Referral", "Other"];
const methods = ["Find Leads", "Manual entry", "ChatGPT AI Token", "ChatGPT temporary link", "CSV import"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const cleanKnown = (value: unknown, max: number) => { const result = clean(value, max); return result.toLowerCase() === "unknown" ? "" : result; };
const pick = (value: unknown, allowed: string[], fallback = "") => typeof value === "string" && allowed.includes(value) ? value : fallback;
const validTimestamp = (value: string) => !value || !Number.isNaN(new Date(value).getTime());

function profileUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!/(^|\\.)linkedin\.com$/i.test(url.hostname) || !url.pathname.toLowerCase().startsWith("/in/")) return null;
    return "https://www.linkedin.com" + url.pathname.replace(/\/$/, "").toLowerCase();
  } catch {
    return null;
  }
}

const returning = `id::text, name, company, linkedin_url AS url, industry, status,
  follow_up AS "followUp", notes, recommended_outreach AS "recommendedOutreach",
  connected, connected_on AS "connectedOn", connected_at AS "connectedAt",
  connection_sent_at AS "connectionSentAt", discovery_source AS "discoverySource",
  saved_via AS "savedVia", research_tool AS "researchTool",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export async function GET() {
  const user = await currentUser({ allowFrozen: true });
  if (!user) return fail("Sign in required.", 401);
  try {
    const sql = db();
    const leads = await sql`SELECT ${sql.unsafe(returning)} FROM prospects
      WHERE user_id = ${user.userId} ORDER BY created_at DESC LIMIT 1000`;
    return NextResponse.json({ leads }, { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("Prospect read failed", error);
    return fail("Could not load prospects.", 503);
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("A prospect object is required.", 400);

  const name = clean(body.name, 200);
  const company = clean(body.company, 300);
  const url = profileUrl(body.url);
  const status = pick(body.status, statuses, "To research");
  const researchTool = cleanKnown(body.researchTool, 80);
  const connectedAt = clean(body.connectedAt, 60);
  const connectionSentAt = clean(body.connectionSentAt, 60);
  const connectedOn = clean(body.connectedOn, 30);
  if (connectedAt && !validTimestamp(connectedAt)) return fail("Use a valid connection date and time.", 400);
  if (connectionSentAt && !validTimestamp(connectionSentAt)) return fail("Use a valid connection-request date and time.", 400);
  if (connectedOn && !/^\d{4}-\d{2}-\d{2}$/.test(connectedOn)) return fail("Use a valid connection date.", 400);
  if (!name || !company) return fail("Contact name and company are required.", 400);
  if (body.url && !url) return fail("Use a valid LinkedIn personal profile URL, or leave it blank.", 400);

  try {
    const sql = db();
    const rows: any = await sql`INSERT INTO prospects (
      user_id, name, company, linkedin_url, normalized_linkedin_url, industry, status,
      follow_up, notes, recommended_outreach, connected, connected_on, connected_at,
      connection_sent_at, discovery_source, saved_via, research_tool
    ) VALUES (
      ${user.userId}, ${name}, ${company}, ${url}, ${url}, ${clean(body.industry, 160)},
      ${status}, ${clean(body.followUp, 30)}, ${clean(body.notes, 5000)},
      ${clean(body.recommendedOutreach, 6000)}, ${!!body.connected || status === "Connected"},
      CASE WHEN ${status} = 'Connected' AND ${connectedAt} <> ''
        THEN to_char(${connectedAt}::timestamptz AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD')
        ELSE ${connectedOn} END,
      NULLIF(${connectedAt}, '')::timestamptz,
      NULLIF(${connectionSentAt}, '')::timestamptz,
      ${pick(body.discoverySource, sources, "Manual")},
      ${pick(body.savedVia, methods, "Manual entry")},
      ${researchTool}
    )
    ON CONFLICT (user_id, normalized_linkedin_url)
      WHERE normalized_linkedin_url IS NOT NULL AND normalized_linkedin_url <> ''
    DO NOTHING
    RETURNING ${sql.unsafe(returning)}`;
    if (!rows.length) return fail("This LinkedIn profile is already saved in your account.", 409);
    return NextResponse.json({ ok: true, lead: rows[0] }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prospect create failed", error);
    return fail("Could not save this prospect.", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!uuid.test(id)) return fail("A valid prospect ID is required.", 400);

  const name = clean(body.name, 200);
  const company = clean(body.company, 300);
  if (!name || !company) return fail("Contact name and company are required.", 400);

  const hasUrl = Object.prototype.hasOwnProperty.call(body, "url");
  const url = hasUrl ? profileUrl(body.url) : null;
  if (hasUrl && body.url && !url) return fail("Use a valid LinkedIn personal profile URL, or leave it blank.", 400);

  const status = pick(body.status, statuses, "To research");
  const hasConnectedAt = Object.prototype.hasOwnProperty.call(body, "connectedAt");
  const connectedAt = clean(body.connectedAt, 60);
  const hasConnectionSentAt = Object.prototype.hasOwnProperty.call(body, "connectionSentAt");
  const connectionSentAt = clean(body.connectionSentAt, 60);
  const hasConnectedOn = Object.prototype.hasOwnProperty.call(body, "connectedOn");
  const connectedOn = clean(body.connectedOn, 30);
  if (connectedAt && !validTimestamp(connectedAt)) return fail("Use a valid connection date and time.", 400);
  if (connectionSentAt && !validTimestamp(connectionSentAt)) return fail("Use a valid connection-request date and time.", 400);
  if (connectedOn && !/^\d{4}-\d{2}-\d{2}$/.test(connectedOn)) return fail("Use a valid connection date.", 400);

  const hasRecommendedOutreach = Object.prototype.hasOwnProperty.call(body, "recommendedOutreach");
  const hasDiscoverySource = Object.prototype.hasOwnProperty.call(body, "discoverySource");
  const hasSavedVia = Object.prototype.hasOwnProperty.call(body, "savedVia");
  const hasResearchTool = Object.prototype.hasOwnProperty.call(body, "researchTool");
  const researchTool = cleanKnown(body.researchTool, 80);
  try {
    const sql = db();
    const rows: any = await sql`UPDATE prospects SET
      name = ${name},
      company = ${company},
      linkedin_url = CASE WHEN ${hasUrl} THEN ${url} ELSE linkedin_url END,
      normalized_linkedin_url = CASE WHEN ${hasUrl} THEN ${url} ELSE normalized_linkedin_url END,
      industry = ${clean(body.industry, 160)},
      status = ${status},
      follow_up = ${clean(body.followUp, 30)},
      notes = ${clean(body.notes, 5000)},
      recommended_outreach = CASE WHEN ${hasRecommendedOutreach} THEN ${clean(body.recommendedOutreach, 6000)} ELSE recommended_outreach END,
      connected = CASE WHEN ${status} = 'Connected' THEN true ELSE ${!!body.connected} END,
      connected_at = CASE
        WHEN ${hasConnectedAt} THEN NULLIF(${connectedAt}, '')::timestamptz
        WHEN status <> 'Connected' AND ${status} = 'Connected' THEN COALESCE(connected_at, now())
        ELSE connected_at
      END,
      connected_on = CASE
        WHEN ${hasConnectedAt} AND ${connectedAt} <> '' THEN to_char(${connectedAt}::timestamptz AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD')
        WHEN ${hasConnectedOn} THEN ${connectedOn}
        ELSE connected_on
      END,
      connection_sent_at = CASE
        WHEN ${hasConnectionSentAt} THEN NULLIF(${connectionSentAt}, '')::timestamptz
        WHEN status <> 'Connection Sent' AND ${status} = 'Connection Sent' THEN COALESCE(connection_sent_at, now())
        ELSE connection_sent_at
      END,
      discovery_source = CASE WHEN ${hasDiscoverySource} THEN ${pick(body.discoverySource, sources)} ELSE discovery_source END,
      saved_via = CASE WHEN ${hasSavedVia} THEN ${pick(body.savedVia, methods)} ELSE saved_via END,
      research_tool = CASE WHEN ${hasResearchTool} THEN ${researchTool} ELSE research_tool END,
      updated_at = now()
      WHERE id = ${id}::uuid AND user_id = ${user.userId}
      RETURNING ${sql.unsafe(returning)}`;
    if (!rows.length) return fail("Prospect not found in your account, or its LinkedIn URL is already used.", 404);
    return NextResponse.json({ ok: true, lead: rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prospect update failed", error);
    return fail("Could not update this prospect.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!uuid.test(id)) return fail("A valid prospect ID is required.", 400);
  try {
    const sql = db();
    const rows: any = await sql`DELETE FROM prospects WHERE id = ${id}::uuid AND user_id = ${user.userId} RETURNING id`;
    if (!rows.length) return fail("Prospect not found in your account.", 404);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prospect delete failed", error);
    return fail("Could not delete this prospect.", 503);
  }
}
