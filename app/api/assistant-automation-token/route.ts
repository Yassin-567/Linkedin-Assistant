import { get, put } from "@vercel/blob";
import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type AutomationOwner = { personId?: string; updatedAt?: number };

export async function GET(request: NextRequest) {
  // This route is intended to be called through the protected Vercel deployment,
  // not directly from a public client. Keep deployment protection enabled.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypass) {
    return NextResponse.json(
      { error: "The temporary bridge is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const ownerFile = await get("assistant-config/automation-owner.json", {
      access: "private",
      useCache: false,
    });
    if (!ownerFile || ownerFile.statusCode !== 200 || !ownerFile.stream) {
      return NextResponse.json(
        { error: "Automation is not activated yet. Sign in to LinkedIn Assistant and generate one save token once; you do not need to share it." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const owner = JSON.parse(await new Response(ownerFile.stream).text()) as AutomationOwner;
    if (!owner.personId) {
      return NextResponse.json(
        { error: "The automation owner is not configured." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await put(
      "assistant-tokens/" + tokenHash + ".json",
      JSON.stringify({ personId: owner.personId, expiresAt, usedAt: null, usesRemaining: 50 }),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/json",
      }
    );

    const saveUrl = new URL("/api/assistant-save", request.url);
    saveUrl.searchParams.set("token", token);
    saveUrl.searchParams.set("x-vercel-protection-bypass", bypass);
    saveUrl.searchParams.set("x-vercel-set-bypass-cookie", "true");

    return NextResponse.json(
      { ok: true, token, expiresAt, usesRemaining: 50, saveUrl: saveUrl.toString() },
      { headers: { "Cache-Control": "no-store", "Pragma": "no-cache", "X-Robots-Tag": "noindex, nofollow" } }
    );
  } catch (error) {
    console.error("Assistant automation token creation failed:", error);
    return NextResponse.json(
      { error: "Could not create an automation save token." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
