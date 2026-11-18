import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer"
};

async function resolveTemporaryUser(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const sql = db();
  const hash = createHash("sha256").update(token).digest("hex");
  const rows: any = await sql`SELECT user_id FROM assistant_scoped_tokens WHERE token_hash=${hash} AND scope='context' AND expires_at>now() AND revoked_at IS NULL LIMIT 1`;
  return rows.length ? String(rows[0].user_id) : null;
}

export async function GET(request: NextRequest) {
  const accessToken = request.nextUrl.searchParams.get("access") || "";
  if (!accessToken) return NextResponse.json({ error: "Temporary Access Token is required. Authenticate with the permanent AI Auth Token to issue one." }, { status: 401, headers: noStore });

  try {
    const userId = await resolveTemporaryUser(accessToken);
    if (!userId) return NextResponse.json({ error: "Temporary Access Token is invalid or expired. Request a new one using the AI Auth Token." }, { status: 401, headers: noStore });

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

    const profileData = row.linkedin_profile_data && typeof row.linkedin_profile_data === "object"
      ? row.linkedin_profile_data : {};
    const fields = profileData.fields && typeof profileData.fields === "object"
      ? profileData.fields : {};
    const fieldSources = profileData.fieldSources && typeof profileData.fieldSources === "object"
      ? profileData.fieldSources : {};

    return NextResponse.json({
      ok: true,
      contextVersion: 1,
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
        profile: {
          fields,
          fieldSources,
          source: row.linkedin_profile_source || "not_verified",
          verifiedAt: row.linkedin_profile_verified_at || null
        }
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
