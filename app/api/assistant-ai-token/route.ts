import { get, put } from "@vercel/blob";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, openSession } from "@/lib/session";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

type TokenRecord = { personId: string; createdAt: number; revokedAt?: number | null };
type TokenConfig = { tokenHash?: string; createdAt?: number; updatedAt?: number };

async function currentPersonId() {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  const session = value ? openSession(value) : null;
  return session?.personId || null;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const file = await get(path, { access: "private", useCache: false });
    if (!file || file.statusCode !== 200 || !file.stream) return null;
    return JSON.parse(await new Response(file.stream).text()) as T;
  } catch (error) {
    if (error instanceof Error && /not found|does not exist/i.test(error.message)) return null;
    throw error;
  }
}

export async function GET() {
  const personId = await currentPersonId();
  if (!personId) return NextResponse.json({ error: "Sign in to LinkedIn Assistant first." }, { status: 401, headers: noStore });
  try {
    const config = await readJson<TokenConfig>("assistant-ai-config/" + encodeURIComponent(personId) + ".json");
    return NextResponse.json({ enabled: !!config?.tokenHash, createdAt: config?.createdAt || null }, { headers: noStore });
  } catch (error) {
    console.error("AI token status failed:", error);
    return NextResponse.json({ error: "Could not check AI access status." }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) return NextResponse.json({ error: "Sign in to LinkedIn Assistant first." }, { status: 401, headers: noStore });
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypass) return NextResponse.json({ error: "The app's Vercel access bypass is not configured." }, { status: 503, headers: noStore });

  try {
    const configPath = "assistant-ai-config/" + encodeURIComponent(personId) + ".json";
    const previous = await readJson<TokenConfig>(configPath);
    if (previous?.tokenHash) {
      const oldPath = "assistant-ai-tokens/" + previous.tokenHash + ".json";
      const oldRecord = await readJson<TokenRecord>(oldPath);
      if (oldRecord) {
        await put(oldPath, JSON.stringify({ ...oldRecord, revokedAt: Date.now() }), {
          access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json"
        });
      }
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const createdAt = Date.now();
    await put("assistant-ai-tokens/" + tokenHash + ".json", JSON.stringify({ personId, createdAt, revokedAt: null } satisfies TokenRecord), {
      access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "application/json"
    });
    await put(configPath, JSON.stringify({ tokenHash, createdAt, updatedAt: createdAt } satisfies TokenConfig), {
      access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json"
    });

    const endpoint = new URL("/api/assistant-save", request.url);
    endpoint.searchParams.set("ai", token);
    endpoint.searchParams.set("x-vercel-protection-bypass", bypass);
    endpoint.searchParams.set("x-vercel-set-bypass-cookie", "true");
    return NextResponse.json({
      token,
      endpoint: endpoint.toString(),
      createdAt,
      message: "Copy this token now. It is shown only once. Generating another token revokes this one."
    }, { headers: noStore });
  } catch (error) {
    console.error("AI token generation failed:", error);
    return NextResponse.json({ error: "Could not generate the AI access token." }, { status: 500, headers: noStore });
  }
}

export async function DELETE() {
  const personId = await currentPersonId();
  if (!personId) return NextResponse.json({ error: "Sign in to LinkedIn Assistant first." }, { status: 401, headers: noStore });
  try {
    const configPath = "assistant-ai-config/" + encodeURIComponent(personId) + ".json";
    const config = await readJson<TokenConfig>(configPath);
    if (config?.tokenHash) {
      const tokenPath = "assistant-ai-tokens/" + config.tokenHash + ".json";
      const record = await readJson<TokenRecord>(tokenPath);
      if (record) {
        await put(tokenPath, JSON.stringify({ ...record, revokedAt: Date.now() }), {
          access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json"
        });
      }
    }
    await put(configPath, JSON.stringify({ updatedAt: Date.now() } satisfies TokenConfig), {
      access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json"
    });
    return NextResponse.json({ ok: true, enabled: false }, { headers: noStore });
  } catch (error) {
    console.error("AI token revocation failed:", error);
    return NextResponse.json({ error: "Could not revoke the AI access token." }, { status: 500, headers: noStore });
  }
}
