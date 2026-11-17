import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer"
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  const authToken = request.nextUrl.searchParams.get("auth") || "";
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(authToken)) {
    return NextResponse.json({ error: "AI Auth Token is required." }, { status: 401, headers });
  }

  try {
    const sql = db();
    const owners: any = await sql`SELECT user_id FROM ai_access_tokens WHERE token_hash=${hashToken(authToken)} AND revoked_at IS NULL LIMIT 1`;
    if (!owners.length) {
      return NextResponse.json({ error: "AI Auth Token is invalid or revoked." }, { status: 401, headers });
    }

    const userId = String(owners[0].user_id);
    const contextToken = randomBytes(32).toString("base64url");
    const saveToken = randomBytes(32).toString("base64url");
    const contextHash = hashToken(contextToken);
    const saveHash = hashToken(saveToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await sql`INSERT INTO assistant_scoped_tokens(token_hash,user_id,scope,expires_at)
      VALUES (${contextHash},${userId},'context',${expiresAt}),(${saveHash},${userId},'save',${expiresAt})`;

    const base = process.env.APP_URL || new URL(request.url).origin;
    const contextEndpoint = new URL("/api/assistant-context", base);
    contextEndpoint.searchParams.set("ct", contextToken);
    const saveEndpoint = new URL("/api/assistant-save", base);
    saveEndpoint.searchParams.set("st", saveToken);

    return NextResponse.json({
      ok: true,
      contextEndpoint: contextEndpoint.toString(),
      saveEndpoint: saveEndpoint.toString(),
      expiresAt,
      permissions: { context: "read-only", save: "save-prospects-only" },
      message: "Scoped tokens expire after 24 hours. Authenticate again with the AI Auth Token to issue fresh tokens."
    }, { headers });
  } catch (error) {
    console.error("Scoped assistant credentials issue failed", error);
    return NextResponse.json({ error: "Could not issue scoped credentials. Apply db/assistant_scoped_tokens.sql first." }, { status: 503, headers });
  }
}
