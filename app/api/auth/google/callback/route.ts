import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { APP_COOKIE_NAME, sealAppSession } from "@/lib/app-session";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const jar = await cookies();
  const expectedState = jar.get("google_oauth_state")?.value;
  const fail = (message:string) => {
    const response = NextResponse.redirect(new URL("/login?error="+encodeURIComponent(message), request.url));
    response.cookies.delete("google_oauth_state");
    return response;
  };
  if (!code || !state || !expectedState || state !== expectedState) return fail("Google sign-in could not be verified. Please try again.");
  const clientId=process.env.GOOGLE_CLIENT_ID, clientSecret=process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri=process.env.GOOGLE_REDIRECT_URI || new URL("/api/auth/google/callback",request.url).toString();
  if(!clientId||!clientSecret) return fail("Google sign-in is not configured.");
  try {
    const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:"authorization_code"}),cache:"no-store"});
    const token=await tokenResponse.json();
    if(!tokenResponse.ok||!token.access_token) return fail("Google sign-in failed during token exchange.");
    const profileResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:"Bearer "+token.access_token},cache:"no-store"});
    const profile=await profileResponse.json();
    if(!profileResponse.ok||!profile.sub||!profile.email||profile.email_verified!==true) return fail("Google did not return a verified email address.");
    const sql=db();
    const rows:any=await sql`INSERT INTO app_users (google_sub,email,name,picture) VALUES (${profile.sub},${profile.email.toLowerCase()},${profile.name||""},${profile.picture||null}) ON CONFLICT (google_sub) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name,picture=EXCLUDED.picture,updated_at=now() RETURNING id,email,name,picture`;
    const user=rows[0] as {id:string;email:string;name:string;picture?:string};
    await sql`INSERT INTO user_preferences (user_id) VALUES (${user.id}) ON CONFLICT (user_id) DO NOTHING`;
    const response=NextResponse.redirect(new URL("/",request.url));
    response.cookies.set(APP_COOKIE_NAME,sealAppSession({userId:user.id,email:user.email,name:user.name,picture:user.picture||undefined,expiresAt:Date.now()+7*24*60*60*1000}),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:7*24*60*60});
    response.cookies.delete("google_oauth_state");
    return response;
  } catch(error) { console.error("Google OAuth callback failed",error); return fail("Could not complete sign-in. Please try again."); }
}
