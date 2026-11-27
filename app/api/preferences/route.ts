import { NextRequest,NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
export const runtime="nodejs";
const clean=(v:unknown,max=30):string[]|null=>Array.isArray(v)&&v.length<=max&&v.every(x=>typeof x==="string"&&x.trim().length>0&&x.length<=180)?[...new Set(v.map(x=>(x as string).trim()))]:null;
type ProfileFields={name:string;headline:string;company:string;about:string;skills:string;experience:string;education:string};
const emptyProfile:ProfileFields={name:"",headline:"",company:"",about:"",skills:"",experience:"",education:""};
const profileNames=Object.keys(emptyProfile) as (keyof ProfileFields)[];
const headers={"Cache-Control":"private,no-store"};
const profileText=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";
function linkedinProfileUrl(v:unknown):string|null{
 if(typeof v!=="string"||!v.trim())return "";
 try{const u=new URL(v.trim());const host=u.hostname.toLowerCase();const parts=u.pathname.split("/").filter(Boolean);if(!(host==="linkedin.com"||host.endsWith(".linkedin.com"))||parts.length!==2||parts[0].toLowerCase()!=="in")return null;return "https://www.linkedin.com/in/"+parts[1];}catch{return null;}
}
async function readProfile(sql:any,userId:string){
 const rows:any=await sql`SELECT profile_summary,linkedin_profile_data,linkedin_profile_verified_at FROM app_users WHERE id=${userId} LIMIT 1`;
 const row=rows[0]||{};
 const data=row.linkedin_profile_data&&typeof row.linkedin_profile_data==="object"?row.linkedin_profile_data:{};
 const fields={...emptyProfile,...(data.fields&&typeof data.fields==="object"?data.fields:{})} as ProfileFields;
 const summary=typeof row.profile_summary==="string"&&row.profile_summary?row.profile_summary:fields.about||"";
 fields.about=summary;
 return {fields,fieldSources:data.fieldSources&&typeof data.fieldSources==="object"?data.fieldSources:{},savedAt:row.linkedin_profile_verified_at||data.confirmedAt||null,summary};
}
async function saveProfile(sql:any,userId:string,input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))return {error:"Provide the professional background fields to save.",status:400 as const};
 const supplied=input as Record<string,unknown>;
 const fields={} as ProfileFields;
 for(const name of profileNames)fields[name]=profileText(supplied[name],name==="about"?3000:2000);
 const existingRows:any=await sql`SELECT profile_summary,linkedin_profile_data FROM app_users WHERE id=${userId} LIMIT 1`;
 const existing=existingRows[0]||{};
 const existingData=existing.linkedin_profile_data&&typeof existing.linkedin_profile_data==="object"?existing.linkedin_profile_data:{};
 const existingFields=existingData.fields&&typeof existingData.fields==="object"?existingData.fields:{};
 const summary=fields.about||existing.profile_summary||existingFields.about||"";
 fields.about=summary;
 const fieldSources:Record<string,string>={};
 for(const name of profileNames)fieldSources[name]=fields[name]?"user_entered_or_edited":"not_found";
 const profileData={fields,fieldSources,confirmedAt:new Date().toISOString()};
 await sql`UPDATE app_users SET linkedin_profile_data=${JSON.stringify(profileData)}::jsonb,linkedin_profile_source=${"user_confirmed"},linkedin_profile_verified_at=now(),profile_summary=${summary},updated_at=now() WHERE id=${userId}`;
 return {fields,fieldSources,summary,savedAt:profileData.confirmedAt};
}
export async function GET(){
 const user=await currentUser({allowFrozen:true});if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
 try{
  const sql=db();
  const rows:any=await sql`SELECT countries,industries,keywords,job_titles,excluded_keywords,language,linkedin_profile_url,connection_target_count FROM user_preferences WHERE user_id=${user.userId}`;
  const x=rows[0] as any;if(!x)return NextResponse.json({error:"Preferences not found."},{status:404});
  const saved=await readProfile(sql,user.userId);
  return NextResponse.json({preferences:{linkedinProfileUrl:x.linkedin_profile_url||"",countries:x.countries||[],industries:x.industries||[],keywords:x.keywords||[],jobTitles:x.job_titles||[],excludedKeywords:x.excluded_keywords||[],language:x.language||"English",connectionTargetCount:Number(x.connection_target_count||50),profileSummary:saved.summary},profile:{fields:saved.fields,fieldSources:saved.fieldSources,savedAt:saved.savedAt}},{headers});
 }catch(e){console.error("Preferences read failed",e);return NextResponse.json({error:"Could not load preferences. Check database setup."},{status:503});}
}
export async function PUT(request:NextRequest){
 const user=await currentUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
 const body=await request.json().catch(()=>null);if(!body)return NextResponse.json({error:"Invalid JSON."},{status:400});
 const countries=clean(body.countries,30),industries=clean(body.industries,50),keywords=clean(body.keywords,100),jobTitles=clean(body.jobTitles,50),excluded=clean(body.excludedKeywords,100);
 if(!countries||!industries||!keywords||!jobTitles||!excluded)return NextResponse.json({error:"Check your preference lists. Remove blank lines and keep each list within its allowed size."},{status:400});
 const language=typeof body.language==="string"?body.language.trim().slice(0,60):"English";
 const connectionTargetCount=Number.isInteger(body.connectionTargetCount)&&body.connectionTargetCount>=1&&body.connectionTargetCount<=50?body.connectionTargetCount:50;
 const hasProfile=Object.prototype.hasOwnProperty.call(body,"profile");
 const hasProfileSummary=Object.prototype.hasOwnProperty.call(body,"profileSummary");
 const profileSummary=typeof body.profileSummary==="string"?body.profileSummary.trim().slice(0,4000):"";
 const profileUrl=linkedinProfileUrl(body.linkedinProfileUrl);
 if(profileUrl===null)return NextResponse.json({error:"Enter a valid LinkedIn personal profile URL, such as https://www.linkedin.com/in/your-profile/."},{status:400});
 if(hasProfile&&(!body.profile||typeof body.profile!=="object"||Array.isArray(body.profile)))return NextResponse.json({error:"profile must be an object containing the seven professional background fields."},{status:400});
 try{
  const sql=db();
  await sql`INSERT INTO user_preferences(user_id,countries,industries,keywords,job_titles,excluded_keywords,language,linkedin_profile_url,connection_target_count,updated_at) VALUES(${user.userId},${countries},${industries},${keywords},${jobTitles},${excluded},${language},${profileUrl},${connectionTargetCount},now()) ON CONFLICT(user_id) DO UPDATE SET countries=EXCLUDED.countries,industries=EXCLUDED.industries,keywords=EXCLUDED.keywords,job_titles=EXCLUDED.job_titles,excluded_keywords=EXCLUDED.excluded_keywords,language=EXCLUDED.language,linkedin_profile_url=EXCLUDED.linkedin_profile_url,connection_target_count=EXCLUDED.connection_target_count,updated_at=now()`;
  if(hasProfile){
   const saved=await saveProfile(sql,user.userId,body.profile);
   if("error" in saved)return NextResponse.json({error:saved.error},{status:saved.status});
   return NextResponse.json({ok:true,profile:{fields:saved.fields,fieldSources:saved.fieldSources,savedAt:saved.savedAt},profileSummary:saved.summary},{headers});
  }
  if(hasProfileSummary)await sql`UPDATE app_users SET profile_summary=${profileSummary},updated_at=now() WHERE id=${user.userId}`;
  return NextResponse.json({ok:true});
 }catch(e){console.error("Preferences save failed",e);return NextResponse.json({error:"Could not save preferences. Check database setup."},{status:503});}
}
export async function POST(request:NextRequest){
 const user=await currentUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
 const body=await request.json().catch(()=>null);const input=body?.fields;
 if(!input||typeof input!=="object"||Array.isArray(input))return NextResponse.json({error:"Provide the professional context fields to save."},{status:400});
 const fieldInput=input as Record<string,unknown>;
 if(!profileNames.some(name=>typeof fieldInput[name]==="string"&&String(fieldInput[name]).trim()))return NextResponse.json({error:"Enter at least one professional detail before saving."},{status:400});
 try{
  const saved=await saveProfile(db(),user.userId,input);
  if("error" in saved)return NextResponse.json({error:saved.error},{status:saved.status});
  return NextResponse.json({ok:true,fields:saved.fields,fieldSources:saved.fieldSources,summary:saved.summary,savedAt:saved.savedAt},{headers});
 }catch(error){console.error("Professional context save failed",error);return NextResponse.json({error:"Could not save your professional context."},{status:503});}
}
export async function PATCH(request:NextRequest){
 const user=await currentUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
 const body=await request.json().catch(()=>null);const count=body?.connectionTargetCount;
 if(!Number.isInteger(count)||count<1||count>50)return NextResponse.json({error:"Choose between 1 and 50 LinkedIn connections."},{status:400});
 try{const sql=db();await sql`INSERT INTO user_preferences(user_id,connection_target_count) VALUES(${user.userId},${count}) ON CONFLICT(user_id) DO UPDATE SET connection_target_count=EXCLUDED.connection_target_count,updated_at=now()`;return NextResponse.json({ok:true,connectionTargetCount:count},{headers:{"Cache-Control":"no-store"}});}
 catch(error){console.error("Connection target count update failed",error);return NextResponse.json({error:"Could not save the LinkedIn connection target."},{status:503});}
}
