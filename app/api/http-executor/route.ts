import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;
const TIMEOUT_MS = 20_000;
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function authorized(request: NextRequest) {
  const expected = process.env.HTTP_EXECUTOR_API_KEY || "";
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateTarget(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 4_096) {
    throw new Error("A valid target URL is required.");
  }

  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS destinations are allowed.");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing embedded credentials are not allowed.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Local and internal destinations are blocked.");
  }
  // Avoid direct requests to IP literals. Use a public hostname instead.
  if (isIP(host)) {
    throw new Error("IP-literal destinations are not allowed.");
  }
  return url;
}

function safeRequestHeaders(input: unknown): Headers {
  const result = new Headers();
  if (input == null) return result;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("headers must be a JSON object.");
  }

  for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "string") throw new Error(`Header "${name}" must have a string value.`);
    const key = name.toLowerCase();
    if (["host", "content-length", "connection", "transfer-encoding", "accept-encoding"].includes(key)) {
      continue;
    }
    result.set(name, value);
  }
  return result;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized. Configure HTTP_EXECUTOR_API_KEY and send it as a Bearer token." }, { status: 401 });
  }

  let input: any;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const target = validateTarget(input?.url);
    const method = String(input?.method || "GET").toUpperCase();
    if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(method)) {
      return NextResponse.json({ error: "Unsupported HTTP method." }, { status: 400 });
    }

    const headers = safeRequestHeaders(input?.headers);
    let body: string | undefined;
    if (input?.body !== undefined && input?.body !== null && method !== "GET" && method !== "HEAD") {
      body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "Request body exceeds the 1 MB limit." }, { status: 413 });
      }
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }

    const response = await fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    const responseBody = method === "HEAD" ? "" : await response.text();
    if (Buffer.byteLength(responseBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        setCookies: response.headers.getSetCookie?.() || [],
        error: "Response body exceeded the 1 MB limit and was not returned.",
      }, { status: 502 });
    }

    const responseHeaders: Record<string, string> = {};
    for (const name of ["content-type", "location", "www-authenticate", "retry-after"]) {
      const value = response.headers.get(name);
      if (value) responseHeaders[name] = value;
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: responseHeaders,
      setCookies: response.headers.getSetCookie?.() || [],
      body: responseBody,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "HTTP request failed.";
    const timeout = message.toLowerCase().includes("timeout");
    return NextResponse.json({ error: message }, { status: timeout ? 504 : 400 });
  }
}
