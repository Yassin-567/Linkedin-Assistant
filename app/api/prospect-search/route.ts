import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return NextResponse.json({ error: "Search is not configured yet. Add BRAVE_SEARCH_API_KEY in Vercel Environment Variables." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const niche = String(body.niche || "appliance repair companies").trim().slice(0, 100);
  const location = String(body.location || "United Kingdom").trim().slice(0, 80);
  if (!niche) return NextResponse.json({ error: "Enter a business type to search for." }, { status: 400 });
  const query = niche + " companies businesses " + location + " UK";
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("country", "GB");
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("count", "20");
  url.searchParams.set("safesearch", "moderate");
  try {
    const response = await fetch(url, { headers: { "Accept": "application/json", "X-Subscription-Token": key }, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "Search provider returned HTTP " + response.status }, { status: 502 });
    const data = await response.json();
    const results = (data.web?.results || []).map((item: { title?: string; url?: string; description?: string }) => ({
      title: item.title || "Untitled result", url: item.url || "", description: item.description || ""
    })).filter((item: { url: string }) => item.url.startsWith("http"));
    return NextResponse.json({ query, results });
  } catch {
    return NextResponse.json({ error: "Could not reach the search provider. Please try again." }, { status: 502 });
  }
}
