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
  const grant=JSON.parse(await new Response(stored.stream).text()) as {personId?:string;expiresAt?:number;usedAt?:number|null;usesRemaining?:number};
  if(!grant.personId||!grant.expiresAt||grant.expiresAt<Date.now()||(typeof grant.usesRemaining==="number"?grant.usesRemaining<=0:!!grant.usedAt))return NextResponse.json({error:"Token expired or its save allowance has been used. Generate a new one in the app."},{status:401,headers:{"Cache-Control":"no-store"}});
  const updatedGrant=typeof grant.usesRemaining==="number"?{...grant,usesRemaining:grant.usesRemaining-1,usedAt:grant.usesRemaining<=1?Date.now():null}:{...grant,usedAt:Date.now()};
  await put(tokenPath,JSON.stringify(updatedGrant),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json"});
  const path="prospects/"+encodeURIComponent(grant.personId)+".json";const leads=await read(path);
  if(leads.some(x=>canonical(x.url)===url)){
   return NextResponse.json({ok:true,duplicate:true,message:"This LinkedIn profile is already saved."},{headers:{"Cache-Control":"no-store"}});
  }
  if(leads.length>=1000)return NextResponse.json({error:"Your prospect list has reached its 1,000-record limit."},{status:409,headers:{"Cache-Control":"no-store"}});
  const lead:Lead={id:crypto.randomUUID(),name,company,url,status:"To research",followUp:"",notes:"Added through the temporary ChatGPT save link.",connected:false};
  await put(path,JSON.stringify({leads:[lead,...leads],updatedAt:new Date().toISOString()}),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json"});
  return NextResponse.json({ok:true,saved:true,name,company,url},{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.error("Assistant prospect save failed:",error);return NextResponse.json({error:"Could not save this prospect."},{status:500,headers:{"Cache-Control":"no-store"}});}
}

type BatchInput={name?:unknown;company?:unknown;linkedin?:unknown;url?:unknown};
export async function POST(request:NextRequest){
 const p=request.nextUrl.searchParams;const token=p.get("token")||"";
 if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))return NextResponse.json({error:"A valid temporary token is required."},{status:401,headers:{"Cache-Control":"no-store"}});
 let body:{leads?:BatchInput[]};
 try{body=await request.json() as {leads?:BatchInput[]};}catch{return NextResponse.json({error:"Request body must be valid JSON."},{status:400,headers:{"Cache-Control":"no-store"}});}
 if(!Array.isArray(body.leads)||body.leads.length===0)return NextResponse.json({error:"Provide a non-empty leads array."},{status:400,headers:{"Cache-Control":"no-store"}});
 if(body.leads.length>50)return NextResponse.json({error:"A batch can contain up to 50 leads."},{status:400,headers:{"Cache-Control":"no-store"}});
 const prepared=body.leads.map((item,index)=>{
  const name=typeof item?.name==="string"?item.name.trim():"";
  const company=typeof item?.company==="string"?item.company.trim():"";
  const url=canonical(typeof item?.linkedin==="string"?item.linkedin:typeof item?.url==="string"?item.url:"");
  const error=!name||!company||!url||name.length>200||company.length>300?"Provide a name, company and valid LinkedIn personal profile URL.":null;
  return {index,name,company,url,error};
 });
 if(!prepared.some(x=>!x.error))return NextResponse.json({error:"No valid leads were provided.",results:prepared.map(x=>({index:x.index,status:"invalid",error:x.error}))},{status:400,headers:{"Cache-Control":"no-store"}});
 const hash=createHash("sha256").update(token).digest("hex");const tokenPath="assistant-tokens/"+hash+".json";
 try{
  const stored=await get(tokenPath,{access:"private",useCache:false});
  if(!stored||stored.statusCode!==200||!stored.stream)return NextResponse.json({error:"Token not found or already used."},{status:401,headers:{"Cache-Control":"no-store"}});
  const grant=JSON.parse(await new Response(stored.stream).text()) as {personId?:string;expiresAt?:number;usedAt?:number|null;usesRemaining?:number};
  if(!grant.personId||!grant.expiresAt||grant.expiresAt<Date.now()||(typeof grant.usesRemaining==="number"?grant.usesRemaining<=0:!!grant.usedAt))return NextResponse.json({error:"Token expired or its save allowance has been used. Generate a new one in the app."},{status:401,headers:{"Cache-Control":"no-store"}});
  await put(tokenPath,JSON.stringify({...grant,usesRemaining:0,usedAt:Date.now()}),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json"});
  const path="prospects/"+encodeURIComponent(grant.personId)+".json";const existing=await read(path);const seen=new Set(existing.map(x=>canonical(x.url)).filter(Boolean));
  const additions:Lead[]=[];const results=prepared.map(item=>{
   if(item.error)return {index:item.index,status:"invalid",name:item.name,error:item.error};
   if(seen.has(item.url))return {index:item.index,status:"duplicate",name:item.name,company:item.company,url:item.url};
   if(existing.length+additions.length>=1000)return {index:item.index,status:"limit_reached",name:item.name,company:item.company,url:item.url};
   seen.add(item.url);
   additions.push({id:crypto.randomUUID(),name:item.name,company:item.company,url:item.url,status:"To research",followUp:"",notes:"Added through the temporary ChatGPT bulk save link.",connected:false});
   return {index:item.index,status:"saved",name:item.name,company:item.company,url:item.url};
  });
  if(additions.length)await put(path,JSON.stringify({leads:[...additions,...existing],updatedAt:new Date().toISOString()}),{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json"});
  return NextResponse.json({ok:true,total:prepared.length,saved:additions.length,duplicates:results.filter(x=>x.status==="duplicate").length,invalid:results.filter(x=>x.status==="invalid").length,limitReached:results.filter(x=>x.status==="limit_reached").length,results},{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.error("Assistant bulk prospect save failed:",error);return NextResponse.json({error:"Could not save this batch."},{status:500,headers:{"Cache-Control":"no-store"}});}
}
