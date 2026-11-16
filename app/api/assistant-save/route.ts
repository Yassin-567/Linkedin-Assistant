import { get, put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
export const runtime="nodejs";
type Lead={id:string;name:string;company:string;url:string;status:string;followUp:string;notes:string;connected?:boolean;connectedOn?:string};
function canonical(value:string){try{const u=new URL(value);if(!/(^|\.)linkedin\.com$/i.test(u.hostname)||!u.pathname.toLowerCase().startsWith("/in/"))return "";return "https://www.linkedin.com"+u.pathname.replace(/\/$/,"").toLowerCase();}catch{return "";}}
async function read(path:string):Promise<Lead[]>{try{const file=await get(path,{access:"private",useCache:false});if(!file||file.statusCode!==200||!file.stream)return [];const data=JSON.parse(await new Response(file.stream).text());return Array.isArray(data.leads)?data.leads:[];}catch(e){if(e instanceof Error&&/not found|does not exist/i.test(e.message))return [];throw e;}}
export async function GET(request:NextRequest){
 const p=request.nextUrl.searchParams;const token=p.get("token")||"";const name=(p.get("name")||"").trim();const company=(p.get("company")||"").trim();const url=canonical(p.get("linkedin")||p.get("url")||"");
 if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))return NextResponse.json({error:"A valid temporary token is required."},{status:401,headers:{"Cache-Control":"no-store"}});
 if(!name||!company||!url||name.length>200||company.length>300)return NextResponse.json({error:"Provide a name, company and valid LinkedIn personal profile URL."},{status:400,headers:{"Cache-Control":"no-store"}});
 const hash=createHash("sha256").update(token).digest("hex");const tokenPath="assistant-tokens/"+hash+".json";
 try{
  const stored=await get(tokenPath,{access:"private",useCache:false});if(!stored||stored.statusCode!==200||!stored.stream)return NextResponse.json({error:"Token not found or already used."},{status:401,headers:{"Cache-Control":"no-store"}});
  const grant=JSON.parse(await new Response(stored.stream).text()) as {personId?:string;expiresAt?:number;usedAt?:number|null};
  if(!grant.personId||!grant.expiresAt||grant.expiresAt<Date.now()||grant.usedAt)return NextResponse.json({error:"Token expired or already used. Generate a new one in the app."},{status:401,headers:{"Cache-Control":"no-store"}});
  const path="prospects/"+encodeURIComponent(grant.personId)+".json";const leads=await read(path);
  if(leads.some(x=>canonical(x.url)===url)){
   await put(tokenPath,JSON.stringify({...grant,usedAt:Date.now()}),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json"});
   return NextResponse.json({ok:true,duplicate:true,message:"This LinkedIn profile is already saved."},{headers:{"Cache-Control":"no-store"}});
  }
  if(leads.length>=1000)return NextResponse.json({error:"Your prospect list has reached its 1,000-record limit."},{status:409,headers:{"Cache-Control":"no-store"}});
  const lead:Lead={id:crypto.randomUUID(),name,company,url,status:"To research",followUp:"",notes:"Added through the temporary ChatGPT save link.",connected:false};
  await put(path,JSON.stringify({leads:[lead,...leads],updatedAt:new Date().toISOString()}),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json"});
  await put(tokenPath,JSON.stringify({...grant,usedAt:Date.now()}),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json"});
  return NextResponse.json({ok:true,saved:true,name,company,url},{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.error("Assistant prospect save failed:",error);return NextResponse.json({error:"Could not save this prospect."},{status:500,headers:{"Cache-Control":"no-store"}});}
}