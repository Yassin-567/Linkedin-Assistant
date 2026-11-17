import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const id = process.env.GOOGLE_CLIENT_ID;
  const redirect = process.env.GOOGLE_REDIRECT_URI || new URL("/api/auth/google/callback", request.url).toString();
  if (!id || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.json({ error: "Google sign-in is not configured yet." }, { status: 503 });
  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id:id, redirect_uri:redirect, response_type:"code", scope:"openid email profile", state, prompt:"select_account" }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("google_oauth_state", state, { httpOnly:true, secure:process.env.NODE_ENV==="production", sameSite:"lax", path:"/", maxAge:600 });
  return response;
}
