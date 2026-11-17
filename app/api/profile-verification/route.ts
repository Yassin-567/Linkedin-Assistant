import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type ProfileFields = {
  name: string;
  headline: string;
  company: string;
  about: string;
  skills: string;
  experience: string;
  education: string;
};
const emptyFields: ProfileFields = {
  name: "", headline: "", company: "", about: "", skills: "", experience: "", education: ""
};
const fieldNames = Object.keys(emptyFields) as (keyof ProfileFields)[];
const clean = (value: unknown, max = 3000) => typeof value === "string" ? value.trim().slice(0, max) : "";

function canonicalProfile(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com")) || parts.length !== 2 || parts[0].toLowerCase() !== "in") return "";
    return "https://www.linkedin.com/in/" + parts[1].toLowerCase();
  } catch { return ""; }
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const sql = db();
    const rows: any = await sql`SELECT linkedin_profile_url,
      (SELECT profile_summary FROM app_users WHERE id = ${user.userId}) AS profile_summary,
      (SELECT linkedin_profile_data FROM app_users WHERE id = ${user.userId}) AS profile_data,
      (SELECT linkedin_profile_source FROM app_users WHERE id = ${user.userId}) AS profile_source,
      (SELECT linkedin_profile_verified_at FROM app_users WHERE id = ${user.userId}) AS verified_at
      FROM user_preferences WHERE user_id = ${user.userId}`;
    const row = rows[0] as any;
    const saved = row?.profile_data && typeof row.profile_data === "object" ? row.profile_data : {};
    return NextResponse.json({
      profileUrl: row?.linkedin_profile_url || "",
      fields: saved.fields || emptyFields,
      fieldSources: saved.fieldSources || {},
      summary: row?.profile_summary || "",
      source: row?.profile_source || "not_verified",
      verifiedAt: row?.verified_at || null
    }, { headers: { "Cache-Control": "private,no-store" } });
  } catch (error) {
    console.error("Profile verification read failed", error);
    return NextResponse.json({ error: "Could not load profile verification data." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !["inspect", "confirm"].includes(body.action)) {
    return NextResponse.json({ error: "Choose inspect or confirm." }, { status: 400 });
  }

  const sql = db();
  if (body.action === "inspect") {
    const key = process.env.SERPER_API_KEY;
    if (!key) return NextResponse.json({ error: "Profile lookup is not configured. Add SERPER_API_KEY in Vercel." }, { status: 503 });
    try {
      const rows: any = await sql`SELECT linkedin_profile_url FROM user_preferences WHERE user_id = ${user.userId}`;
      const profileUrl = canonicalProfile(String(rows[0]?.linkedin_profile_url || ""));
      if (!profileUrl) return NextResponse.json({ error: "Add a valid LinkedIn personal profile URL in Search settings first." }, { status: 400 });
      const slug = new URL(profileUrl).pathname.split("/").filter(Boolean).pop() || "";
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ q: `site:linkedin.com/in/${slug}`, hl: "en", num: 10 }),
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}.`);
      const data = await response.json();
      const organic = Array.isArray(data.organic) ? data.organic : [];
      const match = organic.find((item: any) => canonicalProfile(String(item.link || "")) === profileUrl);
      const rawTitle = clean(match?.title, 500);
      const rawSnippet = clean(match?.snippet, 1200);
      const title = rawTitle.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
      const split = title.split(/\s+-\s+/);
      const fields: ProfileFields = { ...emptyFields };
      if (match) {
        fields.name = clean(split[0], 160);
        fields.headline = clean(split.slice(1).join(" - "), 300);
        // Search snippets are not treated as the full About section.
        fields.about = rawSnippet;
      }
      const fieldSources: Record<string, string> = {};
      for (const name of fieldNames) fieldSources[name] = fields[name] ? "public_linkedin_index" : "not_found";
      const extraction = { fields, fieldSources, rawTitle, rawSnippet, profileUrl, found: !!match, inspectedAt: new Date().toISOString() };
      await sql`UPDATE app_users SET linkedin_profile_extraction = ${JSON.stringify(extraction)}::jsonb, updated_at = now() WHERE id = ${user.userId}`;
      return NextResponse.json({
        found: !!match,
        fields,
        fieldSources,
        rawTitle,
        rawSnippet,
        message: match
          ? "A public search result matched your profile URL. Only its title and search snippet were available; other sections were not exposed."
          : "No exact public search result matched this profile URL. You can still enter the details manually and confirm them."
      }, { headers: { "Cache-Control": "private,no-store" } });
    } catch (error) {
      console.error("Public LinkedIn profile inspection failed", error);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not inspect the public profile." }, { status: 503 });
    }
  }

  const submitted = body.fields && typeof body.fields === "object" ? body.fields : {};
  const fields = {} as ProfileFields;
  for (const name of fieldNames) fields[name] = clean(submitted[name], name === "about" ? 3000 : 2000);
  if (!fieldNames.some(name => fields[name])) {
    return NextResponse.json({ error: "Enter or inspect at least one profile detail before confirming." }, { status: 400 });
  }
  try {
    const rows: any = await sql`SELECT linkedin_profile_extraction FROM app_users WHERE id = ${user.userId}`;
    const extraction = rows[0]?.linkedin_profile_extraction && typeof rows[0].linkedin_profile_extraction === "object"
      ? rows[0].linkedin_profile_extraction : {};
    const extracted = extraction.fields && typeof extraction.fields === "object" ? extraction.fields : {};
    const fieldSources: Record<string, string> = {};
    for (const name of fieldNames) {
      if (!fields[name]) fieldSources[name] = "not_found";
      else if (fields[name] === clean(extracted[name], name === "about" ? 3000 : 2000) && extraction.found) fieldSources[name] = "public_linkedin_index";
      else fieldSources[name] = "user_entered_or_edited";
    }
    const summary = [
      fields.name && `Name: ${fields.name}`,
      fields.headline && `Headline: ${fields.headline}`,
      fields.company && `Company: ${fields.company}`,
      fields.about && `Profile search snippet / About context: ${fields.about}`,
      fields.skills && `Skills: ${fields.skills}`,
      fields.experience && `Experience: ${fields.experience}`,
      fields.education && `Education: ${fields.education}`
    ].filter(Boolean).join("\n").slice(0, 4000);
    const profileData = { fields, fieldSources, confirmedAt: new Date().toISOString(), inspectedProfileUrl: extraction.profileUrl || "" };
    await sql`UPDATE app_users SET linkedin_profile_data = ${JSON.stringify(profileData)}::jsonb,
      linkedin_profile_source = 'user_confirmed', linkedin_profile_verified_at = now(),
      profile_summary = ${summary}, updated_at = now() WHERE id = ${user.userId}`;
    return NextResponse.json({ ok: true, fields, fieldSources, summary, verifiedAt: profileData.confirmedAt });
  } catch (error) {
    console.error("Profile confirmation failed", error);
    return NextResponse.json({ error: "Could not save the confirmed profile details." }, { status: 503 });
  }
}
