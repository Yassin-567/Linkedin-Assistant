import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return NextResponse.json({ error: "LinkedIn profile discovery needs a public search key. Add BRAVE_SEARCH_API_KEY in Vercel Environment Variables." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const niche = String(body.niche || "appliance repair").trim().slice(0, 100);
  const location = String(body.location || "United Kingdom").trim().slice(0, 80);
  if (!niche) return NextResponse.json({ error: "Enter an industry or business type to search for." }, { status: 400 });

  // Search only publicly indexed LinkedIn member-profile pages. This does not access LinkedIn's private search or member database.
  const query = `site:linkedin.com/in (owner OR founder OR "managing director" OR director) "${niche}" "${location}"`;
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("country", "GB");
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("count", "20");
  url.searchParams.set("safesearch", "moderate");

  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json", "X-Subscription-Token": key },
      cache: "no-store"
    });
    if (!response.ok) return NextResponse.json({ error: "Search provider returned HTTP " + response.status }, { status: 502 });
    const data = await response.json();
    const seen = new Set<string>();
    const results = (data.web?.results || [])
      .map((item: { title?: string; url?: string; description?: string }) => ({
        title: item.title || "LinkedIn profile",
        url: item.url || "",
        description: item.description || ""
      }))
      .filter((item: { url: string }) => {
        if (!/^https?:\/\/(www\.)?(uk\.)?linkedin\.com\/in\//i.test(item.url)) return false;
        const canonical = item.url.split("?")[0].replace(/\/$/, "").toLowerCase();
        if (seen.has(canonical)) return false;
        seen.add(canonical);
        return true;
      });

    return NextResponse.json({ query, results, source: "Publicly indexed LinkedIn profile pages" });
  } catch {
    return NextResponse.json({ error: "Could not reach the search provider. Please try again." }, { status: 502 });
  }
}
