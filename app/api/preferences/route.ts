import { NextRequest,NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
export const runtime="nodejs";
const clean=(v:unknown,max=30):string[]|null=>Array.isArray(v)&&v.length<=max&&v.every(x=>typeof x==="string"&&x.trim().length>0&&x.length<=120)?[...new Set(v.map(x=>(x as string).trim()))]:null;
function linkedinProfileUrl(v:unknown):string|null{
 if(typeof v!=="string"||!v.trim())return "";
 try{const u=new URL(v.trim());if(!/(^|\\.)linkedin\\.com$/i.test(u.hostname)||!/^\\/in\\/[^/]+\\/?$/i.test(u.pathname))return null;return "https://www.linkedin.com"+u.pathname.replace(/\\/$/,"");}catch{return null;}
}
export async function GET(){
 const user=await currentUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
 try{const sql=db();const rows:any=await sql`SELECT countries,industries,keywords,job_titles,excluded_keywords,language,linkedin_profile_url,(SELECT profile_summary FROM app_users WHERE id=${user.userId}) AS profile_summary FROM user_preferences WHERE user_id=${user.userId}`;const x=rows[0] as any;if(!x)return NextResponse.json({error:"Preferences not found."},{status:404});
 return NextResponse.json({preferences:{linkedinProfileUrl:x.linkedin_profile_url||"",countries:x.countries||[],industries:x.industries||[],keywords:x.keywords||[],jobTitles:x.job_titles||[],excludedKeywords:x.excluded_keywords||[],language:x.language||"English",profileSummary:x.profile_summary||""}},{headers:{"Cache-Control":"private,no-store"}});
 }catch(e){console.error("Preferences read failed",e);return NextResponse.json({error:"Could not load preferences. Check database setup."},{status:503});}
}
export async function PUT(request:NextRequest){
 const user=await currentUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401});const body=await request.json().catch(()=>null);if(!body)return NextResponse.json({error:"Invalid JSON."},{status:400});
 const countries=clean(body.countries,30),industries=clean(body.industries,50),keywords=clean(body.keywords,100),jobTitles=clean(body.jobTitles,50),excluded=clean(body.excludedKeywords,100);
 if(!countries||!industries||!keywords||!jobTitles||!excluded)return NextResponse.json({error:"Check your preference lists. Remove blank lines and keep each list within its allowed size."},{status:400});
 const language=typeof body.language==="string"?body.language.trim().slice(0,60):"English";const profile=typeof body.profileSummary==="string"?body.profileSummary.trim().slice(0,4000):"";const profileUrl=linkedinProfileUrl(body.linkedinProfileUrl);
 if(profileUrl===null)return NextResponse.json({error:"Enter a valid LinkedIn personal profile URL, such as https://www.linkedin.com/in/your-profile/."},{status:400});
 try{const sql=db();await sql`INSERT INTO user_preferences(user_id,countries,industries,keywords,job_titles,excluded_keywords,language,linkedin_profile_url,updated_at) VALUES(${user.userId},${countries},${industries},${keywords},${jobTitles},${excluded},${language},${profileUrl},now()) ON CONFLICT(user_id) DO UPDATE SET countries=EXCLUDED.countries,industries=EXCLUDED.industries,keywords=EXCLUDED.keywords,job_titles=EXCLUDED.job_titles,excluded_keywords=EXCLUDED.excluded_keywords,language=EXCLUDED.language,linkedin_profile_url=EXCLUDED.linkedin_profile_url,updated_at=now()`;await sql`UPDATE app_users SET profile_summary=${profile},updated_at=now() WHERE id=${user.userId}`;return NextResponse.json({ok:true});}
 catch(e){console.error("Preferences save failed",e);return NextResponse.json({error:"Could not save preferences. Check database setup."},{status:503});}
}
