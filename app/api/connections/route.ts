import { get, list, put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, openSession } from "@/lib/session";

export const runtime = "nodejs";

type Connection = {
  id: string;
  name: string;
  url: string;
  email: string;
  company: string;
  position: string;
  connectedOn: string;
};

function isAssistantRequest(request: NextRequest) {
  const expected = process.env.ASSISTANT_API_KEY;
  const supplied = request.headers.get("authorization") || "";
  if (!expected || !supplied.startsWith("Bearer ")) return false;
  const a = Buffer.from(supplied.slice(7));
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

function normalizeConnections(value: unknown): Connection[] | null {
  if (!Array.isArray(value) || value.length > 100000) return null;
  const byUrl = new Map<string, Connection>();
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const x = item as Record<string, unknown>;
    const fields = ["id", "name", "url", "email", "company", "position", "connectedOn"];
    if (fields.some((key) => typeof x[key] !== "string")) return null;
    const url = String(x.url).trim();
    try {
      const parsed = new URL(url);
      if (!["linkedin.com", "www.linkedin.com"].includes(parsed.hostname.toLowerCase()) ||
          !parsed.pathname.toLowerCase().startsWith("/in/")) continue;
      const canonical = "https://www.linkedin.com" + parsed.pathname.replace(/\/$/, "").toLowerCase();
      byUrl.set(canonical, {
        id: canonical,
        name: String(x.name).slice(0, 300),
        url: canonical,
        email: String(x.email).slice(0, 500),
        company: String(x.company).slice(0, 500),
        position: String(x.position).slice(0, 500),
        connectedOn: String(x.connectedOn).slice(0, 100)
      });
    } catch { continue; }
  }
  return [...byUrl.values()];
}

async function readConnections(pathname: string): Promise<Connection[]> {
  try {
    const file = await get(pathname, { access: "private", useCache: false });
    if (!file || file.statusCode !== 200 || !file.stream) return [];
    const raw = await new Response(file.stream).text();
    const parsed = JSON.parse(raw) as { connections?: unknown };
    const connections = normalizeConnections(parsed.connections);
    if (!connections) throw new Error("Stored connection data has an invalid format.");
    return connections;
  } catch (error) {
    if (error instanceof Error && /not found|does not exist/i.test(error.message)) return [];
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const access = await getAccess(request);
  try {
    if (access.assistant) {
      const { blobs } = await list({ prefix: "connections/", limit: 1000 });
      const accounts = await Promise.all(blobs
        .filter((blob) => blob.pathname.endsWith(".json"))
        .map(async (blob) => ({
          personId: blob.pathname.slice("connections/".length, -".json".length),
          connections: await readConnections(blob.pathname)
        })));
      return NextResponse.json({
        accounts,
        connections: accounts.flatMap((account) => account.connections),
        count: accounts.reduce((sum, account) => sum + account.connections.length, 0)
      }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!access.personId) {
      return NextResponse.json({ error: "Connect your LinkedIn account first." }, { status: 401 });
    }
    const connections = await readConnections(`connections/${encodeURIComponent(access.personId)}.json`);
    return NextResponse.json({ connections, count: connections.length }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    console.error("Connection list read failed:", error);
    return NextResponse.json({ error: "Could not load your imported connections." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const access = await getAccess(request);
  if (!access.assistant && !access.personId) {
    return NextResponse.json({ error: "Connect your LinkedIn account first." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const connections = normalizeConnections(body?.connections);
  if (!connections) {
    return NextResponse.json({ error: "Invalid connections list. Upload the LinkedIn Connections CSV." }, { status: 400 });
  }
  const personId = access.assistant ? body?.personId : access.personId;
  if (typeof personId !== "string" || !/^[A-Za-z0-9._-]{1,200}$/.test(personId)) {
    return NextResponse.json({ error: "A valid personId is required." }, { status: 400 });
  }
  try {
    const pathname = `connections/${encodeURIComponent(personId)}.json`;
    await put(pathname, JSON.stringify({
      connections,
      count: connections.length,
      importedAt: new Date().toISOString()
    }), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });
    return NextResponse.json({ ok: true, count: connections.length, importedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Connection list save failed:", error);
    return NextResponse.json({ error: "Could not save your connections to private storage." }, { status: 500 });
  }
}
