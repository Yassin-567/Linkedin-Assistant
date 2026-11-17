import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
import { db } from "@/lib/db";
export const runtime = "nodejs";
const statuses = ["To research","Ready to contact","Contacted","Replied","Call booked","Client","Not a fit"];
const sources = ["Unknown","Google/Serper","LinkedIn","Manual","ChatGPT research","Referral","Other"];
const methods = ["Unknown","Find Leads","Manual entry","ChatGPT AI Token","ChatGPT temporary link","CSV import"];
const fail = (error:string,status:number) => NextResponse.json({error},{status,headers:{"Cache-Control":"no-store"}});
const clean = (v:unknown,n:number) => typeof v==="string" ? v.trim().slice(0,n) : "";
function profileUrl(v:unknown):string|null {
  if(typeof v!=="string"||!v.trim()) return null;
  try { const u=new URL(v.trim()); if(!/(^|\.)linkedin\.com$/i.test(u.hostname)||!u.pathname.toLowerCase().startsWith("/in/")) return null; return "https://www.linkedin.com"+u.pathname.replace(/\/$/,"").toLowerCase(); } catch { return null; }
}
const pick=(v:unknown,allowed:string[],fallback:string)=>typeof v==="string"&&allowed.includes(v)?v:fallback;
export async function GET() {
 const user=await currentUser(); if(!user)return fail("Sign in required.",401);
 try { const sql=db(); const leads=await sql\`SELECT id::text,name,company,linkedin_url AS url,status,follow_up AS "followUp",notes,connected,connected_on AS "connectedOn",discovery_source AS "discoverySource",saved_via AS "savedVia",created_at AS "createdAt",updated_at AS "updatedAt" FROM prospects WHERE user_id=\${user.userId} ORDER BY created_at DESC LIMIT 1000\`; return NextResponse.json({leads},{headers:{"Cache-Control":"private,no-store"}}); }
 catch(e){console.error("Prospect read failed",e);return fail("Could not load prospects.",503);}
}
export async function POST(request:NextRequest) {
 const user=await currentUser(); if(!user)return fail("Sign in required.",401);
 const b=await request.json().catch(()=>null); if(!b||typeof b!=="object")return fail("A prospect object is required.",400);
 const name=clean(b.name,200),company=clean(b.company,300),url=profileUrl(b.url);
 if(!name||!company)return fail("Contact name and company are required.",400);
 if(b.url&&!url)return fail("Use a valid LinkedIn personal profile URL, or leave it blank.",400);
 try {
  const sql=db(); const rows=await sql\`INSERT INTO prospects(user_id,name,company,linkedin_url,normalized_linkedin_url,status,follow_up,notes,connected,connected_on,discovery_source,saved_via)
   VALUES(\${user.userId},\${name},\${company},\${url},\${url},\${pick(b.status,statuses,"To research")},\${clean(b.followUp,30)},\${clean(b.notes,5000)},\${!!b.connected},\${clean(b.connectedOn,100)},\${pick(b.discoverySource,sources,"Manual")},\${pick(b.savedVia,methods,"Manual entry")})
   ON CONFLICT(user_id,normalized_linkedin_url) WHERE normalized_linkedin_url IS NOT NULL AND normalized_linkedin_url<>'' DO NOTHING
   RETURNING id::text,name,company,linkedin_url AS url,status,follow_up AS "followUp",notes,connected,connected_on AS "connectedOn",discovery_source AS "discoverySource",saved_via AS "savedVia",created_at AS "createdAt",updated_at AS "updatedAt"\`;
  if(!rows.length)return fail("This LinkedIn profile is already saved in your account.",409);
  return NextResponse.json({ok:true,lead:rows[0]},{status:201,headers:{"Cache-Control":"no-store"}});
 } catch(e){console.error("Prospect create failed",e);return fail("Could not save this prospect.",503);}
}
export async function PATCH(request:NextRequest) {
 const user=await currentUser(); if(!user)return fail("Sign in required.",401);
 const b=await request.json().catch(()=>null),id=typeof b?.id==="string"?b.id:"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return fail("A valid prospect ID is required.",400);
 const name=clean(b.name,200),company=clean(b.company,300); if(!name||!company)return fail("Contact name and company are required.",400);
 const hasUrl=Object.prototype.hasOwnProperty.call(b,"url"),url=hasUrl?profileUrl(b.url):null;
 if(hasUrl&&b.url&&!url)return fail("Use a valid LinkedIn personal profile URL, or leave it blank.",400);
 try {
  const sql=db();
  const rows=hasUrl
   ? await sql\`UPDATE prospects SET name=\${name},company=\${company},linkedin_url=\${url},normalized_linkedin_url=\${url},status=\${pick(b.status,statuses,"To research")},follow_up=\${clean(b.followUp,30)},notes=\${clean(b.notes,5000)},connected=\${!!b.connected},connected_on=\${clean(b.connectedOn,100)},discovery_source=\${pick(b.discoverySource,sources,"Unknown")},saved_via=\${pick(b.savedVia,methods,"Unknown")},updated_at=now() WHERE id=\${id}::uuid AND user_id=\${user.userId} RETURNING id::text,name,company,linkedin_url AS url,status,follow_up AS "followUp",notes,connected,connected_on AS "connectedOn",discovery_source AS "discoverySource",saved_via AS "savedVia"\`
   : await sql\`UPDATE prospects SET name=\${name},company=\${company},status=\${pick(b.status,statuses,"To research")},follow_up=\${clean(b.followUp,30)},notes=\${clean(b.notes,5000)},connected=\${!!b.connected},connected_on=\${clean(b.connectedOn,100)},discovery_source=\${pick(b.discoverySource,sources,"Unknown")},saved_via=\${pick(b.savedVia,methods,"Unknown")},updated_at=now() WHERE id=\${id}::uuid AND user_id=\${user.userId} RETURNING id::text,name,company,linkedin_url AS url,status,follow_up AS "followUp",notes,connected,connected_on AS "connectedOn",discovery_source AS "discoverySource",saved_via AS "savedVia"\`;
  if(!rows.length)return fail("Prospect not found in your account, or its LinkedIn URL is already used.",404);
  return NextResponse.json({ok:true,lead:rows[0]},{headers:{"Cache-Control":"no-store"}});
 } catch(e){console.error("Prospect update failed",e);return fail("Could not update this prospect.",503);}
}
export async function DELETE(request:NextRequest) {
 const user=await currentUser(); if(!user)return fail("Sign in required.",401);
 const id=request.nextUrl.searchParams.get("id")||"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return fail("A valid prospect ID is required.",400);
 try {const sql=db();const rows=await sql\`DELETE FROM prospects WHERE id=\${id}::uuid AND user_id=\${user.userId} RETURNING id\`;if(!rows.length)return fail("Prospect not found in your account.",404);return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});}
 catch(e){console.error("Prospect delete failed",e);return fail("Could not delete this prospect.",503);}
}