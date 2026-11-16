import { put } from "@vercel/blob";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, openSession } from "@/lib/session";
export const runtime="nodejs";
export async function POST(request:NextRequest){
 const jar=await cookies();const value=jar.get(COOKIE_NAME)?.value;const session=value?openSession(value):null;
 if(!session)return NextResponse.json({error:"Connect LinkedIn before creating an assistant save token."},{status:401});
 const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
 if(!bypass)return NextResponse.json({error:"The temporary bridge is not configured yet. Contact the app administrator."},{status:503});
 const token=randomBytes(32).toString("base64url");const tokenHash=createHash("sha256").update(token).digest("hex");
 const expiresAt=Date.now()+10*60*1000;
 try{
  await put("assistant-tokens/"+tokenHash+".json",JSON.stringify({personId:session.personId,expiresAt,usedAt:null}),{access:"private",addRandomSuffix:false,allowOverwrite:false,contentType:"application/json"});
  const saveUrl=new URL("/api/assistant-save",request.url);
  saveUrl.searchParams.set("token",token);
  saveUrl.searchParams.set("x-vercel-protection-bypass",bypass);
  saveUrl.searchParams.set("x-vercel-set-bypass-cookie","true");
  return NextResponse.json({token,expiresAt,saveUrl:saveUrl.toString()},{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.error("Assistant token creation failed:",error);return NextResponse.json({error:"Could not create a temporary save token."},{status:500});}
}