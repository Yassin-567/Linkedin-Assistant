import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

// Two kinds of ChatGPT credentials exist for each Inlinked account:
//  - permanent AI Auth Token (table ai_access_tokens): revocable, long-lived
//  - temporary access token (table assistant_scoped_tokens): valid for 10 minutes
// Context and Save accept either one. Only the credentials endpoint requires the permanent token.

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{40,60}$/;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type AssistantAuth = { userId: string; kind: "permanent" | "access" };

/** Reads the token from `Authorization: Bearer` (preferred), then `?access=` or `?ai=`. */
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
  const permanent: any = await sql`SELECT user_id FROM ai_access_tokens WHERE token_hash=${hash} AND revoked_at IS NULL LIMIT 1`;
  if (permanent.length) return { userId: String(permanent[0].user_id), kind: "permanent" };
  const temporary: any = await sql`SELECT user_id FROM assistant_scoped_tokens WHERE token_hash=${hash} AND scope='context' AND expires_at>now() AND revoked_at IS NULL LIMIT 1`;
  if (temporary.length) return { userId: String(temporary[0].user_id), kind: "access" };
  return null;
}
