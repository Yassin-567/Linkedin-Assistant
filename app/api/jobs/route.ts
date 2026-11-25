import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { saveJobBatch } from "@/lib/job-store";

export const runtime = "nodejs";
const statuses = ["Saved", "Applied", "Interviewing", "Offer", "Rejected", "Closed", "Not interested"];
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const validId = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export async function GET() {
  const user = await currentUser({ allowFrozen: true });
  if (!user) return fail("Sign in required.", 401);
  try {
    const sql = db();
    const jobs = await sql`
      SELECT id::text, title, company, description, salary_text AS "salaryText",
        salary_min AS "salaryMin", salary_max AS "salaryMax", salary_currency AS "salaryCurrency",
        workplace_type AS "workplaceType", employment_type AS "employmentType",
        location, country, seniority, posted_at AS "postedAt", posted_at_text AS "postedAtText",
        source_platform AS "sourcePlatform", research_tool AS "researchTool", source_type AS "sourceType",
        source_url AS "sourceUrl", application_url AS "applicationUrl",
        match_reason AS "matchReason", recommended_outreach AS "recommendedOutreach", evidence_urls AS "evidenceUrls",
        source_metadata AS "sourceMetadata", status, applied_at AS "appliedAt", notes,
        discovered_at AS "discoveredAt", created_at AS "createdAt"
      FROM jobs WHERE user_id = ${user.userId}
      ORDER BY created_at DESC LIMIT 1000
    `;
    return NextResponse.json({ jobs }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Jobs read failed", error);
    return fail("Could not load saved jobs.", 503);
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.jobs) || body.jobs.length < 1 || body.jobs.length > 50) return fail("Provide between 1 and 50 jobs.", 400);
  try {
    return NextResponse.json({ ok: true, ...(await saveJobBatch(db(), user.userId, body.jobs.map((job: any) => ({ ...job, researchTool: job?.researchTool ?? body.researchTool })))) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Manual job import failed", error);
    return fail("Could not import this batch.", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  if (!validId(body?.id)) return fail("A valid job ID is required.", 400);
  const status = typeof body.status === "string" && statuses.includes(body.status) ? body.status : "Saved";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 5000) : "";
  const outreachProvided = Object.prototype.hasOwnProperty.call(body, "recommendedOutreach");
  const recommendedOutreach = typeof body.recommendedOutreach === "string" ? body.recommendedOutreach.trim().slice(0, 6000) : "";
  const hasAppliedAt = Object.prototype.hasOwnProperty.call(body, "appliedAt");
  const appliedAt = typeof body.appliedAt === "string" ? body.appliedAt : "";
  if (appliedAt && Number.isNaN(new Date(appliedAt).getTime())) return fail("Use a valid application date and time.", 400);
  try {
    const sql = db();
    const rows: any = await sql`UPDATE jobs SET
      status = ${status},
      applied_at = CASE
        WHEN ${hasAppliedAt} THEN NULLIF(${appliedAt}, '')::timestamptz
        WHEN ${status} = 'Applied' AND jobs.status <> 'Applied' THEN COALESCE(applied_at, now())
        ELSE applied_at
      END,
      notes = ${notes},
      recommended_outreach = CASE WHEN ${outreachProvided} THEN ${recommendedOutreach} ELSE recommended_outreach END,
      updated_at = now()
      WHERE id = ${body.id}::uuid AND user_id = ${user.userId}
      RETURNING id::text, applied_at AS "appliedAt"`;
    if (!rows.length) return fail("Job not found in your account.", 404);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Job update failed", error);
    return fail("Could not update this job.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!validId(id)) return fail("A valid job ID is required.", 400);
  try {
    const sql = db();
    const rows: any = await sql`DELETE FROM jobs WHERE id=${id}::uuid AND user_id=${user.userId} RETURNING id`;
    if (!rows.length) return fail("Job not found in your account.", 404);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Job delete failed", error);
    return fail("Could not delete this job.", 503);
  }
}
