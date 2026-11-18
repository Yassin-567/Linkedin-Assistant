import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer"
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// GET is supported because some ChatGPT setups can only open URLs (no POST). It accepts the
// permanent token as Authorization: Bearer or the ?ai= query parameter; POST accepts the header only.
export async function GET(request: NextRequest) { return issue(request, true); }
export async function POST(request: NextRequest) { return issue(request, false); }

async function issue(request: NextRequest, allowQueryToken: boolean) {
  const authorization = request.headers.get("authorization") || "";
  const authToken = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{40,60})$/i)?.[1] || (allowQueryToken ? request.nextUrl.searchParams.get("ai") || "" : "");
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(authToken)) {
    return NextResponse.json({ error: "Send the permanent AI Auth Token in the Authorization: Bearer header" + (allowQueryToken ? " or the ai query parameter." : ".") }, { status: 401, headers });
  }

  try {
    const sql = db();
    const owners: any = await sql`SELECT user_id FROM ai_access_tokens WHERE token_hash=${hashToken(authToken)} AND revoked_at IS NULL LIMIT 1`;
    if (!owners.length) {
      return NextResponse.json({ error: "AI Auth Token is invalid or revoked." }, { status: 401, headers });
    }

    const userId = String(owners[0].user_id);
    const accessToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // The existing "context" scope is used as the single shared ChatGPT access grant.
    // Both the read-only context endpoint and the prospect-save endpoint validate this same hash.
    await sql`INSERT INTO assistant_scoped_tokens(token_hash,user_id,scope,expires_at)
      VALUES (${hashToken(accessToken)},${userId},'context',${expiresAt})`;

    const base = process.env.APP_URL || new URL(request.url).origin;
    const contextEndpoint = new URL("/api/assistant-context", base);
    contextEndpoint.searchParams.set("access", accessToken);
    const saveEndpoint = new URL("/api/assistant-save", base);
    saveEndpoint.searchParams.set("access", accessToken);

    return NextResponse.json({
      ok: true,
      accessToken,
      contextEndpoint: contextEndpoint.toString(),
      saveEndpoint: saveEndpoint.toString(),
      expiresAt,
      expiresInSeconds: 600,
      permissions: { context: "read-only", save: "save-prospects-only" },
      message: "One temporary access token works with both endpoints and expires after 10 minutes. Request another using the permanent AI Auth Token when it expires."
    }, { headers });
  } catch (error) {
    console.error("Temporary assistant access issuance failed", error);
    return NextResponse.json({ error: "Could not issue temporary access. Check the assistant_scoped_tokens database migration." }, { status: 503, headers });
  }
}
