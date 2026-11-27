import { NextRequest,NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
export const runtime="nodejs";
const clean=(v:unknown,max=30):string[]|null=>Array.isArray(v)&&v.length<=max&&v.every(x=>typeof x==="string"&&x.trim().length>0&&x.length<=180)?[...new Set(v.map(x=>(x as string).trim()))]:null;
function linkedinProfileUrl(v:unknown):string|null{
 if(typeof v!=="string"||!v.trim())return "";
 try{const u=new URL(v.trim());const host=u.hostname.toLowerCase();const parts=u.pathname.split("/").filter(Boolean);if(!(host==="linkedin.com"||host.endsWith(".linkedin.com"))||parts.length!==2||parts[0].toLowerCase()!=="in")return null;return "https://www.linkedin.com/in/"+parts[1];}catch{return null;}
}
export async function GET(){
 const user=await currentUser({ allowFrozen: true });if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
 try{const sql=db();const rows:any=await sql`SELECT countries,industries,keywords,job_titles,excluded_keywords,language,linkedin_profile_url,connection_target_count,(SELECT profile_summary FROM app_users WHERE id=${user.userId}) AS profile_summary,(SELECT linkedin_profile_data FROM app_users WHERE id=${user.userId}) AS linkedin_profile_data FROM user_preferences WHERE user_id=${user.userId}`;const x=rows[0] as any;if(!x)return NextResponse.json({error:"Preferences not found."},{status:404});
 const profileData = x.linkedin_profile_data && typeof x.linkedin_profile_data === "object" ? x.linkedin_profile_data : {};
 const profileFields = profileData.fields && typeof profileData.fields === "object" ? profileData.fields : {};
 return NextResponse.json({preferences:{linkedinProfileUrl:x.linkedin_profile_url||"",countries:x.countries||[],industries:x.industries||[],keywords:x.keywords||[],jobTitles:x.job_titles||[],excludedKeywords:x.excluded_keywords||[],language:x.language||"English",connectionTargetCount:Number(x.connection_target_count||50),profileSummary:x.profile_summary||profileFields.about||""}},{headers:{"Cache-Control":"private,no-store"}});
 }catch(e){console.error("Preferences read failed",e);return NextResponse.json({error:"Could not load preferences. Check database setup."},{status:503});}
}
export async function PUT(request:NextRequest){
 const user=await currentUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401});const body=await request.json().catch(()=>null);if(!body)return NextResponse.json({error:"Invalid JSON."},{status:400});
 const countries=clean(body.countries,30),industries=clean(body.industries,50),keywords=clean(body.keywords,100),jobTitles=clean(body.jobTitles,50),excluded=clean(body.excludedKeywords,100);
 if(!countries||!industries||!keywords||!jobTitles||!excluded)return NextResponse.json({error:"Check your preference lists. Remove blank lines and keep each list within its allowed size."},{status:400});
 const language=typeof body.language==="string"?body.language.trim().slice(0,60):"English";const connectionTargetCount=Number.isInteger(body.connectionTargetCount)&&body.connectionTargetCount>=1&&body.connectionTargetCount<=50?body.connectionTargetCount:50;const hasProfileSummary=Object.prototype.hasOwnProperty.call(body,"profileSummary");const profile=typeof body.profileSummary==="string"?body.profileSummary.trim().slice(0,4000):"";const profileUrl=linkedinProfileUrl(body.linkedinProfileUrl);
 if(profileUrl===null)return NextResponse.json({error:"Enter a valid LinkedIn personal profile URL, such as https://www.linkedin.com/in/your-profile/."},{status:400});
 try{const sql=db();await sql`INSERT INTO user_preferences(user_id,countries,industries,keywords,job_titles,excluded_keywords,language,linkedin_profile_url,connection_target_count,updated_at) VALUES(${user.userId},${countries},${industries},${keywords},${jobTitles},${excluded},${language},${profileUrl},${connectionTargetCount},now()) ON CONFLICT(user_id) DO UPDATE SET countries=EXCLUDED.countries,industries=EXCLUDED.industries,keywords=EXCLUDED.keywords,job_titles=EXCLUDED.job_titles,excluded_keywords=EXCLUDED.excluded_keywords,language=EXCLUDED.language,linkedin_profile_url=EXCLUDED.linkedin_profile_url,connection_target_count=EXCLUDED.connection_target_count,updated_at=now()`;if(hasProfileSummary)await sql`UPDATE app_users SET profile_summary=${profile},updated_at=now() WHERE id=${user.userId}`;return NextResponse.json({ok:true});}
 catch(e){console.error("Preferences save failed",e);return NextResponse.json({error:"Could not save preferences. Check database setup."},{status:503});}
}

export async function PATCH(request: NextRequest) {
 const user = await currentUser();
 if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
 const body = await request.json().catch(() => null);
 const count = body?.connectionTargetCount;
 if (!Number.isInteger(count) || count < 1 || count > 50) {
  return NextResponse.json({ error: "Choose between 1 and 50 LinkedIn connections." }, { status: 400 });
 }
 try {
  const sql = db();
  await sql`INSERT INTO user_preferences(user_id, connection_target_count)
    VALUES(${user.userId}, ${count})
    ON CONFLICT(user_id) DO UPDATE SET connection_target_count = EXCLUDED.connection_target_count, updated_at = now()`;
  return NextResponse.json({ ok: true, connectionTargetCount: count }, { headers: { "Cache-Control": "no-store" } });
 } catch (error) {
  console.error("Connection target count update failed", error);
  return NextResponse.json({ error: "Could not save the LinkedIn connection target." }, { status: 503 });
 }
}
