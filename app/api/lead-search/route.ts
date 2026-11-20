import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { serperSearch } from "@/lib/serper";

export const runtime = "nodejs";
const engines = ["direct_demand", "opportunity_signal", "ideal_customer"] as const;
type Engine = typeof engines[number];
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const clean = (value: unknown, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : "";
const list = (value: unknown) => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean).slice(0, 40) : [];
const countryCodes: Record<string,string> = {
  "united kingdom":"gb", uk:"gb", "united states":"us", usa:"us", canada:"ca", australia:"au",
  egypt:"eg", ireland:"ie", germany:"de", france:"fr", netherlands:"nl", "new zealand":"nz",
  "united arab emirates":"ae", uae:"ae", "saudi arabia":"sa", india:"in", singapore:"sg", "south africa":"za"
};

function sourceCategory(value: string) {
  let host = "";
  try { host = new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return "other_public"; }
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin_public";
  if (host === "reddit.com" || host.endsWith(".reddit.com")) return "reddit";
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com") return "facebook_public";
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com")) return "x_public";
  if (host.includes("forum") || host.includes("community")) return "forums";
  return "business_sites";
}

function platform(value: string) {
  const category = sourceCategory(value);
  const labels: Record<string,string> = {
    linkedin_public:"LinkedIn public post", reddit:"Reddit", facebook_public:"Facebook public post",
    x_public:"X/Twitter public post", forums:"Public forum", business_sites:"Public website", other_public:"Public web"
  };
  return labels[category] || "Public web";
}

function scoreResult(title: string, snippet: string, engine: Engine, prefs: any) {
  const text = (title + " " + snippet).toLowerCase();
  const services = list(prefs.services);
  const industries = list(prefs.industries);
  const terms = [...new Set([...services, ...industries, ...list(prefs.customerTypes), ...list(prefs.decisionMakerRoles)])];
  const matched = terms.filter(term => term.length > 2 && text.includes(term.toLowerCase()));
  const serviceMatch = terms.length ? Math.min(100, Math.round(matched.length / Math.min(terms.length, 6) * 100)) : 35;
  const explicit = /looking for|need (?:a|an|someone|help|support)|seeking|recommend(?:ation)?|hire(?:ing)?|searching for|want to find|request for proposal|rfp|service provider/.test(text);
  const problem = /struggl|problem|issue|manual process|too busy|overwhelmed|expanding|growth|new location|opening|outgrown|outsourc|backlog|inefficient|need support/.test(text);
  const buyingIntent = engine === "direct_demand" && explicit ? "Explicit demand"
    : engine === "opportunity_signal" && problem ? "Strong buying signal"
    : engine === "ideal_customer" ? "Ideal customer prospect"
    : explicit ? "Possible explicit demand" : "Potential opportunity";
  const buyingIntentScore = explicit ? 95 : engine === "opportunity_signal" && problem ? 70 : engine === "ideal_customer" ? 35 : 45;
  const commercialPotential = /monthly|ongoing|retainer|long.term|recurring|regular support/.test(text) ? 85
    : /project|website|redesign|one.off|urgent|asap/.test(text) ? 65 : 45;
  const freshness = /today|yesterday|hours ago|days ago|week ago|\d+ (?:hours?|days?) ago/.test(text) ? 85 : 50;
  const contactability = /@[a-z0-9.-]+\.[a-z]{2,}|contact|owner|founder|director|manager/.test(text) ? 65 : 40;
  const priority = Math.round(serviceMatch * .35 + buyingIntentScore * .3 + freshness * .15 + commercialPotential * .1 + contactability * .1);
  const confidence = explicit && engine === "direct_demand" ? "High" : problem && engine === "opportunity_signal" ? "Medium" : "Low";
  return {
    buyingIntent, confidence,
    scores: { serviceMatch, buyingIntent: buyingIntentScore, freshness, commercialPotential, contactability, priority },
    matchedTerms: matched.slice(0, 8),
    evidenceSummary: snippet.slice(0, 1200)
  };
}

function queryFor(engine: Engine, prefs: any, locationOverride: string, extra: string) {
  const services = list(prefs.services).slice(0, 5).join(" ");
  const industries = list(prefs.industries).slice(0, 4).join(" ");
  const customers = list(prefs.customerTypes).slice(0, 3).join(" ");
  const problems = clean(prefs.problemsSolved, 300);
  const countries = locationOverride || list(prefs.locations).slice(0, 3).concat(list(prefs.countries).slice(0, 3)).join(" ");
  const signals = list(prefs.buyingSignals).slice(0, 5).map(x => x.replace(/_/g, " ")).join(" ");
  const project = prefs.projectType === "recurring" ? "monthly ongoing retainer recurring"
    : prefs.projectType === "one_time" ? "project one-time service" : "project ongoing service";
  const tail = [countries, extra].filter(Boolean).join(" ");
  if (engine === "direct_demand") return [services, industries, customers, signals, project, "looking for need someone recommend service provider", tail].filter(Boolean).join(" ").slice(0, 420);
  if (engine === "opportunity_signal") return [services, industries, customers, problems, "business problem expansion outsourcing looking for support", tail].filter(Boolean).join(" ").slice(0, 420);
  return [industries, customers, services, "businesses companies potential customers", tail].filter(Boolean).join(" ").slice(0, 420);
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  const profileId = clean(body?.profileId, 50);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) return fail("Choose a lead profile before searching.", 400);
  const key = process.env.SERPER_API_KEY;
  if (!key) return fail("Search is not configured. Add SERPER_API_KEY to Vercel Environment Variables.", 503);
  try {
    const sql = db();
    const rows: any = await sql`SELECT name, preferences FROM lead_profiles WHERE id = ${profileId}::uuid AND user_id = ${user.userId} LIMIT 1`;
    if (!rows.length) return fail("Lead profile not found in your account.", 404);
    const profile = rows[0];
    const prefs = profile.preferences && typeof profile.preferences === "object" ? profile.preferences : {};
    const selected = Array.isArray(body.engines) ? body.engines.filter((x: string) => engines.includes(x)) : list(prefs.discoveryEngines).filter((x: string) => engines.includes(x));
    const activeEngines = (selected.length ? selected : ["direct_demand"]) as Engine[];
    const locationOverride = clean(body.location, 180);
    const extra = clean(body.query, 200);
    if (!list(prefs.services).length && !clean(prefs.serviceDescription, 300) && !list(prefs.industries).length && !extra) {
      return fail("Add at least one service, service description, target industry or search-specific query to this profile.", 400);
    }
    const country = locationOverride || list(prefs.countries)[0] || "";
    const gl = country ? countryCodes[country.toLowerCase()] : undefined;
    const hl = clean(prefs.language, 60).toLowerCase().startsWith("arab") ? "ar"
      : clean(prefs.language, 60).toLowerCase().startsWith("french") ? "fr" : "en";
    const queries = activeEngines.map(engine => ({ engine, query: queryFor(engine, prefs, locationOverride, extra) }));
    const batches = await Promise.all(queries.map(async item => {
      const data = await serperSearch(key, item.query, { gl, hl });
      return { ...item, results: Array.isArray(data.organic) ? data.organic : [] };
    }));
    const excluded = list(prefs.excludedKeywords).map(x => x.toLowerCase());
    const allowedSources = list(prefs.sourceCategories);
    const seen = new Set<string>();
    const results = batches.flatMap(batch => batch.results.map((item: any) => {
      const title = clean(item.title, 300) || "Potential customer";
      const url = clean(item.link, 1500);
      const snippet = clean(item.snippet, 1400);
      const score = scoreResult(title, snippet, batch.engine, prefs);
      const category = sourceCategory(url);
      return {
        title, company: "", url, description: snippet, discoveryEngine: batch.engine,
        sourcePlatform: platform(url), sourceType: category === "linkedin_public" || category.endsWith("_public") ? "social_post" : "public_web",
        publishedAt: parseDate(item.date), sourceCategory: category, ...score
      };
    })).filter((item: any) => {
      if (!item.url || !/^https?:\/\//i.test(item.url)) return false;
      if (allowedSources.length && !allowedSources.includes(item.sourceCategory)) return false;
      const text = (item.title + " " + item.description).toLowerCase();
      if (excluded.some(word => word && text.includes(word))) return false;
      try {
        const u = new URL(item.url); u.hash = "";
        for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$)/i.test(k)) u.searchParams.delete(k);
        const normalized = u.toString().toLowerCase().replace(/\/$/, "");
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      } catch { return false; }
    }).sort((a: any, b: any) => b.scores.priority - a.scores.priority).slice(0, 30);
    return NextResponse.json({
      ok: true, profileId, profileName: profile.name, engines: activeEngines,
      queries: queries.map(x => ({ engine: x.engine, query: x.query })),
      count: results.length, results,
      limitations: ["Results are public search snippets, not verified statements from the business.", "Explicit requests, inferred buying signals and ideal-customer prospects are classified separately.", "Check the original source, freshness and contactability before pursuing a lead."]
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Business lead discovery failed", error);
    const message = error instanceof Error && error.message.includes("Search provider") ? error.message : "Could not complete lead discovery. Check database and search provider configuration.";
    return fail(message, 503);
  }
}
