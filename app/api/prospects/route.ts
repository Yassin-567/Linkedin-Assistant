import { get, list, put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
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

function isAssistantRequest(request: NextRequest) {
  const expected = process.env.ASSISTANT_API_KEY;
  const supplied = request.headers.get("authorization") || "";
  if (!expected || !supplied.startsWith("Bearer ")) return false;
  const actual = supplied.slice(7);
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getAccess(request: NextRequest) {
  if (isAssistantRequest(request)) return { assistant: true, personId: null as string | null };
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  const session = value ? openSession(value) : null;
  return { assistant: false, personId: session?.personId || null };
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

function validPersonId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(value);
}

async function readLeads(pathname: string): Promise<Lead[]> {
  const file = await get(pathname, { access: "private", useCache: false });
  if (!file || file.statusCode !== 200 || !file.stream) return [];
  const raw = await new Response(file.stream).text();
  const parsed = JSON.parse(raw) as { leads?: unknown };
  const leads = normalizeLeads(parsed.leads);
  if (!leads) throw new Error("Stored prospect data has an invalid format.");
  return leads;
}

export async function GET(request: NextRequest) {
  const access = await getAccess(request);
  if (access.assistant) {
    try {
      const { blobs } = await list({ prefix: "prospects/", limit: 1000 });
      const accounts = await Promise.all(blobs
        .filter((blob) => blob.pathname.endsWith(".json"))
        .map(async (blob) => ({
          personId: blob.pathname.slice("prospects/".length, -".json".length),
          leads: await readLeads(blob.pathname)
        })));
      return NextResponse.json({
        accounts,
        leads: accounts.flatMap((account) => account.leads),
        count: accounts.reduce((sum, account) => sum + account.leads.length, 0)
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("Assistant prospect read failed:", error);
      return NextResponse.json({ error: "Could not read saved prospects." }, { status: 500 });
    }
  }

  if (!access.personId) {
    return NextResponse.json({ error: "Connect your LinkedIn account to use cloud prospect storage." }, { status: 401 });
  }
  try {
    const leads = await readLeads(`prospects/${encodeURIComponent(access.personId)}.json`);
    return NextResponse.json({ leads }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Prospect storage read failed:", error);
    return NextResponse.json({ error: "Could not load saved prospects from private storage." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const access = await getAccess(request);
  if (!access.assistant && !access.personId) {
    return NextResponse.json({ error: "Connect your LinkedIn account to use cloud prospect storage." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const leads = normalizeLeads(body?.leads);
  if (!leads) {
    return NextResponse.json({ error: "Invalid prospect list. Check the fields and try again." }, { status: 400 });
  }

  const personId = access.assistant ? body?.personId : access.personId;
  if (!validPersonId(personId)) {
    return NextResponse.json({ error: "A valid personId is required for assistant updates." }, { status: 400 });
  }

  try {
    const pathname = `prospects/${encodeURIComponent(personId)}.json`;
    await put(pathname, JSON.stringify({ leads, updatedAt: new Date().toISOString() }), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });
    return NextResponse.json({ ok: true, count: leads.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prospect storage write failed:", error);
    return NextResponse.json({ error: "Could not save prospects to private storage." }, { status: 500 });
  }
}
