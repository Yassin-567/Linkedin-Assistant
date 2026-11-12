import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, sealSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("linkedin_oauth_state")?.value;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  const fail = (message: string) => NextResponse.redirect(new URL("/?error=" + encodeURIComponent(message), request.url));

  if (!code || !returnedState || !savedState || returnedState !== savedState) return fail("LinkedIn authorization could not be verified. Please try again.");
  if (!redirectUri || !clientId || !clientSecret) return fail("LinkedIn OAuth is not configured on the server.");

  try {
    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      }),
      cache: "no-store"
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("LinkedIn token exchange failed:", tokenData.error ?? tokenResponse.status);
      return fail("LinkedIn token exchange failed. Check the app credentials and redirect URL.");
    }

    const profileResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      cache: "no-store"
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.sub) {
      console.error("LinkedIn userinfo failed:", profileResponse.status);
      return fail("LinkedIn profile could not be loaded.");
    }

    const maxAge = Math.min(Number(tokenData.expires_in) || 5184000, 5184000);
    const session = {
      accessToken: tokenData.access_token as string,
      personId: profile.sub as string,
      name: profile.name as string | undefined,
      email: profile.email as string | undefined,
      picture: profile.picture as string | undefined,
      expiresAt: Date.now() + maxAge * 1000
    };

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(COOKIE_NAME, sealSession(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge
    });
    response.cookies.delete("linkedin_oauth_state");
    return response;
  } catch (error) {
    console.error("LinkedIn callback error:", error);
    return fail("Something went wrong while connecting LinkedIn.");
  }
}
