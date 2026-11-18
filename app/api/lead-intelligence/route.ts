import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { serperSearch } from "@/lib/serper";

export const runtime = "nodejs";
type Evidence = { category: string; title: string; url: string; snippet: string };
const clean = (value: unknown, max = 240) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function searchEvidence(key: string, query: string, category: string): Promise<Evidence[]> {
  const data = await serperSearch(key, query, { hl: "en" });
  return (Array.isArray(data.organic) ? data.organic : []).map((item: any) => ({
    category,
    title: clean(item.title, 300),
    url: clean(item.link, 1000),
    snippet: clean(item.snippet, 1000)
  })).filter((item: Evidence) => item.url && item.title);
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const prospectId = clean(request.nextUrl.searchParams.get("prospectId"), 80);
  if (!/^[0-9a-f-]{36}$/i.test(prospectId)) return NextResponse.json({ error: "A valid prospect is required." }, { status: 400 });
  try {
    const sql = db();
    const rows: any = await sql`SELECT report, sources, researched_at FROM prospect_intelligence
      WHERE user_id = ${user.userId} AND prospect_id = ${prospectId} LIMIT 1`;
    return NextResponse.json({ intelligence: rows[0] || null }, { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("Lead intelligence read failed", error);
    return NextResponse.json({ error: "Could not load the saved intelligence report. Run the Phase 4 database migration first." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const company = clean(body?.company, 180);
  const contactName = clean(body?.contactName, 160);
  const profileUrl = clean(body?.profileUrl, 500);
  const prospectId = clean(body?.prospectId, 80);
  if (!company) return NextResponse.json({ error: "Enter a company name." }, { status: 400 });
  if (prospectId && !/^[0-9a-f-]{36}$/i.test(prospectId)) return NextResponse.json({ error: "Invalid prospect ID." }, { status: 400 });

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return NextResponse.json({ error: "Company research is not configured. Add SERPER_API_KEY in Vercel." }, { status: 503 });
  const gatewayToken = request.headers.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
  if (!gatewayToken) {
    return NextResponse.json({ error: "AI Gateway authentication is unavailable. Deploy this feature to Vercel with AI Gateway enabled, or configure AI_GATEWAY_API_KEY for local development." }, { status: 503 });
  }

  try {
    const sql = db();
    const contextRows: any = await sql`SELECT
      (SELECT profile_summary FROM app_users WHERE id = ${user.userId}) AS profile_summary,
      (SELECT linkedin_profile_data FROM app_users WHERE id = ${user.userId}) AS profile_data,
      industries, keywords, job_titles, countries
      FROM user_preferences WHERE user_id = ${user.userId}`;
    const context = contextRows[0] || {};
    if (prospectId) {
      const owned: any = await sql`SELECT id FROM prospects WHERE id = ${prospectId} AND user_id = ${user.userId} LIMIT 1`;
      if (!owned.length) return NextResponse.json({ error: "That prospect does not belong to your account." }, { status: 404 });
    }

    let profileSlug = "";
    if (profileUrl) {
      try {
        profileSlug = new URL(profileUrl).pathname.split("/").filter(Boolean).pop() || "";
      } catch {
        profileSlug = "";
      }
    }
    // Use normal words only so the same research works with Serper free accounts.
    const queries = [
      searchEvidence(serperKey, company + " official website about services", "Company website"),
      searchEvidence(serperKey, company + " hiring jobs careers vacancies", "Hiring signals"),
      searchEvidence(serperKey, company + " expansion new location opening growth contract", "Growth signals"),
      searchEvidence(serperKey, company + " operations service delivery scheduling maintenance customer reviews", "Operational signals"),
      ...(profileUrl ? [searchEvidence(serperKey, contactName + " " + profileSlug + " " + company + " LinkedIn profile", "Public LinkedIn context")] : [])
    ];
    const groups = await Promise.all(queries);
    const seen = new Set<string>();
    const sources = groups.flat().filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    }).slice(0, 24);

    const profileData = context.profile_data && typeof context.profile_data === "object" ? context.profile_data : {};
    const userContext = [
      clean(context.profile_summary, 3000),
      Array.isArray(context.industries) ? "Target industries: " + context.industries.join(", ") : "",
      Array.isArray(context.keywords) ? "Relevant skills/interests: " + context.keywords.join(", ") : "",
      Array.isArray(context.job_titles) ? "Target decision-makers: " + context.job_titles.join(", ") : "",
      Array.isArray(context.countries) ? "Target markets: " + context.countries.join(", ") : "",
      profileData.fields?.headline ? "Confirmed LinkedIn headline: " + clean(profileData.fields.headline, 300) : ""
    ].filter(Boolean).join("\n").slice(0, 4500);

    const evidenceText = sources.map((item, index) =>
      "[" + (index + 1) + "] " + item.category + "\nTitle: " + item.title + "\nURL: " + item.url + "\nSnippet: " + item.snippet
    ).join("\n\n");
    const prompt = "Research target company: " + company + "\nContact: " + (contactName || "Not specified") +
      "\nPublic profile URL supplied: " + (profileUrl || "Not supplied") +
      "\n\nUser's confirmed professional context and target preferences:\n" +
      (userContext || "No confirmed professional context has been added.") +
      "\n\nPublic search evidence (treat this as the only factual source material):\n" +
      (evidenceText || "No public search results were found.") +
      "\n\nProduce a practical lead-intelligence report for a business-development user. Return ONLY valid JSON with this shape: " +
      "{\"companySnapshot\":\"2-3 sentences, or say evidence is insufficient\",\"signals\":[{\"category\":\"Hiring|Expansion|Operations|Customer experience|Other\",\"observation\":\"specific signal\",\"whyItMatters\":\"business implication\",\"evidenceUrls\":[\"exact URL from evidence\"],\"confidence\":\"High|Medium|Low\"}],\"likelyPainPoints\":[{\"hypothesis\":\"possible business problem, explicitly framed as a hypothesis\",\"reason\":\"why evidence suggests it\",\"evidenceUrls\":[\"exact URL from evidence\"],\"confidence\":\"High|Medium|Low\"}],\"opportunities\":[{\"opportunity\":\"specific way the user could add value\",\"whyNow\":\"connect to a signal or state timing is unknown\",\"evidenceUrls\":[\"exact URL from evidence\"]}],\"personalizedReasonToContact\":\"one concise, evidence-led reason\",\"valueProposition\":\"tailored value proposition based on confirmed user context; do not invent qualifications\",\"outreachAngle\":\"short natural opening angle, not a full cold message\",\"researchGaps\":[\"important facts not verified\"]}" +
      "\nRules: Never invent facts, hiring, locations, systems, problems, contacts or figures. Separate observed signals from hypotheses. Use only exact evidence URLs. Never claim private LinkedIn access. If user context is missing, say so rather than inventing services. Be concise and commercially useful.";

    const aiResponse = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + gatewayToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_GATEWAY_MODEL || "openai/gpt-5.6-sol",
        messages: [
          { role: "system", content: "You are a careful B2B company researcher. Evidence-first, skeptical, commercially practical. Return valid JSON only." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 1800
      }),
      cache: "no-store"
    });
    if (!aiResponse.ok) {
      const detail = await aiResponse.text().catch(() => "");
      console.error("AI Gateway failed", aiResponse.status, detail.slice(0, 500));
      let gatewayError: any = null;
      try { gatewayError = JSON.parse(detail).error; } catch { /* Keep the safe generic message below. */ }

      if (gatewayError?.type === "customer_verification_required") {
        throw new Error("Vercel AI Gateway requires a valid payment card on the Vercel team before it can provide free credits. Add a card in Vercel AI settings, then retry.");
      }
      if (gatewayError?.type === "insufficient_funds") {
        throw new Error("Vercel AI Gateway has insufficient credits. Check the team's AI Gateway balance and billing, then retry.");
      }
      if (gatewayError?.type === "quota_for_entity_exceeded") {
        throw new Error("The Vercel AI Gateway budget for this team, project, or key has been reached. Review the AI Gateway budget, then retry.");
      }
      if (aiResponse.status === 401 || aiResponse.status === 403) {
        throw new Error("Vercel AI Gateway denied this request. Check the project's AI Gateway access and deployment authentication.");
      }
      throw new Error("AI research returned HTTP " + aiResponse.status + ". Try again later.");
    }
    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("AI Gateway returned an empty report.");
    let report: any;
    try { report = JSON.parse(content); }
    catch { throw new Error("AI Gateway returned an unreadable report. Please retry."); }

    if (prospectId) {
      await sql`INSERT INTO prospect_intelligence(user_id, prospect_id, company, report, sources, researched_at)
        VALUES (${user.userId}, ${prospectId}, ${company}, ${JSON.stringify(report)}::jsonb, ${JSON.stringify(sources)}::jsonb, now())
        ON CONFLICT(user_id, prospect_id) DO UPDATE SET company = EXCLUDED.company,
          report = EXCLUDED.report, sources = EXCLUDED.sources, researched_at = now()`;
    }
    return NextResponse.json({ company, report, sources, researchedAt: new Date().toISOString(), saved: !!prospectId },
      { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("Lead intelligence research failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not complete lead research." }, { status: 503 });
  }
}
