import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAssistantAuth } from "@/lib/assistant-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAssistantAuth(request);
    if (!auth) return fail("AI Access Token is missing, invalid or revoked.", 401);
    const profileId = request.nextUrl.searchParams.get("profileId") || "";
    if (!validId(profileId)) return fail("A valid Lead Profile ID is required.", 400);
    const sql = db();
    const profiles: any = await sql`
      SELECT id::text, name, description, preferences, is_active AS "isActive"
      FROM lead_profiles WHERE id = ${profileId}::uuid AND user_id = ${auth.userId} LIMIT 1
    `;
    if (!profiles.length) return fail("Lead Profile not found in this Inlinked account.", 404);
    const existing: any = await sql`
      SELECT id::text, title, company, status, website, source_url AS "sourceUrl", normalized_source_url AS "normalizedSourceUrl"
      FROM business_leads WHERE user_id = ${auth.userId} ORDER BY created_at DESC LIMIT 5000
    `;
    const profile = profiles[0];
    return NextResponse.json({
      ok: true,
      contextVersion: 1,
      scope: "commercial_leads",
      retrievedAt: new Date().toISOString(),
      instructions: {
        useThisLeadProfileAsTheResearchBrief: true,
        preservePreferencesUnlessTheUserOverridesThem: true,
        selectedProfileOnlyForSaving: true,
        useChatGptNativeWebSearchForDiscovery: true,
        doNotUseSerperOrPaidSearchApis: true,
        distinguishDirectDemandFromInferredSignals: true,
        doNotInventContactsBudgetsOrBusinessFacts: true
      },
      profile: {
        id: String(profile.id),
        name: profile.name,
        description: profile.description || "",
        preferences: profile.preferences && typeof profile.preferences === "object" ? profile.preferences : {},
        isActive: Boolean(profile.isActive)
      },
      exclusions: {
        savedLeadCount: existing.length,
        savedLeadRecords: existing.slice(0, 500).map((row: any) => ({ id: row.id, title: row.title, company: row.company, status: row.status, sourceUrl: row.normalizedSourceUrl || row.sourceUrl })),
        savedSourceUrls: existing.map((row: any) => row.normalizedSourceUrl || row.sourceUrl).filter(Boolean),
        savedCompanies: [...new Set(existing.map((row: any) => String(row.company || "").trim()).filter(Boolean))],
        savedWebsites: [...new Set(existing.map((row: any) => String(row.website || "").trim()).filter(Boolean))]
      }
    }, { headers });
  } catch (error) {
    console.error("Assistant commercial lead context failed", error);
    return fail("Could not retrieve this Lead Profile context.", 503);
  }
}
export function OPTIONS() { return new Response(null, { status: 204, headers }); }
