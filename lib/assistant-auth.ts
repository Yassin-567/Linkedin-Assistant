import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

// All AI context/save/update routes accept short-lived session credentials only.
// The permanent AI credential is accepted exclusively by /api/assistant-prompt.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{40,60}$/;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// The permanent token is still validated by its one-way hash. This encrypted copy
// exists only so the signed-in account owner can recover the same token on another browser.
// Domain separation prevents reuse of the app-session encryption key for this purpose.
function permanentTokenEncryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters to protect the permanent AI token.");
  }
  return createHash("sha256")
    .update(secret)
    .update("\\0inlinked:permanent-ai-token:v1")
    .digest();
}

export function encryptPermanentToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", permanentTokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decryptPermanentToken(value: string): string | null {
  try {
    const packed = Buffer.from(value, "base64url");
    if (packed.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", permanentTokenEncryptionKey(), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const token = Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
    return /^[A-Za-z0-9_-]{40,60}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export type AssistantAuth = {
  userId: string;
  kind: "session";
  workflow: "connections" | "jobs" | "leads" | "record_update";
  searchMode: string;
  expiresAt: string;
};

/** Reads temporary session credentials only from the Authorization: Bearer header. */
export function readAssistantToken(request: NextRequest) {
  const bearer = (request.headers.get("authorization") || "").match(/^Bearer\s+([A-Za-z0-9_-]{40,60})$/i)?.[1];
  return bearer || "";
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
