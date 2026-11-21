import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
const statuses = ["New", "Qualified", "Contacted", "In discussion", "Proposal", "Won", "Lost", "Not relevant"];
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const clean = (value: unknown, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validId = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 30) : [];

function sourceUrl(value: unknown): { raw: string; normalized: string } {
  const raw = clean(value, 2000);
  if (!raw) return { raw: "", normalized: "" };
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { raw: "", normalized: "" };
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return { raw: url.toString(), normalized: url.toString().toLowerCase() };
  } catch {
    return { raw: "", normalized: "" };
  }
}

async function fetchLead(userId: string, id: string) {
  const sql = db();
  const rows: any = await sql`SELECT id::text, profile_id::text AS "profileId", title, company,
    contact_name AS "contactName", contact_role AS "contactRole", website, profile_url AS "profileUrl",
    email, phone, location, country, opportunity_summary AS "opportunitySummary",
    service_requested AS "serviceRequested", discovery_engine AS "discoveryEngine",
    buying_intent AS "buyingIntent", confidence, project_type AS "projectType", budget_text AS "budgetText",
    estimated_value_min AS "estimatedValueMin", estimated_value_max AS "estimatedValueMax",
    value_currency AS "valueCurrency", source_platform AS "sourcePlatform", research_tool AS "researchTool", source_type AS "sourceType",
    source_url AS "sourceUrl", published_at AS "publishedAt", evidence, scores,
    source_metadata AS "sourceMetadata", status, notes, next_follow_up AS "nextFollowUp",
    won_value AS "wonValue", won_currency AS "wonCurrency", discovered_at AS "discoveredAt",
    created_at AS "createdAt", updated_at AS "updatedAt"
    FROM business_leads WHERE id = ${id}::uuid AND user_id = ${userId} LIMIT 1`;
  return rows[0] || null;
}

async function insertLead(userId: string, input: any) {
  const title = clean(input.title || input.name, 300);
  const company = clean(input.company, 300);
  if (!title && !company) return { status: "invalid" as const };
  if (input.profileId && !validId(input.profileId)) return { status: "invalid" as const };
  const profileId = validId(input.profileId) ? input.profileId : null;
  const source = sourceUrl(input.sourceUrl);
  if (input.sourceUrl && !source.raw) return { status: "invalid" as const };
  const engine = ["direct_demand", "opportunity_signal", "ideal_customer", "manual"].includes(input.discoveryEngine) ? input.discoveryEngine : "manual";
  const status = statuses.includes(input.status) ? input.status : "New";
  const projectType = ["one_time", "recurring", "either", "unknown"].includes(input.projectType) ? input.projectType : "unknown";
  const scoreData = object(input.scores);
  const evidence = list(input.evidenceUrls || input.evidence);
  const metadata = object(input.sourceMetadata);
  const numeric = (v: unknown) => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(Number(v), 999999999));
  const sql = db();
  if (profileId) {
    const owned: any = await sql`SELECT id FROM lead_profiles WHERE id = ${profileId}::uuid AND user_id = ${userId} LIMIT 1`;
    if (!owned.length) return { status: "invalid" as const };
  }
  const published = input.publishedAt ? new Date(input.publishedAt) : null;
  const publishedAt = published && !Number.isNaN(published.getTime()) ? published : null;
  const rows: any = await sql`INSERT INTO business_leads(
    user_id, profile_id, title, company, contact_name, contact_role, website, profile_url, email, phone,
    location, country, opportunity_summary, service_requested, discovery_engine, buying_intent, confidence,
    project_type, budget_text, estimated_value_min, estimated_value_max, value_currency, source_platform, research_tool,
    source_type, source_url, normalized_source_url, published_at, evidence, scores, source_metadata,
    status, notes, next_follow_up
  ) VALUES (
    ${userId}, ${profileId}::uuid, ${title}, ${company}, ${clean(input.contactName,200)}, ${clean(input.contactRole,200)},
    ${clean(input.website,1000)}, ${clean(input.profileUrl,1000)}, ${clean(input.email,320)}, ${clean(input.phone,80)},
    ${clean(input.location,200)}, ${clean(input.country,120)}, ${clean(input.opportunitySummary || input.description,5000)},
    ${clean(input.serviceRequested,500)}, ${engine}, ${clean(input.buyingIntent,80) || "Potential opportunity"},
    ${clean(input.confidence,50) || "Unreviewed"}, ${projectType}, ${clean(input.budgetText,300)},
    ${numeric(input.estimatedValueMin)}, ${numeric(input.estimatedValueMax)}, ${clean(input.valueCurrency,12)},
    ${clean(input.sourcePlatform,100) || "Manual"}, ${clean(input.researchTool,80) || "Unknown"}, ${clean(input.sourceType,80) || "manual"},
    ${source.raw}, ${source.normalized}, ${publishedAt},
    ${JSON.stringify(evidence)}::jsonb, ${JSON.stringify(scoreData)}::jsonb, ${JSON.stringify(metadata)}::jsonb,
    ${status}, ${clean(input.notes,5000)}, ${clean(input.nextFollowUp,10) || null}::date
  ) ON CONFLICT DO NOTHING RETURNING id::text`;
  if (!rows.length) return { status: "duplicate" as const };
  return { status: "saved" as const, lead: await fetchLead(userId, String(rows[0].id)) };
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const profileId = clean(request.nextUrl.searchParams.get("profileId"), 50);
  const status = clean(request.nextUrl.searchParams.get("status"), 40);
  const search = clean(request.nextUrl.searchParams.get("q"), 200);
  const hasProfile = validId(profileId);
  const hasStatus = statuses.includes(status);
  try {
    const sql = db();
    const leads = await sql`SELECT id::text, profile_id::text AS "profileId", title, company,
      contact_name AS "contactName", contact_role AS "contactRole", website, profile_url AS "profileUrl",
      email, phone, location, country, opportunity_summary AS "opportunitySummary",
      service_requested AS "serviceRequested", discovery_engine AS "discoveryEngine",
      buying_intent AS "buyingIntent", confidence, project_type AS "projectType", budget_text AS "budgetText",
      estimated_value_min AS "estimatedValueMin", estimated_value_max AS "estimatedValueMax",
      value_currency AS "valueCurrency", source_platform AS "sourcePlatform", research_tool AS "researchTool", source_type AS "sourceType",
      source_url AS "sourceUrl", published_at AS "publishedAt", evidence, scores,
      source_metadata AS "sourceMetadata", status, notes, next_follow_up AS "nextFollowUp",
      won_value AS "wonValue", won_currency AS "wonCurrency", discovered_at AS "discoveredAt",
      created_at AS "createdAt", updated_at AS "updatedAt"
      FROM business_leads
      WHERE user_id = ${user.userId}
        AND (${!hasProfile} OR profile_id = ${hasProfile ? profileId : "00000000-0000-0000-0000-000000000000"}::uuid)
        AND (${!hasStatus} OR status = ${hasStatus ? status : "New"})
        AND (${!search} OR concat_ws(' ', title, company, contact_name, location, country, opportunity_summary, service_requested, notes) ILIKE ${"%" + search + "%"})
      ORDER BY created_at DESC LIMIT 1000`;
    return NextResponse.json({ leads }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Business leads read failed", error);
    return fail("Could not load leads. Apply the Phase 9 database migration first.", 503);
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  const batch = Array.isArray(body?.leads) ? body.leads : [body?.lead || body];
  if (!Array.isArray(batch) || batch.length < 1 || batch.length > 50) return fail("Provide between 1 and 50 leads.", 400);
  try {
    let saved = 0, duplicates = 0, invalid = 0;
    const results: any[] = [];
    for (let index = 0; index < batch.length; index++) {
      const input = batch[index] || {};
      const result = await insertLead(user.userId, { ...input, researchTool: input.researchTool ?? body.researchTool });
      if (result.status === "saved") saved++;
      else if (result.status === "duplicate") duplicates++;
      else invalid++;
      results.push({ index, status: result.status, ...(result.status === "saved" ? { lead: result.lead } : {}) });
    }
    return NextResponse.json({ ok: true, total: batch.length, saved, duplicates, invalid, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Business lead save failed", error);
    return fail("Could not save this lead batch.", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  if (!validId(body?.id)) return fail("A valid lead ID is required.", 400);
  const status = statuses.includes(body.status) ? body.status : "New";
  const notes = clean(body.notes, 5000);
  const followUp = clean(body.nextFollowUp, 10);
  const wonValue = body.wonValue === null || body.wonValue === "" || body.wonValue === undefined ? null : Number(body.wonValue);
  if (wonValue !== null && (!Number.isFinite(wonValue) || wonValue < 0)) return fail("Won value must be a non-negative number.", 400);
  try {
    const sql = db();
    const rows: any = await sql`UPDATE business_leads SET status = ${status}, notes = ${notes},
      next_follow_up = ${followUp || null}::date, won_value = ${wonValue},
      won_currency = ${clean(body.wonCurrency,12)}, updated_at = now()
      WHERE id = ${body.id}::uuid AND user_id = ${user.userId} RETURNING id::text`;
    if (!rows.length) return fail("Lead not found in your account.", 404);
    return NextResponse.json({ ok: true, lead: await fetchLead(user.userId, String(rows[0].id)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Business lead update failed", error);
    return fail("Could not update this lead.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!validId(id)) return fail("A valid lead ID is required.", 400);
  try {
    const sql = db();
    const rows: any = await sql`DELETE FROM business_leads WHERE id = ${id}::uuid AND user_id = ${user.userId} RETURNING id`;
    if (!rows.length) return fail("Lead not found in your account.", 404);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Business lead delete failed", error);
    return fail("Could not delete this lead.", 503);
  }
}
