import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";
export const runtime="nodejs";
export async function GET() {
  const user=await currentUser();
  if(!user) return NextResponse.json({authenticated:false},{headers:{"Cache-Control":"no-store"}});
  return NextResponse.json({authenticated:true,connected:true,profile:{name:user.name,email:user.email,picture:user.picture}},{headers:{"Cache-Control":"private, no-store"}});
}
