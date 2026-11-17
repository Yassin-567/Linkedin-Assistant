import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "no-referrer" };

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  try {
    const sql = db();
    const rows: any = await sql`SELECT created_at FROM ai_access_tokens WHERE user_id=${user.userId} AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`;
    return NextResponse.json({ enabled: rows.length > 0, createdAt: rows[0]?.created_at || null }, { headers: noStore });
  } catch (error) {
    console.error("AI access status failed", error);
    return NextResponse.json({ error: "AI access is not initialized. Apply the latest database schema." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  try {
    const sql = db();
    await sql`UPDATE ai_access_tokens SET revoked_at=now() WHERE user_id=${user.userId} AND revoked_at IS NULL`;
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    await sql`INSERT INTO ai_access_tokens(token_hash,user_id) VALUES(${hash},${user.userId})`;
    const base = process.env.APP_URL || new URL(request.url).origin;
    const endpoint = new URL("/api/assistant-save", base);
    endpoint.searchParams.set("ai", token);
    const contextEndpoint = new URL("/api/assistant-context", base);
    contextEndpoint.searchParams.set("ai", token);
    return NextResponse.json({
      token,
      endpoint: endpoint.toString(),
      contextEndpoint: contextEndpoint.toString(),
      message: "Copy this token now. It is shown only once. Regenerating it revokes the previous token."
    }, { headers: noStore });
  } catch (error) {
    console.error("AI access token generation failed", error);
    return NextResponse.json({ error: "Could not generate the AI Access Token. Check the database schema." }, { status: 503, headers: noStore });
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  try {
    const sql = db();
    await sql`UPDATE ai_access_tokens SET revoked_at=now() WHERE user_id=${user.userId} AND revoked_at IS NULL`;
    return NextResponse.json({ ok: true, enabled: false }, { headers: noStore });
  } catch (error) {
    console.error("AI access token revocation failed", error);
    return NextResponse.json({ error: "Could not revoke the AI Access Token." }, { status: 503, headers: noStore });
  }
}
