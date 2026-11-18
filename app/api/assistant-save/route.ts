import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
type Candidate = { name?: unknown; company?: unknown; linkedin?: unknown; url?: unknown };
const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "Referrer-Policy": "no-referrer" };

function canonical(value: string) {
  try {
    const u = new URL(value);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname) || !u.pathname.toLowerCase().startsWith("/in/")) return "";
    return "https://www.linkedin.com" + u.pathname.replace(/\/$/, "").toLowerCase();
  } catch { return ""; }
}

async function resolveUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const permanentToken = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{40,60})$/i)?.[1] || request.nextUrl.searchParams.get("ai") || "";
  const legacyTemporaryToken = request.nextUrl.searchParams.get("access") || "";
  const token = permanentToken || legacyTemporaryToken;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const sql = db();
  const hash = createHash("sha256").update(token).digest("hex");
  if (permanentToken) {
    const rows: any = await sql`SELECT user_id FROM ai_access_tokens WHERE token_hash=${hash} AND revoked_at IS NULL LIMIT 1`;
    return rows.length ? String(rows[0].user_id) : null;
  }
  // Backward compatibility for previously issued 10-minute temporary links.
  const rows: any = await sql`SELECT user_id FROM assistant_scoped_tokens WHERE token_hash=${hash} AND scope='context' AND expires_at>now() AND revoked_at IS NULL LIMIT 1`;
  return rows.length ? String(rows[0].user_id) : null;
}

async function saveBatch(userId: string, candidates: Candidate[], note: string, savedVia: string) {
  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > 50) {
    return NextResponse.json({ error: "Provide between 1 and 50 leads." }, { status: 400, headers: noStore });
  }
  const prepared = candidates.map((x, i) => {
    const name = typeof x?.name === "string" ? x.name.trim() : "";
    const company = typeof x?.company === "string" ? x.company.trim() : "";
    const url = canonical(typeof x?.linkedin === "string" ? x.linkedin : typeof x?.url === "string" ? x.url : "");
    return {
      index: i, name, company, url,
      error: !name || !company || !url || name.length > 200 || company.length > 300
        ? "Provide a name, company and valid LinkedIn personal profile URL." : null
    };
  });
  if (!prepared.some(x => !x.error)) {
    return NextResponse.json({ error: "No valid prospects were provided.", results: prepared }, { status: 400, headers: noStore });
  }

  try {
    const sql = db();
    const results = [];
    let saved = 0, duplicates = 0, invalid = 0;
    for (const x of prepared) {
      if (x.error) {
        invalid++;
        results.push({ index: x.index, status: "invalid", name: x.name, error: x.error });
        continue;
      }
      const rows: any = await sql`INSERT INTO prospects(user_id,name,company,linkedin_url,normalized_linkedin_url,status,follow_up,notes,discovery_source,saved_via)
        VALUES(${userId},${x.name.slice(0,200)},${x.company.slice(0,300)},${x.url},${x.url},'To research','',${note},'ChatGPT research',${savedVia})
        ON CONFLICT(user_id,normalized_linkedin_url) WHERE normalized_linkedin_url IS NOT NULL AND normalized_linkedin_url<>'' DO NOTHING RETURNING id`;
      if (rows.length) {
        saved++;
        results.push({ index: x.index, status: "saved", name: x.name, company: x.company, url: x.url });
      } else {
        duplicates++;
        results.push({ index: x.index, status: "duplicate", name: x.name, company: x.company, url: x.url });
      }
    }
    return NextResponse.json({ ok: true, total: prepared.length, saved, duplicates, invalid, results }, { headers: noStore });
  } catch (error) {
    console.error("Assistant bulk save failed", error);
    return NextResponse.json({ error: "Could not save this batch." }, { status: 503, headers: noStore });
  }
}

export async function GET(request: NextRequest) {
  const encoded = request.nextUrl.searchParams.get("data") || "";
  if (!encoded || encoded.length > 6500) return NextResponse.json({ error: "Provide a base64url data parameter (maximum 6,500 characters)." }, { status: 400, headers: noStore });
  let body: { leads?: Candidate[] };
  try { body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { leads?: Candidate[] }; }
  catch { return NextResponse.json({ error: "Invalid base64url JSON data." }, { status: 400, headers: noStore }); }
  try {
    const userId = await resolveUser(request);
    if (!userId) return NextResponse.json({ error: "Permanent AI Auth Token is missing, invalid or revoked." }, { status: 401, headers: noStore });
    return saveBatch(userId, body.leads || [], "Added through ChatGPT AI Auth Token.", "ChatGPT permanent AI Auth Token");
  } catch (error) {
    console.error("AI Auth Token URL bulk save failed", error);
    return NextResponse.json({ error: "Could not process this save request." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  let body: { leads?: Candidate[] };
  try { body = await request.json() as { leads?: Candidate[] }; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400, headers: noStore }); }
  if (!Array.isArray(body.leads) || body.leads.length === 0 || body.leads.length > 50) {
    return NextResponse.json({ error: "Provide between 1 and 50 leads." }, { status: 400, headers: noStore });
  }
  try {
    const userId = await resolveUser(request);
    if (!userId) return NextResponse.json({ error: "Permanent AI Auth Token is missing, invalid or revoked." }, { status: 401, headers: noStore });
    return saveBatch(userId, body.leads, "Added through ChatGPT AI Auth Token.", "ChatGPT permanent AI Auth Token");
  } catch (error) {
    console.error("Assistant bulk save failed", error);
    return NextResponse.json({ error: "Could not save this batch." }, { status: 503, headers: noStore });
  }
}
