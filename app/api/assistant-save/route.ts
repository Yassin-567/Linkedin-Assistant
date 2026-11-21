import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAssistantAuth } from "@/lib/assistant-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/assistant-save
// Authorization: Bearer <permanent AI Auth Token or 10-minute access token>
// Body: {"leads":[{"name":"...","company":"...","linkedin":"https://www.linkedin.com/in/slug"}]}  (1-50 leads)

type Candidate = { name?: unknown; company?: unknown; linkedin?: unknown; url?: unknown; researchTool?: unknown };
const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "86400" };
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers: noStore });

function canonical(value: string) {
  try {
    const u = new URL(value.trim());
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname) || !u.pathname.toLowerCase().startsWith("/in/")) return "";
    return "https://www.linkedin.com" + u.pathname.replace(/\/$/, "").toLowerCase();
  } catch { return ""; }
}

export async function POST(request: NextRequest) {
  let body: { leads?: Candidate[]; researchTool?: unknown };
  try { body = await request.json() as { leads?: Candidate[]; researchTool?: unknown }; }
  catch { return fail("Request body must be valid JSON: {\"leads\":[{\"name\":\"\",\"company\":\"\",\"linkedin\":\"\"}]}.", 400); }
  if (!Array.isArray(body?.leads) || body.leads.length === 0 || body.leads.length > 50) {
    return fail("Provide between 1 and 50 leads in the leads array.", 400);
  }

  try {
    const auth = await resolveAssistantAuth(request);
    if (!auth) return fail("AI token is missing, invalid, expired or revoked. Send it as Authorization: Bearer <token>.", 401);

    const prepared = body.leads.map((x, index) => {
      const name = typeof x?.name === "string" ? x.name.trim() : "";
      const company = typeof x?.company === "string" ? x.company.trim() : "";
      const url = canonical(typeof x?.linkedin === "string" ? x.linkedin : typeof x?.url === "string" ? x.url : "");
      const error = !name || !company || !url || name.length > 200 || company.length > 300
        ? "Provide a name, company and a personal LinkedIn profile URL (linkedin.com/in/...)." : null;
      const researchTool = (typeof x?.researchTool === "string" ? x.researchTool : typeof body.researchTool === "string" ? body.researchTool : "Unknown").trim().slice(0,80) || "Unknown";
      return { index, name, company, url, researchTool, error };
    });
    if (!prepared.some(x => !x.error)) return fail("No valid prospects were provided.", 400, { results: prepared });

    const sql = db();
    const results: Record<string, unknown>[] = [];
    let saved = 0, duplicates = 0, invalid = 0;
    const seen = new Set<string>();
    for (const x of prepared) {
      if (x.error) { invalid++; results.push({ index: x.index, status: "invalid", name: x.name, error: x.error }); continue; }
      if (seen.has(x.url)) { duplicates++; results.push({ index: x.index, status: "duplicate", name: x.name, company: x.company, url: x.url }); continue; }
      seen.add(x.url);
      const rows: any = await sql`INSERT INTO prospects(user_id,name,company,linkedin_url,normalized_linkedin_url,status,follow_up,notes,discovery_source,saved_via,research_tool)
        VALUES(${auth.userId},${x.name.slice(0, 200)},${x.company.slice(0, 300)},${x.url},${x.url},'To research','','Added through AI research.','ChatGPT research','ChatGPT AI Token',${x.researchTool})
        ON CONFLICT(user_id,normalized_linkedin_url) WHERE normalized_linkedin_url IS NOT NULL AND normalized_linkedin_url<>'' DO NOTHING RETURNING id::text`;
      if (rows.length) { saved++; results.push({ index: x.index, id: String(rows[0].id), status: "saved", name: x.name, company: x.company, url: x.url, researchTool: x.researchTool }); }
      else { duplicates++; results.push({ index: x.index, status: "duplicate", name: x.name, company: x.company, url: x.url }); }
    }
    return NextResponse.json({ ok: true, total: prepared.length, saved, duplicates, invalid, results }, { headers: noStore });
  } catch (error) {
    console.error("Assistant bulk save failed", error);
    return fail("Could not save this batch. Nothing should be reported as saved.", 503);
  }
}

// CORS preflight for browser-based HTTP tools. Access still requires a valid Bearer token.
export function OPTIONS() { return new Response(null, { status: 204, headers: noStore }); }
