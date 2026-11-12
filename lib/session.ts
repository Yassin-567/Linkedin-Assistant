import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type LinkedInSession = {
  accessToken: string;
  personId: string;
  name?: string;
  email?: string;
  picture?: string;
  expiresAt: number;
};

const COOKIE_NAME = "linkedin_session";

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random value of at least 32 characters.");
  }
  return createHash("sha256").update(secret).digest();
}

export function sealSession(session: LinkedInSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function openSession(value: string): LinkedInSession | null {
  try {
    const packed = Buffer.from(value, "base64url");
    if (packed.length < 29) return null;
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const raw = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const session = JSON.parse(raw) as LinkedInSession;
    if (!session.accessToken || !session.personId || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
