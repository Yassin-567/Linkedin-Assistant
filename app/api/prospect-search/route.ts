import { NextRequest,NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
export const runtime="nodejs";
const countryCodes:Record<string,string>={"united kingdom":"gb","uk":"gb","united states":"us","usa":"us","canada":"ca","australia":"au","egypt":"eg","ireland":"ie","germany":"de","france":"fr","netherlands":"nl","new zealand":"nz","united arab emirates":"ae","uae":"ae","saudi arabia":"sa","india":"in","singapore":"sg","south africa":"za"};
const stopWords=new Set(["about","with","from","that","this","your","have","will","into","their","they","them","and","the","for","are","was","you","our","who","what","how","its","has","had","can","all","any","not","but","more","than","also","work","working","experience","experienced","professional","professionals","linkedin","profile"]);
function clean(v:unknown,max=120){return typeof v==="string"?v.trim().slice(0,max):"";}
function canonicalProfile(value:string){try{const u=new URL(value),host=u.hostname.toLowerCase(),parts=u.pathname.split("/").filter(Boolean);if(!(host==="linkedin.com"||host.endsWith(".linkedin.com"))||parts.length!==2||parts[0].toLowerCase()!=="in")return "";return "https://www.linkedin.com/in/"+parts[1].toLowerCase();}catch{return "";}}
function terms(value:string){return [...new Set((value.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g)||[]).filter(x=>!stopWords.has(x)))].slice(0,12);}
async function serper(key:string,q:string,gl:string|undefined,hl:string,num:number){
 const payload:any={q,hl,num};if(gl)payload.gl=gl;
 const response=await fetch("https://google.serper.dev/search",{method:"POST",headers:{"X-API-KEY":key,"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});
 if(!response.ok){const detail=await response.text().catch(()=>"");console.error("Serper search failed",response.status,detail.slice(0,400));throw new Error(response.status===429?"Search provider limit reached. Try again later.":`Search provider returned HTTP ${response.status}.`);}
 return response.json();
}
async function runSearch(userId:string,nicheInput:unknown,locationInput:unknown){
 const key=process.env.SERPER_API_KEY;if(!key)return NextResponse.json({error:"Search is not configured. Add SERPER_API_KEY to Vercel Environment Variables."},{status:503});
 try{
  const sql=db();const rows:any=await sql`SELECT industries,keywords,job_titles,countries,excluded_keywords,language,linkedin_profile_url,(SELECT profile_summary FROM app_users WHERE id=${userId}) AS profile_summary FROM user_preferences WHERE user_id=${userId}`;const pref=rows[0] as any;if(!pref)return NextResponse.json({error:"Set up your search preferences first."},{status:400});
  const niche=clean(nicheInput,200),location=clean(locationInput,160),industries=niche?[niche]:(Array.isArray(pref.industries)?pref.industries:[]),countries=location?[location]:(Array.isArray(pref.countries)?pref.countries:[]);
  if(!industries.length||!countries.length)return NextResponse.json({error:"Add at least one target industry and country in Search settings, or enter them for this search."},{status:400});
  const titles=Array.isArray(pref.job_titles)?pref.job_titles.slice(0,12):[],keywords=Array.isArray(pref.keywords)?pref.keywords.slice(0,20):[],excluded=Array.isArray(pref.excluded_keywords)?pref.excluded_keywords.map((x:string)=>String(x).toLowerCase()):[];
  const countryText=countries.map((x:string)=>`"${x}"`).join(" OR "),industryText=industries.map((x:string)=>`"${x}"`).join(" OR "),gl=countries.length===1?countryCodes[countries[0].toLowerCase()]:undefined;
  const language=clean(pref.language,60)||"English",hl=language.toLowerCase().startsWith("arab")?"ar":language.toLowerCase().startsWith("french")?"fr":language.toLowerCase().startsWith("german")?"de":"en";
  let profileContext=clean(pref.profile_summary,2500),profileContextSource=profileContext?"saved profile context":"none";
  const profileUrl=canonicalProfile(clean(pref.linkedin_profile_url,500));
  if(profileUrl){try{const slug=new URL(profileUrl).pathname.split("/").filter(Boolean).pop()||"",profileData=await serper(key,`site:linkedin.com/in/${slug}`,undefined,hl,5),organic=Array.isArray(profileData.organic)?profileData.organic:[],own=organic.find((x:any)=>canonicalProfile(String(x.link||""))===profileUrl);
    if(own){const indexed=[clean(own.title,300),clean(own.snippet,700)].filter(Boolean).join(". ");if(indexed){profileContext=[profileContext,indexed].filter(Boolean).join(". ").slice(0,3200);profileContextSource="public LinkedIn search snippet";}}
    else if(!profileContext)profileContextSource="profile URL saved; public profile details were not indexed";
   }catch(e){console.warn("Could not retrieve public profile context",e);if(!profileContext)profileContextSource="profile URL saved; public profile details unavailable";}}
  const profileTerms=terms(profileContext),query=[`(${industryText})`,`(${countryText})`,titles.join(" "),keywords.join(" "),profileTerms.join(" "),"site:linkedin.com/in"].filter(Boolean).join(" ").slice(0,1800);
  const data=await serper(key,query,gl,hl,30),organic=Array.isArray(data.organic)?data.organic:[],seen=new Set<string>();
  const results=organic.map((x:any)=>{const title=clean(x.title,300)||"LinkedIn profile",url=clean(x.link,1000),description=clean(x.snippet,1000),hay=(title+" "+description).toLowerCase(),reasons:string[]=[];
   if(titles.some((v:string)=>v&&hay.includes(v.toLowerCase())))reasons.push("target role");
   if(industries.some((v:string)=>v&&hay.includes(v.toLowerCase())))reasons.push("target industry");
   if(keywords.some((v:string)=>v&&hay.includes(v.toLowerCase())))reasons.push("your keywords");
   if(profileTerms.some((v:string)=>hay.includes(v)))reasons.push("profile interests");
   let score=0;if(reasons.includes("target role"))score+=35;if(reasons.includes("target industry"))score+=30;if(reasons.includes("your keywords"))score+=20;if(reasons.includes("profile interests"))score+=15;
   return {title,url,description,matchScore:score,matchReasons:reasons};
  }).filter((x:any)=>{const normalized=canonicalProfile(x.url);if(!normalized||seen.has(normalized))return false;seen.add(normalized);const hay=(x.title+" "+x.description).toLowerCase();return !excluded.some((word:string)=>word&&hay.includes(word));}).sort((a:any,b:any)=>b.matchScore-a.matchScore);
  return NextResponse.json({query,location:countries.join(", "),industries,results,source:"Publicly indexed LinkedIn personal profile pages via Google search",profileContextSource,count:results.length},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("Prospect search failed",e);const message=e instanceof Error?e.message:"Could not complete search.";return NextResponse.json({error:message.includes("Search provider")?message:"Could not complete search. Check database and search provider configuration."},{status:503});}
}
export async function GET(request:NextRequest){const user=await currentUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401});const p=request.nextUrl.searchParams;return runSearch(user.userId,p.get("niche"),p.get("location"));}
export async function POST(request:NextRequest){const user=await currentUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401});const body=await request.json().catch(()=>({}));return runSearch(user.userId,body.niche,body.location);}
