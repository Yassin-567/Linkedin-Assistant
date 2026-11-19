import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/assistant-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer"
};

// One long-lived Access Token per Inlinked account.
// It is stored as a SHA-256 hash and works directly with Context and Save.
// Regenerating or revoking it invalidates the previous token immediately.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });

  try {
    const sql = db();
    const rows: any = await sql`
      SELECT created_at
      FROM ai_access_tokens
      WHERE user_id = ${user.userId} AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return NextResponse.json({
      enabled: rows.length > 0,
      createdAt: rows[0]?.created_at || null
    }, { headers: noStore });
  } catch (error) {
    console.error("Access Token status failed", error);
    return NextResponse.json({ error: "Could not check the Access Token. Check the database schema." }, { status: 503, headers: noStore });
  }
}

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });

  try {
    const sql = db();

    // Invalidate previous long-lived tokens and any older 10-minute session tokens.
    await sql`UPDATE ai_access_tokens SET revoked_at = now() WHERE user_id = ${user.userId} AND revoked_at IS NULL`;
    await sql`UPDATE assistant_scoped_tokens SET revoked_at = now() WHERE user_id = ${user.userId} AND revoked_at IS NULL`;

    const accessToken = randomBytes(32).toString("base64url");
    const rows: any = await sql`
      INSERT INTO ai_access_tokens(token_hash, user_id)
      VALUES (${hashToken(accessToken)}, ${user.userId})
      RETURNING created_at
    `;

    const base = process.env.APP_URL || new URL("https://inlinked.vercel.app");
    return NextResponse.json({
      accessToken,
      createdAt: rows[0]?.created_at || new Date().toISOString(),
      origin: new URL(base).origin,
      expiresAt: null,
      message: "Your Access Token does not expire automatically. It works directly with the Context and Save endpoints until you revoke or regenerate it. Keep it private; it is shown only once."
    }, { headers: noStore });
  } catch (error) {
    console.error("Access Token generation failed", error);
    return NextResponse.json({ error: "Could not generate the Access Token." }, { status: 503, headers: noStore });
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });

  try {
    const sql = db();
    await sql`UPDATE ai_access_tokens SET revoked_at = now() WHERE user_id = ${user.userId} AND revoked_at IS NULL`;
    await sql`UPDATE assistant_scoped_tokens SET revoked_at = now() WHERE user_id = ${user.userId} AND revoked_at IS NULL`;
    return NextResponse.json({ ok: true, enabled: false }, { headers: noStore });
  } catch (error) {
    console.error("Access Token revocation failed", error);
    return NextResponse.json({ error: "Could not revoke the Access Token." }, { status: 503, headers: noStore });
  }
}
