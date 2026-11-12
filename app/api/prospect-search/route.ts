import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Search is not configured yet. Add SERPER_API_KEY to the Vercel project's Environment Variables, then redeploy." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const niche = String(body.niche || "appliance repair").trim().slice(0, 100);
  const location = String(body.location || "United Kingdom").trim().slice(0, 80);

  if (!niche) {
    return NextResponse.json({ error: "Enter an industry or business type to search for." }, { status: 400 });
  }

  // Avoid advanced Google operators: Serper free accounts may reject operator-based query patterns.
  // Results are filtered to publicly indexed LinkedIn personal profiles below.
  const query = `LinkedIn owner founder "managing director" director ${niche} ${location}`;

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json"
      },
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
              ? "Serper rejected this search query. Try a simpler industry or location."
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
              !parsed.pathname.toLowerCase().startsWith("/in/")) {
            return false;
          }
          const canonical = `${host}${parsed.pathname}`.replace(/\/$/, "").toLowerCase();
          if (seen.has(canonical)) return false;
          seen.add(canonical);
          return true;
        } catch {
          return false;
        }
      });

    return NextResponse.json({
      query,
      results,
      source: "Publicly indexed LinkedIn profile pages via Google search"
    });
  } catch (error) {
    console.error("Could not reach Serper:", error);
    return NextResponse.json(
      { error: "Could not reach Serper. Please try again." },
      { status: 502 }
    );
  }
}
