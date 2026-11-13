import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function runSearch(nicheInput: unknown, locationInput: unknown) {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Search is not configured. Add SERPER_API_KEY to Vercel Environment Variables, then redeploy." },
      { status: 503 }
    );
  }

  const niche = String(nicheInput || "appliance repair").trim().slice(0, 80);
  const location = String(locationInput || "United Kingdom").trim().slice(0, 60);
  if (!niche || !location) {
    return NextResponse.json({ error: "Enter an industry and a location." }, { status: 400 });
  }

  // Plain industry + location only. Never add search operators or quoted phrases.
  const query = `${niche} ${location}`;

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "gb", hl: "en", num: 20 }),
      cache: "no-store"
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Serper search failed:", response.status, detail.slice(0, 500));
      return NextResponse.json(
        { error: response.status === 401 || response.status === 403
          ? "Serper rejected the API key. Check SERPER_API_KEY in Vercel."
          : response.status === 429
            ? "Serper search limit reached. Check your Serper account or try again later."
            : response.status === 400
              ? "Serper rejected the search. Try a shorter industry or location, without special characters."
              : `Serper search failed (HTTP ${response.status}). Please try again.` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const organic = Array.isArray(data.organic) ? data.organic : [];
    const seen = new Set<string>();
    const results = organic
      .map((item: { title?: string; link?: string; snippet?: string }) => ({
        title: item.title || "LinkedIn profile",
        url: item.link || "",
        description: item.snippet || ""
      }))
      .filter((item: { url: string }) => {
        try {
          const parsed = new URL(item.url);
          const host = parsed.hostname.toLowerCase();
          if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
              !(host === "linkedin.com" || host.endsWith(".linkedin.com")) ||
              !parsed.pathname.toLowerCase().startsWith("/in/")) return false;
          const canonical = `${host}${parsed.pathname}`.replace(/\/$/, "").toLowerCase();
          if (seen.has(canonical)) return false;
          seen.add(canonical);
          return true;
        } catch { return false; }
      });

    return NextResponse.json({
      query, results,
      source: "Publicly indexed LinkedIn personal profile pages via Google search",
      count: results.length
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not reach Serper:", error);
    return NextResponse.json({ error: "Could not reach Serper. Please try again." }, { status: 502 });
  }
}

// GET makes public search results available directly to API clients and assistants.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return runSearch(params.get("niche"), params.get("location"));
}

// POST remains available for the app's search interface.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return runSearch(body.niche, body.location);
}
