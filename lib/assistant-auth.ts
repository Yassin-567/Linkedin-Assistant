import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

// All AI context/save/update routes accept short-lived session credentials only.
// The permanent AI credential is accepted exclusively by /api/assistant-prompt.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{40,60}$/;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type AssistantAuth = {
  userId: string;
  kind: "session";
  workflow: "connections" | "jobs" | "leads" | "record_update";
  searchMode: string;
  expiresAt: string;
};

/** Reads a temporary session token from Authorization: Bearer, then legacy token query names. */
export function readAssistantToken(request: NextRequest) {
  const bearer = (request.headers.get("authorization") || "").match(/^Bearer\s+([A-Za-z0-9_-]{40,60})$/i)?.[1];
  const query = request.nextUrl.searchParams;
  return bearer || query.get("access") || query.get("ai") || "";
}

export async function resolveAssistantAuth(request: NextRequest): Promise<AssistantAuth | null> {
  const token = readAssistantToken(request);
  if (!TOKEN_FORMAT.test(token)) return null;

  const sql = db();
  const hash = hashToken(token);
  const rows: any = await sql`
    SELECT user_id, workflow, search_mode, expires_at
    FROM assistant_session_tokens
    WHERE token_hash = ${hash}
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `;
  if (!rows.length) return null;

  await sql`UPDATE assistant_session_tokens SET last_used_at = now() WHERE token_hash = ${hash}`;
  return {
    userId: String(rows[0].user_id),
    kind: "session",
    workflow: rows[0].workflow,
    searchMode: rows[0].search_mode || "standard",
    expiresAt: new Date(rows[0].expires_at).toISOString()
  };
}
