import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const defaults = {
  targetRoles: [],
  keywords: [],
  countries: [],
  locations: [],
  workModes: ["remote", "hybrid", "on-site"],
  employmentTypes: [],
  seniorityLevels: [],
  excludedKeywords: [],
  salaryCurrency: "",
  minimumSalary: null as number | null,
  language: "English",
  includeLinkedIn: true,
  includeSocialMedia: true,
  includeCompanySites: true,
  includeJobBoards: true,
  targetCount: 30
};

function cleanList(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  if (!value.every(item => typeof item === "string" && item.trim().length > 0 && item.length <= 180)) return null;
  return Array.from(new Set(value.map(item => (item as string).trim())));
}

function toPreferences(row: any) {
  if (!row) return defaults;
  return {
    targetRoles: row.target_roles || [],
    keywords: row.keywords || [],
    countries: row.countries || [],
    locations: row.locations || [],
    workModes: row.work_modes || defaults.workModes,
    employmentTypes: row.employment_types || [],
    seniorityLevels: row.seniority_levels || [],
    excludedKeywords: row.excluded_keywords || [],
    salaryCurrency: row.salary_currency || "",
    minimumSalary: row.minimum_salary === null ? null : Number(row.minimum_salary),
    language: row.language || "English",
    includeLinkedIn: row.include_linkedin !== false,
    includeSocialMedia: row.include_social_media !== false,
    includeCompanySites: row.include_company_sites !== false,
    includeJobBoards: row.include_job_boards !== false,
    targetCount: Number(row.target_count || 30)
  };
}

export async function GET() {
  const user = await currentUser({ allowFrozen: true });
  if (!user) return fail("Sign in required.", 401);
  try {
    const sql = db();
    await sql`INSERT INTO job_search_preferences(user_id) VALUES(${user.userId}) ON CONFLICT(user_id) DO NOTHING`;
    const rows: any = await sql`SELECT * FROM job_search_preferences WHERE user_id = ${user.userId} LIMIT 1`;
    return NextResponse.json({ preferences: toPreferences(rows[0]) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Job preferences read failed", error);
    return fail("Could not load job preferences. The preview database may need the jobs migration.", 503);
  }
}

export async function PUT(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("A preferences object is required.", 400);

  const targetRoles = cleanList(body.targetRoles, 80);
  const keywords = cleanList(body.keywords, 100);
  const countries = cleanList(body.countries, 40);
  const locations = cleanList(body.locations, 100);
  const workModes = cleanList(body.workModes, 10);
  const employmentTypes = cleanList(body.employmentTypes, 30);
  const seniorityLevels = cleanList(body.seniorityLevels, 30);
  const excludedKeywords = cleanList(body.excludedKeywords, 100);
  const allowedModes = new Set(["remote", "hybrid", "on-site"]);
  const currency = typeof body.salaryCurrency === "string" ? body.salaryCurrency.trim().toUpperCase().slice(0, 10) : "";
  const minimumSalary = body.minimumSalary === null || body.minimumSalary === "" || body.minimumSalary === undefined
    ? null
    : Number(body.minimumSalary);
  const targetCount = Number(body.targetCount);

  if (!targetRoles || !keywords || !countries || !locations || !workModes || !employmentTypes || !seniorityLevels || !excludedKeywords) {
    return fail("Check your preference lists. Remove blank lines and keep each list within its allowed size.", 400);
  }
  if (!workModes.every(mode => allowedModes.has(mode))) return fail("Work modes must be remote, hybrid or on-site.", 400);
  if (minimumSalary !== null && (!Number.isFinite(minimumSalary) || minimumSalary < 0 || minimumSalary > 1000000000000)) {
    return fail("Enter a valid minimum salary, or leave it blank.", 400);
  }
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 50) return fail("Choose a target between 1 and 50 jobs.", 400);

  const language = typeof body.language === "string" && body.language.trim() ? body.language.trim().slice(0, 60) : "English";
  const includeLinkedIn = body.includeLinkedIn !== false;
  const includeSocialMedia = body.includeSocialMedia !== false;
  const includeCompanySites = body.includeCompanySites !== false;
  const includeJobBoards = body.includeJobBoards !== false;

  try {
    const sql = db();
    await sql`
      INSERT INTO job_search_preferences (
        user_id, target_roles, keywords, countries, locations, work_modes,
        employment_types, seniority_levels, excluded_keywords, salary_currency,
        minimum_salary, language, include_linkedin, include_social_media,
        include_company_sites, include_job_boards, target_count, updated_at
      ) VALUES (
        ${user.userId}, ${targetRoles}, ${keywords}, ${countries}, ${locations}, ${workModes},
        ${employmentTypes}, ${seniorityLevels}, ${excludedKeywords}, ${currency},
        ${minimumSalary}, ${language}, ${includeLinkedIn}, ${includeSocialMedia},
        ${includeCompanySites}, ${includeJobBoards}, ${targetCount}, now()
      )
      ON CONFLICT(user_id) DO UPDATE SET
        target_roles = EXCLUDED.target_roles,
        keywords = EXCLUDED.keywords,
         countries = EXCLUDED.countries,
        locations = EXCLUDED.locations,
        work_modes = EXCLUDED.work_modes,
        employment_types = EXCLUDED.employment_types,
        seniority_levels = EXCLUDED.seniority_levels,
        excluded_keywords = EXCLUDED.excluded_keywords,
        salary_currency = EXCLUDED.salary_currency,
        minimum_salary = EXCLUDED.minimum_salary,
        language = EXCLUDED.language,
        include_linkedin = EXCLUDED.include_linkedin,
        include_social_media = EXCLUDED.include_social_media,
        include_company_sites = EXCLUDED.include_company_sites,
        include_job_boards = EXCLUDED.include_job_boards,
        target_count = EXCLUDED.target_count,
        updated_at = now()
    `;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Job preferences save failed", error);
    return fail("Could not save job preferences.", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  const targetCount = body?.targetCount;
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 50) {
    return fail("Choose a target between 1 and 50 jobs.", 400);
  }
  try {
    const sql = db();
    await sql`INSERT INTO job_search_preferences(user_id, target_count)
      VALUES(${user.userId}, ${targetCount})
      ON CONFLICT(user_id) DO UPDATE SET target_count = EXCLUDED.target_count, updated_at = now()`;
    return NextResponse.json({ ok: true, targetCount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Job target count update failed", error);
    return fail("Could not save the job target count.", 503);
  }
}
