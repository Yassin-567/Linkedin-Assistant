import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const APP_COOKIE_NAME = "assistant_app_session";
export type AppSession = { userId: string; email: string; name: string; picture?: string; expiresAt: number; sessionVersion?: number };

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}
export function sealAppSession(value: AppSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function openAppSession(value: string): AppSession | null {
  try {
    const packed = Buffer.from(value, "base64url");
    if (packed.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const raw = Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
    const session = JSON.parse(raw) as AppSession;
    if (!session.userId || !session.email || session.expiresAt <= Date.now()) return null;
    return session;
  } catch { return null; }
}
