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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workflow = params.get("type") || "";
  const mode = (params.get("mode") || "standard").toLowerCase();
  const kind = (params.get("kind") || "research").toLowerCase();
  const permanentToken = params.get("ai") || params.get("token") || "";

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
    if (timeChoice === "specific" && !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time)) {
      return errorResponse("Specific time must use HH:MM 24-hour format.", 400);
    }
    if (endEnabled && (!/^\\d{4}-\\d{2}-\\d{2}$/.test(endDate) || Number.isNaN(Date.parse(endDate + "T00:00:00Z")))) {
      return errorResponse("A valid end date is required when End repeat is On.", 400);
    }
    scheduledTask = {
      frequency: frequency as typeof allowedFrequencies[number],
      timeChoice: timeChoice as typeof allowedTimeChoices[number],
      time,
      timezone: timezone as typeof allowedTimezones[number],
      endEnabled,
      endDate,
      bootstrapUrl: request.nextUrl.toString()
    };
  }

  try {
    const sql = db();
    const permanentHash = hashToken(permanentToken);
    const owners: any = await sql`
      SELECT user_id FROM ai_access_tokens
      WHERE token_hash = ${permanentHash} AND revoked_at IS NULL
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
