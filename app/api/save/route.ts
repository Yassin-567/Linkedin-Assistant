import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Plain-text GET bridge so ChatGPT's normal browsing can save prospects with no
// Firecrawl, MCP, Actions or POST support.
//
//   /api/save?ai=<AI Auth Token>&l=Name|Company|https://www.linkedin.com/in/slug&l=Name2|Company2|url2
//
// Add &format=json for a JSON response. Up to 50 leads per request.

const headers = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "Referrer-Policy": "no-referrer" };
const text = (body: string, status = 200) => new NextResponse(body, { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });

function canonical(value: string) {
  try {
    const u = new URL(value.trim());
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname) || !u.pathname.toLowerCase().startsWith("/in/")) return "";
    return "https://www.linkedin.com" + u.pathname.replace(/\/$/, "").toLowerCase();
  } catch { return ""; }
}

function parseLead(raw: string) {
  const parts = raw.split("|").map(s => s.trim());
  // Name | Company | LinkedIn URL (URL is always the last part; extra pipes go into the company).
  const url = canonical(parts[parts.length - 1] || "");
  const name = parts[0] || "";
  const company = parts.slice(1, parts.length - 1).join(" | ");
  const error = !name || !company || !url || name.length > 200 || company.length > 300
    ? "Use Name|Company|LinkedIn personal profile URL (linkedin.com/in/...)." : null;
  return { raw, name, company, url, error };
}

export async function GET(request: NextRequest) {
  const wantsJson = request.nextUrl.searchParams.get("format") === "json";
  const reply = (status: number, payload: Record<string, unknown>, plain: string) =>
    wantsJson ? NextResponse.json(payload, { status, headers }) : text(plain, status);

  const token = request.nextUrl.searchParams.get("ai") || "";
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return reply(401, { error: "AI Auth Token is missing or invalid." }, "ERROR: AI Auth Token is missing or invalid. Nothing was saved.");
  }

  const rawLeads = request.nextUrl.searchParams.getAll("l").flatMap(v => v.split(/\r?\n/)).map(v => v.trim()).filter(Boolean);
  if (rawLeads.length === 0 || rawLeads.length > 50) {
    return reply(400, { error: "Provide between 1 and 50 leads using repeated l=Name|Company|LinkedIn URL parameters." },
      "ERROR: Provide between 1 and 50 leads using repeated l=Name|Company|LinkedInURL parameters. Nothing was saved.");
  }
  const prepared = rawLeads.map(parseLead);

  try {
    const sql = db();
    const hash = createHash("sha256").update(token).digest("hex");
    const owner: any = await sql`SELECT user_id FROM ai_access_tokens WHERE token_hash=${hash} AND revoked_at IS NULL LIMIT 1`;
    if (!owner.length) {
      return reply(401, { error: "AI Auth Token is invalid or revoked." }, "ERROR: AI Auth Token is invalid or revoked. Nothing was saved.");
    }
    const userId = String(owner[0].user_id);

    const results: { status: string; name: string; company: string; url: string; error?: string }[] = [];
    let saved = 0, duplicates = 0, invalid = 0;
    const seen = new Set<string>();
    for (const x of prepared) {
      if (x.error) { invalid++; results.push({ status: "invalid", name: x.name, company: x.company, url: x.url, error: x.error }); continue; }
      if (seen.has(x.url)) { duplicates++; results.push({ status: "duplicate", name: x.name, company: x.company, url: x.url }); continue; }
      seen.add(x.url);
      const rows: any = await sql`INSERT INTO prospects(user_id,name,company,linkedin_url,normalized_linkedin_url,status,follow_up,notes,discovery_source,saved_via)
        VALUES(${userId},${x.name.slice(0, 200)},${x.company.slice(0, 300)},${x.url},${x.url},'To research','','Added through ChatGPT save link.','ChatGPT research','ChatGPT AI Token')
        ON CONFLICT(user_id,normalized_linkedin_url) WHERE normalized_linkedin_url IS NOT NULL AND normalized_linkedin_url<>'' DO NOTHING RETURNING id`;
      if (rows.length) { saved++; results.push({ status: "saved", name: x.name, company: x.company, url: x.url }); }
      else { duplicates++; results.push({ status: "duplicate", name: x.name, company: x.company, url: x.url }); }
    }

    const summary = `Saved ${saved}, duplicates ${duplicates}, invalid ${invalid}, total ${prepared.length}.`;
    const lines = results.map(r => `${r.status.toUpperCase()}: ${r.name} | ${r.company}${r.error ? " (" + r.error + ")" : ""}`);
    return reply(200, { ok: true, total: prepared.length, saved, duplicates, invalid, results }, `${summary}\n${lines.join("\n")}`);
  } catch (error) {
    console.error("GET bridge save failed", error);
    return reply(503, { error: "Could not save this batch." }, "ERROR: Could not save this batch. Nothing should be reported as saved.");
  }
}
