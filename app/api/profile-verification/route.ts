import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
type ProfileFields = { name: string; headline: string; company: string; about: string; skills: string; experience: string; education: string };
const emptyFields: ProfileFields = { name: "", headline: "", company: "", about: "", skills: "", experience: "", education: "" };
const fieldNames = Object.keys(emptyFields) as (keyof ProfileFields)[];
const clean = (value: unknown, max = 3000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const headers = { "Cache-Control": "private,no-store" };

export async function GET() {
  const user = await currentUser({ allowFrozen: true });
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const sql = db();
    const rows: any = await sql`SELECT (SELECT profile_summary FROM app_users WHERE id = ${user.userId}) AS profile_summary,
      (SELECT linkedin_profile_data FROM app_users WHERE id = ${user.userId}) AS profile_data,
      (SELECT linkedin_profile_verified_at FROM app_users WHERE id = ${user.userId}) AS saved_at`;
    const row = rows[0] || {};
    const saved = row.profile_data && typeof row.profile_data === "object" ? row.profile_data : {};
    return NextResponse.json({ fields: saved.fields || emptyFields, fieldSources: saved.fieldSources || {}, summary: row.profile_summary || "", savedAt: row.saved_at || saved.confirmedAt || null }, { headers });
  } catch (error) {
    console.error("Professional context read failed", error);
    return NextResponse.json({ error: "Could not load your professional context." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) return NextResponse.json({ error: "Provide the professional context fields to save." }, { status: 400 });
  const fields = {} as ProfileFields;
  for (const name of fieldNames) fields[name] = clean(body.fields[name], name === "about" ? 3000 : 2000);
  if (!fieldNames.some(name => fields[name])) return NextResponse.json({ error: "Enter at least one professional detail before saving." }, { status: 400 });
  const fieldSources: Record<string, string> = {};
  for (const name of fieldNames) fieldSources[name] = fields[name] ? "user_entered_or_edited" : "not_found";
  const summary = [fields.name && `Name: ${fields.name}`, fields.headline && `Headline: ${fields.headline}`, fields.company && `Company: ${fields.company}`, fields.about && `About: ${fields.about}`, fields.skills && `Skills: ${fields.skills}`, fields.experience && `Experience: ${fields.experience}`, fields.education && `Education: ${fields.education}`].filter(Boolean).join("\n").slice(0, 4000);
  const profileData = { fields, fieldSources, confirmedAt: new Date().toISOString() };
  try {
    const sql = db();
    await sql`UPDATE app_users SET linkedin_profile_data = ${JSON.stringify(profileData)}::jsonb, linkedin_profile_source = ${"user_confirmed"}, linkedin_profile_verified_at = now(), profile_summary = ${summary}, updated_at = now() WHERE id = ${user.userId}`;
    return NextResponse.json({ ok: true, fields, fieldSources, summary, savedAt: profileData.confirmedAt }, { headers });
  } catch (error) {
    console.error("Professional context save failed", error);
    return NextResponse.json({ error: "Could not save your professional context." }, { status: 503 });
  }
}