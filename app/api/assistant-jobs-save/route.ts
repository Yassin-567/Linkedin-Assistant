import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAssistantAuth } from "@/lib/assistant-auth";
import { saveJobBatch } from "@/lib/job-store";
import { getBillingState, isBillingEnforced } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.jobs) || body.jobs.length < 1 || body.jobs.length > 50) {
    return fail("Provide between 1 and 50 jobs in the jobs array.", 400);
  }
  try {
    const auth = await resolveAssistantAuth(request);
    if (!auth) return fail("AI token is missing, invalid or revoked. Send it as Authorization: Bearer <token>.", 401);
    let maxNewRecords: number | undefined;
    if (isBillingEnforced()) {
      const billing = await getBillingState(auth.userId);
      if (billing.enforced && billing.plan === "free" && billing.entitlements.savedJobs !== null) {
        const countRows: any = await db()`
          SELECT COUNT(*)::int AS count FROM jobs WHERE user_id = ${auth.userId}
        `;
        maxNewRecords = Math.max(0, billing.entitlements.savedJobs - Number(countRows[0]?.count || 0));
      }
    }
    const result = await saveJobBatch(
      db(),
      auth.userId,
      body.jobs.map((job: any) => ({ ...job, researchTool: job?.researchTool ?? body.researchTool })),
      maxNewRecords
    );
    const limitResponse = result.limitReached ? {
      error: "The Free plan includes up to 30 saved jobs. Upgrade to Pro to add more.",
      code: "SAVED_JOB_LIMIT_REACHED",
      limitCode: "SAVED_JOB_LIMIT_REACHED",
      upgradeUrl: "/billing"
    } : {};
    return NextResponse.json(
      { ok: true, ...result, ...limitResponse },
      { status: result.limitReached && result.saved === 0 ? 402 : 200, headers }
    );
  } catch (error) {
    console.error("Assistant job save failed", error);
    return fail("Could not save this batch. Do not report any jobs as saved unless the endpoint confirms it.", 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
