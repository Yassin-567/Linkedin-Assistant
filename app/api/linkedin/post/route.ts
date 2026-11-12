import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, openSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.APP_URL;
  if (origin && expectedOrigin && new URL(origin).origin !== new URL(expectedOrigin).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  const session = value ? openSession(value) : null;
  if (!session) return NextResponse.json({ error: "Connect your LinkedIn account first." }, { status: 401 });

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text || text.length > 3000) {
    return NextResponse.json({ error: "Post text must be between 1 and 3000 characters." }, { status: 400 });
  }

  const version = process.env.LINKEDIN_VERSION || "202611";
  const postResponse = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": version,
      "X-Restli-Protocol-Version": "2.0.0"
    },
    body: JSON.stringify({
      author: `urn:li:person:${session.personId}`,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    }),
    cache: "no-store"
  });

  if (!postResponse.ok) {
    const detail = await postResponse.text();
    console.error("LinkedIn post failed:", postResponse.status, detail.slice(0, 500));
    return NextResponse.json({ error: "LinkedIn rejected the post. Check permissions and API version." }, { status: postResponse.status });
  }

  return NextResponse.json({ success: true, postId: postResponse.headers.get("x-restli-id") });
}
