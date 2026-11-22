import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { decryptPermanentToken, encryptPermanentToken, hashToken } from "@/lib/assistant-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer"
};

// One long-lived permanent AI credential per Inlinked account.
// It is stored as a SHA-256 hash and is accepted only by the prompt bootstrap endpoint.
// The gateway exchanges it for 15-minute sessions used by Context, Save and Update.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });

  try {
    const sql = db();
    const rows: any = await sql`
      SELECT created_at, token_encrypted
      FROM ai_access_tokens
      WHERE user_id = ${user.userId} AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return NextResponse.json({
      enabled: rows.length > 0,
      createdAt: rows[0]?.created_at || null,
      accessToken: rows[0]?.token_encrypted ? decryptPermanentToken(String(rows[0].token_encrypted)) : null,
      vercelShareToken: process.env.INLINKLED_VERCEL_SHARE_TOKEN || ""
    }, { headers: noStore });
  } catch (error) {
    console.error("Access Token status failed", error);
    return NextResponse.json({ error: "Could not check the Access Token. Check the database schema." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });

  try {
    const sql = db();
    const accessToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(accessToken);
    const encryptedToken = encryptPermanentToken(accessToken);

    // Rotate the token atomically: revoke previous tokens and issue the new one
    // in one database statement, so a failed insert cannot leave the account disconnected.
    const rows: any = await sql`
      WITH revoked_access AS (
        UPDATE ai_access_tokens
        SET revoked_at = now()
        WHERE user_id = ${user.userId} AND revoked_at IS NULL
        RETURNING token_hash
      ),
      revoked_sessions AS (
        UPDATE assistant_scoped_tokens
        SET revoked_at = now()
        WHERE user_id = ${user.userId} AND revoked_at IS NULL
        RETURNING token_hash
      ),
      revoked_prompt_sessions AS (
        UPDATE assistant_session_tokens
        SET revoked_at = now()
        WHERE user_id = ${user.userId} AND revoked_at IS NULL
        RETURNING token_hash
      ),
      issued AS (
        INSERT INTO ai_access_tokens(token_hash, user_id, token_encrypted)
        VALUES (${tokenHash}, ${user.userId}, ${encryptedToken})
        RETURNING created_at
      )
      SELECT created_at FROM issued
    `;

    const base = process.env.APP_URL || new URL(request.url).origin;
    return NextResponse.json({
      accessToken,
      createdAt: rows[0]?.created_at || new Date().toISOString(),
      origin: new URL(base).origin,
      vercelShareToken: process.env.INLINKLED_VERCEL_SHARE_TOKEN || "",
      expiresAt: null,
      message: "Your permanent AI token is used only to open prompt links. The prompt gateway issues 15-minute session tokens for Context, Save and Update. Keep it private; it is shown only once."
    }, { headers: noStore });
  } catch (error) {
    console.error("Access Token generation failed", error);
    return NextResponse.json({ error: "Could not generate the Access Token." }, { status: 503, headers: noStore });
  }
}

// Backfill an existing browser-held token into encrypted account storage without
// rotating it. The token must match the currently active database hash.
export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });

  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(accessToken)) {
      return NextResponse.json({ error: "A valid permanent AI token is required." }, { status: 400, headers: noStore });
    }

    const sql = db();
    const encryptedToken = encryptPermanentToken(accessToken);
    const rows: any = await sql`
      UPDATE ai_access_tokens
      SET token_encrypted = ${encryptedToken}
      WHERE user_id = ${user.userId}
        AND token_hash = ${hashToken(accessToken)}
        AND revoked_at IS NULL
      RETURNING created_at
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "This token does not match the active token on your account. Nothing was changed." }, { status: 409, headers: noStore });
    }

    return NextResponse.json({ ok: true, createdAt: rows[0].created_at }, { headers: noStore });
  } catch (error) {
    console.error("Permanent AI token recovery save failed", error);
    return NextResponse.json({ error: "Could not securely save the token for browser recovery." }, { status: 503, headers: noStore });
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });

  try {
    const sql = db();
    await sql`UPDATE ai_access_tokens SET revoked_at = now() WHERE user_id = ${user.userId} AND revoked_at IS NULL`;
    await sql`UPDATE assistant_scoped_tokens SET revoked_at = now() WHERE user_id = ${user.userId} AND revoked_at IS NULL`;
    await sql`UPDATE assistant_session_tokens SET revoked_at = now() WHERE user_id = ${user.userId} AND revoked_at IS NULL`;
    return NextResponse.json({ ok: true, enabled: false }, { headers: noStore });
  } catch (error) {
    console.error("Access Token revocation failed", error);
    return NextResponse.json({ error: "Could not revoke the Access Token." }, { status: 503, headers: noStore });
  }
}
