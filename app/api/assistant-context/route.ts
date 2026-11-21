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

    if (request.nextUrl.searchParams.get("scope") === "jobs") {
      const sql = db();
      await sql`INSERT INTO job_search_preferences(user_id) VALUES(${userId}) ON CONFLICT(user_id) DO NOTHING`;
      const [preferenceRows, savedJobRows]: any = await Promise.all([
        sql`SELECT target_roles, keywords, countries, locations, work_modes, employment_types,
          seniority_levels, excluded_keywords, salary_currency, minimum_salary, language,
          include_linkedin, include_social_media, include_company_sites, include_job_boards, target_count
          FROM job_search_preferences WHERE user_id = ${userId} LIMIT 1`,
        sql`SELECT id::text, title, company, status, normalized_source_url AS url FROM jobs WHERE user_id = ${userId}
          ORDER BY created_at DESC LIMIT 5000`
      ]);
      const p = preferenceRows[0] || {};
      return NextResponse.json({
        ok: true,
        contextVersion: 1,
        scope: "jobs",
        retrievedAt: new Date().toISOString(),
        instructions: {
          useAsDefaultSearchContext: true,
          preserveUserPreferencesUnlessTheUserOverridesThem: true,
          discoverJobsAcrossThePublicWeb: true,
          nativeChatGptWebSearchIsPrimary: true,
          firecrawlIsOptional: true,
          doNotInventMissingJobDetails: true
        },
        jobSearchPreferences: {
          targetRoles: p.target_roles || [],
          keywords: p.keywords || [],
          countries: p.countries || [],
          locations: p.locations || [],
          workModes: p.work_modes || ["remote", "hybrid", "on-site"],
          employmentTypes: p.employment_types || [],
          seniorityLevels: p.seniority_levels || [],
          excludedKeywords: p.excluded_keywords || [],
          salaryCurrency: p.salary_currency || "",
          minimumSalary: p.minimum_salary === null || p.minimum_salary === undefined ? null : Number(p.minimum_salary),
          language: p.language || "English",
          includeLinkedIn: p.include_linkedin !== false,
          includeSocialMedia: p.include_social_media !== false,
          includeCompanySites: p.include_company_sites !== false,
          includeJobBoards: p.include_job_boards !== false,
          targetCount: Number(p.target_count || 30)
        },
        exclusions: { savedJobUrls: savedJobRows.map((x: any) => x.url) },
        savedJobRecords: savedJobRows.slice(0, 500).map((x: any) => ({ id: x.id, title: x.title, company: x.company, status: x.status, sourceUrl: x.url }))
      }, { headers: noStore });
    }

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
      sql`SELECT id::text, name, company, status, connected, connected_on AS "connectedOn", normalized_linkedin_url AS url FROM prospects WHERE user_id = ${userId} AND normalized_linkedin_url IS NOT NULL AND normalized_linkedin_url <> '' ORDER BY created_at DESC LIMIT 1000`,
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
        savedProspectProfileUrls: savedProspectRows.map((x: any) => x.url),
        savedProspectRecords: savedProspectRows.map((x: any) => ({ id: x.id, name: x.name, company: x.company, status: x.status, connected: Boolean(x.connected), connectedOn: x.connectedOn || "", linkedinUrl: x.url }))
      }
    }, { headers: noStore });
  } catch (error) {
    console.error("Assistant context retrieval failed", error);
    return NextResponse.json({ error: "Could not retrieve this account's AI search context." }, { status: 503, headers: noStore });
  }
}

// CORS preflight for browser-based HTTP tools. Access still requires a valid Bearer token.
export function OPTIONS() { return new Response(null, { status: 204, headers: noStore }); }
