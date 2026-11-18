import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { serperSearch } from "@/lib/serper";

export const runtime = "nodejs";

const countryCodes: Record<string, string> = {
  "united kingdom": "gb", uk: "gb", "united states": "us", usa: "us",
  canada: "ca", australia: "au", egypt: "eg", ireland: "ie", germany: "de",
  france: "fr", netherlands: "nl", "new zealand": "nz",
  "united arab emirates": "ae", uae: "ae", "saudi arabia": "sa",
  india: "in", singapore: "sg", "south africa": "za"
};
const stopWords = new Set([
  "about", "with", "from", "that", "this", "your", "have", "will", "into",
  "their", "they", "them", "and", "the", "for", "are", "was", "you", "our",
  "who", "what", "how", "its", "has", "had", "can", "all", "any", "not",
  "but", "more", "than", "also", "work", "working", "experience",
  "experienced", "professional", "professionals", "linkedin", "profile"
]);

function clean(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canonicalProfile(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com")) ||
        parts.length !== 2 || parts[0].toLowerCase() !== "in") {
      return "";
    }
    return "https://www.linkedin.com/in/" + parts[1].toLowerCase();
  } catch {
    return "";
  }
}

function terms(value: string): string[] {
  return [...new Set(
    (value.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [])
      .filter(term => !stopWords.has(term))
  )].slice(0, 12);
}

async function runSearch(userId: string, nicheInput: unknown, locationInput: unknown) {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Search is not configured. Add SERPER_API_KEY to Vercel Environment Variables." },
      { status: 503 }
    );
  }

  try {
    const sql = db();
    const rows: any = await sql`SELECT industries, keywords, job_titles, countries,
      excluded_keywords, language, linkedin_profile_url,
      (SELECT profile_summary FROM app_users WHERE id = ${userId}) AS profile_summary
      FROM user_preferences WHERE user_id = ${userId}`;
    const pref = rows[0] as any;
    if (!pref) {
      return NextResponse.json({ error: "Set up your search preferences first." }, { status: 400 });
    }

    const niche = clean(nicheInput, 200);
    const location = clean(locationInput, 160);
    const industries = niche ? [niche] : (Array.isArray(pref.industries) ? pref.industries : []);
    const countries = location ? [location] : (Array.isArray(pref.countries) ? pref.countries : []);
    if (!industries.length || !countries.length) {
      return NextResponse.json(
        { error: "Add at least one target industry and country in Search settings, or enter them for this search." },
        { status: 400 }
      );
    }

    const titles = Array.isArray(pref.job_titles) ? pref.job_titles.slice(0, 12) : [];
    const keywords = Array.isArray(pref.keywords) ? pref.keywords.slice(0, 20) : [];
    const excluded = Array.isArray(pref.excluded_keywords)
      ? pref.excluded_keywords.map((value: string) => String(value).toLowerCase())
      : [];
    const gl = countries.length === 1 ? countryCodes[countries[0].toLowerCase()] : undefined;
    const language = clean(pref.language, 60) || "English";
    const hl = language.toLowerCase().startsWith("arab") ? "ar"
      : language.toLowerCase().startsWith("french") ? "fr"
      : language.toLowerCase().startsWith("german") ? "de" : "en";

    let profileContext = clean(pref.profile_summary, 2500);
    let profileContextSource = profileContext ? "saved profile context" : "none";
    const profileUrl = canonicalProfile(clean(pref.linkedin_profile_url, 500));

    if (profileUrl) {
      try {
        const slug = new URL(profileUrl).pathname.split("/").filter(Boolean).pop() || "";
        const profileResults = await serperSearch(key, slug + " LinkedIn profile", { hl });
        const organic = Array.isArray(profileResults.organic) ? profileResults.organic : [];
        const own = organic.find((item: any) => canonicalProfile(String(item.link || "")) === profileUrl);
        if (own) {
          const indexed = [clean(own.title, 300), clean(own.snippet, 700)].filter(Boolean).join(". ");
          if (indexed) {
            profileContext = [profileContext, indexed].filter(Boolean).join(". ").slice(0, 3200);
            profileContextSource = "public LinkedIn search snippet";
          }
        } else if (!profileContext) {
          profileContextSource = "profile URL saved; public profile details were not indexed";
        }
      } catch (error) {
        console.warn("Could not retrieve public profile context", error);
        if (!profileContext) profileContextSource = "profile URL saved; public profile details unavailable";
      }
    }

    const profileTerms = terms(profileContext);
    // Plain-text query only: no exact-phrase quotes, OR expressions or site: operators.
    const query = [
      industries.slice(0, 2).join(" "),
      countries.slice(0, 2).join(" "),
      titles.slice(0, 4).join(" "),
      keywords.slice(0, 4).join(" "),
      profileTerms.slice(0, 6).join(" "),
      "LinkedIn profile"
    ].filter(Boolean).join(" ").slice(0, 420);

    const data = await serperSearch(key, query, { gl, hl });
    const organic = Array.isArray(data.organic) ? data.organic : [];
    const seen = new Set<string>();
    const results = organic.map((item: any) => {
      const title = clean(item.title, 300) || "LinkedIn profile";
      const url = clean(item.link, 1000);
      const description = clean(item.snippet, 1000);
      const haystack = (title + " " + description).toLowerCase();
      const reasons: string[] = [];

      if (titles.some((value: string) => value && haystack.includes(value.toLowerCase()))) reasons.push("target role");
      if (industries.some((value: string) => value && haystack.includes(value.toLowerCase()))) reasons.push("target industry");
      if (keywords.some((value: string) => value && haystack.includes(value.toLowerCase()))) reasons.push("your keywords");
      if (profileTerms.some(term => haystack.includes(term))) reasons.push("profile interests");

      let matchScore = 0;
      if (reasons.includes("target role")) matchScore += 35;
      if (reasons.includes("target industry")) matchScore += 30;
      if (reasons.includes("your keywords")) matchScore += 20;
      if (reasons.includes("profile interests")) matchScore += 15;

      return { title, url, description, matchScore, matchReasons: reasons };
    }).filter((item: any) => {
      const normalized = canonicalProfile(item.url);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      const haystack = (item.title + " " + item.description).toLowerCase();
      return !excluded.some((word: string) => word && haystack.includes(word));
    }).sort((a: any, b: any) => b.matchScore - a.matchScore);

    return NextResponse.json({
      query,
      location: countries.join(", "),
      industries,
      results,
      source: "Publicly indexed LinkedIn personal profile pages via Google search",
      profileContextSource,
      count: results.length
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prospect search failed", error);
    const message = error instanceof Error ? error.message : "Could not complete search.";
    return NextResponse.json({
      error: message.includes("Search provider")
        ? message
        : "Could not complete search. Check database and search provider configuration."
    }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const params = request.nextUrl.searchParams;
  return runSearch(user.userId, params.get("niche"), params.get("location"));
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  return runSearch(user.userId, body.niche, body.location);
}
