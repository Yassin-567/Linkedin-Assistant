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

async function consumeTemporary(token: string, batchSize: number) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { error: "A valid temporary save link is required." };
  const sql = db();
  const hash = createHash("sha256").update(token).digest("hex");
  const grant: any = await sql`UPDATE assistant_tokens SET batches_remaining=batches_remaining-1,used_at=now() WHERE token_hash=${hash} AND expires_at>now() AND batches_remaining>0 AND ${batchSize}<=max_leads RETURNING user_id`;
  if (!grant.length) return { error: "This save link expired, was already used, or the batch is too large. Generate a new link in the app." };
  return { userId: String(grant[0].user_id) };
}

async function resolveTemporaryUser(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const sql = db();
  const hash = createHash("sha256").update(token).digest("hex");
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
  const p = request.nextUrl.searchParams;
  const accessToken = p.get("access") || "";
  const legacySingleUseToken = p.get("token") || "";
  if (accessToken) {
    const encoded = p.get("data") || "";
    if (!encoded || encoded.length > 6500) return NextResponse.json({ error: "Provide a base64url data parameter (maximum 6,500 characters)." }, { status: 400, headers: noStore });
    let body: { leads?: Candidate[] };
    try { body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { leads?: Candidate[] }; }
    catch { return NextResponse.json({ error: "Invalid base64url JSON data." }, { status: 400, headers: noStore }); }
    try {
      const userId = await resolveTemporaryUser(accessToken);
      if (!userId) return NextResponse.json({ error: "Temporary Access Token is invalid or expired." }, { status: 401, headers: noStore });
      return saveBatch(userId, body.leads || [], "Added through temporary ChatGPT access.", "ChatGPT temporary access");
    } catch (error) {
      console.error("Temporary access URL bulk save failed", error);
      return NextResponse.json({ error: "Could not process this save request." }, { status: 503, headers: noStore });
    }
  }

  if (legacySingleUseToken) {
    const name = (p.get("name") || "").trim();
    const company = (p.get("company") || "").trim();
    const url = canonical(p.get("linkedin") || p.get("url") || "");
    if (!name || !company || !url) return NextResponse.json({ error: "Provide name, company and a LinkedIn personal profile URL." }, { status: 400, headers: noStore });
    try {
      const grant = await consumeTemporary(legacySingleUseToken, 1);
      if ("error" in grant) return NextResponse.json({ error: grant.error }, { status: 401, headers: noStore });
      const sql = db();
      const rows: any = await sql`INSERT INTO prospects(user_id,name,company,linkedin_url,normalized_linkedin_url,status,follow_up,notes,discovery_source,saved_via)
        VALUES(${grant.userId},${name.slice(0,200)},${company.slice(0,300)},${url},${url},'To research','','Added through ChatGPT temporary save link.','ChatGPT research','ChatGPT temporary link')
        ON CONFLICT(user_id,normalized_linkedin_url) WHERE normalized_linkedin_url IS NOT NULL AND normalized_linkedin_url<>'' DO NOTHING RETURNING id`;
      return NextResponse.json({ ok: true, saved: rows.length === 1, duplicate: rows.length === 0, name, company, url }, { headers: noStore });
    } catch (error) {
      console.error("Single assistant save failed", error);
      return NextResponse.json({ error: "Could not save this prospect." }, { status: 503, headers: noStore });
    }
  }

  return NextResponse.json({ error: "Temporary Access Token is required." }, { status: 401, headers: noStore });
}

export async function POST(request: NextRequest) {
  const accessToken = request.nextUrl.searchParams.get("access") || "";
  let body: { leads?: Candidate[] };
  try { body = await request.json() as { leads?: Candidate[] }; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400, headers: noStore }); }

  if (!Array.isArray(body.leads) || body.leads.length === 0 || body.leads.length > 50) {
    return NextResponse.json({ error: "Provide between 1 and 50 leads." }, { status: 400, headers: noStore });
  }

  try {
    if (accessToken) {
      const userId = await resolveTemporaryUser(accessToken);
      if (!userId) return NextResponse.json({ error: "Temporary Access Token is invalid or expired." }, { status: 401, headers: noStore });
      return saveBatch(userId, body.leads, "Added through ChatGPT temporary access.", "ChatGPT temporary access");
    }
    const token = request.nextUrl.searchParams.get("token") || "";
    const grant = await consumeTemporary(token, body.leads.length);
    if ("error" in grant) return NextResponse.json({ error: grant.error }, { status: 401, headers: noStore });
    return saveBatch(grant.userId, body.leads, "Added through ChatGPT temporary bulk save link.", "ChatGPT temporary link");
  } catch (error) {
    console.error("Assistant bulk save failed", error);
    return NextResponse.json({ error: "Could not save this batch." }, { status: 503, headers: noStore });
  }
}
