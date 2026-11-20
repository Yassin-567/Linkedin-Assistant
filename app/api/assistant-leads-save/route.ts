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
const clean = (value: unknown, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validId = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const engines = ["direct_demand", "opportunity_signal", "ideal_customer"];
const projectTypes = ["one_time", "recurring", "either", "unknown"];

function safeUrl(value: unknown): { raw: string; normalized: string } {
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
function safeEvidence(value: unknown, primary: string): string[] {
  const input = Array.isArray(value) ? value : [];
  const urls = input.slice(0, 25).map(item => safeUrl(item).raw).filter(Boolean);
  return [...new Set([primary, ...urls].filter(Boolean))].slice(0, 25);
}
function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(Number(value), 999999999));
}
function scoreObject(value: unknown) {
  const input = object(value);
  const output: Record<string, number> = {};
  for (const key of ["serviceMatch", "buyingIntent", "freshness", "commercialPotential", "contactability", "priority"]) {
    const n = Number(input[key]);
    if (Number.isFinite(n)) output[key] = Math.max(0, Math.min(100, Math.round(n)));
  }
  return output;
}
function publishedDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); }
  catch { return fail("Request body must be valid JSON with profileId and a leads array.", 400); }
  if (!validId(body?.profileId)) return fail("A valid profileId is required.", 400);
  if (!Array.isArray(body?.leads) || body.leads.length < 1 || body.leads.length > 50) {
    return fail("Provide between 1 and 50 commercial leads in the leads array.", 400);
  }

  try {
    const auth = await resolveAssistantAuth(request);
    if (!auth) return fail("AI Access Token is missing, invalid or revoked.", 401);
    const sql = db();
    const profiles: any = await sql`
      SELECT id FROM lead_profiles WHERE id = ${body.profileId}::uuid AND user_id = ${auth.userId} LIMIT 1
    `;
    if (!profiles.length) return fail("Lead Profile not found in this Inlinked account.", 404);

    let saved = 0, duplicates = 0, invalid = 0;
    const seen = new Set<string>();
    const results: Record<string, unknown>[] = [];
    for (let index = 0; index < body.leads.length; index++) {
      const input = object(body.leads[index]);
      const title = clean(input.title || input.name || input.company, 300);
      const company = clean(input.company, 300) || title;
      const sourceCandidate = input.sourceUrl || input.sourceURL || (Array.isArray(input.evidenceUrls) ? input.evidenceUrls[0] : "");
      const source = safeUrl(sourceCandidate);
      const engine = clean(input.discoveryEngine || input.engine, 50);
      if ((!title && !company) || !source.raw || !engines.includes(engine)) {
        invalid++;
        results.push({ index, status: "invalid", name: title || company, error: "A title or company, a valid public http(s) sourceUrl and a recognized discoveryEngine are required." });
        continue;
      }
      if (seen.has(source.normalized)) {
        duplicates++;
        results.push({ index, status: "duplicate", name: title, company, sourceUrl: source.raw });
        continue;
      }
      seen.add(source.normalized);

      const website = safeUrl(input.website).raw;
      const profileUrl = safeUrl(input.profileUrl).raw;
      const prior: any = await sql`
        SELECT id FROM business_leads
        WHERE user_id = ${auth.userId} AND profile_id = ${body.profileId}::uuid
          AND (
            normalized_source_url = ${source.normalized}
            OR (${Boolean(company)} AND lower(company) = lower(${company}))
            OR (${Boolean(website)} AND lower(website) = lower(${website}))
          )
        LIMIT 1
      `;
      if (prior.length) {
        duplicates++;
        results.push({ index, status: "duplicate", name: title, company, sourceUrl: source.raw });
        continue;
      }

      const confidenceValue = clean(input.confidence, 40);
      const confidence = ["High", "Medium", "Low", "Unverified"].includes(confidenceValue) ? confidenceValue : "Unverified";
      const projectTypeValue = clean(input.projectType, 40);
      const projectType = projectTypes.includes(projectTypeValue) ? projectTypeValue : "unknown";
      const evidence = safeEvidence(input.evidenceUrls || input.evidence, source.raw);
      const scores = scoreObject(input.scores);
      const metadata = object(input.sourceMetadata);
      const publishedAt = publishedDate(input.publishedAt);
      const rows: any = await sql`
        INSERT INTO business_leads(
          user_id, profile_id, title, company, contact_name, contact_role, website, profile_url,
          email, phone, location, country, opportunity_summary, service_requested,
          discovery_engine, buying_intent, confidence, project_type, budget_text,
          estimated_value_min, estimated_value_max, value_currency, source_platform, source_type,
          source_url, normalized_source_url, published_at, evidence, scores, source_metadata,
          status, notes
        ) VALUES (
          ${auth.userId}, ${body.profileId}::uuid, ${title}, ${company},
          ${clean(input.contactName, 200)}, ${clean(input.contactRole, 200)}, ${website}, ${profileUrl},
          ${clean(input.email, 320)}, ${clean(input.phone, 80)}, ${clean(input.location, 200)},
          ${clean(input.country, 120)}, ${clean(input.opportunitySummary || input.description, 5000)},
          ${clean(input.serviceRequested, 500)}, ${engine},
          ${clean(input.buyingIntent, 100) || "Potential opportunity"}, ${confidence}, ${projectType},
          ${clean(input.budgetText, 300)}, ${numberOrNull(input.estimatedValueMin)},
          ${numberOrNull(input.estimatedValueMax)}, ${clean(input.valueCurrency, 12)},
          ${clean(input.sourcePlatform, 100) || "ChatGPT web research"},
          ${clean(input.sourceType, 80) || "public_web"}, ${source.raw}, ${source.normalized},
          ${publishedAt}, ${JSON.stringify(evidence)}::jsonb, ${JSON.stringify(scores)}::jsonb,
          ${JSON.stringify(metadata)}::jsonb, 'New', ''
        )
        ON CONFLICT DO NOTHING RETURNING id::text
      `;
      if (!rows.length) {
        duplicates++;
        results.push({ index, status: "duplicate", name: title, company, sourceUrl: source.raw });
      } else {
        saved++;
        results.push({ index, status: "saved", id: String(rows[0].id), name: title, company, sourceUrl: source.raw });
      }
    }
    return NextResponse.json({ ok: true, profileId: body.profileId, total: body.leads.length, saved, duplicates, invalid, results }, { headers });
  } catch (error) {
    console.error("Assistant commercial lead save failed", error);
    return fail("Could not save this commercial lead batch. Do not report records as saved unless this endpoint confirms success.", 503);
  }
}
export function OPTIONS() { return new Response(null, { status: 204, headers }); }
