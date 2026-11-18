import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAssistantAuth } from "@/lib/assistant-auth";

export const runtime = "nodejs";
const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400"
};

export async function GET(request: NextRequest) {
  try {
    const userId = (await resolveAssistantAuth(request))?.userId;
    if (!userId) return NextResponse.json({ error: "AI token is missing, invalid, expired or revoked. Send it as Authorization: Bearer <token>." }, { status: 401, headers: noStore });

    const sql = db();
    const rows: any = await sql`
      SELECT
        p.linkedin_profile_url,
        p.countries,
        p.industries,
        p.keywords,
        p.job_titles,
        p.excluded_keywords,
        p.language,
        u.profile_summary,
        u.linkedin_profile_data,
        u.linkedin_profile_source,
        u.linkedin_profile_verified_at
      FROM user_preferences p
      LEFT JOIN app_users u ON u.id = p.user_id
      WHERE p.user_id = ${userId}
      LIMIT 1
    `;
    const row = rows[0] as any;
    if (!row) {
      return NextResponse.json({ error: "Search preferences have not been created for this account yet." }, { status: 404, headers: noStore });
    }

    const [connectionRows, savedProspectRows, connectionMeta]: any = await Promise.all([
      sql`SELECT normalized_linkedin_url AS url FROM linkedin_connections WHERE user_id = ${userId} ORDER BY imported_at DESC LIMIT 20000`,
      sql`SELECT normalized_linkedin_url AS url FROM prospects WHERE user_id = ${userId} AND normalized_linkedin_url IS NOT NULL AND normalized_linkedin_url <> '' ORDER BY created_at DESC LIMIT 1000`,
      sql`SELECT max(imported_at) AS imported_at, count(*)::int AS count FROM linkedin_connections WHERE user_id = ${userId}`
    ]);

    const profileData = row.linkedin_profile_data && typeof row.linkedin_profile_data === "object" ? row.linkedin_profile_data : {};
    const fields = profileData.fields && typeof profileData.fields === "object" ? profileData.fields : {};
    const fieldSources = profileData.fieldSources && typeof profileData.fieldSources === "object" ? profileData.fieldSources : {};

    return NextResponse.json({
      ok: true,
      contextVersion: 2,
      retrievedAt: new Date().toISOString(),
      instructions: {
        useAsDefaultSearchContext: true,
        preserveUserPreferencesUnlessTheUserOverridesThem: true,
        treatProfileFieldsAsContextNotAsClaimsAboutTheProspect: true,
        distinguishUserProvidedDetailsFromPubliclyIndexedDetails: true,
        doNotInventMissingProfileInformation: true
      },
      owner: {
        linkedinProfileUrl: row.linkedin_profile_url || "",
        profileSummary: row.profile_summary || "",
        profile: { fields, fieldSources, source: row.linkedin_profile_source || "not_verified", verifiedAt: row.linkedin_profile_verified_at || null }
      },
      searchPreferences: {
        countries: row.countries || [],
        industries: row.industries || [],
        keywords: row.keywords || [],
        jobTitles: row.job_titles || [],
        excludedKeywords: row.excluded_keywords || [],
        language: row.language || "English"
      },
      exclusions: {
        uploadedConnectionsCount: Number(connectionMeta[0]?.count || 0),
        uploadedConnectionsImportedAt: connectionMeta[0]?.imported_at || null,
        uploadedConnectionProfileUrls: connectionRows.map((x: any) => x.url),
        savedProspectProfileUrls: savedProspectRows.map((x: any) => x.url)
      }
    }, { headers: noStore });
  } catch (error) {
    console.error("Assistant context retrieval failed", error);
    return NextResponse.json({ error: "Could not retrieve this account's AI search context." }, { status: 503, headers: noStore });
  }
}

// CORS preflight for browser-based HTTP tools. Access still requires a valid Bearer token.
export function OPTIONS() { return new Response(null, { status: 204, headers: noStore }); }
