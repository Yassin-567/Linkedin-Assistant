import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { POST } from "../preferences/route";
export const runtime = "nodejs";
export { POST };
type ProfileFields = { name: string; headline: string; company: string; about: string; skills: string; experience: string; education: string };
const emptyFields: ProfileFields = { name: "", headline: "", company: "", about: "", skills: "", experience: "", education: "" };
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
    const savedFields = saved.fields && typeof saved.fields === "object" ? saved.fields : {};
    const summary = row.profile_summary || savedFields.about || "";
    return NextResponse.json({
      fields: { ...emptyFields, ...savedFields, about: summary },
      fieldSources: saved.fieldSources || {},
      summary,
      savedAt: row.saved_at || saved.confirmedAt || null
    }, { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("Professional context read failed", error);
    return NextResponse.json({ error: "Could not load your professional context." }, { status: 503 });
  }
}
