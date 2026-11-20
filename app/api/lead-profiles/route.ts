import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const clean = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const array = (value: unknown, max = 40): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string").map(item => item.trim().slice(0, 120)).filter(Boolean))].slice(0, max)
  : [];

const defaults = {
  services: [] as string[],
  serviceDescription: "",
  problemsSolved: "",
  customerTypes: [] as string[],
  industries: [] as string[],
  decisionMakerRoles: [] as string[],
  countries: [] as string[],
  locations: [] as string[],
  buyingSignals: ["explicit_request", "recommendation", "outsourcing"] as string[],
  sourceCategories: ["linkedin_public", "reddit", "facebook_public", "x_public", "forums", "business_sites", "project_sites"] as string[],
  discoveryEngines: ["direct_demand", "opportunity_signal", "ideal_customer"] as string[],
  excludedKeywords: [] as string[],
  projectType: "either",
  minimumBudget: "",
  budgetCurrency: "",
  preferredCustomerValue: "",
  language: "English"
};

function cleanPreferences(value: unknown) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const allowedEngines = ["direct_demand", "opportunity_signal", "ideal_customer"];
  const allowedSources = ["linkedin_public", "reddit", "facebook_public", "x_public", "forums", "business_sites", "project_sites", "other_public"];
  const projectType = ["one_time", "recurring", "either"].includes(String(input.projectType)) ? String(input.projectType) : "either";
  return {
    ...defaults,
    ...input,
    services: array(input.services, 40),
    customerTypes: array(input.customerTypes, 30),
    industries: array(input.industries, 40),
    decisionMakerRoles: array(input.decisionMakerRoles, 30),
    countries: array(input.countries, 40),
    locations: array(input.locations, 60),
    buyingSignals: array(input.buyingSignals, 30),
    sourceCategories: array(input.sourceCategories, 20).filter(item => allowedSources.includes(item)),
    discoveryEngines: array(input.discoveryEngines, 3).filter(item => allowedEngines.includes(item)),
    excludedKeywords: array(input.excludedKeywords, 100),
    serviceDescription: clean(input.serviceDescription, 3000),
    idealCustomerDescription: clean(input.idealCustomerDescription, 3000),
    problemsSolved: clean(input.problemsSolved, 2000),
    projectType,
    minimumBudget: clean(input.minimumBudget, 40),
    budgetCurrency: clean(input.budgetCurrency, 12),
    preferredCustomerValue: clean(input.preferredCustomerValue, 40),
    language: clean(input.language, 60) || "English"
  };
}

function serialize(row: any) {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description || "",
    preferences: cleanPreferences(row.preferences),
    isActive: !!row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  try {
    const sql = db();
    const rows: any = await sql`SELECT id::text, name, description, preferences, is_active AS "isActive",
      created_at AS "createdAt", updated_at AS "updatedAt"
      FROM lead_profiles WHERE user_id = ${user.userId}
      ORDER BY is_active DESC, updated_at DESC`;
    return NextResponse.json({ profiles: rows.map(serialize) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Lead profiles read failed", error);
    return fail("Could not load lead profiles. Apply the Phase 9 database migration first.", 503);
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  const name = clean(body?.name, 100);
  if (!name) return fail("Give this lead profile a name.", 400);
  const description = clean(body?.description, 500);
  const preferences = cleanPreferences(body?.preferences);
  const sql = db();
  try {
    const activeRows: any = await sql`SELECT id FROM lead_profiles WHERE user_id = ${user.userId} AND is_active = true LIMIT 1`;
    const makeActive = body?.isActive === true || activeRows.length === 0;
    if (makeActive) await sql`UPDATE lead_profiles SET is_active = false, updated_at = now() WHERE user_id = ${user.userId}`;
    const rows: any = await sql`INSERT INTO lead_profiles(user_id, name, description, preferences, is_active)
      VALUES(${user.userId}, ${name}, ${description}, ${JSON.stringify(preferences)}::jsonb, ${makeActive})
      RETURNING id::text, name, description, preferences, is_active AS "isActive",
        created_at AS "createdAt", updated_at AS "updatedAt"`;
    return NextResponse.json({ ok: true, profile: serialize(rows[0]) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Lead profile create failed", error);
    return fail("Could not create this lead profile.", 503);
  }
}

export async function PATCH(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return fail("A valid profile ID is required.", 400);
  const name = clean(body.name, 100);
  if (!name) return fail("Profile name is required.", 400);
  const description = clean(body.description, 500);
  const preferences = cleanPreferences(body.preferences);
  try {
    const sql = db();
    if (body.isActive === true) await sql`UPDATE lead_profiles SET is_active = false, updated_at = now() WHERE user_id = ${user.userId} AND id <> ${id}::uuid`;
    const rows: any = await sql`UPDATE lead_profiles SET name = ${name}, description = ${description},
      preferences = ${JSON.stringify(preferences)}::jsonb,
      is_active = CASE WHEN ${typeof body.isActive === "boolean"} THEN ${!!body.isActive} ELSE is_active END,
      updated_at = now()
      WHERE id = ${id}::uuid AND user_id = ${user.userId}
      RETURNING id::text, name, description, preferences, is_active AS "isActive",
        created_at AS "createdAt", updated_at AS "updatedAt"`;
    if (!rows.length) return fail("Lead profile not found in your account.", 404);
    return NextResponse.json({ ok: true, profile: serialize(rows[0]) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Lead profile update failed", error);
    return fail("Could not update this lead profile.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return fail("Sign in required.", 401);
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return fail("A valid profile ID is required.", 400);
  try {
    const sql = db();
    const rows: any = await sql`DELETE FROM lead_profiles WHERE id = ${id}::uuid AND user_id = ${user.userId} RETURNING id`;
    if (!rows.length) return fail("Lead profile not found in your account.", 404);
    const remaining: any = await sql`SELECT id FROM lead_profiles WHERE user_id = ${user.userId} ORDER BY updated_at DESC LIMIT 1`;
    if (remaining.length) await sql`UPDATE lead_profiles SET is_active = (id = ${remaining[0].id}::uuid), updated_at = now() WHERE user_id = ${user.userId}`;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Lead profile delete failed", error);
    return fail("Could not delete this profile. Existing leads are preserved.", 503);
  }
}
