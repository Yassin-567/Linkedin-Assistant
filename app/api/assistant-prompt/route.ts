import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/assistant-auth";
import { buildGatewayPrompt, createSessionToken, type PromptWorkflow } from "@/lib/prompt-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{40,60}$/;
const workflows = ["connections", "jobs", "leads", "record_update"] as const;
const jobModes = ["standard", "deep", "loose"] as const;

function errorResponse(message: string, status: number) {
  return new NextResponse(message, { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}

function canonicalGatewayOrigin(request: NextRequest) {
  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionDomain) return new URL("https://" + productionDomain).origin;
  if (process.env.VERCEL) return "https://inlinked.vercel.app";
  return request.nextUrl.origin;
}

function makePromptUrl(origin: string, token: string, values: Record<string, string>) {
  const url = new URL("/api/assistant-prompt", origin);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  url.searchParams.set("ai", token);
  return url.toString();
}

function buildUltimateDirectory(origin: string, token: string) {
  const jobsStandard = makePromptUrl(origin, token, { type: "jobs", mode: "standard" });
  const jobsDeep = makePromptUrl(origin, token, { type: "jobs", mode: "deep" });
  const jobsLoose = makePromptUrl(origin, token, { type: "jobs", mode: "loose" });
  const connections = makePromptUrl(origin, token, { type: "connections" });
  const leads = makePromptUrl(origin, token, { type: "leads" });
  const updates = makePromptUrl(origin, token, { type: "record_update" });
  const recurringJobs = makePromptUrl(origin, token, {
    type: "jobs", mode: "standard", kind: "scheduled",
    frequency: "daily", timeChoice: "morning", time: "09:00",
    timezone: "Africa/Cairo", endEnabled: "false"
  });
  const recurringConnections = makePromptUrl(origin, token, {
    type: "connections", kind: "scheduled",
    frequency: "daily", timeChoice: "morning", time: "09:00",
    timezone: "Africa/Cairo", endEnabled: "false"
  });

  return [
    "INLINKED — ULTIMATE AI DIRECTORY",
    "Version: 1",
    "",
    "PURPOSE",
    "This is the master directory for Inlinked. Read the user's request, choose the one relevant workflow URL below, open that URL, and follow the complete instructions it returns. Do not open every URL and do not start research from this directory alone.",
    "",
    "HOW TO USE",
    "1. Match the user's request to the capability descriptions below.",
    "2. Open only the matching workflow URL.",
    "3. Follow the detailed workflow instructions returned by that URL, including its Context, Save and Update procedure.",
    "4. Keep all credentials and credential-bearing URLs private. Never include them in reports, search queries, messages or unrelated services.",
    "",
    "DYNAMIC RESEARCH COUNT",
    "For Jobs, LinkedIn Connections and Commercial Leads, the AI may choose the requested target count based on the user's instruction and research scope. Add targetCount=N to the selected workflow URL before opening it, where N is a whole number from 1 to 50. If the user specifies a count, use it within that limit. Otherwise choose a sensible target based on the request; if targetCount is omitted, Inlinked uses the saved/default count. A target is not a quota: never invent or pad results.",
    "",
    "AVAILABLE WORKFLOWS",
    "",
    "1. JOB DISCOVERY — STANDARD",
    "Use this to search for genuine job vacancies, apply the user's saved job-search preferences, verify openings, and save qualified jobs to Inlinked. Standard mode preserves the saved eligibility filters.",
    jobsStandard,
    "",
    "2. JOB DISCOVERY — DEEP",
    "Use this when the user asks for deeper or wider research. It explores more searches and alternative role titles while retaining the saved eligibility requirements.",
    jobsDeep,
    "",
    "3. JOB DISCOVERY — LOOSE",
    "Use this when the user asks for broader matching, adjacent roles or transferable-skill opportunities. It relaxes soft matching only; retain hard exclusions and clearly flag gaps.",
    jobsLoose,
    "",
    "4. LINKEDIN CONNECTION DISCOVERY",
    "Use this to find relevant people and decision-makers using the user's saved LinkedIn research preferences, then save verified prospects to Inlinked.",
    connections,
    "",
    "5. COMMERCIAL LEAD DISCOVERY",
    "Use this to find potential business customers using the user's active Lead Profile and selected discovery engines. If no active Lead Profile exists, report that requirement instead of guessing.",
    leads,
    "",
    "6. SAVE / UPDATE EXISTING RECORDS",
    "Use this when the user asks to change the status, notes or recommended outreach of saved Jobs, LinkedIn prospects or Commercial Leads. Retrieve the records first, identify the correct record IDs, then update only the records the user specified. For LinkedIn prospects, use Connection Sent after the user confirms an invitation was sent, Connected after acceptance, and Contacted for a direct message or other direct outreach.",
    updates,
    "Important: This URL can mark a job as Applied after the user confirms they submitted an application. It does not itself submit an application on an employer's website. Never claim an application was submitted unless that action was actually completed and confirmed.",
    "",
    "7. RECURRING JOB DISCOVERY",
    "Use this when the user asks to schedule recurring job research. This example defaults to daily in the morning, Africa/Cairo time. Before opening, change the URL parameters to match the user's requested frequency, time, timezone and optional end date. Supported frequencies: daily, weekdays, weekly, monthly. Supported time choices: morning, afternoon, evening, night, specific. Supported timezones: Africa/Cairo, Europe/London, UTC, America/New_York.",
    recurringJobs,
    "",
    "8. RECURRING LINKEDIN CONNECTION DISCOVERY",
    "Use this when the user asks for recurring LinkedIn connection research. Change the schedule parameters before opening if the user specifies a different schedule. Recurring Commercial Lead discovery and recurring Record Updates are not currently supported.",
    recurringConnections,
    "",
    "SCHEDULE PARAMETERS",
    "For recurring URLs, use frequency=daily|weekdays|weekly|monthly, timeChoice=morning|afternoon|evening|night|specific, time=HH:MM (24-hour local clock when timeChoice=specific), timezone=Africa/Cairo|Europe/London|UTC|America/New_York, endEnabled=true|false, and endDate=YYYY-MM-DD when endEnabled=true. Preserve the user's requested schedule; never silently substitute a different one.",
    "",
    "AUTHENTICATION AND SESSION RULES",
    "Every workflow URL above uses the same permanent Inlinked credential. Opening a workflow URL validates that permanent credential and returns its detailed workflow prompt plus a fresh temporary session token. Use only that temporary session token in the Authorization: Bearer header for the Context, Save and Update API calls described in the returned prompt. The temporary session expires after 15 minutes. Never use the permanent credential directly for those API calls and never reuse a session from an earlier run.",
    "If a workflow returns an expired/invalid-session error, reopen its directory-listed URL to obtain a fresh session. If the permanent credential has been revoked, ask the account owner to generate a new Ultimate URL.",
    "",
    "PRIVACY",
    "This directory contains private credential-bearing URLs. Do not quote, expose, forward or publish this directory or any URL from it. Do not send these URLs to public search engines. Keep the permanent credential and temporary session credentials out of all user-facing reports."
  ].join("\n");
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workflow = params.get("type") || "";
  const mode = (params.get("mode") || "standard").toLowerCase();
  const kind = (params.get("kind") || "research").toLowerCase();
  const permanentToken = params.get("ai") || params.get("token") || "";

  if (workflow === "ultimate") {
    if (!TOKEN_FORMAT.test(permanentToken)) {
      return errorResponse("A valid permanent AI token is required in the ai query parameter.", 401);
    }
    try {
      const sql = db();
      const permanentHash = hashToken(permanentToken);
      const owners: any = await sql`
        SELECT t.user_id FROM ai_access_tokens t
        JOIN app_users u ON u.id = t.user_id AND u.account_status = 'active'
        WHERE t.token_hash = ${permanentHash} AND t.revoked_at IS NULL
        LIMIT 1
      `;
      if (!owners.length) {
        return errorResponse("The permanent AI token is invalid or has been revoked.", 401);
      }
      const directory = buildUltimateDirectory(canonicalGatewayOrigin(request), permanentToken);
      return new NextResponse(directory, {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "text/plain; charset=utf-8",
          "X-Inlinked-Directory-Version": "1",
          "X-Inlinked-Directory": "ultimate"
        }
      });
    } catch (error) {
      console.error("Ultimate AI directory failed", error);
      return errorResponse("Could not load the Inlinked AI directory.", 503);
    }
  }

  if (!workflows.includes(workflow as PromptWorkflow)) {
    return errorResponse("Missing or invalid type. Supported types: connections, jobs, leads, record_update.", 400);
  }
  if (kind !== "research" && kind !== "scheduled") {
    return errorResponse("Invalid kind. Use research or scheduled.", 400);
  }
  if (kind === "scheduled" && (workflow === "record_update" || workflow === "leads")) {
    return errorResponse("Recurring prompts are available for Jobs and LinkedIn Connections.", 400);
  }
  if (!TOKEN_FORMAT.test(permanentToken)) {
    return errorResponse("A valid permanent AI token is required in the ai query parameter.", 401);
  }
  if (workflow === "jobs" && !jobModes.includes(mode as typeof jobModes[number])) {
    return errorResponse("Invalid jobs mode. Use standard, deep or loose.", 400);
  }
  if (workflow !== "jobs" && mode !== "standard") {
    return errorResponse("This workflow currently supports mode=standard only.", 400);
  }

  const requestedTargetCount = params.has("targetCount") ? Number(params.get("targetCount")) : null;
  if (requestedTargetCount !== null && (!Number.isInteger(requestedTargetCount) || requestedTargetCount < 1 || requestedTargetCount > 50)) {
    return errorResponse("targetCount must be a whole number from 1 to 50.", 400);
  }

  const allowedFrequencies = ["daily", "weekdays", "weekly", "monthly"] as const;
  const allowedTimeChoices = ["morning", "afternoon", "evening", "night", "specific"] as const;
  const allowedTimezones = ["Africa/Cairo", "Europe/London", "UTC", "America/New_York"] as const;
  let scheduledTask: {
    frequency: typeof allowedFrequencies[number];
    timeChoice: typeof allowedTimeChoices[number];
    time: string;
    timezone: typeof allowedTimezones[number];
    endEnabled: boolean;
    endDate: string;
    bootstrapUrl: string;
  } | undefined;

  if (kind === "scheduled") {
    const frequency = params.get("frequency") || "daily";
    const timeChoice = params.get("timeChoice") || "morning";
    const time = params.get("time") || "09:00";
    const timezone = params.get("timezone") || "Africa/Cairo";
    const endEnabled = params.get("endEnabled") === "true";
    const endDate = params.get("endDate") || "";
    if (!allowedFrequencies.includes(frequency as typeof allowedFrequencies[number])) {
      return errorResponse("Invalid repeat frequency.", 400);
    }
    if (!allowedTimeChoices.includes(timeChoice as typeof allowedTimeChoices[number])) {
      return errorResponse("Invalid time choice.", 400);
    }
    if (!allowedTimezones.includes(timezone as typeof allowedTimezones[number])) {
      return errorResponse("Invalid timezone.", 400);
    }
    if (timeChoice === "specific" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return errorResponse("Specific time must use HH:MM 24-hour format.", 400);
    }
    if (endEnabled && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(Date.parse(endDate + "T00:00:00Z")))) {
      return errorResponse("A valid end date is required when End repeat is On.", 400);
    }
    scheduledTask = {
      frequency: frequency as typeof allowedFrequencies[number],
      timeChoice: timeChoice as typeof allowedTimeChoices[number],
      time,
      timezone: timezone as typeof allowedTimezones[number],
      endEnabled,
      endDate,
      bootstrapUrl: (() => { const runUrl = new URL(request.nextUrl.toString()); runUrl.searchParams.set("kind", "research"); for (const key of ["frequency", "timeChoice", "time", "timezone", "endEnabled", "endDate"]) runUrl.searchParams.delete(key); return runUrl.toString(); })()
    };
  }

  try {
    const sql = db();
    const permanentHash = hashToken(permanentToken);
    const owners: any = await sql`
      SELECT t.user_id FROM ai_access_tokens t
      JOIN app_users u ON u.id = t.user_id AND u.account_status = 'active'
      WHERE t.token_hash = ${permanentHash} AND t.revoked_at IS NULL
      LIMIT 1
    `;
    if (!owners.length) return errorResponse("The permanent AI token is invalid or has been revoked.", 401);

    const userId = String(owners[0].user_id);
    const sessionToken = createSessionToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await sql`
      INSERT INTO assistant_session_tokens(token_hash, user_id, workflow, search_mode, expires_at)
      VALUES (
        ${hashToken(sessionToken)},
        ${userId},
        ${workflow},
        ${mode},
        ${expiresAt.toISOString()}
      )
    `;

    let connectionTarget = 50;
    let jobTarget = 30;
    let leadTargetCount = requestedTargetCount || 20;
    let leadEngines: string[] | undefined;
    const locationOverride = (params.get("locationOverride") || "").trim().slice(0, 180);
    const queryOverride = (params.get("queryOverride") || "").trim().slice(0, 250);
    if (workflow === "leads" && params.has("engines")) {
      const allowedEngines = new Set(["direct_demand", "opportunity_signal", "ideal_customer"]);
      leadEngines = (params.get("engines") || "").split(",").map(value => value.trim()).filter(value => allowedEngines.has(value));
    }
    let leadProfile: { id: string; name: string; preferences: Record<string, unknown> } | undefined;

    if (workflow === "connections") {
      const rows: any = await sql`SELECT connection_target_count FROM user_preferences WHERE user_id = ${userId} LIMIT 1`;
      const value = Number(rows[0]?.connection_target_count || 50);
      connectionTarget = requestedTargetCount || (Number.isInteger(value) && value >= 1 && value <= 50 ? value : 50);
    }

    if (workflow === "jobs") {
      const rows: any = await sql`SELECT target_count FROM job_search_preferences WHERE user_id = ${userId} LIMIT 1`;
      const value = Number(rows[0]?.target_count || 30);
      jobTarget = requestedTargetCount || (Number.isInteger(value) && value >= 1 && value <= 50 ? value : 30);
    }

    if (workflow === "leads") {
      const rows: any = await sql`
        SELECT id::text, name, preferences
        FROM lead_profiles
        WHERE user_id = ${userId} AND is_active = true
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      if (!rows.length) {
        await sql`UPDATE assistant_session_tokens SET revoked_at = now() WHERE token_hash = ${hashToken(sessionToken)}`;
        return errorResponse("No active Lead Profile was found. Create and activate a Lead Profile in the Leads workspace, then reopen this link.", 409);
      }
      if (params.has("targetCount")) leadTargetCount = requestedTargetCount || 20;
      leadProfile = {
        id: String(rows[0].id),
        name: String(rows[0].name || "Lead Profile"),
        preferences: rows[0].preferences && typeof rows[0].preferences === "object" ? rows[0].preferences : {}
      };
    }

    const origin = request.nextUrl.origin;
    const prompt = buildGatewayPrompt({
      workflow: workflow as PromptWorkflow,
      mode,
      token: sessionToken,
      expiresAt,
      origin,
      connectionTarget,
      jobTarget,
      leadProfile,
      leadTargetCount,
      leadEngines,
      locationOverride,
      queryOverride,
      scheduledTask
    });

    return new NextResponse(prompt, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "text/plain; charset=utf-8",
        "X-Inlinked-Session-Expires-At": expiresAt.toISOString(),
        "X-Inlinked-Workflow": workflow,
        "X-Inlinked-Mode": mode,
        "X-Inlinked-Kind": kind
      }
    });
  } catch (error) {
    console.error("AI prompt gateway failed", error);
    return errorResponse(error instanceof Error ? error.message : "Could not generate the Inlinked prompt.", 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
