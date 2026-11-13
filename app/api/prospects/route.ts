import { get, put } from "@vercel/blob";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, openSession } from "@/lib/session";

export const runtime = "nodejs";

type Lead = {
  id: string;
  name: string;
  company: string;
  url: string;
  status: string;
  followUp: string;
  notes: string;
};

const allowedStatuses = new Set([
  "To research", "Ready to contact", "Contacted", "Replied",
  "Call booked", "Client", "Not a fit"
]);

async function currentPersonId() {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  const session = value ? openSession(value) : null;
  return session?.personId || null;
}

function normalizeLeads(value: unknown): Lead[] | null {
  if (!Array.isArray(value) || value.length > 1000) return null;
  const leads: Lead[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const x = item as Record<string, unknown>;
    const fields = ["id", "name", "company", "url", "status", "followUp", "notes"];
    if (fields.some((key) => typeof x[key] !== "string")) return null;
    if (String(x.id).length > 100 || String(x.name).length > 200 ||
        String(x.company).length > 300 || String(x.url).length > 2000 ||
        String(x.followUp).length > 30 || String(x.notes).length > 5000 ||
        !allowedStatuses.has(String(x.status))) return null;
    leads.push({
      id: String(x.id), name: String(x.name), company: String(x.company),
      url: String(x.url), status: String(x.status),
      followUp: String(x.followUp), notes: String(x.notes)
    });
  }
  return leads;
}

export async function GET() {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Connect your LinkedIn account to use cloud prospect storage." }, { status: 401 });
  }

  try {
    const pathname = `prospects/${encodeURIComponent(personId)}.json`;
    const file = await get(pathname, { access: "private", useCache: false });
    if (!file || file.statusCode !== 200 || !file.stream) {
      return NextResponse.json({ leads: [] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const raw = await new Response(file.stream).text();
    const parsed = JSON.parse(raw) as { leads?: unknown };
    const leads = normalizeLeads(parsed.leads);
    if (!leads) throw new Error("Stored prospect data has an invalid format.");
    return NextResponse.json({ leads }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Prospect storage read failed:", error);
    return NextResponse.json({ error: "Could not load saved prospects from private storage." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Connect your LinkedIn account to use cloud prospect storage." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const leads = normalizeLeads(body?.leads);
  if (!leads) {
    return NextResponse.json({ error: "Invalid prospect list. Check the fields and try again." }, { status: 400 });
  }

  try {
    const pathname = `prospects/${encodeURIComponent(personId)}.json`;
    await put(pathname, JSON.stringify({ leads, updatedAt: new Date().toISOString() }), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });
    return NextResponse.json({ ok: true, count: leads.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Prospect storage write failed:", error);
    return NextResponse.json({ error: "Could not save prospects to private storage." }, { status: 500 });
  }
}
