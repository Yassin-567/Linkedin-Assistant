import { NextRequest,NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
export const runtime="nodejs";
const countryCodes:Record<string,string>={"united kingdom":"gb","uk":"gb","united states":"us","usa":"us","canada":"ca","australia":"au","egypt":"eg","ireland":"ie","germany":"de","france":"fr","netherlands":"nl","new zealand":"nz","united arab emirates":"ae","uae":"ae","saudi arabia":"sa","india":"in","singapore":"sg","south africa":"za"};
async function runSearch(userId:string,nicheInput:unknown,locationInput:unknown){
 const key=process.env.SERPER_API_KEY;if(!key)return NextResponse.json({error:"Search is not configured. Add SERPER_API_KEY to Vercel Environment Variables."},{status:503});
 try{
  const sql=db();const rows:any=await sql`SELECT industries,keywords,job_titles,countries,excluded_keywords,language FROM user_preferences WHERE user_id=${userId}`;
  const pref=rows[0] as any;if(!pref)return NextResponse.json({error:"Set up your search preferences first."},{status:400});
  const niche=String(nicheInput||pref.industries?.[0]||"").trim().slice(0,100);
  const location=String(locationInput||pref.countries?.[0]||"").trim().slice(0,80);
  if(!niche||!location)return NextResponse.json({error:"Add at least one target industry and country in Settings."},{status:400});
  const titles=Array.isArray(pref.job_titles)?pref.job_titles.slice(0,8).join(" "):"owner director";
  const keywords=Array.isArray(pref.keywords)?pref.keywords.slice(0,8).join(" "):"";
  const query=[niche,location,titles,keywords,"LinkedIn"].filter(Boolean).join(" ");
  const gl=countryCodes[location.toLowerCase()]||"us";
  const response=await fetch("https://google.serper.dev/search",{method:"POST",headers:{"X-API-KEY":key,"Content-Type":"application/json"},body:JSON.stringify({q:query,gl,hl:(pref.language||"en").slice(0,2).toLowerCase(),num:20}),cache:"no-store"});
  if(!response.ok){const detail=await response.text().catch(()=>"");console.error("Serper search failed",response.status,detail.slice(0,400));return NextResponse.json({error:response.status===429?"Search provider limit reached. Try again later.":`Search provider returned HTTP ${response.status}.`},{status:502});}
  const data=await response.json(),organic=Array.isArray(data.organic)?data.organic:[];
  const excluded=Array.isArray(pref.excluded_keywords)?pref.excluded_keywords.map((x:string)=>x.toLowerCase()):[];
  const seen=new Set<string>();
  const results=organic.map((x:any)=>({title:x.title||"LinkedIn profile",url:x.link||"",description:x.snippet||""})).filter((x:any)=>{
   try{const u=new URL(x.url),host=u.hostname.toLowerCase();if(!["http:","https:"].includes(u.protocol)||!(host==="linkedin.com"||host.endsWith(".linkedin.com"))||!u.pathname.toLowerCase().startsWith("/in/"))return false;
    const canonical=(host+u.pathname).replace(/\/$/,"").toLowerCase();if(seen.has(canonical))return false;seen.add(canonical);
    const hay=(x.title+" "+x.description).toLowerCase();return !excluded.some((word:string)=>word&&hay.includes(word));
   }catch{return false;}
  });
  return NextResponse.json({query,location,industry:niche,results,source:"Publicly indexed LinkedIn personal profile pages via Google search",count:results.length},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("Prospect search failed",e);return NextResponse.json({error:"Could not complete search. Check database and search provider configuration."},{status:503});}
}
export async function GET(request:NextRequest){const user=await currentUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401});const p=request.nextUrl.searchParams;return runSearch(user.userId,p.get("niche"),p.get("location"));}
export async function POST(request:NextRequest){const user=await currentUser();if(!user)return NextResponse.json({error:"Sign in required."},{status:401});const body=await request.json().catch(()=>({}));return runSearch(user.userId,body.niche,body.location);}
