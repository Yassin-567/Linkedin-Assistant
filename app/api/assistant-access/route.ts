import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/assistant-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "Referrer-Policy": "no-referrer" };

// Signed-in users get a 10-minute access token directly from the app (no permanent token needed).
// It works as Authorization: Bearer <token> for /api/assistant-context and /api/assistant-save.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  try {
    const sql = db();
    const accessToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await sql`INSERT INTO assistant_scoped_tokens(token_hash,user_id,scope,expires_at) VALUES (${hashToken(accessToken)},${user.userId},'context',${expiresAt})`;
    const base = process.env.APP_URL || new URL(request.url).origin;
    return NextResponse.json({
      accessToken,
      expiresAt,
      expiresInSeconds: 600,
      origin: new URL(base).origin
    }, { headers: noStore });
  } catch (error) {
    console.error("Access token issuance failed", error);
    return NextResponse.json({ error: "Could not create an access token. Check the assistant_scoped_tokens database migration." }, { status: 503, headers: noStore });
  }
}
